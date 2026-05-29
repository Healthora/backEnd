import pool from './database.js';

async function checkDb() {
  const conn = await pool.getConnection();
  const [rows] = await conn.query("SHOW TABLES LIKE 'assistant'");
  console.log(rows.length > 0 ? 'OK: assistant table exists' : 'MISSING: assistant table not found');
  conn.release();
  await pool.end();
}

checkDb().catch(console.error);
