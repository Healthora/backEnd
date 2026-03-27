import pool from './database.js';
(async () => {
    try {
        const [rows] = await pool.query(`
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
            WHERE 1=1 GROUP BY d.id, c.name, c.address, w.name, cm.name
        `);
        console.log('Success, rows:', rows.length);
        console.dir(rows[0]);
    } catch(e) {
        console.error('Error:', e.message);
    }
    process.exit();
})();
