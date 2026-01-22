import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { webhookEvents } from '@/utils/webhookDispatcher';
import { toast } from 'sonner';

export const useWhatsAppActions = () => {
  const queryClient = useQueryClient();

  // Archive conversation
  const archiveMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ status: 'archived' })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: ['whatsapp', 'conversations'] });
      const previousConversations = queryClient.getQueryData(['whatsapp', 'conversations']);
      
      queryClient.setQueryData(['whatsapp', 'conversations'], (old: any) => {
        if (!old) return old;
        return old.map((conv: any) => 
          conv.id === conversationId ? { ...conv, status: 'archived' } : conv
        );
      });
      
      return { previousConversations };
    },
    onSuccess: (_, conversationId) => {
      toast.success('Conversa arquivada com sucesso');
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
    onError: (error, _, context: any) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(['whatsapp', 'conversations'], context.previousConversations);
      }
      console.error('Erro ao arquivar conversa:', error);
      toast.error('Erro ao arquivar conversa');
    },
  });

  // Close conversation
  const closeMutation = useMutation({
    mutationFn: async ({ conversationId, generateSummary }: { 
      conversationId: string; 
      generateSummary: boolean;
    }) => {
      if (generateSummary) {
        try {
          await supabase.functions.invoke('generate-conversation-summary', {
            body: { conversationId }
          });
        } catch (e) {
          console.error('Erro ao gerar resumo:', e);
        }
      }

      // Fetch last ticket before closing
      const { data: lastTicket } = await supabase
        .from('tickets')
        .select('id, numero, status')
        .eq('conversation_id', conversationId)
        .neq('status', 'finalizado')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Close the ticket if there's an open one
      if (lastTicket && lastTicket.status !== 'finalizado') {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase
          .from('tickets')
          .update({
            status: 'finalizado',
            closed_at: new Date().toISOString(),
            closed_by: user?.id,
          })
          .eq('id', lastTicket.id);
        console.log('[useWhatsAppActions] Ticket closed:', lastTicket.id);
      }

      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ status: 'closed' })
        .eq('id', conversationId);
      if (error) throw error;

      // Get the timestamp of the last message to ensure marker appears after it
      const { data: lastMessage } = await supabase
        .from('whatsapp_messages')
        .select('timestamp')
        .eq('conversation_id', conversationId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Use a timestamp 1ms AFTER the last message so marker appears after last message
      const markerTimestamp = lastMessage?.timestamp 
        ? new Date(new Date(lastMessage.timestamp).getTime() + 1).toISOString()
        : new Date().toISOString();

      // Insert ticket_closed marker
      const ticketNumber = lastTicket?.numero || 0;
      const markerId = `closed-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      await supabase
        .from('whatsapp_messages')
        .insert({
          conversation_id: conversationId,
          message_id: markerId,
          remote_jid: 'system',
          content: `TICKET_EVENT:${ticketNumber}`,
          message_type: 'ticket_closed',
          is_from_me: true,
          status: 'sent',
          timestamp: markerTimestamp,
        });

      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id || '';
        // Fire-and-forget webhook dispatch
        webhookEvents.conversationClosed(conversationId, userId);
      } catch (err) {
        console.error('Error dispatching conversation_closed webhook:', err);
      }
    },
    onSuccess: (_, variables) => {
      toast.success('Conversa encerrada com sucesso');
      // Force immediate refetch of ticket data
      queryClient.invalidateQueries({ queryKey: ['ticket', variables.conversationId] });
      queryClient.refetchQueries({ queryKey: ['ticket', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'messages', variables.conversationId] });
    },
    onError: (error) => {
      console.error('Erro ao encerrar conversa:', error);
      toast.error('Erro ao encerrar conversa');
    },
  });

  // Reopen conversation
  const reopenMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      // Fetch last ticket number before reopening
      const { data: lastTicket } = await supabase
        .from('tickets')
        .select('numero')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ status: 'active' })
        .eq('id', conversationId);
      if (error) throw error;

      // Get the timestamp of the last ticket_closed marker to place reopened marker right after it
      const { data: lastClosedMarker } = await supabase
        .from('whatsapp_messages')
        .select('timestamp')
        .eq('conversation_id', conversationId)
        .eq('message_type', 'ticket_closed')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Use a timestamp 1ms after the last closed marker so reopened appears right after closing
      const markerTimestamp = lastClosedMarker?.timestamp 
        ? new Date(new Date(lastClosedMarker.timestamp).getTime() + 1).toISOString()
        : new Date().toISOString();

      // Insert conversation_reopened marker
      const ticketNumber = lastTicket?.numero || 0;
      const markerId = `reopened-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      await supabase
        .from('whatsapp_messages')
        .insert({
          conversation_id: conversationId,
          message_id: markerId,
          remote_jid: 'system',
          content: `CONVERSATION_REOPENED:${ticketNumber}`,
          message_type: 'conversation_reopened',
          is_from_me: true,
          status: 'sent',
          timestamp: markerTimestamp,
        });

      try {
        // Fetch conversation details to include in webhook payload
        const { data: conv } = await supabase
          .from('whatsapp_conversations')
          .select('id, contact_id, instance_id')
          .eq('id', conversationId)
          .maybeSingle();

        if (conv) {
          // Get contact name
          const { data: contact } = await supabase
            .from('whatsapp_contacts')
            .select('id, name')
            .eq('id', conv.contact_id)
            .maybeSingle();

          const previousTicketNumber = lastTicket?.numero || null;

          // Dispatch webhook (fire-and-forget)
          webhookEvents.conversationReopened(
            conversationId,
            contact?.name || '',
            conv.instance_id,
            previousTicketNumber || undefined
          );
        }
      } catch (err) {
        console.error('Error dispatching conversation_reopened webhook:', err);
      }
    },
    onSuccess: (_, conversationId) => {
      toast.success('Conversa reaberta com sucesso');
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['ticket', conversationId] });
    },
    onError: (error) => {
      console.error('Erro ao reabrir conversa:', error);
      toast.error('Erro ao reabrir conversa');
    },
  });

  // Mark as unread
  const markAsUnreadMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ unread_count: 1 })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: ['whatsapp', 'conversations'] });
      const previousConversations = queryClient.getQueryData(['whatsapp', 'conversations']);
      
      queryClient.setQueryData(['whatsapp', 'conversations'], (old: any) => {
        if (!old) return old;
        return old.map((conv: any) => 
          conv.id === conversationId ? { ...conv, unread_count: 1 } : conv
        );
      });
      
      return { previousConversations };
    },
    onSuccess: () => {
      toast.success('Conversa marcada como não lida');
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
    },
    onError: (error, _, context: any) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(['whatsapp', 'conversations'], context.previousConversations);
      }
      toast.error('Erro ao marcar conversa como não lida');
    },
  });

  // Update contact
  const updateContactMutation = useMutation({
    mutationFn: async ({ contactId, data }: {
      contactId: string;
      data: { name: string; notes: string | null };
    }) => {
      const { error } = await supabase
        .from('whatsapp_contacts')
        .update({
          name: data.name,
          notes: data.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Contato atualizado com sucesso');
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
    },
    onError: (error) => {
      console.error('Erro ao atualizar contato:', error);
      toast.error('Erro ao atualizar contato');
    },
  });

  return {
    archiveConversation: archiveMutation.mutate,
    isArchiving: archiveMutation.isPending,

    closeConversation: closeMutation.mutate,
    isClosing: closeMutation.isPending,

    reopenConversation: reopenMutation.mutate,
    isReopening: reopenMutation.isPending,

    markAsUnread: markAsUnreadMutation.mutate,
    isMarkingUnread: markAsUnreadMutation.isPending,

    updateContact: updateContactMutation.mutate,
    isUpdatingContact: updateContactMutation.isPending,
  };
};
