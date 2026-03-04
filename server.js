import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './Router/auth.router.js'
import settingRouter from './Router/setting.router.js';
import patientRoute from './Router/patient.router.js';
import appointmentRouter from './Router/appointment.router.js';
import ordonnanceRouter from './Router/ordonnance.router.js';

dotenv.config();

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5174', 'https://healthoraweb.netlify.app'];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
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
app.use('/setting', settingRouter);
app.use('/patient', patientRoute);
app.use('/appointments', appointmentRouter);
app.use('/ordonnance', ordonnanceRouter);

app.get('/', (req, res) => {
    res.send("Server is running");
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; 

app.listen(PORT, HOST, () => {
    console.log(`Server is running on ${HOST}:${PORT}`);
    console.log(`CORS enabled for: ${allowedOrigins.join(', ')}`);
});