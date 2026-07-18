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
--
-- FK SEMANTICS (strict, R3.1): every foreign key below is verified by child
-- table + child column + referenced schema/table/column + ON DELETE action.
--   exact match  → skipped;
--   no FK        → canonical FK added;
--   MISMATCH     → the wrong FK is dropped and the canonical one added —
--                  metadata-only, safe ONLY because the zero-row preflight
--                  guarantees empty tables. Wrong semantics are never
--                  silently accepted.
-- KNOWN LIVE MISMATCH this reconciles: quotes_client_id_fkey exists live as
-- ON DELETE SET NULL, but the app contract is ON DELETE CASCADE — the
-- DELETE_CLIENT reducer optimistically removes the client's quotes
-- (store.jsx) and api.deleteClient deletes ONLY the client row, relying on
-- DB cascade ("FK cascade removes the client's quotes + their items"). With
-- SET NULL, deleted clients would leave orphan quotes that reappear on
-- reload, diverging from the UI state. Quote documents are client-scoped by
-- product design; transactions (the financial ledger) are the records that
-- SURVIVE client deletion (client_id → set null), matching the reducer,
-- which keeps manual transactions.
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
  fk record;   -- expected FK spec being processed
  mis record;  -- existing mismatched FK constraint on the same column
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

  -- ===================================================================
  -- transactions — add the missing app-contract columns
  -- ===================================================================
  alter table public.transactions add column if not exists user_id    uuid;
  alter table public.transactions add column if not exists client_id  uuid;
  alter table public.transactions add column if not exists updated_at timestamptz not null default now();

  -- ===================================================================
  -- FOREIGN KEYS — strict semantics reconciliation (R3.1).
  -- Each expected FK is matched on child table + child column + referenced
  -- schema/table/column + ON DELETE action ('c' = cascade, 'n' = set null).
  -- Exact match → skip. No FK → add canonical. MISMATCH (e.g. the verified
  -- live quotes_client_id_fkey ON DELETE SET NULL vs. the product-proven
  -- CASCADE) → drop the wrong FK and add the canonical one. This is
  -- metadata-only and safe ONLY because the preflight above guarantees all
  -- three tables are EMPTY. Wrong semantics are never silently accepted.
  -- ===================================================================
  for fk in
    select * from (values
      ('clients',      'user_id',   'auth',   'users',   'id', 'c', 'clients_user_id_fkey'),
      ('quotes',       'user_id',   'auth',   'users',   'id', 'c', 'quotes_user_id_fkey'),
      ('quotes',       'client_id', 'public', 'clients', 'id', 'c', 'quotes_client_id_fkey'),
      ('transactions', 'user_id',   'auth',   'users',   'id', 'c', 'transactions_user_id_fkey'),
      ('transactions', 'client_id', 'public', 'clients', 'id', 'n', 'transactions_client_id_fkey')
    ) as t(child_table, child_col, ref_schema, ref_table, ref_col, del_action, conname)
  loop
    -- exact match: same child column, same referenced schema.table(column),
    -- same ON DELETE action?
    perform 1
      from pg_constraint con
      join pg_class child   on child.oid   = con.conrelid
      join pg_namespace cns on cns.oid     = child.relnamespace
      join pg_class parent  on parent.oid  = con.confrelid
      join pg_namespace pns on pns.oid     = parent.relnamespace
      join pg_attribute ca  on ca.attrelid = con.conrelid  and ca.attnum = con.conkey[1]
      join pg_attribute pa  on pa.attrelid = con.confrelid and pa.attnum = con.confkey[1]
     where con.contype = 'f'
       and cns.nspname = 'public' and child.relname = fk.child_table
       and array_length(con.conkey, 1) = 1
       and ca.attname = fk.child_col
       and pns.nspname = fk.ref_schema and parent.relname = fk.ref_table
       and pa.attname = fk.ref_col
       and con.confdeltype = fk.del_action;
    if found then
      continue; -- canonical FK already in place
    end if;

    -- drop every OTHER foreign key on this child column (wrong target and/or
    -- wrong delete action) — reconciliation under the zero-row guarantee.
    for mis in
      select con.conname
        from pg_constraint con
        join pg_class child   on child.oid   = con.conrelid
        join pg_namespace cns on cns.oid     = child.relnamespace
        join pg_attribute ca  on ca.attrelid = con.conrelid and ca.attnum = any (con.conkey)
       where con.contype = 'f'
         and cns.nspname = 'public' and child.relname = fk.child_table
         and ca.attname = fk.child_col
    loop
      raise notice 'crm_live_schema_contract_repair: replacing mismatched FK %.% (%)', fk.child_table, fk.child_col, mis.conname;
      execute format('alter table public.%I drop constraint %I', fk.child_table, mis.conname);
    end loop;

    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references %I.%I (%I) on delete %s',
      fk.child_table, fk.conname, fk.child_col, fk.ref_schema, fk.ref_table, fk.ref_col,
      case fk.del_action when 'c' then 'cascade' when 'n' then 'set null' end
    );
  end loop;

  -- ownership becomes mandatory (safe: tables verified empty by the preflight)
  alter table public.clients      alter column user_id set not null;
  alter table public.quotes       alter column user_id set not null;
  alter table public.transactions alter column user_id set not null;

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

-- 2b. FK semantics are canonical (esp. quotes.client_id now CASCADE):
--    select child.relname as child_table, ca.attname as child_col,
--           pns.nspname || '.' || parent.relname as references_table,
--           pa.attname as ref_col,
--           case con.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' else con.confdeltype::text end as on_delete
--      from pg_constraint con
--      join pg_class child   on child.oid   = con.conrelid
--      join pg_namespace cns on cns.oid     = child.relnamespace
--      join pg_class parent  on parent.oid  = con.confrelid
--      join pg_namespace pns on pns.oid     = parent.relnamespace
--      join pg_attribute ca  on ca.attrelid = con.conrelid  and ca.attnum = con.conkey[1]
--      join pg_attribute pa  on pa.attrelid = con.confrelid and pa.attnum = con.confkey[1]
--     where con.contype = 'f' and cns.nspname = 'public'
--       and child.relname in ('clients','quotes','transactions')
--     order by child.relname, ca.attname;
--    -- expect exactly 5 rows:
--    --   clients.user_id        → auth.users.id       CASCADE
--    --   quotes.client_id       → public.clients.id   CASCADE   (was SET NULL live)
--    --   quotes.user_id         → auth.users.id       CASCADE
--    --   transactions.client_id → public.clients.id   SET NULL
--    --   transactions.user_id   → auth.users.id       CASCADE

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
