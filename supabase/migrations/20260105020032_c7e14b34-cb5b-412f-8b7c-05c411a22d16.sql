-- Expandir tabela tickets com novos campos
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS canal TEXT DEFAULT 'whatsapp',
ADD COLUMN IF NOT EXISTS categoria TEXT CHECK (categoria IN ('suporte_tecnico', 'financeiro', 'comercial', 'outro')),
ADD COLUMN IF NOT EXISTS prioridade TEXT DEFAULT 'media' CHECK (prioridade IN ('alta', 'media', 'baixa')),
ADD COLUMN IF NOT EXISTS atendente_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sla_violated_at TIMESTAMPTZ;

-- Criar tabela de configuração de SLA
CREATE TABLE IF NOT EXISTS public.sla_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prioridade TEXT NOT NULL UNIQUE CHECK (prioridade IN ('alta', 'media', 'baixa')),
  tempo_primeira_resposta_minutos INTEGER NOT NULL,
  tempo_resolucao_minutos INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inserir valores padrão de SLA
INSERT INTO public.sla_config (prioridade, tempo_primeira_resposta_minutos, tempo_resolucao_minutos) VALUES
('alta', 15, 60),
('media', 30, 240),
('baixa', 60, 480)
ON CONFLICT (prioridade) DO NOTHING;

-- Criar tabela de violações de SLA
CREATE TABLE IF NOT EXISTS public.sla_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  violation_type TEXT NOT NULL CHECK (violation_type IN ('first_response', 'resolution')),
  expected_at TIMESTAMPTZ NOT NULL,
  violated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Adicionar campo para mensagens de supervisor
ALTER TABLE public.whatsapp_messages
ADD COLUMN IF NOT EXISTS is_supervisor_message BOOLEAN DEFAULT false;

-- Habilitar RLS nas novas tabelas
ALTER TABLE public.sla_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_violations ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para sla_config
CREATE POLICY "Authenticated users can view SLA config"
ON public.sla_config
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Only admins can manage SLA config"
ON public.sla_config
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Políticas RLS para sla_violations
CREATE POLICY "Admins and supervisors can view SLA violations"
ON public.sla_violations
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

CREATE POLICY "System can insert SLA violations"
ON public.sla_violations
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_tickets_prioridade ON public.tickets(prioridade);
CREATE INDEX IF NOT EXISTS idx_tickets_categoria ON public.tickets(categoria);
CREATE INDEX IF NOT EXISTS idx_tickets_atendente ON public.tickets(atendente_id);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_violated ON public.tickets(sla_violated_at) WHERE sla_violated_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sla_violations_ticket ON public.sla_violations(ticket_id);
CREATE INDEX IF NOT EXISTS idx_messages_supervisor ON public.whatsapp_messages(is_supervisor_message) WHERE is_supervisor_message = true;