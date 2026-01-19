-- =============================================
-- FASE 3: Escalation Queue Infrastructure
-- =============================================

-- 1. Escalation Queue Table
CREATE TABLE public.escalation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  
  -- Contexto para o Humano
  ai_summary TEXT,
  escalation_reason TEXT NOT NULL DEFAULT 'manual',
  detected_intent TEXT,
  lead_score INTEGER,
  customer_sentiment TEXT,
  
  -- Priorização
  priority INTEGER DEFAULT 0 CHECK (priority >= 0 AND priority <= 3),
  
  -- Estado
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'resolved', 'abandoned', 'expired')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  -- Metadados
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Index for performance
CREATE INDEX idx_escalation_queue_status ON public.escalation_queue(status);
CREATE INDEX idx_escalation_queue_sector ON public.escalation_queue(sector_id);
CREATE INDEX idx_escalation_queue_priority ON public.escalation_queue(priority DESC, created_at ASC);
CREATE INDEX idx_escalation_queue_conversation ON public.escalation_queue(conversation_id);
CREATE INDEX idx_escalation_queue_assigned ON public.escalation_queue(assigned_to) WHERE status = 'assigned';

-- Unique constraint: only one pending/assigned escalation per conversation
CREATE UNIQUE INDEX idx_escalation_queue_active ON public.escalation_queue(conversation_id) 
  WHERE status IN ('pending', 'assigned');

-- 2. Escalation Notifications Table
CREATE TABLE public.escalation_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id UUID NOT NULL REFERENCES public.escalation_queue(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  notification_type TEXT NOT NULL DEFAULT 'new_escalation' CHECK (notification_type IN ('new_escalation', 'priority_change', 'reassignment', 'timeout_warning')),
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(escalation_id, user_id, notification_type)
);

CREATE INDEX idx_escalation_notifications_user ON public.escalation_notifications(user_id);
CREATE INDEX idx_escalation_notifications_unread ON public.escalation_notifications(user_id) 
  WHERE read_at IS NULL AND dismissed_at IS NULL;

-- 3. Escalation Distribution Config per Sector
CREATE TABLE public.escalation_distribution_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE UNIQUE,
  
  distribution_method TEXT NOT NULL DEFAULT 'round_robin' CHECK (distribution_method IN ('round_robin', 'least_load', 'specialty', 'manual')),
  auto_assign_enabled BOOLEAN DEFAULT false,
  max_queue_time_minutes INTEGER DEFAULT 30,
  priority_boost_after_minutes INTEGER DEFAULT 10,
  max_concurrent_escalations_per_agent INTEGER DEFAULT 5,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Update ai_agent_sessions with handoff fields
ALTER TABLE public.ai_agent_sessions 
  ADD COLUMN IF NOT EXISTS handoff_summary TEXT,
  ADD COLUMN IF NOT EXISTS handoff_context JSONB,
  ADD COLUMN IF NOT EXISTS handoff_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_priority INTEGER DEFAULT 0;

-- 5. Updated_at triggers
CREATE OR REPLACE FUNCTION public.update_escalation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_escalation_queue_updated_at
  BEFORE UPDATE ON public.escalation_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_escalation_updated_at();

CREATE TRIGGER update_escalation_distribution_config_updated_at
  BEFORE UPDATE ON public.escalation_distribution_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_escalation_updated_at();

-- 6. RLS Policies for escalation_queue
ALTER TABLE public.escalation_queue ENABLE ROW LEVEL SECURITY;

-- Admins can see all escalations
CREATE POLICY "Admins can view all escalations"
  ON public.escalation_queue FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Supervisors can see escalations in their instance
CREATE POLICY "Supervisors can view instance escalations"
  ON public.escalation_queue FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.user_sectors us ON us.user_id = auth.uid()
      JOIN public.sectors s ON s.id = us.sector_id
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'supervisor'
        AND s.instance_id = escalation_queue.instance_id
    )
  );

-- Agents can see escalations in their sector
CREATE POLICY "Agents can view sector escalations"
  ON public.escalation_queue FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_sectors us
      WHERE us.user_id = auth.uid() 
        AND us.sector_id = escalation_queue.sector_id
    )
  );

-- Agents can update escalations assigned to them
CREATE POLICY "Agents can update assigned escalations"
  ON public.escalation_queue FOR UPDATE
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- Admins and supervisors can update any escalation in their scope
CREATE POLICY "Admins can update all escalations"
  ON public.escalation_queue FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Supervisors can update instance escalations"
  ON public.escalation_queue FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.user_sectors us ON us.user_id = auth.uid()
      JOIN public.sectors s ON s.id = us.sector_id
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'supervisor'
        AND s.instance_id = escalation_queue.instance_id
    )
  );

-- Insert policy for edge functions (service role)
CREATE POLICY "Service role can insert escalations"
  ON public.escalation_queue FOR INSERT
  WITH CHECK (true);

-- 7. RLS Policies for escalation_notifications
ALTER TABLE public.escalation_notifications ENABLE ROW LEVEL SECURITY;

-- Users can see their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.escalation_notifications FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own notifications (mark read/dismissed)
CREATE POLICY "Users can update own notifications"
  ON public.escalation_notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role can insert notifications
CREATE POLICY "Service role can insert notifications"
  ON public.escalation_notifications FOR INSERT
  WITH CHECK (true);

-- 8. RLS Policies for escalation_distribution_config
ALTER TABLE public.escalation_distribution_config ENABLE ROW LEVEL SECURITY;

-- Admins can manage all configs
CREATE POLICY "Admins can manage distribution config"
  ON public.escalation_distribution_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Supervisors can view configs in their instance
CREATE POLICY "Supervisors can view distribution config"
  ON public.escalation_distribution_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.user_sectors us ON us.user_id = auth.uid()
      JOIN public.sectors s ON s.id = us.sector_id
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'supervisor'
        AND s.id = escalation_distribution_config.sector_id
    )
  );

-- 9. Enable Realtime for escalation tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.escalation_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.escalation_notifications;

-- 10. Function to calculate wait time in seconds
CREATE OR REPLACE FUNCTION public.get_escalation_wait_time(escalation_created_at TIMESTAMPTZ)
RETURNS INTEGER AS $$
BEGIN
  RETURN EXTRACT(EPOCH FROM (now() - escalation_created_at))::INTEGER;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;