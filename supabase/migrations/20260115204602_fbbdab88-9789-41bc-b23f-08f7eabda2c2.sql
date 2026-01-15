-- Função para verificar se usuário pode ver um perfil
CREATE OR REPLACE FUNCTION public.can_view_profile(_viewer_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    -- Usuário pode ver seu próprio perfil
    _viewer_id = _profile_id
    OR
    -- Admins podem ver todos
    has_role(_viewer_id, 'admin'::app_role)
    OR
    -- Supervisores veem usuários da mesma instância
    (
      has_role(_viewer_id, 'supervisor'::app_role)
      AND EXISTS (
        SELECT 1 FROM user_sectors vs1
        JOIN sectors s1 ON s1.id = vs1.sector_id
        JOIN sectors s2 ON s2.instance_id = s1.instance_id
        JOIN user_sectors vs2 ON vs2.sector_id = s2.id
        WHERE vs1.user_id = _viewer_id AND vs2.user_id = _profile_id
      )
    )
    OR
    -- Agentes veem colegas do mesmo setor
    EXISTS (
      SELECT 1 FROM user_sectors us1
      JOIN user_sectors us2 ON us1.sector_id = us2.sector_id
      WHERE us1.user_id = _viewer_id AND us2.user_id = _profile_id
    );
$$;

-- Remover política antiga
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON profiles;

-- Criar política restritiva
CREATE POLICY "Users can view accessible profiles"
ON profiles FOR SELECT
USING (can_view_profile(auth.uid(), id));

-- Atualizar função can_access_contact com regras mais restritivas
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
    -- Supervisores veem contatos de conversas da sua instância
    SELECT 1 FROM whatsapp_contacts c
    JOIN whatsapp_conversations conv ON conv.contact_id = c.id
    WHERE c.id = _contact_id 
      AND has_role(_user_id, 'supervisor'::app_role)
      AND user_belongs_to_instance(_user_id, conv.instance_id)
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
  );
$$;