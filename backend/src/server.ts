import http from 'http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { initializeBuckets } from './config/minio.js';

const app = createApp();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: env.CORS_ORIGIN,
    credentials: true,
  },
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Subscribe to conversation updates
  socket.on('subscribe:conversation', (conversationId: string) => {
    socket.join(`conversation:${conversationId}`);
    console.log(`Socket ${socket.id} subscribed to conversation:${conversationId}`);
  });

  // Subscribe to ticket updates
  socket.on('subscribe:ticket', (ticketId: string) => {
    socket.join(`ticket:${ticketId}`);
    console.log(`Socket ${socket.id} subscribed to ticket:${ticketId}`);
  });

  // Unsubscribe from conversation
  socket.on('unsubscribe:conversation', (conversationId: string) => {
    socket.leave(`conversation:${conversationId}`);
  });

  // Unsubscribe from ticket
  socket.on('unsubscribe:ticket', (ticketId: string) => {
    socket.leave(`ticket:${ticketId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Export io for use in services
export { io };

// Start server
async function startServer() {
  try {
    // Initialize MinIO buckets
    await initializeBuckets();
    console.log('MinIO buckets initialized');

    const port = parseInt(env.PORT);
    server.listen(port, '0.0.0.0', () => {
      console.log(`Server running on port ${port}`);
      console.log(`Environment: ${env.NODE_ENV}`);
      console.log(`API URL: ${env.API_URL}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
