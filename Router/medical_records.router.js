import { Router } from "express";
import {
  getMyPrescriptions,
  getPrescriptionByAppointment,
  createConsultationRecord,
  getPatientConsultationHistory,
  deleteConsultationRecord,
  getMyDossier
} from "../controller/medical_records.controller.js";
import { verifyPatientToken, verifyToken } from "../middleware/auth.middleware.js";
import multer from "multer";

const storage = multer.memoryStorage();
const uploadDocs = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limit for documents
});
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

medicalRecordsRouter.post('/consultation', verifyToken, uploadDocs.any(), createConsultationRecord);
medicalRecordsRouter.get('/consultation/patient/:patientId', verifyToken, getPatientConsultationHistory);
medicalRecordsRouter.delete('/consultation/:id', verifyToken, deleteConsultationRecord);

// ─── PATIENT DOSSIER (PATIENT) ──────────────────────────────────────────────

medicalRecordsRouter.get('/my-dossier', verifyPatientToken, getMyDossier);

export default medicalRecordsRouter;
