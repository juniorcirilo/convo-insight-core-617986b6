# Migration from Supabase to Express Backend - Progress Report

## ✅ Completed (Phase 1)

### Backend Infrastructure
- ✅ Express + TypeScript server setup
- ✅ Drizzle ORM configuration
- ✅ Core database schemas (users, whatsapp, leads, tickets, AI)
- ✅ JWT authentication system
- ✅ Middleware (auth, CORS, error handling, validation, rate limiting)
- ✅ MinIO storage configuration
- ✅ Socket.IO for real-time updates
- ✅ Docker Compose setup (Postgres, MinIO, Backend)
- ✅ Storage service and routes
- ✅ Auth service, controller, and routes

### Frontend
- ✅ API client with axios and token refresh
- ✅ File upload/download support
- ✅ Presigned URL generation

### Files Created
- `backend/` - Complete backend structure
- `docker-compose.yml` - Local development environment
- `src/lib/api-client.ts` - Frontend API client

## 🚧 In Progress / TODO

### Phase 2: Complete Database Schemas
The following tables from Supabase types.ts need Drizzle schemas:
- [ ] campaigns & campaign_contacts
- [ ] orders, quotes, products, product_variants
- [ ] webhooks, webhook_logs
- [ ] api_tokens, api_usage_logs
- [ ] sla_config, sla_violations
- [ ] meeting_schedules, availability_slots
- [ ] whatsapp_sentiment_analysis
- [ ] whatsapp_message_edit_history
- [ ] whatsapp_conversation_notes
- [ ] escalation_queue
- [ ] And ~20 more tables

**Action Required**: Create Drizzle schema files for remaining tables based on `src/integrations/supabase/types.ts`

### Phase 3: Migrate Edge Functions to Express Routes

#### Priority 1 (Core Functions)
- [ ] `send-whatsapp-message` → `/api/whatsapp/send`
- [ ] `edit-whatsapp-message` → `/api/whatsapp/messages/:id/edit`
- [ ] `mark-messages-read` → `/api/whatsapp/messages/mark-read`
- [ ] `get-media-signed-url` → `/api/whatsapp/media/:id/url`
- [ ] `analyze-whatsapp-sentiment` → `/api/whatsapp/sentiment/analyze`
- [ ] `qualify-lead` → `/api/leads/:id/qualify`

#### Priority 2 (Admin Functions)
- [ ] `setup-project-config` → `/api/admin/setup`
- [ ] `ensure-user-profile` → `/api/admin/users/ensure-profile`
- [ ] `admin-reset-password` → `/api/admin/users/:id/reset-password`
- [ ] `invite-team-member` → `/api/admin/team/invite`

#### Priority 3 (AI Functions)
- [ ] `suggest-smart-replies` → `/api/ai/smart-replies`
- [ ] `compose-whatsapp-message` → `/api/ai/compose`
- [ ] `manage-knowledge-base` → `/api/ai/knowledge`
- [ ] `learn-from-conversation` → `/api/ai/learn`

#### Priority 4 (Other Functions)
- [ ] `generate-conversation-summary` → `/api/conversations/:id/summary`
- [ ] `dispatch-webhook` → `/api/webhooks/dispatch`
- [ ] `import-google-contacts` → `/api/contacts/import`
- [ ] `test-evolution-connection` → `/api/whatsapp/test-connection`

**Action Required**: For each function:
1. Create service in `backend/src/services/`
2. Create controller in `backend/src/controllers/`
3. Create routes in `backend/src/routes/`
4. Add validation schemas with Zod
5. Update `backend/src/app.ts` to register routes

### Phase 4: Frontend Migration

#### Update AuthContext
File: `src/contexts/AuthContext.tsx`

**Current State**: Uses Supabase client for auth
**Required Changes**:
1. Remove Supabase imports
2. Import `apiClient` from `src/lib/api-client.ts`
3. Update `signIn()` to use `apiClient.login()`
4. Update `signUp()` to use `apiClient.register()`
5. Update `signOut()` to use `apiClient.logout()`
6. Remove Supabase session management
7. Store user data in localStorage
8. Update profile loading logic

Example:
```typescript
const signIn = async (email: string, password: string) => {
  try {
    const { user, accessToken, refreshToken } = await apiClient.login(email, password);
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
    await refreshProfile();
    return { error: null };
  } catch (error) {
    return { error };
  }
};
```

#### Update Hooks (~25 hooks)

Each hook needs migration from Supabase to API client:

**WhatsApp Hooks** (src/hooks/):
- [ ] useWhatsAppConversations
- [ ] useWhatsAppSend
- [ ] useWhatsAppActions
- [ ] useMediaSignedUrl
- [ ] useSmartReply
- [ ] useWhatsAppSentiment

