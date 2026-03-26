import { Router } from "express";
import {
    checkPhone,
    verifyOtp,
    patientSignUp
} from "../controller/patient.auth.controller.js";

const patientAuthRouter = Router();

// Route to check if patient phone number exists
patientAuthRouter.post('/check-phone', checkPhone);

// Mock OTP verification (currently accepts any OTP)
patientAuthRouter.post('/verify-otp', verifyOtp);

// Route for patient signup
patientAuthRouter.post('/signup', patientSignUp);

export default patientAuthRouter;
