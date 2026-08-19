CREATE TABLE IF NOT EXISTS public.website_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  source TEXT NOT NULL DEFAULT 'website',
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS website_leads_email_source_idx
  ON public.website_leads (email, source);

CREATE TABLE IF NOT EXISTS public.quiz_roadmaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  superpower TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  roadmap JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'digital-superpower-quiz',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'contact-page',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.website_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_roadmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages website leads" ON public.website_leads
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages quiz roadmaps" ON public.quiz_roadmaps
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages contact messages" ON public.contact_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
