import pool from '../database.js';

// Search and list doctors
export const getDoctors = async (req, res) => {
    try {
        const { search, specialty, wilaya, commune } = req.query;
        let query = `
            SELECT d.id, d.first_name, d.last_name, s.name as specialty, d.phone, d.bio, d.is_reservation_online, d.img_url,
                   c.name as cabinet_name, c.wilaya, c.commune, c.address as cabinet_address, c.id as cabinet_id
            FROM doctors d
            LEFT JOIN cabinets c ON d.id = c.doctor_id
            LEFT JOIN speciality s ON d.specialty = s.id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (d.first_name LIKE ? OR d.last_name LIKE ? OR s.name LIKE ? OR c.name LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (specialty) {
            // Check if specialty is an ID or name
            if (!isNaN(specialty)) {
                query += ` AND d.specialty = ?`;
            } else {
                query += ` AND s.name = ?`;
            }
            params.push(specialty);
        }
        if (wilaya) {
            query += ` AND c.wilaya = ?`;
            params.push(wilaya);
        }
        if (commune) {
            query += ` AND c.commune = ?`;
            params.push(commune);
        }

        const [doctors] = await pool.query(query, params);
        res.status(200).json({ success: true, data: doctors });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur lors de la recherche' });
    }
};

// Detailed doctor info + schedule
export const getDoctorDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const [doctors] = await pool.query(
            `SELECT d.id, d.email, d.first_name, d.last_name, s.name as specialty, d.phone, d.bio, d.is_reservation_online, d.img_url,
                    c.name as cabinet_name, c.wilaya, c.commune, c.address as cabinet_address, c.schedule, c.id as cabinet_id
             FROM doctors d
             LEFT JOIN cabinets c ON d.id = c.doctor_id
             LEFT JOIN speciality s ON d.specialty = s.id
             WHERE d.id = ?`,
            [id]
        );

        if (doctors.length === 0) return res.status(404).json({ success: false, message: 'Introuvable' });

        const doc = doctors[0];
        doc.schedule = typeof doc.schedule === 'string' ? JSON.parse(doc.schedule) : doc.schedule;

        res.status(200).json({ success: true, data: doc });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

// Patient books an appointment
export const bookAppointment = async (req, res) => {
    try {
        const { doctor_id, cabinet_id, appointment_date, appointment_time, visit_type, notes } = req.body;
        const patient_user_id = req.patient.id;

        if (!doctor_id || !cabinet_id || !appointment_date) {
            return res.status(400).json({ success: false, message: 'Données manquantes: doctor_id, cabinet_id et appointment_date sont obligatoires' });
        }

        // Fetch doctor's settings
        const [doctorRows] = await pool.query('SELECT consultation_duration, is_reservation_online FROM doctors WHERE id = ?', [doctor_id]);

        if (doctorRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Médecin introuvable' });
        }

        if (!doctorRows[0].is_reservation_online) {
            return res.status(403).json({ success: false, message: 'Ce médecin n\'accepte pas les réservations en ligne pour le moment' });
        }

        const duration_minutes = doctorRows[0].consultation_duration || 30;

        // We also need a 'patient_id' record in the doctor's private patient table if it doesn't exist?
        // Let's check if there's already a linked private patient record.
        let [privateRecord] = await pool.query(
            'SELECT id FROM patients WHERE doctor_id = ? AND (email = ? OR phone = ?)',
            [doctor_id, req.patient.email, req.patient.phone]
        );

        let final_patient_id;
        if (privateRecord.length === 0) {
            // Create a shadow record in the doctor's private CRM
            const [user] = await pool.query('SELECT * FROM patient_users WHERE id = ?', [patient_user_id]);
            const u = user[0];
            if (!u) {
                return res.status(404).json({ success: false, message: 'Compte patient introuvable' });
            }
            const [insertResult] = await pool.query(
                `INSERT INTO patients (doctor_id, first_name, last_name, email, phone, address, birth_date, gender)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [doctor_id, u.first_name, u.last_name, u.email, u.phone, u.address, u.birth_date, u.gender]
            );
            final_patient_id = insertResult.insertId;
        } else {
            final_patient_id = privateRecord[0].id;
        }

        // --- ANTI-DOUBLE BOOKING CHECK ---
        const [conflict] = await pool.query(
            `SELECT id FROM appointments 
             WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? 
             AND status NOT IN ('annule', 'absent')`,
            [doctor_id, appointment_date, appointment_time]
        );

        if (conflict.length > 0) {
            return res.status(409).json({ 
                success: false, 
                message: 'Ce créneau est déjà réservé par un autre patient. Veuillez en choisir un autre.' 
            });
        }
        // ---------------------------------

        const [result] = await pool.query(
            `INSERT INTO appointments (doctor_id, patient_id, cabinet_id, appointment_date, appointment_time, duration_minutes, status, visit_type, notes, patient_user_id)
             VALUES (?, ?, ?, ?, ?, ?, 'nouveau', ?, ?, ?)`,
            [doctor_id, final_patient_id, cabinet_id, appointment_date, appointment_time || null, duration_minutes, visit_type || 'consultation', notes || '', patient_user_id]
        );

        res.status(201).json({ success: true, message: 'Rendez-vous réservé', id: result.insertId });
    } catch (error) {
        console.error('Error in bookAppointment:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la réservation',
            error: error.message // For debugging
        });
    }
};

