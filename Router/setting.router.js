import { Router } from "express";
import { 
    updateProfilSetting, 
    updateCabinetSetting, 
    updateRDVSetting, 
    uploadDoctorImage, 
    upload,
    getAssistants,
    addAssistant,
    updateAssistant,
    deleteAssistant
} from '../controller/setting.controller.js'
import { verifyToken } from '../middleware/auth.middleware.js'

const settingRouter = Router();

settingRouter.put('/handleSendProfilSetting', verifyToken, updateProfilSetting)
settingRouter.put('/handleCabinetSetting', verifyToken, updateCabinetSetting)
settingRouter.put('/handleRDVSetting', verifyToken, updateRDVSetting)
settingRouter.post('/uploadDoctorImage', verifyToken, upload.single('image'), uploadDoctorImage)

// Assistants routes
settingRouter.get('/assistants', verifyToken, getAssistants)
settingRouter.post('/assistants', verifyToken, addAssistant)
settingRouter.put('/assistants/:id', verifyToken, updateAssistant)
settingRouter.delete('/assistants/:id', verifyToken, deleteAssistant)

export default settingRouter;