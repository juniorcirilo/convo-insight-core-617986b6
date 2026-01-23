import express from 'express';
import helmet from 'helmet';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { config } from './config/env.js';
import { initializeBuckets } from './config/minio.js';
import { corsMiddleware } from './middleware/cors.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Middleware
app.use(helmet());
app.use(corsMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(rateLimitMiddleware);

// Routes
app.use('/api', routes);

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// WebSocket handling
wss.on('connection', (ws, req) => {
  console.log('WebSocket client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received WebSocket message:', data);
      
      // Echo back for now - implement proper message handling later
      ws.send(JSON.stringify({ type: 'pong', data }));
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down gracefully...');
  
  wss.clients.forEach((client) => {
    client.close();
  });
  
  wss.close(() => {
    console.log('WebSocket server closed');
  });
  
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const start = async () => {
  try {
    // Initialize MinIO buckets
    await initializeBuckets();

    // Start server
    server.listen(config.server.port, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║  🚀 ConvoInsight Backend Server                          ║
║                                                           ║
║  Environment: ${config.server.nodeEnv.padEnd(42)}║
║  Port:        ${config.server.port.toString().padEnd(42)}║
║  API:         http://localhost:${config.server.port}/api${' '.repeat(21)}║
║  WebSocket:   ws://localhost:${config.server.port}/ws${' '.repeat(23)}║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();
