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

        // Extraire le token
        const token = authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token invalide'
            });
        }

        // Vérifier le token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Vérifier si le médecin existe toujours
        const [doctors] = await pool.query(
            'SELECT id, email FROM doctors WHERE id = ?',
            [decoded.doctorId]
        );

        if (doctors.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Médecin non trouvé'
            });
        }

        const doctor = doctors[0];

        // Ajouter les informations du médecin à la requête
        req.doctor = {
            doctorId: doctor.id,
            email: doctor.email
        };

        next();

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expiré'
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Token invalide'
            });
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
            // Pas de token, on continue sans authentification
            return next();
        }

        const token = authHeader.split(' ')[1];

        if (!token) {
            return next();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [doctors] = await pool.query(
            'SELECT id, email FROM doctors WHERE id = ?',
            [decoded.doctorId]
        );

        if (doctors.length > 0) {
            req.doctor = {
                doctorId: doctors[0].id,
                email: doctors[0].email
            };
        }

        next();

    } catch (error) {
        // En cas d'erreur, on continue sans authentification
        next();
    }
};

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
        const [users] = await pool.query('SELECT id, email FROM patient_users WHERE id = ?', [decoded.patientId]);
        if (users.length === 0) return res.status(401).json({ success: false, message: 'Utilisateur non trouvé' });
        req.patient = { id: users[0].id, email: users[0].email };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Session invalide' });
    }
};