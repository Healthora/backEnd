import pool from '../database.js';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
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

const syncAvailabilities = async (connection, doctorId, schedule, slotDuration = 30) => {
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
                        `INSERT INTO availability (doctor_id, day_of_week, start_time, end_time, slot_duration)
                         VALUES (?, ?, ?, ?, ?)`,
                        [doctorId, dbDay, fmtTime(slot.start), fmtTime(slot.end), slotDuration]
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
        const { cabinetName, wilayaId, communId, cabinetAddress, schedule } = req.body;
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
        const { onlineBooking, consultationDuration, schedule } = req.body;
        const doctorId = req.doctor.doctorId;

        await pool.query('UPDATE doctor SET is_reservation_online = ? WHERE id = ?', [onlineBooking ? 1 : 0, doctorId]);

        if (schedule) {
            connection = await pool.getConnection();
            await connection.beginTransaction();
            await syncAvailabilities(connection, doctorId, schedule, consultationDuration || 30);
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