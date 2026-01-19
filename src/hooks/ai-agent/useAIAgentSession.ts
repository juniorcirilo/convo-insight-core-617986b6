import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEffect } from 'react';

export interface AIAgentSession {
  id: string;
  conversation_id: string;
  mode: 'ai' | 'human' | 'hybrid';
  auto_reply_count: number;
  last_ai_response_at: string | null;
  conversation_summary: string | null;
  detected_intent: string | null;
  lead_score: number | null;
  escalated_at: string | null;
  escalation_reason: string | null;
  escalated_to: string | null;
  created_at: string;
  updated_at: string;
}

export type ConversationMode = 'ai' | 'human' | 'hybrid';

export const useAIAgentSession = (conversationId?: string | null) => {
  const queryClient = useQueryClient();

  const { data: session, isLoading, error } = useQuery({
    queryKey: ['ai-agent-session', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;

      const { data, error } = await supabase
        .from('ai_agent_sessions')
        .select('*')
        .eq('conversation_id', conversationId)
        .maybeSingle();

      if (error) throw error;
      return data as AIAgentSession | null;
    },
    enabled: !!conversationId,
  });

  // Subscrição realtime para atualizações de sessão
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`ai-session-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_agent_sessions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['ai-agent-session', conversationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  const changeMode = useMutation({
    mutationFn: async ({ mode, userId }: { mode: ConversationMode; userId?: string }) => {
      if (!conversationId) throw new Error('No conversation ID');

      // Atualizar sessão
      const sessionUpdate: Record<string, any> = { mode };
      if (mode === 'human') {
        sessionUpdate.escalated_at = new Date().toISOString();
        sessionUpdate.escalation_reason = 'manual_takeover';
        if (userId) sessionUpdate.escalated_to = userId;
      } else if (mode === 'ai') {
        sessionUpdate.auto_reply_count = 0;
        sessionUpdate.escalated_at = null;
        sessionUpdate.escalation_reason = null;
        sessionUpdate.escalated_to = null;
      }

      // Verificar se sessão existe
      const { data: existingSession } = await supabase
        .from('ai_agent_sessions')
        .select('id')
        .eq('conversation_id', conversationId)
        .maybeSingle();

      if (existingSession) {
        await supabase
          .from('ai_agent_sessions')
          .update(sessionUpdate)
          .eq('conversation_id', conversationId);
      } else {
        await supabase
          .from('ai_agent_sessions')
          .insert({
            conversation_id: conversationId,
            ...sessionUpdate,
          });
      }

      // Atualizar conversa
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ conversation_mode: mode })
        .eq('id', conversationId);

      if (error) throw error;

      return mode;
    },
    onSuccess: (mode) => {
      queryClient.invalidateQueries({ queryKey: ['ai-agent-session', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
      
      const modeLabels: Record<ConversationMode, string> = {
        ai: 'Modo AI ativado',
        human: 'Modo humano ativado',
        hybrid: 'Modo híbrido ativado',
      };
      toast.success(modeLabels[mode]);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao alterar modo');
    },
  });

  const assumeConversation = useMutation({
    mutationFn: async (userId: string) => {
      return changeMode.mutateAsync({ mode: 'human', userId });
    },
  });

  const returnToAI = useMutation({
    mutationFn: async () => {
      return changeMode.mutateAsync({ mode: 'ai' });
    },
  });

  const setHybridMode = useMutation({
    mutationFn: async (userId: string) => {
      return changeMode.mutateAsync({ mode: 'hybrid', userId });
    },
  });

  return {
    session,
    isLoading,
    error,
    changeMode,
    assumeConversation,
    returnToAI,
    setHybridMode,
    currentMode: session?.mode || 'human',
  };
};
