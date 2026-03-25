import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../database.js';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const signToken = (payload, expiresIn = process.env.JWT_EXPIRES_IN || '7d') =>
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

// ─── DOCTOR AUTH ──────────────────────────────────────────────────────────────

/**
 * POST /auth/signup
 * New schema:
 *  - table: doctor (firstname, lastname, phone, password, is_reservation_online)
 *  - specialty via doctor_speciality join table
 *  - cabinet stores wilaya_id and commun_id as foreign keys (not strings)
 */
export const signUp = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            firstName,
            lastName,
            phone,
            password,
            specialtyId,
            cabinetName,
            wilayaId,
            communId,
            cabinetAddress
        } = req.body;

        // Required field validation
        if (!firstName || !lastName || !phone || !password || !cabinetName || !wilayaId || !communId || !cabinetAddress) {
            return res.status(400).json({
                success: false,
                message: 'Tous les champs obligatoires doivent être remplis'
            });
        }

        // Password strength
        if (!passwordRegex.test(password)) {
            return res.status(400).json({
                success: false,
                message: 'Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre'
            });
        }

        // Phone uniqueness check
        const [existing] = await connection.query(
            'SELECT id FROM doctor WHERE phone = ?', [phone]
        );
        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Ce numéro de téléphone est déjà utilisé'
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        // Insert doctor (new field names)
        const [doctorResult] = await connection.query(
            `INSERT INTO doctor (firstname, lastname, phone, password, is_reservation_online)
             VALUES (?, ?, ?, ?, 0)`,
            [firstName, lastName, phone, passwordHash]
        );
        const doctorId = doctorResult.insertId;

        // Link specialty via doctor_speciality
        if (specialtyId) {
            await connection.query(
                `INSERT INTO doctor_speciality (doctor_id, speciality_id) VALUES (?, ?)`,
                [doctorId, specialtyId]
            );
        }

        // Insert cabinet with FK ids (not string names)
        await connection.query(
            `INSERT INTO cabinet (doctor_id, name, wilaya_id, commun_id, address)
             VALUES (?, ?, ?, ?, ?)`,
            [doctorId, cabinetName, wilayaId, communId, cabinetAddress]
        );

        await connection.commit();

        // Fetch names for response
        let specialtyName = '';
        if (specialtyId) {
            const [sp] = await pool.query('SELECT name FROM speciality WHERE id = ?', [specialtyId]);
            specialtyName = sp[0]?.name || '';
        }
        const [wRow] = await pool.query('SELECT name FROM wilaya WHERE id = ?', [wilayaId]);
        const [cRow] = await pool.query('SELECT name FROM commun WHERE id = ?', [communId]);

        const token = signToken({ doctorId, phone });

        res.status(201).json({
            success: true,
            message: 'Compte créé avec succès',
            data: {
                doctorId,
                firstName,
                lastName,
                phone,
                specialty: specialtyName,
                specialtyId: specialtyId ? parseInt(specialtyId) : null,
                cabinetName,
                wilayaId: parseInt(wilayaId),
                wilaya: wRow[0]?.name || '',
                communId: parseInt(communId),
                commune: cRow[0]?.name || '',
                cabinetAddress,
                onlineBooking: false,
                token
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création du compte',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
};

/**
 * POST /auth/signin
 * Phone-only auth (no email in new doctor table).
 */
export const signIn = async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({
                success: false,
                message: 'Téléphone et mot de passe requis'
            });
        }

        const [doctors] = await pool.query(
            `SELECT
                d.id, d.firstname, d.lastname, d.phone, d.password,
                d.is_reservation_online, d.bio, d.img_url, d.is_verified, d.created_at,
                ds.speciality_id,
                s.name  AS specialty,
                c.id    AS cabinet_id,
                c.name  AS cabinet_name,
                c.address AS cabinet_address,
                c.wilaya_id,
                w.name  AS wilaya,
                c.commun_id,
                cm.name AS commune
            FROM doctor d
            LEFT JOIN doctor_speciality ds ON d.id = ds.doctor_id
            LEFT JOIN speciality s         ON ds.speciality_id = s.id
            LEFT JOIN cabinet c            ON d.id = c.doctor_id
            LEFT JOIN wilaya w             ON c.wilaya_id = w.id
            LEFT JOIN commun cm            ON c.commun_id = cm.id
            WHERE d.phone = ?`,
            [phone]
        );

        if (doctors.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Téléphone ou mot de passe incorrect'
            });
        }

        const doctor = doctors[0];
        const isValid = await bcrypt.compare(password, doctor.password);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'Téléphone ou mot de passe incorrect'
            });
        }

        const token = signToken({ doctorId: doctor.id, phone: doctor.phone });

        res.status(200).json({
            success: true,
            message: 'Connexion réussie',
            data: {
                doctorId: doctor.id,
                firstName: doctor.firstname,
                lastName: doctor.lastname,
                phone: doctor.phone,
                specialty: doctor.specialty || '',
                specialtyId: doctor.speciality_id || null,
                bio: doctor.bio || '',
                imgUrl: doctor.img_url || '',
                isVerified: doctor.is_verified === 1,
                cabinetId: doctor.cabinet_id || null,
                cabinetName: doctor.cabinet_name || '',
                cabinetAddress: doctor.cabinet_address || '',
                wilayaId: doctor.wilaya_id || null,
                wilaya: doctor.wilaya || '',
                communId: doctor.commun_id || null,
                commune: doctor.commune || '',
                onlineBooking: doctor.is_reservation_online === 1,
                createdAt: doctor.created_at,
                token
            }
        });
    } catch (error) {
        console.error('Signin error:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la connexion',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * POST /auth/signout
 */
export const signOut = async (req, res) => {
    res.status(200).json({ success: true, message: 'Déconnexion réussie' });
};

/**
 * GET /auth/me
 * Returns current doctor profile.
 */
export const getCurrentDoctor = async (req, res) => {
    try {
        const doctorId = req.doctor.doctorId;

        const [doctors] = await pool.query(
            `SELECT
                d.id, d.firstname, d.lastname, d.phone,
                d.is_reservation_online, d.bio, d.img_url, d.is_verified, d.created_at,
                ds.speciality_id,
                s.name  AS specialty,
                c.id    AS cabinet_id,
                c.name  AS cabinet_name,
                c.address AS cabinet_address,
                c.wilaya_id,
                w.name  AS wilaya,
                c.commun_id,
                cm.name AS commune
            FROM doctor d
            LEFT JOIN doctor_speciality ds ON d.id = ds.doctor_id
            LEFT JOIN speciality s         ON ds.speciality_id = s.id
            LEFT JOIN cabinet c            ON d.id = c.doctor_id
            LEFT JOIN wilaya w             ON c.wilaya_id = w.id
            LEFT JOIN commun cm            ON c.commun_id = cm.id
            WHERE d.id = ?`,
            [doctorId]
        );

        if (doctors.length === 0) {
            return res.status(404).json({ success: false, message: 'Médecin non trouvé' });
        }

        const [availabilities] = await pool.query(
            'SELECT day_of_week, start_time, end_time, selectione_les_jours_a_la_vance, selectione_les_number_of_appoi_by_day FROM availability WHERE doctor_id = ?',
            [doctorId]
        );

        const schedule = {
            sunday: { isOpen: false, slots: [] },
            monday: { isOpen: false, slots: [] },
            tuesday: { isOpen: false, slots: [] },
            wednesday: { isOpen: false, slots: [] },
            thursday: { isOpen: false, slots: [] },
            friday: { isOpen: false, slots: [] },
            saturday: { isOpen: false, slots: [] }
        };

        availabilities.forEach(av => {
            const day = av.day_of_week.toLowerCase();
            if (schedule[day]) {
                schedule[day].isOpen = true;
                schedule[day].maxAppointmentsPerDay = av.selectione_les_number_of_appoi_by_day || 0;
                schedule[day].slots.push({
                    start: av.start_time.substring(0, 5),
                    end: av.end_time.substring(0, 5)
                });
            }
        });

        const d = doctors[0];
        res.status(200).json({
            success: true,
            data: {
                doctorId: d.id,
                firstName: d.firstname,
                lastName: d.lastname,
                phone: d.phone,
                specialty: d.specialty || '',
                specialtyId: d.speciality_id || null,
                bio: d.bio || '',
                imgUrl: d.img_url || '',
                isVerified: d.is_verified === 1,
                cabinetId: d.cabinet_id || null,
                cabinetName: d.cabinet_name || '',
                cabinetAddress: d.cabinet_address || '',
                wilayaId: d.wilaya_id || null,
                wilaya: d.wilaya || '',
                communId: d.commun_id || null,
                commune: d.commune || '',
                onlineBooking: d.is_reservation_online === 1,
                advanceBookingDays: availabilities.length > 0 ? availabilities[0].selectione_les_jours_a_la_vance : 0,
                schedule: schedule,
                createdAt: d.created_at
            }
        });

    } catch (error) {
        console.error('getCurrentDoctor error:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ─── PATIENT AUTH ─────────────────────────────────────────────────────────────

/**
 * POST /auth/patient/signup
 * Table: patient (was patient_users)
 * Fields: firstname, lastname, birthdate (no email)
 */
export const patientSignUp = async (req, res) => {
    try {
        const { firstName, lastName, phone, password, address, birthDate, gender, wilayaId, communId } = req.body;

        if (!firstName || !lastName || !phone || !password) {
            return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
        }

        if (!passwordRegex.test(password)) {
            return res.status(400).json({
                success: false,
                message: 'Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre'
            });
        }

        const [existing] = await pool.query('SELECT id FROM patient WHERE phone = ?', [phone]);
        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: 'Ce numéro est déjà utilisé' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            `INSERT INTO patient (firstname, lastname, phone, password, address, birthdate, gender, wilaya_id, commun_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [firstName, lastName, phone, passwordHash, address || null, birthDate || null, gender || 'male', wilayaId || null, communId || null]
        );

        const patientId = result.insertId;
        const token = signToken({ patientId, phone, role: 'patient' }, '30d');

        res.status(201).json({
            success: true,
            message: 'Compte patient créé',
            token,
            patient: { id: patientId, firstName, lastName, phone, wilayaId, communId }
        });

    } catch (error) {
        console.error('patientSignUp error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

/**
 * POST /auth/patient/signin
 */
export const patientSignIn = async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({ success: false, message: 'Téléphone et mot de passe requis' });
        }

        const [users] = await pool.query(
            `SELECT p.*, w.name AS wilaya_name, cm.name AS commun_name
             FROM patient p
             LEFT JOIN wilaya w  ON p.wilaya_id = w.id
             LEFT JOIN commun cm ON p.commun_id = cm.id
             WHERE p.phone = ?`,
            [phone]
        );

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Identifiants invalides' });
        }

        const user = users[0];
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Identifiants invalides' });
        }

        const token = signToken({ patientId: user.id, phone: user.phone, role: 'patient' }, '30d');

        res.status(200).json({
            success: true,
            token,
            patient: {
                id: user.id,
                firstName: user.firstname,
                lastName: user.lastname,
                phone: user.phone,
                address: user.address,
                birthDate: user.birthdate,
                gender: user.gender,
                wilayaId: user.wilaya_id,
                wilaya: user.wilaya_name,
                communId: user.commun_id,
                commune: user.commun_name,
                isVerified: user.is_verified === 1
            }
        });

    } catch (error) {
        console.error('patientSignIn error:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

// ─── PASSWORD RESET (DISABLED — schema columns missing) ───────────────────────
// The new doctor/patient tables do NOT have: email, reset_token, reset_token_expires
// These endpoints return 501 until those columns are added to the DB.

export const forgotPassword = async (req, res) => {
    res.status(501).json({
        success: false,
        message: 'Réinitialisation par email non disponible. Les colonnes email/reset_token sont absentes du schéma actuel.'
    });
};

export const resetPassword = async (req, res) => {
    res.status(501).json({ success: false, message: 'Fonctionnalité non disponible.' });
};

export const patientForgotPassword = async (req, res) => {
    res.status(501).json({
        success: false,
        message: 'Réinitialisation par email non disponible dans le schéma actuel.'
    });
};

export const patientResetPassword = async (req, res) => {
    res.status(501).json({ success: false, message: 'Fonctionnalité non disponible.' });
};