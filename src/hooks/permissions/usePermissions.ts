import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PermissionType {
  key: string;
  name: string;
  description: string | null;
  category: string;
  default_for_admin: boolean;
  default_for_supervisor: boolean;
  default_for_agent: boolean;
}

export interface UserEffectivePermission {
  permission_key: string;
  is_enabled: boolean;
  source: 'user_override' | 'sector' | 'role_default';
}

export interface UserPermissionOverride {
  id: string;
  user_id: string;
  permission_key: string;
  is_enabled: boolean;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export const usePermissionTypes = () => {
  return useQuery({
    queryKey: ['permission-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permission_types')
        .select('*')
        .order('category', { ascending: true });

      if (error) throw error;
      return data as PermissionType[];
    },
  });
};

export const useUserEffectivePermissions = (userId: string | undefined) => {
  return useQuery({
    queryKey: ['user-effective-permissions', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .rpc('get_user_effective_permissions', { _user_id: userId });

      if (error) throw error;
      return data as UserEffectivePermission[];
    },
    enabled: !!userId,
  });
};

export const useUserPermissionOverrides = (userId?: string) => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['user-permission-overrides', userId],
    queryFn: async () => {
      let query = supabase
        .from('user_permission_overrides')
        .select('*');
      
      if (userId) {
        query = query.eq('user_id', userId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as UserPermissionOverride[];
    },
  });

  const setOverrideMutation = useMutation({
    mutationFn: async ({ 
      userId, 
      permissionKey, 
      isEnabled, 
      reason 
    }: { 
      userId: string; 
      permissionKey: string; 
      isEnabled: boolean; 
      reason?: string;
    }) => {
      const { data: currentUser } = await supabase.auth.getUser();
      
      // Upsert the override
      const { error: overrideError } = await supabase
        .from('user_permission_overrides')
        .upsert({
          user_id: userId,
          permission_key: permissionKey,
          is_enabled: isEnabled,
          reason: reason || null,
          created_by: currentUser.user?.id,
        }, {
          onConflict: 'user_id,permission_key',
        });

      if (overrideError) throw overrideError;

      // Log the change
      const { error: auditError } = await supabase
        .from('permission_audit_logs')
        .insert({
          changed_by: currentUser.user?.id!,
          target_type: 'user',
          target_id: userId,
          permission_key: permissionKey,
          new_value: isEnabled,
          reason: reason || null,
        });

      if (auditError) console.error('Failed to log audit:', auditError);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-permission-overrides'] });
      queryClient.invalidateQueries({ queryKey: ['user-effective-permissions'] });
      toast.success('Permissão atualizada');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar permissão: ' + error.message);
    },
  });

  const removeOverrideMutation = useMutation({
    mutationFn: async ({ 
      userId, 
      permissionKey 
    }: { 
      userId: string; 
      permissionKey: string; 
    }) => {
      const { data: currentUser } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('user_permission_overrides')
        .delete()
        .eq('user_id', userId)
        .eq('permission_key', permissionKey);

      if (error) throw error;

      // Log the removal
      await supabase
        .from('permission_audit_logs')
        .insert({
          changed_by: currentUser.user?.id!,
          target_type: 'user',
          target_id: userId,
          permission_key: permissionKey,
          old_value: true,
          new_value: null,
          reason: 'Override removido - usando padrão do setor/role',
        });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-permission-overrides'] });
      queryClient.invalidateQueries({ queryKey: ['user-effective-permissions'] });
      toast.success('Override removido');
    },
    onError: (error: Error) => {
      toast.error('Erro ao remover override: ' + error.message);
    },
  });

  return {
    overrides: data || [],
    isLoading,
    setOverride: setOverrideMutation.mutateAsync,
    removeOverride: removeOverrideMutation.mutateAsync,
    isSettingOverride: setOverrideMutation.isPending,
    isRemovingOverride: removeOverrideMutation.isPending,
  };
};
