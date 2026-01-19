-- =============================================
-- FASE 5: DNA do Negócio - Knowledge Base Infrastructure
-- =============================================

-- 1. Business Knowledge Base - Core knowledge storage
CREATE TABLE public.business_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID REFERENCES public.sectors(id) ON DELETE CASCADE,
  
  -- Categorization
  category TEXT NOT NULL, -- 'product', 'policy', 'faq', 'procedure', 'pricing', 'script'
  subcategory TEXT,
  
  -- Content
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  
  -- Metadata
  source TEXT DEFAULT 'manual', -- 'manual', 'learned', 'imported', 'conversation'
  confidence_score FLOAT DEFAULT 1.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Control
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.profiles(id),
  verified_by UUID REFERENCES public.profiles(id),
  
  -- Versioning
  version INTEGER DEFAULT 1,
  parent_id UUID REFERENCES public.business_knowledge_base(id),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Response Templates - Optimized response patterns
CREATE TABLE public.response_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID REFERENCES public.sectors(id) ON DELETE CASCADE,
  
  -- Identification
  name TEXT NOT NULL,
  description TEXT,
  
  -- Content
  trigger_patterns TEXT[] DEFAULT '{}',
  template_content TEXT NOT NULL,
  variables JSONB DEFAULT '{}',
  
  -- Categorization
  category TEXT, -- 'greeting', 'objection', 'closing', 'support', 'sales'
  intent_match TEXT[] DEFAULT '{}',
  
  -- Performance metrics
  usage_count INTEGER DEFAULT 0,
  success_rate FLOAT,
  avg_sentiment_after FLOAT,
  
  -- Control
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Learning Examples - Successful conversation patterns
CREATE TABLE public.learning_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID REFERENCES public.sectors(id) ON DELETE CASCADE,
  
  -- Source
  conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  
  -- Content
  input_context TEXT NOT NULL,
  ideal_response TEXT NOT NULL,
  
  -- Classification
  scenario_type TEXT, -- 'objection_handling', 'closing', 'support', 'greeting', 'pricing'
  tags TEXT[] DEFAULT '{}',
  
  -- Quality metrics
  quality_score FLOAT CHECK (quality_score >= 0 AND quality_score <= 1),
  lead_converted BOOLEAN DEFAULT false,
  customer_satisfied BOOLEAN DEFAULT false,
  
  -- Feedback
  marked_as_good_by UUID REFERENCES public.profiles(id),
  marked_at TIMESTAMPTZ,
  notes TEXT,
  
  -- Usage tracking
  times_referenced INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. AI Response Feedback - Agent feedback on AI responses
CREATE TABLE public.ai_response_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference
  log_id UUID REFERENCES public.ai_agent_logs(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  
  -- Feedback
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback_type TEXT, -- 'helpful', 'incorrect', 'incomplete', 'tone_wrong', 'perfect'
  
  -- Correction
  corrected_response TEXT,
  correction_reason TEXT,
  
  -- Meta
  given_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Extend ai_agent_configs with advanced personality settings
ALTER TABLE public.ai_agent_configs 
  ADD COLUMN IF NOT EXISTS personality_traits JSONB DEFAULT '{"empathetic": 0.7, "professional": 0.8, "friendly": 0.6}',
  ADD COLUMN IF NOT EXISTS communication_style JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS forbidden_topics TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS competitor_handling TEXT DEFAULT 'neutral',
  ADD COLUMN IF NOT EXISTS objection_style TEXT DEFAULT 'empathetic',
  ADD COLUMN IF NOT EXISTS upsell_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS upsell_triggers TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS max_discount_percent FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS knowledge_base_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS learn_from_agents BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS custom_instructions TEXT;

-- =============================================
-- INDEXES
-- =============================================

-- Knowledge base indexes
CREATE INDEX idx_knowledge_base_sector ON public.business_knowledge_base(sector_id);
CREATE INDEX idx_knowledge_base_category ON public.business_knowledge_base(category);
CREATE INDEX idx_knowledge_base_active ON public.business_knowledge_base(is_active) WHERE is_active = true;
CREATE INDEX idx_knowledge_base_keywords ON public.business_knowledge_base USING GIN(keywords);
CREATE INDEX idx_knowledge_base_search ON public.business_knowledge_base USING GIN(to_tsvector('portuguese', title || ' ' || content));

-- Response templates indexes
CREATE INDEX idx_response_templates_sector ON public.response_templates(sector_id);
CREATE INDEX idx_response_templates_category ON public.response_templates(category);
CREATE INDEX idx_response_templates_triggers ON public.response_templates USING GIN(trigger_patterns);

-- Learning examples indexes
CREATE INDEX idx_learning_examples_sector ON public.learning_examples(sector_id);
CREATE INDEX idx_learning_examples_scenario ON public.learning_examples(scenario_type);
CREATE INDEX idx_learning_examples_search ON public.learning_examples USING GIN(to_tsvector('portuguese', input_context || ' ' || ideal_response));

-- Feedback indexes
CREATE INDEX idx_ai_feedback_conversation ON public.ai_response_feedback(conversation_id);
CREATE INDEX idx_ai_feedback_rating ON public.ai_response_feedback(rating);

-- =============================================
-- TRIGGERS
-- =============================================

-- Updated_at triggers
CREATE TRIGGER update_business_knowledge_base_updated_at
  BEFORE UPDATE ON public.business_knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_response_templates_updated_at
  BEFORE UPDATE ON public.response_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- RLS POLICIES
-- =============================================

-- Enable RLS
ALTER TABLE public.business_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.response_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_response_feedback ENABLE ROW LEVEL SECURITY;

-- Business Knowledge Base Policies
CREATE POLICY "Admins have full access to knowledge base"
  ON public.business_knowledge_base FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Supervisors can manage knowledge in their sectors"
  ON public.business_knowledge_base FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.user_sectors us ON ur.user_id = us.user_id
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'supervisor'
        AND us.sector_id = business_knowledge_base.sector_id
    )
  );

