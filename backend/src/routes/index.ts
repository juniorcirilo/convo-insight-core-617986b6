import { Router } from 'express';
import authRoutes from './auth.js';
import storageRoutes from './storage.js';
import whatsappRoutes from './whatsapp.js';
import configRoutes from './config.js';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/storage', storageRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/config', configRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
