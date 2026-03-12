import { Router } from "express";
import {
    patientSignUp,
    patientSignIn
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
    deleteAppointment
} from "../controller/patientPortal.controller.js";
import { verifyPatientToken } from "../middleware/auth.middleware.js";

const portalRouter = Router();

// Auth Public
portalRouter.post('/auth/signup', patientSignUp);
portalRouter.post('/auth/signin', patientSignIn);


// Search Public
portalRouter.get('/doctors', getDoctors);
portalRouter.get('/doctors/:id', getDoctorDetails);

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
