import { Router, Request, Response } from 'express';
import { db } from '../db';
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
      res.json(rows);
    } catch (dbErr: any) {
      // If table doesn't exist, return empty array instead of 500
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table escalation_notifications not found, returning empty array');
        return res.json([]);
      }
      throw dbErr;
    }
  } catch (error) {
    console.error('Error fetching escalation_notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
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
      res.json(rows);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table whatsapp_instances not found, returning empty array');
        return res.json([]);
      }
      throw dbErr;
    }
  } catch (error) {
    console.error('Error fetching whatsapp_instances:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
