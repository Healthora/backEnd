import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './Router/auth.router.js'
import settingRouter from './Router/setting.router.js';
import patientRoute from './Router/patient.router.js';
import appointmentRouter from './Router/appointment.router.js';
import ordonnanceRouter from './Router/ordonnance.router.js';
import locationRouter from './Router/location.router.js';
import specialityRouter from './Router/speciality.router.js';
import patientAuthRouter from './Router/patientAuth.router.js';
import discoveryRouter from './Router/discovery.router.js';
import medicalRecordsRouter from './Router/medical_records.router.js';
import pool from './database.js';




dotenv.config();

const app = express();

// Test DB Connection
pool.getConnection()
  .then(async conn => {
    console.log("✅ Database connected successfully!");
    conn.release();
    
    // Initialize Assistant table
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS assistant (
          id INT AUTO_INCREMENT PRIMARY KEY,
          doctor_id BIGINT UNSIGNED NOT NULL,
          firstname VARCHAR(100) NOT NULL,
          lastname VARCHAR(100) NOT NULL,
          phone VARCHAR(20) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          permissions JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (doctor_id) REFERENCES doctor(id) ON DELETE CASCADE
        )
      `);
      console.log("✅ Table 'assistant' checked/created successfully!");
    } catch (dbErr) {
      console.error("❌ Failed to create 'assistant' table:", dbErr.message);
    }

    // Initialize Doctor Medical Fields table
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS doctor_medical_field (
          id INT AUTO_INCREMENT PRIMARY KEY,
          doctor_id BIGINT UNSIGNED NOT NULL,
          field_name VARCHAR(255) NOT NULL,
          field_type VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (doctor_id) REFERENCES doctor(id) ON DELETE CASCADE
        )
      `);
      console.log("✅ Table 'doctor_medical_field' checked/created successfully!");
    } catch (dbErr) {
      console.error("❌ Failed to create 'doctor_medical_field' table:", dbErr.message);
    }

    // Initialize Consultation Records table
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS consultation_record (
          id INT AUTO_INCREMENT PRIMARY KEY,
          appointment_id INT NOT NULL,
          patient_id INT NOT NULL,
          doctor_id BIGINT UNSIGNED NOT NULL,
          record_data JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("✅ Table 'consultation_record' checked/created successfully!");
    } catch (dbErr) {
      console.error("❌ Failed to create 'consultation_record' table:", dbErr.message);
    }
  })
  .catch(err => {
    console.error("❌ Database connection failed during startup:", err.message);
    if (err.code === 'ETIMEDOUT') {
      console.error("💡 Hint: Your connection is timing out. If you are using the public Railway URL (tramway.proxy.rlwy.net), you MUST specify the MYSQLPORT from your Railway dashboard.");
    }
  });

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5174', 'https://healthoraweb.netlify.app', 'https://healthora-portal-client.vercel.app'];

// Ensure critical origins are always allowed
const criticalOrigins = [
  'https://healthora-portal-client.vercel.app',
  'https://healthoraweb.netlify.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174'
];
criticalOrigins.forEach(origin => {
  if (!allowedOrigins.includes(origin)) {
    allowedOrigins.push(origin);
  }
});

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    // Allow from allowedOrigins, local network IPs, or vercel/netlify preview domains
    const isAllowed = 
      allowedOrigins.includes(origin) || 
      origin.match(/^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/) ||
      origin.endsWith('.vercel.app') || 
      origin.endsWith('.netlify.app') ||
      origin.startsWith('http://localhost:');

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

app.use('/auth', authRouter);
app.use('/patient-auth', patientAuthRouter);
app.use('/setting', settingRouter);
app.use('/patient', patientRoute);
app.use('/appointments', appointmentRouter);
app.use('/ordonnance', ordonnanceRouter);
app.use('/location', locationRouter);
app.use('/speciality', specialityRouter);
app.use('/discovery', discoveryRouter);
app.use('/medical-records', medicalRecordsRouter);



app.get('/', (req, res) => {
  res.send("Server is running");
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server is running on ${HOST}:${PORT}`);
  console.log(`CORS enabled for: ${allowedOrigins.join(', ')}`);
});