CREATE POLICY "Agents can view active knowledge in their sectors"
  ON public.business_knowledge_base FOR SELECT
  USING (
    is_active = true AND
    EXISTS (
      SELECT 1 FROM public.user_sectors
      WHERE user_id = auth.uid() AND sector_id = business_knowledge_base.sector_id
    )
  );

-- Response Templates Policies
CREATE POLICY "Admins have full access to templates"
  ON public.response_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Supervisors can manage templates in their sectors"
  ON public.response_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.user_sectors us ON ur.user_id = us.user_id
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'supervisor'
        AND us.sector_id = response_templates.sector_id
    )
  );

CREATE POLICY "Agents can view active templates in their sectors"
  ON public.response_templates FOR SELECT
  USING (
    is_active = true AND
    EXISTS (
      SELECT 1 FROM public.user_sectors
      WHERE user_id = auth.uid() AND sector_id = response_templates.sector_id
    )
  );

-- Learning Examples Policies
CREATE POLICY "Admins have full access to learning examples"
  ON public.learning_examples FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Supervisors can manage examples in their sectors"
  ON public.learning_examples FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.user_sectors us ON ur.user_id = us.user_id
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'supervisor'
        AND us.sector_id = learning_examples.sector_id
    )
  );

CREATE POLICY "Agents can view and create examples in their sectors"
  ON public.learning_examples FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_sectors
      WHERE user_id = auth.uid() AND sector_id = learning_examples.sector_id
    )
  );

CREATE POLICY "Agents can create examples"
  ON public.learning_examples FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_sectors
      WHERE user_id = auth.uid() AND sector_id = learning_examples.sector_id
    )
  );

-- AI Response Feedback Policies
CREATE POLICY "Users can create feedback"
  ON public.ai_response_feedback FOR INSERT
  WITH CHECK (given_by = auth.uid());

CREATE POLICY "Users can view their own feedback"
  ON public.ai_response_feedback FOR SELECT
  USING (given_by = auth.uid());

CREATE POLICY "Admins can view all feedback"
  ON public.ai_response_feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );

-- =============================================
-- HELPER FUNCTION: Search Knowledge Base
-- =============================================

CREATE OR REPLACE FUNCTION public.search_knowledge_base(
  p_query TEXT,
  p_sector_id UUID,
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  category TEXT,
  confidence_score FLOAT,
  relevance_score FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    kb.id,
    kb.title,
    kb.content,
    kb.category,
    kb.confidence_score,
    ts_rank(to_tsvector('portuguese', kb.title || ' ' || kb.content), plainto_tsquery('portuguese', p_query)) AS relevance_score
  FROM public.business_knowledge_base kb
  WHERE 
    kb.sector_id = p_sector_id
    AND kb.is_active = true
    AND (p_category IS NULL OR kb.category = p_category)
    AND (
      to_tsvector('portuguese', kb.title || ' ' || kb.content) @@ plainto_tsquery('portuguese', p_query)
      OR kb.keywords && string_to_array(lower(p_query), ' ')
    )
  ORDER BY relevance_score DESC, kb.usage_count DESC
  LIMIT p_limit;
END;
$$;

-- =============================================
-- ENABLE REALTIME
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.business_knowledge_base;
ALTER PUBLICATION supabase_realtime ADD TABLE public.response_templates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.learning_examples;