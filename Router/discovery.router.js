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

// Public Discovery
discoveryRouter.get('/specialities', getSpecialities);
discoveryRouter.get('/search', searchDoctors);
discoveryRouter.get('/doctor-details/:id', getDoctorDetails);
discoveryRouter.get('/available-slots', getAvailableSlotsForPatient);
discoveryRouter.get('/available-dates', getAvailableDates);

// Authenticated patient
discoveryRouter.get('/my-appointments', verifyPatientToken, getPatientAppointments);
discoveryRouter.post('/book', verifyPatientToken, bookAppointmentAsPatient);
discoveryRouter.put('/cancel/:id', verifyPatientToken, cancelAppointmentAsPatient);

export default discoveryRouter;
