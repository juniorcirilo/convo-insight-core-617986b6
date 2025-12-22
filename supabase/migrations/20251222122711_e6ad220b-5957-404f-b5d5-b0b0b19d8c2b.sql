-- Enum para tipos de permissões
DO $$ BEGIN
  CREATE TYPE permission_key AS ENUM (
    'can_access_conversations',
    'can_respond_conversations',
    'can_access_kanban',
    'can_view_global_data',
    'can_access_admin_panel',
    'can_send_internal_messages',
    'can_transfer_conversations'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Tabela de descrições dos tipos de permissões
CREATE TABLE IF NOT EXISTS public.permission_types (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  default_for_admin BOOLEAN DEFAULT true,
  default_for_supervisor BOOLEAN DEFAULT false,
  default_for_agent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inserir tipos de permissões
INSERT INTO public.permission_types (key, name, description, category, default_for_admin, default_for_supervisor, default_for_agent) VALUES
  ('can_access_conversations', 'Acessar Conversas', 'Permite visualizar conversas do setor/atribuídas', 'conversations', true, true, true),
  ('can_respond_conversations', 'Responder Conversas', 'Permite enviar mensagens em conversas', 'conversations', true, true, true),
  ('can_access_kanban', 'Acessar Kanban', 'Permite visualizar o painel de leads/vendas', 'sales', true, true, false),
  ('can_view_global_data', 'Ver Dados Globais', 'Permite visualizar dados de todas as instâncias', 'admin', true, false, false),
  ('can_access_admin_panel', 'Acessar Painel Admin', 'Permite acessar área administrativa e monitoramento', 'admin', true, true, false),
  ('can_send_internal_messages', 'Enviar Mensagens Internas', 'Permite enviar notas internas em conversas', 'conversations', true, true, false),
  ('can_transfer_conversations', 'Transferir Conversas', 'Permite transferir conversas entre agentes', 'conversations', true, true, false)
ON CONFLICT (key) DO NOTHING;

-- Permissões padrão por setor
CREATE TABLE IF NOT EXISTS public.sector_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES public.permission_types(key) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sector_id, permission_key)
);

-- Sobrescritas de permissões por usuário
CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES public.permission_types(key) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, permission_key)
);

-- Log de auditoria de permissões
CREATE TABLE IF NOT EXISTS public.permission_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_by UUID NOT NULL REFERENCES public.profiles(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'sector', 'role')),
  target_id UUID NOT NULL,
  permission_key TEXT NOT NULL,
  old_value BOOLEAN,
  new_value BOOLEAN,
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_sector_permissions_sector ON public.sector_permissions(sector_id);
CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user ON public.user_permission_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_target ON public.permission_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_permission_audit_logs_created ON public.permission_audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.permission_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sector_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- permission_types: todos autenticados podem ler
CREATE POLICY "Authenticated users can view permission types"
ON public.permission_types FOR SELECT
USING (auth.uid() IS NOT NULL);

-- sector_permissions: admin pode tudo, supervisor pode ver
CREATE POLICY "Admins can manage sector permissions"
ON public.sector_permissions FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supervisors can view sector permissions"
ON public.sector_permissions FOR SELECT
USING (has_role(auth.uid(), 'supervisor'::app_role));

-- user_permission_overrides: apenas admin
CREATE POLICY "Only admins can manage user permission overrides"
ON public.user_permission_overrides FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- permission_audit_logs: admin pode tudo, inserção automática
CREATE POLICY "Admins can view audit logs"
ON public.permission_audit_logs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert audit logs"
ON public.permission_audit_logs FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Função para obter permissões efetivas de um usuário
CREATE OR REPLACE FUNCTION public.get_user_effective_permissions(_user_id UUID)
RETURNS TABLE (
  permission_key TEXT,
  is_enabled BOOLEAN,
  source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_role app_role;
BEGIN
  -- Obter role do usuário
  SELECT role INTO _user_role FROM user_roles WHERE user_id = _user_id LIMIT 1;
  
  RETURN QUERY
  SELECT 
    pt.key as permission_key,
    COALESCE(
      -- 1. Override individual do usuário (prioridade máxima após role)
      upo.is_enabled,
      -- 2. Permissão do setor (se usuário pertence a setor)
      (SELECT sp.is_enabled FROM sector_permissions sp 
       INNER JOIN user_sectors us ON us.sector_id = sp.sector_id
       WHERE us.user_id = _user_id AND sp.permission_key = pt.key
       ORDER BY us.is_primary DESC NULLS LAST
       LIMIT 1),
      -- 3. Padrão do role
      CASE _user_role
        WHEN 'admin' THEN pt.default_for_admin
        WHEN 'supervisor' THEN pt.default_for_supervisor
        WHEN 'agent' THEN pt.default_for_agent
        ELSE false
      END
    ) as is_enabled,
    CASE 
      WHEN upo.is_enabled IS NOT NULL THEN 'user_override'
      WHEN EXISTS(SELECT 1 FROM sector_permissions sp 
                  INNER JOIN user_sectors us ON us.sector_id = sp.sector_id
                  WHERE us.user_id = _user_id AND sp.permission_key = pt.key) THEN 'sector'
      ELSE 'role_default'
    END as source
  FROM permission_types pt
  LEFT JOIN user_permission_overrides upo ON upo.permission_key = pt.key AND upo.user_id = _user_id;
END;
$$;

-- Função helper para verificar permissão específica
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_enabled FROM get_user_effective_permissions(_user_id) WHERE permission_key = _permission_key),
    false
  )
$$;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_permission_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sector_permissions_updated_at
BEFORE UPDATE ON public.sector_permissions
FOR EACH ROW EXECUTE FUNCTION update_permission_updated_at();

CREATE TRIGGER update_user_permission_overrides_updated_at
BEFORE UPDATE ON public.user_permission_overrides
FOR EACH ROW EXECUTE FUNCTION update_permission_updated_at();