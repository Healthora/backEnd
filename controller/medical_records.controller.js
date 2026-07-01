import pool from '../database.js';
import { v2 as cloudinary } from 'cloudinary';

const uploadToCloudinary = (buffer, mimetype) =>
    new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
            { folder: 'doctorapp/consultations', resource_type: 'auto' },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        ).end(buffer);
    });

/**
 * GET /medical-records/prescriptions
 * Returns all prescriptions for the authenticated patient.
 */
export const getMyPrescriptions = async (req, res) => {
    try {
        const patientId = req.patient.patientId;

        // Fetch prescriptions with doctor details
        const [rows] = await pool.query(`
            SELECT 
                o.id,
                o.appointment_id,
                o.doctor_id,
                o.patient_id,
                o.file_url,
                o.medicaments,
                o.created_at,
                d.firstname as doctor_firstname,
                d.lastname as doctor_lastname,
                d.img_url as doctor_img_url,
                GROUP_CONCAT(DISTINCT s.name SEPARATOR ', ') as speciality_name
            FROM ordonnance o
            JOIN doctor d ON o.doctor_id = d.id
            LEFT JOIN doctor_speciality ds ON d.id = ds.doctor_id
            LEFT JOIN speciality s ON ds.speciality_id = s.id
            WHERE o.patient_id = ?
            GROUP BY o.id, d.id
            ORDER BY o.created_at DESC
        `, [patientId]);

        // Parse medicaments JSON string safely
        const formattedRows = rows.map(row => {
            let parsedMeds = row.medicaments;
            if (typeof parsedMeds === 'string' && parsedMeds.trim() !== '') {
                try {
                    parsedMeds = JSON.parse(parsedMeds);
                } catch (e) {
                    // Fallback if it's not valid JSON
                    parsedMeds = [];
                }
            }
            return {
                ...row,
                medicaments: parsedMeds
            };
        });

        res.status(200).json({
            success: true,
            data: formattedRows
        });
    } catch (error) {
        console.error('getMyPrescriptions error:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la récupération des ordonnances' });
    }
};

/**
 * GET /medical-records/appointment/:appointmentId
 * Returns the prescription for a specific appointment.
 */
export const getPrescriptionByAppointment = async (req, res) => {
    try {
        const patientId = req.patient.patientId;
        const { appointmentId } = req.params;

        const [rows] = await pool.query(`
            SELECT 
                o.id,
                o.appointment_id,
                o.doctor_id,
                o.patient_id,
                o.file_url,
                o.medicaments,
                o.created_at,
                d.firstname as doctor_firstname,
                d.lastname as doctor_lastname,
                d.img_url as doctor_img_url,
                GROUP_CONCAT(DISTINCT s.name SEPARATOR ', ') as speciality_name
            FROM ordonnance o
            JOIN doctor d ON o.doctor_id = d.id
            LEFT JOIN doctor_speciality ds ON d.id = ds.doctor_id
            LEFT JOIN speciality s ON ds.speciality_id = s.id
            WHERE o.patient_id = ? AND o.appointment_id = ?
            GROUP BY o.id, d.id
        `, [patientId, appointmentId]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Ordonnance non trouvée' });
        }

        const row = rows[0];
        let parsedMedsObj = row.medicaments;
        if (typeof parsedMedsObj === 'string' && parsedMedsObj.trim() !== '') {
            try {
                parsedMedsObj = JSON.parse(parsedMedsObj);
            } catch (e) {
                parsedMedsObj = [];
            }
        }

        const formattedRow = {
            ...row,
            medicaments: parsedMedsObj
        };

        res.status(200).json({
            success: true,
            data: formattedRow
        });
    } catch (error) {
        console.error('getPrescriptionByAppointment error:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la récupération de l\'ordonnance' });
    }
};

// ─── CONSULTATION RECORDS (DOCTOR) ──────────────────────────────────────────

