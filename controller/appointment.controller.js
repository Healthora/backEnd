import pool from '../database.js';

/**
 * Appointment controller — Refactored for new schema:
 * - Table: 'appointment' (singular)
 * - Columns: start_time, duration, note_doctor, note_patient
 * - Status: 'en attente', 'confirmé', 'annulé', 'passé', 'absent'
 */

// ─── CREATE APPOINTMENT ───────────────────────────────────────────────────────

export const createAppointment = async (req, res) => {
    try {
        const {
            patient_id,
            cabinet_id,
            appointment_date,
            start_time,
            duration,
            visit_type,
            note_doctor,
            is_external_user
        } = req.body;
        const doctor_id = req.doctor.doctorId;

        if (!patient_id || !appointment_date || !visit_type) {
            return res.status(400).json({
                success: false,
                message: 'Veuillez remplir tous les champs obligatoires'
            });
        }

        const validStatuses = ['en attente', 'confirmé', 'annulé', 'passé', 'absent'];
        const finalStatus = (req.body.status && validStatuses.includes(req.body.status))
            ? req.body.status
            : 'en attente';

        // 2. Constraints Check
        const dObj = new Date(appointment_date);
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayOfWeek = dayNames[dObj.getDay()];

        const [avail] = await pool.query(
            'SELECT selectione_les_jours_a_la_vance, selectione_les_number_of_appoi_by_day FROM availability WHERE doctor_id = ? AND day_of_week = ? LIMIT 1',
            [doctor_id, dayOfWeek]
        );

        if (avail.length > 0) {
            const row = avail[0];
            
            // Advance Booking Range
            if (row.selectione_les_jours_a_la_vance > 0) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil((dObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays > row.selectione_les_jours_a_la_vance) {
                    return res.status(400).json({ success: false, message: `Hors délai : Réservation possible jusqu'à ${row.selectione_les_jours_a_la_vance} jours à l'avance.` });
                }
            }

            // Max Appointments per Day
            if (row.selectione_les_number_of_appoi_by_day > 0) {
                const [countRows] = await pool.query(
                    "SELECT COUNT(*) as count FROM appointment WHERE doctor_id = ? AND appointment_date = ? AND status NOT IN ('annulé', 'absent')",
                    [doctor_id, appointment_date]
                );
                if (countRows[0].count >= row.selectione_les_number_of_appoi_by_day) {
                    return res.status(400).json({ success: false, message: "Nombre maximum de rendez-vous pour cette journée déjà atteint." });
                }
            }
        }

        // 3. Ensure patient_doctor link exists
        const [link] = await pool.query(
            'SELECT id FROM patient_doctor WHERE patient_id = ? AND doctor_id = ?',
            [patient_id, doctor_id]
        );
        if (link.length === 0) {
            await pool.query(
                'INSERT INTO patient_doctor (patient_id, doctor_id) VALUES (?, ?)',
                [patient_id, doctor_id]
            );
        }

        // Anti-double booking check
        if (start_time) {
            const [conflict] = await pool.query(
                `SELECT id FROM appointment
                 WHERE doctor_id = ? AND appointment_date = ? AND start_time = ?
                 AND status NOT IN ('annulé', 'absent')`,
                [doctor_id, appointment_date, start_time]
            );
            if (conflict.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Ce créneau est déjà réservé.'
                });
            }
        }

        const [result] = await pool.query(
            `INSERT INTO appointment
             (doctor_id, patient_id, appointment_date, start_time, duration, status, note_doctor)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [doctor_id, patient_id, appointment_date,
                start_time || null, duration || 30, finalStatus, note_doctor || '']
        );

        res.status(201).json({
            success: true,
            message: 'Rendez-vous créé avec succès',
            data: { id: result.insertId, ...req.body, status: finalStatus }
        });

    } catch (error) {
        console.error('createAppointment error:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création du rendez-vous',
            error: error.message
        });
    }
};

// ─── GET APPOINTMENTS ─────────────────────────────────────────────────────────

export const getAppointments = async (req, res) => {
    try {
        const { doctorId } = req.params;

        if (parseInt(doctorId, 10) !== req.doctor.doctorId) {
            return res.status(403).json({
                success: false,
                message: 'Non autorisé'
            });
        }

        const [appointments] = await pool.query(
            `SELECT
                a.id, a.doctor_id, a.patient_id,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
                DATE_FORMAT(a.start_time, '%H:%i')         AS start_time,
                a.duration, a.status, a.note_doctor, a.created_at,
                p.firstname  AS patient_first_name,
                p.lastname   AS patient_last_name,
                p.phone      AS patient_phone,
                p.gender     AS patient_gender
             FROM appointment a
             JOIN patient p ON a.patient_id = p.id
             WHERE a.doctor_id = ?
             ORDER BY a.appointment_date DESC, a.start_time ASC`,
            [doctorId]
        );

        res.status(200).json({ success: true, data: appointments });

    } catch (error) {
        console.error('getAppointments error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur', error: error.message });
    }
};

// ─── UPDATE APPOINTMENT STATUS ────────────────────────────────────────────────

export const updateAppointmentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['en attente', 'confirmé', 'annulé', 'passé', 'absent'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Statut invalide' });
        }

        const [result] = await pool.query(
            'UPDATE appointment SET status = ? WHERE id = ? AND doctor_id = ?',
            [status, id, req.doctor.doctorId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Rendez-vous non trouvé' });
        }

        res.status(200).json({ success: true, message: 'Statut mis à jour' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur', error: error.message });
    }
};

// ─── UPDATE APPOINTMENT ───────────────────────────────────────────────────────

export const updateAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            patient_id, appointment_date, start_time,
            duration, status, note_doctor
        } = req.body;
        const doctor_id = req.doctor.doctorId;

        const updates = [];
        const values = [];

        if (patient_id) { updates.push('patient_id = ?'); values.push(patient_id); }
        if (appointment_date) { updates.push('appointment_date = ?'); values.push(appointment_date); }
        if (start_time) { updates.push('start_time = ?'); values.push(start_time); }
        if (duration) { updates.push('duration = ?'); values.push(duration); }
        if (status) { updates.push('status = ?'); values.push(status); }
        if (note_doctor) { updates.push('note_doctor = ?'); values.push(note_doctor); }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'Pas de données' });
        }

        values.push(id, doctor_id);
        const [result] = await pool.query(
            `UPDATE appointment SET ${updates.join(', ')} WHERE id = ? AND doctor_id = ?`, values
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Non trouvé' });
        }

        res.status(200).json({ success: true, message: 'Mis à jour' });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ─── DELETE APPOINTMENT ───────────────────────────────────────────────────────

export const deleteAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await pool.query(
            'DELETE FROM appointment WHERE id = ? AND doctor_id = ?',
            [id, req.doctor.doctorId]
        );
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Non trouvé' });
        res.status(200).json({ success: true, message: 'Supprimé' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ─── GET APPOINTMENTS BY PATIENT ──────────────────────────────────────────────

export const getAppointmentsByPatient = async (req, res) => {
    try {
        const { patientId } = req.params;
        const [rows] = await pool.query(
            `SELECT id, doctor_id, patient_id, 
                    DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date,
                    DATE_FORMAT(start_time, '%H:%i') AS start_time,
                    status, note_doctor
             FROM appointment
             WHERE patient_id = ? AND doctor_id = ?
             ORDER BY appointment_date DESC`,
            [patientId, req.doctor.doctorId]
        );
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// ─── GET AVAILABLE SLOTS ──────────────────────────────────────────────────────

export const getAvailableSlots = async (req, res) => {
    try {
        const { date } = req.query;
        const doctorId = req.doctor.doctorId;

        if (!date) return res.status(400).json({ success: false, message: 'Date requise' });

        const dObj = new Date(date);
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayOfWeek = dayNames[dObj.getDay()];

        const [availabilities] = await pool.query(
            'SELECT start_time, end_time, slot_duration, selectione_les_jours_a_la_vance, selectione_les_number_of_appoi_by_day FROM availability WHERE doctor_id = ? AND day_of_week = ?',
            [doctorId, dayOfWeek]
        );

        if (availabilities.length === 0) return res.status(200).json({ success: true, data: [] });

        // 1. Check max days in advance
        const advanceDays = availabilities[0].selectione_les_jours_a_la_vance || 0;
        if (advanceDays > 0) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diffTime = dObj.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > advanceDays) {
                return res.status(200).json({ 
                    success: true, 
                    data: [], 
                    message: `Réservation autorisée uniquement jusqu'à ${advanceDays} jours à l'avance.` 
                });
            }
        }

        let allSlots = [];
        for (const avail of availabilities) {
            const [sH, sM] = avail.start_time.split(':').map(Number);
            const [eH, eM] = avail.end_time.split(':').map(Number);
            const dur = avail.slot_duration || 30;
            const endTotal = eH * 60 + eM;
            let cur = sH * 60 + sM;
            while (cur + dur <= endTotal) {
                allSlots.push(`${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`);
                cur += dur;
            }
        }

        const [booked] = await pool.query(
            `SELECT DATE_FORMAT(start_time, '%H:%i') AS start_time, duration
             FROM appointment
             WHERE doctor_id = ? AND appointment_date = ?
             AND status NOT IN ('annulé', 'absent')`,
            [doctorId, date]
        );

        // 2. Check max appointments per day
        const maxPerDay = availabilities[0].selectione_les_number_of_appoi_by_day || 0;
        if (maxPerDay > 0 && booked.length >= maxPerDay) {
            return res.status(200).json({ 
                success: true, 
                data: [], 
                message: "Journée complète (Nombre maximum de rendez-vous atteint)." 
            });
        }

        const available = allSlots.filter(slot => {
            const [h, m] = slot.split(':').map(Number);
            const slotMins = h * 60 + m;
            return !booked.some(b => {
                const [bh, bm] = b.start_time.split(':').map(Number);
                const bStart = bh * 60 + bm;
                return slotMins >= bStart && slotMins < bStart + (b.duration || 30);
            });
        });

        res.status(200).json({ success: true, data: available });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};