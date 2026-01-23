import express, { Application } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error.js';
import { env } from './config/env.js';
import authRoutes from './routes/auth.routes.js';

export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(corsMiddleware);

  // Rate limiting
  const limiter = rateLimit({
    windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS),
    max: parseInt(env.RATE_LIMIT_MAX_REQUESTS),
    message: 'Too many requests from this IP, please try again later.',
  });
  app.use('/api/', limiter);

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api/auth', authRoutes);
  
  // Storage routes will be added
  // app.use('/api/storage', storageRoutes);

  // Error handling
  app.use(errorHandler);

  return app;
}
