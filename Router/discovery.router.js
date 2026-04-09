import { Router } from "express";
import { 
    getSpecialities, 
    searchDoctors, 
    getDoctorDetails,
    getPatientAppointments,
    getAvailableSlotsForPatient,
    getAvailableDates,
    bookAppointmentAsPatient,
    cancelAppointmentAsPatient,
} from "../controller/discovery.controller.js";
import { verifyPatientToken } from "../middleware/auth.middleware.js";

const discoveryRouter = Router();

// Public Discovery - Important: specific routes before parameter routes
discoveryRouter.get('/available-dates', getAvailableDates);
discoveryRouter.get('/available-slots', getAvailableSlotsForPatient);
discoveryRouter.get('/specialities', getSpecialities);
discoveryRouter.get('/search', searchDoctors);
discoveryRouter.get('/doctor-details/:id', getDoctorDetails);

// Authenticated patient
discoveryRouter.get('/my-appointments', verifyPatientToken, getPatientAppointments);
discoveryRouter.post('/book', verifyPatientToken, bookAppointmentAsPatient);
discoveryRouter.put('/cancel/:id', verifyPatientToken, cancelAppointmentAsPatient);

export default discoveryRouter;
