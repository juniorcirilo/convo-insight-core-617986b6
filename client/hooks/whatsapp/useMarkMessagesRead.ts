import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/api/client';

interface MarkReadParams {
  conversationId: string;
  messageIds?: string[];
}

interface MarkReadResult {
  success: boolean;
  markedCount: number;
  messageIds?: string[];
  error?: string;
}

export const useMarkMessagesRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: MarkReadParams): Promise<MarkReadResult> => {
      const { data, error } = await supabase.functions.invoke('mark-messages-read', {
        body: params,
      });

      if (error) {
        console.error('[useMarkMessagesRead] Error:', error);
        throw error;
      }
      
      return data as MarkReadResult;
    },
    onSuccess: (data, variables) => {
      // Don't invalidate messages query - let realtime subscription handle updates
      // Only invalidate conversations to update unread count
      queryClient.invalidateQueries({ 
        queryKey: ['whatsapp', 'conversations'] 
      });
      
      console.log('[useMarkMessagesRead] Marked', data.markedCount, 'messages as read');
    },
    onError: (error) => {
      console.error('[useMarkMessagesRead] Mutation error:', error);
    },
  });
};
