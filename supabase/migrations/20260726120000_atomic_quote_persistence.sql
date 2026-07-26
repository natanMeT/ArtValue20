-- ===================================================================
-- Migration: atomic quote persistence — public.save_quote_atomic()
--
-- WHY (confirmed defect, P1 release blocker after PR #108):
--   The frontend quote write flow is NON-ATOMIC. api.createQuote() inserts
--   the quotes parent row first and writeItems() then deletes + inserts
--   quote_items in SEPARATE PostgREST statements. If item persistence fails
--   (network drop, constraint, RLS edge), the parent quote remains persisted
--   WITHOUT its items; an update can likewise delete the old items and fail
--   before inserting the new ones; a retry after a partial create mints a
--   second quote. PR #108 made the UI truthful about failures — this
--   migration makes the WRITE itself all-or-nothing.
--
-- WHAT THIS ADDS (additive only — no table, column, policy, trigger or data
-- change of any kind):
--   * one RPC function public.save_quote_atomic(p_mode, p_quote, p_items)
--     that saves the quote parent AND its complete item snapshot inside a
--     single function invocation. A PostgREST RPC call runs in ONE
--     transaction, and plpgsql guarantees any RAISE aborts the whole
--     invocation — so parent + items succeed together or fail together.
--     No partially persisted quote can remain after an item failure.
--
-- OWNERSHIP / SECURITY MODEL:
--   * SECURITY INVOKER (explicit): the function runs as the calling
--     authenticated role — RLS on public.quotes and public.quote_items
--     ("quotes_own" / "quote_items_own", auth.uid() = user_id) remains
--     ENABLED and AUTHORITATIVE for every statement inside.
--   * user_id is derived from auth.uid() ONLY. A client-supplied user_id
--     inside the payload is never read — a caller cannot write rows owned
--     by anyone else, and every WHERE is additionally pinned to
--     user_id = auth.uid() (defense in depth on top of RLS).
--   * item rows can only reference the quote being saved: quote_id is
--     forced to the validated p_quote id inside the function; any
--     client-supplied quote_id on an item is ignored.
--   * update of a missing or foreign-owned quote fails loudly (RAISE) —
--     RLS makes foreign rows invisible, so both cases surface as the same
--     "not found" error (no cross-account existence disclosure beyond the
--     pre-existing PK-collision semantics of plain inserts).
--   * EXECUTE is granted to authenticated ONLY (revoked from PUBLIC and
--     anon) — no public/anon write path, no service-role dependency.
--   * empty search_path + fully-qualified references (hardening even under
--     INVOKER; no object-shadowing surface).
--   * no dynamic SQL; table/column names are static identifiers.
--
-- SCHEMA COMPATIBILITY (verified live 2026-07-26, read-only):
--   * quotes.id is TEXT (legacy 'qt_...' ids + uuid strings) — p_quote id
--     stays text; existing quote ids remain supported unchanged.
--   * quote_items: id uuid default gen_random_uuid(), quote_id text FK →
--     quotes(id) ON DELETE CASCADE, description/qty/price/position as
--     created by 20260716120000_add_missing_crm_tables.sql.
--   * existing rows need NO rewrite: this migration performs zero data
--     operations (no INSERT/UPDATE/DELETE anywhere at migration time).
--
-- FAIL-LOUD PREFLIGHT (before creating anything):
--   * both tables + the exact key columns/types the function relies on
--     must exist (quotes.id text, quotes.user_id uuid, quote_items.quote_id
--     text, quote_items.user_id uuid);
--   * RLS must be ENABLED on both tables and the ownership policies
--     ("quotes_own", "quote_items_own") must exist — the security model of
--     this function assumes them;
--   * a pre-existing public.save_quote_atomic with a DIFFERENT argument
--     list aborts the migration (never silently replaced / never an
--     ambiguous PostgREST overload). The SAME signature is allowed —
--     CREATE OR REPLACE makes a clean re-run idempotent.
--
-- IDEMPOTENCY: preflight is read-only; CREATE OR REPLACE FUNCTION; REVOKE/
-- GRANT are absolute (not incremental). Re-running the whole file is a
-- clean no-op.
--
-- HOW TO RUN (owner, gated — NOT executed by this repo task):
--   supabase db push   (or Dashboard → SQL Editor → paste → Run)
-- ===================================================================

-- ---------- fail-loud compatibility preflight (read-only) ----------
do $preflight$
declare
  v_bad text;
begin
  -- tables exist
  if to_regclass('public.quotes') is null or to_regclass('public.quote_items') is null then
    raise exception 'save_quote_atomic PREFLIGHT FAILED: public.quotes and/or public.quote_items do not exist. Nothing was changed.';
  end if;

  -- key column types the function's casts + ownership pinning rely on
  select string_agg(exp.tbl || '.' || exp.col || ' expected ' || exp.typ, ', ')
    into v_bad
    from (values
      ('quotes',      'id',      'text'),
      ('quotes',      'user_id', 'uuid'),
      ('quotes',      'client_id', 'uuid'),
      ('quotes',      'valid_days', 'integer'),
      ('quotes',      'vat_rate', 'numeric'),
      ('quotes',      'date',    'date'),
      ('quote_items', 'quote_id', 'text'),
      ('quote_items', 'user_id', 'uuid'),
      ('quote_items', 'qty',     'numeric'),
      ('quote_items', 'price',   'numeric'),
      ('quote_items', 'position', 'integer')
    ) as exp(tbl, col, typ)
    where not exists (
      select 1 from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name  = exp.tbl
         and c.column_name = exp.col
         and c.data_type   = exp.typ
    );
  if v_bad is not null then
    raise exception 'save_quote_atomic PREFLIGHT FAILED: live schema differs from the accepted contract (%). Nothing was changed — do NOT auto-repair; review the live schema first.', v_bad;
  end if;

  -- RLS enabled + ownership policies present (the security model assumes them)
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('quotes', 'quote_items')
      and not c.relrowsecurity
  ) then
    raise exception 'save_quote_atomic PREFLIGHT FAILED: RLS is not enabled on quotes/quote_items. Nothing was changed.';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quotes'      and policyname = 'quotes_own')
  or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_items' and policyname = 'quote_items_own') then
    raise exception 'save_quote_atomic PREFLIGHT FAILED: ownership policies quotes_own/quote_items_own are missing. Nothing was changed.';
  end if;

  -- same-named function with a DIFFERENT signature → abort (never silently replace)
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'save_quote_atomic'
      and pg_get_function_identity_arguments(p.oid) <> 'p_mode text, p_quote jsonb, p_items jsonb'
  ) then
    raise exception 'save_quote_atomic PREFLIGHT FAILED: a function public.save_quote_atomic already exists with a DIFFERENT argument list. Nothing was changed — resolve the conflict manually.';
  end if;
