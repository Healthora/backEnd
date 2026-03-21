import { Router } from 'express';
import { getWilayas, getCommunesByWilaya } from '../controller/location.controller.js';

const locationRouter = Router();

// Public routes — no auth required (needed during signup)
locationRouter.get('/wilayas', getWilayas);
locationRouter.get('/communes/:wilayaId', getCommunesByWilaya);

export default locationRouter;
