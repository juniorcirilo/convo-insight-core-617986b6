import { Router } from 'express';
import authRoutes from './auth.js';
import storageRoutes from './storage.js';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/storage', storageRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
