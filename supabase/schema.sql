-- ===================================================================
-- Art Value — Supabase schema (Postgres)
-- Single runnable script. Paste into: Supabase Dashboard → SQL Editor → Run.
-- Safe to re-run (idempotent: IF NOT EXISTS / DROP ... IF EXISTS).
-- Row Level Security is enabled so each user sees ONLY their own rows.
-- ===================================================================

create extension if not exists pgcrypto;

-- ---------------- updated_at helper ----------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ===================================================================
-- TABLES
-- ===================================================================

-- ---- clients ----
create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  contact      text,
  phone        text,
  email        text,
  status       text not null default 'lead',   -- lead | active | completed | lost
  value        numeric not null default 0,
  date         date,
  source       text,
  project_type text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---- quotes ----
create table if not exists public.quotes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  number     text,
  client_id  uuid references public.clients (id) on delete cascade,
  date       date,
  valid_days integer default 30,
  vat_rate   numeric default 18,
  status     text not null default 'draft',   -- draft | sent | viewed | accepted | rejected
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---- quote_items (line items) ----
create table if not exists public.quote_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  quote_id    uuid not null references public.quotes (id) on delete cascade,
  description text,
  qty         numeric not null default 1,
  price       numeric not null default 0,
  position    integer default 0,
  created_at  timestamptz not null default now()
);

-- ---- transactions ----
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  type        text not null default 'income',  -- income | expense
  amount      numeric not null default 0,
  category    text,
  date        date,
  description text,
  client_id   uuid references public.clients (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---- outreach_leads (cold-prospect worklist) ----
create table if not exists public.outreach_leads (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  category   text not null,
  need       text,                              -- tailored business need / pitch direction
  status     text not null default 'pending',  -- pending | contacted | irrelevant
  client_id  uuid references public.clients (id) on delete set null,  -- link to CRM client once contacted
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---- migrations for re-runs on existing tables ----
alter table public.outreach_leads add column if not exists need text;

-- ---------------- indexes ----------------
create index if not exists idx_clients_user      on public.clients (user_id);
create index if not exists idx_quotes_user       on public.quotes (user_id);
create index if not exists idx_quotes_client     on public.quotes (client_id);
create index if not exists idx_quote_items_quote on public.quote_items (quote_id);
create index if not exists idx_tx_user           on public.transactions (user_id);
create index if not exists idx_leads_user        on public.outreach_leads (user_id);

-- ---------------- updated_at triggers ----------------
drop trigger if exists trg_clients_updated on public.clients;
create trigger trg_clients_updated before update on public.clients
  for each row execute function public.set_updated_at();

drop trigger if exists trg_quotes_updated on public.quotes;
create trigger trg_quotes_updated before update on public.quotes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_tx_updated on public.transactions;
create trigger trg_tx_updated before update on public.transactions
  for each row execute function public.set_updated_at();

drop trigger if exists trg_leads_updated on public.outreach_leads;
create trigger trg_leads_updated before update on public.outreach_leads
  for each row execute function public.set_updated_at();

-- ===================================================================
-- ROW LEVEL SECURITY — a user can only touch rows where user_id = auth.uid()
-- ===================================================================

alter table public.clients        enable row level security;
alter table public.quotes         enable row level security;
alter table public.quote_items    enable row level security;
alter table public.transactions   enable row level security;
alter table public.outreach_leads enable row level security;

drop policy if exists "clients_own"        on public.clients;
drop policy if exists "quotes_own"         on public.quotes;
drop policy if exists "quote_items_own"    on public.quote_items;
drop policy if exists "transactions_own"   on public.transactions;
drop policy if exists "outreach_leads_own" on public.outreach_leads;

create policy "clients_own" on public.clients
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "quotes_own" on public.quotes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "quote_items_own" on public.quote_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "transactions_own" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "outreach_leads_own" on public.outreach_leads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