// View History
export const getMyAppointments = async (req, res) => {
    try {
        const [appointments] = await pool.query(
            `SELECT a.id, a.doctor_id, a.patient_id, a.cabinet_id, a.status, a.visit_type, a.notes, a.created_at,
                    DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as appointment_date,
                    DATE_FORMAT(a.appointment_time, '%H:%i') as appointment_time,
                    d.first_name as doc_first, d.last_name as doc_last, s.name as doc_specialty,
                    c.name as cabinet_name, c.wilaya, c.commune, c.address as cabinet_address
             FROM appointments a
             JOIN doctors d ON a.doctor_id = d.id
             LEFT JOIN speciality s ON d.specialty = s.id
             LEFT JOIN cabinets c ON a.cabinet_id = c.id
             WHERE a.patient_user_id = ?
             ORDER BY a.appointment_date DESC, a.appointment_time ASC`,
            [req.patient.id]
        );
        res.status(200).json({ success: true, data: appointments });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur history' });
    }
};

export const getMyPrescriptions = async (req, res) => {
    try {
        const [prescriptions] = await pool.query(
            `SELECT 
                p.id,
                p.cloudinary_url,
                p.created_at,
                d.first_name as doctor_first_name,
                d.last_name as doctor_last_name,
                s.name as doctor_specialty
             FROM prescriptions p
             JOIN doctors d ON p.doctor_id = d.id
             LEFT JOIN speciality s ON d.specialty = s.id
             WHERE p.patient_user_id = ?
             ORDER BY p.created_at DESC`,
            [req.patient.id]
        );
        res.status(200).json({ success: true, data: prescriptions });
    } catch (error) {
        console.error('Error fetching prescriptions:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la récupération des ordonnances' });
    }
};

