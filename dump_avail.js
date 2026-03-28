import pool from './database.js';
(async () => {
    try {
        const [docs] = await pool.query('SELECT id, firstname, lastname FROM doctor');
        for (const doc of docs) {
            console.log(`\n=== Doctor: ${doc.firstname} ${doc.lastname} (ID: ${doc.id}) ===`);
            const [avails] = await pool.query('SELECT * FROM availability WHERE doctor_id = ?', [doc.id]);
            if (avails.length === 0) {
                console.log('NO AVAILABILITY DEFINED');
            } else {
                avails.forEach(a => {
                    console.log(`  - ${a.day_of_week}: ${a.start_time} to ${a.end_time} (Cap: ${a.selectione_les_number_of_appoi_by_day})`);
                });
            }
        }
    } catch(e) {
        console.error('Error:', e.message);
    }
    process.exit();
})();
