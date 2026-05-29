import { Router } from 'express';
import { createAppointment, getAppointments, updateAppointmentStatus, updateAppointment, deleteAppointment, getAppointmentsByPatient, getAvailableSlots } from '../controller/appointment.controller.js';
import { verifyToken, checkPermission } from '../middleware/auth.middleware.js';

const appointmentRouter = Router();

appointmentRouter.use(verifyToken);

appointmentRouter.post('/', checkPermission('appointment', 'add'), createAppointment);
appointmentRouter.get('/available-slots', checkPermission('appointment', 'view'), getAvailableSlots);
appointmentRouter.get('/doctor/:doctorId', checkPermission('appointment', 'view'), getAppointments);
appointmentRouter.get('/patient/:patientId', checkPermission('appointment', 'view'), getAppointmentsByPatient);
appointmentRouter.put('/:id/status', checkPermission('appointment', 'update'), updateAppointmentStatus);
appointmentRouter.put('/:id', checkPermission('appointment', 'update'), updateAppointment);


appointmentRouter.delete('/:id', checkPermission('appointment', 'delete'), deleteAppointment);

export default appointmentRouter;
