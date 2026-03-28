import pool from './database.js';
(async () => {
    try {
        console.log('--- Checking Doctor Table ---');
        const [docs] = await pool.query('SELECT id, firstname, lastname, slot_duration, selectione_les_jours_a_la_vance FROM doctor LIMIT 5');
        console.log(JSON.stringify(docs, null, 2));

        if (docs.length > 0) {
            const doctorId = docs[0].id;
            console.log(`--- Checking Availability for Doctor ID: ${doctorId} ---`);
            const [avails] = await pool.query('SELECT * FROM availability WHERE doctor_id = ?', [doctorId]);
            console.log(JSON.stringify(avails, null, 2));

            console.log(`--- Checking Appointments for Doctor ID: ${doctorId} ---`);
            const [apps] = await pool.query('SELECT * FROM appointment WHERE doctor_id = ? LIMIT 5', [doctorId]);
            console.log(JSON.stringify(apps, null, 2));
        }
    } catch(e) {
        console.error('Error:', e.message);
    }
    process.exit();
})();
