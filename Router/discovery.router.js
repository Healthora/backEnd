import { Router } from "express";
import { 
    getSpecialities, 
    searchDoctors, 
    getDoctorDetails,
    getPatientAppointments,
    getAvailableSlotsForPatient,
    bookAppointmentAsPatient,
    cancelAppointmentAsPatient,
} from "../controller/discovery.controller.js";
import { verifyPatientToken } from "../middleware/auth.middleware.js";

const discoveryRouter = Router();

// Public
discoveryRouter.get('/specialities', getSpecialities);
// Authenticated patient
discoveryRouter.get('/search', verifyPatientToken, searchDoctors);
discoveryRouter.get('/doctor-details/:id', verifyPatientToken, getDoctorDetails);
discoveryRouter.get('/available-slots', verifyPatientToken, getAvailableSlotsForPatient);
discoveryRouter.get('/my-appointments', verifyPatientToken, getPatientAppointments);
discoveryRouter.post('/book', verifyPatientToken, bookAppointmentAsPatient);
discoveryRouter.put('/cancel/:id', verifyPatientToken, cancelAppointmentAsPatient);

export default discoveryRouter;
