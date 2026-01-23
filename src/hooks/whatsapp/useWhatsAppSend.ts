import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

type Message = Tables<'whatsapp_messages'>;

interface SendMessageParams {
  conversationId: string;
  content?: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document';
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimetype?: string;
  fileName?: string;
  quotedMessageId?: string;
  // Supervisor message support
  isSupervisorMessage?: boolean;
  supervisorId?: string;
}

export const useWhatsAppSend = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (params: SendMessageParams) => {
      // 1. Check if conversation is closed
      const { data: conv } = await supabase
        .from('whatsapp_conversations')
        .select(`
          status, 
          sector_id, 
          contact_id,
          sectors(name, mensagem_boas_vindas, mensagem_reabertura, gera_ticket),
          whatsapp_contacts(name, phone_number)
        `)
        .eq('id', params.conversationId)
        .single();

      if (conv?.status === 'closed') {
        console.log('[useWhatsAppSend] Conversation is closed, reopening before sending message...');
        
        // Reopen conversation status
        await supabase
          .from('whatsapp_conversations')
          .update({ status: 'active' })
          .eq('id', params.conversationId);

        // Fetch last ticket
        const { data: lastTicket } = await supabase
          .from('tickets')
          .select('id, status, numero')
          .eq('conversation_id', params.conversationId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const shouldCreateNewTicket = (conv as any)?.sectors?.gera_ticket && (!lastTicket || lastTicket.status === 'finalizado');

        let activeTicketNumber = lastTicket?.numero || 0;
        let markerType: 'ticket_opened' | 'conversation_reopened' = 'conversation_reopened';

        // Fetch current user (agent) name for template context
        let atendenteNome = 'Atendente';
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .maybeSingle();
          atendenteNome = profile?.full_name || 'Atendente';
        }

        // Build template context for automatic messages
        const contact = (conv as any)?.whatsapp_contacts;
        const sector = (conv as any)?.sectors;
        const templateContext: any = {
          clienteNome: contact?.name || contact?.phone_number || 'Cliente',
          clienteTelefone: contact?.phone_number || '',
          atendenteNome,
          setorNome: sector?.name || '',
          ticketNumero: activeTicketNumber,
        };

        if (shouldCreateNewTicket) {
          console.log('[useWhatsAppSend] Creating new ticket as per sector config...');
          const { data: newTicket } = await supabase
            .from('tickets')
            .insert({
              conversation_id: params.conversationId,
              sector_id: conv.sector_id,
              status: 'aberto',
            })
            .select()
            .single();
          
          if (newTicket) {
            activeTicketNumber = newTicket.numero;
            templateContext.ticketNumero = newTicket.numero;
            markerType = 'ticket_opened';
            
            // Send welcome message if configured
            const welcomeMsg = (conv as any)?.sectors?.mensagem_boas_vindas;
            if (welcomeMsg) {
              await supabase.functions.invoke('send-whatsapp-message', {
                body: {
                  conversationId: params.conversationId,
                  content: welcomeMsg,
                  messageType: 'text',
                  skipAgentPrefix: true,
                  templateContext,
                },
              });
            }
          }
        } else if (lastTicket && lastTicket.status === 'finalizado') {
          console.log('[useWhatsAppSend] Reopening last ticket...');
          await supabase
            .from('tickets')
            .update({ 
              status: 'reaberto',
              closed_at: null,
              closed_by: null,
            })
            .eq('id', lastTicket.id);
          
          templateContext.ticketNumero = lastTicket.numero;
            
          // Send reopen message if configured
          const reopenMsg = (conv as any)?.sectors?.mensagem_reabertura || (conv as any)?.sectors?.mensagem_boas_vindas;
          if (reopenMsg) {
            await supabase.functions.invoke('send-whatsapp-message', {
              body: {
                conversationId: params.conversationId,
                content: reopenMsg,
                messageType: 'text',
                skipAgentPrefix: true,
                templateContext,
              },
            });
          }
        }

        // Insert event marker
        const { data: lastMessage } = await supabase
          .from('whatsapp_messages')
          .select('timestamp')
          .eq('conversation_id', params.conversationId)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();

        const markerTimestamp = lastMessage?.timestamp 
          ? new Date(new Date(lastMessage.timestamp).getTime() + 1).toISOString()
          : new Date().toISOString();

        const markerId = `${markerType === 'ticket_opened' ? 'opened' : 'reopened'}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        await supabase
          .from('whatsapp_messages')
          .insert({
            conversation_id: params.conversationId,
            message_id: markerId,
            remote_jid: 'system',
            content: markerType === 'ticket_opened' ? `TICKET_EVENT:${activeTicketNumber}` : `CONVERSATION_REOPENED:${activeTicketNumber}`,
            message_type: markerType,
            is_from_me: true,
            status: 'sent',
            timestamp: markerTimestamp,
          });
      }

      // 2. Send the actual message
      const { data, error } = await supabase.functions.invoke('send-whatsapp-message', {
        body: params,
      });

      if (error) throw error;
      return data;
    },
    onMutate: async (newMessage) => {
      await queryClient.cancelQueries({ queryKey: ['whatsapp', 'messages', newMessage.conversationId] });
      
      const previousMessages = queryClient.getQueryData(['whatsapp', 'messages', newMessage.conversationId]);
      
      const optimisticMessage: Partial<Message> = {
        id: 'temp-' + Date.now(),
        conversation_id: newMessage.conversationId,
        content: newMessage.content || '',
        message_type: newMessage.messageType,
        media_url: newMessage.mediaUrl,
        media_mimetype: newMessage.mediaMimetype,
        status: 'sending',
        is_from_me: true,
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
        message_id: '',
        remote_jid: '',
        quoted_message_id: newMessage.quotedMessageId || null,
        metadata: {},
      };

      queryClient.setQueryData(['whatsapp', 'messages', newMessage.conversationId], (old: Message[] = []) => [
        ...old,
        optimisticMessage as Message,
      ]);

      return { previousMessages };
    },
    onError: (err, newMessage, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['whatsapp', 'messages', newMessage.conversationId], context.previousMessages);
      }
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['ticket', variables.conversationId] });
    },
  });

  return mutation;
};
