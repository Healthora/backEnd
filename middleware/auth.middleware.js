// middleware/auth.middleware.js
import jwt from 'jsonwebtoken';
import pool from '../database.js';


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
