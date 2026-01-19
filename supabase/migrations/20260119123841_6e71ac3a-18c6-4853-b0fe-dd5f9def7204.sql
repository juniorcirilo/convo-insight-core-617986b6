-- ===========================================
-- FASE 4: Automatic Scheduling System
-- ===========================================

-- 1. Scheduling Config Table (per-sector configuration)
CREATE TABLE public.scheduling_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID REFERENCES public.sectors(id) ON DELETE CASCADE UNIQUE,
  
  -- General Settings
  is_enabled BOOLEAN DEFAULT true,
  allow_ai_scheduling BOOLEAN DEFAULT true,
  
  -- Default Slot Settings
  default_duration_minutes INTEGER DEFAULT 30,
  slot_interval_minutes INTEGER DEFAULT 30,
  min_advance_hours INTEGER DEFAULT 2,
  max_advance_days INTEGER DEFAULT 30,
  
  -- Allowed Meeting Types
  allowed_meeting_types TEXT[] DEFAULT ARRAY['call', 'video', 'whatsapp'],
  default_meeting_type TEXT DEFAULT 'video',
  
  -- Buffer Settings
  buffer_before_minutes INTEGER DEFAULT 5,
  buffer_after_minutes INTEGER DEFAULT 5,
  
  -- Reminder Settings
  send_reminder_24h BOOLEAN DEFAULT true,
  send_reminder_1h BOOLEAN DEFAULT true,
  custom_reminder_hours INTEGER,
  reminder_message_24h TEXT,
  reminder_message_1h TEXT,
  
  -- Confirmation Settings
  require_confirmation BOOLEAN DEFAULT true,
  auto_cancel_no_confirmation_hours INTEGER DEFAULT 24,
  confirmation_message TEXT,
  
  -- Future: Calendar Integration
  google_calendar_sync BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Availability Slots Table
CREATE TABLE public.availability_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Can be per sector OR per agent
  sector_id UUID REFERENCES public.sectors(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Recurrence Configuration
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sun, 6=Sat
  specific_date DATE, -- For specific dates (overrides day_of_week)
  
  -- Time Configuration
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  
  -- Slot Type
  slot_type TEXT DEFAULT 'available' CHECK (slot_type IN ('available', 'blocked', 'break')),
  
  -- Control
  is_active BOOLEAN DEFAULT true,
  max_concurrent_meetings INTEGER DEFAULT 1,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraint: sector or agent required
  CONSTRAINT availability_slots_owner_check CHECK (sector_id IS NOT NULL OR agent_id IS NOT NULL),
  -- Constraint: end_time > start_time
  CONSTRAINT availability_slots_time_check CHECK (end_time > start_time)
);

-- 3. Meeting Schedules Table
CREATE TABLE public.meeting_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
  assigned_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Meeting Details
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  
  -- Meeting Type and Location
  meeting_type TEXT DEFAULT 'call' CHECK (meeting_type IN ('call', 'video', 'in_person', 'whatsapp')),
  location TEXT,
  meeting_link TEXT,
  
  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show', 'rescheduled')),
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  completed_at TIMESTAMPTZ,
  
  -- Reminders
  reminder_24h_sent BOOLEAN DEFAULT false,
  reminder_1h_sent BOOLEAN DEFAULT false,
  reminder_custom_sent BOOLEAN DEFAULT false,
  
  -- Origin
  created_by TEXT DEFAULT 'ai' CHECK (created_by IN ('ai', 'agent', 'manual', 'client')),
  ai_session_id UUID REFERENCES public.ai_agent_sessions(id) ON DELETE SET NULL,
  
  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Scheduling Intents Table (track AI-detected scheduling intents)
CREATE TABLE public.scheduling_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  ai_session_id UUID REFERENCES public.ai_agent_sessions(id) ON DELETE SET NULL,
  
  -- Detected Intent
  detected_at TIMESTAMPTZ DEFAULT now(),
  intent_type TEXT CHECK (intent_type IN ('new_meeting', 'reschedule', 'cancel', 'check_availability', 'confirm_selection')),
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  
  -- Extracted Information
  preferred_dates JSONB, -- [{date: '2026-01-20', time_preference: 'morning'}]
  meeting_purpose TEXT,
  duration_requested INTEGER,
  
  -- Offered Slots
  offered_slots JSONB, -- [{datetime, available: true, selected: false}]
  selected_slot_index INTEGER,
  
  -- Result
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'slots_offered', 'awaiting_confirmation', 'confirmed', 'expired', 'cancelled')),
  resulting_meeting_id UUID REFERENCES public.meeting_schedules(id) ON DELETE SET NULL,
  
  -- Expiry
  expires_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Indexes for Performance
CREATE INDEX idx_meeting_schedules_scheduled_at ON public.meeting_schedules(scheduled_at);
CREATE INDEX idx_meeting_schedules_status ON public.meeting_schedules(status);
CREATE INDEX idx_meeting_schedules_agent ON public.meeting_schedules(assigned_agent_id);
CREATE INDEX idx_meeting_schedules_sector ON public.meeting_schedules(sector_id);
CREATE INDEX idx_meeting_schedules_contact ON public.meeting_schedules(contact_id);
CREATE INDEX idx_meeting_schedules_conversation ON public.meeting_schedules(conversation_id);
CREATE INDEX idx_meeting_schedules_reminders ON public.meeting_schedules(scheduled_at, reminder_24h_sent, reminder_1h_sent) 
  WHERE status IN ('scheduled', 'confirmed');

