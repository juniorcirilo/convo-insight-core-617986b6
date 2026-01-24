import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';
import { Tables } from '@/integrations/api/types';

type Conversation = Tables<'whatsapp_conversations'>;
type Contact = Tables<'whatsapp_contacts'>;

interface CreateConversationParams {
  instanceId: string;
  phoneNumber: string;
  contactName: string;
  profilePictureUrl?: string;
  generateTicket?: boolean;
}

export const useCreateConversation = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (params: CreateConversationParams) => {
      // 1. Upsert contact
      const { data: contact, error: contactError } = await supabase
        .from('whatsapp_contacts')
        .upsert({
          instance_id: params.instanceId,
          phone_number: params.phoneNumber,
          name: params.contactName,
          profile_picture_url: params.profilePictureUrl,
          deleted_at: null,
        }, {
          onConflict: 'instance_id,phone_number',
        })
        .select()
        .single();

      if (contactError) throw contactError;

      // 2. Check if conversation already exists
      const { data: existingConv, error: checkError } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .eq('instance_id', params.instanceId)
        .eq('contact_id', contact.id)
        .maybeSingle();

      if (checkError) throw checkError;

      let conversation = existingConv;

      if (!existingConv) {
        // 3. Get default sector for this instance
        const { data: defaultSector } = await supabase
          .from('sectors')
          .select('id')
          .eq('instance_id', params.instanceId)
          .eq('is_default', true)
          .eq('is_active', true)
          .maybeSingle();

        // 4. Create new conversation
        const { data: newConversation, error: convError } = await supabase
          .from('whatsapp_conversations')
          .insert({
            instance_id: params.instanceId,
            contact_id: contact.id,
            status: 'active',
            unread_count: 0,
            sector_id: defaultSector?.id || null,
          })
          .select()
          .single();

        if (convError) throw convError;
        conversation = newConversation;
      }

      // 5. Create ticket if requested
      let ticket = null;
      if (params.generateTicket && conversation) {
        // Check if there's already an open ticket for this conversation
        const { data: existingTicket } = await supabase
          .from('tickets')
          .select('id, numero')
          .eq('conversation_id', conversation.id)
          .neq('status', 'finalizado')
          .maybeSingle();

        if (!existingTicket) {
          // Get sector_id from conversation
          const sectorId = conversation.sector_id;

          // Create new ticket
          const { data: newTicket, error: ticketError } = await supabase
            .from('tickets')
            .insert({
              conversation_id: conversation.id,
              sector_id: sectorId,
              status: 'aberto',
              canal: 'whatsapp',
              prioridade: 'media',
              categoria: 'outro',
            })
            .select('id, numero')
            .single();

          if (ticketError) {
            console.error('Error creating ticket:', ticketError);
          } else {
            ticket = newTicket;

            // Insert ticket opened event marker
            const markerTimestamp = new Date().toISOString();
            await supabase
              .from('whatsapp_messages')
              .insert({
                conversation_id: conversation.id,
                message_id: `ticket-opened-${newTicket.id}`,
                remote_jid: 'system',
                content: `TICKET_EVENT:${newTicket.numero}`,
                message_type: 'ticket_opened',
                is_from_me: true,
                status: 'sent',
                timestamp: markerTimestamp,
              });
            // Send automatic welcome message if sector has one
            try {
              // Fetch sector to get mensagem_boas_vindas
              const { data: sector } = await supabase
                .from('sectors')
                .select('id, name, mensagem_boas_vindas')
                .eq('id', sectorId)
                .maybeSingle();

              const welcomeMsg = sector?.mensagem_boas_vindas;
              if (welcomeMsg) {
                // Fetch assigned agent name if any
                let atendenteNome = 'Atendente';
                if (conversation.assigned_to) {
                  const { data: profile } = await supabase
                    .from('profiles')
                    .select('full_name')
                    .eq('id', conversation.assigned_to)
                    .maybeSingle();
                  atendenteNome = profile?.full_name || 'Atendente';
                }

                // Build template context
                const templateContext = {
                  clienteNome: contact.name || contact.phone_number || 'Cliente',
                  clienteTelefone: contact.phone_number || '',
                  atendenteNome,
                  setorNome: sector?.name || '',
                  ticketNumero: newTicket.numero,
                } as any;

                await supabase.functions.invoke('send-whatsapp-message', {
                  body: {
                    conversationId: conversation.id,
                    content: welcomeMsg,
                    messageType: 'text',
                    skipAgentPrefix: true,
                    templateContext,
                  },
                });
              }
            } catch (err) {
              console.error('Error sending welcome message:', err);
            }
          }
        } else {
          ticket = existingTicket;
        }
      }

      return { conversation, contact, ticket };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  return mutation;
};
