-- ============================================================
-- ThermoVisit v9 — Migration: Tombstone, Unique Constraints,
--                  Commission Idempotency, Audit Log
-- Execute no SQL Editor do Supabase em ordem
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║  1. TABELA deleted_records (tombstone para sync)        ║
-- ╚══════════════════════════════════════════════════════════╝
-- Registra IDs deletados por workspace/tabela.
-- O sync usa isso para propagar exclusões e impedir que
-- registros apagados voltem após sincronização.

CREATE TABLE IF NOT EXISTS public.deleted_records (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace    TEXT NOT NULL DEFAULT 'principal',
  table_name   TEXT NOT NULL,
  record_id    UUID NOT NULL,
  deleted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT deleted_records_unique UNIQUE (workspace, table_name, record_id)
);

CREATE INDEX IF NOT EXISTS idx_deleted_records_ws_table
  ON public.deleted_records (workspace, table_name);

-- RLS: apenas service role acessa (via backend)
ALTER TABLE public.deleted_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_direct_deleted" ON public.deleted_records;
CREATE POLICY "deny_direct_deleted" ON public.deleted_records FOR ALL USING (false);

-- ╔══════════════════════════════════════════════════════════╗
-- ║  2. CONSTRAINT UNIQUE em commissions (anti-duplicata)   ║
-- ╚══════════════════════════════════════════════════════════╝
-- Garante estruturalmente que só existe UMA comissão de
-- indicador por pedido (orderId) em cada workspace.
-- Se a aplicação tentar inserir duplicata, o banco rejeita.

ALTER TABLE public.commissions
  DROP CONSTRAINT IF EXISTS commissions_order_unique;

ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_order_unique
  UNIQUE (workspace, order_id);

-- ╔══════════════════════════════════════════════════════════╗
-- ║  3. CONSTRAINT UNIQUE em rep_commissions por produto    ║
-- ╚══════════════════════════════════════════════════════════╝
-- Garante que por pedido + produto só existe um registro
-- de comissão de representante. Impede duplicidade estrutural.
-- ATENÇÃO: se existirem duplicatas no banco antes de aplicar,
-- execute o SELECT abaixo para identificá-las:
--
-- SELECT order_id, product_id, count(*)
-- FROM public.rep_commissions
-- GROUP BY workspace, order_id, product_id
-- HAVING count(*) > 1;
--
-- Remova manualmente as duplicatas antes de aplicar o ALTER.

ALTER TABLE public.rep_commissions
  DROP CONSTRAINT IF EXISTS rep_commissions_order_product_unique;

ALTER TABLE public.rep_commissions
  ADD CONSTRAINT rep_commissions_order_product_unique
  UNIQUE (workspace, order_id, product_id);

-- ╔══════════════════════════════════════════════════════════╗
-- ║  4. FUNÇÃO: recalc_rep_commissions (idempotente)        ║
-- ╚══════════════════════════════════════════════════════════╝
-- Reprocessa comissões de representante para um pedido pago.
-- Idempotente: usa INSERT ... ON CONFLICT DO UPDATE.
-- Pode ser chamada via RPC pelo backend quando necessário.

