import pool from '../database.js';

/**
 * GET /location/wilayas
 * Returns all wilayas ordered by id
 */
export const getWilayas = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name FROM wilaya ORDER BY id');
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Get wilayas error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch wilayas' });
    }
};

/**
 * GET /location/communes/:wilayaId
 * Returns communes for a given wilaya id.
 * Updated: table is now 'commun' (was 'commune')
 */
export const getCommunesByWilaya = async (req, res) => {
    try {
        const { wilayaId } = req.params;
        if (!wilayaId || isNaN(parseInt(wilayaId))) {
            return res.status(400).json({ success: false, message: 'wilayaId invalide' });
        }
        const [rows] = await pool.query(
            'SELECT id, name FROM commun WHERE wilaya_id = ? ORDER BY name',
            [wilayaId]
        );
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Get communs error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch communes' });
    }
};
