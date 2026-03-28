import { Router } from "express";
import {
  getMyPrescriptions,
  getPrescriptionByAppointment,
} from "../controller/medical_records.controller.js";
import { verifyPatientToken } from "../middleware/auth.middleware.js";

const medicalRecordsRouter = Router();

medicalRecordsRouter.use(verifyPatientToken);

/**
 * GET /medical-records/prescriptions
 * Returns all prescriptions for the authenticated patient.
 */
medicalRecordsRouter.get('/prescriptions', getMyPrescriptions);

/**
 * GET /medical-records/appointment/:appointmentId
 * Returns the prescription for a specific appointment.
 */
medicalRecordsRouter.get('/appointment/:appointmentId', getPrescriptionByAppointment);

export default medicalRecordsRouter;
