import { Router } from 'express';
import { storageController, uploadMiddleware } from '../controllers/storageController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// All storage routes require authentication
router.use(authMiddleware);

router.post('/upload', uploadMiddleware, storageController.upload);
router.get('/:bucket/:filename', storageController.getFile);
router.delete('/:bucket/:filename', storageController.deleteFile);
router.get('/:bucket/list', storageController.listFiles);

export default router;
