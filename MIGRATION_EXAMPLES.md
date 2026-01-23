# Examples: Migrating from Supabase to API Client

## Example 1: Simple Data Fetching Hook

### Before (Supabase):
```typescript
// src/hooks/useTickets.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useTickets() {
  return useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });
}
```

### After (API Client):
```typescript
// src/hooks/useTickets.ts
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export function useTickets() {
  return useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      return await apiClient.get('/tickets');
    },
  });
}
```

## Example 2: Create/Update Hook

### Before (Supabase):
```typescript
// src/hooks/useCreateTicket.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useCreateTicket() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (ticketData) => {
      const { data, error } = await supabase
        .from('tickets')
        .insert(ticketData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}
```

### After (API Client):
```typescript
// src/hooks/useCreateTicket.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export function useCreateTicket() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (ticketData) => {
      return await apiClient.post('/tickets', ticketData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}
```

## Example 3: Edge Function Call

### Before (Supabase):
```typescript
// src/hooks/useQualifyLead.ts
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useQualifyLead() {
  return useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase.functions.invoke('qualify-lead', {
        body: { leadId },
      });
      
      if (error) throw error;
      return data;
    },
  });
}
```

### After (API Client):
```typescript
// src/hooks/useQualifyLead.ts
import { useMutation } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

export function useQualifyLead() {
  return useMutation({
    mutationFn: async (leadId: string) => {
      return await apiClient.post(`/leads/${leadId}/qualify`);
    },
  });
}
```

## Example 4: Real-time Subscription

### Before (Supabase):
```typescript
// Component with real-time subscription
useEffect(() => {
  const subscription = supabase
    .channel('conversation-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'whatsapp_conversations',
        filter: `id=eq.${conversationId}`,
      },
      (payload) => {
        console.log('Conversation updated:', payload);
        queryClient.invalidateQueries(['conversation', conversationId]);
      }
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
}, [conversationId]);
```

### After (Socket.IO):
```typescript
// Component with Socket.IO subscription
import socketClient from '@/lib/socket-client';

useEffect(() => {
  const handleUpdate = (data: any) => {
    console.log('Conversation updated:', data);
    queryClient.invalidateQueries(['conversation', conversationId]);
  };

  socketClient.subscribeToConversation(conversationId, handleUpdate);

  return () => {
    socketClient.unsubscribeFromConversation(conversationId, handleUpdate);
  };
}, [conversationId]);
```

## Example 5: File Upload

### Before (Supabase):
```typescript
// Upload to Supabase Storage
const uploadFile = async (file: File) => {
  const fileName = `${Date.now()}-${file.name}`;
  const { data, error } = await supabase.storage
    .from('whatsapp-media')
    .upload(fileName, file);
  
  if (error) throw error;
  
  const { data: urlData } = supabase.storage
    .from('whatsapp-media')
    .getPublicUrl(fileName);
  
  return urlData.publicUrl;
};
```

### After (API Client):
```typescript
// Upload to MinIO via API
import apiClient from '@/lib/api-client';

const uploadFile = async (file: File) => {
  const result = await apiClient.uploadFile('whatsapp-media', file, (progress) => {
    console.log('Upload progress:', progress);
  });
  
  return result.url;
};
```

## Example 6: AuthContext Migration

### Before (Supabase Auth):
```typescript
const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  if (error) throw error;
  return data;
};

const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};
```

### After (API Client):
```typescript
import apiClient from '@/lib/api-client';

const signIn = async (email: string, password: string) => {
  const result = await apiClient.login(email, password);
  
  localStorage.setItem('access_token', result.accessToken);
  localStorage.setItem('refresh_token', result.refreshToken);
  localStorage.setItem('user', JSON.stringify(result.user));
  
  setUser(result.user);
  
  return { error: null };
};

const signOut = async () => {
  await apiClient.logout();
  setUser(null);
};
```

## Migration Checklist for Each Hook

When migrating a hook, follow these steps:

1. ✅ Replace Supabase imports with API client
2. ✅ Convert `.from().select()` to `apiClient.get()`
3. ✅ Convert `.from().insert()` to `apiClient.post()`
4. ✅ Convert `.from().update()` to `apiClient.put()` or `apiClient.patch()`
5. ✅ Convert `.from().delete()` to `apiClient.delete()`
6. ✅ Convert `.functions.invoke()` to appropriate `apiClient.post()`
7. ✅ Replace realtime subscriptions with Socket.IO
8. ✅ Update error handling if needed
9. ✅ Test the hook thoroughly
10. ✅ Update any components using the hook

## Common Patterns

### Filtering
```typescript
// Before: Supabase
.select('*')
.eq('status', 'open')
.gte('created_at', startDate)

// After: API Client (use query params)
apiClient.get('/tickets', {
  params: {
    status: 'open',
    created_at_gte: startDate,
  }
})
```

### Pagination
```typescript
// Before: Supabase
.select('*')
.range(0, 9)

// After: API Client
apiClient.get('/tickets', {
  params: {
    page: 1,
    per_page: 10,
  }
})
```

### Sorting
```typescript
// Before: Supabase
.order('created_at', { ascending: false })

// After: API Client
apiClient.get('/tickets', {
  params: {
    sort: 'created_at',
    order: 'desc',
  }
})
```

## Testing

After migrating, test:
- Data fetching works correctly
- Creating/updating records works
- Error handling is proper
- Loading states are maintained
- Query invalidation works
- Real-time updates work (if applicable)
