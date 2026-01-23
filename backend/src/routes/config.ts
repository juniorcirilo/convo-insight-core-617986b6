import { Router } from 'express';
import { configController } from '../controllers/configController.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

// All config routes require authentication
router.use(authMiddleware);

// Setup project (admin only)
router.post('/setup', requireRole(['admin']), configController.setupProject);

// Config CRUD (admin only)
router.post('/', requireRole(['admin']), configController.setConfig);
router.get('/', configController.getAllConfig);
router.get('/:key', configController.getConfig);
router.delete('/:key', requireRole(['admin']), configController.deleteConfig);

export default router;
