-- ============================================================
-- DigitallyDefined Analytics Pipeline — Tables + RLS
-- Supabase project ref: dijjlppdljpcgyoakdnq
--
-- Tables created: events, leads, sessions, funnels, assets, products
--
-- Access model:
--   service_role  -> FULL read/write (used by the `analytics` Edge
--                    Function and the dashboard backend).
--   anon          -> may INSERT events/leads/sessions so the
--                    lightweight website tracker can write
--                    directly over PostgREST; anon can NEVER read.
-- ============================================================

-- ---------- 1. EVENTS ------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
  id          BIGSERIAL PRIMARY KEY,
  event_type  TEXT        NOT NULL,   -- page_view|cta_click|form_submit|quiz_start|quiz_complete|product_interest|scroll_depth|session_start|session_end
  page        TEXT        NOT NULL DEFAULT '/',
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  session_id  TEXT,
  user_id     TEXT,
  url         TEXT,
  referrer    TEXT,
  user_agent  TEXT,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS events_type_idx          ON public.events (event_type, created_at);
CREATE INDEX IF NOT EXISTS events_session_idx       ON public.events (session_id);
CREATE INDEX IF NOT EXISTS events_page_created_idx  ON public.events (page, created_at);

-- ---------- 2. LEADS -------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT        NOT NULL,
  name        TEXT,
  source_page TEXT        NOT NULL DEFAULT '/',
  funnel_step TEXT        NOT NULL DEFAULT 'top',
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  session_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS leads_email_idx    ON public.leads (email);
CREATE INDEX IF NOT EXISTS leads_created_idx  ON public.leads (created_at);
CREATE INDEX IF NOT EXISTS leads_funnel_idx   ON public.leads (funnel_step);

-- ---------- 3. SESSIONS -----------------------------------------
CREATE TABLE IF NOT EXISTS public.sessions (
  id           TEXT PRIMARY KEY,
  user_agent   TEXT,
  referrer     TEXT,
  source       TEXT,
  start_time   TIMESTAMPTZ,
  end_time     TIMESTAMPTZ,
  duration_ms  BIGINT,
  page_views   INT          NOT NULL DEFAULT 0,
  last_page    TEXT,
  is_bounce    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 4. FUNNELS -----------------------------------------
CREATE TABLE IF NOT EXISTS public.funnels (
  id          BIGSERIAL PRIMARY KEY,
  funnel_name TEXT        NOT NULL,
  step        TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'entered', -- entered|completed|abandoned
  session_id  TEXT,
  email       TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS funnels_name_step_idx ON public.funnels (funnel_name, step, created_at);

-- ---------- 5. ASSETS -----------------------------------------
CREATE TABLE IF NOT EXISTS public.assets (
  id                 BIGSERIAL PRIMARY KEY,
  asset_name         TEXT           NOT NULL,
  asset_type         TEXT           NOT NULL DEFAULT 'page', -- page|tool|quiz|pdf|product
  views              BIGINT         NOT NULL DEFAULT 0,
  clicks             BIGINT         NOT NULL DEFAULT 0,
  conversions        BIGINT         NOT NULL DEFAULT 0,
  engagement_seconds BIGINT         NOT NULL DEFAULT 0,
  metadata           JSONB          NOT NULL DEFAULT '{}'::jsonb,
  updated_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS assets_name_idx ON public.assets (asset_name);

-- ---------- 6. PRODUCTS ---------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id             BIGSERIAL PRIMARY KEY,
  product_name   TEXT    NOT NULL,
  category       TEXT    NOT NULL DEFAULT 'digital',
  interest_count BIGINT  NOT NULL DEFAULT 0,
  views          BIGINT  NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS products_name_idx ON public.products (product_name);
-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnels  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- service_role / supabase_admin bypass RLS by default, so the
-- `analytics` edge function and dashboard backend can always
-- read/write. Explicit policies below keep behavior predictable
-- and grant anon INSERT for website capture without exposing reads.

-- ---------- EVENTS ----------
CREATE POLICY "service_role manages events" ON public.events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon may insert events" ON public.events
  FOR INSERT TO anon WITH CHECK (true);

-- ---------- LEADS ----------
CREATE POLICY "service_role manages leads" ON public.leads
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon may insert leads" ON public.leads
  FOR INSERT TO anon WITH CHECK (true);

-- ---------- SESSIONS ----------
CREATE POLICY "service_role manages sessions" ON public.sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon may insert sessions" ON public.sessions
  FOR INSERT TO anon WITH CHECK (true);

-- ---------- FUNNELS ----------
CREATE POLICY "service_role manages funnels" ON public.funnels
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- ASSETS ----------
CREATE POLICY "service_role manages assets" ON public.assets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- PRODUCTS ----------
CREATE POLICY "service_role manages products" ON public.products
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- UPDATED_AT TRIGGER (products, assets, sessions)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_set_updated_at ON public.products;
CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS assets_set_updated_at ON public.assets;
CREATE TRIGGER assets_set_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();