end;
$preflight$;

-- ---------- the atomic RPC ----------
create or replace function public.save_quote_atomic(
  p_mode  text,          -- 'create' | 'update'
  p_quote jsonb,         -- { id, number?, client_id?, date?, valid_days?, vat_rate?, status?, notes? }
  p_items jsonb default null  -- null → keep existing items (update only); array → full replacement snapshot
)
returns void
language plpgsql
security invoker              -- RLS on quotes/quote_items stays authoritative
set search_path = ''          -- hardened: every reference below is fully qualified
as $fn$
declare
  v_uid uuid := auth.uid();   -- ownership derived from the session, NEVER from the payload
  v_id  text;
  it    jsonb;
begin
  -- ---- input contract (fail loud; any RAISE rolls back the whole call) ----
  if v_uid is null then
    raise exception 'save_quote_atomic: not authenticated' using errcode = '28000';
  end if;
  if p_mode is null or p_mode not in ('create', 'update') then
    raise exception 'save_quote_atomic: p_mode must be ''create'' or ''update''' using errcode = '22023';
  end if;
  if p_quote is null or jsonb_typeof(p_quote) <> 'object' then
    raise exception 'save_quote_atomic: p_quote must be a JSON object' using errcode = '22023';
  end if;
  v_id := p_quote->>'id';
  if v_id is null or btrim(v_id) = '' then
    raise exception 'save_quote_atomic: p_quote.id (text) is required' using errcode = '22023';
  end if;
  if p_items is not null then
    if jsonb_typeof(p_items) <> 'array' then
      raise exception 'save_quote_atomic: p_items must be a JSON array or null' using errcode = '22023';
    end if;
    for it in select * from jsonb_array_elements(p_items) loop
      if jsonb_typeof(it) <> 'object'
         or jsonb_typeof(it->'qty')      is distinct from 'number'
         or jsonb_typeof(it->'price')    is distinct from 'number'
         or jsonb_typeof(it->'position') is distinct from 'number'
         or (it ? 'description' and jsonb_typeof(it->'description') not in ('string', 'null')) then
        raise exception 'save_quote_atomic: each item needs numeric qty/price/position and a string description' using errcode = '22023';
      end if;
    end loop;
  end if;
  if p_mode = 'create' and p_items is null then
    -- create always carries the (possibly empty) full snapshot — [] is valid.
    raise exception 'save_quote_atomic: create requires p_items (use [] for no items)' using errcode = '22023';
  end if;

  -- ---- parent write (same invocation = same transaction as the items) ----
  if p_mode = 'create' then
    -- absent optional keys fall back to the schema defaults of quotes
    -- (valid_days 30, vat_rate 18, status 'draft'). A duplicate id raises
    -- unique_violation and rolls the whole call back (retry-safe: the retry
    -- either fully succeeds or fully fails — never a second partial quote).
    insert into public.quotes (id, user_id, number, client_id, date, valid_days, vat_rate, status, notes)
    values (
      v_id,
      v_uid,
      p_quote->>'number',
      (p_quote->>'client_id')::uuid,
      (p_quote->>'date')::date,
      coalesce((p_quote->>'valid_days')::integer, 30),
      coalesce((p_quote->>'vat_rate')::numeric, 18),
      coalesce(p_quote->>'status', 'draft'),
      p_quote->>'notes'
    );
  else
    -- lock + existence/ownership check: RLS hides foreign rows, and the
    -- explicit user_id pin keeps this correct even if policies ever changed.
    perform 1 from public.quotes q
      where q.id = v_id and q.user_id = v_uid
      for update;
    if not found then
      raise exception 'save_quote_atomic: quote % not found for this account', v_id using errcode = 'P0002';
    end if;
    -- partial update: only keys present in p_quote are written (parity with
    -- the previous mapToRow contract); no key → parent row left untouched.
    if p_quote ?| array['number', 'client_id', 'date', 'valid_days', 'vat_rate', 'status', 'notes'] then
      update public.quotes q set
        number     = case when p_quote ? 'number'     then p_quote->>'number'                else q.number     end,
        client_id  = case when p_quote ? 'client_id'  then (p_quote->>'client_id')::uuid     else q.client_id  end,
        date       = case when p_quote ? 'date'       then (p_quote->>'date')::date          else q.date       end,
        valid_days = case when p_quote ? 'valid_days' then (p_quote->>'valid_days')::integer else q.valid_days end,
        vat_rate   = case when p_quote ? 'vat_rate'   then (p_quote->>'vat_rate')::numeric   else q.vat_rate   end,
        status     = case when p_quote ? 'status'     then p_quote->>'status'                else q.status     end,
        notes      = case when p_quote ? 'notes'      then p_quote->>'notes'                 else q.notes      end
      where q.id = v_id and q.user_id = v_uid;
    end if;
  end if;

  -- ---- item snapshot replacement (same transaction as the parent) ----
  -- p_items null (update only) → existing items kept, matching the previous
  -- updateQuote(items === undefined) contract. Any failure below rolls back
  -- the parent write AND the delete — the prior items are never lost to a
  -- failed replacement.
  if p_items is not null then
    delete from public.quote_items where quote_id = v_id and user_id = v_uid;
    insert into public.quote_items (user_id, quote_id, description, qty, price, position)
    select
      v_uid,                                  -- ownership from the session
      v_id,                                   -- forced: items only for THIS quote
      coalesce(elem->>'description', ''),
      (elem->>'qty')::numeric,
      (elem->>'price')::numeric,
      (elem->>'position')::integer
    from jsonb_array_elements(p_items) as elem;
  end if;