**Sales Hooks**:
- [ ] useLeads
- [ ] useQuotes
- [ ] useOrders
- [ ] useLeadQualification
- [ ] useLeadStatusHistory

**AI Hooks**:
- [ ] useKnowledgeBase
- [ ] useLearningExamples
- [ ] useAIAgentConfig
- [ ] useEscalationQueue

**Admin Hooks**:
- [ ] useAdminConversations
- [ ] useSLAConfig
- [ ] useTicketMetrics
- [ ] useTeamManagement
- [ ] usePermissions

**Action Required**: For each hook:
1. Replace `supabase.from().select()` with `apiClient.get()`
2. Replace `supabase.from().insert()` with `apiClient.post()`
3. Replace `supabase.from().update()` with `apiClient.put()` or `apiClient.patch()`
4. Replace `supabase.from().delete()` with `apiClient.delete()`
5. Replace `supabase.functions.invoke()` with `apiClient.post()` to appropriate endpoint
6. Update real-time subscriptions to use Socket.IO

#### Update Components (~100+ components)

Components using Supabase directly need updates:
- [ ] InternalNoteInput.tsx
- [ ] QuotedMessagePreview.tsx
- [ ] MediaPreview components
- [ ] All components with direct Supabase imports

**Action Required**:
1. Replace Supabase imports with API client
2. Update storage URLs to use new endpoints
3. Update real-time subscriptions to Socket.IO

### Phase 5: Real-time Migration

#### Socket.IO Client Setup
File: `src/lib/socket-client.ts` (CREATE NEW)

```typescript
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';

class SocketClient {
  private socket: Socket | null = null;

  connect() {
    const token = localStorage.getItem('access_token');
    this.socket = io(SOCKET_URL, {
      auth: { token },
    });
    
    this.socket.on('connect', () => {
      console.log('Socket connected');
    });
  }

  disconnect() {
    this.socket?.disconnect();
  }

  subscribeToConversation(conversationId: string, callback: (data: any) => void) {
    this.socket?.emit('subscribe:conversation', conversationId);
    this.socket?.on('conversation:update', callback);
  }

  // Add more subscription methods...
}

export const socketClient = new SocketClient();
```

**Action Required**:
1. Create socket client
2. Replace all Supabase realtime subscriptions with Socket.IO
3. Update components to use socket client

### Phase 6: Environment & Configuration

#### Frontend .env
File: `src/.env` or root `.env`

**Add**:
```env
VITE_API_URL=http://localhost:3000/api
```

**Remove**:
```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

#### Backend .env
File: `backend/.env` (copy from `backend/.env.example`)

**Action Required**:
1. Copy `.env.example` to `.env`
2. Update JWT secrets (must be 32+ characters)
3. Update database URL if needed
4. Update CORS_ORIGIN to match frontend port

### Phase 7: Database Migration

#### Setup Database
```bash
cd backend
npm install
npm run db:generate  # Generate migrations
npm run db:push      # Push to database
npm run db:seed      # Seed initial data (needs to be created)
```

#### Create Seed Data
File: `backend/src/db/seed.ts`

**Action Required**:
1. Create admin user
2. Create default sectors
3. Create default AI config
4. Migrate existing Supabase data

### Phase 8: Cleanup

**Delete Files**:
- [ ] `src/integrations/supabase/` (entire directory)
- [ ] `supabase/` (entire directory)
- [ ] `cleanup-orphan-users.sql`
- [ ] `create_user.sql`
- [ ] `update-users.sql`
- [ ] `scripts/migrate-supabase-storage.cjs`

**Update package.json**:
- [ ] Remove `@supabase/supabase-js`
- [ ] Remove `supabase` CLI
- [ ] Add `axios` (if not present)
- [ ] Add `socket.io-client`

### Phase 9: Testing

- [ ] Test login/logout flow
- [ ] Test file upload/download
- [ ] Test WhatsApp message sending
- [ ] Test real-time updates
- [ ] Test all API endpoints
- [ ] Run code review tool
- [ ] Run CodeQL security scan

## Quick Start Guide

### Start Backend (Local Development)
```bash
# Using Docker Compose (Recommended)
docker-compose up

# Or manually
cd backend
npm install
cp .env.example .env
# Edit .env with your settings
npm run dev
```

### Start Frontend
```bash
npm install
npm run dev
```

## Next Steps

1. **Complete database schemas** for remaining tables
2. **Migrate edge functions** starting with Priority 1
3. **Update AuthContext** to use API client
4. **Migrate hooks** one by one, testing each
5. **Add Socket.IO client** for real-time
6. **Update components** to use new API
7. **Run tests and validation**
8. **Clean up Supabase files**

## Notes

- The backend is production-ready architecture but needs all endpoints implemented
- Database schemas cover ~30% of tables - remaining need to be added
- Frontend API client is complete and ready to use
- Socket.IO is configured but needs client integration
- Docker setup is ready for local development
