import { Router, Request, Response } from 'express';
import { db } from '../db';
import { whatsappConversations, whatsappMessages, whatsappContacts } from '../db/schema';
import { authenticate, AuthRequest } from '../middleware/auth';
import { eq, desc, and, or, sql, ilike } from 'drizzle-orm';

const router = Router();

// Get conversations
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { status, assignedTo, search } = req.query;

    let query = db
      .select({
        id: whatsappConversations.id,
        contactId: whatsappConversations.contactId,
        contactPhone: whatsappConversations.contactPhone,
        contactName: whatsappContacts.name,
        lastMessageAt: whatsappConversations.lastMessageAt,
        lastMessagePreview: whatsappConversations.lastMessagePreview,
        unreadCount: whatsappConversations.unreadCount,
        status: whatsappConversations.status,
        assignedTo: whatsappConversations.assignedTo,
        conversationMode: whatsappConversations.conversationMode,
        category: whatsappConversations.category,
        currentSentiment: whatsappConversations.currentSentiment,
        createdAt: whatsappConversations.createdAt,
      })
      .from(whatsappConversations)
      .leftJoin(whatsappContacts, eq(whatsappConversations.contactId, whatsappContacts.id));

    if (status) {
      query = query.where(eq(whatsappConversations.status, status as string)) as any;
    }

    if (assignedTo) {
      query = query.where(eq(whatsappConversations.assignedTo, assignedTo as string)) as any;
    }

    if (search) {
      const searchTerm = `%${search}%`;
      query = query.where(
        or(
          ilike(whatsappContacts.name, searchTerm),
          ilike(whatsappConversations.contactPhone, searchTerm)
        )
      ) as any;
    }

    const conversations = await query.orderBy(desc(whatsappConversations.lastMessageAt));

    res.json({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get conversation by ID
router.get('/:conversationId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;

    const [conversation] = await db
      .select()
      .from(whatsappConversations)
      .where(eq(whatsappConversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get messages
    const messages = await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversationId, conversationId))
      .orderBy(whatsappMessages.timestamp);

    // Get contact
    const [contact] = await db
      .select()
      .from(whatsappContacts)
      .where(eq(whatsappContacts.id, conversation.contactId))
      .limit(1);

    res.json({ conversation, messages, contact });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update conversation
router.put('/:conversationId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const updates = req.body;

    const [updated] = await db
      .update(whatsappConversations)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversationId))
      .returning();

    res.json({ success: true, conversation: updated });
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark as read
router.post('/:conversationId/read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;

    await db
      .update(whatsappConversations)
      .set({
        unreadCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversationId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign conversation
router.post('/:conversationId/assign', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { assignedTo } = req.body;

    await db
      .update(whatsappConversations)
      .set({
        assignedTo,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversationId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error assigning conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change conversation mode
router.post('/:conversationId/mode', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { mode } = req.body;

    if (!['ai', 'human', 'hybrid'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    await db
      .update(whatsappConversations)
      .set({
        conversationMode: mode,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversationId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error changing mode:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
