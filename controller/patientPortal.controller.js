import pool from '../database.js';

/**
 * Patient portal (mobile app side).
 *
 * Schema changes applied:
 *  - doctors       → doctor
 *  - cabinets      → cabinet
 *  - patient_users → patient
 *  - patients (CRM)→ patient_doctor (link table)
 *  - commune table → commun
 *  - first_name    → firstname, last_name → lastname, birth_date → birthdate
 *  - cabinet.wilaya/commune (strings) → cabinet.wilaya_id / commun_id (FK ints)
 *
 * NOTE: bookAppointment, getMyAppointments, cancelAppointment, getDoctorAvailableSlots
 * still reference 'appointments' / 'availabilities' tables which are not in the current
 * schema snapshot. They are updated for doctor/patient table names but will need the
 * appointments table definition before being fully functional.
 */

// ─── SEARCH DOCTORS ───────────────────────────────────────────────────────────

export const getDoctors = async (req, res) => {
    try {
        const { search, specialty, wilayaId, communId } = req.query;

        let query = `
            SELECT
                d.id, d.firstname, d.lastname, d.phone, d.bio, d.img_url,
                d.is_reservation_online, d.is_verified,
                s.name       AS specialty,
                ds.speciality_id,
                c.id         AS cabinet_id,
                c.name       AS cabinet_name,
                c.address    AS cabinet_address,
                c.wilaya_id,
                w.name       AS wilaya,
                c.commun_id,
                cm.name      AS commune
            FROM doctor d
            LEFT JOIN doctor_speciality ds ON d.id  = ds.doctor_id
            LEFT JOIN speciality s         ON ds.speciality_id = s.id
            LEFT JOIN cabinet c            ON d.id  = c.doctor_id
            LEFT JOIN wilaya w             ON c.wilaya_id = w.id
            LEFT JOIN commun cm            ON c.commun_id = cm.id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (d.firstname LIKE ? OR d.lastname LIKE ? OR s.name LIKE ? OR c.name LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (specialty) {
            if (!isNaN(specialty)) {
                query += ` AND ds.speciality_id = ?`;
            } else {
                query += ` AND s.name LIKE ?`;
                params.push(`%${specialty}%`);
            }
            if (!isNaN(specialty)) params.push(specialty);
        }
        if (wilayaId) {
            query += ` AND c.wilaya_id = ?`;
            params.push(wilayaId);
        }
        if (communId) {
            query += ` AND c.commun_id = ?`;
            params.push(communId);
        }

        const [doctors] = await pool.query(query, params);

        // Map to camelCase for frontend
        const data = doctors.map(d => ({
            id:              d.id,
            firstName:       d.firstname,
            lastName:        d.lastname,
            phone:           d.phone,
            bio:             d.bio,
            imgUrl:          d.img_url,
            isVerified:      d.is_verified === 1,
            onlineBooking:   d.is_reservation_online === 1,
            specialty:       d.specialty,
            specialityId:    d.speciality_id,
            cabinetId:       d.cabinet_id,
            cabinetName:     d.cabinet_name,
            cabinetAddress:  d.cabinet_address,
            wilayaId:        d.wilaya_id,
            wilaya:          d.wilaya,
            communId:        d.commun_id,
            commune:         d.commune
        }));

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('getDoctors error:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la recherche' });
    }
};

// ─── DOCTOR DETAILS ───────────────────────────────────────────────────────────

export const getDoctorDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query(
            `SELECT
                d.id, d.firstname, d.lastname, d.phone, d.bio, d.img_url,
                d.is_reservation_online, d.is_verified,
                s.name    AS specialty,
                ds.speciality_id,
                c.id      AS cabinet_id,
                c.name    AS cabinet_name,
                c.address AS cabinet_address,
                c.wilaya_id,
                w.name    AS wilaya,
                c.commun_id,
                cm.name   AS commune
            FROM doctor d
            LEFT JOIN doctor_speciality ds ON d.id  = ds.doctor_id
            LEFT JOIN speciality s         ON ds.speciality_id = s.id
            LEFT JOIN cabinet c            ON d.id  = c.doctor_id
            LEFT JOIN wilaya w             ON c.wilaya_id = w.id
            LEFT JOIN commun cm            ON c.commun_id = cm.id
            WHERE d.id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Médecin introuvable' });
        }

        const d = rows[0];
        res.status(200).json({
            success: true,
            data: {
                id:             d.id,
                firstName:      d.firstname,
                lastName:       d.lastname,
                phone:          d.phone,
                bio:            d.bio,
                imgUrl:         d.img_url,
                isVerified:     d.is_verified === 1,
                onlineBooking:  d.is_reservation_online === 1,
                specialty:      d.specialty,
                specialityId:   d.speciality_id,
                cabinetId:      d.cabinet_id,
                cabinetName:    d.cabinet_name,
                cabinetAddress: d.cabinet_address,
                wilayaId:       d.wilaya_id,
                wilaya:         d.wilaya,
                communId:       d.commun_id,
                commune:        d.commune
            }
        });
    } catch (error) {
        console.error('getDoctorDetails error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

// ─── BOOK APPOINTMENT ─────────────────────────────────────────────────────────
// NOTE: depends on 'appointments' table (schema coming later).

export const bookAppointment = async (req, res) => {
    try {
        const { doctor_id, cabinet_id, appointment_date, appointment_time, visit_type, notes } = req.body;
        const patient_user_id = req.patient.id;

        if (!doctor_id || !cabinet_id || !appointment_date) {
            return res.status(400).json({
                success: false,
                message: 'doctor_id, cabinet_id et appointment_date sont obligatoires'
            });
        }

        // Verify doctor accepts online reservations
        const [doctorRows] = await pool.query(
            'SELECT is_reservation_online FROM doctor WHERE id = ?', [doctor_id]
        );
        if (doctorRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Médecin introuvable' });
        }
        if (!doctorRows[0].is_reservation_online) {
            return res.status(403).json({
                success: false,
                message: 'Ce médecin n\'accepte pas les réservations en ligne'
            });
        }

        // Ensure patient-doctor link exists (new schema: patient_doctor)
        const [link] = await pool.query(
            'SELECT id FROM patient_doctor WHERE patient_id = ? AND doctor_id = ?',
            [patient_user_id, doctor_id]
        );
        if (link.length === 0) {
            await pool.query(
                'INSERT INTO patient_doctor (patient_id, doctor_id) VALUES (?, ?)',
                [patient_user_id, doctor_id]
            );
        }

        // Anti-double-booking check
        const [conflict] = await pool.query(
            `SELECT id FROM appointments
             WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ?
             AND status NOT IN ('annule', 'absent')`,
            [doctor_id, appointment_date, appointment_time]
        );
        if (conflict.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Ce créneau est déjà réservé. Veuillez en choisir un autre.'
            });
        }

        const [result] = await pool.query(
            `INSERT INTO appointments
             (doctor_id, patient_id, cabinet_id, appointment_date, appointment_time, status, visit_type, notes)
             VALUES (?, ?, ?, ?, ?, 'nouveau', ?, ?)`,
            [doctor_id, patient_user_id, cabinet_id, appointment_date, appointment_time || null, visit_type || 'consultation', notes || '']
        );

        res.status(201).json({ success: true, message: 'Rendez-vous réservé', id: result.insertId });
    } catch (error) {
        console.error('bookAppointment error:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la réservation', error: error.message });
    }
};

