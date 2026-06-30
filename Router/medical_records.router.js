import { Router } from "express";
import {
  getMyPrescriptions,
  getPrescriptionByAppointment,
  createConsultationRecord,
  getPatientConsultationHistory,
  getMyDossier
} from "../controller/medical_records.controller.js";
import { verifyPatientToken, verifyToken } from "../middleware/auth.middleware.js";
import { upload } from "../controller/setting.controller.js";

const medicalRecordsRouter = Router();

/**
 * GET /medical-records/prescriptions
 * Returns all prescriptions for the authenticated patient.
 */
medicalRecordsRouter.get('/prescriptions', verifyPatientToken, getMyPrescriptions);

/**
 * GET /medical-records/appointment/:appointmentId
 * Returns the prescription for a specific appointment.
 */
medicalRecordsRouter.get('/appointment/:appointmentId', verifyPatientToken, getPrescriptionByAppointment);

// ─── CONSULTATION RECORDS (DOCTOR) ──────────────────────────────────────────

medicalRecordsRouter.post('/consultation', verifyToken, upload.any(), createConsultationRecord);
medicalRecordsRouter.get('/consultation/patient/:patientId', verifyToken, getPatientConsultationHistory);

// ─── PATIENT DOSSIER (PATIENT) ──────────────────────────────────────────────

medicalRecordsRouter.get('/my-dossier', verifyPatientToken, getMyDossier);

export default medicalRecordsRouter;
