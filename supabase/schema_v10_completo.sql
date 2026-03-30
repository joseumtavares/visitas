-- ============================================================
-- ThermoVisit v10 — Schema Supabase COMPLETO
-- Inclui: todas as tabelas, constraints, índices, RLS,
--         triggers, funções e migrações em sequência segura.
--
-- NOVIDADES v10:
--   • rep_commissions: chave de negócio agora é (workspace, order_id, order_item_id)
--     → comissão ligada ao ITEM do pedido, não só ao produto
--     → elimina problema de mesmo produto 2x no pedido
--   • order_items: coluna `rep_commission_pct` snapshot do percentual no momento da venda
--   • rep_commissions: coluna `order_item_id` (FK → order_items)
--   • rep_commissions: coluna `reprocessed_at` para rastreabilidade
--   • clients: coluna `cep`, `street`, `number`, `complement`, `state`
--   • referrals: colunas de banco e tipo de comissão (já existiam, confirmadas)
--   • audit_logs e deleted_records mantidos
--
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor)
-- Pode ser executado do zero OU em banco existente (IF NOT EXISTS / IF NOT EXISTS em colunas)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ────────────────────────────────────────────────────────────────────────────
-- FUNÇÃO HELPER: updated_at automático
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1. LOOKUP TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.categories (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace   TEXT NOT NULL DEFAULT 'principal',
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.env_types (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace   TEXT NOT NULL DEFAULT 'principal',
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_categories (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace   TEXT NOT NULL DEFAULT 'principal',
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.custom_status_types (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace   TEXT NOT NULL DEFAULT 'principal',
    label       TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. CLIENTES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.clients (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace       TEXT NOT NULL DEFAULT 'principal',
    name            TEXT NOT NULL,
    phone1          TEXT NOT NULL,
    phone2          TEXT,
    category_id     UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    -- Endereço (v10: campos separados para integração ViaCEP)
    cep             TEXT,
    street          TEXT,          -- logradouro (ViaCEP: logradouro)
    number          TEXT,          -- número (preenchido manualmente)
    complement      TEXT,          -- complemento
    neighborhood    TEXT,          -- bairro
    city            TEXT,          -- localidade
    state           TEXT,          -- uf (2 chars)
    address         TEXT,          -- endereço completo (legado / exibição)
    -- Geolocalização
    lat             DOUBLE PRECISION DEFAULT 0,
    lng             DOUBLE PRECISION DEFAULT 0,
    maps_link       TEXT,
    notes           TEXT,
    activity_status JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. AMBIENTES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.environments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace   TEXT NOT NULL DEFAULT 'principal',
    client_id   UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    type_id     UUID REFERENCES public.env_types(id) ON DELETE SET NULL,
    label       TEXT NOT NULL DEFAULT '',
    height      DOUBLE PRECISION,
    width       DOUBLE PRECISION,
    length      DOUBLE PRECISION,
    notes       TEXT,
    estufa_type TEXT DEFAULT 'grampo',
    grampo_qty  INTEGER,
    grampo_size TEXT DEFAULT '28',
    photo_ids   TEXT[]  DEFAULT '{}'::TEXT[],
    furnace     JSONB   DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. PRODUTOS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.products (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace         TEXT NOT NULL DEFAULT 'principal',
    name              TEXT NOT NULL,
    model             TEXT,
    category_id       UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
    dimensions        TEXT,
    color             TEXT,
    price             DOUBLE PRECISION DEFAULT 0,
    rep_commission_pct DOUBLE PRECISION DEFAULT 0,  -- % comissão rep
    notes             TEXT,
    photo_ids         TEXT[] DEFAULT '{}'::TEXT[],
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. VISITAS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.visits (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace    TEXT NOT NULL DEFAULT 'principal',
    client_id    UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    date         TIMESTAMPTZ NOT NULL,
    notes        TEXT,
    next_contact DATE,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. INDICADORES (referrals)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.referrals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace       TEXT NOT NULL DEFAULT 'principal',
    name            TEXT NOT NULL,
    commission      DOUBLE PRECISION DEFAULT 0,     -- valor fixo legado
    commission_type TEXT DEFAULT 'fixed',           -- 'fixed' | 'percent'
    commission_pct  DOUBLE PRECISION DEFAULT 0,     -- % se percent
    cpf             TEXT,
    phone           TEXT,
    bank_name       TEXT,
    bank_agency     TEXT,
    bank_account    TEXT,
    bank_pix        TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. LEADS (pré-cadastros)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.leads (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace            TEXT NOT NULL DEFAULT 'principal',
    name                 TEXT NOT NULL,
    phone                TEXT,
    reference            TEXT,
    referral_id          UUID REFERENCES public.referrals(id) ON DELETE SET NULL,
    referral_name        TEXT,
    lat                  DOUBLE PRECISION DEFAULT 0,
    lng                  DOUBLE PRECISION DEFAULT 0,
    maps_link            TEXT,
    notes                TEXT,
    status               TEXT DEFAULT 'active',
    converted_client_id  UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 8. PEDIDOS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.orders (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace        TEXT NOT NULL DEFAULT 'principal',
    client_id        UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    env_id           UUID REFERENCES public.environments(id) ON DELETE SET NULL,
    date             TIMESTAMPTZ NOT NULL,
    payment_type     TEXT NOT NULL,
    installments     INTEGER,
    fin_status       TEXT DEFAULT 'pendente',
    referral_id      UUID REFERENCES public.referrals(id) ON DELETE SET NULL,
    referral_name    TEXT,
    status           TEXT NOT NULL DEFAULT 'pendente',  -- 'pendente'|'pago'|'cancelado'
    notes            TEXT,
    total            DOUBLE PRECISION DEFAULT 0,
    -- Comissão do indicador (snapshot no pedido)
    commission_type  TEXT DEFAULT 'fixed',
    commission_value DOUBLE PRECISION DEFAULT 0,
    commission_pct   DOUBLE PRECISION DEFAULT 0,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 9. ITENS DE PEDIDO
--    v10: inclui rep_commission_pct como snapshot
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_items (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace          TEXT NOT NULL DEFAULT 'principal',
    order_id           UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id         UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name       TEXT,
    qty                INTEGER NOT NULL DEFAULT 1,
    unit_price         DOUBLE PRECISION NOT NULL DEFAULT 0,
    -- v10: snapshot do percentual no momento da venda (não depender do produto atual)
    rep_commission_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 10. COMISSÕES DO INDICADOR
-- ============================================================

CREATE TABLE IF NOT EXISTS public.commissions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace       TEXT NOT NULL DEFAULT 'principal',
    referral_id     UUID REFERENCES public.referrals(id) ON DELETE CASCADE,
    referral_name   TEXT,
    order_id        UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    client_id       UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    client_name     TEXT,
    amount          DOUBLE PRECISION NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pendente',  -- 'pendente'|'paga'
    commission_type TEXT DEFAULT 'fixed',
    order_date      TIMESTAMPTZ,
    order_total     DOUBLE PRECISION DEFAULT 0,
    receipt_photo_ids TEXT[] DEFAULT '{}'::TEXT[],
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    -- ── CONSTRAINT: 1 comissão por pedido por workspace ─────────────────
    CONSTRAINT commissions_order_unique UNIQUE (workspace, order_id)
);

-- ============================================================
-- 11. COMISSÕES DO REPRESENTANTE
--     v10: chave de negócio = (workspace, order_item_id)
--          Cada ITEM do pedido gera 1 comissão
--          Mantém retrocompatibilidade com (order_id, product_id)
--          via índice único separado
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rep_commissions (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace          TEXT NOT NULL DEFAULT 'principal',
    -- Referências
    order_id           UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    order_item_id      UUID REFERENCES public.order_items(id) ON DELETE CASCADE,
    -- Dados do pedido
    order_date         TIMESTAMPTZ,
    client_id          UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    client_name        TEXT,
    -- Dados do produto (snapshot — não depende do produto atual)
    product_id         UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name       TEXT,
    qty                INTEGER NOT NULL DEFAULT 1,
    unit_price         DOUBLE PRECISION NOT NULL DEFAULT 0,
    rep_commission_pct DOUBLE PRECISION NOT NULL DEFAULT 0,   -- snapshot %
    amount             DOUBLE PRECISION NOT NULL DEFAULT 0,   -- calculado
    order_total        DOUBLE PRECISION DEFAULT 0,
    -- Controle de status
    status             TEXT NOT NULL DEFAULT 'pendente',  -- 'pendente'|'paga'
    paid_at            TIMESTAMPTZ,
    receipt_photo_ids  TEXT[] DEFAULT '{}'::TEXT[],
    -- Rastreabilidade
    reprocessed_at     TIMESTAMPTZ,       -- última vez que foi reprocessada
    reprocess_reason   TEXT,              -- motivo do reprocessamento
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now(),

    -- ── CONSTRAINT DE NEGÓCIO: 1 comissão por item do pedido ────────────
    -- Chave principal: order_item_id (quando disponível)
    CONSTRAINT rep_commissions_item_unique UNIQUE (workspace, order_item_id),

    -- ── CONSTRAINT LEGADO: 1 comissão por (pedido + produto) ─────────────
    -- Usado como fallback quando order_item_id é NULL (dados migrados)
    CONSTRAINT rep_commissions_order_product_unique UNIQUE (workspace, order_id, product_id)
);

-- ============================================================
-- 12. EMPRESA (singleton por workspace)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.company_settings (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace    TEXT NOT NULL UNIQUE DEFAULT 'principal',
    name         TEXT, cnpj TEXT, phone TEXT,
    bank_name    TEXT, bank_agency TEXT, bank_account TEXT, bank_pix TEXT,
    address      TEXT,
    tiktok TEXT, facebook TEXT, instagram TEXT, x TEXT, linkedin TEXT,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 13. REPRESENTANTE (singleton por workspace)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.representative_settings (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace TEXT NOT NULL UNIQUE DEFAULT 'principal',
    name      TEXT,
    cities    TEXT[] DEFAULT '{}'::TEXT[],
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 14. TOMBSTONE — soft-delete para sync
-- ============================================================

CREATE TABLE IF NOT EXISTS public.deleted_records (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace    TEXT NOT NULL DEFAULT 'principal',
    table_name   TEXT NOT NULL,
    record_id    UUID NOT NULL,
    deleted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT deleted_records_unique UNIQUE (workspace, table_name, record_id)
);

-- ============================================================
-- 15. AUDIT LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace  TEXT NOT NULL DEFAULT 'principal',
    action     TEXT NOT NULL,
    entity     TEXT,
    entity_id  UUID,
    details    JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- MIGRATION SEGURA: adicionar colunas que podem não existir
-- (Idempotente — seguro rodar em banco existente)
-- ============================================================

-- Clientes: novos campos de endereço separados (ViaCEP)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cep         TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS street      TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS number      TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS complement  TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS state       TEXT;

-- order_items: snapshot do % de comissão
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS rep_commission_pct DOUBLE PRECISION NOT NULL DEFAULT 0;

-- rep_commissions: nova FK para order_item_id
ALTER TABLE public.rep_commissions ADD COLUMN IF NOT EXISTS order_item_id    UUID REFERENCES public.order_items(id) ON DELETE CASCADE;
ALTER TABLE public.rep_commissions ADD COLUMN IF NOT EXISTS reprocessed_at   TIMESTAMPTZ;
ALTER TABLE public.rep_commissions ADD COLUMN IF NOT EXISTS reprocess_reason TEXT;
ALTER TABLE public.rep_commissions ADD COLUMN IF NOT EXISTS receipt_photo_ids TEXT[] DEFAULT '{}'::TEXT[];

-- commissions: receipt_photo_ids e commission_type (se faltar)
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS receipt_photo_ids TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS commission_type   TEXT DEFAULT 'fixed';

-- Constraint única de comissão de indicador (idempotente)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'commissions_order_unique'
        AND conrelid = 'public.commissions'::regclass
    ) THEN
        ALTER TABLE public.commissions
            ADD CONSTRAINT commissions_order_unique UNIQUE (workspace, order_id);
    END IF;
END $$;

-- Constraint única de comissão de representante por item (idempotente)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rep_commissions_item_unique'
        AND conrelid = 'public.rep_commissions'::regclass
    ) THEN
        ALTER TABLE public.rep_commissions
            ADD CONSTRAINT rep_commissions_item_unique UNIQUE (workspace, order_item_id);
    END IF;
END $$;

-- ============================================================
-- ÍNDICES
-- ============================================================

-- Lookup tables
CREATE INDEX IF NOT EXISTS idx_categories_ws          ON public.categories (workspace);
CREATE INDEX IF NOT EXISTS idx_env_types_ws           ON public.env_types (workspace);
CREATE INDEX IF NOT EXISTS idx_product_categories_ws  ON public.product_categories (workspace);
CREATE INDEX IF NOT EXISTS idx_custom_status_ws       ON public.custom_status_types (workspace);

-- Clientes
CREATE INDEX IF NOT EXISTS idx_clients_ws             ON public.clients (workspace);
CREATE INDEX IF NOT EXISTS idx_clients_name           ON public.clients (workspace, name);

-- Ambientes
CREATE INDEX IF NOT EXISTS idx_environments_client    ON public.environments (client_id);
CREATE INDEX IF NOT EXISTS idx_environments_ws        ON public.environments (workspace);

-- Produtos
CREATE INDEX IF NOT EXISTS idx_products_ws            ON public.products (workspace);

-- Visitas
CREATE INDEX IF NOT EXISTS idx_visits_client          ON public.visits (client_id);
CREATE INDEX IF NOT EXISTS idx_visits_ws              ON public.visits (workspace);
CREATE INDEX IF NOT EXISTS idx_visits_date            ON public.visits (workspace, date DESC);

-- Indicadores
CREATE INDEX IF NOT EXISTS idx_referrals_ws           ON public.referrals (workspace);

-- Leads
CREATE INDEX IF NOT EXISTS idx_leads_ws               ON public.leads (workspace);

-- Pedidos
CREATE INDEX IF NOT EXISTS idx_orders_client          ON public.orders (client_id);
CREATE INDEX IF NOT EXISTS idx_orders_ws              ON public.orders (workspace);
CREATE INDEX IF NOT EXISTS idx_orders_status          ON public.orders (workspace, status);
CREATE INDEX IF NOT EXISTS idx_orders_date            ON public.orders (workspace, date DESC);

-- Itens de pedido
CREATE INDEX IF NOT EXISTS idx_order_items_order      ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_ws         ON public.order_items (workspace);
CREATE INDEX IF NOT EXISTS idx_order_items_product    ON public.order_items (product_id);

-- Comissões do indicador
CREATE INDEX IF NOT EXISTS idx_commissions_ws         ON public.commissions (workspace);
CREATE INDEX IF NOT EXISTS idx_commissions_order_id   ON public.commissions (order_id);
CREATE INDEX IF NOT EXISTS idx_commissions_referral   ON public.commissions (referral_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status     ON public.commissions (workspace, status);

-- Comissões do representante
CREATE INDEX IF NOT EXISTS idx_rep_comm_ws            ON public.rep_commissions (workspace);
CREATE INDEX IF NOT EXISTS idx_rep_comm_order         ON public.rep_commissions (order_id);
CREATE INDEX IF NOT EXISTS idx_rep_comm_item          ON public.rep_commissions (order_item_id);
CREATE INDEX IF NOT EXISTS idx_rep_comm_status        ON public.rep_commissions (workspace, status);
CREATE INDEX IF NOT EXISTS idx_rep_comm_date          ON public.rep_commissions (workspace, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_rep_comm_product       ON public.rep_commissions (workspace, product_id);

-- Tombstone
CREATE INDEX IF NOT EXISTS idx_deleted_records_ws     ON public.deleted_records (workspace, table_name);

-- Audit
CREATE INDEX IF NOT EXISTS idx_audit_logs_ws          ON public.audit_logs (workspace, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity      ON public.audit_logs (entity, entity_id);

-- ============================================================
-- TRIGGERS: updated_at
-- ============================================================

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories','env_types','product_categories','custom_status_types',
    'clients','environments','products','visits','referrals','leads',
    'orders','order_items','commissions','rep_commissions',
    'company_settings','representative_settings'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s;
       CREATE TRIGGER trg_%1$s_updated_at
         BEFORE UPDATE ON public.%1$s
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();', t);
  END LOOP;
END $$;

-- ============================================================
-- ROW LEVEL SECURITY
-- Acesso APENAS via backend Vercel (service_role bypassa RLS)
-- Bloqueamos acesso direto do frontend (anon key)
-- ============================================================

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories','env_types','product_categories','custom_status_types',
    'clients','environments','products','visits','referrals','leads',
    'orders','order_items','commissions','rep_commissions',
    'company_settings','representative_settings',
    'deleted_records','audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%1$s ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "deny_direct" ON public.%1$s;', t);
    EXECUTE format(
      'CREATE POLICY "deny_direct" ON public.%1$s FOR ALL USING (false);', t);
  END LOOP;
END $$;

-- ============================================================
-- FUNÇÕES STORED: reprocessamento (executadas pelo backend via RPC)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- FUNÇÃO: recalc_rep_commissions_v10
-- Reprocessa comissões de representante para um pedido pago.
-- Idempotente. Usa order_item_id como chave primária de negócio.
-- Preserva comissões com status = 'paga'.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalc_rep_commissions_v10(p_order_id UUID)
RETURNS TABLE(item_id UUID, product_name TEXT, amount DOUBLE PRECISION, action TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order       public.orders%ROWTYPE;
  v_item        public.order_items%ROWTYPE;
  v_product     public.products%ROWTYPE;
  v_client_name TEXT;
  v_pct         DOUBLE PRECISION;
  v_amount      DOUBLE PRECISION;
  v_action      TEXT;
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
    -- Percentual: usa snapshot do item; fallback no produto atual
    v_pct := COALESCE(
      NULLIF(v_item.rep_commission_pct, 0),
      (SELECT rep_commission_pct FROM public.products WHERE id = v_item.product_id),
      0
    );
    IF v_pct <= 0 THEN CONTINUE; END IF;

    -- Nome do produto
    SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;

    v_amount := ROUND(
      (v_item.unit_price * v_item.qty * v_pct / 100)::NUMERIC, 2
    );
    IF v_amount <= 0 THEN CONTINUE; END IF;

    -- Inserir ou atualizar (somente pendentes)
    INSERT INTO public.rep_commissions (
      id, workspace, order_id, order_item_id,
      order_date, client_id, client_name,
      product_id, product_name,
      qty, unit_price, rep_commission_pct,
      amount, order_total,
      status, reprocessed_at, created_at, updated_at
    ) VALUES (
      uuid_generate_v4(),
      v_order.workspace,
      v_order.id,
      v_item.id,
      v_order.date,
      v_order.client_id,
      COALESCE(v_client_name, '—'),
      v_item.product_id,
      COALESCE(v_product.name, v_item.product_name, '—'),
      v_item.qty, v_item.unit_price, v_pct,
      v_amount, COALESCE(v_order.total, 0),
      'pendente', now(), now(), now()
    )
    ON CONFLICT (workspace, order_item_id)
    DO UPDATE SET
      qty                = EXCLUDED.qty,
      unit_price         = EXCLUDED.unit_price,
      rep_commission_pct = EXCLUDED.rep_commission_pct,
      amount             = EXCLUDED.amount,
      order_total        = EXCLUDED.order_total,
      client_name        = EXCLUDED.client_name,
      product_name       = EXCLUDED.product_name,
      reprocessed_at     = now(),
      reprocess_reason   = 'reprocess_manual',
      updated_at         = now()
    WHERE rep_commissions.status != 'paga'
    RETURNING 'updated' INTO v_action;

    item_id      := v_item.id;
    product_name := COALESCE(v_product.name, v_item.product_name, '—');
    amount       := v_amount;
    action       := COALESCE(v_action, 'skipped_paid');
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- FUNÇÃO: recalc_referral_commission (indicador, inalterada)
-- ────────────────────────────────────────────────────────────
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
    amount        = EXCLUDED.amount,
    referral_name = EXCLUDED.referral_name,
    client_name   = EXCLUDED.client_name,
    order_total   = EXCLUDED.order_total,
    updated_at    = now()
  WHERE commissions.status != 'paga';
END;
$$;

-- ────────────────────────────────────────────────────────────
-- FUNÇÃO: cleanup_orphan_rep_commissions
-- Remove comissões pendentes cujos itens de pedido foram removidos
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_orphan_rep_commissions(p_workspace TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.rep_commissions rc
  WHERE rc.workspace = p_workspace
    AND rc.status = 'pendente'
    AND rc.order_item_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.order_items oi WHERE oi.id = rc.order_item_id
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- VERIFICAÇÃO FINAL
-- Após executar, confirme:
--
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' ORDER BY table_name;
--
-- SELECT conname, contype FROM pg_constraint
-- WHERE conrelid IN (
--   'commissions'::regclass,
--   'rep_commissions'::regclass,
--   'order_items'::regclass
-- ) ORDER BY conname;
-- ============================================================
