import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

type MessageHandler = (data: any) => void;

class SocketIOClient {
  private socket: Socket | null = null;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();

  connect() {
    if (this.socket?.connected) {
      return;
    }

    try {
      this.socket = io(SOCKET_URL, {
        path: '/socket.io',
        reconnection: true,
        reconnectionDelay: 5000,
        reconnectionAttempts: Infinity,
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        console.log('Socket.IO connected:', this.socket?.id);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('Socket.IO disconnected:', reason);
      });

      this.socket.on('connect_error', (error) => {
        console.error('Socket.IO connection error:', error);
      });

      // Setup event handlers
      this.setupEventHandlers();
    } catch (error) {
      console.error('Failed to create Socket.IO connection:', error);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  emit(event: string, data: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('Socket.IO is not connected');
    }
  }

  on(event: string, handler: MessageHandler) {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, new Set());
    }
    this.messageHandlers.get(event)!.add(handler);

    // Register the handler with socket if connected
    if (this.socket) {
      this.socket.on(event, handler);
    }
  }

  off(event: string, handler?: MessageHandler) {
    if (handler) {
      const handlers = this.messageHandlers.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.messageHandlers.delete(event);
        }
      }
      // Remove from socket
      if (this.socket) {
        this.socket.off(event, handler);
      }
    } else {
      // Remove all handlers for the event
      this.messageHandlers.delete(event);
      if (this.socket) {
        this.socket.off(event);
      }
    }
  }

  joinRoom(room: string) {
    if (this.socket?.connected) {
      this.socket.emit('join-room', room);
    }
  }

  leaveRoom(room: string) {
    if (this.socket?.connected) {
      this.socket.emit('leave-room', room);
    }
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    // Re-register all existing handlers
    this.messageHandlers.forEach((handlers, event) => {
      handlers.forEach((handler) => {
        this.socket!.on(event, handler);
      });
    });
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getSocketId(): string | undefined {
    return this.socket?.id;
  }
}

export const socketClient = new SocketIOClient();

// Auto-connect on import
if (typeof window !== 'undefined') {
  socketClient.connect();
}

// Export alias for backward compatibility
export const wsClient = socketClient;
