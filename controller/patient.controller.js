import pool from "../database.js";

/**
 * Patient management for doctors.
 *
 * Architecture change (new schema):
 *  - Old: 'patients' was a per-doctor CRM table (doctor_id, first_name, last_name, ...)
 *  - New: 'patient' is a shared table (all app users), linked via 'patient_doctor' join table
 *
 * Column renames: firstname (was first_name), lastname (was last_name), birthdate (was birth_date)
 * No email column in new patient table.
 */

// ─── SEARCH ALL APP PATIENTS ────────────────────────────────────────────────
export const searchAppUsers = async (req, res, next) => {
    try {
        const searchTerm = req.query.search || '';
        if (searchTerm.length < 2) {
            return res.status(200).json({ success: true, data: [] });
        }

        const like = `%${searchTerm}%`;
        const [rows] = await pool.query(
            `SELECT p.id, p.firstname AS first_name, p.lastname AS last_name, p.phone,
                    p.address, p.birthdate AS birth_date, p.gender, p.is_verified, p.created_at,
                    w.name AS wilaya, p.wilaya_id, cm.name AS commune, p.commun_id
             FROM patient p
             LEFT JOIN wilaya w  ON p.wilaya_id = w.id
             LEFT JOIN commun cm ON p.commun_id = cm.id
             WHERE p.is_verified = 1 
               AND (p.firstname LIKE ? OR p.lastname LIKE ? OR p.phone LIKE ?)
             LIMIT 30`,
            [like, like, like]
        );

        res.status(200).json({ success: true, data: rows });
    } catch (err) {
        console.error('searchAppUsers error:', err);
        res.status(500).json({ success: false, message: 'Erreur serveur lors de la recherche globale.' });
    }
};

// ─── GET ALL PATIENTS FOR A DOCTOR ───────────────────────────────────────────

export const getAllPatient = async (req, res, next) => {
    try {
        const doctorId = req.params.id;

        if (parseInt(doctorId, 10) !== req.doctor.doctorId) {
            return res.status(403).json({
                success: false,
                message: 'Non autorisé à accéder aux patients d\'un autre médecin'
            });
        }

        const searchTerm = req.query.search || '';
        let query, queryParams;

        if (searchTerm) {
            const like = `%${searchTerm}%`;
            query = `
                SELECT
                    p.id,
                    p.firstname       AS first_name,
                    p.lastname        AS last_name,
                    p.phone,
                    p.address,
                    p.birthdate       AS birth_date,
                    p.gender,
                    p.is_verified,
                    p.created_at,
                    pd.created_at     AS linked_at,
                    w.name            AS wilaya,
                    p.wilaya_id,
                    cm.name           AS commune,
                    p.commun_id
                FROM patient_doctor pd
                JOIN patient p   ON pd.patient_id  = p.id
                LEFT JOIN wilaya w   ON p.wilaya_id = w.id
                LEFT JOIN commun cm  ON p.commun_id = cm.id
                WHERE pd.doctor_id = ?
                  AND (p.firstname LIKE ? OR p.lastname LIKE ? OR p.phone LIKE ? OR p.address LIKE ?)
                ORDER BY p.lastname ASC, p.firstname ASC
            `;
            queryParams = [doctorId, like, like, like, like];
        } else {
            query = `
                SELECT
                    p.id,
                    p.firstname       AS first_name,
                    p.lastname        AS last_name,
                    p.phone,
                    p.address,
                    p.birthdate       AS birth_date,
                    p.gender,
                    p.is_verified,
                    p.created_at,
                    pd.created_at     AS linked_at,
                    w.name            AS wilaya,
                    p.wilaya_id,
                    cm.name           AS commune,
                    p.commun_id
                FROM patient_doctor pd
                JOIN patient p   ON pd.patient_id  = p.id
                LEFT JOIN wilaya w   ON p.wilaya_id = w.id
                LEFT JOIN commun cm  ON p.commun_id = cm.id
                WHERE pd.doctor_id = ?
                ORDER BY p.lastname ASC, p.firstname ASC
            `;
            queryParams = [doctorId];
        }

        const [patients] = await pool.query(query, queryParams);

        res.status(200).json({
            success: true,
            message: 'Patients récupérés avec succès',
            data: patients
        });

    } catch (err) {
        console.error('getAllPatient error:', err);
        next(err);
    }
};

// ─── ADD / LINK PATIENT ───────────────────────────────────────────────────────

/**
 * In the new schema:
 * 1. Check if patient with this phone exists in 'patient' table.
 * 2. If yes → just create a patient_doctor link (if not already linked).
 * 3. If no  → create new patient record then link.
 */
