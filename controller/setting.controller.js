import pool from '../database.js';

const syncAvailabilities = async (connection, doctorId, cabinetId, schedule, slotDuration) => {
    // 1. Delete all old availabilities for this cabinet
    await connection.query('DELETE FROM availabilities WHERE cabinet_id = ?', [cabinetId]);
    
    // 2. Parse the schedule and insert new ones
    if (schedule) {
        const dayMap = {
            monday: 'monday', tuesday: 'tuesday', wednesday: 'wednesday',
            thursday: 'thursday', friday: 'friday', saturday: 'saturday', sunday: 'sunday'
        };
        
        for (const [day, dayData] of Object.entries(schedule)) {
            if (dayData.isOpen && dayData.slots && dayData.slots.length > 0) {
                for (const slot of dayData.slots) {
                    if (slot.start && slot.end) {
                         let startTime = slot.start.length === 5 ? slot.start + ':00' : slot.start;
                         let endTime = slot.end.length === 5 ? slot.end + ':00' : slot.end;
                         
                         await connection.query(`
                            INSERT INTO availabilities (doctor_id, cabinet_id, day_of_week, start_time, end_time, slot_duration)
                            VALUES (?, ?, ?, ?, ?, ?)
                         `, [doctorId, cabinetId, dayMap[day], startTime, endTime, slotDuration]);
                    }
                }
            }
        }
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
            })
        };

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'email invalide'
            });
        }

        const [existingUser] = await pool.query(
            'SELECT id FROM doctors WHERE email = ? AND id != ?',
            [email, doctorId]
        );

        if (existingUser.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Email déjà utilisé par un autre médecin'
            });
        }

        const [result] = await pool.query(`
            UPDATE doctors
            SET email = ?,
            first_name = ?,
            last_name = ?,
            phone = ?,
            specialty = ?,
            bio = ?
            WHERE id = ?
        `, [email, firstName, lastName, phone, specialty, bio || '', doctorId]);

        const [updatedUser] = await pool.query(
            'SELECT id, email, first_name, last_name, phone, specialty, bio, is_reservation_online, consultation_duration FROM doctors WHERE id = ?',
            [doctorId]
        );

        res.status(200).json({
            success: true,
            message: 'Profil mis à jour avec succès',
            data: {
                doctorId: updatedUser[0].id,
                email: updatedUser[0].email,
                firstName: updatedUser[0].first_name,
                lastName: updatedUser[0].last_name,
                phone: updatedUser[0].phone,
                specialty: updatedUser[0].specialty,
                bio: updatedUser[0].bio,
                onlineBooking: updatedUser[0].is_reservation_online === 1,
                consultationDuration: updatedUser[0].consultation_duration
            }
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour des informations'
        });
    }
}

export const updateCabinetSetting = async (req, res, next) => {
    let connection;
    try {
        const { cabinetName, cabinetAddress, schedule } = req.body;
        const doctorId = req.doctor.doctorId;

        if (!cabinetName || !cabinetAddress) {
            return res.status(400).json({
                success: false,
                message: 'Veuillez remplir tous les champs obligatoires'
            });
        }
        
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Get current consultation duration
        const [doctorData] = await connection.query('SELECT consultation_duration FROM doctors WHERE id = ?', [doctorId]);
        const slotDuration = doctorData[0]?.consultation_duration || 30;

        const [result] = await connection.query(`
            UPDATE cabinets
            SET name = ?,
            address = ?,
            schedule = ?
            WHERE doctor_id = ?
        `, [cabinetName, cabinetAddress, JSON.stringify(schedule), doctorId]);

        let cabinetId;
        if (result.affectedRows > 0) {
            const [updatedCabinet] = await connection.query('SELECT id FROM cabinets WHERE doctor_id = ?', [doctorId]);
            cabinetId = updatedCabinet[0].id;
        } else {
            const [insertResult] = await connection.query(
                'INSERT INTO cabinets (doctor_id, name, address, schedule) VALUES (?, ?, ?, ?)',
                [doctorId, cabinetName, cabinetAddress, JSON.stringify(schedule)]
            );
            cabinetId = insertResult.insertId;
        }
        
        await syncAvailabilities(connection, doctorId, cabinetId, schedule, slotDuration);
        
        await connection.commit();
        
        res.status(200).json({
            success: true,
            message: 'Cabinet mis à jour avec succès',
            data: { cabinetName, cabinetAddress, schedule, consultationDuration: slotDuration }
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Update cabinet error:', error);
        res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour' });
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