CREATE INDEX idx_availability_slots_sector ON public.availability_slots(sector_id);
CREATE INDEX idx_availability_slots_agent ON public.availability_slots(agent_id);
CREATE INDEX idx_availability_slots_day ON public.availability_slots(day_of_week) WHERE is_active = true;
CREATE INDEX idx_availability_slots_date ON public.availability_slots(specific_date) WHERE is_active = true;

CREATE INDEX idx_scheduling_intents_conversation ON public.scheduling_intents(conversation_id);
CREATE INDEX idx_scheduling_intents_status ON public.scheduling_intents(status);

-- 6. Updated_at Triggers
CREATE TRIGGER update_scheduling_config_updated_at
  BEFORE UPDATE ON public.scheduling_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_meeting_schedules_updated_at
  BEFORE UPDATE ON public.meeting_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_scheduling_intents_updated_at
  BEFORE UPDATE ON public.scheduling_intents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Enable RLS
ALTER TABLE public.scheduling_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_intents ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies for scheduling_config
CREATE POLICY "Admins can manage all scheduling configs"
  ON public.scheduling_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Supervisors can view their sector configs"
  ON public.scheduling_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.user_sectors us ON us.user_id = ur.user_id
      WHERE ur.user_id = auth.uid() 
      AND ur.role = 'supervisor'
      AND us.sector_id = scheduling_config.sector_id
    )
  );

CREATE POLICY "Agents can view their sector configs"
  ON public.scheduling_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_sectors us
      WHERE us.user_id = auth.uid() 
      AND us.sector_id = scheduling_config.sector_id
    )
  );

-- 9. RLS Policies for availability_slots
CREATE POLICY "Admins can manage all availability slots"
  ON public.availability_slots FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can manage their own availability"
  ON public.availability_slots FOR ALL
  USING (agent_id = auth.uid());

CREATE POLICY "Users can view sector availability"
  ON public.availability_slots FOR SELECT
  USING (
    sector_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.user_sectors us
      WHERE us.user_id = auth.uid() 
      AND us.sector_id = availability_slots.sector_id
    )
  );

-- 10. RLS Policies for meeting_schedules
CREATE POLICY "Admins can manage all meetings"
  ON public.meeting_schedules FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Agents can view their assigned meetings"
  ON public.meeting_schedules FOR SELECT
  USING (assigned_agent_id = auth.uid());

CREATE POLICY "Agents can update their assigned meetings"
  ON public.meeting_schedules FOR UPDATE
  USING (assigned_agent_id = auth.uid());

CREATE POLICY "Users can view meetings in their sector"
  ON public.meeting_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_sectors us
      WHERE us.user_id = auth.uid() 
      AND us.sector_id = meeting_schedules.sector_id
    )
  );

CREATE POLICY "Supervisors can manage sector meetings"
  ON public.meeting_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.user_sectors us ON us.user_id = ur.user_id
      WHERE ur.user_id = auth.uid() 
      AND ur.role = 'supervisor'
      AND us.sector_id = meeting_schedules.sector_id
    )
  );

-- 11. RLS Policies for scheduling_intents
CREATE POLICY "Admins can view all scheduling intents"
  ON public.scheduling_intents FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can view intents for their conversations"
  ON public.scheduling_intents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = scheduling_intents.conversation_id
      AND c.assigned_to = auth.uid()
    )
  );

-- 12. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduling_intents;

-- 13. Helper Function: Get available slots for a date range
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_sector_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_duration_minutes INTEGER DEFAULT 30
)
RETURNS TABLE (
  slot_datetime TIMESTAMPTZ,
  slot_end_datetime TIMESTAMPTZ,
  agent_id UUID,
  is_available BOOLEAN
) AS $$
DECLARE
  v_config scheduling_config%ROWTYPE;
  v_current_date DATE;
  v_day_of_week INTEGER;
BEGIN
  -- Get sector config
  SELECT * INTO v_config FROM scheduling_config WHERE sector_id = p_sector_id;
  
  -- If no config or disabled, return empty
  IF NOT FOUND OR NOT v_config.is_enabled THEN
    RETURN;
  END IF;
  
  -- Loop through dates
  v_current_date := p_start_date;
  WHILE v_current_date <= p_end_date LOOP
    v_day_of_week := EXTRACT(DOW FROM v_current_date)::INTEGER;
    
    -- Return slots from availability_slots for this day
    RETURN QUERY
    SELECT 
      (v_current_date + avs.start_time)::TIMESTAMPTZ AT TIME ZONE avs.timezone AS slot_datetime,
      (v_current_date + avs.start_time + (p_duration_minutes || ' minutes')::INTERVAL)::TIMESTAMPTZ AT TIME ZONE avs.timezone AS slot_end_datetime,
      avs.agent_id,
      NOT EXISTS (
        SELECT 1 FROM meeting_schedules ms
        WHERE ms.status IN ('scheduled', 'confirmed')
        AND ms.scheduled_at >= (v_current_date + avs.start_time)::TIMESTAMPTZ AT TIME ZONE avs.timezone
        AND ms.scheduled_at < (v_current_date + avs.start_time + (p_duration_minutes || ' minutes')::INTERVAL)::TIMESTAMPTZ AT TIME ZONE avs.timezone
        AND (ms.sector_id = p_sector_id OR ms.assigned_agent_id = avs.agent_id)
      ) AS is_available
    FROM availability_slots avs
    WHERE avs.is_active = true
    AND avs.slot_type = 'available'
    AND (avs.sector_id = p_sector_id OR avs.agent_id IN (
      SELECT us.user_id FROM user_sectors us WHERE us.sector_id = p_sector_id
    ))
    AND (
      (avs.specific_date = v_current_date) OR 
      (avs.specific_date IS NULL AND avs.day_of_week = v_day_of_week)
    );
    
    v_current_date := v_current_date + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;