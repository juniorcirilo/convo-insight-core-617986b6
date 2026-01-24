import { Router, Request, Response } from 'express';
import { db } from '../db';
import { leads, leadActivities, leadStatusHistory } from '../db/schema/index';
import { authenticate } from '../middleware/auth';
import { eq, desc, sql } from 'drizzle-orm';

const router = Router();

// Create lead
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      contactId,
      name,
      email,
      phone,
      company,
      source,
      notes,
      estimatedValue,
      expectedCloseDate,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const [lead] = await db.insert(leads).values({
      contactId,
      name,
      email,
      phone,
      company,
      source,
      status: 'new',
      notes,
      estimatedValue,
      expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null,
      assignedTo: req.user!.userId,
    }).returning();

    // Record initial status
    await db.insert(leadStatusHistory).values({
      leadId: lead.id,
      status: 'new',
      changedBy: req.user!.userId,
    });

    res.json({ success: true, lead });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get leads
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { status, assignedTo } = req.query;

    let query = db.select().from(leads);

    if (status) {
      query = query.where(eq(leads.status, status as string)) as any;
    }

    if (assignedTo) {
      query = query.where(eq(leads.assignedTo, assignedTo as string)) as any;
    }

    const allLeads = await query.orderBy(desc(leads.createdAt));

    res.json({ leads: allLeads });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get lead by ID
router.get('/:leadId', authenticate, async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;

    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Get activities
    const activities = await db
      .select()
      .from(leadActivities)
      .where(eq(leadActivities.leadId, leadId))
      .orderBy(desc(leadActivities.createdAt));

    // Get status history
    const history = await db
      .select()
      .from(leadStatusHistory)
      .where(eq(leadStatusHistory.leadId, leadId))
      .orderBy(desc(leadStatusHistory.changedAt));

    res.json({ lead, activities, history });
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update lead
router.put('/:leadId', authenticate, async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const updates = req.body;

    // If status is changing, record it
    if (updates.status) {
      const [currentLead] = await db
        .select()
        .from(leads)
        .where(eq(leads.id, leadId))
        .limit(1);

      if (currentLead && currentLead.status !== updates.status) {
        await db.insert(leadStatusHistory).values({
          leadId,
          status: updates.status,
          changedBy: req.user!.userId,
          notes: updates.statusChangeNotes,
        });
      }
    }

    const [updated] = await db
      .update(leads)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId))
      .returning();

    res.json({ success: true, lead: updated });
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add activity to lead
router.post('/:leadId/activities', authenticate, async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const { type, description, outcome, scheduledFor } = req.body;

    if (!type || !description) {
      return res.status(400).json({ error: 'Type and description are required' });
    }

    const [activity] = await db.insert(leadActivities).values({
      leadId,
      type,
      description,
      outcome,
      performedBy: req.user!.userId,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    }).returning();

    res.json({ success: true, activity });
  } catch (error) {
    console.error('Error adding activity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Qualify lead with AI
router.post('/:leadId/qualify', authenticate, async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;

    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    // Get lead activities for context
    const activities = await db
      .select()
      .from(leadActivities)
      .where(eq(leadActivities.leadId, leadId))
      .orderBy(desc(leadActivities.createdAt))
      .limit(10);

    const prompt = `Analise este lead e forneça uma qualificação BANT (Budget, Authority, Need, Timeline).
Retorne um JSON com:
- budget_score: 0-10
- authority_score: 0-10
- need_score: 0-10
- timeline_score: 0-10
- overall_score: 0-10
- recommendation: "qualified", "nurture", ou "disqualify"
- reasoning: explicação breve

Lead:
- Nome: ${lead.name}
- Empresa: ${lead.company || 'N/A'}
- Valor estimado: ${lead.estimatedValue || 'N/A'}
- Fonte: ${lead.source || 'N/A'}
- Notas: ${lead.notes || 'Nenhuma'}

Atividades recentes:
${activities.map(a => `- ${a.type}: ${a.description}`).join('\n')}`;

    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      return res.status(500).json({ error: 'AI service error' });
    }

    const aiData = await aiResponse.json();
    const qualificationText = aiData.choices[0]?.message?.content || '{}';
    const qualification = JSON.parse(qualificationText.replace(/```json\n?|\n?```/g, ''));

    // Update lead with qualification score
    await db
      .update(leads)
      .set({
        qualificationScore: qualification.overall_score,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));

    // Add activity
    await db.insert(leadActivities).values({
      leadId,
      type: 'qualification',
      description: `Qualificação AI: ${qualification.recommendation}`,
      outcome: qualification.reasoning,
      performedBy: req.user!.userId,
    });

    res.json({ success: true, qualification });
  } catch (error) {
    console.error('Error qualifying lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete lead
router.delete('/:leadId', authenticate, async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;

    await db
      .delete(leads)
      .where(eq(leads.id, leadId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
