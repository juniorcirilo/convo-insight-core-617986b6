import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import conversationRoutes from './routes/conversations';
import storageRoutes from './routes/storage';
import whatsappRoutes from './routes/whatsapp';
import aiRoutes from './routes/ai';
import campaignRoutes from './routes/campaigns';
import leadRoutes from './routes/leads';
import escalationRoutes from './routes/escalations';
import meetingRoutes from './routes/meetings';
import knowledgeRoutes from './routes/knowledge';
import adminRoutes from './routes/admin';
import teamRoutes from './routes/team';
import setupRoutes from './routes/setup';
import tablesRoutes from './routes/tables';
import ticketsRoutes from './routes/tickets';
import integrationsRoutes from './routes/integrations';
import audioRoutes from './routes/audio';
import functionsRoutes from './routes/functions';

const app = express();
const PORT = process.env.PORT || 3000;

// CORS - MUST come BEFORE any other middleware
// Disable CORS restrictions entirely for development
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Range', 'apikey'],
  exposedHeaders: ['Content-Range', 'X-Total-Count'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));

console.log('🔓 CORS is DISABLED - allowing all origins');

// Security middleware (with relaxed settings for CORS)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'unsafe-none' },
}))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  // Skip rate limiting for auth routes and all GET requests (frontend polling can be frequent).
  // In production you may want to tighten this rule or whitelist specific endpoints instead.
  skip: (req) => req.path.includes('/auth/') || req.method === 'GET',
});
app.use('/api/', limiter);

// Body parsing middleware - MUST come before routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, {
    body: req.body,
    contentType: req.headers['content-type'],
  });
  next();
});

// Logging
app.use(morgan('combined'));

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/escalations', escalationRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/functions', functionsRoutes);
// Generic lightweight table endpoints used by the local API client
app.use('/api', tablesRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  // Include stack trace in development for easier debugging
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({ 
    error: 'Internal server error',
    message: isDev ? (err.message || 'No message') : undefined,
    stack: isDev && (err as any).stack ? (err as any).stack.split('\n').slice(0,10) : undefined,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});

export default app;