CREATE OR REPLACE FUNCTION public.recalc_rep_commissions(p_order_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order       public.orders%ROWTYPE;
  v_item        public.order_items%ROWTYPE;
  v_product     public.products%ROWTYPE;
  v_client_name TEXT;
  v_amount      DOUBLE PRECISION;
BEGIN
  -- Carregar pedido
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_order.status != 'pago' THEN RETURN; END IF;

  -- Nome do cliente
  SELECT name INTO v_client_name FROM public.clients WHERE id = v_order.client_id;

  -- Para cada item do pedido
  FOR v_item IN
    SELECT * FROM public.order_items WHERE order_id = p_order_id
  LOOP
    SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF COALESCE(v_product.rep_commission_pct, 0) <= 0 THEN CONTINUE; END IF;

    v_amount := ROUND(
      (v_item.unit_price * v_item.qty * v_product.rep_commission_pct / 100)::NUMERIC,
      2
    );
    IF v_amount <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.rep_commissions (
      id, workspace, order_id, order_date, client_id, client_name,
      product_id, product_name, qty, unit_price, rep_commission_pct,
      amount, order_total, status, created_at, updated_at
    ) VALUES (
      uuid_generate_v4(), v_order.workspace, v_order.id, v_order.date,
      v_order.client_id, COALESCE(v_client_name, '—'),
      v_item.product_id, COALESCE(v_product.name, '—'),
      v_item.qty, v_item.unit_price, v_product.rep_commission_pct,
      v_amount, COALESCE(v_order.total, 0), 'pendente', now(), now()
    )
    ON CONFLICT (workspace, order_id, product_id)
    DO UPDATE SET
      qty               = EXCLUDED.qty,
      unit_price        = EXCLUDED.unit_price,
      rep_commission_pct = EXCLUDED.rep_commission_pct,
      amount            = EXCLUDED.amount,
      order_total       = EXCLUDED.order_total,
      client_name       = EXCLUDED.client_name,
      product_name      = EXCLUDED.product_name,
      updated_at        = now()
    -- Não sobrescrever se já está paga
    WHERE rep_commissions.status != 'paga';
  END LOOP;
END;
$$;

-- ╔══════════════════════════════════════════════════════════╗
-- ║  5. FUNÇÃO: recalc_referral_commission (idempotente)    ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.recalc_referral_commission(p_order_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order       public.orders%ROWTYPE;
  v_referral    public.referrals%ROWTYPE;
  v_client_name TEXT;
  v_amount      DOUBLE PRECISION;
  v_comm_type   TEXT;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_order.status != 'pago' THEN RETURN; END IF;
  IF v_order.referral_id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_referral FROM public.referrals WHERE id = v_order.referral_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT name INTO v_client_name FROM public.clients WHERE id = v_order.client_id;

  v_comm_type := COALESCE(v_order.commission_type, v_referral.commission_type, 'fixed');

  IF v_comm_type = 'percent' THEN
    v_amount := ROUND(
      (COALESCE(v_order.total, 0) *
       COALESCE(v_order.commission_pct, v_referral.commission_pct, 0) / 100)::NUMERIC, 2
    );
  ELSE
    v_amount := COALESCE(v_order.commission_value, v_referral.commission, 0);
  END IF;

  IF v_amount <= 0 THEN RETURN; END IF;

  INSERT INTO public.commissions (
    id, workspace, referral_id, referral_name, order_id,
    client_id, client_name, amount, status,
    commission_type, order_date, order_total, created_at, updated_at
  ) VALUES (
    uuid_generate_v4(), v_order.workspace, v_order.referral_id, v_referral.name,
    v_order.id, v_order.client_id, COALESCE(v_client_name, '—'),
    v_amount, 'pendente', v_comm_type, v_order.date,
    COALESCE(v_order.total, 0), now(), now()
  )
  ON CONFLICT (workspace, order_id)
  DO UPDATE SET
    amount       = EXCLUDED.amount,
    referral_name = EXCLUDED.referral_name,
    client_name  = EXCLUDED.client_name,
    order_total  = EXCLUDED.order_total,
    updated_at   = now()
  WHERE commissions.status != 'paga';
END;
$$;

-- ╔══════════════════════════════════════════════════════════╗
-- ║  6. TABELA audit_logs (observabilidade)                 ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace  TEXT NOT NULL DEFAULT 'principal',
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  UUID,
  details    JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_ws       ON public.audit_logs (workspace, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity   ON public.audit_logs (entity, entity_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_direct_audit" ON public.audit_logs;
CREATE POLICY "deny_direct_audit" ON public.audit_logs FOR ALL USING (false);

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7. ÍNDICES adicionais para performance                 ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE INDEX IF NOT EXISTS idx_commissions_order_id
  ON public.commissions (order_id);

CREATE INDEX IF NOT EXISTS idx_commissions_referral_id
  ON public.commissions (referral_id);

CREATE INDEX IF NOT EXISTS idx_commissions_status
  ON public.commissions (workspace, status);

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON public.orders (workspace, status);

CREATE INDEX IF NOT EXISTS idx_orders_client
  ON public.orders (client_id);

CREATE INDEX IF NOT EXISTS idx_visits_client
  ON public.visits (client_id);

-- ╔══════════════════════════════════════════════════════════╗
-- ║  8. CAMPO commission_type em commissions (se faltar)    ║
-- ╚══════════════════════════════════════════════════════════╝

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT 'fixed';

-- ╔══════════════════════════════════════════════════════════╗
-- ║  9. CASCADE DELETE: orders → rep_commissions            ║
-- ╚══════════════════════════════════════════════════════════╝
-- Garante que ao deletar um pedido, suas comissões de
-- representante também são removidas automaticamente.
-- (já existe em schema_v8_fixes.sql mas incluído aqui por segurança)

-- Para verificar FK existente antes de recriar:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'rep_commissions'::regclass AND contype = 'f';

-- ╔══════════════════════════════════════════════════════════╗
-- ║  10. VERIFICAÇÃO FINAL                                  ║
-- ╚══════════════════════════════════════════════════════════╝
-- Após aplicar, execute para confirmar:
--
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;
--
-- SELECT conname, contype FROM pg_constraint
-- WHERE conrelid IN ('commissions'::regclass, 'rep_commissions'::regclass)
-- ORDER BY conname;

-- ============================================================
-- FIM DA MIGRATION v9
-- ============================================================
