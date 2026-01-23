import { Router } from 'express';
import multer from 'multer';
import { StorageController } from '../controllers/storage.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

router.post('/:bucket/upload', authMiddleware, upload.single('file'), StorageController.upload);
router.get('/:bucket/:fileName', StorageController.download);
router.delete('/:bucket/:fileName', authMiddleware, StorageController.delete);
router.get('/:bucket/:fileName/url', StorageController.getPresignedUrl);

export default router;
