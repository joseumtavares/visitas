-- ============================================================
-- ThermoVisit v10.1 — Migration incremental
-- Execute APÓS o schema_v10_completo.sql
--
-- Adiciona:
--  1. order_number sequencial em orders
--  2. Campos de documentos do cliente
--  3. Campos FINAME e NCM em products
--  4. Outbox para sync offline-first
--  5. Índices adicionais
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║  1. NÚMERO SEQUENCIAL DE PEDIDO                         ║
-- ╚══════════════════════════════════════════════════════════╝
-- Cada workspace tem sua própria sequência.
-- order_number é o número VISÍVEL ao usuário (não o UUID técnico).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number BIGINT;

-- Sequência global (workspace usa prefixo na exibição)
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq
  START 1000 INCREMENT 1 NO CYCLE;

-- Trigger: preenche order_number ao inserir se não vier preenchido
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

-- Índice único: garante que não existam dois pedidos com o mesmo número no mesmo workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_workspace_order_number
  ON public.orders (workspace, order_number);

-- ╔══════════════════════════════════════════════════════════╗
-- ║  2. DOCUMENTOS DO CLIENTE                               ║
-- ╚══════════════════════════════════════════════════════════╝
-- Caminhos de arquivos (URL ou path no storage)

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS document_front_path    TEXT,   -- frente RG/CNH
  ADD COLUMN IF NOT EXISTS document_back_path     TEXT,   -- verso RG/CNH
  ADD COLUMN IF NOT EXISTS residence_proof_path   TEXT;   -- comprovante residência

-- ╔══════════════════════════════════════════════════════════╗
-- ║  3. FINAME E NCM EM PRODUTOS                            ║
-- ╚══════════════════════════════════════════════════════════╝

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS finame_code TEXT,
  ADD COLUMN IF NOT EXISTS ncm_code    TEXT;

-- ╔══════════════════════════════════════════════════════════╗
-- ║  4. OUTBOX — fila de operações para sync offline-first  ║
-- ╚══════════════════════════════════════════════════════════╝
-- Registra cada operação (create/update/delete) localmente.
-- O backend aplica operações em ordem cronológica.
-- Permite sync seguro multi-dispositivo.

CREATE TABLE IF NOT EXISTS public.outbox (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace   TEXT NOT NULL DEFAULT 'principal',
  device_id   TEXT NOT NULL,              -- ID do dispositivo/sessão
  entity      TEXT NOT NULL,              -- 'orders', 'clients', etc.
  entity_id   UUID NOT NULL,              -- ID do registro afetado
  op_type     TEXT NOT NULL,              -- 'create' | 'update' | 'delete'
  payload     JSONB,                      -- dados completos da operação
  client_ts   TIMESTAMPTZ NOT NULL,       -- timestamp no cliente
  server_ts   TIMESTAMPTZ DEFAULT now(),  -- timestamp no servidor
  applied     BOOLEAN DEFAULT false,      -- já foi aplicada?
  applied_at  TIMESTAMPTZ,
  CONSTRAINT outbox_op_type_check CHECK (op_type IN ('create','update','delete'))
);

CREATE INDEX IF NOT EXISTS idx_outbox_ws_applied
  ON public.outbox (workspace, applied, client_ts);

CREATE INDEX IF NOT EXISTS idx_outbox_entity
  ON public.outbox (entity, entity_id);

ALTER TABLE public.outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_direct_outbox" ON public.outbox;
CREATE POLICY "deny_direct_outbox" ON public.outbox FOR ALL USING (false);

-- ╔══════════════════════════════════════════════════════════╗
-- ║  5. ÍNDICES ADICIONAIS                                  ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE INDEX IF NOT EXISTS idx_orders_number
  ON public.orders (workspace, order_number DESC);

CREATE INDEX IF NOT EXISTS idx_clients_docs
  ON public.clients (workspace) WHERE document_front_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_ncm
  ON public.products (workspace, ncm_code);

-- ╔══════════════════════════════════════════════════════════╗
-- ║  6. BACKFILL: preencher order_number para pedidos       ║
-- ║     existentes (executa só uma vez)                     ║
-- ╚══════════════════════════════════════════════════════════╝
-- Execute manualmente após aplicar a migration:
--
-- UPDATE public.orders
-- SET order_number = nextval('public.order_number_seq')
-- WHERE order_number IS NULL
-- ORDER BY created_at;
--
-- Confirme depois:
-- SELECT COUNT(*) FROM public.orders WHERE order_number IS NULL;
-- (deve retornar 0)

-- ============================================================
-- FIM DA MIGRATION v10.1
-- ============================================================
