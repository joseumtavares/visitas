-- ============================================================
-- ThermoVisit v8 — Correções e campos faltantes
-- Execute no SQL Editor do Supabase
-- ============================================================

-- ── 1. Campos de comissão que podem estar faltando em orders ─
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS commission_type  TEXT DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS commission_value DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_pct   DOUBLE PRECISION DEFAULT 0;

-- ── 2. Campos de comissão que podem estar faltando em referrals ─
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS commission_pct  DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpf      TEXT,
  ADD COLUMN IF NOT EXISTS phone    TEXT,
  ADD COLUMN IF NOT EXISTS bank_name    TEXT,
  ADD COLUMN IF NOT EXISTS bank_agency  TEXT,
  ADD COLUMN IF NOT EXISTS bank_account TEXT,
  ADD COLUMN IF NOT EXISTS bank_pix     TEXT;

-- ── 3. rep_commission_pct em products (se não existir) ──────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS rep_commission_pct DOUBLE PRECISION DEFAULT 0;

-- ── 4. receipt_photo_ids em commissions (se não existir) ────
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS receipt_photo_ids TEXT[] DEFAULT '{}'::TEXT[];

-- ── 5. maps_link e notes em leads (se não existirem) ────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS maps_link TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes     TEXT DEFAULT '';

-- ── 6. cep em clients (se não existir) ──────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS cep TEXT DEFAULT '';

-- ── 7. rep_commissions (tabela completa, se não existir) ────
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

-- Índices rep_commissions
CREATE INDEX IF NOT EXISTS idx_rep_commissions_ws      ON public.rep_commissions (workspace);
CREATE INDEX IF NOT EXISTS idx_rep_commissions_order   ON public.rep_commissions (order_id);
CREATE INDEX IF NOT EXISTS idx_rep_commissions_product ON public.rep_commissions (product_id);
CREATE INDEX IF NOT EXISTS idx_rep_commissions_status  ON public.rep_commissions (status);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_rep_commissions_updated_at ON public.rep_commissions;
CREATE TRIGGER trg_rep_commissions_updated_at
  BEFORE UPDATE ON public.rep_commissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.rep_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_direct" ON public.rep_commissions;
CREATE POLICY "deny_direct" ON public.rep_commissions FOR ALL USING (false);

-- ── VERIFICAÇÃO ───────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'rep_commissions' ORDER BY ordinal_position;
