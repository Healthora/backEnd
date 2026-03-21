import { Router } from "express";
import {
    patientSignUp,
    patientSignIn,
    patientForgotPassword,
    patientResetPassword
} from "../controller/auth.controller.js";
import {
    getDoctors,
    getDoctorDetails,
    bookAppointment,
    getMyAppointments,
    getMyPrescriptions,
    updateMyProfile,
    getMyProfile,
    cancelAppointment,
    deleteAppointment,
    getDoctorAvailableSlots
} from "../controller/patientPortal.controller.js";
import { verifyPatientToken } from "../middleware/auth.middleware.js";

const portalRouter = Router();

// Auth Public
portalRouter.post('/auth/signup', patientSignUp);
portalRouter.post('/auth/signin', patientSignIn);
portalRouter.post('/auth/forgot-password', patientForgotPassword);
portalRouter.post('/auth/reset-password', patientResetPassword);


// Search Public
portalRouter.get('/doctors', getDoctors);
portalRouter.get('/doctors/:id', getDoctorDetails);
portalRouter.get('/appointments/slots', getDoctorAvailableSlots);

// Patient Private
portalRouter.post('/appointments', verifyPatientToken, bookAppointment);
portalRouter.get('/appointments/me', verifyPatientToken, getMyAppointments);
portalRouter.post('/appointments/:id/cancel', verifyPatientToken, cancelAppointment);
portalRouter.delete('/appointments/:id', verifyPatientToken, deleteAppointment);
portalRouter.get('/prescriptions/me', verifyPatientToken, getMyPrescriptions);

// Profile
portalRouter.get('/me', verifyPatientToken, getMyProfile);
portalRouter.put('/me', verifyPatientToken, updateMyProfile);

export default portalRouter;
