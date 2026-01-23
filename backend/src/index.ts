import express from 'express';
import helmet from 'helmet';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { config } from './config/env.js';
import { initializeBuckets } from './config/minio.js';
import { corsMiddleware } from './middleware/cors.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: config.cors.origin || '*',
    methods: ['GET', 'POST']
  },
  path: '/socket.io'
});

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

// Socket.IO handling
io.on('connection', (socket) => {
  console.log(`Socket.IO client connected: ${socket.id}`);

  // Handle ping-pong for connection testing
  socket.on('ping', (data) => {
    console.log('Received ping:', data);
    socket.emit('pong', { ...data, timestamp: Date.now() });
  });

  // Handle custom events
  socket.on('message', (data) => {
    console.log('Received message:', data);
    // Broadcast to all clients except sender
    socket.broadcast.emit('message', data);
  });

  // Handle room joining
  socket.on('join-room', (room: string) => {
    console.log(`Client ${socket.id} joining room: ${room}`);
    socket.join(room);
    socket.emit('joined-room', room);
  });

  // Handle room leaving
  socket.on('leave-room', (room: string) => {
    console.log(`Client ${socket.id} leaving room: ${room}`);
    socket.leave(room);
    socket.emit('left-room', room);
  });

  socket.on('disconnect', (reason) => {
    console.log(`Socket.IO client disconnected: ${socket.id}, reason: ${reason}`);
  });

  socket.on('error', (error) => {
    console.error('Socket.IO error:', error);
  });
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down gracefully...');
  
  // Close all Socket.IO connections
  io.close(() => {
    console.log('Socket.IO server closed');
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
      const port = config.server.port.toString();
      const apiUrl = `http://localhost:${port}/api`;
      const socketUrl = `http://localhost:${port}`;
      
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║  🚀 ConvoInsight Backend Server                          ║
║                                                           ║
║  Environment: ${config.server.nodeEnv.padEnd(42)}║
║  Port:        ${port.padEnd(42)}║
║  API:         ${apiUrl.padEnd(42)}║
║  Socket.IO:   ${socketUrl.padEnd(42)}║
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

// Export io instance for use in other modules
export { io };
