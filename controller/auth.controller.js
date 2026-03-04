import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../database.js';

export const signUp = async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            firstName,
            lastName,
            email,
            password,
            phone,
            specialty,
            cabinetName,
            cabinetAddress,
            schedule
        } = req.body;

        // Validation des champs requis
        if (!firstName || !lastName || !email || !password || !phone || !cabinetName || !cabinetAddress) {
            return res.status(400).json({
                success: false,
                message: 'Tous les champs obligatoires doivent être remplis'
            });
        }

        // Validation du format email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Format d\'email invalide'
            });
        }

        // Validation du mot de passe
        const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({
                success: false,
                message: 'Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre'
            });
        }

        // Vérifier si l'email existe déjà
        const [existingDoctors] = await connection.query(
            'SELECT id FROM doctors WHERE email = ?',
            [email]
        );

        if (existingDoctors.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Cet email est déjà utilisé'
            });
        }

        // Hash du mot de passe
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Créer le médecin
        const [result] = await connection.query(
            `INSERT INTO doctors 
            (email, password, first_name, last_name, phone, specialty) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [email, passwordHash, firstName, lastName, phone, specialty]
        );

        const doctorId = result.insertId;

        // Structure par défaut si le planning n'est pas fourni
        const defaultSchedule = {
            monday: { isOpen: true, start: "09:00", end: "17:00" },
            tuesday: { isOpen: true, start: "09:00", end: "17:00" },
            wednesday: { isOpen: true, start: "09:00", end: "12:00" },
            thursday: { isOpen: true, start: "09:00", end: "17:00" },
            friday: { isOpen: true, start: "09:00", end: "17:00" },
            saturday: { isOpen: false, start: "09:00", end: "12:00" },
            sunday: { isOpen: false, start: "", end: "" }
        };

        // Créer le cabinet avec le planning
        await connection.query(
            `INSERT INTO cabinets (doctor_id, name, address, schedule) VALUES (?, ?, ?, ?)`,
            [doctorId, cabinetName, cabinetAddress, JSON.stringify(schedule || defaultSchedule)]
        );

        await connection.commit();

        // Générer un token JWT
        const token = jwt.sign(
            {
                doctorId: doctorId,
                email: email
            },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            message: 'Compte créé avec succès',
            data: {
                doctorId: doctorId,
                email: email,
                firstName: firstName,
                lastName: lastName,
                phone: phone,
                specialty: specialty,
                cabinetName: cabinetName,
                cabinetAddress: cabinetAddress,
                schedule: schedule || defaultSchedule,
                token: token
            }
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Erreur lors de l\'inscription:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création du compte',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
};


export const signIn = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // Validation des champs
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email et mot de passe requis'
            });
        }

        // Récupérer le médecin
        const [doctors] = await pool.query(
            `SELECT 
                d.id, 
                d.email, 
                d.password, 
                d.first_name, 
                d.last_name,
                d.phone,
                d.specialty,
                d.created_at,
                c.name as cabinet_name,
                c.address as cabinet_address,
                c.id as cabinet_id,
                c.schedule as cabinet_schedule
            FROM doctors d
            LEFT JOIN cabinets c ON d.id = c.doctor_id
            WHERE d.email = ?`,
            [email]
        );

        if (doctors.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Email ou mot de passe incorrect'
            });
        }

        const doctor = doctors[0];

        // Vérifier le mot de passe
        const isPasswordValid = await bcrypt.compare(password, doctor.password);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Email ou mot de passe incorrect'
            });
        }

        // Générer un token JWT
        const token = jwt.sign(
            {
                doctorId: doctor.id,
                email: doctor.email
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(200).json({
            success: true,
            message: 'Connexion réussie',
            data: {
                doctorId: doctor.id,
                email: doctor.email,
                firstName: doctor.first_name,
                lastName: doctor.last_name,
                phone: doctor.phone,
                specialty: doctor.specialty,
                cabinetName: doctor.cabinet_name,
                cabinetAddress: doctor.cabinet_address,
                cabinetId: doctor.cabinet_id,
                schedule: typeof doctor.cabinet_schedule === 'string'
                    ? JSON.parse(doctor.cabinet_schedule)
                    : doctor.cabinet_schedule,
                createdAt: doctor.created_at,
                token: token
            }
        });

    } catch (error) {
        console.error('Erreur lors de la connexion:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la connexion',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


export const signOut = async (req, res, next) => {
    try {
        res.status(200).json({
            success: true,
            message: 'Déconnexion réussie'
        });

    } catch (error) {
        console.error('Erreur lors de la déconnexion:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la déconnexion',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


export const getCurrentDoctor = async (req, res, next) => {
    try {
        const doctorId = req.doctor.doctorId;

        const [doctors] = await pool.query(
            `SELECT 
                d.id, 
                d.email, 
                d.first_name, 
                d.last_name,
                d.phone,
                d.specialty,
                d.created_at,
                d.updated_at,
                c.name as cabinet_name,
                c.address as cabinet_address,
                c.id as cabinet_id,
                c.schedule as cabinet_schedule
            FROM doctors d
            LEFT JOIN cabinets c ON d.id = c.doctor_id
            WHERE d.id = ?`,
            [doctorId]
        );

        if (doctors.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Médecin non trouvé'
            });
        }

        const doctor = doctors[0];

        res.status(200).json({
            success: true,
            data: {
                doctorId: doctor.id,
                email: doctor.email,
                firstName: doctor.first_name,
                lastName: doctor.last_name,
                phone: doctor.phone,
                specialty: doctor.specialty,
                createdAt: doctor.created_at,
                updatedAt: doctor.updated_at,
                cabinetName: doctor.cabinet_name,
                cabinetAddress: doctor.cabinet_address,
                cabinetId: doctor.cabinet_id,
                schedule: typeof doctor.cabinet_schedule === 'string'
                    ? JSON.parse(doctor.cabinet_schedule)
                    : doctor.cabinet_schedule
            }
        });

    } catch (error) {
        console.error('Erreur lors de la récupération du médecin:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};