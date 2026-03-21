// Router/auth.router.js
import { Router } from "express";
import {
    signIn,
    signUp,
    signOut,
    getCurrentDoctor,
    forgotPassword,
    resetPassword,
} from "../controller/auth.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const authRouter = Router();

authRouter.post('/signup', signUp);

authRouter.post('/signin', signIn);

authRouter.post('/signout', verifyToken, signOut);

authRouter.get('/me', verifyToken, getCurrentDoctor);

authRouter.post('/forgot-password', forgotPassword);
authRouter.post('/reset-password', resetPassword);

export default authRouter;