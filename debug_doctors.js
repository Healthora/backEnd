import pool from './database.js';

async function checkDoctors() {
    try {
        const [doctors] = await pool.query('SELECT id, email, first_name, last_name FROM doctors');
        console.table(doctors);
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkDoctors();
