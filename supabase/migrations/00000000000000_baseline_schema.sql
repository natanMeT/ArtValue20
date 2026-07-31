-- ===================================================================
-- BASELINE (schema provenance repair) — THE REBUILD PATH.
--
-- WHY THIS FILE EXISTS. Before it, `supabase/migrations/**` could NOT rebuild
-- this database from zero: MEASURED 2026-07-31 by replaying every migration
-- against an empty Supabase-shaped Postgres, **9 of 14 failed**, the first with
-- `relation "public.quotes" does not exist`. The migrations were authored
-- against an ALREADY-LIVE database whose base objects lived only in
-- `supabase/schema.sql`, and one live table — `public.profile` — was in
-- NEITHER artifact. Applying `schema.sql` first changed the result to 13 of 14,
-- which isolated the cause to exactly two things, with no third hiding behind
-- them: the missing baseline, and the missing `public.profile`.
--
-- WHAT THIS FILE IS. `supabase/schema.sql` verbatim, plus `public.profile` at
-- its exact live shape. With it in place the set replays to **15 of 15**.
--
-- AUTHORITY MODEL (owner decision 2026-07-31):
--   * `supabase/migrations/**` is the SINGLE rebuild path. This file is its
--     starting point.
--   * `supabase/schema.sql` is RETAINED as a historical copy and is
--     deliberately UNCHANGED by this slice. It is no longer the rebuild path.
--     It was not deleted: that is a separate decision, not a side effect.
--
-- ⚠️ HOW THIS FILE REACHES AN EXISTING PROJECT: **IT DOES NOT RUN THERE.**
-- On the already-live project it is registered with
--     supabase migration repair --status applied <version> --linked
-- which writes ONLY the migration-history table. **`supabase db push` must
-- NEVER be used to deliver this file to a project that already has these
-- objects.** The statements below are idempotent, but the policy block is
-- drop-then-create — pushing it would leave live tables momentarily without a
-- policy. The safety here is the ORDER, not the SQL.
--
-- This file therefore executes in exactly one situation: a rebuild from zero
-- (`supabase db reset`, a fresh project, a local stack, disaster recovery).
--
-- SCOPE: additive + idempotent ONLY. No DROP TABLE, no DELETE, no data
-- migration. Everything below `-- >>> BEGIN schema.sql` is byte-for-byte
-- `supabase/schema.sql`, guarded by a contract test so the two cannot drift
-- silently.
-- ===================================================================

