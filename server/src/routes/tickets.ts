import { Router, Request, Response } from 'express';
import { db } from '../db';
import { tickets, slaConfig, slaViolations } from '../db/schema/tickets';
import { whatsappConversations } from '../db/schema/whatsapp';
import { authenticate, requireRole } from '../middleware/auth';
import { eq, and, sql, inArray, isNull } from 'drizzle-orm';

const router = Router();

// Get all tickets
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { status, sectorId } = req.query;

    let query = db.select().from(tickets);

    if (status) {
      query = query.where(eq(tickets.status, status as string)) as any;
    }

    if (sectorId) {
      query = query.where(eq(tickets.sectorId, sectorId as string)) as any;
    }

    const allTickets = await query.orderBy(sql`${tickets.createdAt} DESC`);

    res.json({ tickets: allTickets });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ticket by ID
router.get('/:ticketId', authenticate, async (req: Request, res: Response) => {
  try {
    const ticketId = req.params.ticketId as string;

    const [ticket] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json({ ticket });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create ticket
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId, sectorId, priority } = req.body;

    if (!conversationId || !sectorId) {
      return res.status(400).json({ error: 'conversationId and sectorId are required' });
    }

    const [ticket] = await db.insert(tickets).values({
      conversationId,
      sectorId,
      status: 'aberto',
    }).returning();

    res.json({ success: true, ticket });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update ticket
router.put('/:ticketId', authenticate, async (req: Request, res: Response) => {
  try {
    const ticketId = req.params.ticketId as string;
    const updates = req.body;

    if (updates.status === 'finalizado' && !updates.closedAt) {
      updates.closedAt = new Date();
      updates.closedBy = req.user!.userId;
    }

    const [ticket] = await db
      .update(tickets)
      .set(updates)
      .where(eq(tickets.id, ticketId))
      .returning();

    res.json({ success: true, ticket });
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check SLA violations (cron job endpoint)
router.post('/sla/check-violations', authenticate, requireRole(['admin', 'supervisor']), async (req: Request, res: Response) => {
  try {
    console.log('[check-sla-violations] Starting SLA check...');

    // 1. Fetch all SLA configurations
    const slaConfigs = await db.select().from(slaConfig).where(eq(slaConfig.isActive, true));

    if (slaConfigs.length === 0) {
      console.log('[check-sla-violations] No SLA configs found');
      return res.json({ success: true, message: 'No SLA configs to check' });
    }

    // Create a map of sectorId -> SLA config for quick lookup
    const slaMap = new Map<string, typeof slaConfigs[0]>();
    for (const config of slaConfigs) {
      if (config.sectorId) {
        slaMap.set(config.sectorId, config);
      }
    }

    // 2. Fetch all open tickets
    const openTickets = await db
      .select()
      .from(tickets)
      .where(inArray(tickets.status, ['aberto', 'em_atendimento']));

    console.log(`[check-sla-violations] Found ${openTickets.length} open tickets to check`);

    if (openTickets.length === 0) {
      return res.json({ success: true, message: 'No tickets to check' });
    }

    const now = new Date();
    const violations: { ticketId: string; violationType: string; expectedAt: Date }[] = [];

    for (const ticket of openTickets) {
      const ticketSlaConfig = slaMap.get(ticket.sectorId);
      if (!ticketSlaConfig) {
        continue;
      }

      const ticketCreatedAt = new Date(ticket.createdAt);

      // Check first response SLA (only if status is 'aberto')
      if (ticket.status === 'aberto' && ticketSlaConfig.firstResponseTimeMinutes) {
        const expectedFirstResponseAt = new Date(
          ticketCreatedAt.getTime() + ticketSlaConfig.firstResponseTimeMinutes * 60 * 1000
        );

        if (now > expectedFirstResponseAt) {
          // Check if violation already exists
          const [existingViolation] = await db
            .select()
            .from(slaViolations)
            .where(
              and(
                eq(slaViolations.ticketId, ticket.id),
                eq(slaViolations.violationType, 'first_response')
              )
            )
            .limit(1);

          if (!existingViolation) {
            violations.push({
              ticketId: ticket.id,
              violationType: 'first_response',
              expectedAt: expectedFirstResponseAt,
            });
          }
        }
      }

      // Check resolution SLA
      if (ticketSlaConfig.resolutionTimeMinutes) {
        const expectedResolutionAt = new Date(
          ticketCreatedAt.getTime() + ticketSlaConfig.resolutionTimeMinutes * 60 * 1000
        );

        if (now > expectedResolutionAt) {
          // Check if violation already exists
          const [existingViolation] = await db
            .select()
            .from(slaViolations)
            .where(
              and(
                eq(slaViolations.ticketId, ticket.id),
                eq(slaViolations.violationType, 'resolution')
              )
            )
            .limit(1);

          if (!existingViolation) {
            violations.push({
              ticketId: ticket.id,
              violationType: 'resolution',
              expectedAt: expectedResolutionAt,
            });
          }
        }
      }
    }

    console.log(`[check-sla-violations] Found ${violations.length} new violations`);

    // 3. Record violations
    for (const violation of violations) {
      // Get ticket to find sla config
      const [ticketRecord] = await db
        .select()
        .from(tickets)
        .where(eq(tickets.id, violation.ticketId))
        .limit(1);

      const slaConfigForTicket = ticketRecord ? slaMap.get(ticketRecord.sectorId) : null;

      await db.insert(slaViolations).values({
        ticketId: violation.ticketId,
        slaConfigId: slaConfigForTicket?.id,
        violationType: violation.violationType,
      });
    }

    console.log('[check-sla-violations] SLA check completed successfully');

    res.json({
      success: true,
      ticketsChecked: openTickets.length,
      violationsFound: violations.length,
    });
  } catch (error) {
    console.error('[check-sla-violations] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get SLA config
router.get('/sla/config', authenticate, async (req: Request, res: Response) => {
  try {
    const { sectorId } = req.query;

    if (sectorId) {
      const [config] = await db
        .select()
        .from(slaConfig)
        .where(eq(slaConfig.sectorId, sectorId as string))
        .limit(1);
      return res.json({ config });
    }

    const configs = await db.select().from(slaConfig);
    res.json({ configs });
  } catch (error) {
    console.error('Error fetching SLA config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create/Update SLA config
router.post('/sla/config', authenticate, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const {
      sectorId,
      firstResponseTimeMinutes,
      resolutionTimeMinutes,
      priorityEscalationEnabled,
      escalationThresholdMinutes,
      workingHoursStart,
      workingHoursEnd,
      workingDays,
    } = req.body;

    // Check if config exists for sector
    const [existing] = await db
      .select()
      .from(slaConfig)
      .where(eq(slaConfig.sectorId, sectorId))
      .limit(1);

    if (existing) {
      // Update
      const [updated] = await db
        .update(slaConfig)
        .set({
          firstResponseTimeMinutes,
          resolutionTimeMinutes,
          priorityEscalationEnabled,
          escalationThresholdMinutes,
          workingHoursStart,
          workingHoursEnd,
          workingDays,
          updatedAt: new Date(),
        })
        .where(eq(slaConfig.id, existing.id))
        .returning();

      return res.json({ success: true, config: updated });
    }

    // Create
    const [config] = await db.insert(slaConfig).values({
      sectorId,
      firstResponseTimeMinutes,
      resolutionTimeMinutes,
      priorityEscalationEnabled,
      escalationThresholdMinutes,
      workingHoursStart,
      workingHoursEnd,
      workingDays,
    }).returning();

    res.json({ success: true, config });
  } catch (error) {
    console.error('Error saving SLA config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get SLA violations
router.get('/sla/violations', authenticate, async (req: Request, res: Response) => {
  try {
    const { ticketId, violationType } = req.query;

    let query = db.select().from(slaViolations);

    if (ticketId) {
      query = query.where(eq(slaViolations.ticketId, ticketId as string)) as any;
    }

    if (violationType) {
      query = query.where(eq(slaViolations.violationType, violationType as string)) as any;
    }

    const allViolations = await query.orderBy(sql`${slaViolations.createdAt} DESC`);

    res.json({ violations: allViolations });
  } catch (error) {
    console.error('Error fetching SLA violations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
