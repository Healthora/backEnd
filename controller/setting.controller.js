import pool from '../database.js';


export const updateProfilSetting = async (req, res, next) => {
    try {
        const { email, firstName, lastName, phone, specialty, onlineBooking } = req.body;
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

        if (phone.length < 10) {
            return res.status(400).json({
                success: false,
                message: 'numero invalid'
            })
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
            is_reservation_online = ?,
            consultation_duration = ?
            WHERE id = ?
        `, [email, firstName, lastName, phone, specialty, onlineBooking ? 1 : 0, consultationDuration || 30, doctorId]);

        if (result.affectedRows > 0) {
            const [updatedUser] = await pool.query(
                'SELECT id, email, first_name, last_name, phone, specialty, is_reservation_online, consultation_duration FROM doctors WHERE id = ?',
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
                    onlineBooking: updatedUser[0].is_reservation_online === 1,
                    consultationDuration: updatedUser[0].consultation_duration
                }
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Médecin non trouvé ou aucune modification effectuée'
            });
        }
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour des informations',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

export const updateCabinetSetting = async (req, res, next) => {
    let connection;
    try {
        const { cabinetName, cabinetAddress, schedule, consultationDuration } = req.body;
        const doctorId = req.doctor.doctorId;

        if (!cabinetName || !cabinetAddress) {
            return res.status(400).json({
                success: false,
                message: 'Veuillez remplir tous les champs obligatoires du cabinet'
            });
        }
        
        const slotDuration = consultationDuration || 30; // Default to 30 if not provided

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query(`
            UPDATE cabinets
            SET name = ?,
            address = ?,
            schedule = ?
            WHERE doctor_id = ?
        `, [cabinetName, cabinetAddress, JSON.stringify(schedule), doctorId]);

        let cabinetId;

        if (result.affectedRows > 0) {
            const [updatedCabinet] = await connection.query(
                'SELECT id FROM cabinets WHERE doctor_id = ?',
                [doctorId]
            );
            cabinetId = updatedCabinet[0].id;
        } else {
            const [insertResult] = await connection.query(
                'INSERT INTO cabinets (doctor_id, name, address, schedule) VALUES (?, ?, ?, ?)',
                [doctorId, cabinetName, cabinetAddress, JSON.stringify(schedule)]
            );
            cabinetId = insertResult.insertId;
        }
        
        // Sync the availabilities table
        // First, delete all old availabilities for this cabinet
        await connection.query('DELETE FROM availabilities WHERE cabinet_id = ?', [cabinetId]);
        
        // Parse the schedule and insert new ones
        if (schedule) {
            const dayMap = {
                monday: 'monday', tuesday: 'tuesday', wednesday: 'wednesday',
                thursday: 'thursday', friday: 'friday', saturday: 'saturday', sunday: 'sunday'
            };
            
            for (const [day, dayData] of Object.entries(schedule)) {
                if (dayData.isOpen && dayData.slots && dayData.slots.length > 0) {
                    for (const slot of dayData.slots) {
                        if (slot.start && slot.end) {
                             // start and end will come as HH:MM, append :00 for TIME format
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
        
        await connection.commit();
        
        const [updatedCabinetData] = await pool.query(
             'SELECT name, address, schedule FROM cabinets WHERE id = ?',
             [cabinetId]
        );

        res.status(200).json({
            success: true,
            message: 'Cabinet et disponibilités mis à jour avec succès',
            data: {
                cabinetName: updatedCabinetData[0].name,
                cabinetAddress: updatedCabinetData[0].address,
                schedule: typeof updatedCabinetData[0].schedule === 'string'
                    ? JSON.parse(updatedCabinetData[0].schedule)
                    : updatedCabinetData[0].schedule,
                consultationDuration: slotDuration
            }
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Update cabinet error:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour du cabinet',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) connection.release();
    }
}