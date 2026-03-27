import pool from '../database.js';

/**
 * Get all specialities with icons/categories
 */
export const getSpecialities = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM speciality ORDER BY name ASC');
        res.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('getSpecialities error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Search doctors by name and/or speciality and/or wilaya
 */
export const searchDoctors = async (req, res) => {
    try {
        const { query, specialityId, wilayaId, limit } = req.query;
        let sql = `
            SELECT 
                d.*,
                GROUP_CONCAT(DISTINCT s.name SEPARATOR ', ') as specialities,
                GROUP_CONCAT(DISTINCT s.id SEPARATOR ',') as speciality_ids,
                c.name as cabinet_name, c.address as cabinet_address,
                w.name as wilaya_name, cm.name as commune_name
            FROM doctor d
            LEFT JOIN doctor_speciality ds ON d.id = ds.doctor_id
            LEFT JOIN speciality s ON ds.speciality_id = s.id
            LEFT JOIN cabinet c ON d.id = c.doctor_id
            LEFT JOIN wilaya w ON c.wilaya_id = w.id
            LEFT JOIN commun cm ON c.commun_id = cm.id
            WHERE 1=1
        `;
        const params = [];

        if (query) {
            sql += ` AND (d.firstname LIKE ? OR d.lastname LIKE ? OR s.name LIKE ?)`;
            const likeQuery = `%${query}%`;
            params.push(likeQuery, likeQuery, likeQuery);
        }

        if (specialityId) {
            sql += ` AND d.id IN (SELECT doctor_id FROM doctor_speciality WHERE speciality_id = ?)`;
            params.push(specialityId);
        }

        if (wilayaId) {
            sql += ` AND c.wilaya_id = ?`;
            params.push(wilayaId);
        }

        sql += ` GROUP BY d.id, c.name, c.address, w.name, cm.name ORDER BY d.is_verified DESC, d.lastname ASC`;

        if (limit && !isNaN(parseInt(limit))) {
            sql += ` LIMIT ?`;
            params.push(parseInt(limit));
        }

        const [rows] = await pool.query(sql, params);

        res.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('searchDoctors error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


/**
 * Get doctor details including availability
 */
export const getDoctorDetails = async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. Get doctor basic info
        const [doctorRows] = await pool.query(`
            SELECT 
                d.*,
                GROUP_CONCAT(DISTINCT s.name SEPARATOR ', ') as specialities,
                c.name as cabinet_name, c.address as cabinet_address,
                w.name as wilaya_name, cm.name as commune_name
            FROM doctor d
            LEFT JOIN doctor_speciality ds ON d.id = ds.doctor_id
            LEFT JOIN speciality s ON ds.speciality_id = s.id
            LEFT JOIN cabinet c ON d.id = c.doctor_id
            LEFT JOIN wilaya w ON c.wilaya_id = w.id
            LEFT JOIN commun cm ON c.commun_id = cm.id
            WHERE d.id = ?
            GROUP BY d.id, c.name, c.address, w.name, cm.name
        `, [id]);

        if (doctorRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Doctor not found' });
        }

        // 2. Get doctor availability
        const [availabilityRows] = await pool.query(`
            SELECT id, day_of_week, start_time, end_time, selectione_les_number_of_appoi_by_day as slots_per_day
            FROM availability
            WHERE doctor_id = ?
            ORDER BY FIELD(day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
        `, [id]);

        res.status(200).json({
            success: true,
            data: {
                ...doctorRows[0],
                availability: availabilityRows
            }
        });
    } catch (error) {
        console.error('getDoctorDetails error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


// ── PATIENT-FACING APPOINTMENT ENDPOINTS ─────────────────────────────────────

/**
 * GET /discovery/my-appointments
 * Returns all appointments for the authenticated patient,
 * enriched with doctor + cabinet info.
 */
export const getPatientAppointments = async (req, res) => {
    try {
        const patientId = req.patient.patientId;
        const [rows] = await pool.query(`
            SELECT
                a.id, a.doctor_id, a.patient_id,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
                DATE_FORMAT(a.start_time, '%H:%i')          AS start_time,
                a.duration, a.status, a.note_doctor, a.note_patient, a.created_at,
                d.firstname  AS doctor_first_name,
                d.lastname   AS doctor_last_name,
                d.img_url,
                s.name       AS specialty,
                c.name       AS cabinet_name,
                c.address    AS cabinet_address,
                w.name       AS wilaya
            FROM appointment a
            JOIN doctor d           ON a.doctor_id = d.id
            LEFT JOIN doctor_speciality ds ON d.id = ds.doctor_id
            LEFT JOIN speciality s  ON ds.speciality_id = s.id
            LEFT JOIN cabinet c     ON a.doctor_id = c.doctor_id
            LEFT JOIN wilaya w      ON c.wilaya_id = w.id
            WHERE a.patient_id = ?
            ORDER BY a.appointment_date DESC, a.start_time ASC
        `, [patientId]);

        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('getPatientAppointments error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

/**
 * GET /discovery/available-slots?doctorId=X&date=YYYY-MM-DD
 * Returns available time slots for a doctor on a specific date.
 */
export const getAvailableSlotsForPatient = async (req, res) => {
    try {
        const { doctorId, date } = req.query;

        if (!doctorId || !date) {
            return res.status(400).json({ success: false, message: 'doctorId et date sont requis' });
        }

        const [year, month, day] = date.split('-');
        const dObj = new Date(year, month - 1, day);
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayOfWeek = dayNames[dObj.getDay()];

        const [availabilities] = await pool.query(
            'SELECT start_time, end_time, selectione_les_number_of_appoi_by_day FROM availability WHERE doctor_id = ? AND day_of_week = ?',
            [doctorId, dayOfWeek]
        );

        if (availabilities.length === 0) {
            return res.status(200).json({ success: true, data: [], message: 'Cabinet fermé ce jour-là' });
        }

        const [[doc]] = await pool.query(
            'SELECT slot_duration, selectione_les_jours_a_la_vance FROM doctor WHERE id = ?',
            [doctorId]
        );
        const slotDuration = doc?.slot_duration || 30;

        // Build all theoretical slots
        let allSlots = [];
        for (const av of availabilities) {
            const start = av.start_time.substring(0, 5);
            const end   = av.end_time.substring(0, 5);
            const [sH, sM] = start.split(':').map(Number);
            const [eH, eM] = end.split(':').map(Number);
            let cur = sH * 60 + sM;
            const endTotal = eH * 60 + eM;
            while (cur + slotDuration <= endTotal) {
                allSlots.push(`${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`);
                cur += slotDuration;
            }
        }

        // Fetch booked slots
        const [booked] = await pool.query(
            `SELECT DATE_FORMAT(start_time, '%H:%i') AS start_time, duration
             FROM appointment
             WHERE doctor_id = ? AND appointment_date = ? AND status NOT IN ('annulé','absent')`,
            [doctorId, date]
        );

        // Check max per day
        const maxPerDay = availabilities[0].selectione_les_number_of_appoi_by_day || 0;
        if (maxPerDay > 0 && booked.length >= maxPerDay) {
            return res.status(200).json({ success: true, data: [], message: 'Journée complète' });
        }

        const available = allSlots.filter(slot => {
            const [h, m] = slot.split(':').map(Number);
            const slotMins = h * 60 + m;
            return !booked.some(b => {
                const [bh, bm] = b.start_time.split(':').map(Number);
                const bStart = bh * 60 + bm;
                return slotMins >= bStart && slotMins < bStart + (b.duration || slotDuration);
            });
        });

        res.status(200).json({ success: true, data: available });
    } catch (error) {
        console.error('getAvailableSlotsForPatient error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

/**
 * POST /discovery/book
 * Patient books an appointment.
 */
export const bookAppointmentAsPatient = async (req, res) => {
    try {
        const patientId = req.patient.patientId;
        const { doctor_id, appointment_date, start_time, note_patient } = req.body;

        if (!doctor_id || !appointment_date || !start_time) {
            return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
        }

        // Anti-double booking
        const [conflict] = await pool.query(
            `SELECT id FROM appointment WHERE doctor_id=? AND appointment_date=? AND start_time=? AND status NOT IN ('annulé','absent')`,
            [doctor_id, appointment_date, start_time]
        );
        if (conflict.length > 0) {
            return res.status(409).json({ success: false, message: 'Ce créneau est déjà réservé' });
        }

        // Get slot_duration from doctor
        const [[doc]] = await pool.query('SELECT slot_duration FROM doctor WHERE id = ?', [doctor_id]);
        const duration = doc?.slot_duration || 30;

        // Link patient to doctor
        const [link] = await pool.query(
            'SELECT id FROM patient_doctor WHERE patient_id=? AND doctor_id=?',
            [patientId, doctor_id]
        );
        if (link.length === 0) {
            await pool.query('INSERT INTO patient_doctor (patient_id, doctor_id) VALUES (?,?)', [patientId, doctor_id]);
        }

        const [result] = await pool.query(
            `INSERT INTO appointment (doctor_id, patient_id, appointment_date, start_time, duration, status, note_patient)
             VALUES (?, ?, ?, ?, ?, 'en attente', ?)`,
            [doctor_id, patientId, appointment_date, start_time, duration, note_patient || null]
        );

        res.status(201).json({
            success: true,
            message: 'Rendez-vous réservé avec succès',
            data: { id: result.insertId, doctor_id, patient_id: patientId, appointment_date, start_time, duration, status: 'en attente' }
        });
    } catch (error) {
        console.error('bookAppointmentAsPatient error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

/**
 * PUT /discovery/cancel/:id
 * Patient cancels their own appointment.
 */
export const cancelAppointmentAsPatient = async (req, res) => {
    try {
        const patientId = req.patient.patientId;
        const { id } = req.params;

        const [result] = await pool.query(
            `UPDATE appointment SET status='annulé' WHERE id=? AND patient_id=? AND status='en attente'`,
            [id, patientId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Rendez-vous introuvable ou non annulable' });
        }

        res.status(200).json({ success: true, message: 'Rendez-vous annulé' });
    } catch (error) {
        console.error('cancelAppointmentAsPatient error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};
