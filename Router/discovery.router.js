import { Router } from "express";
import { 
    getSpecialities, 
    searchDoctors, 
    getDoctorDetails 
} from "../controller/discovery.controller.js";

const discoveryRouter = Router();

// Routes for doctor discovery
discoveryRouter.get('/specialities', getSpecialities);
discoveryRouter.get('/search', searchDoctors);
discoveryRouter.get('/doctor-details/:id', getDoctorDetails);

export default discoveryRouter;
