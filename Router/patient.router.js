import { Router } from "express";
import { 
    getAllPatient, 
    addPatient, 
    updatePatient, 
    deletePatient,
    searchAppUsers
} from "../controller/patient.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const patientRoute = Router();

patientRoute.use(verifyToken);

patientRoute.post('/add', addPatient);

patientRoute.get('/search/app-users', searchAppUsers);

patientRoute.get('/:id', getAllPatient);

patientRoute.put('/:patientId', updatePatient);

patientRoute.delete('/:patientId', deletePatient);

export default patientRoute;