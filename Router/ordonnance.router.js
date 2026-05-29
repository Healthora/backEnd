import { Router } from "express";
import {
  createOrdonnance,
  getOrdonnancesByPatientId,
  getOrdonnancesByDoctor,
  updateOrdonnance,
  deleteOrdonnance,
} from "../controller/ordonnance.controller.js";
import { verifyToken, checkPermission } from "../middleware/auth.middleware.js";

const ordonnanceRouter = Router();

ordonnanceRouter.use(verifyToken);

ordonnanceRouter.get('/', (req, res) => {
  res.send("Ordonnance route is working");
});

ordonnanceRouter.post('/', checkPermission('ordonnance', 'add'), createOrdonnance);

ordonnanceRouter.get('/patient/:patient_id', checkPermission('ordonnance', 'view'), getOrdonnancesByPatientId);
ordonnanceRouter.get('/doctor/:doctor_id', checkPermission('ordonnance', 'view'), getOrdonnancesByDoctor);

ordonnanceRouter.put('/:id', checkPermission('ordonnance', 'update'), updateOrdonnance);
ordonnanceRouter.delete('/:id', checkPermission('ordonnance', 'delete'), deleteOrdonnance);

export default ordonnanceRouter;