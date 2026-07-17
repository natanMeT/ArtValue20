-- ===================================================================
-- Migration: LIVE CRM schema contract + RLS repair (R3)
--            public.clients / public.quotes / public.transactions
--
-- WHY (verified in production):
--   * Creating a client fails with PGRST204 — the live clients table is
--     missing app-contract columns (user_id, value, source, project_type, …).
--     The live clients/quotes/transactions tables predate the canonical
--     supabase/schema.sql and were created with a different, legacy shape.
--   * SECURITY: all three tables have RLS enabled but carry a single
--     PERMISSIVE PUBLIC policy ("Service role full access": roles public,
--     cmd ALL, USING true, WITH CHECK true). That is NOT service-role-only —
--     it grants every anon/authenticated client full access. The Supabase
--     service role BYPASSES RLS entirely, so it needs no policy at all;
--     this migration drops the permissive policy and installs the canonical
--     per-user ownership policies (auth.uid() = user_id).
--
-- WHAT THIS DOES (in place — no table is dropped, recreated or renamed):
--   * clients:      + user_id (uuid, NOT NULL, FK auth.users, cascade),
--                   + value / source / project_type / updated_at
--   * quotes:       + user_id (as above), + number / valid_days / vat_rate /
--                   notes / updated_at, + FK client_id → clients(id) cascade
--   * transactions: + user_id (as above), + client_id (uuid, FK clients(id)
--                   on delete set null), + updated_at
--   * updated_at triggers + canonical user/client indexes for all three
--   * replaces the 3 unsafe public policies with clients_own / quotes_own /
--     transactions_own (FOR ALL USING + WITH CHECK auth.uid() = user_id)
--   * legacy columns are PRESERVED untouched: clients.pipeline_stage,
--     clients.project_value, quotes.items / subtotal / vat / total. They all
--     have defaults (or are nullable), so app inserts that omit them succeed.
--   * quotes.id stays TEXT (never altered) — quote_items.quote_id text keeps
--     matching it. quote_items / outreach_leads are NOT touched: their
--     contract, RLS and ownership policies were verified correct.
--
-- FAIL-CLOSED ZERO-ROW PRECONDITION:
--   The owner verified all three tables contain ZERO rows, which is what
--   makes adding NOT NULL user_id safe without guessing/backfilling an
--   owner. If ANY row exists in clients, quotes or transactions when this
--   runs, the preflight RAISEs and — because the whole migration is a
--   single DO block (one statement, one transaction) — NO schema or policy
--   change is applied at all.
--
-- IDEMPOTENCY: add column IF NOT EXISTS; FK constraints added only when no
--   FK already covers that column; create index IF NOT EXISTS; drop trigger/
--   policy IF EXISTS before identical recreation; SET NOT NULL is a no-op
--   when already set. Re-running after a successful run (tables still empty)
--   is a clean no-op. After real data exists the preflight aborts — by
--   design, this repair is only valid on empty tables.
--
-- HOW TO RUN (owner, gated): Supabase Dashboard → SQL Editor → paste the
-- whole file → Run. Expected: "Success. No rows returned."
-- ===================================================================

do $mig$
declare
  v_rows bigint;
