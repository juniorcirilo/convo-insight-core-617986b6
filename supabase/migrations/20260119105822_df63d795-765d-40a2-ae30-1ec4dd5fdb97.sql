-- ===========================================
-- FASE 2: Qualificação Automática de Leads
-- ===========================================

-- 1. Tabela de critérios de qualificação por setor
CREATE TABLE public.lead_qualification_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID REFERENCES public.sectors(id) ON DELETE CASCADE,
  
  -- Critérios BANT - Keywords para detecção
  budget_keywords TEXT[] DEFAULT ARRAY['orçamento', 'valor', 'quanto custa', 'preço', 'investimento', 'custo'],
  authority_keywords TEXT[] DEFAULT ARRAY['gerente', 'diretor', 'decisor', 'responsável', 'dono', 'proprietário', 'CEO'],
  need_keywords TEXT[] DEFAULT ARRAY['preciso', 'necessito', 'urgente', 'problema', 'dificuldade', 'quero', 'busco'],
  timeline_keywords TEXT[] DEFAULT ARRAY['agora', 'hoje', 'esta semana', 'urgente', 'prazo', 'imediato', 'rápido'],
  
  -- Pesos para scoring (0-100, soma deve ser 100)
  budget_weight INTEGER DEFAULT 25 CHECK (budget_weight >= 0 AND budget_weight <= 100),
  authority_weight INTEGER DEFAULT 25 CHECK (authority_weight >= 0 AND authority_weight <= 100),
  need_weight INTEGER DEFAULT 30 CHECK (need_weight >= 0 AND need_weight <= 100),
  timeline_weight INTEGER DEFAULT 20 CHECK (timeline_weight >= 0 AND timeline_weight <= 100),
  
  -- Thresholds de qualificação
  auto_qualify_threshold INTEGER DEFAULT 70 CHECK (auto_qualify_threshold >= 0 AND auto_qualify_threshold <= 100),
  auto_create_lead_threshold INTEGER DEFAULT 30 CHECK (auto_create_lead_threshold >= 0 AND auto_create_lead_threshold <= 100),
  
  -- Configurações
  auto_create_leads BOOLEAN DEFAULT true,
  qualification_enabled BOOLEAN DEFAULT true,
  messages_before_qualification INTEGER DEFAULT 5,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(sector_id)
);

-- 2. Adicionar campos de qualificação na tabela leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS qualification_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS qualified_by TEXT,
ADD COLUMN IF NOT EXISTS bant_budget JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS bant_authority JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS bant_need JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS bant_timeline JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_qualification_at TIMESTAMPTZ;

-- 3. Tabela de logs de qualificação
CREATE TABLE public.lead_qualification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
  
  previous_score INTEGER,
  new_score INTEGER,
  score_change INTEGER GENERATED ALWAYS AS (new_score - COALESCE(previous_score, 0)) STORED,
  
  bant_analysis JSONB NOT NULL DEFAULT '{}',
  ai_reasoning TEXT,
  model_used TEXT,
  tokens_used INTEGER,
  
  trigger_source TEXT, -- 'ai_response', 'webhook', 'manual'
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Adicionar campo para rastrear última qualificação na conversa
ALTER TABLE public.whatsapp_conversations
ADD COLUMN IF NOT EXISTS last_qualification_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS messages_since_qualification INTEGER DEFAULT 0;

-- 5. Índices para performance
CREATE INDEX IF NOT EXISTS idx_lead_qualification_criteria_sector ON public.lead_qualification_criteria(sector_id);
CREATE INDEX IF NOT EXISTS idx_lead_qualification_logs_lead ON public.lead_qualification_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_qualification_logs_conversation ON public.lead_qualification_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_lead_qualification_logs_created ON public.lead_qualification_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_score ON public.leads(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_qualified_at ON public.leads(qualified_at);

-- 6. Trigger para updated_at
CREATE TRIGGER update_lead_qualification_criteria_updated_at
  BEFORE UPDATE ON public.lead_qualification_criteria
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 7. RLS Policies para lead_qualification_criteria
ALTER TABLE public.lead_qualification_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage qualification criteria"
  ON public.lead_qualification_criteria
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Supervisors can view criteria for their sectors"
  ON public.lead_qualification_criteria
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.user_sectors us ON us.user_id = ur.user_id
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'supervisor'
        AND us.sector_id = lead_qualification_criteria.sector_id
    )
  );

-- 8. RLS Policies para lead_qualification_logs
ALTER TABLE public.lead_qualification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all qualification logs"
  ON public.lead_qualification_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Supervisors can view logs for their leads"
  ON public.lead_qualification_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.user_sectors us ON us.user_id = ur.user_id
      JOIN public.leads l ON l.id = lead_qualification_logs.lead_id
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'supervisor'
        AND l.sector_id = us.sector_id
    )
  );

CREATE POLICY "Agents can view logs for assigned leads"
  ON public.lead_qualification_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.leads
      WHERE id = lead_qualification_logs.lead_id
        AND assigned_to = auth.uid()
    )
  );

-- 9. Habilitar realtime para leads (score updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_qualification_logs;