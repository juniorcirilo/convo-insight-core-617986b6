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

// POST /api/whatsapp_instances - Create a new instance
router.post('/whatsapp_instances', async (req: Request, res: Response) => {
  try {
    const { name, instance_name, provider_type, instance_id_external, status } = req.body;
    
    if (!instance_name) {
      return res.status(400).json({ error: 'instance_name is required' });
    }

    const sql = `
      INSERT INTO whatsapp_instances (name, instance_name, provider_type, instance_id_external, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const params = [
      name || instance_name,
      instance_name,
      provider_type || 'self_hosted',
      instance_id_external || null,
      status || 'disconnected'
    ];

    const { rows } = await pool.query(sql, params);
    return res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('Error creating whatsapp_instance:', error);
    return res.status(500).json({ error: error.message || 'Failed to create instance' });
  }
});

// POST /api/whatsapp_instance_secrets - Create secrets for an instance
router.post('/whatsapp_instance_secrets', async (req: Request, res: Response) => {
  try {
    const { instance_id, api_url, api_key } = req.body;
    
    if (!instance_id || !api_url || !api_key) {
      return res.status(400).json({ error: 'instance_id, api_url, and api_key are required' });
    }

    const sql = `
      INSERT INTO whatsapp_instance_secrets (instance_id, api_url, api_key)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const params = [instance_id, api_url, api_key];

    const { rows } = await pool.query(sql, params);
    return res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('Error creating whatsapp_instance_secrets:', error);
    return res.status(500).json({ error: error.message || 'Failed to create secrets' });
  }
});

// DELETE /api/whatsapp_instances/:id - Delete an instance and its secrets
router.delete('/whatsapp_instances/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // First delete secrets
    await pool.query('DELETE FROM whatsapp_instance_secrets WHERE instance_id = $1', [id]);
    
    // Then delete instance
    const { rowCount } = await pool.query('DELETE FROM whatsapp_instances WHERE id = $1', [id]);
    
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }
    
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Error deleting whatsapp_instance:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete instance' });
  }
});

