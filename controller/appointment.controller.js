import pool from '../database.js';

export const createAppointment = async (req, res) => {
    try {
        const {
            patient_id,
            cabinet_id,
            appointment_date,
            appointment_time,
            duration_minutes,
            visit_type,
            notes
        } = req.body;
        const doctor_id = req.doctor.doctorId;

        if (!patient_id || !doctor_id || !cabinet_id || !appointment_date || !visit_type) {
            return res.status(400).json({
                success: false,
                message: 'Veuillez remplir tous les champs obligatoires'
            });
        }

        const status = 'nouveau';
        const validStatuses = ['nouveau', 'confirme', 'ne_repond_pas', 'reprogramme', 'absent', 'suivi', 'termine', 'annule'];

        const reqStatus = req.body.status;
        const finalStatus = (reqStatus && validStatuses.includes(reqStatus)) ? reqStatus : 'nouveau';

        let final_patient_id = patient_id;
        let patient_user_id = null;

        // If the patient is coming from the app but not yet in the doctor's table
        if (req.body.is_external_user) {
            const [userRows] = await pool.query('SELECT * FROM patient_users WHERE id = ?', [patient_id]);
            if (userRows.length > 0) {
                const u = userRows[0];
                patient_user_id = u.id;
                
                // Double check if they were added in the meantime
                const [existing] = await pool.query(
                    'SELECT id FROM patients WHERE doctor_id = ? AND (phone = ? OR email = ?)',
                    [doctor_id, u.phone || null, u.email || null]
                );
                
                if (existing.length > 0) {
                    final_patient_id = existing[0].id;
                } else {
                    const [insertResult] = await pool.query(
                        `INSERT INTO patients (doctor_id, first_name, last_name, email, phone, address, birth_date, gender)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [doctor_id, u.first_name, u.last_name, u.email, u.phone, u.address || null, u.birth_date || null, u.gender || 'M']
                    );
                    final_patient_id = insertResult.insertId;
                }
            }
        } else {
            // Existing patient, check for patient_user link
            const [patientRows] = await pool.query('SELECT phone FROM patients WHERE id = ?', [patient_id]);
            if (patientRows.length > 0 && patientRows[0].phone) {
                const [userRows] = await pool.query('SELECT id FROM patient_users WHERE phone = ?', [patientRows[0].phone]);
                if (userRows.length > 0) {
                    patient_user_id = userRows[0].id;
                }
            }
        }

        const [result] = await pool.query(
            `INSERT INTO appointments 
            (doctor_id, patient_id, cabinet_id, appointment_date, appointment_time, duration_minutes, status, visit_type, notes, patient_user_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [doctor_id, final_patient_id, cabinet_id, appointment_date, appointment_time || null, duration_minutes || null, finalStatus, visit_type, notes || '', patient_user_id]
        );

        res.status(201).json({
            success: true,
            message: 'Rendez-vous créé avec succès',
            data: {
                id: result.insertId,
                ...req.body,
                status: finalStatus,
                notes: notes || '',
                patient_user_id
            }
        });

    } catch (error) {
        console.error('Erreur lors de la création du rendez-vous:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création du rendez-vous',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const getAppointments = async (req, res) => {
    try {
        const { doctorId } = req.params;

        if (!doctorId) {
            return res.status(400).json({
                success: false,
                message: 'Doctor ID is required'
            });
        }

        if (parseInt(doctorId, 10) !== req.doctor.doctorId) {
            return res.status(403).json({
                success: false,
                message: 'Non autorisé à accéder aux rendez-vous d\'un autre médecin'
            });
        }

        const [appointments] = await pool.query(
            `SELECT 
                a.id,
                a.doctor_id,
                a.patient_id,
                a.cabinet_id,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') as appointment_date,
                DATE_FORMAT(a.appointment_time, '%H:%i') as appointment_time,
                a.duration_minutes,
                a.status,
                a.visit_type,
                a.notes,
                a.created_at,
                p.first_name as patient_first_name,
                p.last_name as patient_last_name,
                p.phone as patient_phone,
                p.email as patient_email,
                p.gender as patient_gender
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            WHERE a.doctor_id = ?
            ORDER BY a.appointment_date DESC, a.appointment_time ASC, a.created_at DESC`,
            [doctorId]
        );

        res.status(200).json({
            success: true,
            data: appointments
        });

    } catch (error) {
        console.error('Erreur lors de la récupération des rendez-vous:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des rendez-vous',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const updateAppointmentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['nouveau', 'confirme', 'ne_repond_pas', 'reprogramme', 'absent', 'suivi', 'termine', 'annule'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Statut invalide. Valeurs acceptées: ${validStatuses.join(', ')}`
            });
        }

        const [result] = await pool.query(
            'UPDATE appointments SET status = ? WHERE id = ? AND doctor_id = ?',
            [status, id, req.doctor.doctorId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Rendez-vous non trouvé'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Statut mis à jour avec succès'
        });

    } catch (error) {
        console.error('Erreur lors de la mise à jour du statut:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour',
            error: error.message
        });
    }
};

export const updateAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            patient_id,
            is_external_user,
            appointment_date,
            appointment_time,
            duration_minutes,
            visit_type,
            status,
            notes
        } = req.body;
        const doctor_id = req.doctor.doctorId;

        // Check if appointment exists
        const [existing] = await pool.query('SELECT * FROM appointments WHERE id = ? AND doctor_id = ?', [id, doctor_id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Rendez-vous non trouvé'
            });
        }

        const updates = [];
        const values = [];

        if (patient_id) {
            let final_patient_id = patient_id;
            let patient_user_id = null;

            if (is_external_user) {
                const [userRows] = await pool.query('SELECT * FROM patient_users WHERE id = ?', [patient_id]);
                if (userRows.length > 0) {
                    const u = userRows[0];
                    patient_user_id = u.id;
                    
                    const [docPatient] = await pool.query(
                        'SELECT id FROM patients WHERE doctor_id = ? AND (phone = ? OR email = ?)',
                        [doctor_id, u.phone || null, u.email || null]
                    );
                    
                    if (docPatient.length > 0) {
                        final_patient_id = docPatient[0].id;
                    } else {
                        const [insertResult] = await pool.query(
                            `INSERT INTO patients (doctor_id, first_name, last_name, email, phone, address, birth_date, gender)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                            [doctor_id, u.first_name, u.last_name, u.email, u.phone, u.address || null, u.birth_date || null, u.gender || 'M']
                        );
                        final_patient_id = insertResult.insertId;
                    }
                }
            } else {
                const [patientRows] = await pool.query('SELECT phone FROM patients WHERE id = ?', [patient_id]);
                if (patientRows.length > 0 && patientRows[0].phone) {
                    const [userRows] = await pool.query('SELECT id FROM patient_users WHERE phone = ?', [patientRows[0].phone]);
                    if (userRows.length > 0) {
                        patient_user_id = userRows[0].id;
                    }
                }
            }

            updates.push('patient_id = ?');
            values.push(final_patient_id);
            
            updates.push('patient_user_id = ?');
            values.push(patient_user_id);
        }

        if (appointment_date) {
            updates.push('appointment_date = ?');
            values.push(appointment_date);
        }
        if (appointment_time !== undefined) {
            updates.push('appointment_time = ?');
            values.push(appointment_time || null);
        }
        if (duration_minutes !== undefined) {
            updates.push('duration_minutes = ?');
            values.push(duration_minutes || null);
        }
        if (visit_type) {
            updates.push('visit_type = ?');
            values.push(visit_type);
        }

        if (status) {
            const validStatuses = ['nouveau', 'confirme', 'ne_repond_pas', 'reprogramme', 'absent', 'suivi', 'termine', 'annule'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: `Statut invalide. Valeurs acceptées: ${validStatuses.join(', ')}`
                });
            }
            updates.push('status = ?');
            values.push(status);
        }
        if (notes !== undefined) {
            updates.push('notes = ?');
            values.push(notes);
        }

        // Retroactive fix: Check if patient_user_id needs syncing
        if (!existing[0].patient_user_id && !updates.includes('patient_user_id = ?')) {
            const [patientRows] = await pool.query('SELECT phone FROM patients WHERE id = ?', [existing[0].patient_id]);
            if (patientRows.length > 0 && patientRows[0].phone) {
                const [userRows] = await pool.query('SELECT id FROM patient_users WHERE phone = ?', [patientRows[0].phone]);
                if (userRows.length > 0) {
                    updates.push('patient_user_id = ?');
                    values.push(userRows[0].id);
                }
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Aucune donnée à mettre à jour'
            });
        }

        values.push(id, req.doctor.doctorId);

        await pool.query(
            `UPDATE appointments SET ${updates.join(', ')} WHERE id = ? AND doctor_id = ?`,
            values
        );

        res.status(200).json({
            success: true,
            message: 'Rendez-vous mis à jour avec succès'
        });

    } catch (error) {
        console.error('Erreur lors de la mise à jour du rendez-vous:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour',
            error: error.message
        });
    }
};