// ─── MY APPOINTMENTS ──────────────────────────────────────────────────────────

export const getMyAppointments = async (req, res) => {
    try {
        const [appointments] = await pool.query(
            `SELECT
                a.id, a.doctor_id, a.patient_id, a.cabinet_id,
                a.status, a.visit_type, a.notes, a.created_at,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
                DATE_FORMAT(a.appointment_time, '%H:%i')    AS appointment_time,
                d.firstname  AS doc_first,
                d.lastname   AS doc_last,
                s.name       AS doc_specialty,
                c.name       AS cabinet_name,
                c.address    AS cabinet_address,
                w.name       AS wilaya,
                cm.name      AS commune
             FROM appointments a
             JOIN doctor d              ON a.doctor_id  = d.id
             LEFT JOIN doctor_speciality ds ON d.id = ds.doctor_id
             LEFT JOIN speciality s     ON ds.speciality_id = s.id
             LEFT JOIN cabinet c        ON a.cabinet_id = c.id
             LEFT JOIN wilaya w         ON c.wilaya_id  = w.id
             LEFT JOIN commun cm        ON c.commun_id  = cm.id
             WHERE a.patient_id = ?
             ORDER BY a.appointment_date DESC, a.appointment_time ASC`,
            [req.patient.id]
        );
        res.status(200).json({ success: true, data: appointments });
    } catch (error) {
        console.error('getMyAppointments error:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la récupération des rendez-vous' });
    }
};