// GET /api/whatsapp_conversations?range=from:to&instance_id=...&status=...&assigned_to=...
router.get('/whatsapp_conversations', async (req: Request, res: Response) => {
  try {
    const { range, instance_id, status, assigned_to, unassigned } = req.query;
    const params: any[] = [];
    const whereClauses: string[] = [];

    // Build SQL with JOINs to get contact and instance data
    let sql = `
      SELECT 
        c.*,
        json_build_object(
          'id', ct.id,
          'instance_id', ct.instance_id,
          'phone_number', ct.phone_number,
          'name', ct.name,
          'profile_picture_url', ct.profile_picture_url,
          'is_group', ct.is_group,
          'notes', ct.notes,
          'metadata', ct.metadata,
          'created_at', ct.created_at,
          'updated_at', ct.updated_at
        ) as contact,
        json_build_object(
          'id', i.id,
          'name', i.name
        ) as instance,
        CASE WHEN p.id IS NOT NULL THEN
          json_build_object(
            'id', p.id,
            'full_name', p.full_name,
            'avatar_url', p.avatar_url
          )
        ELSE NULL END as assigned_profile
      FROM whatsapp_conversations c
      LEFT JOIN whatsapp_contacts ct ON ct.id = c.contact_id
      LEFT JOIN whatsapp_instances i ON i.id = c.instance_id
      LEFT JOIN profiles p ON p.id = c.assigned_to
    `;

    // Add filters
    if (instance_id) {
      params.push(String(instance_id));
      whereClauses.push(`c.instance_id = $${params.length}`);
    }

    if (status) {
      params.push(String(status));
      whereClauses.push(`c.status = $${params.length}`);
    }

    if (assigned_to) {
      params.push(String(assigned_to));
      whereClauses.push(`c.assigned_to = $${params.length}`);
    }

    if (unassigned === 'true') {
      whereClauses.push(`c.assigned_to IS NULL`);
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    sql += ' ORDER BY c.last_message_at DESC NULLS LAST';

    if (range && typeof range === 'string') {
      // range format "from:to"
      const [fromStr, toStr] = range.split(':');
      const from = parseInt(fromStr || '0', 10);
      const to = parseInt(toStr || `${from + 19}`, 10);
      const limit = Math.max(0, to - from + 1);
      sql += ` LIMIT ${limit} OFFSET ${from}`;
    } else {
      sql += ' LIMIT 50';
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

// POST /api/sectors - Create a new sector
router.post('/sectors', async (req: Request, res: Response) => {
  try {
    const { 
      name, 
      description, 
      is_active, 
      is_default,
      instance_id,
      tipo_atendimento,
      gera_ticket,
      gera_ticket_usuarios,
      gera_ticket_grupos,
      grupos_permitidos_todos,
      mensagem_boas_vindas,
      mensagem_reabertura,
      mensagem_encerramento
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // If this sector is set as default, unset other defaults first
    if (is_default === true) {
      await pool.query('UPDATE sectors SET is_default = false WHERE is_default = true');
    }

    const sql = `
      INSERT INTO sectors (name, description, is_active, is_default, instance_id, tipo_atendimento, gera_ticket, gera_ticket_usuarios, gera_ticket_grupos, grupos_permitidos_todos, mensagem_boas_vindas, mensagem_reabertura, mensagem_encerramento, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      RETURNING *
    `;
    const params = [
      name,
      description || null,
      is_active !== false,
      is_default || false,
      instance_id || null,
      tipo_atendimento || 'humano',
      gera_ticket || false,
      gera_ticket_usuarios || false,
      gera_ticket_grupos || false,
      grupos_permitidos_todos !== false,
      mensagem_boas_vindas || null,
      mensagem_reabertura || null,
      mensagem_encerramento || null
    ];

    const { rows } = await pool.query(sql, params);
    return res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('Error creating sector:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A sector with this name already exists' });
    }
    return res.status(500).json({ error: 'Failed to create sector' });
  }
});

// PUT /api/sectors/:id - Update a sector
router.put('/sectors/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      is_active,
      is_default,
      instance_id,
      tipo_atendimento,
      gera_ticket,
      gera_ticket_usuarios,
      gera_ticket_grupos,
      grupos_permitidos_todos,
      mensagem_boas_vindas,
      mensagem_reabertura,
      mensagem_encerramento
    } = req.body;

    // If this sector is set as default, unset other defaults first
    if (is_default === true) {
      await pool.query('UPDATE sectors SET is_default = false WHERE is_default = true AND id != $1', [id]);
    }

    const sql = `
      UPDATE sectors
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          is_active = COALESCE($3, is_active),
          is_default = COALESCE($4, is_default),
          instance_id = COALESCE($5, instance_id),
          tipo_atendimento = COALESCE($6, tipo_atendimento),
          gera_ticket = COALESCE($7, gera_ticket),
          gera_ticket_usuarios = COALESCE($8, gera_ticket_usuarios),
          gera_ticket_grupos = COALESCE($9, gera_ticket_grupos),
          grupos_permitidos_todos = COALESCE($10, grupos_permitidos_todos),
          mensagem_boas_vindas = COALESCE($11, mensagem_boas_vindas),
          mensagem_reabertura = COALESCE($12, mensagem_reabertura),
          mensagem_encerramento = COALESCE($13, mensagem_encerramento),
          updated_at = NOW()
      WHERE id = $14
      RETURNING *
    `;
    const params = [name, description, is_active, is_default, instance_id, tipo_atendimento, gera_ticket, gera_ticket_usuarios, gera_ticket_grupos, grupos_permitidos_todos, mensagem_boas_vindas, mensagem_reabertura, mensagem_encerramento, id];

    const { rows } = await pool.query(sql, params);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Sector not found' });
    }
    return res.status(200).json(rows[0]);
  } catch (error: any) {
    console.error('Error updating sector:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A sector with this name already exists' });
    }
    return res.status(500).json({ error: 'Failed to update sector' });
  }
});

// DELETE /api/sectors/:id - Delete a sector
router.delete('/sectors/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { rowCount } = await pool.query('DELETE FROM sectors WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Sector not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting sector:', error);
    return res.status(500).json({ error: 'Failed to delete sector' });
  }
});

