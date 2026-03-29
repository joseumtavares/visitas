-- ============================================================
-- ThermoVisit v6 — Schema Update
-- Execute no SQL Editor do Supabase APÓS o schema_v5
-- Adiciona: rep_commissions, campos de comissão em products,
--           campos de comissão em orders
-- ============================================================

-- ── 1. Campo % comissão do representante em products ─────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS rep_commission_pct DOUBLE PRECISION DEFAULT 0;

-- ── 1b. Campos faltantes em leads ────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS maps_link TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes     TEXT DEFAULT '';

-- ── 2. Campos de comissão em orders ──────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS commission_type   TEXT DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS commission_value  DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_pct    DOUBLE PRECISION DEFAULT 0;

-- ── 3. Nova tabela: rep_commissions ──────────────────────────────────────
-- Comissões do representante sobre vendas (geradas por produto)
-- Diferente de public.commissions (que é para indicadores)
CREATE TABLE IF NOT EXISTS public.rep_commissions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace           TEXT NOT NULL DEFAULT 'principal',
    order_id            UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    order_date          TIMESTAMPTZ,
    client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    client_name         TEXT,
    product_id          UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name        TEXT,
    qty                 INTEGER DEFAULT 1,
    unit_price          DOUBLE PRECISION DEFAULT 0,
    rep_commission_pct  DOUBLE PRECISION DEFAULT 0,
    amount              DOUBLE PRECISION NOT NULL DEFAULT 0,
    order_total         DOUBLE PRECISION DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'pendente',
    paid_at             TIMESTAMPTZ,
    receipt_photo_ids   TEXT[] DEFAULT '{}'::TEXT[],
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ── 4. Campo receiptPhotoIds em commissions (indicadores) ────────────────
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS receipt_photo_ids TEXT[] DEFAULT '{}'::TEXT[];

-- ── 5. Índices ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rep_commissions_ws       ON public.rep_commissions (workspace);
CREATE INDEX IF NOT EXISTS idx_rep_commissions_order    ON public.rep_commissions (order_id);
CREATE INDEX IF NOT EXISTS idx_rep_commissions_product  ON public.rep_commissions (product_id);
CREATE INDEX IF NOT EXISTS idx_rep_commissions_status   ON public.rep_commissions (status);

-- ── 6. Trigger updated_at ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_rep_commissions_updated_at ON public.rep_commissions;
CREATE TRIGGER trg_rep_commissions_updated_at
  BEFORE UPDATE ON public.rep_commissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 7. RLS — bloqueia acesso direto do frontend ───────────────────────────
ALTER TABLE public.rep_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_direct" ON public.rep_commissions;
CREATE POLICY "deny_direct" ON public.rep_commissions FOR ALL USING (false);

-- ── VERIFICAÇÃO ───────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'rep_commissions' ORDER BY ordinal_position;
