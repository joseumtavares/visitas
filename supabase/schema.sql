-- ============================================================
-- ThermoVisit v5 — Schema Supabase
-- Modelo com 15 tabelas. Cada tabela inclui coluna `workspace`
-- para isolar dados de diferentes instalações do app.
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ── 1. LOOKUP TABLES ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.categories (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace   TEXT NOT NULL DEFAULT 'principal',
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (id, workspace)
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

-- ── 2. CLIENTES ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.clients (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace       TEXT NOT NULL DEFAULT 'principal',
    name            TEXT NOT NULL,
    phone1          TEXT NOT NULL,
    phone2          TEXT,
    category_id     UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    city            TEXT,
    neighborhood    TEXT,
    address         TEXT,
    lat             DOUBLE PRECISION DEFAULT 0,
    lng             DOUBLE PRECISION DEFAULT 0,
    maps_link       TEXT,
    notes           TEXT,
    activity_status JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ── 3. AMBIENTES ──────────────────────────────────────────────────────────────

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

-- ── 4. PRODUTOS ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.products (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace   TEXT NOT NULL DEFAULT 'principal',
    name        TEXT NOT NULL,
    model       TEXT,
    category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
    dimensions  TEXT,
    color       TEXT,
    price       DOUBLE PRECISION DEFAULT 0,
    notes       TEXT,
    photo_ids   TEXT[] DEFAULT '{}'::TEXT[],
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 5. VISITAS ────────────────────────────────────────────────────────────────

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

-- ── 6. INDICADORES ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.referrals (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace   TEXT NOT NULL DEFAULT 'principal',
    name        TEXT NOT NULL,
    commission  DOUBLE PRECISION DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 7. LEADS ──────────────────────────────────────────────────────────────────

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
    status               TEXT DEFAULT 'active',
    converted_client_id  UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now()
);

-- ── 8. PEDIDOS ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.orders (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace     TEXT NOT NULL DEFAULT 'principal',
    client_id     UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    env_id        UUID REFERENCES public.environments(id) ON DELETE SET NULL,
    date          TIMESTAMPTZ NOT NULL,
    payment_type  TEXT NOT NULL,
    installments  INTEGER,
    fin_status    TEXT DEFAULT 'pendente',
    referral_id   UUID REFERENCES public.referrals(id) ON DELETE SET NULL,
    referral_name TEXT,
    status        TEXT NOT NULL DEFAULT 'pendente',
    notes         TEXT,
    total         DOUBLE PRECISION DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ── 9. ITENS DE PEDIDO ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_items (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace    TEXT NOT NULL DEFAULT 'principal',
    order_id     UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id   UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT,
    qty          INTEGER NOT NULL DEFAULT 1,
    unit_price   DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ── 10. COMISSÕES ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.commissions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace     TEXT NOT NULL DEFAULT 'principal',
    referral_id   UUID REFERENCES public.referrals(id) ON DELETE CASCADE,
    referral_name TEXT,
    order_id      UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    client_id     UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    client_name   TEXT,
    amount        DOUBLE PRECISION NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'pendente',
    created_at    TIMESTAMPTZ DEFAULT now(),
    paid_at       TIMESTAMPTZ,
    order_date    TIMESTAMPTZ,
    order_total   DOUBLE PRECISION DEFAULT 0,
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ── 11. EMPRESA (singleton por workspace) ─────────────────────────────────────

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

-- ── 12. REPRESENTANTE (singleton por workspace) ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.representative_settings (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace TEXT NOT NULL UNIQUE DEFAULT 'principal',
    name      TEXT,
    cities    TEXT[] DEFAULT '{}'::TEXT[],
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── ÍNDICES ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_categories_ws          ON public.categories (workspace);
CREATE INDEX IF NOT EXISTS idx_env_types_ws           ON public.env_types (workspace);
CREATE INDEX IF NOT EXISTS idx_product_categories_ws  ON public.product_categories (workspace);
CREATE INDEX IF NOT EXISTS idx_custom_status_ws       ON public.custom_status_types (workspace);
CREATE INDEX IF NOT EXISTS idx_clients_ws             ON public.clients (workspace);
CREATE INDEX IF NOT EXISTS idx_environments_client    ON public.environments (client_id);
CREATE INDEX IF NOT EXISTS idx_environments_ws        ON public.environments (workspace);
CREATE INDEX IF NOT EXISTS idx_products_ws            ON public.products (workspace);
CREATE INDEX IF NOT EXISTS idx_visits_client          ON public.visits (client_id);
CREATE INDEX IF NOT EXISTS idx_visits_ws              ON public.visits (workspace);
CREATE INDEX IF NOT EXISTS idx_referrals_ws           ON public.referrals (workspace);
CREATE INDEX IF NOT EXISTS idx_leads_ws               ON public.leads (workspace);
CREATE INDEX IF NOT EXISTS idx_orders_client          ON public.orders (client_id);
CREATE INDEX IF NOT EXISTS idx_orders_ws              ON public.orders (workspace);
CREATE INDEX IF NOT EXISTS idx_order_items_order      ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_ws         ON public.order_items (workspace);
CREATE INDEX IF NOT EXISTS idx_commissions_ws         ON public.commissions (workspace);

-- ── TRIGGERS updated_at ───────────────────────────────────────────────────────

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories','env_types','product_categories','custom_status_types',
    'clients','environments','products','visits','referrals','leads',
    'orders','order_items','commissions','company_settings','representative_settings'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s;
       CREATE TRIGGER trg_%1$s_updated_at
         BEFORE UPDATE ON public.%1$s
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();', t);
  END LOOP;
END $$;

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────────────
-- Acesso APENAS via backend Vercel (service_role key bypassa RLS).
-- Bloqueamos acesso direto do frontend (anon key).

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories','env_types','product_categories','custom_status_types',
    'clients','environments','products','visits','referrals','leads',
    'orders','order_items','commissions','company_settings','representative_settings'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%1$s ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "deny_direct" ON public.%1$s;', t);
    EXECUTE format(
      'CREATE POLICY "deny_direct" ON public.%1$s FOR ALL USING (false);', t);
  END LOOP;
END $$;

-- ── VERIFICAÇÃO FINAL ─────────────────────────────────────────────────────────
-- Após executar, confirme que as tabelas existem:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' ORDER BY table_name;
