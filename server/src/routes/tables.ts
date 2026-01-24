import { Router, Request, Response } from 'express';
import { db } from '../db';
import { escalationNotifications, whatsappInstances } from '../db/schema/index';
import { eq } from 'drizzle-orm';

const router = Router();

// GET /api/escalation_notifications?user_id=...
router.get('/escalation_notifications', async (req: Request, res: Response) => {
  try {
    const { user_id } = req.query;

    let q = db.select().from(escalationNotifications);

    if (user_id) {
      q = q.where(eq(escalationNotifications.userId, String(user_id)) as any) as any;
    }

    const data = await q.orderBy(escalationNotifications.createdAt as any);
    res.json(data);
  } catch (error) {
    console.error('Error fetching escalation_notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/whatsapp_instances?status=...
router.get('/whatsapp_instances', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;

    let q = db.select().from(whatsappInstances);

    if (status) {
      q = q.where(eq(whatsappInstances.status, String(status)) as any) as any;
    }

    const data = await q.orderBy(whatsappInstances.createdAt as any);
    res.json(data);
  } catch (error) {
    console.error('Error fetching whatsapp_instances:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