// =====================================================
// USER_SECTORS ROUTES
// =====================================================

// GET /api/user_sectors?sector_id=...&user_id=...
// Returns user_sectors with joined profiles and sectors data
router.get('/user_sectors', async (req: Request, res: Response) => {
  try {
    const { sector_id, user_id } = req.query;
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (sector_id) {
      params.push(String(sector_id));
      whereClauses.push(`us.sector_id = $${params.length}`);
    }

    if (user_id) {
      params.push(String(user_id));
      whereClauses.push(`us.user_id = $${params.length}`);
    }

    let sql = `
      SELECT 
        us.id,
        us.user_id,
        us.sector_id,
        us.is_primary,
        us.created_at,
        p.full_name as user_name,
        p.email as user_email,
        s.name as sector_name
      FROM user_sectors us
      LEFT JOIN profiles p ON us.user_id = p.id
      LEFT JOIN sectors s ON us.sector_id = s.id
    `;

    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    sql += ' ORDER BY us.created_at DESC LIMIT 200';

    try {
      const { rows } = await pool.query(sql, params);
      // Transform to match the expected format from useUserSectors hook
      const transformed = rows.map(row => ({
        ...row,
        profiles: { full_name: row.user_name, email: row.user_email },
        sectors: { name: row.sector_name }
      }));
      return res.set('Cache-Control', 'no-store').status(200).json(transformed ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table user_sectors not found, returning empty array');
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error('DB error fetching user_sectors:', dbErr);
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching user_sectors:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// POST /api/user_sectors - Add user to sector
router.post('/user_sectors', async (req: Request, res: Response) => {
  try {
    const { user_id, sector_id, is_primary } = req.body;

    if (!user_id || !sector_id) {
      return res.status(400).json({ error: 'user_id and sector_id are required' });
    }

    const sql = `
      INSERT INTO user_sectors (user_id, sector_id, is_primary, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING *
    `;
    const params = [user_id, sector_id, is_primary ?? false];

    const { rows } = await pool.query(sql, params);
    return res.status(201).json(rows[0]);
  } catch (error: any) {
    console.error('Error adding user to sector:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'User is already in this sector', message: 'duplicate key value' });
    }
    return res.status(500).json({ error: error.message || 'Failed to add user to sector' });
  }
});

// PUT /api/user_sectors/:id - Update user sector (e.g., set as primary)
router.put('/user_sectors/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { is_primary } = req.body;

    // If setting as primary, first unset other primary sectors for this user
    if (is_primary === true) {
      // Get the user_id for this record
      const { rows: current } = await pool.query('SELECT user_id FROM user_sectors WHERE id = $1', [id]);
      if (current.length === 0) {
        return res.status(404).json({ error: 'User sector not found' });
      }
      
      // Unset all other primary sectors for this user
      await pool.query(
        'UPDATE user_sectors SET is_primary = false WHERE user_id = $1 AND id != $2',
        [current[0].user_id, id]
      );
    }

    const sql = `
      UPDATE user_sectors
      SET is_primary = COALESCE($1, is_primary)
      WHERE id = $2
      RETURNING *
    `;
    const params = [is_primary, id];

    const { rows } = await pool.query(sql, params);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User sector not found' });
    }
    return res.status(200).json(rows[0]);
  } catch (error: any) {
    console.error('Error updating user sector:', error);
    return res.status(500).json({ error: error.message || 'Failed to update user sector' });
  }
});

// PATCH /api/user_sectors - Update by user_id and sector_id (for setPrimarySector)
router.patch('/user_sectors', async (req: Request, res: Response) => {
  try {
    const { user_id, sector_id, is_primary } = req.body;

    if (!user_id || !sector_id) {
      return res.status(400).json({ error: 'user_id and sector_id are required' });
    }

    // If setting as primary, first unset other primary sectors for this user
    if (is_primary === true) {
      await pool.query(
        'UPDATE user_sectors SET is_primary = false WHERE user_id = $1',
        [user_id]
      );
    }

    const sql = `
      UPDATE user_sectors
      SET is_primary = COALESCE($1, is_primary)
      WHERE user_id = $2 AND sector_id = $3
      RETURNING *
    `;
    const params = [is_primary, user_id, sector_id];

    const { rows } = await pool.query(sql, params);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User sector not found' });
    }
    return res.status(200).json(rows[0]);
  } catch (error: any) {
    console.error('Error updating user sector:', error);
    return res.status(500).json({ error: error.message || 'Failed to update user sector' });
  }
});

// DELETE /api/user_sectors?user_id=...&sector_id=... - Remove user from sector
router.delete('/user_sectors', async (req: Request, res: Response) => {
  try {
    const { user_id, sector_id } = req.query;

    if (!user_id || !sector_id) {
      return res.status(400).json({ error: 'user_id and sector_id are required' });
    }

    const { rowCount } = await pool.query(
      'DELETE FROM user_sectors WHERE user_id = $1 AND sector_id = $2',
      [String(user_id), String(sector_id)]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'User sector not found' });
    }
    return res.status(204).send();
  } catch (error: any) {
    console.error('Error removing user from sector:', error);
    return res.status(500).json({ error: error.message || 'Failed to remove user from sector' });
  }
});

