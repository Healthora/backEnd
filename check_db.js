import pool from './database.js';

async function checkDb() {
  try {
    const conn = await pool.getConnection();
    const [tables] = await conn.query("SHOW TABLES LIKE 'consultation_record'");
    console.log(tables.length > 0 ? 'OK: consultation_record exists' : 'MISSING: consultation_record not found');
    
    if (tables.length > 0) {
      const [columns] = await conn.query("DESCRIBE consultation_record");
      console.log('Columns:', columns);
    }
    conn.release();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
checkDb();
