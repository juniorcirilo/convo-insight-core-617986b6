-- =========================================
-- FASE 1 & 2: Campanhas, Webhooks e APIs
-- =========================================

-- 1. Adicionar campo opt_in em whatsapp_contacts (para campanhas)
ALTER TABLE public.whatsapp_contacts 
ADD COLUMN IF NOT EXISTS opt_in boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS opt_in_updated_at timestamp with time zone;

-- 2. Criar tabela de campanhas
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  message_content text NOT NULL,
  message_type text NOT NULL DEFAULT 'text', -- text, list, buttons
  button_options jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft', -- draft, scheduled, running, completed, cancelled
  scheduled_at timestamp with time zone,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  target_contacts jsonb DEFAULT '[]'::jsonb, -- array of contact IDs or filters
  total_recipients integer DEFAULT 0,
  sent_count integer DEFAULT 0,
  delivered_count integer DEFAULT 0,
  read_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3. Criar tabela de logs de campanhas
CREATE TABLE IF NOT EXISTS public.campaign_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, sent, delivered, read, failed
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  read_at timestamp with time zone,
  error_message text,
  button_clicked text, -- which button the contact clicked
  button_clicked_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 4. Criar tabela de webhooks
CREATE TABLE IF NOT EXISTS public.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  secret_key text, -- for HMAC signature
  events text[] NOT NULL DEFAULT '{}', -- new_conversation, new_message, conversation_closed, ticket_created, lead_created
  is_active boolean NOT NULL DEFAULT true,
  headers jsonb DEFAULT '{}'::jsonb, -- custom headers to send
  retry_count integer DEFAULT 3,
  timeout_ms integer DEFAULT 5000,
  last_triggered_at timestamp with time zone,
  last_success_at timestamp with time zone,
  last_failure_at timestamp with time zone,
  failure_count integer DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 5. Criar tabela de logs de webhooks
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid REFERENCES public.webhooks(id) ON DELETE CASCADE NOT NULL,
  event text NOT NULL,
  payload jsonb NOT NULL,
  response_status integer,
  response_body text,
  response_time_ms integer,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  attempt_number integer DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 6. Criar tabela de tokens de API
CREATE TABLE IF NOT EXISTS public.api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE, -- bcrypt hash of the token
  token_prefix text NOT NULL, -- first 8 chars for identification
  permissions text[] NOT NULL DEFAULT '{read}'::text[], -- read, write, admin
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamp with time zone,
  expires_at timestamp with time zone,
  rate_limit_per_minute integer DEFAULT 60,
  created_by uuid REFERENCES public.profiles(id) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 7. Criar tabela de logs de uso de API
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid REFERENCES public.api_tokens(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code integer,
  response_time_ms integer,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- =========================================
-- ENABLE RLS ON ALL NEW TABLES
-- =========================================

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

-- =========================================
-- RLS POLICIES
-- =========================================

-- Campaigns policies
CREATE POLICY "Admins and supervisors can manage campaigns" ON public.campaigns
FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)
);

CREATE POLICY "Agents can view campaigns" ON public.campaigns
FOR SELECT USING (auth.uid() IS NOT NULL);

-- Campaign logs policies
CREATE POLICY "Admins and supervisors can manage campaign logs" ON public.campaign_logs
FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)
);

CREATE POLICY "Agents can view campaign logs" ON public.campaign_logs
FOR SELECT USING (auth.uid() IS NOT NULL);

-- Webhooks policies (admin only)
CREATE POLICY "Only admins can manage webhooks" ON public.webhooks
FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
);

-- Webhook logs policies (admin only)
CREATE POLICY "Only admins can view webhook logs" ON public.webhook_logs
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role)
);

-- API tokens policies (admin only)
CREATE POLICY "Only admins can manage API tokens" ON public.api_tokens
FOR ALL USING (
  has_role(auth.uid(), 'admin'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
);

-- API usage logs policies (admin only)
CREATE POLICY "Only admins can view API usage logs" ON public.api_usage_logs
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role)
);

-- =========================================
-- INDEXES FOR PERFORMANCE
-- =========================================

CREATE INDEX IF NOT EXISTS idx_campaigns_instance_id ON public.campaigns(instance_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON public.campaigns(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign_id ON public.campaign_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_contact_id ON public.campaign_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_status ON public.campaign_logs(status);

CREATE INDEX IF NOT EXISTS idx_webhooks_is_active ON public.webhooks(is_active);
CREATE INDEX IF NOT EXISTS idx_webhooks_events ON public.webhooks USING GIN(events);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON public.webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_tokens_token_prefix ON public.api_tokens(token_prefix);
CREATE INDEX IF NOT EXISTS idx_api_tokens_is_active ON public.api_tokens(is_active);

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_token_id ON public.api_usage_logs(token_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON public.api_usage_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_opt_in ON public.whatsapp_contacts(opt_in);

-- =========================================
-- UPDATE TRIGGERS
-- =========================================

CREATE TRIGGER update_campaigns_updated_at
BEFORE UPDATE ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at
BEFORE UPDATE ON public.webhooks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_api_tokens_updated_at
BEFORE UPDATE ON public.api_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();