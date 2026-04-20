-- ============================================================
-- Agri Vendas — Migração v10.2
-- Execute no SQL Editor do Supabase
--
-- INSTRUÇÕES:
--   Selecione TODOS os statements abaixo e clique em "Run"
--   NÃO use o botão "Explain" — ele só aceita um statement por vez.
--
-- NOVIDADES:
--   • clients: document_front_path, document_back_path, residence_proof_path
--   • products: finame_code, ncm_code
--   • visits: activity_type, lat, lng
-- ============================================================

-- 1. CLIENTES — campos de documentos
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS document_front_path   TEXT,
  ADD COLUMN IF NOT EXISTS document_back_path    TEXT,
  ADD COLUMN IF NOT EXISTS residence_proof_path  TEXT;

-- 2. CLIENTES — índice de documentos
CREATE INDEX IF NOT EXISTS idx_clients_docs
  ON public.clients (workspace)
  WHERE document_front_path IS NOT NULL
     OR document_back_path  IS NOT NULL
     OR residence_proof_path IS NOT NULL;

-- 3. PRODUTOS — código FINAME
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS finame_code TEXT DEFAULT '';

-- 4. PRODUTOS — código NCM
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ncm_code TEXT DEFAULT '';

-- 5. PRODUTOS — índice NCM
CREATE INDEX IF NOT EXISTS idx_products_ncm
  ON public.products (workspace, ncm_code)
  WHERE ncm_code IS NOT NULL AND ncm_code <> '';

-- 6. PRODUTOS — índice FINAME
CREATE INDEX IF NOT EXISTS idx_products_finame
  ON public.products (workspace, finame_code)
  WHERE finame_code IS NOT NULL AND finame_code <> '';

-- 7. VISITAS — tipo de atividade
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS activity_type TEXT DEFAULT 'Visita';

-- 8. VISITAS — latitude
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION DEFAULT 0;

-- 9. VISITAS — longitude
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION DEFAULT 0;

-- 10. VISITAS — índice por tipo de atividade
CREATE INDEX IF NOT EXISTS idx_visits_activity
  ON public.visits (workspace, client_id, activity_type);

-- 11. VISITAS — índice geoespacial
CREATE INDEX IF NOT EXISTS idx_visits_geo
  ON public.visits (workspace)
  WHERE lat <> 0 AND lng <> 0;
