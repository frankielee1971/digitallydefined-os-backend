-- Hermes Optimization Loop storage
create table if not exists public.optimization_signals (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  event text default 'page',
  page text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists optimization_signals_user_idx on public.optimization_signals (user_id);
create index if not exists optimization_signals_event_idx on public.optimization_signals (event);

create table if not exists public.user_clusters (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  cluster_key text,
  cluster jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);
create index if not exists user_clusters_user_idx on public.user_clusters (user_id);

create table if not exists public.generated_assets (
  id uuid primary key default gen_random_uuid(),
  type text,
  mcp text,
  payload jsonb default '{}'::jsonb,
  status text default 'draft',
  created_at timestamptz default now()
);

create table if not exists public.personalization (
  id uuid primary key default gen_random_uuid(),
  user_id text unique,
  data jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);
create index if not exists personalization_user_idx on public.personalization (user_id);

create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  period date,
  report jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists weekly_reports_period_idx on public.weekly_reports (period);

alter table public.optimization_signals enable row level security;
alter table public.user_clusters enable row level security;
alter table public.generated_assets enable row level security;
alter table public.personalization enable row level security;
alter table public.weekly_reports enable row level security;