begin
  -- ---------- PREFLIGHT: abort before ANY change if any row exists ----------
  select (select count(*) from public.clients)
       + (select count(*) from public.quotes)
       + (select count(*) from public.transactions)
    into v_rows;
  if v_rows > 0 then
    raise exception
      'crm_live_schema_contract_repair PREFLIGHT FAILED: clients/quotes/transactions must be EMPTY (found % row(s)). Nothing was changed — do NOT backfill ownership by guessing; review the data first.',
      v_rows;
  end if;

  -- ---------- updated_at helper (canonical, idempotent) ----------
  create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
  as $set$
  begin
    new.updated_at = now();
    return new;
  end;
  $set$;

  -- ===================================================================
  -- clients — add the missing app-contract columns (legacy columns kept)
  -- ===================================================================
  alter table public.clients add column if not exists user_id      uuid;
  alter table public.clients add column if not exists value        numeric not null default 0;
  alter table public.clients add column if not exists source       text;
  alter table public.clients add column if not exists project_type text;
  alter table public.clients add column if not exists updated_at   timestamptz not null default now();

  if not exists (
    select 1
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.clients'::regclass and con.contype = 'f' and att.attname = 'user_id'
  ) then
    alter table public.clients add constraint clients_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
  alter table public.clients alter column user_id set not null;  -- safe: table verified empty

  -- ===================================================================
  -- quotes — add the missing app-contract columns (id stays TEXT; legacy
  -- items/subtotal/vat/total kept untouched)
  -- ===================================================================
  alter table public.quotes add column if not exists user_id    uuid;
  alter table public.quotes add column if not exists number     text;
  alter table public.quotes add column if not exists valid_days integer default 30;
  alter table public.quotes add column if not exists vat_rate   numeric default 18;
  alter table public.quotes add column if not exists notes      text;
  alter table public.quotes add column if not exists updated_at timestamptz not null default now();

  if not exists (
    select 1
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.quotes'::regclass and con.contype = 'f' and att.attname = 'user_id'
  ) then
    alter table public.quotes add constraint quotes_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
  if not exists (
    select 1
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.quotes'::regclass and con.contype = 'f' and att.attname = 'client_id'
  ) then
    alter table public.quotes add constraint quotes_client_id_fkey
      foreign key (client_id) references public.clients (id) on delete cascade;
  end if;
  alter table public.quotes alter column user_id set not null;  -- safe: table verified empty

  -- ===================================================================
  -- transactions — add the missing app-contract columns
  -- ===================================================================
  alter table public.transactions add column if not exists user_id    uuid;
  alter table public.transactions add column if not exists client_id  uuid;
  alter table public.transactions add column if not exists updated_at timestamptz not null default now();

  if not exists (
    select 1
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.transactions'::regclass and con.contype = 'f' and att.attname = 'user_id'
  ) then
    alter table public.transactions add constraint transactions_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
  if not exists (
    select 1
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.transactions'::regclass and con.contype = 'f' and att.attname = 'client_id'
  ) then
    alter table public.transactions add constraint transactions_client_id_fkey
      foreign key (client_id) references public.clients (id) on delete set null;
  end if;
  alter table public.transactions alter column user_id set not null;  -- safe: table verified empty

  -- ---------- canonical indexes ----------
  create index if not exists idx_clients_user  on public.clients (user_id);
  create index if not exists idx_quotes_user   on public.quotes (user_id);
  create index if not exists idx_quotes_client on public.quotes (client_id);
  create index if not exists idx_tx_user       on public.transactions (user_id);

  -- ---------- canonical updated_at triggers ----------
  drop trigger if exists trg_clients_updated on public.clients;
  create trigger trg_clients_updated before update on public.clients
    for each row execute function public.set_updated_at();

  drop trigger if exists trg_quotes_updated on public.quotes;
  create trigger trg_quotes_updated before update on public.quotes
    for each row execute function public.set_updated_at();

  drop trigger if exists trg_tx_updated on public.transactions;
  create trigger trg_tx_updated before update on public.transactions
    for each row execute function public.set_updated_at();

  -- ===================================================================
  -- RLS — remove the unsafe permissive public policies and install the
  -- canonical per-user ownership policies. The service role bypasses RLS,
  -- so NO service-role policy is recreated (none is needed).
  -- ===================================================================
  alter table public.clients      enable row level security;
  alter table public.quotes       enable row level security;
  alter table public.transactions enable row level security;

  drop policy if exists "Service role full access" on public.clients;
  drop policy if exists "Service role full access" on public.quotes;
  drop policy if exists "Service role full access" on public.transactions;

  drop policy if exists "clients_own"      on public.clients;
  drop policy if exists "quotes_own"       on public.quotes;
  drop policy if exists "transactions_own" on public.transactions;

  create policy "clients_own" on public.clients
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

  create policy "quotes_own" on public.quotes
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

  create policy "transactions_own" on public.transactions
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
end;
$mig$;

-- ===================================================================
-- VERIFICATION (read-only — run AFTER the migration; nothing here writes)
-- ===================================================================

-- 1. Row counts are still zero (the repair added no data):
--    select (select count(*) from public.clients)      as clients,
--           (select count(*) from public.quotes)       as quotes,
--           (select count(*) from public.transactions) as transactions;

-- 2. Required app-contract columns exist with the right types:
--    select table_name, column_name, data_type, is_nullable, column_default
--      from information_schema.columns
--     where table_schema = 'public'
--       and (table_name, column_name) in (
--         ('clients','user_id'), ('clients','value'), ('clients','source'),
--         ('clients','project_type'), ('clients','updated_at'),
--         ('quotes','user_id'), ('quotes','number'), ('quotes','valid_days'),
--         ('quotes','vat_rate'), ('quotes','notes'), ('quotes','updated_at'),
--         ('transactions','user_id'), ('transactions','client_id'),
--         ('transactions','updated_at'))
--     order by table_name, column_name;
--    -- expect all 14 rows; user_id rows NOT NULL / uuid.

-- 3. The unsafe permissive policy is GONE and ownership policies are in place:
--    select tablename, policyname, cmd, qual, with_check from pg_policies
--     where schemaname = 'public'
--       and tablename in ('clients','quotes','transactions','quote_items','outreach_leads')
--     order by tablename;
--    -- expect EXACTLY one policy per table, named <table>_own, cmd = ALL,
--    --   qual = (auth.uid() = user_id), with_check = (auth.uid() = user_id);
--    -- 'Service role full access' must not appear anywhere.

-- 4. RLS still enabled on all five CRM tables:
--    select tablename, rowsecurity from pg_tables
--     where schemaname = 'public'
--       and tablename in ('clients','quotes','transactions','quote_items','outreach_leads');

-- 5. App-level: sign in → create a client → expect HTTP 201 (row saved, no
--    PGRST204); reload → client list loads (200). A SECOND user must see an
--    empty list (ownership). Quotes + transactions create paths are now
--    structurally ready (same contract). No prompt/content/secrets are
--    logged anywhere by this flow.
