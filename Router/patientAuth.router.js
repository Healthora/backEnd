import { Router } from "express";
import {
    checkPhone,
    verifyOtp,
    patientSignUp,
    logout,
    updateProfile
} from "../controller/patient.auth.controller.js";
import { verifyPatientToken } from "../middleware/auth.middleware.js";

const patientAuthRouter = Router();

// Route to check if patient phone number exists
patientAuthRouter.post('/check-phone', checkPhone);

// Mock OTP verification (currently accepts any OTP)
patientAuthRouter.post('/verify-otp', verifyOtp);

// Route for patient signup
patientAuthRouter.post('/signup', patientSignUp);

// Update profile route (protected)
patientAuthRouter.put('/profile', verifyPatientToken, updateProfile);

// Logout route
patientAuthRouter.post('/logout', logout);

export default patientAuthRouter;
