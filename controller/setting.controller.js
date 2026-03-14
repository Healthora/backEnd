import pool from '../database.js';

const syncAvailabilities = async (connection, doctorId, cabinetId, schedule, slotDuration) => {
    try {
        // 1. Delete all old availabilities for this cabinet
        await connection.query('DELETE FROM availabilities WHERE cabinet_id = ?', [cabinetId]);
        
        if (!schedule) return;

        const dayMap = {
            monday: 'monday', tuesday: 'tuesday', wednesday: 'wednesday',
            thursday: 'thursday', friday: 'friday', saturday: 'saturday', sunday: 'sunday'
        };

        // Helper to ensure HH:mm:ss format
        const formatTime = (timeStr) => {
            if (!timeStr) return null;
            let [h, m] = timeStr.split(':');
            h = h.padStart(2, '0');
            m = (m || '00').padEnd(2, '0');
            return `${h}:${m}:00`;
        };
        
        for (const [day, dayData] of Object.entries(schedule)) {
            const backendDay = dayMap[day.toLowerCase()];
            if (!backendDay || !dayData.isOpen) continue;

            const slots = dayData.slots || [];
            
            // Handle legacy structure (start/end on root) or new structure (slots array)
            const normalizedSlots = slots.length > 0 ? slots : 
                                  (dayData.start && dayData.end ? [{start: dayData.start, end: dayData.end}] : []);

            for (const slot of normalizedSlots) {
                if (slot.start && slot.end) {
                     const startTime = formatTime(slot.start);
                     const endTime = formatTime(slot.end);
                     
                     await connection.query(`
                        INSERT INTO availabilities (doctor_id, cabinet_id, day_of_week, start_time, end_time, slot_duration)
                        VALUES (?, ?, ?, ?, ?, ?)
                     `, [doctorId, cabinetId, backendDay, startTime, endTime, slotDuration || 30]);
                }
            }
        }
    } catch (error) {
        console.error('Error in syncAvailabilities:', error);
        throw error; // Re-throw to trigger transaction rollback
    }
};

export const updateProfilSetting = async (req, res, next) => {
    try {
        const { email, firstName, lastName, phone, specialty, bio } = req.body;
        const doctorId = req.doctor.doctorId;

        if (!email || !firstName || !lastName || !phone || !specialty) {
            return res.status(400).json({
                success: false,
                message: 'Veuillez remplir tous les champs obligatoires'
            });
        }

        const [result] = await pool.query(`
            UPDATE doctors
            SET email = ?, first_name = ?, last_name = ?, phone = ?, specialty = ?, bio = ?
            WHERE id = ?
        `, [email, firstName, lastName, phone, specialty, bio || '', doctorId]);

        res.status(200).json({
            success: true,
            message: 'Profil mis à jour avec succès',
            data: { email, firstName, lastName, phone, specialty, bio }
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour' });
    }
}

export const updateCabinetSetting = async (req, res, next) => {
    let connection;
    try {
        const { cabinetName, wilaya, commune, cabinetAddress, schedule } = req.body;
        const doctorId = req.doctor.doctorId;

        if (!cabinetName || !wilaya || !commune || !cabinetAddress) {
            return res.status(400).json({
                success: false,
                message: 'Veuillez remplir tous les champs obligatoires'
            });
        }
        
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Get current doctor settings for slot duration
        const [doctorData] = await connection.query('SELECT consultation_duration FROM doctors WHERE id = ?', [doctorId]);
        const slotDuration = doctorData[0]?.consultation_duration || 30;

        // 2. Check if cabinet exists
        const [existingCabinets] = await connection.query('SELECT id FROM cabinets WHERE doctor_id = ?', [doctorId]);
        let cabinetId;

        if (existingCabinets.length > 0) {
            cabinetId = existingCabinets[0].id;
            await connection.query(`
                UPDATE cabinets
                SET name = ?, wilaya = ?, commune = ?, address = ?, schedule = ?
                WHERE id = ?
            `, [cabinetName, wilaya, commune, cabinetAddress, JSON.stringify(schedule), cabinetId]);
        } else {
            const [insertResult] = await connection.query(
                'INSERT INTO cabinets (doctor_id, name, wilaya, commune, address, schedule) VALUES (?, ?, ?, ?, ?, ?)',
                [doctorId, cabinetName, wilaya, commune, cabinetAddress, JSON.stringify(schedule)]
            );
            cabinetId = insertResult.insertId;
        }
        
        // 3. Sync availabilities table
        await syncAvailabilities(connection, doctorId, cabinetId, schedule, slotDuration);
        
        await connection.commit();
        
        res.status(200).json({
            success: true,
            message: 'Cabinet et disponibilités mis à jour avec succès',
            data: { cabinetName, cabinetAddress, schedule, consultationDuration: slotDuration }
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Update cabinet error:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour du cabinet' });
    } finally {
        if (connection) connection.release();
    }
}

export const updateRDVSetting = async (req, res) => {
    let connection;
    try {
        const { onlineBooking, consultationDuration } = req.body;
        const doctorId = req.doctor.doctorId;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Update doctor table
        await connection.query(`
            UPDATE doctors
            SET is_reservation_online = ?,
            consultation_duration = ?
            WHERE id = ?
        `, [onlineBooking ? 1 : 0, consultationDuration || 30, doctorId]);

        // 2. Fetch cabinet info to sync availabilities
        const [cabinetRows] = await connection.query('SELECT id, schedule FROM cabinets WHERE doctor_id = ?', [doctorId]);
        
        if (cabinetRows.length > 0) {
            const cabinetId = cabinetRows[0].id;
            const schedule = typeof cabinetRows[0].schedule === 'string' 
                ? JSON.parse(cabinetRows[0].schedule) 
                : cabinetRows[0].schedule;
            
            await syncAvailabilities(connection, doctorId, cabinetId, schedule, consultationDuration || 30);
        }

        await connection.commit();

        res.status(200).json({
            success: true,
            message: 'Paramètres RDV mis à jour',
            data: { onlineBooking, consultationDuration }
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Update RDV error:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour des RDV' });
    } finally {
        if (connection) connection.release();
    }
}