end;
$fn$;

comment on function public.save_quote_atomic(text, jsonb, jsonb) is
  'Atomic quote save: parent row + full quote_items snapshot in ONE transaction (any failure rolls back everything). SECURITY INVOKER — RLS quotes_own/quote_items_own stays authoritative; ownership always auth.uid(), never client-supplied.';

-- ---------- grants: authenticated ONLY (no public/anon write path) ----------
revoke all on function public.save_quote_atomic(text, jsonb, jsonb) from public;
revoke all on function public.save_quote_atomic(text, jsonb, jsonb) from anon;
grant execute on function public.save_quote_atomic(text, jsonb, jsonb) to authenticated;

-- ===================================================================
-- VERIFICATION (read-only — run AFTER applying; nothing here writes)
-- ===================================================================
-- 1. Function exists with the exact contract:
--    select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--           p.prosecdef as is_security_definer, p.proconfig
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname = 'save_quote_atomic';
--    -- expect 1 row: args = 'p_mode text, p_quote jsonb, p_items jsonb',
--    --   is_security_definer = false, proconfig = {search_path=}
-- 2. Grants: authenticated may EXECUTE, anon may not:
--    select grantee, privilege_type from information_schema.routine_privileges
--     where routine_schema = 'public' and routine_name = 'save_quote_atomic';
--    -- expect authenticated/EXECUTE (owner rows aside); NO anon, NO PUBLIC.
-- 3. RLS untouched:
--    select tablename, rowsecurity from pg_tables
--     where schemaname = 'public' and tablename in ('quotes', 'quote_items');
-- 4. Behavioral (signed-in): rpc save_quote_atomic with a failing item
--    payload (e.g. qty as a string) must leave ZERO new rows in quotes
--    AND quote_items (atomic rollback), then a corrected retry creates
--    exactly one quote with its items.