// Get current patient profile
export const getMyProfile = async (req, res) => {
    try {
        const [users] = await pool.query(
            `SELECT id, email, first_name, last_name, phone, address, birth_date, gender, bio, wilaya, commune
             FROM patient_users WHERE id = ?`,
            [req.patient.id]
        );
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'Profil introuvable' });
        }
        const u = users[0];
        res.status(200).json({
            success: true,
            data: {
                id: u.id,
                email: u.email,
                firstName: u.first_name,
                lastName: u.last_name,
                phone: u.phone,
                address: u.address,
                birthDate: u.birth_date,
                gender: u.gender,
                bio: u.bio,
                wilaya: u.wilaya,
                commune: u.commune
            }
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

// Update current patient profile
export const updateMyProfile = async (req, res) => {
    try {
        const { firstName, lastName, phone, address, birthDate, gender, bio, wilaya, commune } = req.body;

        // Build dynamic update query with only provided fields
        const fields = [];
        const values = [];

        if (firstName !== undefined) { fields.push('first_name = ?'); values.push(firstName.trim()); }
        if (lastName !== undefined) { fields.push('last_name = ?'); values.push(lastName.trim()); }
        if (phone !== undefined) { fields.push('phone = ?'); values.push(phone.trim()); }
        if (address !== undefined) { fields.push('address = ?'); values.push(address); }
        if (birthDate !== undefined) { fields.push('birth_date = ?'); values.push(birthDate); }
        if (gender !== undefined) { fields.push('gender = ?'); values.push(gender); }
        if (bio !== undefined) { fields.push('bio = ?'); values.push(bio); }
        if (wilaya !== undefined) { fields.push('wilaya = ?'); values.push(wilaya); }
        if (commune !== undefined) { fields.push('commune = ?'); values.push(commune); }

        if (fields.length === 0) {
            return res.status(400).json({ success: false, message: 'Aucune donnée à mettre à jour' });
        }

        values.push(req.patient.id);
        await pool.query(
            `UPDATE patient_users SET ${fields.join(', ')} WHERE id = ?`,
            values
        );

        // Return fresh data
        const [updated] = await pool.query(
            `SELECT id, email, first_name, last_name, phone, address, birth_date, gender, bio, wilaya, commune
             FROM patient_users WHERE id = ?`,
            [req.patient.id]
        );
        const u = updated[0];

        // SYNC LOGIC: Propagate changes to the doctor's shadow 'patients' table
        // This ensures the doctor's Web Dashboard reflects the new contact info
        try {
            const patientFields = [];
            const patientValues = [];
            if (firstName !== undefined) { patientFields.push('first_name = ?'); patientValues.push(firstName.trim()); }
            if (lastName !== undefined) { patientFields.push('last_name = ?'); patientValues.push(lastName.trim()); }
            if (address !== undefined) { patientFields.push('address = ?'); patientValues.push(address); }
            if (birthDate !== undefined) { patientFields.push('birth_date = ?'); patientValues.push(birthDate); }
            if (gender !== undefined) { patientFields.push('gender = ?'); patientValues.push(gender); }

            if (patientFields.length > 0) {
                patientValues.push(req.patient.phone); // Link via the OLD phone number that the doctor has
                await pool.query(
                    `UPDATE patients SET ${patientFields.join(', ')} WHERE phone = ?`,
                    patientValues
                );
            }

            // If phone itself changed, we need a special update to avoid breaking links
            if (phone !== undefined && phone.trim() !== req.patient.phone) {
                await pool.query('UPDATE patients SET phone = ? WHERE phone = ?', [phone.trim(), req.patient.phone]);
            }
        } catch (syncError) {
            console.error('Non-critical sync error:', syncError);
            // We don't fail the whole request if the doctor sync fails, 
            // but we log it for the senior developer to investigate.
        }

        res.status(200).json({
            success: true,
            message: 'Profil mis à jour',
            data: {
                id: u.id,
                email: u.email,
                firstName: u.first_name,
                lastName: u.last_name,
                phone: u.phone,
                address: u.address,
                birthDate: u.birth_date,
                gender: u.gender,
                bio: u.bio,
                wilaya: u.wilaya,
                commune: u.commune
            }
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour du profil' });
    }
};

// Cancel an appointment (change status to 'annule')
export const cancelAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const patient_user_id = req.patient.id;

        console.log(`Attempting to cancel appointment ${id} for patient ${patient_user_id}`);

        // Check if appointment belongs to this patient
        const [appointments] = await pool.query(
            "SELECT id, status FROM appointments WHERE id = ? AND patient_user_id = ?",
            [id, patient_user_id]
        );

        if (appointments.length === 0) {
            return res.status(404).json({ success: false, message: 'Rendez-vous introuvable ou non autorisé' });
        }

        if (appointments[0].status === 'annule') {
            return res.status(400).json({ success: false, message: 'Rendez-vous déjà annulé' });
        }

        // Update status to 'annule'
        const [result] = await pool.query(
            "UPDATE appointments SET status = 'annule' WHERE id = ? AND patient_user_id = ?",
            [id, patient_user_id]
        );

        if (result.affectedRows === 0) {
            return res.status(500).json({ success: false, message: 'Échec de la mise à jour' });
        }

        res.status(200).json({ success: true, message: 'Rendez-vous annulé' });
    } catch (error) {
        console.error('Error cancelling appointment:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur lors de l\'annulation' });
    }
};


// Get available slots for a specific doctor and date
export const getDoctorAvailableSlots = async (req, res) => {
    try {
        const { doctorId, date } = req.query; // Format YYYY-MM-DD

        if (!doctorId || !date) {
            return res.status(400).json({ success: false, message: 'Doctor ID et date sont requis' });
        }

        // Robust date parsing to avoid timezone shifts
        const [year, month, day] = date.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayOfWeek = dayNames[dateObj.getDay()];

        // 0. Check if doctor allows online reservations
        const [doctorRows] = await pool.query('SELECT is_reservation_online FROM doctors WHERE id = ?', [doctorId]);
        if (doctorRows.length === 0 || !doctorRows[0].is_reservation_online) {
            return res.status(200).json({ success: true, data: [] });
        }

        // 1. Get availabilities for this day
        const [availabilities] = await pool.query(
            'SELECT start_time, end_time, slot_duration FROM availabilities WHERE doctor_id = ? AND day_of_week = ?',
            [doctorId, dayOfWeek]
        );

        if (availabilities.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        // 2. Generate all possible time slots
        let allSlots = [];
        availabilities.forEach(avail => {
            const [startH, startM] = avail.start_time.split(':').map(Number);
            const [endH, endM] = avail.end_time.split(':').map(Number);

            const duration = avail.slot_duration || 30;

            if (duration <= 0) return;

            const endTotal = endH * 60 + endM;
            let currentTotal = startH * 60 + startM;

            while (currentTotal + duration <= endTotal) {
                const h = Math.floor(currentTotal / 60);
                const m = currentTotal % 60;
                allSlots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
                currentTotal += duration;
            }
        });

        // 3. Get currently booked appointments for that date with their durations
        const [bookedAppointments] = await pool.query(
            `SELECT 
                DATE_FORMAT(appointment_time, '%H:%i') as start_time,
                duration_minutes
             FROM appointments 
             WHERE doctor_id = ? AND appointment_date = ? 
             AND status NOT IN ('annule', 'absent') AND appointment_time IS NOT NULL`,
            [doctorId, date]
        );

        // 4. Filter out past slots (if date is today) and overlapping slots
        const now = new Date();
        const yearN = now.getFullYear();
        const monthN = (now.getMonth() + 1).toString().padStart(2, '0');
        const dayN = now.getDate().toString().padStart(2, '0');
        const todayStr = `${yearN}-${monthN}-${dayN}`;
        const nowTotalMinutes = now.getHours() * 60 + now.getMinutes();

        const availableSlots = allSlots.filter(slot => {
            const [slotH, slotM] = slot.split(':').map(Number);
            const slotTotalMinutes = slotH * 60 + slotM;

            // Past slot check
            if (date === todayStr && slotTotalMinutes < nowTotalMinutes) {
                return false;
            }

            return !bookedAppointments.some(booked => {
                const [bookedH, bookedM] = booked.start_time.split(':').map(Number);
                const bookedStartTotal = bookedH * 60 + bookedM;
                const bookedEndTotal = bookedStartTotal + (booked.duration_minutes || 30);

                return slotTotalMinutes >= bookedStartTotal && slotTotalMinutes < bookedEndTotal;
            });
        });

        res.status(200).json({
            success: true,
            data: availableSlots
        });

    } catch (error) {
        console.error('Erreur fetching available slots:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

// Remove an appointment (Patient's side)
export const deleteAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const patient_user_id = req.patient.id;

        const [result] = await pool.query(
            "DELETE FROM appointments WHERE id = ? AND patient_user_id = ?",
            [id, patient_user_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Rendez-vous introuvable ou non autorisé' });
        }

        res.status(200).json({ success: true, message: 'Rendez-vous supprimé de l\'historique' });
    } catch (error) {
        console.error('Error deleting appointment:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur lors de la suppression' });
    }
};
