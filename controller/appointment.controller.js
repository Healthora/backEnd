import pool from '../database.js';

export const createAppointment = async (req, res) => {
    try {
        const {
            patient_id,
            cabinet_id,
            appointment_date,
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

        // Fix: Web-First Bug
        // We need to check if the patient's phone exists in patient_users to link the appointment
        const [patientRows] = await pool.query('SELECT phone FROM patients WHERE id = ?', [patient_id]);
        let patient_user_id = null;

        if (patientRows.length > 0 && patientRows[0].phone) {
            const phone = patientRows[0].phone;
            const [userRows] = await pool.query('SELECT id FROM patient_users WHERE phone = ?', [phone]);
            if (userRows.length > 0) {
                patient_user_id = userRows[0].id;
            }
        }

        const [result] = await pool.query(
            `INSERT INTO appointments 
            (doctor_id, patient_id, cabinet_id, appointment_date, status, visit_type, notes, patient_user_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [doctor_id, patient_id, cabinet_id, appointment_date, finalStatus, visit_type, notes || '', patient_user_id]
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
            ORDER BY a.appointment_date DESC, a.created_at DESC`,
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
            appointment_date,
            visit_type,
            status,
            notes
        } = req.body;

        // Check if appointment exists
        const [existing] = await pool.query('SELECT * FROM appointments WHERE id = ? AND doctor_id = ?', [id, req.doctor.doctorId]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Rendez-vous non trouvé'
            });
        }

        const updates = [];
        const values = [];

        if (appointment_date) {
            updates.push('appointment_date = ?');
            values.push(appointment_date);
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
                status,
                visit_type,
                notes,
                created_at
            FROM appointments 
            WHERE patient_id = ? AND doctor_id = ?
            ORDER BY appointment_date DESC, created_at DESC`,
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