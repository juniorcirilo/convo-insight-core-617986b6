import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

type Conversation = Tables<'whatsapp_conversations'>;
type Contact = Tables<'whatsapp_contacts'>;

interface ConversationWithContact extends Conversation {
  contact: Contact;
  isLastMessageFromMe?: boolean;
  instance?: { id: string; name: string } | null;
}

interface ConversationsFilters {
  instanceId?: string;
  search?: string;
  status?: string;
  assignedTo?: string;
  unassigned?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ConversationsResult {
  conversations: ConversationWithContact[];
  totalCount: number;
  totalPages: number;
  unreadCount: number;
  waitingCount: number;
}

export const useWhatsAppConversations = (filters?: ConversationsFilters) => {
  const queryClient = useQueryClient();
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, isLoading, error } = useQuery({
    queryKey: ['whatsapp', 'conversations', filters],
    queryFn: async () => {
      // Query 1: Get paginated conversations
      let query = supabase
        .from('whatsapp_conversations')
        .select(`
          *,
          contact:whatsapp_contacts(*),
          assigned_profile:profiles(id, full_name, avatar_url),
          instance:whatsapp_instances(id, name)
        `)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .range(from, to);

      if (filters?.instanceId) {
        query = query.eq('instance_id', filters.instanceId);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo);
      }

      if (filters?.unassigned) {
        query = query.is('assigned_to', null);
      }

      const { data: conversationsData, error } = await query;

      if (error) throw error;

      let result = conversationsData as unknown as ConversationWithContact[];

      // Query 2: Get total count (without pagination)
      let countQuery = supabase
        .from('whatsapp_conversations')
        .select('*', { count: 'exact', head: true });

      if (filters?.instanceId) {
        countQuery = countQuery.eq('instance_id', filters.instanceId);
      }

      if (filters?.status) {
        countQuery = countQuery.eq('status', filters.status);
      }

      if (filters?.assignedTo) {
        countQuery = countQuery.eq('assigned_to', filters.assignedTo);
      }

      if (filters?.unassigned) {
        countQuery = countQuery.is('assigned_to', null);
      }

      const { count: totalCount } = await countQuery;

      // Query 3: Get unread count (all conversations)
      let unreadQuery = supabase
        .from('whatsapp_conversations')
        .select('unread_count', { count: 'exact' })
        .gt('unread_count', 0);

      if (filters?.instanceId) {
        unreadQuery = unreadQuery.eq('instance_id', filters.instanceId);
      }

      if (filters?.status) {
        unreadQuery = unreadQuery.eq('status', filters.status);
      }

      if (filters?.assignedTo) {
        unreadQuery = unreadQuery.eq('assigned_to', filters.assignedTo);
      }

      if (filters?.unassigned) {
        unreadQuery = unreadQuery.is('assigned_to', null);
      }

      const { count: unreadCount } = await unreadQuery;

      // Buscar is_from_me da última mensagem de cada conversa (só das paginadas)
      const conversationIds = result.map(c => c.id);
      
      // Também buscar todas as conversas para calcular waitingCount
      let allConversationsQuery = supabase
        .from('whatsapp_conversations')
        .select('id');

      if (filters?.instanceId) {
        allConversationsQuery = allConversationsQuery.eq('instance_id', filters.instanceId);
      }

      if (filters?.status) {
        allConversationsQuery = allConversationsQuery.eq('status', filters.status);
      }

      if (filters?.assignedTo) {
        allConversationsQuery = allConversationsQuery.eq('assigned_to', filters.assignedTo);
      }

      if (filters?.unassigned) {
        allConversationsQuery = allConversationsQuery.is('assigned_to', null);
      }

      const { data: allConversations } = await allConversationsQuery;
      const allConversationIds = allConversations?.map(c => c.id) || [];

      if (allConversationIds.length > 0) {
        const { data: allLastMessages } = await supabase
          .from('whatsapp_messages')
          .select('conversation_id, is_from_me, timestamp')
          .in('conversation_id', allConversationIds)
          .order('timestamp', { ascending: false });

        if (allLastMessages) {
          // Agrupar por conversation_id e pegar a primeira (mais recente)
          const lastMessageMap = new Map<string, boolean>();
          allLastMessages.forEach(msg => {
            if (!lastMessageMap.has(msg.conversation_id)) {
              lastMessageMap.set(msg.conversation_id, msg.is_from_me || false);
            }
          });

          // Aplicar aos resultados paginados
          result = result.map(conv => ({
            ...conv,
            isLastMessageFromMe: lastMessageMap.get(conv.id),
          }));

          // Calcular waitingCount (mensagens do cliente sem resposta)
          const waitingCount = allConversationIds.filter(
            id => lastMessageMap.get(id) === false
          ).length;

          const totalPages = Math.ceil((totalCount || 0) / pageSize);

          return {
            conversations: result,
            totalCount: totalCount || 0,
            totalPages,
            unreadCount: unreadCount || 0,
            waitingCount,
          } as ConversationsResult;
        }
      }

      const totalPages = Math.ceil((totalCount || 0) / pageSize);

      return {
        conversations: result,
        totalCount: totalCount || 0,
        totalPages,
        unreadCount: unreadCount || 0,
        waitingCount: 0,
      } as ConversationsResult;
    },
  });

  useEffect(() => {
    console.log('[useWhatsAppConversations] Setting up realtime subscriptions');
    
    let conversationInvalidateTimeout: NodeJS.Timeout;
    let messageInvalidateTimeout: NodeJS.Timeout;
    let contactInvalidateTimeout: NodeJS.Timeout;
    
    // Subscribe to conversation changes
    const conversationsChannel = supabase
      .channel('conversations-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_conversations'
      }, (payload) => {
        console.log('[useWhatsAppConversations] Conversation change:', payload.eventType, payload.new);
        // Debounce invalidation to prevent excessive re-renders
        clearTimeout(conversationInvalidateTimeout);
        conversationInvalidateTimeout = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
        }, 100);
      })
      .subscribe((status) => {
        console.log('[useWhatsAppConversations] Conversations subscription status:', status);
      });

    // Subscribe to new/updated messages to update conversation list in real-time
    const messagesChannel = supabase
      .channel('messages-for-conversations')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_messages'
      }, (payload) => {
        console.log('[useWhatsAppConversations] Message event:', payload.eventType, payload.new);
        // Debounce invalidation to prevent excessive re-renders
        clearTimeout(messageInvalidateTimeout);
        messageInvalidateTimeout = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
        }, 100);
      })
      .subscribe((status) => {
        console.log('[useWhatsAppConversations] Messages subscription status:', status);
      });

    // Subscribe to contact changes (name, photo updates)
    const contactsChannel = supabase
      .channel('contacts-for-conversations')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_contacts'
      }, (payload) => {
        console.log('[useWhatsAppConversations] Contact change:', payload.eventType, payload.new);
        clearTimeout(contactInvalidateTimeout);
        contactInvalidateTimeout = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
        }, 100);
      })
      .subscribe((status) => {
        console.log('[useWhatsAppConversations] Contacts subscription status:', status);
      });

    // Subscribe to ticket changes
    const ticketsChannel = supabase
      .channel('tickets-for-conversations')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tickets'
      }, (payload) => {
        console.log('[useWhatsAppConversations] Ticket change:', payload.eventType, payload.new);
        clearTimeout(contactInvalidateTimeout);
        contactInvalidateTimeout = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
          queryClient.invalidateQueries({ queryKey: ['tickets'] });
        }, 100);
      })
      .subscribe((status) => {
        console.log('[useWhatsAppConversations] Tickets subscription status:', status);
      });

    return () => {
      console.log('[useWhatsAppConversations] Removing realtime channels');
      clearTimeout(conversationInvalidateTimeout);
      clearTimeout(messageInvalidateTimeout);
      clearTimeout(contactInvalidateTimeout);
      supabase.removeChannel(conversationsChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(contactsChannel);
      supabase.removeChannel(ticketsChannel);
    };
  }, [queryClient]);

  return {
    conversations: data?.conversations || [],
    totalCount: data?.totalCount || 0,
    totalPages: data?.totalPages || 0,
    unreadCount: data?.unreadCount || 0,
    waitingCount: data?.waitingCount || 0,
    isLoading,
    error,
  };
};
