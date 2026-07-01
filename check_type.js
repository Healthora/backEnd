import 'dotenv/config';
import pool from './database.js';

async function check() {
    try {
        const [appCols] = await pool.query('DESCRIBE appointment');
        console.log('Appointment table columns:');
        console.table(appCols);

        const [patCols] = await pool.query('DESCRIBE patient');
        console.log('Patient table columns:');
        console.table(patCols);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
check();
