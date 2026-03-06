import pool from '../database.js';

// Search and list doctors
export const getDoctors = async (req, res) => {
    try {
        const { search, specialty } = req.query;
        let query = `
            SELECT d.id, d.first_name, d.last_name, d.specialty, d.phone,
                   c.name as cabinet_name, c.address as cabinet_address
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
            `SELECT d.*, c.name as cabinet_name, c.address as cabinet_address, c.schedule, c.id as cabinet_id
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
        const { doctor_id, cabinet_id, appointment_date, visit_type, notes } = req.body;
        const patient_user_id = req.patient.id;

        if (!doctor_id || !appointment_date) {
            return res.status(400).json({ success: false, message: 'Données manquantes' });
        }

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
            `INSERT INTO appointments (doctor_id, patient_id, cabinet_id, appointment_date, status, visit_type, notes, patient_user_id)
             VALUES (?, ?, ?, ?, 'nouveau', ?, ?, ?)`,
            [doctor_id, final_patient_id, cabinet_id, appointment_date, visit_type || 'consultation', notes || '', patient_user_id]
        );

        res.status(201).json({ success: true, message: 'Rendez-vous réservé', id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Erreur lors de la réservation' });
    }
};

// View History
export const getMyAppointments = async (req, res) => {
    try {
        const [appointments] = await pool.query(
            `SELECT a.*, d.first_name as doc_first, d.last_name as doc_last, d.specialty,
                    c.name as cabinet_name, c.address as cabinet_address
             FROM appointments a
             JOIN doctors d ON a.doctor_id = d.id
             LEFT JOIN cabinets c ON a.cabinet_id = c.id
             WHERE a.patient_user_id = ?
             ORDER BY a.appointment_date DESC`,
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
