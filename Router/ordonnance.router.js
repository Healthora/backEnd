import { Router } from "express";
import {
  createOrdonnance,
  getOrdonnancesByPatient,
  getOrdonnancesByDoctor,
  updateOrdonnance,
  deleteOrdonnance,
} from "../controller/ordonnance.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const ordonnanceRouter = Router();

ordonnanceRouter.use(verifyToken);

ordonnanceRouter.get('/', (req, res) => {
  res.send("Ordonnance route is working");
});

ordonnanceRouter.post('/', createOrdonnance);

ordonnanceRouter.get('/patient/:patient_id', getOrdonnancesByPatient);
ordonnanceRouter.get('/doctor/:doctor_id', getOrdonnancesByDoctor);

ordonnanceRouter.put('/:id', updateOrdonnance);
ordonnanceRouter.delete('/:id', deleteOrdonnance);

export default ordonnanceRouter;