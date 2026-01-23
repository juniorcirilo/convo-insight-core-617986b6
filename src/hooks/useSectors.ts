import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Sector {
  id: string;
  instance_id: string; // Deprecated - usar instance_ids
  instance_ids?: string[]; // Nova propriedade para múltiplas instâncias
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  tipo_atendimento: 'humano' | 'chatbot';
  gera_ticket: boolean;
  gera_ticket_usuarios: boolean;
  gera_ticket_grupos: boolean;
  grupos_permitidos_todos: boolean;
  mensagem_boas_vindas: string | null;
  mensagem_reabertura: string | null;
  mensagem_encerramento: string | null;
  created_at: string;
  updated_at: string;
}

export interface SectorWithInstance extends Sector {
  instance_name?: string;
  instance_names?: string[];
}

export const useSectors = (instanceId?: string) => {
  const queryClient = useQueryClient();

  const { data: sectors = [], isLoading } = useQuery({
    queryKey: ['sectors', instanceId],
    queryFn: async () => {
      // Buscar setores com suas instâncias via tabela de relacionamento
      let query = supabase
        .from('sectors')
        .select(`
          *,
          whatsapp_instances!sectors_instance_id_fkey(name),
          sector_instances(
            instance_id,
            whatsapp_instances(id, name)
          )
        `)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

      if (instanceId) {
        // Filtrar por instância - verificar tanto na coluna legacy quanto na nova tabela
        query = query.or(`instance_id.eq.${instanceId},sector_instances.instance_id.eq.${instanceId}`);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((sector: any) => {
        // Extrair instâncias da nova tabela de relacionamento
        const sectorInstances = sector.sector_instances || [];
        const instanceIds = sectorInstances
          .map((si: any) => si.instance_id)
          .filter(Boolean);
        const instanceNames = sectorInstances
          .map((si: any) => si.whatsapp_instances?.name)
          .filter(Boolean);

        // Fallback para a coluna legacy se não houver registros na nova tabela
        if (instanceIds.length === 0 && sector.instance_id) {
          instanceIds.push(sector.instance_id);
          if (sector.whatsapp_instances?.name) {
            instanceNames.push(sector.whatsapp_instances.name);
          }
        }

        return {
          ...sector,
          instance_name: instanceNames[0] || sector.whatsapp_instances?.name,
          instance_names: instanceNames,
          instance_ids: instanceIds,
          sector_instances: undefined, // Remover do objeto final
        };
      }) as SectorWithInstance[];
    },
  });

  const createSector = useMutation({
    mutationFn: async (sector: Omit<Sector, 'id' | 'created_at' | 'updated_at'> & { instance_ids?: string[] }) => {
      const { instance_ids, ...sectorData } = sector;
      
      // Criar o setor (usa a primeira instância para compatibilidade com coluna legacy)
      const { data, error } = await supabase
        .from('sectors')
        .insert({
          ...sectorData,
          instance_id: instance_ids?.[0] || sectorData.instance_id,
        })
        .select()
        .single();

      if (error) throw error;

      // Se houver múltiplas instâncias, criar os relacionamentos
      if (instance_ids && instance_ids.length > 0) {
        const sectorInstancesData = instance_ids.map(instId => ({
          sector_id: data.id,
          instance_id: instId,
        }));

        const { error: siError } = await supabase
          .from('sector_instances')
          .insert(sectorInstancesData);

        if (siError) {
          console.error('Erro ao criar sector_instances:', siError);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectors'] });
      toast.success('Setor criado com sucesso');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao criar setor');
    },
  });

  const updateSector = useMutation({
    mutationFn: async ({ id, instance_ids, ...updates }: Partial<Sector> & { id: string; instance_ids?: string[] }) => {
      // Atualizar o setor
      const { data, error } = await supabase
        .from('sectors')
        .update({
          ...updates,
          instance_id: instance_ids?.[0] || updates.instance_id,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Atualizar relacionamentos de instâncias se fornecidos
      if (instance_ids !== undefined) {
        // Remover relacionamentos existentes
        await supabase
          .from('sector_instances')
          .delete()
          .eq('sector_id', id);

        // Criar novos relacionamentos
        if (instance_ids.length > 0) {
          const sectorInstancesData = instance_ids.map(instId => ({
            sector_id: id,
            instance_id: instId,
          }));

          const { error: siError } = await supabase
            .from('sector_instances')
            .insert(sectorInstancesData);

          if (siError) {
            console.error('Erro ao atualizar sector_instances:', siError);
          }
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectors'] });
      toast.success('Setor atualizado com sucesso');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao atualizar setor');
    },
  });

  const deleteSector = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('sectors')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectors'] });
      toast.success('Setor excluído com sucesso');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao excluir setor');
    },
  });

  return {
    sectors,
    isLoading,
    createSector,
    updateSector,
    deleteSector,
  };
};