export const deleteAppointment = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await pool.query(
            'DELETE FROM appointments WHERE id = ? AND doctor_id = ?',
            [id, req.doctor.doctorId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Rendez-vous non trouvé'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Rendez-vous supprimé avec succès'
        });

    } catch (error) {
        console.error('Erreur lors de la suppression du rendez-vous:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression',
            error: error.message
        });
    }
};

export const getAppointmentsByPatient = async (req, res) => {
    try {
        const { patientId } = req.params;

        if (!patientId) {
            return res.status(400).json({
                success: false,
                message: 'Patient ID is required'
            });
        }

        const [appointments] = await pool.query(
            `SELECT 
                id,
                doctor_id,
                patient_id,
                cabinet_id,
                DATE_FORMAT(appointment_date, '%Y-%m-%d') as appointment_date,
                DATE_FORMAT(appointment_time, '%H:%i') as appointment_time,
                status,
                visit_type,
                notes,
                created_at
            FROM appointments 
            WHERE patient_id = ? AND doctor_id = ?
            ORDER BY appointment_date DESC, appointment_time ASC, created_at DESC`,
            [patientId, req.doctor.doctorId]
        );

        res.status(200).json({
            success: true,
            data: appointments
        });

    } catch (error) {
        console.error('Erreur lors de la récupération des rendez-vous du patient:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des rendez-vous',
            error: error.message
        });
    }
};

