import { Router } from 'express';
import { getSpecialities } from '../controller/speciality.controller.js';

const specialityRouter = Router();

specialityRouter.get('/', getSpecialities);

export default specialityRouter;