// =====================================================
// SECTOR_INSTANCES ROUTES
// =====================================================

// GET /api/sector_instances?sector_id=...
router.get('/sector_instances', async (req: Request, res: Response) => {
  try {
    const { sector_id } = req.query;
    const params: any[] = [];
    let sql = `
      SELECT si.*, wi.name as instance_name
      FROM sector_instances si
      LEFT JOIN whatsapp_instances wi ON si.instance_id = wi.id
    `;

    if (sector_id) {
      params.push(String(sector_id));
      sql += ` WHERE si.sector_id = $${params.length}`;
    }

    sql += ' ORDER BY si.created_at DESC';

    try {
      const { rows } = await pool.query(sql, params);
      return res.set('Cache-Control', 'no-store').status(200).json(rows ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table sector_instances not found, returning empty array');
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error('DB error fetching sector_instances:', dbErr);
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching sector_instances:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// POST /api/sector_instances - Create sector-instance relationship
router.post('/sector_instances', async (req: Request, res: Response) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];

    for (const item of items) {
      const { sector_id, instance_id } = item;

      if (!sector_id || !instance_id) {
        continue; // Skip invalid items
      }

      try {
        const { rows } = await pool.query(`
          INSERT INTO sector_instances (sector_id, instance_id, created_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (sector_id, instance_id) DO NOTHING
          RETURNING *
        `, [sector_id, instance_id]);

        if (rows[0]) {
          results.push(rows[0]);
        }
      } catch (insertErr: any) {
        console.error('Error inserting sector_instance:', insertErr);
      }
    }

    return res.status(201).json(results.length === 1 ? results[0] : results);
  } catch (error: any) {
    console.error('Error creating sector_instances:', error);
    return res.status(500).json({ error: error.message || 'Failed to create sector_instances' });
  }
});

// DELETE /api/sector_instances?sector_id=...&instance_id=...
router.delete('/sector_instances', async (req: Request, res: Response) => {
  try {
    const { sector_id, instance_id } = req.query;

    if (!sector_id) {
      return res.status(400).json({ error: 'sector_id is required' });
    }

    let sql = 'DELETE FROM sector_instances WHERE sector_id = $1';
    const params: any[] = [String(sector_id)];

    if (instance_id) {
      params.push(String(instance_id));
      sql += ` AND instance_id = $${params.length}`;
    }

    await pool.query(sql, params);
    return res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting sector_instances:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete sector_instances' });
  }
});

// =====================================================
// SECTOR_ALLOWED_GROUPS ROUTES
// =====================================================

// GET /api/sector_allowed_groups?sector_id=...
router.get('/sector_allowed_groups', async (req: Request, res: Response) => {
  try {
    const { sector_id } = req.query;
    const params: any[] = [];
    let sql = 'SELECT * FROM sector_allowed_groups';

    if (sector_id) {
      params.push(String(sector_id));
      sql += ` WHERE sector_id = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    try {
      const { rows } = await pool.query(sql, params);
      return res.set('Cache-Control', 'no-store').status(200).json(rows ?? []);
    } catch (dbErr: any) {
      if (dbErr && dbErr.code === '42P01') {
        console.warn('Table sector_allowed_groups not found, returning empty array');
        return res.set('Cache-Control', 'no-store').status(200).json([]);
      }
      console.error('DB error fetching sector_allowed_groups:', dbErr);
      return res.set('Cache-Control', 'no-store').status(200).json([]);
    }
  } catch (error) {
    console.error('Error fetching sector_allowed_groups:', error);
    return res.set('Cache-Control', 'no-store').status(200).json([]);
  }
});

// POST /api/sector_allowed_groups - Create allowed groups for sector
router.post('/sector_allowed_groups', async (req: Request, res: Response) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];

    for (const item of items) {
      const { sector_id, group_phone_number, group_name } = item;

      if (!sector_id || !group_phone_number) {
        continue; // Skip invalid items
      }

      try {
        const { rows } = await pool.query(`
          INSERT INTO sector_allowed_groups (sector_id, group_phone_number, group_name, created_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (sector_id, group_phone_number) DO UPDATE SET group_name = $3
          RETURNING *
        `, [sector_id, group_phone_number, group_name || null]);

        if (rows[0]) {
          results.push(rows[0]);
        }
      } catch (insertErr: any) {
        console.error('Error inserting sector_allowed_group:', insertErr);
      }
    }

    return res.status(201).json(results.length === 1 ? results[0] : results);
  } catch (error: any) {
    console.error('Error creating sector_allowed_groups:', error);
    return res.status(500).json({ error: error.message || 'Failed to create sector_allowed_groups' });
  }
});

// DELETE /api/sector_allowed_groups?sector_id=...&group_phone_number=...
router.delete('/sector_allowed_groups', async (req: Request, res: Response) => {
  try {
    const { sector_id, group_phone_number } = req.query;

    if (!sector_id) {
      return res.status(400).json({ error: 'sector_id is required' });
    }

    let sql = 'DELETE FROM sector_allowed_groups WHERE sector_id = $1';
    const params: any[] = [String(sector_id)];

    if (group_phone_number) {
      params.push(String(group_phone_number));
      sql += ` AND group_phone_number = $${params.length}`;
    }

    await pool.query(sql, params);
    return res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting sector_allowed_groups:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete sector_allowed_groups' });
  }
});

// ===========================================
// UPSERT ROUTES
// ===========================================

// POST /api/whatsapp_contacts/upsert - Upsert a contact (insert or update on conflict)
router.post('/whatsapp_contacts/upsert', async (req: Request, res: Response) => {
  try {
    const { data, onConflict } = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'data is required' });
    }

    const { instance_id, phone_number, name, profile_picture_url, deleted_at, is_group, notes, metadata } = data;

    if (!instance_id || !phone_number) {
      return res.status(400).json({ error: 'instance_id and phone_number are required' });
    }

    // Upsert using ON CONFLICT
    const sql = `
      INSERT INTO whatsapp_contacts (instance_id, phone_number, name, profile_picture_url, deleted_at, is_group, notes, metadata, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (instance_id, phone_number) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, whatsapp_contacts.name),
        profile_picture_url = COALESCE(EXCLUDED.profile_picture_url, whatsapp_contacts.profile_picture_url),
        deleted_at = EXCLUDED.deleted_at,
        is_group = COALESCE(EXCLUDED.is_group, whatsapp_contacts.is_group),
        notes = COALESCE(EXCLUDED.notes, whatsapp_contacts.notes),
        metadata = COALESCE(EXCLUDED.metadata, whatsapp_contacts.metadata),
        updated_at = NOW()
      RETURNING *
    `;
    const params = [
      instance_id,
      phone_number,
      name || phone_number,
      profile_picture_url || null,
      deleted_at || null,
      is_group || false,
      notes || null,
      metadata || '{}'
    ];

    const { rows } = await pool.query(sql, params);
    return res.status(200).json(rows[0]);
  } catch (error: any) {
    console.error('Error upserting whatsapp_contact:', error);
    return res.status(500).json({ error: error.message || 'Failed to upsert contact' });
  }
});

// POST /api/kanban_columns_config/upsert - Upsert kanban column config
router.post('/kanban_columns_config/upsert', async (req: Request, res: Response) => {
  try {
    const { data, onConflict } = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'data is required' });
    }

    // Handle both single object and array
    const items = Array.isArray(data) ? data : [data];
    const results: any[] = [];

    for (const item of items) {
      const { user_id, column_id, name, color, position, is_visible } = item;

      if (!column_id) {
        continue;
      }

      const sql = `
        INSERT INTO kanban_columns_config (user_id, column_id, name, color, position, is_visible, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (user_id, column_id) DO UPDATE SET
          name = COALESCE(EXCLUDED.name, kanban_columns_config.name),
          color = COALESCE(EXCLUDED.color, kanban_columns_config.color),
          position = COALESCE(EXCLUDED.position, kanban_columns_config.position),
          is_visible = COALESCE(EXCLUDED.is_visible, kanban_columns_config.is_visible),
          updated_at = NOW()
        RETURNING *
      `;
      const params = [
        user_id || null,
        column_id,
        name || column_id,
        color || null,
        position || 0,
        is_visible !== false
      ];

      try {
        const { rows } = await pool.query(sql, params);
        if (rows[0]) results.push(rows[0]);
      } catch (e: any) {
        console.error('Error upserting kanban_columns_config item:', e);
      }
    }

    return res.status(200).json(Array.isArray(data) ? results : results[0]);
  } catch (error: any) {
    console.error('Error upserting kanban_columns_config:', error);
    return res.status(500).json({ error: error.message || 'Failed to upsert kanban config' });
  }
});

// POST /api/sector_permissions/upsert - Upsert sector permissions
router.post('/sector_permissions/upsert', async (req: Request, res: Response) => {
  try {
    const { data, onConflict } = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'data is required' });
    }

    // Handle both single object and array
    const items = Array.isArray(data) ? data : [data];
    const results: any[] = [];

    for (const item of items) {
      const { user_id, sector_id, permission_type, granted } = item;

      if (!user_id || !sector_id || !permission_type) {
        continue;
      }

      const sql = `
        INSERT INTO sector_permissions (user_id, sector_id, permission_type, granted, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (user_id, sector_id, permission_type) DO UPDATE SET
          granted = EXCLUDED.granted,
          updated_at = NOW()
        RETURNING *
      `;
      const params = [user_id, sector_id, permission_type, granted !== false];

      try {
        const { rows } = await pool.query(sql, params);
        if (rows[0]) results.push(rows[0]);
      } catch (e: any) {
        console.error('Error upserting sector_permission item:', e);
      }
    }

    return res.status(200).json(Array.isArray(data) ? results : results[0]);
  } catch (error: any) {
    console.error('Error upserting sector_permissions:', error);
    return res.status(500).json({ error: error.message || 'Failed to upsert sector permissions' });
  }
});

// POST /api/permission_overrides/upsert - Upsert permission overrides
router.post('/permission_overrides/upsert', async (req: Request, res: Response) => {
  try {
    const { data, onConflict } = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'data is required' });
    }

    const { user_id, permission_type, granted } = data;

    if (!user_id || !permission_type) {
      return res.status(400).json({ error: 'user_id and permission_type are required' });
    }

    const sql = `
      INSERT INTO permission_overrides (user_id, permission_type, granted, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (user_id, permission_type) DO UPDATE SET
        granted = EXCLUDED.granted,
        updated_at = NOW()
      RETURNING *
    `;
    const params = [user_id, permission_type, granted !== false];

    const { rows } = await pool.query(sql, params);
    return res.status(200).json(rows[0]);
  } catch (error: any) {
    console.error('Error upserting permission_override:', error);
    return res.status(500).json({ error: error.message || 'Failed to upsert permission override' });
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