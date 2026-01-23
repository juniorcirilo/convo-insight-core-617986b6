# Supabase to Express Migration Guide

This document provides a comprehensive guide for migrating from Supabase to the new Express backend.

## Migration Overview

### What's Been Migrated

✅ **Backend Infrastructure**
- Express server with TypeScript
- Drizzle ORM with PostgreSQL
- MinIO for S3-compatible storage
- JWT authentication system
- WebSocket support for real-time features

✅ **Database Schema**
- All 64 Supabase tables converted to Drizzle schemas
- Organized by domain (auth, whatsapp, tickets, leads, etc.)
- Foreign key relationships preserved
- Migrations ready to be generated

✅ **Core Services**
- Authentication (register, login, refresh, logout)
- Storage (upload, download, delete, list)
- JWT token management
- Password hashing with bcrypt

✅ **Frontend API Client**
- Axios-based API client with interceptors
- Automatic token refresh
- WebSocket client for real-time updates
- Error handling

### What Needs Migration

⚠️ **Supabase Edge Functions → Express Routes**
- 20+ Edge Functions need conversion
- Each function needs a corresponding Express route, controller, and service
- See "Function Migration Examples" below

⚠️ **Frontend Hooks**
- 84+ hook files use Supabase client
- All need to be updated to use the new API client
- See "Hook Migration Guide" below

⚠️ **Data Migration**
- Existing Supabase data needs to be migrated to new PostgreSQL
- Storage files need to be migrated from Supabase Storage to MinIO
- See "Data Migration" section below

## Function Migration Examples

### Example 1: Simple Config Function

**Supabase Function** (`supabase/functions/setup-project-config/index.ts`):
```typescript
// Stores config in database
await supabase
  .from('project_config')
  .upsert({ key: 'project_url', value: supabaseUrl });
```

**Express Equivalent**:

1. **Service** (`backend/src/services/configService.ts`):
```typescript
import { db } from '../config/database.js';
import { project_config } from '../db/schema/config.js';
import { eq } from 'drizzle-orm';

export const configService = {
  async setConfig(key: string, value: string) {
    const [config] = await db
      .insert(project_config)
      .values({ key, value })
      .onConflictDoUpdate({
        target: project_config.key,
        set: { value }
      })
      .returning();
    return config;
  },
  
  async getConfig(key: string) {
    const [config] = await db
      .select()
      .from(project_config)
      .where(eq(project_config.key, key))
      .limit(1);
    return config;
  }
};
```

2. **Controller** (`backend/src/controllers/configController.ts`):
```typescript
import { Request, Response } from 'express';
import { configService } from '../services/configService.js';

export const configController = {
  async setConfig(req: Request, res: Response) {
    try {
      const { key, value } = req.body;
      const config = await configService.setConfig(key, value);
      res.json({ success: true, config });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
};
```

3. **Route** (`backend/src/routes/config.ts`):
```typescript
import { Router } from 'express';
import { configController } from '../controllers/configController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.post('/setup', authMiddleware, configController.setConfig);
export default router;
```

### Example 2: Complex WhatsApp Function

**Supabase Function** (`supabase/functions/send-whatsapp-message/index.ts`):
- Validates conversation
- Fetches WhatsApp instance details
- Calls Evolution API
- Stores message in database
- Updates conversation metadata

**Express Equivalent**:

1. **Service** (`backend/src/services/whatsappService.ts`):
```typescript
import { db } from '../config/database.js';
import { whatsapp_messages, whatsapp_conversations } from '../db/schema/whatsapp.js';
import axios from 'axios';

export const whatsappService = {
  async sendMessage(data: {
    conversationId: string;
    content?: string;
    messageType: 'text' | 'image' | 'audio' | 'video';
    mediaUrl?: string;
  }) {
    // 1. Get conversation and instance details
    const conversation = await db.query.whatsapp_conversations.findFirst({
      where: eq(whatsapp_conversations.id, data.conversationId),
      with: { instance: true }
    });
    
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    
    // 2. Call Evolution API
    const response = await axios.post(
      `${conversation.instance.api_url}/message/sendText/${conversation.instance_id}`,
      {
        number: conversation.contact_phone,
        text: data.content
      },
      {
        headers: { apikey: conversation.instance.api_key }
      }
    );
    
    // 3. Store message in database
    const [message] = await db
      .insert(whatsapp_messages)
      .values({
        conversation_id: data.conversationId,
        content: data.content,
        message_type: data.messageType,
        is_from_me: true,
        external_id: response.data.key.id
      })
      .returning();
    
    // 4. Update conversation
    await db
      .update(whatsapp_conversations)
      .set({ 
        last_message_at: new Date(),
        last_message: data.content 
      })
      .where(eq(whatsapp_conversations.id, data.conversationId));
    
    return message;
  }
};
```

2. **Controller and Route** (similar to Example 1)

## Hook Migration Guide

### Before (Supabase)

