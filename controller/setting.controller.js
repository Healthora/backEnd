import pool from '../database.js';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

const storage = multer.memoryStorage();
export const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'), false);
    }
});

const uploadToCloudinary = (buffer, mimetype) =>
    new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
            { folder: 'doctorapp/doctors', resource_type: 'image', format: mimetype.split('/')[1] || 'jpg' },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        ).end(buffer);
    });

// ─── UPLOAD PROFILE IMAGE ────────────────────────────────────────────────────

export const uploadDoctorImage = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
        const doctorId = req.doctor.doctorId;
        const result = await uploadToCloudinary(req.file.buffer, req.file.mimetype);

        await pool.query('UPDATE doctor SET img_url = ? WHERE id = ?', [result.secure_url, doctorId]);

        res.status(200).json({
            success: true,
            message: 'Photo de profil mise à jour avec succès',
            data: { imgUrl: result.secure_url }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erreur lors du téléchargement' });
    }
};

// ─── SYNC AVAILABILITY ───────────────────────────────────────────────────────

const syncAvailabilities = async (connection, doctorId, schedule) => {
    // Delete existing availability for this doctor (no cabinet_id in new schema)
    await connection.query('DELETE FROM availability WHERE doctor_id = ?', [doctorId]);
    if (!schedule) return;

    const dayMap = {
        sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
        thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday'
    };

    const fmtTime = (t) => {
        if (!t) return null;
        const [h, m] = t.split(':');
        return `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}:00`;
    };

    for (const [day, dayData] of Object.entries(schedule)) {
        const dbDay = dayMap[day.toLowerCase()];
        if (!dbDay || !dayData.isOpen) continue;

        const slots = dayData.slots?.length ? dayData.slots : (dayData.start && dayData.end ? [{ start: dayData.start, end: dayData.end }] : []);

        for (const slot of slots) {
            if (slot.start && slot.end) {
                try {
                    await connection.query(
                        `INSERT INTO availability (doctor_id, day_of_week, start_time, end_time, selectione_les_number_of_appoi_by_day)
                         VALUES (?, ?, ?, ?, ?)`,
                        [doctorId, dbDay, fmtTime(slot.start), fmtTime(slot.end), dayData.maxAppointmentsPerDay || 0]
                    );
                } catch (err) {
                    console.error(`Failed to insert availability for ${dbDay}:`, err.message);
                }
            }
        }
    }
};

// ─── UPDATE PROFILE ──────────────────────────────────────────────────────────

export const updateProfilSetting = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { firstName, lastName, phone, specialtyId, bio } = req.body;
        const doctorId = req.doctor.doctorId;

        if (!firstName || !lastName || !phone) {
            return res.status(400).json({ success: false, message: 'Prénom, nom et téléphone obligatoires' });
        }

        const [phoneCheck] = await connection.query('SELECT id FROM doctor WHERE phone = ? AND id != ?', [phone, doctorId]);
        if (phoneCheck.length > 0) return res.status(409).json({ success: false, message: 'Téléphone déjà utilisé' });

        await connection.query(
            `UPDATE doctor SET firstname = ?, lastname = ?, phone = ?, bio = ? WHERE id = ?`,
            [firstName, lastName, phone, bio || '', doctorId]
        );

        if (specialtyId !== undefined) {
            await connection.query('DELETE FROM doctor_speciality WHERE doctor_id = ?', [doctorId]);
            if (specialtyId) await connection.query('INSERT INTO doctor_speciality (doctor_id, speciality_id) VALUES (?, ?)', [doctorId, specialtyId]);
        }

        await connection.commit();
        res.status(200).json({
            success: true,
            message: 'Profil mis à jour',
            data: { firstName, lastName, phone, specialtyId, bio }
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour' });
    } finally {
        connection.release();
    }
};

// ─── UPDATE CABINET ───────────────────────────────────────────────────────────

export const updateCabinetSetting = async (req, res) => {
    let connection;
    try {
        const { cabinetName, wilayaId, communId, cabinetAddress, schedule, advanceBookingDays } = req.body;
        const doctorId = req.doctor.doctorId;

        if (!cabinetName || !wilayaId || !communId || !cabinetAddress) {
            return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [existing] = await connection.query('SELECT id FROM cabinet WHERE doctor_id = ?', [doctorId]);
        if (existing.length > 0) {
            await connection.query(
                `UPDATE cabinet SET name = ?, wilaya_id = ?, commun_id = ?, address = ? WHERE id = ?`,
                [cabinetName, wilayaId, communId, cabinetAddress, existing[0].id]
            );
        } else {
            await connection.query(
                `INSERT INTO cabinet (doctor_id, name, wilaya_id, commun_id, address) VALUES (?, ?, ?, ?, ?)`,
                [doctorId, cabinetName, wilayaId, communId, cabinetAddress]
            );
        }

        if (schedule) await syncAvailabilities(connection, doctorId, schedule);
        
        // Ensure advance booking days are updated in the doctor table
        if (advanceBookingDays !== undefined) {
            await connection.query('UPDATE doctor SET selectione_les_jours_a_la_vance = ? WHERE id = ?', [advanceBookingDays || 0, doctorId]);
        }

        await connection.commit();
        res.status(200).json({
            success: true,
            message: 'Cabinet mis à jour',
            data: { cabinetName, wilayaId, communId, cabinetAddress, schedule }
        });
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ success: false, message: 'Erreur' });
    } finally {
        if (connection) connection.release();
    }
};

// ─── UPDATE RDV SETTINGS ─────────────────────────────────────────────────────

