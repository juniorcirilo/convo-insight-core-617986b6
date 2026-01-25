import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Pool } from 'pg';

const router = Router();

// Database pool for direct queries
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'convo_insight',
});

/**
 * Helper function to get Evolution API auth headers
 * Evolution Cloud and self-hosted both use 'apikey' header
 */
function getEvolutionAuthHeaders(apiKey: string): Record<string, string> {
  return {
    'apikey': apiKey,
    'Content-Type': 'application/json'
  };
}

/**
 * Convert localhost URLs to docker network URLs when running inside a container
 * This is necessary because localhost inside a container refers to the container itself,
 * not the host machine.
 */
function resolveDockerUrl(url: string): string {
  // Map of localhost ports to docker service names
  const portToService: Record<string, string> = {
    '8082': 'evolution-api:8080',  // Evolution API
    '5678': 'n8n:5678',            // n8n
    '3001': 'typebot-builder:3000', // Typebot Builder
    '3002': 'typebot-viewer:3000',  // Typebot Viewer
    '9000': 'minio:9000',          // MinIO
    '11434': 'ollama:11434',       // Ollama
  };

  try {
    const parsed = new URL(url);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    
    if (isLocalhost) {
      const service = portToService[parsed.port];
      if (service) {
        parsed.hostname = service.split(':')[0];
        parsed.port = service.split(':')[1];
        console.log(`🔄 Resolved URL: ${url} -> ${parsed.toString()}`);
        return parsed.toString();
      }
      // If no mapping found, try host.docker.internal as fallback
      parsed.hostname = 'host.docker.internal';
      console.log(`🔄 Resolved URL to host.docker.internal: ${url} -> ${parsed.toString()}`);
      return parsed.toString();
    }
    
    return url;
  } catch {
    return url;
  }
}

/**
 * Test Evolution API connection
 * POST /api/functions/test-evolution-connection
 */
