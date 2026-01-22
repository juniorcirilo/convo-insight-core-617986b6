import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Ticket {
  id: string;
  conversation_id: string;
  sector_id: string;
  status: 'aberto' | 'em_atendimento' | 'finalizado';
  created_at: string;
  closed_at: string | null;
  closed_by: string | null;
  // SLA fields
  canal: string | null;
  categoria: string | null;
  prioridade: 'alta' | 'media' | 'baixa';
  atendente_id: string | null;
  updated_at: string;
  first_response_at: string | null;
  sla_violated_at: string | null;
}

export interface Feedback {
  id: string;
  ticket_id: string;
  nota: number;
  comentario: string | null;
  created_at: string;
}

// Helper function to insert ticket event marker in conversation
const insertTicketEventMarker = async (
  conversationId: string,
  ticketNumber: number,
  eventType: 'ticket_opened' | 'ticket_closed'
) => {
  const { error } = await supabase
    .from('whatsapp_messages')
    .insert({
      conversation_id: conversationId,
      message_id: crypto.randomUUID(),
      remote_jid: 'system',
      content: `TICKET_EVENT:${ticketNumber}`,
      message_type: eventType,
      is_from_me: true,
      status: 'sent',
      timestamp: new Date().toISOString(),
    });
  
  if (error) {
    console.error(`Error inserting ${eventType} marker:`, error);
  }
  
  return error;
};

export const useTickets = (conversationId?: string) => {
  const queryClient = useQueryClient();

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;

      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('conversation_id', conversationId)
        .neq('status', 'finalizado')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as Ticket | null;
    },
    enabled: !!conversationId,
  });

  // Realtime subscription for ticket updates
  useEffect(() => {
    if (!conversationId) return;

    let ticketInvalidateTimeout: NodeJS.Timeout;

    const channel = supabase
      .channel(`ticket-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          // Debounce invalidation to prevent excessive re-renders
          clearTimeout(ticketInvalidateTimeout);
          ticketInvalidateTimeout = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['ticket', conversationId] });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(ticketInvalidateTimeout);
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  const createTicket = useMutation({
    mutationFn: async ({ conversationId, sectorId }: { conversationId: string; sectorId: string }) => {
      const { data, error } = await supabase
        .from('tickets')
        .insert({
          conversation_id: conversationId,
          sector_id: sectorId,
          status: 'aberto',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket'] });
      toast.success('Ticket criado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao criar ticket');
    },
  });

  const updateTicketStatus = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: 'aberto' | 'em_atendimento' | 'finalizado' }) => {
      const updateData: any = { status };
      
      if (status === 'finalizado') {
        const { data: { user } } = await supabase.auth.getUser();
        updateData.closed_at = new Date().toISOString();
        updateData.closed_by = user?.id;
      }

      const { data, error } = await supabase
        .from('tickets')
        .update(updateData)
        .eq('id', ticketId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ticket'] });
      if (variables.status === 'finalizado') {
        toast.success('Ticket finalizado');
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao atualizar ticket');
    },
  });

  const closeTicket = useMutation({
    mutationFn: async (ticketId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // 1. Fetch ticket with sector data to get closing message and ticket number
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select(`
          id, 
          conversation_id, 
          sector_id,
          numero,
          sectors!inner(mensagem_encerramento)
        `)
        .eq('id', ticketId)
        .single();
      
      if (ticketError) {
        console.error('Error fetching ticket:', ticketError);
        throw ticketError;
      }
      
      // 2. If sector has a closing message, send it via edge function
      const closingMessage = (ticketData as any)?.sectors?.mensagem_encerramento;
      if (closingMessage && ticketData.conversation_id) {
        try {
          const { error: sendError } = await supabase.functions.invoke('send-whatsapp-message', {
            body: {
              conversationId: ticketData.conversation_id,
              content: closingMessage,
              messageType: 'text',
            },
          });
          
          if (sendError) {
            console.error('Error sending closing message:', sendError);
            // Continue with closing the ticket even if message fails
          } else {
            console.log('Closing message sent successfully');
          }
        } catch (err) {
          console.error('Failed to send closing message:', err);
          // Continue with closing the ticket even if message fails
        }
      }
      
      // 3. Update ticket status to finalizado
      const { data, error } = await supabase
        .from('tickets')
        .update({
          status: 'finalizado',
          closed_at: new Date().toISOString(),
          closed_by: user?.id,
        })
        .eq('id', ticketId)
        .select()
        .single();

      if (error) throw error;
      
      // 4. Insert ticket closed event marker
      if (ticketData.conversation_id && ticketData.numero) {
        await insertTicketEventMarker(
          ticketData.conversation_id,
          ticketData.numero,
          'ticket_closed'
        );
        
        // 5. Dispatch webhook for ticket closed
        try {
          await supabase.functions.invoke('dispatch-webhook', {
            body: {
              event: 'ticket_closed',
              data: {
                ticket_id: ticketId,
                ticket_number: ticketData.numero,
                conversation_id: ticketData.conversation_id,
                closed_by: user?.id
              }
            }
          });
        } catch (webhookError) {
          console.error('Error dispatching ticket_closed webhook:', webhookError);
        }
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket'] });
      queryClient.invalidateQueries({ queryKey: ['ticket-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['critical-tickets'] });
      toast.success('Ticket finalizado com sucesso');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao finalizar ticket');
    },
  });

  const submitFeedback = useMutation({
    mutationFn: async ({ ticketId, nota, comentario }: { ticketId: string; nota: number; comentario?: string }) => {
      const { data, error } = await supabase
        .from('feedbacks')
        .insert({
          ticket_id: ticketId,
          nota,
          comentario: comentario || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Feedback enviado, obrigado!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao enviar feedback');
    },
  });

  return {
    ticket,
    isLoading,
    createTicket,
    updateTicketStatus,
    closeTicket,
    submitFeedback,
  };
};

// Hook for listing all tickets (admin view)
export const useTicketsList = (sectorId?: string, status?: string) => {
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets-list', sectorId, status],
    queryFn: async () => {
      let query = supabase
        .from('tickets')
        .select(`
          *,
          whatsapp_conversations!inner(
            id,
            whatsapp_contacts!inner(name, phone_number)
          ),
          sectors!inner(name)
        `)
        .order('created_at', { ascending: false });

      if (sectorId) {
        query = query.eq('sector_id', sectorId);
      }

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  return { tickets, isLoading };
};

// Hook for getting ticket feedback
export const useTicketFeedback = (ticketId?: string) => {
  return useQuery({
    queryKey: ['ticket-feedback', ticketId],
    queryFn: async () => {
      if (!ticketId) return null;
      
      const { data, error } = await supabase
        .from('feedbacks')
        .select('*')
        .eq('ticket_id', ticketId)
        .maybeSingle();
      
      if (error) throw error;
      return data as Feedback | null;
    },
    enabled: !!ticketId,
  });
};
