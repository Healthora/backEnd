import { Router } from "express";
import { 
    getSpecialities, 
    searchDoctors, 
    getDoctorDetails 
} from "../controller/discovery.controller.js";
import { verifyPatientToken } from "../middleware/auth.middleware.js";

const discoveryRouter = Router();

// Routes for doctor discovery
// Specialities are public (needed before login for signup flow)
discoveryRouter.get('/specialities', getSpecialities);
// Search and details require an authenticated patient
discoveryRouter.get('/search', verifyPatientToken, searchDoctors);
discoveryRouter.get('/doctor-details/:id', verifyPatientToken, getDoctorDetails);

export default discoveryRouter;
