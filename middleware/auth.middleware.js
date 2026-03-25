// middleware/auth.middleware.js
import jwt from 'jsonwebtoken';
import pool from '../database.js';

/**
 * Verify doctor JWT token.
 * Table: doctor (was: doctors)
 * No email column in new schema — uses phone.
 */
export const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Token d\'authentification manquant'
            });
        }

        const token = authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token invalide'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Updated: table is now 'doctor' (was 'doctors'), column phone (no email)
        const [doctors] = await pool.query(
            'SELECT id, phone FROM doctor WHERE id = ?',
            [decoded.doctorId]
        );

        if (doctors.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Médecin non trouvé'
            });
        }

        req.doctor = {
            doctorId: doctors[0].id,
            phone: doctors[0].phone
        };

        next();

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expiré' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: 'Token invalide' });
        }
        console.error('Erreur middleware auth:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Optional doctor auth — does not block if no token.
 */
export const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.split(' ')[1];
        if (!token) return next();

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [doctors] = await pool.query(
            'SELECT id, phone FROM doctor WHERE id = ?',
            [decoded.doctorId]
        );

        if (doctors.length > 0) {
            req.doctor = {
                doctorId: doctors[0].id,
                phone: doctors[0].phone
            };
        }

        next();
    } catch (error) {
        next(); // continue silently on error
    }
};

/**
 * Verify patient JWT token.
 * Table: patient (was: patient_users)
 * No email in new schema.
 */
export const verifyPatientToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Non autorisé' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.role !== 'patient') {
            return res.status(403).json({ success: false, message: 'Patients uniquement' });
        }

        // Updated: table is now 'patient' (was 'patient_users')
        const [users] = await pool.query(
            'SELECT id, phone FROM patient WHERE id = ?',
            [decoded.patientId]
        );

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Utilisateur non trouvé' });
        }

        req.patient = { id: users[0].id, phone: users[0].phone };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Session invalide' });
    }
};