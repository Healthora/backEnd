import pool from '../database.js';

/**
 * Get all specialities with icons/categories
 */
export const getSpecialities = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM speciality ORDER BY name ASC');
        res.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('getSpecialities error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Search doctors by name and/or speciality
 */
export const searchDoctors = async (req, res) => {
    try {
        const { query, specialityId } = req.query;
        let sql = `
            SELECT 
                d.*,
                GROUP_CONCAT(DISTINCT s.name SEPARATOR ', ') as specialities,
                GROUP_CONCAT(DISTINCT s.id SEPARATOR ',') as speciality_ids,
                c.name as cabinet_name, c.address as cabinet_address,
                w.name as wilaya_name, cm.name as commune_name
            FROM doctor d
            LEFT JOIN doctor_speciality ds ON d.id = ds.doctor_id
            LEFT JOIN speciality s ON ds.speciality_id = s.id
            LEFT JOIN cabinet c ON d.id = c.doctor_id
            LEFT JOIN wilaya w ON c.wilaya_id = w.id
            LEFT JOIN commun cm ON c.commun_id = cm.id
            WHERE 1=1
        `;
        const params = [];

        if (query) {
            sql += ` AND (d.firstname LIKE ? OR d.lastname LIKE ? OR s.name LIKE ?)`;
            const likeQuery = `%${query}%`;
            params.push(likeQuery, likeQuery, likeQuery);
        }

        if (specialityId) {
            sql += ` AND d.id IN (SELECT doctor_id FROM doctor_speciality WHERE speciality_id = ?)`;
            params.push(specialityId);
        }

        sql += ` GROUP BY d.id ORDER BY d.is_verified DESC, d.lastname ASC`;

        const [rows] = await pool.query(sql, params);

        res.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('searchDoctors error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * Get doctor details including availability
 */
export const getDoctorDetails = async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. Get doctor basic info
        const [doctorRows] = await pool.query(`
            SELECT 
                d.*,
                GROUP_CONCAT(DISTINCT s.name SEPARATOR ', ') as specialities,
                c.name as cabinet_name, c.address as cabinet_address,
                w.name as wilaya_name, cm.name as commune_name
            FROM doctor d
            LEFT JOIN doctor_speciality ds ON d.id = ds.doctor_id
            LEFT JOIN speciality s ON ds.speciality_id = s.id
            LEFT JOIN cabinet c ON d.id = c.doctor_id
            LEFT JOIN wilaya w ON c.wilaya_id = w.id
            LEFT JOIN commun cm ON c.commun_id = cm.id
            WHERE d.id = ?
            GROUP BY d.id
        `, [id]);

        if (doctorRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Doctor not found' });
        }

        // 2. Get doctor availability
        const [availabilityRows] = await pool.query(`
            SELECT id, day_of_week, start_time, end_time, selectione_les_number_of_appoi_by_day as slots_per_day
            FROM availability
            WHERE doctor_id = ?
            ORDER BY FIELD(day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
        `, [id]);

        res.status(200).json({
            success: true,
            data: {
                ...doctorRows[0],
                availability: availabilityRows
            }
        });
    } catch (error) {
        console.error('getDoctorDetails error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
