-- =====================================================
-- FASE 1: AI AGENT FOUNDATION - DATABASE INFRASTRUCTURE
-- =====================================================

-- 1. Adicionar coluna conversation_mode em whatsapp_conversations
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS conversation_mode TEXT DEFAULT 'human' 
CHECK (conversation_mode IN ('ai', 'human', 'hybrid'));

-- 2. Criar tabela de configuração do AI Agent por setor
CREATE TABLE public.ai_agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  
  -- Identidade/Persona
  agent_name TEXT NOT NULL DEFAULT 'Assistente',
  persona_description TEXT,
  welcome_message TEXT,
  tone_of_voice TEXT DEFAULT 'professional' CHECK (tone_of_voice IN ('professional', 'friendly', 'casual')),
  
  -- Comportamento
  is_enabled BOOLEAN DEFAULT false,
  auto_reply_enabled BOOLEAN DEFAULT true,
  max_auto_replies INTEGER DEFAULT 5,
  response_delay_seconds INTEGER DEFAULT 2,
  
  -- Regras de Escalação
  escalation_keywords TEXT[] DEFAULT ARRAY['falar com humano', 'atendente', 'pessoa real'],
  escalation_after_minutes INTEGER DEFAULT 30,
  escalation_on_negative_sentiment BOOLEAN DEFAULT true,
  
  -- Horário de Funcionamento
  working_hours_start TIME DEFAULT '08:00',
  working_hours_end TIME DEFAULT '18:00',
  working_timezone TEXT DEFAULT 'America/Sao_Paulo',
  working_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- 0=Dom, 1=Seg...6=Sab
  out_of_hours_message TEXT,
  
  -- Contexto Adicional
  business_context TEXT,
  faq_context TEXT,
  product_catalog TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(sector_id)
);

-- 3. Criar tabela de sessões do AI Agent
CREATE TABLE public.ai_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  
  -- Estado da Sessão
  mode TEXT DEFAULT 'ai' CHECK (mode IN ('ai', 'human', 'hybrid')),
  auto_reply_count INTEGER DEFAULT 0,
  last_ai_response_at TIMESTAMPTZ,
  
  -- Contexto Acumulado
  conversation_summary TEXT,
  detected_intent TEXT,
  lead_score INTEGER,
  
  -- Handoff
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT,
  escalated_to UUID REFERENCES profiles(id),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(conversation_id)
);

-- 4. Criar tabela de logs do AI Agent
CREATE TABLE public.ai_agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE SET NULL,
  session_id UUID REFERENCES ai_agent_sessions(id) ON DELETE SET NULL,
  
  action TEXT NOT NULL, -- 'response_sent', 'escalated', 'error', 'handoff'
  input_message TEXT,
  ai_response TEXT,
  tokens_used INTEGER,
  response_time_ms INTEGER,
  model_used TEXT,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Criar índices para performance
CREATE INDEX idx_ai_agent_configs_sector ON ai_agent_configs(sector_id);
CREATE INDEX idx_ai_agent_configs_enabled ON ai_agent_configs(is_enabled) WHERE is_enabled = true;
CREATE INDEX idx_ai_agent_sessions_conversation ON ai_agent_sessions(conversation_id);
CREATE INDEX idx_ai_agent_sessions_mode ON ai_agent_sessions(mode);
CREATE INDEX idx_ai_agent_logs_conversation ON ai_agent_logs(conversation_id);
CREATE INDEX idx_ai_agent_logs_created ON ai_agent_logs(created_at DESC);
CREATE INDEX idx_conversations_mode ON whatsapp_conversations(conversation_mode);

-- 6. Trigger para updated_at
CREATE TRIGGER update_ai_agent_configs_updated_at
BEFORE UPDATE ON ai_agent_configs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_agent_sessions_updated_at
BEFORE UPDATE ON ai_agent_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 7. RLS Policies

-- ai_agent_configs: Admins e Supervisores podem gerenciar
ALTER TABLE ai_agent_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all AI agent configs"
ON ai_agent_configs FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supervisors can view AI agent configs in their instance"
ON ai_agent_configs FOR SELECT
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  AND EXISTS (
    SELECT 1 FROM sectors s
    JOIN user_sectors us ON us.sector_id = s.id
    WHERE s.id = ai_agent_configs.sector_id
    AND us.user_id = auth.uid()
  )
);

CREATE POLICY "Supervisors can update AI agent configs in their sectors"
ON ai_agent_configs FOR UPDATE
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  AND EXISTS (
    SELECT 1 FROM user_sectors us
    WHERE us.sector_id = ai_agent_configs.sector_id
    AND us.user_id = auth.uid()
  )
);

-- ai_agent_sessions: Acesso baseado em conversa
ALTER TABLE ai_agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sessions of accessible conversations"
ON ai_agent_sessions FOR SELECT
USING (can_access_conversation(conversation_id, auth.uid()));

CREATE POLICY "Admins can manage all sessions"
ON ai_agent_sessions FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- ai_agent_logs: Apenas admins e supervisores
ALTER TABLE ai_agent_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all AI agent logs"
ON ai_agent_logs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supervisors can view logs in their instance"
ON ai_agent_logs FOR SELECT
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  AND (
    conversation_id IS NULL 
    OR can_access_conversation(conversation_id, auth.uid())
  )
);

-- 8. Habilitar realtime para sessões
ALTER PUBLICATION supabase_realtime ADD TABLE ai_agent_sessions;