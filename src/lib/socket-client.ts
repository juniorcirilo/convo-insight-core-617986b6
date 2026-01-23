import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';

class SocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect() {
    if (this.socket?.connected) {
      return;
    }

    const token = localStorage.getItem('access_token');
    
    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ Socket connected:', this.socket?.id);
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
        this.disconnect();
      }
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // Conversation subscriptions
  subscribeToConversation(conversationId: string, callback: (data: any) => void) {
    if (!this.socket) {
      console.warn('Socket not connected');
      return;
    }

    this.socket.emit('subscribe:conversation', conversationId);
    this.socket.on('conversation:update', callback);
    
    console.log(`📡 Subscribed to conversation: ${conversationId}`);
  }

  unsubscribeFromConversation(conversationId: string, callback?: (data: any) => void) {
    if (!this.socket) return;

    this.socket.emit('unsubscribe:conversation', conversationId);
    if (callback) {
      this.socket.off('conversation:update', callback);
    }
    
    console.log(`📡 Unsubscribed from conversation: ${conversationId}`);
  }

  // Ticket subscriptions
  subscribeToTicket(ticketId: string, callback: (data: any) => void) {
    if (!this.socket) {
      console.warn('Socket not connected');
      return;
    }

    this.socket.emit('subscribe:ticket', ticketId);
    this.socket.on('ticket:update', callback);
    
    console.log(`📡 Subscribed to ticket: ${ticketId}`);
  }

  unsubscribeFromTicket(ticketId: string, callback?: (data: any) => void) {
    if (!this.socket) return;

    this.socket.emit('unsubscribe:ticket', ticketId);
    if (callback) {
      this.socket.off('ticket:update', callback);
    }
    
    console.log(`📡 Unsubscribed from ticket: ${ticketId}`);
  }

  // Generic event listener
  on(event: string, callback: (data: any) => void) {
    this.socket?.on(event, callback);
  }

  // Generic event emitter
  emit(event: string, data?: any) {
    this.socket?.emit(event, data);
  }

  // Remove event listener
  off(event: string, callback?: (data: any) => void) {
    if (callback) {
      this.socket?.off(event, callback);
    } else {
      this.socket?.off(event);
    }
  }
}

// Singleton instance
export const socketClient = new SocketClient();

// Auto-connect when user is logged in
if (localStorage.getItem('access_token')) {
  socketClient.connect();
}

export default socketClient;