-- >>> BEGIN schema.sql (byte-for-byte; guarded by baselineSchemaMigration.test.js)
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
-- NOTE (R1.1 type contract): quotes.id is TEXT, not uuid. The LIVE production
-- table was created with text ids (verified: information_schema data_type =
-- text) because the app treats quote ids as opaque strings — legacy local-mode
-- ids were prefixed strings like 'qt_...' (store.jsx uid('qt')), and current
-- ids are crypto.randomUUID() strings, both of which fit text. Any child FK
-- (quote_items.quote_id) MUST also be text: a uuid child column cannot
-- reference a text parent (Postgres error 42804). Never "fix" this back to
-- uuid without migrating the live table first.
create table if not exists public.quotes (
  id         text primary key default (gen_random_uuid()::text),
  user_id    uuid not null references auth.users (id) on delete cascade,
  number     text,
  -- ON DELETE CASCADE is the PRODUCT-PROVEN semantic (R3.1): DELETE_CLIENT in
  -- store.jsx optimistically removes the client's quotes, and api.deleteClient
  -- deletes only the client row, relying on this cascade ("FK cascade removes
  -- the client's quotes + their items"). SET NULL would resurrect orphan
  -- quotes on reload. Financial history that must SURVIVE client deletion
  -- lives in transactions (client_id → on delete set null), not here.
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
  quote_id    text not null references public.quotes (id) on delete cascade,  -- text: must match quotes.id (see note above)
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

-- ---- live-production compatibility (R3, 2026-07-17) ----
-- The LIVE clients/quotes/transactions tables predate this canonical file and
-- carry legacy extras the current app neither reads nor writes:
--   clients.pipeline_stage, clients.project_value,
--   quotes.items / quotes.subtotal / quotes.vat / quotes.total.
-- Those are intentionally NOT part of this fresh-database schema. The
-- versioned migration supabase/migrations/20260717090000_crm_live_schema_
-- contract_repair.sql repairs the live tables IN PLACE (adds the missing
-- app-contract columns above + per-user ownership RLS, guarded by a
-- zero-row preflight) while leaving the legacy columns untouched. This file
-- remains the contract for a FRESH database; the migration is the contract
-- for the existing live one. quotes.id stays TEXT in both (see note above).

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

-- ===================================================================
-- AI GATEWAY USAGE LOG — privacy-safe, server-written observability.
--
-- One row per terminal AI Gateway outcome. Written ONLY by the Edge
-- Function using the service-role key (which bypasses RLS). There is
-- deliberately NO insert/update/delete policy, so no anon/authenticated
-- client can forge or inflate usage. Users may read only their own rows.
--
-- CONTENT-FREE BY DESIGN: this table has no column that can hold a raw
-- prompt, payload, system instruction, chat message, response/result
-- text, API key, or secret. Only counts (prompt_chars/result_chars),
-- classifications, and a planning cost ESTIMATE are stored.
-- ===================================================================
create table if not exists public.ai_usage (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  user_id            uuid null references auth.users (id) on delete set null,
  request_id         text not null,
  action_type        text not null,
  provider           text null,
  model              text null,
  cost_tier          text null,
  estimated_cost_usd numeric null,
  is_estimate        boolean not null default true,
  status             text not null,
  http_status        integer null,
  error_code         text null,
  prompt_chars       integer null,
  result_chars       integer null
);

create index if not exists idx_ai_usage_created   on public.ai_usage (created_at);
create index if not exists idx_ai_usage_user      on public.ai_usage (user_id);
create index if not exists idx_ai_usage_action    on public.ai_usage (action_type);
create index if not exists idx_ai_usage_provider  on public.ai_usage (provider);
create index if not exists idx_ai_usage_status    on public.ai_usage (status);
create index if not exists idx_ai_usage_request   on public.ai_usage (request_id);

alter table public.ai_usage enable row level security;

-- Read-only self access (usage rows are written server-side via the
-- service role, which bypasses RLS). No write policy is defined on
-- purpose: anon/authenticated clients can neither insert nor tamper.
drop policy if exists "ai_usage_self_read" on public.ai_usage;
create policy "ai_usage_self_read" on public.ai_usage
  for select using (auth.uid() = user_id);

-- ===================================================================
-- AI BUDGET GUARD — atomic pre-provider rate + estimated-spend counters.
--
-- Concurrency state ONLY — never content. This table holds fixed-window
-- counters (per-user minute/day/month + a global month) used by the atomic
-- public.reserve_ai_budget RPC to APPROVE + RESERVE a request BEFORE any paid
-- Gemini call. reserved_estimated_usd is a conservative PLANNING ESTIMATE, not
-- actual billing. No prompt / payload / response / system instruction / schema
-- / suggestion / reason / priority / key / token / email is ever stored here.
--
-- Writes happen ONLY through the SECURITY DEFINER RPC, invoked ONLY by the
-- service role (RLS is enabled with NO client policy; the RPC has EXECUTE
-- granted to service_role only). A signed-in client can neither read/write the
-- table directly nor call the RPC to consume counters without a real request.
-- ===================================================================
create table if not exists public.ai_budget_counters (
  owner_type             text not null,
  owner_key              text not null,
  window_kind            text not null,
  window_start           timestamptz not null,
  request_count          integer not null default 0,
  reserved_estimated_usd numeric not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint ai_budget_counters_pk primary key (owner_type, owner_key, window_kind, window_start),
  constraint ai_budget_counters_owner_type_chk  check (owner_type in ('user', 'global')),
  constraint ai_budget_counters_window_kind_chk check (window_kind in ('minute', 'day', 'month')),
  constraint ai_budget_counters_request_count_chk check (request_count >= 0),
  constraint ai_budget_counters_reserved_chk    check (reserved_estimated_usd >= 0),
  constraint ai_budget_counters_owner_key_chk   check (
    (owner_type = 'global' and owner_key = 'global')
    or (owner_type = 'user' and length(owner_key) > 0)
  )
);

-- No extra index: the composite primary key already serves every lookup the
-- RPC performs (full key), and its leading columns cover owner prefix scans.

-- RLS on, with NO policy of any kind: anon/authenticated clients get no direct
-- read or write. Only the service role (which bypasses RLS) touches the table,
-- and only through the RPC below.
alter table public.ai_budget_counters enable row level security;

-- Atomic reserve-before-provider budget guard.
--
-- SECURITY DEFINER + empty search_path (every reference fully schema-qualified;
-- built-ins resolve from pg_catalog). Uses DATABASE time only. Validates every
-- input. No dynamic SQL. Does NOT use auth.uid() — the RPC is invoked by the
-- service-role client, so the trusted user UUID is passed as p_user_id and is
-- trusted ONLY because EXECUTE is service_role-only. Returns nothing about
-- current usage / remaining / limits / totals.
--
-- Atomicity: one transaction. Ensures the four counter rows exist, then LOCKS
-- them FOR UPDATE in a fixed deterministic order (global month → user month →
-- user day → user minute) to reduce deadlock risk, reads while locked,
-- evaluates every limit BEFORE modifying any counter, and only if all pass
-- increments all four counters atomically. A SELECT-then-unprotected-INSERT is
-- never used.
create or replace function public.reserve_ai_budget(
  p_user_id uuid,
  p_request_id text,
  p_action_type text,
  p_estimated_cost_usd numeric,
  p_rate_per_minute integer,
  p_user_daily_limit_usd numeric,
  p_user_monthly_limit_usd numeric,
  p_global_monthly_limit_usd numeric
)
returns table (allowed boolean, reason text, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now      timestamptz := now();                       -- database clock only
  v_minute   timestamptz := date_trunc('minute', v_now);
  v_day      timestamptz := date_trunc('day', v_now);
  v_month    timestamptz := date_trunc('month', v_now);
  v_user     text        := p_user_id::text;
  v_cost     numeric     := coalesce(p_estimated_cost_usd, 0);
  v_rate     integer     := coalesce(p_rate_per_minute, 0);
  v_ud       numeric     := coalesce(p_user_daily_limit_usd, 0);
  v_um       numeric     := coalesce(p_user_monthly_limit_usd, 0);
  v_gm       numeric     := coalesce(p_global_monthly_limit_usd, 0);
  v_gm_used  numeric;
  v_um_used  numeric;
  v_ud_used  numeric;
  v_min_cnt  integer;
  v_retry    integer;
begin
  -- Validate identity inputs. Raising here surfaces to the caller as an RPC
  -- error, which the Edge Function maps to fail-closed 'unavailable'.
  if p_user_id is null or p_request_id is null or p_action_type is null then
    raise exception 'reserve_ai_budget: missing required input';
  end if;
  if v_cost < 0 then v_cost := 0; end if;
  if v_rate < 0 then v_rate := 0; end if;

  -- Ensure the four counter rows exist (idempotent), inserted in the same
  -- deterministic order used for locking below.
  insert into public.ai_budget_counters (owner_type, owner_key, window_kind, window_start)
  values
    ('global', 'global', 'month',  v_month),
    ('user',   v_user,   'month',  v_month),
    ('user',   v_user,   'day',    v_day),
    ('user',   v_user,   'minute', v_minute)
  on conflict (owner_type, owner_key, window_kind, window_start) do nothing;

  -- Lock the four rows (fixed order above) and read the current values.
  select c.reserved_estimated_usd into v_gm_used
    from public.ai_budget_counters c
    where c.owner_type = 'global' and c.owner_key = 'global'
      and c.window_kind = 'month' and c.window_start = v_month
    for update;

  select c.reserved_estimated_usd into v_um_used
    from public.ai_budget_counters c
    where c.owner_type = 'user' and c.owner_key = v_user
      and c.window_kind = 'month' and c.window_start = v_month
    for update;

  select c.reserved_estimated_usd into v_ud_used
    from public.ai_budget_counters c
    where c.owner_type = 'user' and c.owner_key = v_user
      and c.window_kind = 'day' and c.window_start = v_day
    for update;

  select c.request_count into v_min_cnt
    from public.ai_budget_counters c
    where c.owner_type = 'user' and c.owner_key = v_user
      and c.window_kind = 'minute' and c.window_start = v_minute
    for update;

  -- Evaluate every limit BEFORE modifying any counter.
  -- 1. User fixed-minute request rate.
  if v_min_cnt + 1 > v_rate then
    v_retry := greatest(1, ceil(extract(epoch from ((v_minute + interval '1 minute') - v_now)))::integer);
    return query select false, 'rate_limited', v_retry;
    return;
  end if;
  -- 2. User daily estimated spend.
  if v_ud_used + v_cost > v_ud then
    return query select false, 'budget_exceeded', null::integer;
    return;
  end if;
  -- 3. User monthly estimated spend.
  if v_um_used + v_cost > v_um then
    return query select false, 'budget_exceeded', null::integer;
    return;
  end if;
  -- 4. Global monthly estimated spend.
  if v_gm_used + v_cost > v_gm then
    return query select false, 'budget_exceeded', null::integer;
    return;
  end if;

  -- All limits pass → increment all four locked counters atomically.
  update public.ai_budget_counters as c
    set request_count = c.request_count + 1,
        reserved_estimated_usd = c.reserved_estimated_usd + v_cost,
        updated_at = v_now
    where (c.owner_type, c.owner_key, c.window_kind, c.window_start) in (
      ('global', 'global', 'month',  v_month),
      ('user',   v_user,   'month',  v_month),
      ('user',   v_user,   'day',    v_day),
      ('user',   v_user,   'minute', v_minute)
    );

  return query select true, 'approved', null::integer;
end;
$$;

-- EXECUTE is service_role-ONLY: revoke from everyone else so a signed-in
-- client can never call the RPC directly to consume counters.
revoke execute on function public.reserve_ai_budget(uuid, text, text, numeric, integer, numeric, numeric, numeric) from public;
revoke execute on function public.reserve_ai_budget(uuid, text, text, numeric, integer, numeric, numeric, numeric) from anon;
revoke execute on function public.reserve_ai_budget(uuid, text, text, numeric, integer, numeric, numeric, numeric) from authenticated;
grant  execute on function public.reserve_ai_budget(uuid, text, text, numeric, integer, numeric, numeric, numeric) to service_role;
-- <<< END schema.sql

-- ===================================================================
-- >>> BEGIN public.profile — the object that existed in NO repo artifact.
--
-- A LEGACY SINGLETON that predates the migration history. It was live in the
-- database while being absent from both `schema.sql` and every migration, so
-- `20260719100000_profile_rls_lockdown.sql` — which fails CLOSED when the table
-- is missing — could never replay. That migration is the reason this block
-- exists, and this block is why it can now run.
--
-- SHAPE IS MEASURED, NOT DESIGNED. Every column, default, the primary key and
-- the `id = 1` singleton CHECK were read from the live database on 2026-07-31.
-- Nothing here is an improvement on what is live: this file's job is to
-- RECONSTRUCT, not to redesign.
--
-- ⚠️ RLS IS ENABLED WITH **ZERO POLICIES**, DELIBERATELY. That is not an
-- oversight and must not be "fixed" by adding one. Zero policies means zero
-- client access: `anon` and `authenticated` are denied everything regardless of
-- their table grants, while `service_role` and the owner bypass RLS. Inventing
-- a policy here would WIDEN access on a table that currently grants none — the
-- exact outcome `profile_rls_lockdown` was written to prevent.
--
-- Table grants are deliberately NOT restated. On a fresh project Supabase's
-- default privileges grant `anon`/`authenticated` the same broad set they hold
-- live; RLS with no policy — not the grant — is the control here.
-- ===================================================================
create table if not exists public.profile (
  id            integer primary key default 1,
  full_name     text default ''::text,
  email         text default ''::text,
  phone         text default ''::text,
  business_name text default 'ArtValue'::text,
  business_id   text default ''::text,
  address       text default ''::text
);

-- the singleton guarantee: exactly one row is addressable
alter table public.profile drop constraint if exists profile_id_check;
alter table public.profile add  constraint profile_id_check check (id = 1);

alter table public.profile enable row level security;
-- NO `create policy` here. See the warning above.
-- <<< END public.profile
