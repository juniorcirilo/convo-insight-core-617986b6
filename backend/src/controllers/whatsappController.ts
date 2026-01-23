import { Request, Response } from 'express';
import { whatsappService } from '../services/whatsappService.js';
import { AuthRequest } from '../middleware/auth.js';

export const whatsappController = {
  async sendMessage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await whatsappService.sendMessage(req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send message';
      console.error('Send message error:', error);
      res.status(500).json({ success: false, error: message });
    }
  },

  async getConversation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const conversation = await whatsappService.getConversation(conversationId);

      if (!conversation) {
        res.status(404).json({ success: false, error: 'Conversation not found' });
        return;
      }

      res.json({ success: true, data: conversation });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get conversation';
      res.status(500).json({ success: false, error: message });
    }
  },

  async getMessages(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const messages = await whatsappService.getMessages(conversationId, limit, offset);
      res.json({ success: true, data: messages });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get messages';
      res.status(500).json({ success: false, error: message });
    }
  },

  async updateMessageStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const { status } = req.body;

      const message = await whatsappService.updateMessageStatus(messageId, status);
      res.json({ success: true, data: message });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update message status';
      res.status(500).json({ success: false, error: message });
    }
  },
};