router.post('/test-evolution-connection', authenticate, async (req: Request, res: Response) => {
  try {
    const { api_url, api_key, instance_name, instance_id_external, provider_type } = req.body;

    console.log('🔍 Testing Evolution connection:', {
      provider_type,
      api_url,
      instance_name,
      instance_id_external: instance_id_external ? `${instance_id_external.substring(0, 8)}...` : null,
    });

    if (!api_url || !api_key || !instance_name) {
      return res.status(400).json({ 
        error: 'Missing required fields: api_url, api_key, instance_name' 
      });
    }

    const headers = getEvolutionAuthHeaders(api_key);
    
    // For cloud provider, use instance_id_external (UUID), otherwise use instance_name
    // evolution_bot and self_hosted both use instance_name
    const instanceIdentifier = provider_type === 'cloud' && instance_id_external 
      ? instance_id_external 
      : instance_name;

    // Resolve localhost URLs to docker network URLs
    const resolvedApiUrl = resolveDockerUrl(api_url);
    const fullUrl = `${resolvedApiUrl}/instance/connectionState/${instanceIdentifier}`;
    
    console.log('📡 Calling Evolution API:', {
      url: fullUrl,
      originalUrl: api_url,
      provider_type,
      headers: {
        ...headers,
        apikey: `${api_key.substring(0, 10)}...`
      }
    });

    const response = await fetch(fullUrl, { 
      method: 'GET',
      headers 
    });

    const responseText = await response.text();
    console.log('📥 Evolution API Response:', {
      status: response.status,
      statusText: response.statusText,
      body: responseText.substring(0, 500)
    });

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!response.ok) {
      console.error('❌ Evolution API error:', responseData);
      return res.json({
        success: false,
        error: responseData?.message || responseText || 'Connection test failed',
        status: response.status,
        details: responseData,
      });
    }

    console.log('✅ Connection test successful:', responseData);
    
    return res.json({ 
      success: true, 
      data: responseData,
      connectionState: responseData?.instance?.state || responseData?.state || 'unknown'
    });

  } catch (error: unknown) {
    console.error('❌ Error testing connection:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Check Evolution instance status
 * POST /api/functions/check-instances-status
 */
router.post('/check-instances-status', authenticate, async (req: Request, res: Response) => {
  try {
    const { instances } = req.body;

    if (!Array.isArray(instances) || instances.length === 0) {
      return res.status(400).json({ error: 'instances array is required' });
    }

    const results = await Promise.all(
      instances.map(async (instance: { api_url: string; api_key: string; instance_name: string; instance_id_external?: string; provider_type?: string }) => {
        try {
          const headers = getEvolutionAuthHeaders(instance.api_key);
          
          const instanceIdentifier = instance.provider_type === 'cloud' && instance.instance_id_external 
            ? instance.instance_id_external 
            : instance.instance_name;

          const resolvedUrl = resolveDockerUrl(instance.api_url);
          const fullUrl = `${resolvedUrl}/instance/connectionState/${instanceIdentifier}`;
          
          const response = await fetch(fullUrl, { 
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10000) // 10 second timeout
          });

          if (!response.ok) {
            return {
              instance_name: instance.instance_name,
              status: 'error',
              error: `HTTP ${response.status}`
            };
          }

          const data: any = await response.json();
          return {
            instance_name: instance.instance_name,
            status: 'ok',
            connectionState: data?.instance?.state || data?.state || 'unknown',
            data
          };
        } catch (error) {
          return {
            instance_name: instance.instance_name,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );

    return res.json({ success: true, results });
  } catch (error) {
    console.error('❌ Error checking instances status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Test instance connection by instanceId (fetches secrets from DB)
 * POST /api/functions/test-instance-connection
 */
router.post('/test-instance-connection', authenticate, async (req: Request, res: Response) => {
  try {
    const { instanceId, api_url, api_key, instance_name, instance_id_external, provider_type } = req.body;

    let finalApiUrl = api_url;
    let finalApiKey = api_key;
    let finalInstanceName = instance_name;
    let finalInstanceIdExternal = instance_id_external;
    let finalProviderType = provider_type;

    // If instanceId is provided, fetch data from database
    if (instanceId) {
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'convo_insight',
      });

      // Fetch secrets
      const { rows: secretsRows } = await pool.query(
        'SELECT api_url, api_key FROM whatsapp_instance_secrets WHERE instance_id = $1',
        [instanceId]
      );

      if (secretsRows.length === 0) {
        await pool.end();
        return res.status(404).json({ error: 'Instance secrets not found' });
      }

      finalApiUrl = secretsRows[0].api_url;
      finalApiKey = secretsRows[0].api_key;

      // Fetch instance details
      const { rows: instanceRows } = await pool.query(
        'SELECT instance_name, provider_type, instance_id_external FROM whatsapp_instances WHERE id = $1',
        [instanceId]
      );

      if (instanceRows.length === 0) {
        await pool.end();
        return res.status(404).json({ error: 'Instance not found' });
      }

      const instance = instanceRows[0];
      finalInstanceName = instance.instance_name;
      finalProviderType = instance.provider_type || 'self_hosted';
      finalInstanceIdExternal = instance.instance_id_external;

      await pool.end();
    }

    if (!finalApiUrl || !finalApiKey || !finalInstanceName) {
      return res.status(400).json({ 
        error: 'Missing required fields: api_url, api_key, instance_name (or instanceId)' 
      });
    }

    const headers = getEvolutionAuthHeaders(finalApiKey);
    const instanceIdentifier = finalProviderType === 'cloud' && finalInstanceIdExternal 
      ? finalInstanceIdExternal 
      : finalInstanceName;

    const resolvedApiUrl = resolveDockerUrl(finalApiUrl);
    const fullUrl = `${resolvedApiUrl}/instance/connectionState/${instanceIdentifier}`;
    
    console.log('🔍 Testing instance connection:', {
      instanceId,
      instanceIdentifier,
      url: fullUrl,
    });

    const response = await fetch(fullUrl, { 
      method: 'GET',
      headers 
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!response.ok) {
      return res.json({
        success: false,
        error: responseData?.message || responseText || 'Connection test failed',
        status: response.status,
        details: responseData,
      });
    }

    return res.json({ 
      success: true, 
      data: responseData,
      connectionState: responseData?.instance?.state || responseData?.state || 'unknown'
    });

  } catch (error: unknown) {
    console.error('❌ Error testing instance connection:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Get instance details by instanceId
 * POST /api/functions/get-instance-details
 */
router.post('/get-instance-details', authenticate, async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.body;

    if (!instanceId) {
      return res.status(400).json({ error: 'instanceId is required' });
    }

    const { Pool } = await import('pg');
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'convo_insight',
    });

    // Fetch instance
    const { rows: instanceRows } = await pool.query(
      'SELECT * FROM whatsapp_instances WHERE id = $1',
      [instanceId]
    );

    if (instanceRows.length === 0) {
      await pool.end();
      return res.status(404).json({ error: 'Instance not found' });
    }

    // Fetch secrets
    const { rows: secretsRows } = await pool.query(
      'SELECT api_url, api_key FROM whatsapp_instance_secrets WHERE instance_id = $1',
      [instanceId]
    );

    await pool.end();

    return res.json({
      success: true,
      instance: instanceRows[0],
      secrets: secretsRows[0] || null,
    });

  } catch (error: unknown) {
    console.error('❌ Error getting instance details:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Configure Evolution instance webhooks
 * POST /api/functions/configure-evolution-instance
 */
router.post('/configure-evolution-instance', authenticate, async (req: Request, res: Response) => {
  try {
    const { 
      instanceId, 
      api_url, 
      api_key, 
      instanceIdentifier, 
      webhookUrl, 
      base64 = false, 
      events = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'MESSAGES_DELETE'],
      force = false 
    } = req.body;

    console.log('🔧 Configuring Evolution instance:', {
      instanceId,
      instanceIdentifier,
      webhookUrl,
      events,
      force,
      hasApiUrl: !!api_url,
      hasApiKey: !!api_key,
    });

    let finalApiUrl = api_url;
    let finalApiKey = api_key;
    let finalInstanceIdentifier = instanceIdentifier;

    // If instanceId is provided, fetch secrets from database
    if (instanceId && (!api_url || !api_key)) {
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'convo_insight',
      });

      // Fetch secrets
      const { rows: secretsRows } = await pool.query(
        'SELECT api_url, api_key FROM whatsapp_instance_secrets WHERE instance_id = $1',
        [instanceId]
      );

      if (secretsRows.length === 0) {
        await pool.end();
        return res.status(404).json({ error: 'Instance secrets not found' });
      }

      finalApiUrl = secretsRows[0].api_url;
      finalApiKey = secretsRows[0].api_key;

      // Fetch instance details
      const { rows: instanceRows } = await pool.query(
        'SELECT instance_name, provider_type, instance_id_external FROM whatsapp_instances WHERE id = $1',
        [instanceId]
      );

      if (instanceRows.length === 0) {
        await pool.end();
        return res.status(404).json({ error: 'Instance not found' });
      }

      const instance = instanceRows[0];
      finalInstanceIdentifier = instance.provider_type === 'cloud' && instance.instance_id_external
        ? instance.instance_id_external
        : instance.instance_name;

      await pool.end();
    }

    if (!finalApiUrl || !finalApiKey || !finalInstanceIdentifier) {
      return res.status(400).json({ 
        error: 'Missing required fields: api_url, api_key, instanceIdentifier (or instanceId)' 
      });
    }

    const headers = getEvolutionAuthHeaders(finalApiKey);

    // Build webhook configuration payload - Evolution API v2.x expects { webhook: {...} }
    const webhookPayload = {
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookBase64: base64,
        webhookByEvents: false,
        events: events,
      }
    };

    const resolvedApiUrl = resolveDockerUrl(finalApiUrl);
    const configUrl = `${resolvedApiUrl}/webhook/set/${finalInstanceIdentifier}`;
    
    console.log('📡 Setting Evolution webhook:', {
      url: configUrl,
      payload: webhookPayload,
    });

    const response = await fetch(configUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    });

    const responseText = await response.text();
    console.log('📥 Evolution webhook response:', {
      status: response.status,
      body: responseText.substring(0, 500),
    });

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!response.ok) {
      console.error('❌ Evolution webhook configuration failed:', responseData);
      return res.json({
        success: false,
        error: responseData?.message || responseText || 'Failed to configure webhook',
        status: response.status,
        details: responseData,
      });
    }

    console.log('✅ Evolution webhook configured successfully');
    
    return res.json({
      success: true,
      data: responseData,
      message: 'Webhook configured successfully',
    });

  } catch (error: unknown) {
    console.error('❌ Error configuring Evolution instance:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Sync all instance statuses with Evolution API
 * POST /api/functions/sync-instance-statuses
 */
router.post('/sync-instance-statuses', authenticate, async (req: Request, res: Response) => {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'convo_insight',
    });

    // Fetch all instances with their secrets
    const { rows: instances } = await pool.query(`
      SELECT 
        i.id, i.instance_name, i.provider_type, i.instance_id_external, i.status,
        s.api_url, s.api_key
      FROM whatsapp_instances i
      LEFT JOIN whatsapp_instance_secrets s ON i.id = s.instance_id
    `);

    console.log(`🔄 Syncing status for ${instances.length} instances`);

    const results: any[] = [];

    for (const instance of instances) {
      try {
        if (!instance.api_url || !instance.api_key) {
          results.push({
            instance_name: instance.instance_name,
            status: 'error',
            error: 'Missing API credentials'
          });
          continue;
        }

        const headers = getEvolutionAuthHeaders(instance.api_key);
        const instanceIdentifier = instance.provider_type === 'cloud' && instance.instance_id_external
          ? instance.instance_id_external
          : instance.instance_name;

        const resolvedUrl = resolveDockerUrl(instance.api_url);
        const fullUrl = `${resolvedUrl}/instance/connectionState/${instanceIdentifier}`;

        const response = await fetch(fullUrl, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
          // Mark as disconnected
          await pool.query(
            'UPDATE whatsapp_instances SET status = $1, updated_at = NOW() WHERE id = $2',
            ['disconnected', instance.id]
          );
          results.push({
            instance_name: instance.instance_name,
            status: 'disconnected',
            error: `HTTP ${response.status}`
          });
          continue;
        }

        const data: any = await response.json();
        const state = data?.instance?.state || data?.state || 'unknown';
        
        // Map Evolution state to our status
        let newStatus = 'disconnected';
        if (state === 'open') {
          newStatus = 'connected';
        } else if (state === 'connecting') {
          newStatus = 'connecting';
        }

        // Update status in database
        await pool.query(
          'UPDATE whatsapp_instances SET status = $1, updated_at = NOW() WHERE id = $2',
          [newStatus, instance.id]
        );

        results.push({
          instance_name: instance.instance_name,
          previous_status: instance.status,
          new_status: newStatus,
          evolution_state: state
        });

      } catch (error) {
        // Mark as disconnected on error
        await pool.query(
          'UPDATE whatsapp_instances SET status = $1, updated_at = NOW() WHERE id = $2',
          ['disconnected', instance.id]
        );
        results.push({
          instance_name: instance.instance_name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    await pool.end();

    console.log('✅ Status sync completed:', results);

    return res.json({
      success: true,
      synced: results.length,
      results
    });

  } catch (error: unknown) {
    console.error('❌ Error syncing instance statuses:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Update single instance status
 * POST /api/functions/update-instance-status
 */
router.post('/update-instance-status', authenticate, async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.body;

    if (!instanceId) {
      return res.status(400).json({ error: 'instanceId is required' });
    }

    const { Pool } = await import('pg');
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'convo_insight',
    });

    // Fetch instance with secrets
    const { rows } = await pool.query(`
      SELECT 
        i.id, i.instance_name, i.provider_type, i.instance_id_external, i.status,
        s.api_url, s.api_key
      FROM whatsapp_instances i
      LEFT JOIN whatsapp_instance_secrets s ON i.id = s.instance_id
      WHERE i.id = $1
    `, [instanceId]);

    if (rows.length === 0) {
      await pool.end();
      return res.status(404).json({ error: 'Instance not found' });
    }

    const instance = rows[0];

    if (!instance.api_url || !instance.api_key) {
      await pool.end();
      return res.status(400).json({ error: 'Instance missing API credentials' });
    }

    const headers = getEvolutionAuthHeaders(instance.api_key);
    const instanceIdentifier = instance.provider_type === 'cloud' && instance.instance_id_external
      ? instance.instance_id_external
      : instance.instance_name;

    const resolvedUrl = resolveDockerUrl(instance.api_url);
    const fullUrl = `${resolvedUrl}/instance/connectionState/${instanceIdentifier}`;

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000)
    });

    let newStatus = 'disconnected';
    let evolutionState = 'unknown';

    if (response.ok) {
      const data: any = await response.json();
      evolutionState = data?.instance?.state || data?.state || 'unknown';
      
      if (evolutionState === 'open') {
        newStatus = 'connected';
      } else if (evolutionState === 'connecting') {
        newStatus = 'connecting';
      }
    }

    // Update status
    await pool.query(
      'UPDATE whatsapp_instances SET status = $1, updated_at = NOW() WHERE id = $2',
      [newStatus, instanceId]
    );

    await pool.end();

    return res.json({
      success: true,
      instance_name: instance.instance_name,
      previous_status: instance.status,
      new_status: newStatus,
      evolution_state: evolutionState
    });

  } catch (error: unknown) {
    console.error('❌ Error updating instance status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Setup project configuration
 * POST /api/functions/setup-project-config
 * Stores project credentials and configuration
 */
router.post('/setup-project-config', authenticate, async (req: Request, res: Response) => {
  try {
    console.log('[setup-project-config] Starting automatic project configuration...');

    // Get base URL from environment or request
    const projectUrl = process.env.VITE_API_URL || `http://localhost:${process.env.PORT || 3000}/api`;

    // Upsert project_url config
    await pool.query(`
      INSERT INTO project_config (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
    `, ['project_url', projectUrl]);

    // Upsert anon_key config (if needed - this would be for Supabase compatibility)
    const anonKey = process.env.JWT_SECRET || 'local-api-key';
    await pool.query(`
      INSERT INTO project_config (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
    `, ['anon_key', anonKey]);

    console.log('[setup-project-config] Configuration completed successfully!');

    return res.json({
      success: true,
      message: 'Project configuration completed successfully',
    });

  } catch (error: unknown) {
    console.error('[setup-project-config] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * Ensure user profile and role exist
 * POST /api/functions/ensure-user-profile
 * Creates profile and assigns default role if missing
 */
router.post('/ensure-user-profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    console.log('🔍 Checking profile/role for user:', userId);

    let profileCreated = false;
    let roleCreated = false;
    let profileAutoApproved = false;

    // Check if approval is required
    const { rows: approvalConfigRows } = await pool.query(
      "SELECT value FROM project_config WHERE key = 'require_account_approval'"
    );
    const requireApproval = approvalConfigRows[0]?.value === 'true';
    console.log('📋 Approval config:', { requireApproval });

    // Count existing profiles to determine if first user
    const { rows: countRows } = await pool.query('SELECT COUNT(*) as count FROM profiles');
    const profileCount = parseInt(countRows[0]?.count || '0');
    const isFirstUser = profileCount === 0;
    console.log('👤 Profile count:', profileCount, 'Is first user:', isFirstUser);

    // Check if profile exists
    const { rows: profileRows } = await pool.query(
      'SELECT id, is_approved FROM profiles WHERE id = $1',
      [userId]
    );
    const existingProfile = profileRows[0];

    if (!existingProfile) {
      console.log('⚠️ Profile missing, creating...');

      // First user always approved; others depend on config
      const isApproved = isFirstUser ? true : !requireApproval;
      console.log('📝 Creating profile with is_approved:', isApproved);

      // Get user info from auth token
      const fullName = req.user?.fullName || req.user?.email?.split('@')[0] || 'Usuário';
      const email = req.user?.email || '';

      // Create profile
      try {
        await pool.query(`
          INSERT INTO profiles (id, full_name, email, is_active, is_approved, created_at, updated_at)
          VALUES ($1, $2, $3, true, $4, NOW(), NOW())
        `, [userId, fullName, email, isApproved]);
        profileCreated = true;
        console.log('✅ Profile created with is_approved:', isApproved);
      } catch (profileError) {
        console.error('❌ Error creating profile:', profileError);
      }
    } else {
      // Profile exists - check if first/only user needs auto-approval fix
      if (existingProfile.is_approved === false || existingProfile.is_approved === null) {
        // Re-count to check if this is the only user
        const { rows: totalRows } = await pool.query('SELECT COUNT(*) as count FROM profiles');
        const totalProfiles = parseInt(totalRows[0]?.count || '0');

        // If only one profile exists and it's not approved, auto-approve (first admin fix)
        if (totalProfiles === 1) {
          console.log('🔧 Auto-approving first/only user...');
          try {
            await pool.query('UPDATE profiles SET is_approved = true WHERE id = $1', [userId]);
            profileAutoApproved = true;
            console.log('✅ First user auto-approved');
          } catch (approveError) {
            console.error('❌ Error auto-approving:', approveError);
          }
        }
      }
    }

    // Check if role exists
    const { rows: roleRows } = await pool.query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [userId]
    );
    const existingRole = roleRows[0];

    if (!existingRole) {
      console.log('⚠️ Role missing, assigning...');

      // First user gets admin role, others get agent role
      const role = isFirstUser ? 'admin' : 'agent';

      try {
        await pool.query(`
          INSERT INTO user_roles (user_id, role, created_at, updated_at)
          VALUES ($1, $2, NOW(), NOW())
        `, [userId, role]);
        roleCreated = true;
        console.log('✅ Role assigned:', role);
      } catch (roleError) {
        console.error('❌ Error assigning role:', roleError);
      }
    }

    // Fetch final profile and role data
    const { rows: finalProfileRows } = await pool.query(`
      SELECT p.*, r.role 
      FROM profiles p 
      LEFT JOIN user_roles r ON p.id = r.user_id 
      WHERE p.id = $1
    `, [userId]);
    const finalProfile = finalProfileRows[0];

    return res.json({
      success: true,
      profileCreated,
      roleCreated,
      profileAutoApproved,
      profile: finalProfile ? {
        id: finalProfile.id,
        fullName: finalProfile.full_name,
        email: finalProfile.email,
        isApproved: finalProfile.is_approved,
        isActive: finalProfile.is_active,
        role: finalProfile.role,
      } : null,
    });

  } catch (error: unknown) {
    console.error('[ensure-user-profile] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Compose WhatsApp message with AI
 * POST /api/functions/compose-whatsapp-message
 * Enhanced version with all compose actions
 */
router.post('/compose-whatsapp-message', authenticate, async (req: Request, res: Response) => {
  try {
    const { message, action, targetLanguage } = req.body;

    if (!message || !action) {
      return res.status(400).json({ error: 'Message and action are required' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(502).json({ error: 'GROQ_API_KEY not configured' });
    }

    let prompt = '';

    // Define prompts for each action
    switch (action) {
      case 'expand':
        prompt = `Você é um assistente de atendimento. Expanda esta mensagem curta em uma resposta completa e profissional, mantendo o mesmo significado mas adicionando contexto e detalhes úteis:

"${message}"

Responda apenas com o texto expandido, sem explicações.`;
        break;

      case 'rephrase':
        prompt = `Reformule esta mensagem mantendo exatamente o mesmo significado, mas usando palavras e estrutura diferentes:

"${message}"

Responda apenas com o texto reformulado.`;
        break;

      case 'my_tone':
        prompt = `Reescreva esta mensagem de forma profissional e amigável:

"${message}"

Responda apenas com a mensagem reescrita.`;
        break;

      case 'friendly':
        prompt = `Reescreva esta mensagem de forma mais casual, amigável e acolhedora. Use emojis apropriados:

"${message}"

Responda apenas com a versão amigável.`;
        break;

      case 'formal':
        prompt = `Reescreva esta mensagem de forma mais profissional e formal, removendo gírias e mantendo um tom corporativo:

"${message}"

Responda apenas com a versão formal.`;
        break;

      case 'fix_grammar':
        prompt = `Corrija todos os erros de gramática, ortografia e pontuação nesta mensagem, mantendo o tom e significado:

"${message}"

Responda apenas com o texto corrigido.`;
        break;

      case 'translate':
        const languageNames: Record<string, string> = {
          'en': 'inglês',
          'es': 'espanhol',
          'fr': 'francês',
          'de': 'alemão',
          'it': 'italiano',
          'pt': 'português'
        };
        const langName = languageNames[targetLanguage || 'en'] || targetLanguage;
        prompt = `Traduza esta mensagem para ${langName}, mantendo o tom e o contexto:

"${message}"

Responda apenas com a tradução.`;
        break;

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    console.log('Calling GROQ for composition action:', action);
    const model = action === 'fix_grammar' ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';

    const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!groqResp.ok) {
      const errorText = await groqResp.text();
      console.error('GROQ API error:', errorText);
      return res.status(502).json({ error: 'AI service error' });
    }

    const data = await groqResp.json();
    const composedText = data?.choices?.[0]?.message?.content || '';

    return res.json({
      success: true,
      composedText,
      action,
    });

  } catch (error: unknown) {
    console.error('[compose-whatsapp-message] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * Suggest smart replies for a conversation
 * POST /api/functions/suggest-smart-replies
 * Enhanced version with conversation context
 */
router.post('/suggest-smart-replies', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    
    const defaultSuggestions = [
      { text: "Olá! Como posso ajudá-lo(a) hoje?", tone: "formal" },
      { text: "Oi! Em que posso te ajudar? 😊", tone: "friendly" },
      { text: "Oi! Qual sua dúvida?", tone: "direct" }
    ];

    if (!GROQ_API_KEY) {
      console.warn('GROQ_API_KEY not configured, returning default suggestions');
      return res.json({ suggestions: defaultSuggestions, context: null });
    }

    // Fetch last messages from conversation
    const { rows: messages } = await pool.query(`
      SELECT content, is_from_me, message_type, timestamp
      FROM whatsapp_messages
      WHERE conversation_id = $1
      ORDER BY timestamp DESC
      LIMIT 10
    `, [conversationId]);

    // Get contact name
    const { rows: conversationRows } = await pool.query(`
      SELECT c.name as contact_name
      FROM whatsapp_conversations conv
      JOIN whatsapp_contacts c ON conv.contact_id = c.id
      WHERE conv.id = $1
    `, [conversationId]);
    
    const contactName = conversationRows[0]?.contact_name || 'Cliente';

    // Filter text messages and reverse order
    const textMessages = messages.filter((m: any) => m.message_type === 'text' || !m.message_type).reverse();

    if (textMessages.length === 0) {
      return res.json({ suggestions: defaultSuggestions, context: { contactName, lastMessage: '' } });
    }

    // Get last client message
    const lastClientMessage = textMessages.filter((m: any) => !m.is_from_me).pop();

    if (!lastClientMessage) {
      return res.json({ suggestions: defaultSuggestions, context: { contactName, lastMessage: '' } });
    }

    // Build recent messages context
    const recentMessages = textMessages.slice(-8).map((m: any) =>
      `${m.is_from_me ? 'Você' : contactName}: ${m.content}`
    ).join('\n');

    const model = 'llama-3.1-8b-instant';

    const systemPrompt = `Você é um assistente que gera respostas CURTAS (até 2 frases) e ÚTEIS para atendimento ao cliente.

REGRAS:
- Foque em resolver ou encaminhar, não cumprimente à toa
- Varie o tom: formal, friendly, direct
- Use português do Brasil
- Se for sobre agendamento, proponha 1-2 opções de horário
- Se for instrução operacional, traga passos claros
- Seja objetivo e útil

CONTEXTO:
- Cliente: ${contactName}
- Última mensagem do cliente: "${lastClientMessage.content}"
- Histórico recente:
${recentMessages}`;

    try {
      const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'GERE_UM_JSON: Retorne exatamente um JSON com a chave "suggestions" contendo 3 objetos com "text" e "tone" (formal|friendly|direct). Não inclua texto adicional.' }
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (groqResp.ok) {
        const data = await groqResp.json();
        const content = data?.choices?.[0]?.message?.content || '';

        // Try to extract JSON from response
        try {
          // Try parsing directly first
          let parsed;
          // Remove markdown code blocks if present
          const cleanContent = content.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
          parsed = JSON.parse(cleanContent);
          
          if (parsed?.suggestions && Array.isArray(parsed.suggestions)) {
            return res.json({
              suggestions: parsed.suggestions,
              context: { contactName, lastMessage: lastClientMessage.content }
            });
          }
        } catch (parseError) {
          console.warn('Failed to parse AI response, using defaults');
        }
      }
    } catch (aiError) {
      console.error('AI call failed:', aiError);
    }

    return res.json({
      suggestions: defaultSuggestions,
      context: { contactName, lastMessage: lastClientMessage.content }
    });

  } catch (error: unknown) {
    console.error('[suggest-smart-replies] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

/**
 * AI Agent respond to conversation
 * POST /api/functions/ai-agent-respond
 * Full implementation of AI agent auto-response
 */
router.post('/ai-agent-respond', authenticate, async (req: Request, res: Response) => {
  try {
    const { conversationId, messageId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'AI not configured' });
    }

    // Fetch conversation with sector
    const { rows: convRows } = await pool.query(`
      SELECT 
        c.*,
        s.name as sector_name
      FROM whatsapp_conversations c
      LEFT JOIN sectors s ON c.sector_id = s.id
      WHERE c.id = $1
    `, [conversationId]);

    const conversation = convRows[0];
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check if in human mode
    if (conversation.conversation_mode === 'human') {
      return res.json({ skipped: true, reason: 'human_mode' });
    }

    // Fetch AI agent config for sector
    const { rows: configRows } = await pool.query(`
      SELECT * FROM ai_agent_configs 
      WHERE sector_id = $1 AND is_enabled = true
    `, [conversation.sector_id]);

    const config = configRows[0];
    if (!config) {
      return res.json({ skipped: true, reason: 'no_config' });
    }

    // Get contact info
    const { rows: contactRows } = await pool.query(
      'SELECT * FROM whatsapp_contacts WHERE id = $1',
      [conversation.contact_id]
    );
    const contact = contactRows[0];

    // Get recent messages
    const { rows: messages } = await pool.query(`
      SELECT content, is_from_me, message_type, created_at
      FROM whatsapp_messages
      WHERE conversation_id = $1 AND is_internal = false
      ORDER BY created_at DESC
      LIMIT 20
    `, [conversationId]);

    const reversedHistory = messages.reverse();

    // Build system prompt
    const systemPrompt = `Você é ${config.agent_name || 'um assistente virtual'} da empresa.
${config.persona_description || ''}

Tom de voz: ${config.tone_of_voice || 'profissional e amigável'}

${config.business_context ? `Contexto do negócio: ${config.business_context}` : ''}

${config.faq_context ? `FAQ: ${config.faq_context}` : ''}

REGRAS:
- Responda de forma concisa e útil
- Use português do Brasil
- Seja educado e profissional
- Se não souber algo, ofereça transferir para um atendente humano`;

    // Build messages for AI
    const aiMessages: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...reversedHistory.map((msg: any) => ({
        role: msg.is_from_me ? 'assistant' : 'user',
        content: msg.content || '[mídia]'
      }))
    ];

    // Call AI
    const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: aiMessages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!groqResp.ok) {
      const errorText = await groqResp.text();
      console.error('GROQ API error:', errorText);
      return res.status(500).json({ error: 'AI service error' });
    }

    const data = await groqResp.json();
    const aiResponse = data?.choices?.[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';

    return res.json({
      success: true,
      response: aiResponse,
      shouldSend: true,
      agentName: config.agent_name,
    });

  } catch (error: unknown) {
    console.error('[ai-agent-respond] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

export default router;