export const updateRDVSetting = async (req, res) => {
    let connection;
    try {
        const { onlineBooking, consultationDuration, schedule, advanceBookingDays } = req.body;
        const doctorId = req.doctor.doctorId;

        await pool.query('UPDATE doctor SET is_reservation_online = ?, slot_duration = ?, selectione_les_jours_a_la_vance = ? WHERE id = ?', [onlineBooking ? 1 : 0, consultationDuration || 30, advanceBookingDays || 0, doctorId]);

        if (schedule) {
            connection = await pool.getConnection();
            await connection.beginTransaction();
            await syncAvailabilities(connection, doctorId, schedule);
            await connection.commit();
        }

        res.status(200).json({
            success: true,
            message: 'Paramètres RDV mis à jour',
            data: { onlineBooking, consultationDuration, schedule }
        });
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour des RDV' });
    } finally {
        if (connection) connection.release();
    }
};

// ─── ASSISTANT MANAGEMENT ─────────────────────────────────────────────────────

export const getAssistants = async (req, res) => {
    try {
        const doctorId = req.doctor.doctorId;
        
        if (req.doctor.role !== 'doctor') {
            return res.status(403).json({ success: false, message: 'Accès refusé' });
        }

        const [assistants] = await pool.query(
            `SELECT id, firstname, lastname, phone, permissions, created_at
             FROM assistant
             WHERE doctor_id = ?
             ORDER BY created_at DESC`,
            [doctorId]
        );

        const formatted = assistants.map(a => ({
            ...a,
            permissions: typeof a.permissions === 'string' ? JSON.parse(a.permissions) : a.permissions
        }));

        res.status(200).json({ success: true, data: formatted });
    } catch (error) {
        console.error('getAssistants error:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la récupération des assistants' });
    }
};

export const addAssistant = async (req, res) => {
    try {
        const doctorId = req.doctor.doctorId;
        
        if (req.doctor.role !== 'doctor') {
            return res.status(403).json({ success: false, message: 'Accès refusé' });
        }

        const { firstname, lastname, phone, password, permissions } = req.body;

        if (!firstname || !lastname || !phone || !password || !permissions) {
            return res.status(400).json({ success: false, message: 'Tous les champs sont obligatoires' });
        }

        const [existingDoc] = await pool.query('SELECT id FROM doctor WHERE phone = ?', [phone]);
        const [existingAsst] = await pool.query('SELECT id FROM assistant WHERE phone = ?', [phone]);

        if (existingDoc.length > 0 || existingAsst.length > 0) {
            return res.status(409).json({ success: false, message: 'Ce numéro de téléphone est déjà utilisé' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const permissionsStr = JSON.stringify(permissions);

        const [result] = await pool.query(
            `INSERT INTO assistant (doctor_id, firstname, lastname, phone, password, permissions)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [doctorId, firstname, lastname, phone, hashedPassword, permissionsStr]
        );

        res.status(201).json({
            success: true,
            message: 'Assistant créé avec succès',
            data: {
                id: result.insertId,
                firstname,
                lastname,
                phone,
                permissions
            }
        });
    } catch (error) {
        console.error('addAssistant error:', error);
        res.status(500).json({ success: false, message: "Erreur lors de la création de l'assistant" });
    }
};

export const updateAssistant = async (req, res) => {
    try {
        const doctorId = req.doctor.doctorId;
        const { id } = req.params;

        if (req.doctor.role !== 'doctor') {
            return res.status(403).json({ success: false, message: 'Accès refusé' });
        }

        const { firstname, lastname, phone, password, permissions } = req.body;

        if (!firstname || !lastname || !phone || !permissions) {
            return res.status(400).json({ success: false, message: 'Tous les champs requis doivent être remplis' });
        }

        const [existingDoc] = await pool.query('SELECT id FROM doctor WHERE phone = ?', [phone]);
        const [existingAsst] = await pool.query('SELECT id FROM assistant WHERE phone = ? AND id != ?', [phone, id]);

        if (existingDoc.length > 0 || existingAsst.length > 0) {
            return res.status(409).json({ success: false, message: 'Ce numéro de téléphone est déjà utilisé' });
        }

        const permissionsStr = JSON.stringify(permissions);

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await pool.query(
                `UPDATE assistant 
                 SET firstname = ?, lastname = ?, phone = ?, password = ?, permissions = ?
                 WHERE id = ? AND doctor_id = ?`,
                [firstname, lastname, phone, hashedPassword, permissionsStr, id, doctorId]
            );
        } else {
            await pool.query(
                `UPDATE assistant 
                 SET firstname = ?, lastname = ?, phone = ?, permissions = ?
                 WHERE id = ? AND doctor_id = ?`,
                [firstname, lastname, phone, permissionsStr, id, doctorId]
            );
        }

        res.status(200).json({
            success: true,
            message: 'Assistant mis à jour avec succès',
            data: {
                id: parseInt(id),
                firstname,
                lastname,
                phone,
                permissions
            }
        });
    } catch (error) {
        console.error('updateAssistant error:', error);
        res.status(500).json({ success: false, message: "Erreur lors de la modification de l'assistant" });
    }
};

export const deleteAssistant = async (req, res) => {
    try {
        const doctorId = req.doctor.doctorId;
        const { id } = req.params;

        if (req.doctor.role !== 'doctor') {
            return res.status(403).json({ success: false, message: 'Accès refusé' });
        }

        const [result] = await pool.query(
            'DELETE FROM assistant WHERE id = ? AND doctor_id = ?',
            [id, doctorId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Assistant non trouvé' });
        }

        res.status(200).json({ success: true, message: 'Assistant supprimé avec succès' });
    } catch (error) {
        console.error('deleteAssistant error:', error);
        res.status(500).json({ success: false, message: "Erreur lors de la suppression de l'assistant" });
    }
};