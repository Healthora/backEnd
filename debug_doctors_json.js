import pool from './database.js';

async function checkDoctors() {
    try {
        const [doctors] = await pool.query('SELECT id, email FROM doctors');
        console.log('Doctors found:', JSON.stringify(doctors, null, 2));
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkDoctors();