// ─── MY PRESCRIPTIONS ─────────────────────────────────────────────────────────

export const getMyPrescriptions = async (req, res) => {
    try {
        const [prescriptions] = await pool.query(
            `SELECT
                p.id, p.cloudinary_url, p.created_at,
                d.firstname AS doctor_first_name,
                d.lastname  AS doctor_last_name,
                s.name      AS doctor_specialty
             FROM prescriptions p
             JOIN doctor d              ON p.doctor_id = d.id
             LEFT JOIN doctor_speciality ds ON d.id = ds.doctor_id
             LEFT JOIN speciality s     ON ds.speciality_id = s.id
             WHERE p.patient_id = ?
             ORDER BY p.created_at DESC`,
            [req.patient.id]
        );
        res.status(200).json({ success: true, data: prescriptions });
    } catch (error) {
        console.error('getMyPrescriptions error:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la récupération des ordonnances' });
    }
};

// ─── MY PROFILE ───────────────────────────────────────────────────────────────

export const getMyProfile = async (req, res) => {
    try {
        const [users] = await pool.query(
            `SELECT
                p.id, p.firstname, p.lastname, p.phone, p.address,
                p.birthdate, p.gender, p.is_verified, p.created_at,
                p.wilaya_id, w.name  AS wilaya,
                p.commun_id, cm.name AS commune
             FROM patient p
             LEFT JOIN wilaya w  ON p.wilaya_id = w.id
             LEFT JOIN commun cm ON p.commun_id = cm.id
             WHERE p.id = ?`,
            [req.patient.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'Profil introuvable' });
        }

        const u = users[0];
        res.status(200).json({
            success: true,
            data: {
                id:         u.id,
                firstName:  u.firstname,
                lastName:   u.lastname,
                phone:      u.phone,
                address:    u.address,
                birthDate:  u.birthdate,
                gender:     u.gender,
                isVerified: u.is_verified === 1,
                wilayaId:   u.wilaya_id,
                wilaya:     u.wilaya,
                communId:   u.commun_id,
                commune:    u.commune
            }
        });
    } catch (error) {
        console.error('getMyProfile error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

// ─── UPDATE PROFILE ───────────────────────────────────────────────────────────

export const updateMyProfile = async (req, res) => {
    try {
        const { firstName, lastName, phone, address, birthDate, gender, wilayaId, communId } = req.body;

        const fields = [];
        const values = [];

        if (firstName  !== undefined) { fields.push('firstname = ?');  values.push(firstName.trim()); }
        if (lastName   !== undefined) { fields.push('lastname = ?');   values.push(lastName.trim());  }
        if (phone      !== undefined) { fields.push('phone = ?');      values.push(phone.trim());     }
        if (address    !== undefined) { fields.push('address = ?');    values.push(address);          }
        if (birthDate  !== undefined) { fields.push('birthdate = ?');  values.push(birthDate);        }
        if (gender     !== undefined) { fields.push('gender = ?');     values.push(gender);           }
        if (wilayaId   !== undefined) { fields.push('wilaya_id = ?');  values.push(wilayaId || null); }
        if (communId   !== undefined) { fields.push('commun_id = ?');  values.push(communId || null); }

        if (fields.length === 0) {
            return res.status(400).json({ success: false, message: 'Aucune donnée à mettre à jour' });
        }

        values.push(req.patient.id);
        await pool.query(`UPDATE patient SET ${fields.join(', ')} WHERE id = ?`, values);

        const [updated] = await pool.query(
            `SELECT p.id, p.firstname, p.lastname, p.phone, p.address,
                    p.birthdate, p.gender, p.is_verified,
                    p.wilaya_id, w.name  AS wilaya,
                    p.commun_id, cm.name AS commune
             FROM patient p
             LEFT JOIN wilaya w  ON p.wilaya_id = w.id
             LEFT JOIN commun cm ON p.commun_id = cm.id
             WHERE p.id = ?`,
            [req.patient.id]
        );
        const u = updated[0];

        res.status(200).json({
            success: true,
            message: 'Profil mis à jour',
            data: {
                id:        u.id,
                firstName: u.firstname,
                lastName:  u.lastname,
                phone:     u.phone,
                address:   u.address,
                birthDate: u.birthdate,
                gender:    u.gender,
                wilayaId:  u.wilaya_id,
                wilaya:    u.wilaya,
                communId:  u.commun_id,
                commune:   u.commune
            }
        });
    } catch (error) {
        console.error('updateMyProfile error:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour du profil' });
    }
};

// ─── CANCEL APPOINTMENT ───────────────────────────────────────────────────────

export const cancelAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const patientId = req.patient.id;

        const [rows] = await pool.query(
            'SELECT id, status FROM appointments WHERE id = ? AND patient_id = ?',
            [id, patientId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Rendez-vous introuvable ou non autorisé' });
        }
        if (rows[0].status === 'annule') {
            return res.status(400).json({ success: false, message: 'Rendez-vous déjà annulé' });
        }

        await pool.query(
            "UPDATE appointments SET status = 'annule' WHERE id = ? AND patient_id = ?",
            [id, patientId]
        );

        res.status(200).json({ success: true, message: 'Rendez-vous annulé' });
    } catch (error) {
        console.error('cancelAppointment error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

// ─── AVAILABLE SLOTS ──────────────────────────────────────────────────────────

export const getDoctorAvailableSlots = async (req, res) => {
    try {
        const { doctorId, date } = req.query;
        if (!doctorId || !date) {
            return res.status(400).json({ success: false, message: 'doctorId et date sont requis' });
        }

        const [doctorRows] = await pool.query(
            'SELECT is_reservation_online FROM doctor WHERE id = ?', [doctorId]
        );
        if (doctorRows.length === 0 || !doctorRows[0].is_reservation_online) {
            return res.status(200).json({ success: true, data: [] });
        }

        const [year, month, day] = date.split('-').map(Number);
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayOfWeek = dayNames[new Date(year, month - 1, day).getDay()];

        const [availabilities] = await pool.query(
            'SELECT start_time, end_time, slot_duration FROM availabilities WHERE doctor_id = ? AND day_of_week = ?',
            [doctorId, dayOfWeek]
        );
        if (availabilities.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        let allSlots = [];
        for (const avail of availabilities) {
            const [sH, sM] = avail.start_time.split(':').map(Number);
            const [eH, eM] = avail.end_time.split(':').map(Number);
            const dur = avail.slot_duration || 30;
            if (dur <= 0) continue;
            const endTotal = eH * 60 + eM;
            let cur = sH * 60 + sM;
            while (cur + dur <= endTotal) {
                allSlots.push(`${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`);
                cur += dur;
            }
        }

        const [booked] = await pool.query(
            `SELECT DATE_FORMAT(appointment_time, '%H:%i') AS start_time, duration_minutes
             FROM appointments
             WHERE doctor_id = ? AND appointment_date = ? AND status NOT IN ('annule', 'absent') AND appointment_time IS NOT NULL`,
            [doctorId, date]
        );

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const nowMins = now.getHours() * 60 + now.getMinutes();

        const available = allSlots.filter(slot => {
            const [h, m] = slot.split(':').map(Number);
            const slotMins = h * 60 + m;
            if (date === todayStr && slotMins < nowMins) return false;
            return !booked.some(b => {
                const [bh, bm] = b.start_time.split(':').map(Number);
                const bStart = bh * 60 + bm;
                return slotMins >= bStart && slotMins < bStart + (b.duration_minutes || 30);
            });
        });

        res.status(200).json({ success: true, data: available });
    } catch (error) {
        console.error('getDoctorAvailableSlots error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

export const deleteAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await pool.query(
            'DELETE FROM appointments WHERE id = ? AND patient_id = ?',
            [id, req.patient.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Rendez-vous introuvable' });
        }
        res.status(200).json({ success: true, message: 'Rendez-vous supprimé' });
    } catch (error) {
        console.error('deleteAppointment error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};