```typescript
// src/hooks/useAuth.tsx
import { useSupabaseClient } from '@supabase/auth-helpers-react';

export const useAuth = () => {
  const supabase = useSupabaseClient();
  
  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };
  
  return { signIn };
};
```

### After (Express API)

```typescript
// src/hooks/useAuth.tsx
import { api, setTokens, clearTokens } from '@/lib/api';
import { useMutation } from '@tanstack/react-query';

export const useAuth = () => {
  const signIn = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const response = await api.auth.login({ email, password });
      return response.data;
    },
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken);
    },
    onError: (error) => {
      clearTokens();
      throw error;
    }
  });
  
  return { signIn };
};
```

### Common Patterns

#### 1. Data Fetching

**Before:**
```typescript
const { data } = await supabase
  .from('tickets')
  .select('*')
  .eq('status', 'open');
```

**After:**
```typescript
const response = await api.get('/tickets', {
  params: { status: 'open' }
});
const data = response.data;
```

#### 2. Real-time Subscriptions

**Before:**
```typescript
const channel = supabase
  .channel('messages')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'whatsapp_messages'
  }, (payload) => {
    console.log('New message:', payload);
  })
  .subscribe();
```

**After:**
```typescript
import { wsClient } from '@/lib/websocket';

useEffect(() => {
  const handler = (data) => {
    console.log('New message:', data);
  };
  
  wsClient.on('new_message', handler);
  return () => wsClient.off('new_message', handler);
}, []);
```

#### 3. File Upload

**Before:**
```typescript
const { data, error } = await supabase.storage
  .from('profile-images')
  .upload(filename, file);
```

**After:**
```typescript
const response = await api.storage.upload(file, 'PROFILE_IMAGES');
const { filename, url } = response.data;
```

## Data Migration

### Database Migration Script

Create `scripts/migrate-data.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import { db } from '../backend/src/config/database.js';
import { profiles, whatsapp_messages /* ... */ } from '../backend/src/db/schema/index.js';

const supabase = createClient(
  process.env.OLD_SUPABASE_URL!,
  process.env.OLD_SUPABASE_KEY!
);

async function migrateTable(tableName: string, schema: any) {
  console.log(`Migrating ${tableName}...`);
  
  let page = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    
    if (error) throw error;
    if (!data || data.length === 0) break;
    
    await db.insert(schema).values(data);
    console.log(`  Migrated ${data.length} rows`);
    
    page++;
  }
}

async function migrate() {
  await migrateTable('profiles', profiles);
  await migrateTable('whatsapp_messages', whatsapp_messages);
  // ... migrate all tables
}

migrate();
```

### Storage Migration Script

Already exists: `scripts/migrate-storage-to-minio.ts`

## Step-by-Step Migration Process

### Phase 1: Preparation
1. ✅ Set up new backend infrastructure
2. ✅ Convert database schemas
3. ✅ Set up authentication
4. ⚠️ Test backend services in isolation

### Phase 2: Function Migration
1. Convert critical Edge Functions first:
   - send-whatsapp-message
   - setup-project-config
   - evolution-webhook
2. Create corresponding Express routes
3. Test each function thoroughly

### Phase 3: Frontend Migration
1. Update authentication hooks first
2. Migrate data fetching hooks table by table
3. Update real-time subscriptions to WebSocket
4. Test each feature as you migrate

### Phase 4: Data Migration
1. Run database migration script
2. Run storage migration script
3. Verify data integrity

### Phase 5: Cleanup
1. Remove Supabase dependencies
2. Delete supabase/ directory
3. Remove src/integrations/supabase/
4. Update environment variables

### Phase 6: Testing
1. End-to-end testing
2. Performance testing
3. Security audit
4. Load testing

## Environment Variables

### Development

Create `backend/.env`:
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/convoinsight
JWT_SECRET=your-32-char-secret-key-here-change-me
JWT_REFRESH_SECRET=your-32-char-refresh-secret-here-change-me
MINIO_ENDPOINT=localhost
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

Create `.env` (frontend):
```bash
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=ws://localhost:3001/ws
```

## Common Issues and Solutions

### Issue 1: CORS Errors
**Solution:** Ensure `CORS_ORIGIN` in backend matches frontend URL

### Issue 2: Token Expiration
**Solution:** API client automatically refreshes tokens. Check refresh token is stored correctly.

### Issue 3: WebSocket Not Connecting
**Solution:** Check firewall rules, ensure WebSocket port is accessible

### Issue 4: Database Connection Errors
**Solution:** Verify DATABASE_URL format and PostgreSQL is running

## Next Steps

1. **Convert Edge Functions**: Start with the most critical functions
2. **Update Hooks**: Begin with authentication and core data hooks
3. **Migrate Data**: Once backend is stable, migrate production data
4. **Remove Supabase**: Final cleanup after everything is working

## Support

For issues during migration:
1. Check backend logs: `npm run docker:logs`
2. Check database: `npm run db:studio`
3. Test API endpoints with curl/Postman
4. Review this guide for common patterns
