import pool from '../database.js';

/**
 * GET /specialities
 * Returns all specialities ordered by name
 */
export const getSpecialities = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name FROM speciality ORDER BY name');
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Get specialities error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch specialities' });
    }
};
