-- =============================================
-- FASE 6: Sistema de Cotações, Pedidos e Pagamentos
-- =============================================

-- Enum para status de cotação
DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Enum para status de pedido
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'paid', 'shipped', 'delivered', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Enum para status de pagamento
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'confirmed', 'failed', 'refunded');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =============================================
-- 1. Tabela de Cotações (Quotes)
-- =============================================
CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT NOT NULL UNIQUE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  
  -- Status
  status quote_status NOT NULL DEFAULT 'draft',
  
  -- Itens e valores
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  
  -- Validade e condições
  valid_until TIMESTAMPTZ,
  payment_terms TEXT,
  notes TEXT,
  
  -- Quem criou
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  
  -- Timestamps de interação
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  
  -- Timestamps padrão
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para quotes
CREATE INDEX IF NOT EXISTS idx_quotes_lead_id ON public.quotes(lead_id);
CREATE INDEX IF NOT EXISTS idx_quotes_conversation_id ON public.quotes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_sector_id ON public.quotes(sector_id);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON public.quotes(created_at DESC);

-- =============================================
-- 2. Tabela de Pedidos (Orders)
-- =============================================
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  
  -- Status
  status order_status NOT NULL DEFAULT 'pending',
  
  -- Itens e valores
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  
  -- Pagamento
  payment_method TEXT,
  payment_status payment_status NOT NULL DEFAULT 'pending',
  payment_link TEXT,
  payment_notes TEXT,
  payment_proof_url TEXT,
  
  -- Confirmação
  paid_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Entrega/Notas
  shipping_address TEXT,
  delivery_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para orders
CREATE INDEX IF NOT EXISTS idx_orders_quote_id ON public.orders(quote_id);
CREATE INDEX IF NOT EXISTS idx_orders_lead_id ON public.orders(lead_id);
CREATE INDEX IF NOT EXISTS idx_orders_conversation_id ON public.orders(conversation_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_sector_id ON public.orders(sector_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- =============================================
-- 3. Tabela de Histórico de Negociação
-- =============================================
CREATE TABLE IF NOT EXISTS public.negotiation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- Ação
  action TEXT NOT NULL,
  
  -- Valores
  original_value NUMERIC(12,2),
  new_value NUMERIC(12,2),
  discount_percent NUMERIC(5,2),
  
  -- Contexto
  agent_type TEXT NOT NULL DEFAULT 'human',
  reason TEXT,
  customer_message TEXT,
  
  -- Aprovação
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  
  -- Quem fez
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_negotiation_logs_quote_id ON public.negotiation_logs(quote_id);
CREATE INDEX IF NOT EXISTS idx_negotiation_logs_order_id ON public.negotiation_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_negotiation_logs_action ON public.negotiation_logs(action);

-- =============================================
-- 4. Tabela de Links de Pagamento
-- =============================================
CREATE TABLE IF NOT EXISTS public.payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  
  -- Tipo e dados
  type TEXT NOT NULL,
  url TEXT,
  description TEXT,
  instructions TEXT,
  
  -- Valores
  amount NUMERIC(12,2) NOT NULL,
  
  -- Status
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Quem criou
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_payment_links_order_id ON public.payment_links(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_type ON public.payment_links(type);
CREATE INDEX IF NOT EXISTS idx_payment_links_is_active ON public.payment_links(is_active);

-- =============================================
-- Triggers para updated_at
-- =============================================
CREATE TRIGGER update_quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- Função para gerar números sequenciais
-- =============================================
CREATE OR REPLACE FUNCTION public.generate_quote_number()
RETURNS TEXT AS $$
DECLARE
  year_suffix TEXT;
  next_num INTEGER;
BEGIN
  year_suffix := to_char(now(), 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(quote_number FROM 'COT-' || year_suffix || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM public.quotes
  WHERE quote_number LIKE 'COT-' || year_suffix || '-%';
  
  RETURN 'COT-' || year_suffix || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TEXT AS $$
DECLARE
  year_suffix TEXT;
  next_num INTEGER;
BEGIN
  year_suffix := to_char(now(), 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(order_number FROM 'PED-' || year_suffix || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_num
  FROM public.orders
  WHERE order_number LIKE 'PED-' || year_suffix || '-%';
  
  RETURN 'PED-' || year_suffix || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================
-- RLS Policies (usando has_role)
-- =============================================

-- Habilitar RLS
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negotiation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

-- Quotes
CREATE POLICY "Admins can manage all quotes"
  ON public.quotes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supervisors can manage quotes in their sectors"
  ON public.quotes FOR ALL
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND (
      sector_id IN (SELECT sector_id FROM public.user_sectors WHERE user_id = auth.uid())
      OR sector_id IS NULL
    )
  );

CREATE POLICY "Users can view quotes in their sector"
  ON public.quotes FOR SELECT
  USING (
    sector_id IN (SELECT sector_id FROM public.user_sectors WHERE user_id = auth.uid())
    OR created_by = auth.uid()
  );

CREATE POLICY "Users can create quotes in their sector"
  ON public.quotes FOR INSERT
  WITH CHECK (
    sector_id IN (SELECT sector_id FROM public.user_sectors WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update their own quotes"
  ON public.quotes FOR UPDATE
  USING (created_by = auth.uid());

-- Orders
CREATE POLICY "Admins can manage all orders"
  ON public.orders FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Supervisors can manage orders in their sectors"
  ON public.orders FOR ALL
  USING (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND (
      sector_id IN (SELECT sector_id FROM public.user_sectors WHERE user_id = auth.uid())
      OR sector_id IS NULL
    )
  );

CREATE POLICY "Users can view orders in their sector"
  ON public.orders FOR SELECT
  USING (
    sector_id IN (SELECT sector_id FROM public.user_sectors WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create orders in their sector"
  ON public.orders FOR INSERT
  WITH CHECK (
    sector_id IN (SELECT sector_id FROM public.user_sectors WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update orders in their sector"
  ON public.orders FOR UPDATE
  USING (
    sector_id IN (SELECT sector_id FROM public.user_sectors WHERE user_id = auth.uid())
  );

-- Negotiation logs
CREATE POLICY "Users can view negotiation logs"
  ON public.negotiation_logs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create negotiation logs"
  ON public.negotiation_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage negotiation logs"
  ON public.negotiation_logs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Payment links
CREATE POLICY "Admins can manage all payment links"
  ON public.payment_links FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view payment links"
  ON public.payment_links FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create payment links"
  ON public.payment_links FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their payment links"
  ON public.payment_links FOR UPDATE
  USING (created_by = auth.uid());

-- =============================================
-- Realtime
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.quotes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;