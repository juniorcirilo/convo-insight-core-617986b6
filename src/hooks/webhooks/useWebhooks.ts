import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Webhook {
  id: string;
  name: string;
  url: string;
  secret_key: string | null;
  events: string[];
  is_active: boolean;
  headers: Record<string, string>;
  retry_count: number;
  timeout_ms: number;
  last_triggered_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookLog {
  id: string;
  webhook_id: string;
  event: string;
  payload: any;
  response_status: number | null;
  response_body: string | null;
  response_time_ms: number | null;
  success: boolean;
  error_message: string | null;
  attempt_number: number;
  created_at: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: string[];
  secret_key?: string;
  headers?: Record<string, string>;
  retry_count?: number;
  timeout_ms?: number;
}

export const WEBHOOK_EVENTS = [
  { value: 'new_conversation', label: 'Nova conversa' },
  { value: 'new_message', label: 'Nova mensagem' },
  { value: 'conversation_closed', label: 'Conversa encerrada' },
  { value: 'lead_created', label: 'Lead criado' },
  { value: 'lead_status_changed', label: 'Status do lead alterado' },
] as const;

export const useWebhooks = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: webhooks, isLoading, error } = useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhooks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Webhook[];
    },
  });

  const createWebhook = useMutation({
    mutationFn: async (input: CreateWebhookInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('webhooks')
        .insert({
          ...input,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({
        title: "Webhook criado",
        description: "O webhook foi criado com sucesso.",
      });
    },
    onError: (error) => {
      console.error('Error creating webhook:', error);
      toast({
        title: "Erro ao criar webhook",
        description: "Não foi possível criar o webhook.",
        variant: "destructive",
      });
    },
  });

  const updateWebhook = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Webhook> & { id: string }) => {
      const { data, error } = await supabase
        .from('webhooks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({
        title: "Webhook atualizado",
        description: "O webhook foi atualizado com sucesso.",
      });
    },
    onError: (error) => {
      console.error('Error updating webhook:', error);
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar o webhook.",
        variant: "destructive",
      });
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('webhooks')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({
        title: "Webhook excluído",
        description: "O webhook foi excluído com sucesso.",
      });
    },
    onError: (error) => {
      console.error('Error deleting webhook:', error);
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir o webhook.",
        variant: "destructive",
      });
    },
  });

  const toggleWebhook = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('webhooks')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast({
        title: data.is_active ? "Webhook ativado" : "Webhook desativado",
      });
    },
  });

  return {
    webhooks,
    isLoading,
    error,
    createWebhook: createWebhook.mutate,
    updateWebhook: updateWebhook.mutate,
    deleteWebhook: deleteWebhook.mutate,
    toggleWebhook: toggleWebhook.mutate,
    isCreating: createWebhook.isPending,
    isUpdating: updateWebhook.isPending,
    isDeleting: deleteWebhook.isPending,
  };
};

export const useWebhookLogs = (webhookId: string) => {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['webhook-logs', webhookId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .eq('webhook_id', webhookId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as WebhookLog[];
    },
    enabled: !!webhookId,
  });

  return { logs, isLoading };
};
