import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

// Use a lightweight PG client for these generic endpoints to avoid
// coupling to Drizzle schema names that may not be exported.
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'convo_insight',
});

const router = Router();

// GET /api/escalation_notifications?user_id=...
router.get('/escalation_notifications', async (req: Request, res: Response) => {
  try {
    const { user_id } = req.query;
    const params: any[] = [];
    let sql = 'SELECT * FROM escalation_notifications';
    if (user_id) {
      sql += ' WHERE user_id = $1';
      params.push(String(user_id));
    }
    sql += ' ORDER BY created_at DESC LIMIT 100';

    try {
      const { rows } = await pool.query(sql, params);
      return res.set('Cache-Control', 'no-store').status(200).json(rows ?? []);
    } catch (dbErr: any) {
      // If table doesn't exist, return empty array instead of 500
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table escalation_notifications not found, returning empty array');
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error('DB error fetching escalation_notifications:', dbErr);
      // Fail-safe: always return an array to callers (avoids undefined in React Query)
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching escalation_notifications:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// GET /api/whatsapp_instances?status=...
router.get('/whatsapp_instances', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const params: any[] = [];
    let sql = 'SELECT * FROM whatsapp_instances';
    if (status) {
      sql += ' WHERE status = $1';
      params.push(String(status));
    }
    sql += ' ORDER BY created_at DESC LIMIT 100';

    try {
      const { rows } = await pool.query(sql, params);
      return res.set('Cache-Control', 'no-store').status(200).json(rows ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table whatsapp_instances not found, returning empty array');
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error('DB error fetching whatsapp_instances:', dbErr);
      // Fail-safe: always return an array to callers
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching whatsapp_instances:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// GET /api/whatsapp_conversations?range=from:to
router.get('/whatsapp_conversations', async (req: Request, res: Response) => {
  try {
    const { range } = req.query;
    const params: any[] = [];
    let sql = 'SELECT * FROM whatsapp_conversations';

    if (range && typeof range === 'string') {
      // range format "from:to"
      const [fromStr, toStr] = range.split(':');
      const from = parseInt(fromStr || '0', 10);
      const to = parseInt(toStr || `${from + 19}`, 10);
      const limit = Math.max(0, to - from + 1);
      sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${from}`;
    } else {
      sql += ' ORDER BY created_at DESC LIMIT 20';
    }

    try {
      const { rows } = await pool.query(sql, params);
      return res.set('Cache-Control', 'no-store').status(200).json(rows ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table whatsapp_conversations not found, returning empty array');
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error('DB error fetching whatsapp_conversations:', dbErr);
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching whatsapp_conversations:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// GET /api/escalation_queue?status=pending,assigned&sector_id=...
router.get('/escalation_queue', async (req: Request, res: Response) => {
  try {
    const { status, sector_id } = req.query;
    const params: any[] = [];
    let sql = 'SELECT * FROM escalation_queue';

    const whereClauses: string[] = [];
    if (sector_id) {
      params.push(String(sector_id));
      whereClauses.push(`sector_id = $${params.length}`);
    }

    if (status && typeof status === 'string') {
      // status may be comma separated
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        const placeholders = statuses.map((_, i) => `$${params.length + i + 1}`);
        params.push(...statuses);
        whereClauses.push(`status IN (${placeholders.join(',')})`);
      }
    }

    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    sql += ' ORDER BY priority DESC, created_at ASC LIMIT 100';

    try {
      const { rows } = await pool.query(sql, params);
      return res.set('Cache-Control', 'no-store').status(200).json(rows ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table escalation_queue not found, returning empty array');
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error('DB error fetching escalation_queue:', dbErr);
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching escalation_queue:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// GET /api/sectors?is_active=true
router.get('/sectors', async (req: Request, res: Response) => {
  try {
    const { is_active } = req.query;
    const params: any[] = [];
    let sql = 'SELECT * FROM sectors';

    if (typeof is_active !== 'undefined') {
      // Accept 'true'/'false' strings
      const active = String(is_active) === 'true';
      params.push(active);
      sql += ` WHERE is_active = $${params.length}`;
    }

    sql += ' ORDER BY name ASC LIMIT 200';

    try {
      const { rows } = await pool.query(sql, params);
      return res.set('Cache-Control', 'no-store').status(200).json(rows ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table sectors not found, returning empty array');
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error('DB error fetching sectors:', dbErr);
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching sectors:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// Generic fallback for lightweight table queries (prevents 404s for missing optional tables)
// Matches simple table names composed of letters, numbers and underscores.
router.get('/:table', async (req: Request, res: Response) => {
  try {
    const table = String(req.params.table || '').trim();
    if (!/^[a-z0-9_]+$/i.test(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    // Basic paging and filter support
    const { limit, range, ...filters } = req.query;
    const params: any[] = [];
    const whereClauses: string[] = [];

    // Build WHERE clauses from query parameters (simple equality filters)
    for (const [key, value] of Object.entries(filters)) {
      if (typeof value === 'string' && /^[a-z0-9_]+$/i.test(key)) {
        params.push(value);
        whereClauses.push(`${key} = $${params.length}`);
      }
    }

    let sql = `SELECT * FROM ${table}`;
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (range && typeof range === 'string') {
      const [fromStr, toStr] = range.split(':');
      const from = parseInt(fromStr || '0', 10);
      const to = parseInt(toStr || `${from + 19}`, 10);
      const lim = Math.max(0, to - from + 1);
      sql += ` ORDER BY created_at DESC LIMIT ${lim} OFFSET ${from}`;
    } else if (limit) {
      const lim = parseInt(String(limit), 10) || 20;
      sql += ` ORDER BY created_at DESC LIMIT ${lim}`;
    } else {
      sql += ' ORDER BY created_at DESC LIMIT 100';
    }

    try {
      const { rows } = await pool.query(sql, params);
      return res.set('Cache-Control', 'no-store').status(200).json(rows ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn(`Table ${table} not found, returning empty array`);
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error(`DB error fetching ${table}:`, dbErr);
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error in generic table handler:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

export default router;