import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = process.env.MYSQL_URL 
  ? mysql.createPool(process.env.MYSQL_URL)
  : mysql.createPool({
      host: process.env.MYSQLHOST,
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE,
      port: process.env.MYSQLPORT,
      ssl: {
        rejectUnauthorized: false
      }
    });

export default pool;