export const addPatient = async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { firstName, lastName, phone, birthday, gender, address, wilayaId, communId } = req.body;
        const doctorId = req.doctor.doctorId;

        if (!firstName || !lastName || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Le prénom, nom et téléphone sont obligatoires'
            });
        }

        const phoneRegex = /^0[567]\d{8}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Numéro invalide — doit commencer par 05, 06 ou 07 et contenir 10 chiffres'
            });
        }

        // Check if patient already exists
        const [existingPatient] = await connection.query(
            'SELECT id FROM patient WHERE phone = ?', [phone]
        );

        let patientId;

        if (existingPatient.length > 0) {
            patientId = existingPatient[0].id;

            // Check if already linked to this doctor
            const [existingLink] = await connection.query(
                'SELECT id FROM patient_doctor WHERE patient_id = ? AND doctor_id = ?',
                [patientId, doctorId]
            );
            if (existingLink.length > 0) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: 'Ce patient est déjà dans votre liste'
                });
            }
        } else {
            // Create new patient (no email, no password — doctor-added patients start unverified)
            const [insertResult] = await connection.query(
                `INSERT INTO patient (firstname, lastname, phone, address, birthdate, gender, wilaya_id, commun_id, is_verified)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                [firstName, lastName, phone, address || null, birthday || null, (gender === 'female' || gender === 'F') ? 'female' : 'male', wilayaId || null, communId || null]
            );
            patientId = insertResult.insertId;
        }

        // Create the doctor-patient link
        await connection.query(
            'INSERT INTO patient_doctor (patient_id, doctor_id) VALUES (?, ?)',
            [patientId, doctorId]
        );

        await connection.commit();

        const [newPatient] = await pool.query(
            `SELECT p.id, p.firstname AS first_name, p.lastname AS last_name, p.phone,
                    p.address, p.birthdate AS birth_date, p.gender, p.is_verified, p.created_at,
                    w.name AS wilaya, p.wilaya_id, cm.name AS commune, p.commun_id
             FROM patient p
             LEFT JOIN wilaya w  ON p.wilaya_id = w.id
             LEFT JOIN commun cm ON p.commun_id = cm.id
             WHERE p.id = ?`,
            [patientId]
        );

        res.status(201).json({
            success: true,
            message: 'Patient ajouté avec succès',
            data: newPatient[0]
        });

    } catch (err) {
        await connection.rollback();
        console.error('addPatient error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'Ce patient existe déjà' });
        }
        next(err);
    } finally {
        connection.release();
    }
};

// ─── UPDATE PATIENT ───────────────────────────────────────────────────────────

export const updatePatient = async (req, res, next) => {
    try {
        const { patientId } = req.params;
        const { firstName, lastName, phone, birthday, gender, address, wilayaId, communId } = req.body;

        // Verify this patient is linked to the requesting doctor
        const [link] = await pool.query(
            'SELECT id FROM patient_doctor WHERE patient_id = ? AND doctor_id = ?',
            [patientId, req.doctor.doctorId]
        );
        if (link.length === 0) {
            return res.status(404).json({ success: false, message: 'Patient non trouvé' });
        }

        if (phone) {
            const phoneRegex = /^0[567]\d{8}$/;
            if (!phoneRegex.test(phone)) {
                return res.status(400).json({
                    success: false,
                    message: 'Numéro invalide — doit commencer par 05, 06 ou 07 et contenir 10 chiffres'
                });
            }
        }

        const updates = [];
        const values  = [];

        if (firstName !== undefined) { updates.push('firstname = ?'); values.push(firstName); }
        if (lastName  !== undefined) { updates.push('lastname = ?');  values.push(lastName);  }
        if (phone     !== undefined) { updates.push('phone = ?');     values.push(phone);     }
        if (birthday  !== undefined) { updates.push('birthdate = ?'); values.push(birthday || null); }
        if (gender    !== undefined) { 
            updates.push('gender = ?');    
            values.push((gender === 'female' || gender === 'F') ? 'female' : 'male'); 
        }
        if (address   !== undefined) { updates.push('address = ?');   values.push(address || null); }
        if (wilayaId  !== undefined) { updates.push('wilaya_id = ?');  values.push(wilayaId || null); }
        if (communId  !== undefined) { updates.push('commun_id = ?');  values.push(communId || null); }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'Aucune donnée à mettre à jour' });
        }

        values.push(patientId);
        await pool.query(`UPDATE patient SET ${updates.join(', ')} WHERE id = ?`, values);

        const [updated] = await pool.query(
            `SELECT p.id, p.firstname AS first_name, p.lastname AS last_name, p.phone,
                    p.address, p.birthdate AS birth_date, p.gender, p.is_verified, p.created_at,
                    w.name AS wilaya, p.wilaya_id, cm.name AS commune, p.commun_id
             FROM patient p
             LEFT JOIN wilaya w  ON p.wilaya_id = w.id
             LEFT JOIN commun cm ON p.commun_id = cm.id
             WHERE p.id = ?`,
            [patientId]
        );

        res.status(200).json({
            success: true,
            message: 'Patient mis à jour avec succès',
            data: updated[0]
        });

    } catch (err) {
        console.error('updatePatient error:', err);
        next(err);
    }
};

// ─── DELETE (UNLINK) PATIENT ──────────────────────────────────────────────────

/**
 * Removes the doctor-patient link (patient_doctor row).
 * Does NOT delete the patient account from the 'patient' table (shared resource).
 */
export const deletePatient = async (req, res, next) => {
    try {
        const { patientId } = req.params;

        const [result] = await pool.query(
            'DELETE FROM patient_doctor WHERE patient_id = ? AND doctor_id = ?',
            [patientId, req.doctor.doctorId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Patient non trouvé' });
        }

        res.status(200).json({
            success: true,
            message: 'Patient retiré de votre liste avec succès'
        });

    } catch (err) {
        console.error('deletePatient error:', err);
        next(err);
    }
};