export const getAvailableSlots = async (req, res) => {
    try {
        const { date } = req.query; // Format YYYY-MM-DD
        const doctorId = req.doctor.doctorId;

        if (!date) {
            return res.status(400).json({ success: false, message: 'La date est requise' });
        }

        // Robust date parsing to avoid timezone shifts
        const [year, month, day] = date.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayOfWeek = dayNames[dateObj.getDay()];

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

            let currentH = startH;
            let currentM = startM;
            const duration = avail.slot_duration || 30; // Safety fallback

            if (duration <= 0) return; // Prevent infinite loop

            while (currentH < endH || (currentH === endH && currentM < endM)) {
                const hStr = currentH.toString().padStart(2, '0');
                const mStr = currentM.toString().padStart(2, '0');
                allSlots.push(`${hStr}:${mStr}`);

                currentM += duration;
                if (currentM >= 60) {
                    currentH += Math.floor(currentM / 60);
                    currentM = currentM % 60;
                }
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

        // 4. Filter out slots that overlap with ANY part of a booked appointment
        const availableSlots = allSlots.filter(slot => {
            const [slotH, slotM] = slot.split(':').map(Number);
            const slotTotalMinutes = slotH * 60 + slotM;

            return !bookedAppointments.some(booked => {
                const [bookedH, bookedM] = booked.start_time.split(':').map(Number);
                const bookedStartTotal = bookedH * 60 + bookedM;
                const bookedEndTotal = bookedStartTotal + (booked.duration_minutes || 30);

                // A slot is blocked if it falls within [bookedStart, bookedEnd)
                return slotTotalMinutes >= bookedStartTotal && slotTotalMinutes < bookedEndTotal;
            });
        });

        res.status(200).json({
            success: true,
            data: availableSlots
        });

    } catch (error) {
        console.error('Erreur lors de la recherche de disponibilités:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur',
            error: error.message
        });
    }
};