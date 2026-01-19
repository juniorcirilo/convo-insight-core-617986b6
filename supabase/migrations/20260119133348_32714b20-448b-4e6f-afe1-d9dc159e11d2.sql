-- =============================================
-- FASE 6: CHECKOUT/VENDEDOR HUMANO - ETAPA 1
-- Catálogo de Produtos (corrigido)
-- =============================================

-- Tabela de produtos/serviços
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  category TEXT NOT NULL DEFAULT 'produto', -- produto, serviço, pacote
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  is_active BOOLEAN NOT NULL DEFAULT true,
  min_quantity INTEGER NOT NULL DEFAULT 1,
  max_discount_percent INTEGER NOT NULL DEFAULT 0,
  features JSONB DEFAULT '[]'::jsonb,
  images TEXT[] DEFAULT ARRAY[]::TEXT[],
  stripe_price_id TEXT,
  stripe_product_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Variantes de produtos (tamanhos, cores, planos)
CREATE TABLE public.product_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  price_modifier NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  attributes JSONB DEFAULT '{}'::jsonb,
  stripe_price_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_products_sector ON public.products(sector_id);
CREATE INDEX idx_products_active ON public.products(is_active) WHERE is_active = true;
CREATE INDEX idx_products_category ON public.products(category);
CREATE INDEX idx_product_variants_product ON public.product_variants(product_id);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- RLS Policies para products usando has_role()
CREATE POLICY "Admins podem gerenciar todos os produtos"
  ON public.products FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Supervisores podem gerenciar produtos do seu setor"
  ON public.products FOR ALL
  USING (
    public.has_role(auth.uid(), 'supervisor')
    AND EXISTS (
      SELECT 1 FROM public.user_sectors us
      WHERE us.user_id = auth.uid()
      AND us.sector_id = products.sector_id
    )
  );

CREATE POLICY "Agentes podem ver produtos ativos do seu setor"
  ON public.products FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.user_sectors us
      WHERE us.user_id = auth.uid()
      AND us.sector_id = products.sector_id
    )
  );

-- RLS Policies para product_variants
CREATE POLICY "Admins podem gerenciar todas as variantes"
  ON public.product_variants FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Supervisores podem gerenciar variantes do seu setor"
  ON public.product_variants FOR ALL
  USING (
    public.has_role(auth.uid(), 'supervisor')
    AND EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.user_sectors us ON us.sector_id = p.sector_id
      WHERE p.id = product_variants.product_id
      AND us.user_id = auth.uid()
    )
  );

CREATE POLICY "Agentes podem ver variantes de produtos ativos"
  ON public.product_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.user_sectors us ON us.sector_id = p.sector_id
      WHERE p.id = product_variants.product_id
      AND p.is_active = true
      AND us.user_id = auth.uid()
    )
  );

-- Trigger para updated_at
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_variants;