import { Router } from "express";
import {
    getAllPatient,
    addPatient,
    updatePatient,
    deletePatient,
    searchAppUsers
} from "../controller/patient.controller.js";
import { verifyToken, checkPermission } from "../middleware/auth.middleware.js";

const patientRoute = Router();

patientRoute.use(verifyToken);

patientRoute.post('/add', checkPermission('patient', 'add'), addPatient);

patientRoute.get('/search/app-users', checkPermission('patient', 'view'), searchAppUsers);

patientRoute.get('/:id', checkPermission('patient', 'view'), getAllPatient);

patientRoute.put('/:patientId', checkPermission('patient', 'update'), updatePatient);

patientRoute.delete('/:patientId', checkPermission('patient', 'delete'), deletePatient);

export default patientRoute;