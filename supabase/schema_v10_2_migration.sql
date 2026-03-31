-- ============================================================
-- Agri Vendas — Migração v10.2
-- Execute no SQL Editor do Supabase
--
-- NOVIDADES:
--   • clients: document_front_path, document_back_path, residence_proof_path
--   • products: finame_code, ncm_code (eram da v10.1 — garantindo idempotência)
--   • visits: activity_type, lat, lng
--   • Renomear APP_NAME nas configurações (ThermoVisit → Agri Vendas)
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CLIENTES — documentos
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS document_front_path    TEXT,
  ADD COLUMN IF NOT EXISTS document_back_path     TEXT,
  ADD COLUMN IF NOT EXISTS residence_proof_path   TEXT;

-- Índice para consulta rápida de clientes com documentos
CREATE INDEX IF NOT EXISTS idx_clients_docs
  ON public.clients (workspace)
  WHERE document_front_path IS NOT NULL
     OR document_back_path  IS NOT NULL
     OR residence_proof_path IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PRODUTOS — FINAME e NCM (v10.1 — garantindo idempotência)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS finame_code TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS ncm_code    TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_products_ncm
  ON public.products (workspace, ncm_code)
  WHERE ncm_code IS NOT NULL AND ncm_code <> '';

CREATE INDEX IF NOT EXISTS idx_products_finame
  ON public.products (workspace, finame_code)
  WHERE finame_code IS NOT NULL AND finame_code <> '';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. VISITAS — tipo de atividade e geolocalização
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS activity_type TEXT DEFAULT 'Visita',
  ADD COLUMN IF NOT EXISTS lat           DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lng           DOUBLE PRECISION DEFAULT 0;

-- Tipos válidos de atividade (constraint opcional — comente se quiser flexibilidade)
-- ALTER TABLE public.visits
--   ADD CONSTRAINT visits_activity_type_check
--   CHECK (activity_type IN ('Visita','Proposta Enviada','Ligação','WhatsApp','Reunião','Venda','Pós-venda','Outro'));

CREATE INDEX IF NOT EXISTS idx_visits_activity
  ON public.visits (workspace, client_id, activity_type);

CREATE INDEX IF NOT EXISTS idx_visits_geo
  ON public.visits (workspace)
  WHERE lat <> 0 AND lng <> 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. AMBIENTES — garantir coluna residence_proof_path em clients
--    (coluna já adicionada acima; este bloco é verificação extra)
-- ─────────────────────────────────────────────────────────────────────────────

-- Verificação: listar clientes com documentos cadastrados
-- SELECT id, name, document_front_path IS NOT NULL AS has_front,
--        document_back_path IS NOT NULL AS has_back,
--        residence_proof_path IS NOT NULL AS has_proof
-- FROM public.clients WHERE workspace = 'principal';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ORDERS — orderNumber já estava na v10.1; confirmar coluna existe
-- ─────────────────────────────────────────────────────────────────────────────

-- order_number é gerado automaticamente pelo trigger existente.
-- Verificar se o trigger está ativo:
-- SELECT trigger_name FROM information_schema.triggers
-- WHERE event_object_table = 'orders';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ATUALIZAR nome do sistema em company_settings (se necessário)
-- ─────────────────────────────────────────────────────────────────────────────

-- Execute apenas se ainda estiver com nome antigo:
-- UPDATE public.company_settings
-- SET name = 'Agri Vendas', updated_at = now()
-- WHERE name = 'ThermoVisit' OR name = '' OR name IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. VERIFICAÇÃO FINAL — listar colunas de cada tabela alterada
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  table_name,
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('clients', 'products', 'visits')
  AND column_name IN (
    'document_front_path', 'document_back_path', 'residence_proof_path',
    'finame_code', 'ncm_code',
    'activity_type', 'lat', 'lng'
  )
ORDER BY table_name, column_name;