export const createConsultationRecord = async (req, res) => {
    try {
        const doctorId = req.doctor.doctorId;
        const { appointment_id, patient_id, record_data } = req.body;

        if (!appointment_id || !patient_id || !record_data) {
            return res.status(400).json({ success: false, message: 'Données manquantes' });
        }

        let parsedData = {};
        try {
            parsedData = typeof record_data === 'string' ? JSON.parse(record_data) : record_data;
        } catch (e) {
            return res.status(400).json({ success: false, message: 'Format de données invalide' });
        }

        // Upload any files
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const result = await uploadToCloudinary(file.buffer, file.mimetype);
                
                // If the field exists but is not an array, convert it to array
                if (parsedData[file.fieldname]) {
                    if (Array.isArray(parsedData[file.fieldname])) {
                        parsedData[file.fieldname].push(result.secure_url);
                    } else {
                        parsedData[file.fieldname] = [parsedData[file.fieldname], result.secure_url];
                    }
                } else {
                    parsedData[file.fieldname] = [result.secure_url];
                }
            }
        }

        const jsonData = JSON.stringify(parsedData);

        // Check if record already exists for this appointment
        const [existing] = await pool.query('SELECT id FROM consultation_record WHERE appointment_id = ?', [appointment_id]);
        
        if (existing.length > 0) {
            await pool.query(
                'UPDATE consultation_record SET record_data = ? WHERE id = ? AND doctor_id = ?',
                [jsonData, existing[0].id, doctorId]
            );
        } else {
            await pool.query(
                `INSERT INTO consultation_record (appointment_id, patient_id, doctor_id, record_data)
                 VALUES (?, ?, ?, ?)`,
                [appointment_id, patient_id, doctorId, jsonData]
            );
        }

        res.status(200).json({ success: true, message: 'Consultation enregistrée avec succès', data: parsedData });
    } catch (error) {
        console.error('createConsultationRecord error:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de l\'enregistrement de la consultation' });
    }
};

export const getPatientConsultationHistory = async (req, res) => {
    try {
        const doctorId = req.doctor.doctorId;
        const { patientId } = req.params;

        const [records] = await pool.query(
            `SELECT cr.id, cr.appointment_id, cr.record_data, cr.created_at, a.appointment_date 
             FROM consultation_record cr
             JOIN appointment a ON cr.appointment_id = a.id
             WHERE cr.patient_id = ? AND cr.doctor_id = ?
             ORDER BY a.appointment_date DESC`,
            [patientId, doctorId]
        );

        res.status(200).json({ success: true, data: records });
    } catch (error) {
        console.error('getPatientConsultationHistory error:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la récupération de l\'historique' });
    }
};

export const deleteConsultationRecord = async (req, res) => {
    try {
        const doctorId = req.doctor.doctorId;
        const { id } = req.params;

        const [result] = await pool.query(
            'DELETE FROM consultation_record WHERE id = ? AND doctor_id = ?',
            [id, doctorId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Dossier non trouvé ou non autorisé' });
        }

        res.status(200).json({ success: true, message: 'Dossier supprimé avec succès' });
    } catch (error) {
        console.error('deleteConsultationRecord error:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la suppression du dossier' });
    }
};

// ─── PATIENT DOSSIER (PATIENT) ──────────────────────────────────────────────

export const getMyDossier = async (req, res) => {
    try {
        const patientId = req.patient.patientId;

        const [records] = await pool.query(
            `SELECT 
                cr.id, 
                cr.record_data, 
                cr.created_at, 
                a.appointment_date,
                d.firstname as doctor_firstname,
                d.lastname as doctor_lastname,
                d.img_url as doctor_img_url,
                c.name as cabinet_name,
                GROUP_CONCAT(DISTINCT s.name SEPARATOR ', ') as speciality_name
             FROM consultation_record cr
             JOIN appointment a ON cr.appointment_id = a.id
             JOIN doctor d ON cr.doctor_id = d.id
             LEFT JOIN cabinet c ON d.id = c.doctor_id
             LEFT JOIN doctor_speciality ds ON d.id = ds.doctor_id
             LEFT JOIN speciality s ON ds.speciality_id = s.id
             WHERE cr.patient_id = ?
             GROUP BY cr.id, a.id, d.id, c.id
             ORDER BY a.appointment_date DESC`,
            [patientId]
        );

        res.status(200).json({ success: true, data: records });
    } catch (error) {
        console.error('getMyDossier error:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la récupération de votre dossier' });
    }
};
