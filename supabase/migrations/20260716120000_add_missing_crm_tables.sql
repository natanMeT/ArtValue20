-- ===================================================================
-- Migration: add missing CRM tables — public.quote_items + public.outreach_leads
--
-- WHY: the live project (weciwurjfwmqihcyexzj) is missing these two tables
-- (verified read-only: /rest/v1/quote_items and /rest/v1/outreach_leads → 404
-- while clients/quotes/transactions/ai_usage → 200). Their absence makes the
-- frontend fetchAll() throw on every signed-in load, so CRM data stays empty.
--
-- SOURCE OF TRUTH: every definition below is copied VERBATIM from
-- supabase/schema.sql (the canonical single runnable script). This migration
-- adds ONLY the two missing tables + their canonical indexes, the
-- outreach_leads updated_at trigger (and its helper function dependency),
-- RLS enablement, and the two ownership policies. Nothing else.
--
-- SAFETY / IDEMPOTENCY:
--   * create table IF NOT EXISTS / create index IF NOT EXISTS /
--     add column IF NOT EXISTS — re-running never fails or rewrites data.
--   * create OR REPLACE function — byte-identical to the canonical helper
--     already live (used by clients/quotes/transactions triggers).
--   * drop trigger/policy IF EXISTS immediately before recreating the SAME
--     canonical object — metadata only; no table data is ever touched.
--   * No DROP TABLE, no DELETE, no UPDATE of data, no change to any
--     existing table, function signature, grant, or setting.
--
-- HOW TO RUN (owner, gated): Supabase Dashboard → SQL Editor → paste → Run.
-- (Also valid as a CLI migration: supabase/migrations/ timestamped file.)
-- ===================================================================

-- ---------------- dependency: updated_at helper (canonical, already live) ----------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---- quote_items (line items) — verbatim from supabase/schema.sql ----
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

-- ---- outreach_leads (cold-prospect worklist) — verbatim from supabase/schema.sql ----
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

-- ---- compatibility column for re-runs on a pre-existing outreach_leads ----
alter table public.outreach_leads add column if not exists need text;

-- ---------------- indexes (canonical) ----------------
create index if not exists idx_quote_items_quote on public.quote_items (quote_id);
create index if not exists idx_leads_user        on public.outreach_leads (user_id);

-- ---------------- updated_at trigger (outreach_leads only — quote_items has no updated_at) ----------------
drop trigger if exists trg_leads_updated on public.outreach_leads;
create trigger trg_leads_updated before update on public.outreach_leads
  for each row execute function public.set_updated_at();

-- ===================================================================
-- ROW LEVEL SECURITY — a user can only touch rows where user_id = auth.uid()
-- ===================================================================
alter table public.quote_items    enable row level security;
alter table public.outreach_leads enable row level security;

drop policy if exists "quote_items_own"    on public.quote_items;
drop policy if exists "outreach_leads_own" on public.outreach_leads;

create policy "quote_items_own" on public.quote_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "outreach_leads_own" on public.outreach_leads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===================================================================
-- VERIFICATION (read-only — run these AFTER the migration; expect the
-- results noted on each line; none of these statements modify anything)
-- ===================================================================

-- 1. Both tables exist (each returns the qualified name, not NULL):
--    select to_regclass('public.quote_items')    as quote_items,
--           to_regclass('public.outreach_leads') as outreach_leads;

-- 2. RLS is enabled on both (rowsecurity = true for both rows):
--    select tablename, rowsecurity from pg_tables
--     where schemaname = 'public'
--       and tablename in ('quote_items', 'outreach_leads');

-- 3. The two ownership policies exist with the canonical qual/check:
--    select tablename, policyname, cmd, qual, with_check from pg_policies
--     where schemaname = 'public'
--       and policyname in ('quote_items_own', 'outreach_leads_own');
--    -- expect both rows: cmd = ALL,
--    --   qual       = (auth.uid() = user_id)
--    --   with_check = (auth.uid() = user_id)

-- 4. Ownership behavior (authenticated users see ONLY their own rows):
--    as the signed-in app user, /rest/v1/quote_items?select=id&limit=1 and
--    /rest/v1/outreach_leads?select=id&limit=1 now return HTTP 200 (empty
--    list until rows exist) instead of 404; rows inserted by user A are
--    invisible to user B (RLS qual auth.uid() = user_id on ALL commands).

-- 5. Frontend confirmation: reload the app while signed in — fetchAll()
--    completes (no console 404s) and the Dashboard/Quotes/Outreach pages
--    load CRM data with meta.source = 'supabase'.
