import { Router } from 'express';
import { whatsappController } from '../controllers/whatsappController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// All WhatsApp routes require authentication
router.use(authMiddleware);

// Send message
router.post('/send', whatsappController.sendMessage);

// Get conversation details
router.get('/conversations/:conversationId', whatsappController.getConversation);

// Get messages for a conversation
router.get('/conversations/:conversationId/messages', whatsappController.getMessages);

// Update message status
router.patch('/messages/:messageId/status', whatsappController.updateMessageStatus);

export default router;
