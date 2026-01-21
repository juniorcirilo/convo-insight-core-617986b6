import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { useMarkMessagesRead } from './useMarkMessagesRead';

type Message = Tables<'whatsapp_messages'>;

export const useWhatsAppMessages = (conversationId: string | null) => {
  const queryClient = useQueryClient();
  const markMessagesRead = useMarkMessagesRead();
  const lastMarkedConversationRef = useRef<string | null>(null);
  const markReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced mark as read function
  const debouncedMarkAsRead = useCallback((convId: string) => {
    if (markReadTimeoutRef.current) {
      clearTimeout(markReadTimeoutRef.current);
    }
    markReadTimeoutRef.current = setTimeout(() => {
      markMessagesRead.mutate({ conversationId: convId });
    }, 500); // 500ms debounce
  }, [markMessagesRead]);

  const { data: messages = [], isLoading, error, refetch } = useQuery({
    queryKey: ['whatsapp', 'messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('timestamp', { ascending: true });

      if (error) throw error;
      return data as Message[];
    },
    enabled: !!conversationId,
    // Refetch more frequently to catch status updates
    refetchInterval: 5000,
  });

  // Mark messages as read bidirectionally when conversation is opened
  useEffect(() => {
    if (conversationId && conversationId !== lastMarkedConversationRef.current) {
      lastMarkedConversationRef.current = conversationId;
      
      // Call the edge function to mark messages as read (bidirectional with Evolution API)
      debouncedMarkAsRead(conversationId);
    }
    
    return () => {
      if (markReadTimeoutRef.current) {
        clearTimeout(markReadTimeoutRef.current);
      }
    };
  }, [conversationId, debouncedMarkAsRead]);

  // Realtime subscription for new, updated and deleted messages
  useEffect(() => {
    if (!conversationId) return;

    console.log('[useWhatsAppMessages] Setting up realtime subscription for:', conversationId);

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `conversation_id=eq.${conversationId}`
      }, (payload) => {
        console.log('[useWhatsAppMessages] INSERT received:', payload.new);
        queryClient.setQueryData(['whatsapp', 'messages', conversationId], (old: Message[] = []) => {
          const exists = old.some(msg => msg.id === payload.new.id);
          if (exists) return old;
          return [...old, payload.new as Message];
        });
        
        // If message is from client (not from me), mark as read immediately
        const newMessage = payload.new as Message;
        if (!newMessage.is_from_me) {
          debouncedMarkAsRead(conversationId);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `conversation_id=eq.${conversationId}`
      }, (payload) => {
        console.log('[useWhatsAppMessages] UPDATE received:', payload.new);
        queryClient.setQueryData(['whatsapp', 'messages', conversationId], (old: Message[] = []) => {
          // Prefer matching by primary `id` if present
          const newRow = payload.new as Message;
          const updated = old.map(msg => {
            // Match by id
            if (msg.id === newRow.id) {
              console.log('[useWhatsAppMessages] Updating message by id:', msg.id, 'old status:', msg.status, 'new status:', newRow.status);
              return { ...msg, ...newRow };
            }
            // Fallback: match by message_id (external provider id)
            if (msg.message_id && msg.message_id === newRow.message_id) {
              console.log('[useWhatsAppMessages] Updating message by message_id:', msg.message_id, 'old status:', msg.status, 'new status:', newRow.status);
              return { ...msg, ...newRow };
            }
            return msg;
          });

          return updated;
        });
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `conversation_id=eq.${conversationId}`
      }, (payload) => {
        console.log('[useWhatsAppMessages] DELETE received:', payload.old);
        queryClient.setQueryData(['whatsapp', 'messages', conversationId], (old: Message[] = []) => {
          return old.filter(msg => msg.id !== (payload.old as any).id);
        });
      })
      .subscribe((status) => {
        console.log('[useWhatsAppMessages] Subscription status:', status);
      });

    return () => {
      console.log('[useWhatsAppMessages] Removing channel for:', conversationId);
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient, debouncedMarkAsRead]);

  return {
    messages,
    isLoading,
    error,
    refetch,
  };
};
