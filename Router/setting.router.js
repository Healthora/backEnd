import { Router } from "express";
import { updateProfilSetting, updateCabinetSetting, updateRDVSetting, uploadDoctorImage, upload } from '../controller/setting.controller.js'
import { verifyToken } from '../middleware/auth.middleware.js'

const settingRouter = Router();

settingRouter.put('/handleSendProfilSetting', verifyToken, updateProfilSetting)
settingRouter.put('/handleCabinetSetting', verifyToken, updateCabinetSetting)
settingRouter.put('/handleRDVSetting', verifyToken, updateRDVSetting)
settingRouter.post('/uploadDoctorImage', verifyToken, upload.single('image'), uploadDoctorImage)


export default settingRouter;