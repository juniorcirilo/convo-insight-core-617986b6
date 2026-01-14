-- ====================================
-- Fase 1: Evolução do Sistema de CRM
-- ====================================

-- 1. Adicionar novos campos na tabela whatsapp_contacts
ALTER TABLE public.whatsapp_contacts 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS sector_id uuid REFERENCES public.sectors(id),
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS source text DEFAULT 'whatsapp';

-- Comentários para documentação
COMMENT ON COLUMN public.whatsapp_contacts.created_by IS 'Usuário que cadastrou/importou o contato';
COMMENT ON COLUMN public.whatsapp_contacts.sector_id IS 'Setor associado ao contato';
COMMENT ON COLUMN public.whatsapp_contacts.email IS 'Email do contato (opcional)';
COMMENT ON COLUMN public.whatsapp_contacts.source IS 'Origem do contato: whatsapp, manual, google';

-- 2. Criar tabela para customização das colunas do Kanban
CREATE TABLE IF NOT EXISTS public.kanban_columns_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id uuid NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  column_id text NOT NULL, -- 'new', 'contacted', 'qualified', 'proposal', 'closed', 'lost'
  custom_title text NOT NULL,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  color text,
  icon text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(sector_id, column_id)
);

-- Comentários
COMMENT ON TABLE public.kanban_columns_config IS 'Configuração customizada das colunas do Kanban por setor';
COMMENT ON COLUMN public.kanban_columns_config.column_id IS 'ID padrão da coluna: new, contacted, qualified, proposal, closed, lost';

-- Enable RLS
ALTER TABLE public.kanban_columns_config ENABLE ROW LEVEL SECURITY;

-- Trigger para atualizar updated_at
CREATE TRIGGER update_kanban_columns_config_updated_at
  BEFORE UPDATE ON public.kanban_columns_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 3. Criar função para verificar acesso a contatos
CREATE OR REPLACE FUNCTION public.can_access_contact(_user_id uuid, _contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    -- Admins podem ver todos os contatos
    SELECT 1 WHERE has_role(_user_id, 'admin'::app_role)
    UNION
    -- Supervisores veem contatos do seu setor
    SELECT 1 FROM whatsapp_contacts c
    JOIN user_sectors us ON us.sector_id = c.sector_id
    WHERE c.id = _contact_id 
      AND us.user_id = _user_id
      AND has_role(_user_id, 'supervisor'::app_role)
    UNION
    -- Supervisores também veem contatos da sua instância (mesmo sem setor)
    SELECT 1 FROM whatsapp_contacts c
    WHERE c.id = _contact_id 
      AND c.sector_id IS NULL
      AND has_role(_user_id, 'supervisor'::app_role)
      AND user_belongs_to_instance(_user_id, c.instance_id)
    UNION
    -- Agentes veem contatos que eles criaram
    SELECT 1 FROM whatsapp_contacts
    WHERE id = _contact_id AND created_by = _user_id
    UNION
    -- Agentes veem contatos com quem trocaram mensagens
    SELECT 1 FROM whatsapp_contacts c
    JOIN whatsapp_conversations conv ON conv.contact_id = c.id
    WHERE c.id = _contact_id 
      AND (conv.assigned_to = _user_id OR EXISTS (
        SELECT 1 FROM whatsapp_messages m 
        WHERE m.conversation_id = conv.id AND m.sent_by = _user_id
      ))
      AND user_belongs_to_instance(_user_id, c.instance_id)
  )
$$;

COMMENT ON FUNCTION public.can_access_contact IS 'Verifica se usuário pode acessar um contato baseado em: role, setor, criação ou interação';

-- 4. Atualizar políticas RLS de whatsapp_contacts
-- Remover políticas antigas
DROP POLICY IF EXISTS "Users can view contacts of their instances" ON public.whatsapp_contacts;
DROP POLICY IF EXISTS "Supervisors can manage contacts" ON public.whatsapp_contacts;

-- Nova política de SELECT usando a função can_access_contact
CREATE POLICY "Users can view accessible contacts" ON public.whatsapp_contacts
FOR SELECT USING (can_access_contact(auth.uid(), id));

-- Política de INSERT: usuários podem criar contatos na sua instância
CREATE POLICY "Users can create contacts in their instance" ON public.whatsapp_contacts
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_belongs_to_instance(auth.uid(), instance_id)
);

-- Política de UPDATE: criador ou supervisores/admins
CREATE POLICY "Users can update accessible contacts" ON public.whatsapp_contacts
FOR UPDATE USING (
  can_access_contact(auth.uid(), id)
  AND (
    created_by = auth.uid() 
    OR has_role(auth.uid(), 'supervisor'::app_role) 
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Política de DELETE: apenas admins
CREATE POLICY "Only admins can delete contacts" ON public.whatsapp_contacts
FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. Políticas RLS para kanban_columns_config
-- Admin e Supervisores podem gerenciar config do seu setor
CREATE POLICY "Admins and supervisors can manage kanban config" ON public.kanban_columns_config
FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (
    has_role(auth.uid(), 'supervisor'::app_role) 
    AND user_belongs_to_sector(auth.uid(), sector_id)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (
    has_role(auth.uid(), 'supervisor'::app_role) 
    AND user_belongs_to_sector(auth.uid(), sector_id)
  )
);

-- Agentes podem visualizar config do seu setor
CREATE POLICY "Agents can view kanban config of their sector" ON public.kanban_columns_config
FOR SELECT USING (
  auth.uid() IS NOT NULL 
  AND user_belongs_to_sector(auth.uid(), sector_id)
);

-- 6. Habilitar realtime para a nova tabela
ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_columns_config;