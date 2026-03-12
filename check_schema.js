import pool from './database.js';

async function checkSchema() {
    try {
        const [columns] = await pool.query('SHOW COLUMNS FROM appointments');
        console.log('Columns in appointments table:');
        console.table(columns);
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkSchema();
