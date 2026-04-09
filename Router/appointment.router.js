import { Router } from 'express';
import { createAppointment, getAppointments, updateAppointmentStatus, updateAppointment, deleteAppointment, getAppointmentsByPatient, getAvailableSlots } from '../controller/appointment.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const appointmentRouter = Router();

appointmentRouter.use(verifyToken);

appointmentRouter.post('/', createAppointment);
appointmentRouter.get('/available-slots', getAvailableSlots);
appointmentRouter.get('/doctor/:doctorId', getAppointments);
appointmentRouter.get('/patient/:patientId', getAppointmentsByPatient);
appointmentRouter.put('/:id/status', updateAppointmentStatus);
appointmentRouter.put('/:id', updateAppointment);


appointmentRouter.delete('/:id', deleteAppointment);

export default appointmentRouter;
