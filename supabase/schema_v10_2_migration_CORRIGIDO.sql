-- ============================================================
-- Agri Vendas — Migração v10.2 CORRIGIDA
-- Execute no SQL Editor do Supabase APÓS schema_v10_1_migration.sql
--
-- BUGS CORRIGIDOS vs migration original:
--   [BUG 1] idx_clients_docs duplicado → DROP IF EXISTS antes de recriar
--   [BUG 2] finame_code/ncm_code sem DEFAULT '' → UPDATE backfill
--   [BUG 3] visits sem activity_type/lat/lng se migration parou no BUG 1
-- ============================================================

-- Verificação: v10.1 precisa ter rodado primeiro
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='orders' AND column_name='order_number'
  ) THEN
    RAISE EXCEPTION 'Execute schema_v10_1_migration.sql ANTES desta migration.';
  END IF;
END $$;

-- ─── 1. CLIENTES — documentos (idempotente) ───────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS document_front_path    TEXT,
  ADD COLUMN IF NOT EXISTS document_back_path     TEXT,
  ADD COLUMN IF NOT EXISTS residence_proof_path   TEXT;

-- BUG 1 CORRIGIDO: DROP antes de recriar (cláusula WHERE mudou vs v10.1)
DROP INDEX IF EXISTS public.idx_clients_docs;
CREATE INDEX idx_clients_docs
  ON public.clients (workspace)
  WHERE document_front_path  IS NOT NULL
     OR document_back_path   IS NOT NULL
     OR residence_proof_path IS NOT NULL;

-- ─── 2. PRODUTOS — FINAME e NCM (idempotente) ────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS finame_code TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS ncm_code    TEXT DEFAULT '';

-- BUG 2 CORRIGIDO: v10.1 criou sem DEFAULT '' — normalizar NULLs
UPDATE public.products SET finame_code = '' WHERE finame_code IS NULL;
UPDATE public.products SET ncm_code    = '' WHERE ncm_code    IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_ncm
  ON public.products (workspace, ncm_code)
  WHERE ncm_code IS NOT NULL AND ncm_code <> '';

CREATE INDEX IF NOT EXISTS idx_products_finame
  ON public.products (workspace, finame_code)
  WHERE finame_code IS NOT NULL AND finame_code <> '';

-- ─── 3. VISITAS — tipo de atividade e geolocalização (NOVO em v10.2) ─────
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS activity_type TEXT             DEFAULT 'Visita',
  ADD COLUMN IF NOT EXISTS lat           DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lng           DOUBLE PRECISION DEFAULT 0;

-- Backfill
UPDATE public.visits SET activity_type = 'Visita' WHERE activity_type IS NULL;
UPDATE public.visits SET lat = 0 WHERE lat IS NULL;
UPDATE public.visits SET lng = 0 WHERE lng IS NULL;

CREATE INDEX IF NOT EXISTS idx_visits_activity
  ON public.visits (workspace, client_id, activity_type);

CREATE INDEX IF NOT EXISTS idx_visits_geo
  ON public.visits (workspace)
  WHERE lat <> 0 AND lng <> 0;

-- ─── 4. ORDER_NUMBER — garantir trigger ativo ─────────────────────────────
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := nextval('public.order_number_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_order_number ON public.orders;
CREATE TRIGGER trg_set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_number();

-- Backfill pedidos sem número
UPDATE public.orders
  SET order_number = nextval('public.order_number_seq')
  WHERE order_number IS NULL;

-- ─── 5. VERIFICAÇÃO FINAL ────────────────────────────────────────────────
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('clients','products','visits','orders')
  AND column_name IN (
    'document_front_path','document_back_path','residence_proof_path',
    'finame_code','ncm_code',
    'activity_type','lat','lng',
    'order_number'
  )
ORDER BY table_name, column_name;
-- Esperado: 9 linhas
-- ============================================================
-- FIM DA MIGRATION v10.2 CORRIGIDA
-- ============================================================
