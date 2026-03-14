import pool from '../database.js';

// Search and list doctors
export const getDoctors = async (req, res) => {
    try {
        const { search, specialty } = req.query;
        let query = `
            SELECT d.id, d.first_name, d.last_name, d.specialty, d.phone, d.bio,
                   c.name as cabinet_name, c.address as cabinet_address, c.id as cabinet_id
            FROM doctors d
            LEFT JOIN cabinets c ON d.id = c.doctor_id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (d.first_name LIKE ? OR d.last_name LIKE ? OR d.specialty LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (specialty) {
            query += ` AND d.specialty = ?`;
            params.push(specialty);
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
            `SELECT d.id, d.email, d.first_name, d.last_name, d.specialty, d.phone, d.bio, c.name as cabinet_name, c.address as cabinet_address, c.schedule, c.id as cabinet_id
             FROM doctors d
             LEFT JOIN cabinets c ON d.id = c.doctor_id
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

        // Fetch doctor's consultation duration for duration_minutes
        const [doctorRows] = await pool.query('SELECT consultation_duration FROM doctors WHERE id = ?', [doctor_id]);
        const duration_minutes = doctorRows.length > 0 ? doctorRows[0].consultation_duration : 30;

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
                    d.first_name as doc_first, d.last_name as doc_last, d.specialty,
                    c.name as cabinet_name, c.address as cabinet_address
             FROM appointments a
             JOIN doctors d ON a.doctor_id = d.id
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
                d.specialty as doctor_specialty
             FROM prescriptions p
             JOIN doctors d ON p.doctor_id = d.id
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
            `SELECT id, email, first_name, last_name, phone, address, birth_date, gender, bio
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
                bio: u.bio
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
        const { firstName, lastName, phone, address, birthDate, gender, bio } = req.body;

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
            `SELECT id, email, first_name, last_name, phone, address, birth_date, gender, bio
             FROM patient_users WHERE id = ?`,
            [req.patient.id]
        );
        const u = updated[0];
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
                bio: u.bio
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

// Permanently remove an appointment
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

        res.status(200).json({ success: true, message: 'Rendez-vous supprimé' });
    } catch (error) {
        console.error('Error deleting appointment:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur lors de la suppression' });
    }
};
