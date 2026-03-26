import jwt from 'jsonwebtoken';
import pool from '../database.js';

const signToken = (payload, expiresIn = process.env.JWT_EXPIRES_IN || '30d') =>
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

/**
 * Check if a patient exists by phone number
 * POST /patient-auth/check-phone
 */
export const checkPhone = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Le numéro de téléphone est requis'
            });
        }

        const [patients] = await pool.query(
            'SELECT id, firstname, lastname, phone, is_verified FROM patient WHERE phone = ?',
            [phone]
        );

        if (patients.length > 0) {
            return res.status(200).json({
                success: true,
                exists: true,
                message: 'Patient trouvé',
                data: patients[0]
            });
        } else {
            return res.status(200).json({
                success: true,
                exists: false,
                message: 'Patient non trouvé'
            });
        }
    } catch (error) {
        console.error('Check phone error:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la vérification du téléphone',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Mock OTP verification
 * POST /patient-auth/verify-otp
 */
export const verifyOtp = async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Téléphone et OTP requis'
            });
        }

        // For now, accept any OTP
        const [patients] = await pool.query(
            'SELECT * FROM patient WHERE phone = ?',
            [phone]
        );

        if (patients.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Patient non trouvé'
            });
        }

        const patient = patients[0];
        const token = signToken({ patientId: patient.id, phone: patient.phone, role: 'patient' });

        res.status(200).json({
            success: true,
            message: 'Connexion réussie',
            data: {
                ...patient,
                token
            }
        });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la vérification de l\'OTP',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Patient Signup
 * POST /patient-auth/signup
 */
export const patientSignUp = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            firstname,
            lastname,
            phone,
            wilaya_id,
            commun_id,
            address,
            birthdate,
            gender
        } = req.body;

        // Required field validation
        if (!firstname || !lastname || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Le prénom, le nom et le téléphone sont requis'
            });
        }

        // Phone uniqueness check
        const [existing] = await connection.query(
            'SELECT id FROM patient WHERE phone = ?', [phone]
        );
        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Ce numéro de téléphone est déjà utilisé'
            });
        }

        // Insert patient
        const [result] = await connection.query(
            `INSERT INTO patient (firstname, lastname, phone, wilaya_id, commun_id, address, birthdate, gender, is_verified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [firstname, lastname, phone, wilaya_id, commun_id, address, birthdate, gender]
        );

        const patientId = result.insertId;
        await connection.commit();

        const token = signToken({ patientId, phone, role: 'patient' });

        res.status(201).json({
            success: true,
            message: 'Compte créé avec succès',
            data: {
                id: patientId,
                firstname,
                lastname,
                phone,
                wilaya_id,
                commun_id,
                address,
                birthdate,
                gender,
                token
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Patient signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création du compte',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        connection.release();
    }
};
