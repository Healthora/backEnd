import pool from '../database.js';

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
