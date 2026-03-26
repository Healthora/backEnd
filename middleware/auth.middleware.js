// middleware/auth.middleware.js
import jwt from 'jsonwebtoken';
import pool from '../database.js';

export const verifyDoctorToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Token d\'authentification manquant' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, message: 'Token invalide' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [doctors] = await pool.query('SELECT id, phone FROM doctor WHERE id = ?', [decoded.doctorId]);
        if (doctors.length === 0) return res.status(401).json({ success: false, message: 'Médecin non trouvé' });

        req.doctor = { doctorId: doctors[0].id, phone: doctors[0].phone };
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Token expiré' });
        if (error.name === 'JsonWebTokenError') return res.status(401).json({ success: false, message: 'Token invalide' });
        console.error('Erreur middleware doctor auth:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

export const verifyPatientToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Token d\'authentification manquant' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, message: 'Token invalide' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded.patientId) return res.status(401).json({ success: false, message: 'Pas un patient token' });

        const [patients] = await pool.query('SELECT id, phone FROM patient WHERE id = ?', [decoded.patientId]);
        if (patients.length === 0) return res.status(401).json({ success: false, message: 'Patient non trouvé' });

        req.patient = { patientId: patients[0].id, phone: patients[0].phone };
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Token expiré' });
        if (error.name === 'JsonWebTokenError') return res.status(401).json({ success: false, message: 'Token invalide' });
        console.error('Erreur middleware patient auth:', error);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
};

// Original generic name for backward compatibility or replacement
export const verifyToken = verifyDoctorToken;

export const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

        const token = authHeader.split(' ')[1];
        if (!token) return next();

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.doctorId) {
            const [doctors] = await pool.query('SELECT id, phone FROM doctor WHERE id = ?', [decoded.doctorId]);
            if (doctors.length > 0) req.doctor = { doctorId: doctors[0].id, phone: doctors[0].phone };
        } else if (decoded.patientId) {
            const [patients] = await pool.query('SELECT id, phone FROM patient WHERE id = ?', [decoded.patientId]);
            if (patients.length > 0) req.patient = { patientId: patients[0].id, phone: patients[0].phone };
        }

        next();
    } catch (error) {
        next();
    }
};

