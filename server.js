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
  .then(conn => {
    console.log("✅ Database connected successfully!");
    conn.release();
  })
  .catch(err => {
    console.error("❌ Database connection failed during startup:", err.message);
    if (err.code === 'ETIMEDOUT') {
      console.error("💡 Hint: Your connection is timing out. If you are using the public Railway URL (tramway.proxy.rlwy.net), you MUST specify the MYSQLPORT from your Railway dashboard.");
    }
  });

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5174', 'https://healthoraweb.netlify.app'];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    // Automatically allow local network IPs for testing on mobile devices
    if (allowedOrigins.includes(origin) || origin.match(/^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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