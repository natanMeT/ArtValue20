-- ===================================================================
-- Migration (F1 — Core Receivables, slice 1): expected billing vs. money that
-- actually arrived.
--
-- WHAT THIS ADDS
--   public.charges   -- one expected billing event (deposit / partial / final),
--                       with payment terms, a due date, an optional invoice link
--                       and an open/cancelled lifecycle.
--   public.payments  -- money actually received against a charge. THE SOURCE OF
--                       TRUTH for received revenue. Nothing in the product
--                       creates an income `transaction` for a payment, in either
--                       direction, so the system itself never records one
--                       receipt twice. (It cannot stop a PERSON entering the
--                       same receipt through both forms; the screen reports the
--                       two parts separately and steers charge-backed money to
--                       the payment path. Linking a transaction to a charge is a
--                       later product decision -- see L6.)
--
-- AND IT HARDENS WHAT WAS ALREADY HERE. Five relationships between user-owned
-- tables become COMPOSITE, same-owner foreign keys in this one migration:
--   quotes       (client_id, user_id) -> clients (id, user_id)  ON DELETE CASCADE
--   transactions (client_id, user_id) -> clients (id, user_id)  ON DELETE SET NULL (client_id)
--   charges      (client_id, user_id) -> clients (id, user_id)  ON DELETE SET NULL (client_id)
--   charges      (quote_id,  user_id) -> quotes  (id, user_id)  ON DELETE SET NULL (quote_id)
--   payments     (charge_id, user_id) -> charges (id, user_id)  ON DELETE CASCADE
--
-- WHY RLS IS NOT ENOUGH FOR A RELATIONSHIP, stated once for all five.
--   A foreign key is checked BY THE SYSTEM, not through RLS. RLS hiding account
--   B's client from account A's SELECT does NOT stop A from REFERENCING it: A
--   only needs the id. A single-column FK therefore permits a durable pointer
--   from A's data into B's. Carrying user_id INTO the key makes that
--   structurally impossible -- A's rows always carry A's user_id, so only A's
--   parents can ever satisfy the pair. This is the same lesson Campaigns slice 2
--   applied to tasks.campaign_id; here it is applied to the money.
--
-- WHY THE COLUMN LIST ON SET NULL IS LOAD-BEARING.
--   A bare `on delete set null` nulls EVERY column of the key -- including
--   user_id, which is NOT NULL on all three child tables. Every delete of a
--   client (or quote) that had children would then fail with a not-null
--   violation, months later, in production. `set null (client_id)` nulls the
--   link ALONE and leaves ownership intact. PG15+ syntax; the live project is
--   17.6 (verified before this file was written, and asserted below).
--
-- WHY quotes KEEPS CASCADE AND transactions KEEPS SET NULL.
--   That is the EXISTING product contract (20260717090000), and this migration
--   preserves it byte for byte: quote documents are client-scoped and go with
--   the client; the financial ledger SURVIVES client deletion. Changing a delete
--   action while widening a key would be two decisions hiding inside one.
--   charges follow the ledger: money owed is not erased by deleting a contact.
--
-- PAYMENT STATUS IS DERIVED AND HAS NO COLUMN.
--   paid = received >= total, partially_paid = 0 < received < total,
--   expected = received = 0. There is deliberately NO status column on
--   public.charges: a stored status is a second copy of a rule, free to drift
--   from the amounts nobody can dispute. The assertion block below FAILS if such
--   a column is ever added here.
--
-- DUE DATE = end of the SERVICE month + 0/30/60/90 days.
--   Worked control, pinned in the client mirror and its tests:
--   service 2026-02-15 with net60 -> end of month 2026-02-28 -> +60 -> 2026-04-29.
--   `due_date_source` records whether the stored value was computed or typed by
--   hand, so the screen can say which one the user is looking at instead of
--   silently recomputing over an override.
--
-- NO QUOTAS, NO COUNTERS. Neither table gets a row quota and this migration
-- declares NO SECURITY DEFINER function. The quota pattern exists for objects
-- with an unbounded free-tier cost (assets, campaigns); a receivable is a record
-- of real money and capping it would refuse the business's own revenue.
--
-- SCOPE: additive + idempotent + self-verifying. No DROP TABLE, no DELETE, no
-- UPDATE of data, no INSERT. The ONLY destructive operations are the two exact,
-- catalog-verified single-column FK constraints replaced by their composite
-- equivalents -- each proven to be the expected constraint before it is dropped,
-- and each preserving its existing ON DELETE action. Events, Organizations and
-- module flags are NOT part of this slice.
--
-- HOW TO RUN (owner-gated): Supabase Dashboard -> SQL Editor -> paste -> Run,
--   or as this timestamped CLI migration. NEVER run by the app.
--
-- DECLARED LIMITATIONS (known, accepted, NOT fixed here):
--   L1 Overpayment is permitted. A CHECK cannot sum a child table, so nothing
--      stops payments exceeding amount_total. The client clamps the balance at
--      zero and surfaces the surplus; it is a recorded fact, not a refusal.
--   L2 MATCH SIMPLE. A NULL client_id / quote_id skips its FK check entirely.
--      That IS the optionality: a charge may exist without a quote, and must
--      survive its client being deleted.
--   L3 Lifecycle has no TRANSITION trigger. open <-> cancelled is symmetric and
--      loses nothing, so the CHECK domain is the whole rule for the charge
--      itself. (Campaigns needed one because its graph is directed and terminal;
--      this one is not.) The separate rule that a CANCELLED charge may not
--      receive a payment IS enforced server-side, by
--      trg_payments_reject_cancelled on public.payments.
--   L4 No account-deletion cleanup beyond `on delete cascade` on user_id.
--   L5 tasks.client_id remains a SINGLE-COLUMN FK. It is outside this slice's
--      approved file/scope list and is reported, not fixed here.
--   L6 A transaction cannot be linked to a charge, so a user who records the
--      same receipt through BOTH forms is double-counted in "actual revenue".
--      The system never does this to itself; only a person can. Enforcing one
--      entry path -- or adding transactions.charge_id -- is a product decision
--      beyond this slice. The screen reports payments and income transactions as
--      separate figures so the duplicate is visible rather than hidden in a
--      single total.
-- ===================================================================

-- ===================================================================
-- PART 1 — FAIL-LOUD PREFLIGHT.
-- Every precondition is checked HERE, and any mismatch aborts (SAFE STOP)
-- before a single object is created or altered.
-- ===================================================================
do $$
declare
  n_bad bigint;
  r record;
begin
  -- (a) Server version. `on delete set null (col)` is PG15+. Without this the
  -- failure would be a bare syntax error at an ALTER, pointing at the wrong
  -- thing. This runs first and says what is actually wrong.
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'Receivables SAFE STOP: PostgreSQL 15+ required for ON DELETE SET NULL (column-list); this server is %.',
      current_setting('server_version');
  end if;

  -- (b) The three existing tables this migration references must exist.
  if to_regclass('public.clients') is null then
    raise exception 'Receivables SAFE STOP: public.clients does not exist.';
  end if;
  if to_regclass('public.quotes') is null then
    raise exception 'Receivables SAFE STOP: public.quotes does not exist.';
  end if;
  if to_regclass('public.transactions') is null then
    raise exception 'Receivables SAFE STOP: public.transactions does not exist.';
  end if;

  -- (c) Key column shapes. user_id must be uuid NOT NULL on every table that
  -- takes part in a composite key -- it is the entire isolation story, and a
  -- nullable one would let MATCH SIMPLE skip the check.
  for r in
    select * from (values
      ('clients',      'id',        'uuid', true),
      ('clients',      'user_id',   'uuid', true),
      ('quotes',       'id',        'text', true),
      ('quotes',       'user_id',   'uuid', true),
      ('quotes',       'client_id', 'uuid', false),
      ('transactions', 'user_id',   'uuid', true),
      ('transactions', 'client_id', 'uuid', false)
    ) as t(tbl, col, typ, notnull)
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
        and data_type = r.typ
        and is_nullable = case when r.notnull then 'NO' else 'YES' end
    ) then
      raise exception 'Receivables SAFE STOP: public.%.% is not % %.',
        r.tbl, r.col, r.typ, case when r.notnull then 'NOT NULL' else 'NULLABLE' end;
    end if;
  end loop;

  -- (d) THE DATA PROOF, and the reason this migration may touch existing keys at
  -- all. Widening a single-column FK to a composite one is only safe if EVERY
  -- existing child row already satisfies the wider key. If even one quote or
  -- transaction points at a client owned by a different account, the ALTER would
  -- either fail mid-migration or -- worse -- the mismatch would have to be
  -- "resolved" by guessing an owner. Neither is acceptable: SAFE STOP, change
  -- nothing, and let a human look at the data.
  select count(*) into n_bad
    from public.quotes q
    join public.clients c on c.id = q.client_id
   where c.user_id is distinct from q.user_id;
  if n_bad > 0 then
    raise exception 'Receivables SAFE STOP: % quote(s) reference a client owned by a DIFFERENT account. Nothing was changed -- do NOT reassign ownership by guessing; review the rows first.', n_bad;
  end if;

  select count(*) into n_bad
    from public.transactions t
    join public.clients c on c.id = t.client_id
   where c.user_id is distinct from t.user_id;
  if n_bad > 0 then
    raise exception 'Receivables SAFE STOP: % transaction(s) reference a client owned by a DIFFERENT account. Nothing was changed -- do NOT reassign ownership by guessing; review the rows first.', n_bad;
  end if;

  -- (e) A PRE-EXISTING charges/payments table must match the approved shape in
  -- FULL for every load-bearing column -- `create table if not exists` and
  -- `add column if not exists` both silently no-op, and every constraint below
  -- would then be built on whatever shape is already there.
  -- Type alone is NOT enough (measured lesson, Campaigns slice 2):
  --   * wrong nullability -> inserts the app makes would fail, or the composite
  --     FK would be skipped by MATCH SIMPLE on a NULL it should not allow;
  --   * a DEFAULT on a link column -> rows silently acquire a parent nobody chose;
  --   * GENERATED ALWAYS passes type, nullability AND default checks, because its
  --     expression lives in generation_expression, not column_default -- and a
  --     generated column can never be assigned by a client, which is the only
  --     thing these columns are for.
  for r in
    select * from (values
      -- `required` = this column is NOT NULL with no default, so the additive
      -- section below CANNOT create it on a table that already exists and may
      -- hold rows. A missing one is a SAFE STOP. The two nullable link columns
      -- are `false`: they ARE added by `add column if not exists` further down.
      -- `def` = the DEFAULT this migration declares, compared HERE and not only
      -- in the postflight. Type + nullability + generated state is not the full
      -- shape: `kind text NOT NULL DEFAULT 'deposit'` passes all three, and the
      -- postflight (which does require the exact default) aborts only AFTER the
      -- ALTERs have run -- mid-DDL, instead of at the SAFE STOP this block
      -- promises. Same expectations, checked twice: once before anything is
      -- touched, once after everything is.
      ('charges',  'id',              'uuid',    'NO' , true , null),
      ('charges',  'user_id',         'uuid',    'NO' , true , null),
      ('charges',  'client_id',       'uuid',    'YES', false, null),
      ('charges',  'quote_id',        'text',    'YES', false, null),
      ('charges',  'amount_total',    'numeric', 'NO' , true , null),
      ('charges',  'service_date',    'date',    'NO' , true , null),
      ('charges',  'due_date',        'date',    'NO' , true , null),
      -- EVERY additive business column too, not only the required ones. An
      -- earlier revision listed only the keys and the NOT NULL columns, which
      -- made this a "full shape" check that never looked at kind,
      -- payment_terms, due_date_source, lifecycle, description or invoice_url.
      -- `add column if not exists` preserves an incompatible one, so an integer
      -- `kind` would survive here and fail later at `charges_kind_allowed` --
      -- mid-DDL, instead of at the pre-DDL SAFE STOP this block promises.
      ('charges',  'kind',            'text',    'NO' , false, '''final''::text'),
      ('charges',  'payment_terms',   'text',    'NO' , false, '''immediate''::text'),
      ('charges',  'due_date_source', 'text',    'NO' , false, '''computed''::text'),
      ('charges',  'lifecycle',       'text',    'NO' , false, '''open''::text'),
      ('charges',  'description',     'text',    'YES', false, null),
      ('charges',  'invoice_url',     'text',    'YES', false, null),
      ('payments', 'id',              'uuid',    'NO' , true , null),
      ('payments', 'user_id',         'uuid',    'NO' , true , null),
      ('payments', 'charge_id',       'uuid',    'NO' , true , null),
      ('payments', 'amount',          'numeric', 'NO' , true , null),
      ('payments', 'paid_at',         'date',    'NO' , true , null)
    ) as t(tbl, col, typ, nullable, required, def)
  loop
    -- A PARTIAL table is refused OUTRIGHT, before any DDL.
    --
    -- If public.charges or public.payments already exists but is MISSING one of
    -- these required columns, `create table if not exists` no-ops and the
    -- `add column if not exists` section below does NOT add them: every one of
    -- them is NOT NULL with no default, and adding such a column to a table that
    -- may already hold rows requires a backfill decision this migration has no
    -- basis to make. Skipping the check would push the failure to a later CHECK
    -- or index statement, half-applied and much harder to read. So: SAFE STOP
    -- here, with the missing column named.
    if r.required and to_regclass('public.' || r.tbl) is not null and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
    ) then
      raise exception 'Receivables SAFE STOP: public.% already exists but is MISSING the required column %. It is NOT NULL with no default, so it cannot be added without a backfill decision. Nothing was changed -- review the table first.',
        r.tbl, r.col;
    end if;

    -- Otherwise inspect what is there; a wholly absent table is created below.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
    ) then
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = r.tbl and column_name = r.col
          and data_type = r.typ
      ) then
        raise exception 'Receivables SAFE STOP: public.%.% already exists and is not % (found %).',
          r.tbl, r.col, r.typ,
          (select data_type from information_schema.columns
            where table_schema = 'public' and table_name = r.tbl and column_name = r.col);
      end if;

      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = r.tbl and column_name = r.col
          and is_nullable = r.nullable
      ) then
        raise exception 'Receivables SAFE STOP: public.%.% already exists with the wrong nullability (expected is_nullable=%).',
          r.tbl, r.col, r.nullable;
      end if;

      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = r.tbl and column_name = r.col
          and is_generated <> 'NEVER'
      ) then
        raise exception 'Receivables SAFE STOP: public.%.% already exists as a GENERATED column. These values are client-assigned; a generated column can never be set explicitly.',
          r.tbl, r.col;
      end if;

      -- THE DEFAULT, checked HERE and not only in the postflight. A wrong one is
      -- not cosmetic: `kind NOT NULL DEFAULT 'deposit'` silently books every
      -- charge the app does not name as a deposit, and `description DEFAULT ''`
      -- stores an empty string the read boundary then treats as absent.
      -- `is not distinct from` so a NULL expectation compares correctly.
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = r.tbl and column_name = r.col
          and column_default is not distinct from r.def
      ) then
        raise exception 'Receivables SAFE STOP: public.%.% already exists with DEFAULT %, expected %. Nothing was changed -- review the table first.',
          r.tbl, r.col,
          coalesce((select column_default from information_schema.columns
                     where table_schema = 'public' and table_name = r.tbl and column_name = r.col), '<null>'),
          coalesce(r.def, '<null>');
      end if;
    end if;
  end loop;

  -- (f) A link column must never carry a DEFAULT: a defaulted client_id /
  -- quote_id / charge_id silently attaches rows to a parent nobody chose.
  for r in
    select * from (values
      ('charges',  'client_id'),
      ('charges',  'quote_id' ),
      ('payments', 'charge_id')
    ) as t(tbl, col)
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
        and column_default is not null
    ) then
      raise exception 'Receivables SAFE STOP: public.%.% already exists with a DEFAULT (%). A defaulted link silently attaches rows to a parent nobody chose.',
        r.tbl, r.col,
        (select column_default from information_schema.columns
          where table_schema = 'public' and table_name = r.tbl and column_name = r.col);
    end if;
  end loop;

  -- (g) NUMERIC PRECISION AND SCALE, on a pre-existing money column.
  -- `data_type = 'numeric'` accepts numeric(10,2) and numeric(14,3) alike. The
  -- postflight does check the exact precision, but only after the migration has
  -- altered constraints and installed functions -- mid-DDL, instead of at the
  -- pre-DDL SAFE STOP. A too-small precision silently caps what can be billed;
  -- a different scale rounds money differently from the client's grid. Altering
  -- the type of a column holding real amounts is a data decision, so this is a
  -- SAFE STOP rather than a repair.
  for r in
    select * from (values ('charges', 'amount_total'), ('payments', 'amount')) as t(tbl, col)
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
    ) and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
        and numeric_precision = 14 and numeric_scale = 2
    ) then
      raise exception 'Receivables SAFE STOP: public.%.% already exists as numeric(%,%), expected numeric(14,2). Nothing was changed -- altering the type of a column holding real amounts is a data decision.',
        r.tbl, r.col,
        coalesce((select numeric_precision::text from information_schema.columns
                   where table_schema = 'public' and table_name = r.tbl and column_name = r.col), '?'),
        coalesce((select numeric_scale::text from information_schema.columns
                   where table_schema = 'public' and table_name = r.tbl and column_name = r.col), '?');
    end if;
  end loop;

  -- (h) THE PRIMARY KEY, on a table that already exists.
  -- `create table if not exists` leaves an existing table untouched, PK and all
  -- — so one carrying a uuid `id` with NO primary key would pass every column
  -- check above and reach the end of this migration with duplicate ids still
  -- possible. That is not academic: the app deletes a payment BY id
  -- (api.deletePayment), so one correction would remove several rows, and
  -- charges_id_user_unique alone does not prevent duplicate ids under different
  -- owners. Adding a PK to a table that may already hold duplicates is a data
  -- decision, so this is a SAFE STOP rather than a repair.
  for r in
    select * from (values ('charges'), ('payments')) as t(tbl)
  loop
    if to_regclass('public.' || r.tbl) is not null then
      if not exists (
        select 1 from pg_constraint c
         where c.conrelid = ('public.' || r.tbl)::regclass and c.contype = 'p'
      ) then
        raise exception 'Receivables SAFE STOP: public.% already exists with NO PRIMARY KEY. Duplicate ids would remain possible, and the app deletes by id. Adding a key to a table that may already hold duplicates is a data decision -- review the table first.',
          r.tbl;
      end if;
      if (
        select coalesce(array_agg(a.attname order by k.ord), array[]::name[])
          from pg_constraint c
          cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
         where c.conrelid = ('public.' || r.tbl)::regclass and c.contype = 'p'
      ) is distinct from array['id']::name[] then
        raise exception 'Receivables SAFE STOP: the PRIMARY KEY of public.% is not exactly (id). The composite unique (id, user_id) is an ADDITIONAL constraint, never a replacement PK.',
          r.tbl;
      end if;
    end if;
  end loop;

  -- (i) THE TIMESTAMP COLUMNS THE updated_at TRIGGER WRITES.
  -- `add column if not exists updated_at` no-ops on a pre-existing table, so an
  -- `updated_at` of an incompatible type — or a GENERATED one — would survive
  -- this migration untouched. The migration would then SUCCEED, install
  -- trg_charges_updated / trg_payments_updated, and every subsequent edit or
  -- cancellation would fail inside set_updated_at() when it assigns now(). The
  -- failure would surface only on the first UPDATE, long after the apply.
  -- Checked BEFORE any trigger is installed; a mismatch is a SAFE STOP because
  -- changing the type of an existing timestamp column is a data decision.
  for r in
    select * from (values
      ('charges',  'created_at'), ('charges',  'updated_at'),
      ('payments', 'created_at'), ('payments', 'updated_at')
    ) as t(tbl, col)
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
    ) then
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = r.tbl and column_name = r.col
          and data_type = 'timestamp with time zone'
      ) then
        raise exception 'Receivables SAFE STOP: public.%.% already exists and is not timestamptz (found %). set_updated_at() assigns now() to it, so every UPDATE would fail after this migration.',
          r.tbl, r.col,
          (select data_type from information_schema.columns
            where table_schema = 'public' and table_name = r.tbl and column_name = r.col);
      end if;

      -- NULLABILITY AND THE DEFAULT, not just the type. A nullable timestamp
      -- column, or one defaulted to a fixed instant instead of now(), is
      -- `timestamptz` and passes the check above -- and then every inserted row
      -- carries a NULL or a false created_at while the declared schema says
      -- `NOT NULL DEFAULT now()`. Neither can be corrected by this migration
      -- (setting NOT NULL on a column that may already hold NULLs, or rewriting
      -- a default over existing rows, are data decisions), so both are SAFE
      -- STOPs.
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = r.tbl and column_name = r.col
          and is_nullable = 'NO' and column_default = 'now()'
      ) then
        raise exception 'Receivables SAFE STOP: public.%.% already exists as (is_nullable=%, default=%), expected (NO, now()). Rows would carry a NULL or a false timestamp despite the declared NOT NULL DEFAULT now().',
          r.tbl, r.col,
          (select is_nullable from information_schema.columns
            where table_schema = 'public' and table_name = r.tbl and column_name = r.col),
          coalesce((select column_default from information_schema.columns
            where table_schema = 'public' and table_name = r.tbl and column_name = r.col), '<null>');
      end if;
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = r.tbl and column_name = r.col
          and (is_generated <> 'NEVER' or is_updatable = 'NO')
      ) then
        raise exception 'Receivables SAFE STOP: public.%.% already exists as a GENERATED or non-updatable column. The updated_at trigger assigns it directly and every UPDATE would fail.',
          r.tbl, r.col;
      end if;
    end if;
  end loop;

  -- (j) PAYMENT STATUS MUST NOT BE A COLUMN. If some earlier hand-run left one
  -- behind, this migration will not quietly adopt it -- the whole design is that
  -- status is derived from the amounts and cannot be written.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'charges'
      and column_name in ('status', 'payment_status', 'paid', 'is_paid')
  ) then
    raise exception 'Receivables SAFE STOP: public.charges already has a stored payment-status column. Payment status is DERIVED from amount_total and the sum of payments; a stored copy is free to drift and must not exist.';
  end if;
end;
$$;

-- ===================================================================
-- PART 2 — THE COMPOSITE UNIQUE KEYS the foreign keys point at.
--
-- NO BLIND DROP. `drop constraint if exists <name>` followed by `add` is the
-- pattern used by earlier slices, and it is WRONG here: these keys may already
-- be the target of a foreign key (charges_id_user_unique certainly will be,
-- from payments), and dropping the target of an FK either fails or takes the FK
-- with it. So each key is inspected in the catalog first:
--     exact constraint already present  -> LEAVE IT ALONE
--     name taken, different columns/type -> SAFE STOP
--     an equivalent unique over exactly (id, user_id) under another name -> keep
--       it and skip (the FK only needs SOME unique key over those columns)
--     absent -> add it
-- ===================================================================
do $$
declare
  t text;
  target_name text;
  cols name[];
  ctype "char";
  other_name text;
begin
  foreach t in array array['clients', 'quotes'] loop
    target_name := t || '_id_user_unique';

    select c.contype,
           coalesce((
             select array_agg(a.attname order by k.ord)
               from unnest(c.conkey) with ordinality as k(attnum, ord)
               join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
           ), array[]::name[])
      into ctype, cols
      from pg_constraint c
     where c.conrelid = ('public.' || t)::regclass
       and c.conname = target_name;

    if found then
      -- The name is taken. It is only acceptable if it is EXACTLY the key we
      -- would have created; anything else is a different object wearing the
      -- name we need, and replacing it blind could drop an FK's target.
      if ctype <> 'u' or cols is distinct from array['id', 'user_id']::name[] then
        raise exception 'Receivables SAFE STOP: constraint %.% already exists but is not UNIQUE (id, user_id) -- contype=%, columns=(%). Not replaced.',
          t, target_name, ctype, coalesce(array_to_string(cols, ', '), '<none>');
      end if;
      raise notice 'Receivables: %.% already present and correct -- left untouched.', t, target_name;
    else
      -- Is there an EQUIVALENT unique key under a different name? A composite FK
      -- needs a unique/primary key over exactly these columns; it does not care
      -- what it is called. Adding a second identical index would be pure cost.
      select c.conname into other_name
        from pg_constraint c
       where c.conrelid = ('public.' || t)::regclass
         and c.contype in ('u', 'p')
         and (
           select array_agg(a.attname order by k.ord)
             from unnest(c.conkey) with ordinality as k(attnum, ord)
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
         ) = array['id', 'user_id']::name[]
       limit 1;

      if other_name is not null then
        raise notice 'Receivables: % already has an equivalent UNIQUE (id, user_id) named % -- reusing it.', t, other_name;
      else
        execute format('alter table public.%I add constraint %I unique (id, user_id)', t, target_name);
      end if;
    end if;
  end loop;
end;
$$;

-- ===================================================================
-- PART 3 — THE TABLES.
-- ===================================================================

-- ---------------- dependency: updated_at helper (canonical, already live) ----
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------- charges: what the business EXPECTS to bill ----------------
-- client_id / quote_id are NULLABLE on purpose: a charge must survive its client
-- being deleted (it is a financial record), and not every charge comes from a
-- quote. quote_id is TEXT because public.quotes.id is TEXT -- quote ids are
-- opaque app strings, not uuids (the R1.1 contract; a uuid column here would
-- fail with 42804 at the foreign key).
create table if not exists public.charges (
  id               uuid primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  client_id        uuid,
  quote_id         text,
  kind             text not null default 'final',
  payment_terms    text not null default 'immediate',
  service_date     date not null,
  due_date         date not null,
  due_date_source  text not null default 'computed',
  amount_total     numeric(14,2) not null,
  description      text,
  invoice_url      text,
  lifecycle        text not null default 'open',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- additive backfill (create table if not exists ALONE adds no missing column)
alter table public.charges add column if not exists client_id       uuid;
alter table public.charges add column if not exists quote_id        text;
alter table public.charges add column if not exists kind            text not null default 'final';
alter table public.charges add column if not exists payment_terms   text not null default 'immediate';
alter table public.charges add column if not exists due_date_source text not null default 'computed';
alter table public.charges add column if not exists description     text;
alter table public.charges add column if not exists invoice_url     text;
alter table public.charges add column if not exists lifecycle       text not null default 'open';
alter table public.charges add column if not exists created_at      timestamptz not null default now();
alter table public.charges add column if not exists updated_at      timestamptz not null default now();

-- ---------------- payments: money that ACTUALLY ARRIVED ----------------
-- charge_id is NOT NULL: a payment that belongs to no charge is not a payment,
-- it is an unattributed number. Unattributed income is what `transactions`
-- already records, and this slice does not blur that line.
create table if not exists public.payments (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  charge_id  uuid not null,
  amount     numeric(14,2) not null,
  paid_at    date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payments add column if not exists created_at timestamptz not null default now();
alter table public.payments add column if not exists updated_at timestamptz not null default now();

-- ---------------- ownership FK on a PRE-EXISTING table ----------------
-- `create table if not exists` adds nothing to a table that already exists, so
-- a charges/payments table carrying a correctly typed NOT NULL `user_id` WITHOUT
-- `references auth.users (id) on delete cascade` would satisfy every column
-- check above and still leave declared limitation L4 unmet: deleting an auth
-- user would orphan its financial rows instead of removing them.
--
-- This is REPAIRED rather than refused, because unlike a missing NOT NULL column
-- a missing constraint needs no backfill decision. It is added only when absent,
-- and if existing rows violate it the ALTER fails loudly — which is the correct
-- outcome, not something to work around.
do $$
declare
  t text;
  con_name text;
begin
  foreach t in array array['charges', 'payments'] loop
    if exists (
      select 1 from pg_constraint c
       where c.conrelid = ('public.' || t)::regclass
         and c.contype = 'f'
         and c.confrelid = 'auth.users'::regclass
         and (select array_agg(a.attname order by k.ord)
                from unnest(c.conkey) with ordinality as k(attnum, ord)
                join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
             = array['user_id']::name[]
         -- The REFERENCED column too, not just the referenced table: an FK to
         -- some other unique column on auth.users would satisfy every other
         -- clause here and still not be the constraint this migration declares.
         -- (The same omission the composite-key blocks were corrected for.)
         and (select array_agg(a.attname order by k.ord)
                from unnest(c.confkey) with ordinality as k(attnum, ord)
                join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum)
             = array['id']::name[]
         and c.confdeltype = 'c'
    ) then
      continue; -- already correct (the fresh-install path)
    end if;

    -- A user_id FK that exists but points elsewhere, or does not cascade, is a
    -- different decision than the one declared here. SAFE STOP rather than
    -- silently replace it.
    select c.conname into con_name
      from pg_constraint c
     where c.conrelid = ('public.' || t)::regclass
       and c.contype = 'f'
       and (select array_agg(a.attname order by k.ord)
              from unnest(c.conkey) with ordinality as k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
           = array['user_id']::name[]
     limit 1;
    if con_name is not null then
      raise exception 'Receivables SAFE STOP: public.%.user_id already has a foreign key (%) that is not REFERENCES auth.users(id) ON DELETE CASCADE. Not replaced.', t, con_name;
    end if;

    execute format(
      'alter table public.%I add constraint %I foreign key (user_id) references auth.users (id) on delete cascade',
      t, t || '_user_id_fkey'
    );
    raise notice 'Receivables: added the missing ownership FK on public.%.user_id.', t;
  end loop;
end;
$$;

-- ---------------- domain + bound constraints (idempotent) ----------------
-- These are plain CHECKs and are never the target of a foreign key, so the
-- drop-then-add form is safe for them (unlike the unique keys in PART 2).
alter table public.charges drop constraint if exists charges_kind_allowed;
alter table public.charges add  constraint charges_kind_allowed
  check (kind in ('deposit', 'partial', 'final'));

alter table public.charges drop constraint if exists charges_terms_allowed;
alter table public.charges add  constraint charges_terms_allowed
  check (payment_terms in ('immediate', 'net30', 'net60', 'net90'));

-- Exactly two lifecycle states. No trigger: the graph is symmetric, so there is
-- no illegal transition for a trigger to refuse.
alter table public.charges drop constraint if exists charges_lifecycle_allowed;
alter table public.charges add  constraint charges_lifecycle_allowed
  check (lifecycle in ('open', 'cancelled'));

alter table public.charges drop constraint if exists charges_due_source_allowed;
alter table public.charges add  constraint charges_due_source_allowed
  check (due_date_source in ('computed', 'manual'));

-- A charge for zero or a negative amount is not a receivable.
alter table public.charges drop constraint if exists charges_amount_positive;
alter table public.charges add  constraint charges_amount_positive
  check (amount_total > 0);

alter table public.charges drop constraint if exists charges_description_bounded;
alter table public.charges add  constraint charges_description_bounded
  check (description is null or length(description) <= 200);

-- A bounded invoice link. 2048 is the practical URL ceiling; an unbounded text
-- column here is an unbounded write from a form field.
alter table public.charges drop constraint if exists charges_invoice_url_bounded;
alter table public.charges add  constraint charges_invoice_url_bounded
  check (invoice_url is null or length(invoice_url) <= 2048);

-- ...AND A SAFE SCHEME. Length alone is not a URL check: `javascript:...` is
-- well under 2048 and, rendered as an href, is executable. The screen refuses to
-- render anything else, but a render-time filter is not where this belongs --
-- the value is stored, exported in backups and read by whatever comes next, so
-- the column itself must not be able to hold it. http/https only, and a scheme
-- is mandatory (a bare `example.com/invoice` navigates relative to the app).
alter table public.charges drop constraint if exists charges_invoice_url_scheme;
alter table public.charges add  constraint charges_invoice_url_scheme
  check (invoice_url is null or invoice_url ~* '^https?://[^[:space:]]');

alter table public.payments drop constraint if exists payments_amount_positive;
alter table public.payments add  constraint payments_amount_positive
  check (amount > 0);

-- The unique key payments' composite FK points at. Same no-blind-drop rule as
-- PART 2 -- and it matters more here, because this one WILL be an FK target.
do $$
declare
  cols name[];
  ctype "char";
  other_name text;
begin
  select c.contype,
         coalesce((
           select array_agg(a.attname order by k.ord)
             from unnest(c.conkey) with ordinality as k(attnum, ord)
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
         ), array[]::name[])
    into ctype, cols
    from pg_constraint c
   where c.conrelid = 'public.charges'::regclass
     and c.conname = 'charges_id_user_unique';

  if found then
    if ctype <> 'u' or cols is distinct from array['id', 'user_id']::name[] then
      raise exception 'Receivables SAFE STOP: charges_id_user_unique already exists but is not UNIQUE (id, user_id) -- contype=%, columns=(%). Not replaced.',
        ctype, coalesce(array_to_string(cols, ', '), '<none>');
    end if;
    raise notice 'Receivables: charges_id_user_unique already present and correct -- left untouched.';
  else
    select c.conname into other_name
      from pg_constraint c
     where c.conrelid = 'public.charges'::regclass
       and c.contype in ('u', 'p')
       and (
         select array_agg(a.attname order by k.ord)
           from unnest(c.conkey) with ordinality as k(attnum, ord)
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
       ) = array['id', 'user_id']::name[]
     limit 1;

    if other_name is not null then
      raise notice 'Receivables: charges already has an equivalent UNIQUE (id, user_id) named % -- reusing it.', other_name;
    else
      alter table public.charges add constraint charges_id_user_unique unique (id, user_id);
    end if;
  end if;
end;
$$;

-- ===================================================================
-- PART 4 — SAME-OWNER COMPOSITE FOREIGN KEYS.
--
-- The two EXISTING keys are replaced only after their exact current shape is
-- verified in the catalog: single column, the expected parent, and the expected
-- ON DELETE action. If the live constraint is anything else, SAFE STOP rather
-- than overwrite a decision this migration did not make. The replacement always
-- preserves the delete action it found.
-- ===================================================================
do $$
declare
  c record;
  parent_cols name[];
  ref_col name;
begin
  -- ---- quotes.client_id : single-column CASCADE -> composite CASCADE ----
  select con.oid, con.conname, con.conkey, con.confkey, con.confdeltype, con.confrelid
    into c
    from pg_constraint con
   where con.conrelid = 'public.quotes'::regclass
     and con.contype = 'f'
     and array_length(con.conkey, 1) = 1
     and con.conkey[1] = (select attnum from pg_attribute
                           where attrelid = 'public.quotes'::regclass and attname = 'client_id');

  if found then
    if c.confrelid <> 'public.clients'::regclass then
      raise exception 'Receivables SAFE STOP: quotes.client_id FK % points at %, not public.clients.',
        c.conname, c.confrelid::regclass;
    end if;
    -- THE REFERENCED COLUMN, not merely the referenced TABLE. Checking
    -- confrelid alone accepts an FK that points at some OTHER unique uuid
    -- column on public.clients; this block would then drop it and silently
    -- re-point the relationship at clients.id -- a schema decision this
    -- migration never made, taken instead of the SAFE STOP it promises.
    select a.attname into ref_col
      from pg_attribute a
     where a.attrelid = c.confrelid and a.attnum = c.confkey[1];
    if ref_col is distinct from 'id'::name then
      raise exception 'Receivables SAFE STOP: quotes.client_id FK % references public.clients(%), not clients(id). Not replaced -- re-pointing an existing relationship is not this migration''s decision.',
        c.conname, coalesce(ref_col::text, '<unknown>');
    end if;
    if c.confdeltype <> 'c' then
      raise exception 'Receivables SAFE STOP: quotes.client_id FK % is not ON DELETE CASCADE (confdeltype=%). The existing delete action must be preserved exactly; this migration does not change it.',
        c.conname, c.confdeltype;
    end if;
    execute format('alter table public.quotes drop constraint %I', c.conname);
    raise notice 'Receivables: replaced single-column FK quotes.% with a composite same-owner key.', c.conname;
  end if;

  -- Idempotent: create only when the composite key is not already there.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.quotes'::regclass and conname = 'quotes_client_same_owner_fk'
  ) then
    alter table public.quotes add constraint quotes_client_same_owner_fk
      foreign key (client_id, user_id)
      references public.clients (id, user_id)
      on delete cascade;
  end if;

  -- ---- transactions.client_id : single-column SET NULL -> composite SET NULL (client_id) ----
  select con.oid, con.conname, con.conkey, con.confkey, con.confdeltype, con.confrelid
    into c
    from pg_constraint con
   where con.conrelid = 'public.transactions'::regclass
     and con.contype = 'f'
     and array_length(con.conkey, 1) = 1
     and con.conkey[1] = (select attnum from pg_attribute
                           where attrelid = 'public.transactions'::regclass and attname = 'client_id');

  if found then
    if c.confrelid <> 'public.clients'::regclass then
      raise exception 'Receivables SAFE STOP: transactions.client_id FK % points at %, not public.clients.',
        c.conname, c.confrelid::regclass;
    end if;
    -- THE REFERENCED COLUMN, not merely the referenced TABLE. Checking
    -- confrelid alone accepts an FK that points at some OTHER unique uuid
    -- column on public.clients; this block would then drop it and silently
    -- re-point the relationship at clients.id -- a schema decision this
    -- migration never made, taken instead of the SAFE STOP it promises.
    select a.attname into ref_col
      from pg_attribute a
     where a.attrelid = c.confrelid and a.attnum = c.confkey[1];
    if ref_col is distinct from 'id'::name then
      raise exception 'Receivables SAFE STOP: transactions.client_id FK % references public.clients(%), not clients(id). Not replaced -- re-pointing an existing relationship is not this migration''s decision.',
        c.conname, coalesce(ref_col::text, '<unknown>');
    end if;
    if c.confdeltype <> 'n' then
      raise exception 'Receivables SAFE STOP: transactions.client_id FK % is not ON DELETE SET NULL (confdeltype=%). The financial ledger must SURVIVE client deletion; this migration does not change that decision.',
        c.conname, c.confdeltype;
    end if;
    execute format('alter table public.transactions drop constraint %I', c.conname);
    raise notice 'Receivables: replaced single-column FK transactions.% with a composite same-owner key.', c.conname;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.transactions'::regclass and conname = 'transactions_client_same_owner_fk'
  ) then
    -- SET NULL (client_id) ALONE. A bare SET NULL would also null user_id, which
    -- is NOT NULL -- every delete of a client with transactions would fail.
    alter table public.transactions add constraint transactions_client_same_owner_fk
      foreign key (client_id, user_id)
      references public.clients (id, user_id)
      on delete set null (client_id);
  end if;

  -- Sanity: the parent keys really are unique over (id, user_id). Without this
  -- the ALTERs above would already have failed, but the message would be a bare
  -- "no unique constraint matching given keys" with no clue which key is meant.
  select coalesce(array_agg(a.attname order by k.ord), array[]::name[])
    into parent_cols
    from pg_constraint con
    cross join lateral unnest(con.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
   where con.conrelid = 'public.clients'::regclass
     and con.contype = 'u'
     and con.conname = 'clients_id_user_unique';
  if parent_cols is distinct from array['id', 'user_id']::name[]
     and not exists (
       select 1 from pg_constraint con
        where con.conrelid = 'public.clients'::regclass and con.contype in ('u','p')
          and (select array_agg(a.attname order by k.ord)
                 from unnest(con.conkey) with ordinality as k(attnum, ord)
                 join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum)
              = array['id','user_id']::name[]
     ) then
    raise exception 'Receivables SAFE STOP: public.clients has no UNIQUE (id, user_id) for the composite keys to reference.';
  end if;
end;
$$;

-- ---- LEGACY single-column FKs on the new link columns ----
-- `drop constraint if exists <the name we chose>` is not enough on a
-- PRE-EXISTING table. A conventional `charges_client_id_fkey ... ON DELETE
-- CASCADE` would survive beside the composite SET NULL key added below, and both
-- would be enforced -- so deleting a client would still cascade the charge away,
-- destroying the ledger-survival contract this migration states. The
-- conventional name even sorts first.
--
-- So: inspect every FK on each new link column. A single-column one is
-- superseded by the composite key and is dropped; anything else (a multi-column
-- key that is not the one we are about to create) is a SAFE STOP, because
-- replacing a composite decision made elsewhere is not this migration's call.
do $$
declare
  r record;
  con record;
  keycols name[];
begin
  for r in
    select * from (values
      ('charges',  'client_id', 'charges_client_same_owner_fk'),
      ('charges',  'quote_id',  'charges_quote_same_owner_fk'),
      ('payments', 'charge_id', 'payments_charge_same_owner_fk')
    ) as t(tbl, col, keep)
  loop
    if to_regclass('public.' || r.tbl) is null then
      continue; -- created fresh below/above; nothing legacy can exist
    end if;

    for con in
      select c.oid, c.conname, c.conkey
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.conrelid = ('public.' || r.tbl)::regclass
         and c.contype = 'f'
         and a.attname = r.col
    loop
      if con.conname = r.keep then
        continue; -- ours; recreated idempotently just below
      end if;

      select coalesce(array_agg(a.attname order by k.ord), array[]::name[])
        into keycols
        from unnest(con.conkey) with ordinality as k(attnum, ord)
        join pg_attribute a on a.attrelid = ('public.' || r.tbl)::regclass and a.attnum = k.attnum;

      if array_length(keycols, 1) = 1 then
        execute format('alter table public.%I drop constraint %I', r.tbl, con.conname);
        raise notice 'Receivables: dropped legacy single-column FK %.% (%) -- superseded by the composite same-owner key.',
          r.tbl, r.col, con.conname;
      else
        raise exception 'Receivables SAFE STOP: public.%.% already carries a multi-column foreign key % over (%). Replacing a composite decision made elsewhere is not this migration''s call.',
          r.tbl, r.col, con.conname, array_to_string(keycols, ', ');
      end if;
    end loop;
  end loop;
end;
$$;

-- ---- charges.client_id -> clients (id, user_id), SET NULL (client_id) ----
-- The ledger rule again: deleting a contact must not erase money that is owed.
alter table public.charges drop constraint if exists charges_client_same_owner_fk;
alter table public.charges add constraint charges_client_same_owner_fk
  foreign key (client_id, user_id)
  references public.clients (id, user_id)
  on delete set null (client_id);

-- ---- charges.quote_id -> quotes (id, user_id), SET NULL (quote_id) ----
-- A quote is the ORIGIN of a charge, not its owner. Deleting the document
-- unlinks the charge; it never deletes the claim.
alter table public.charges drop constraint if exists charges_quote_same_owner_fk;
alter table public.charges add constraint charges_quote_same_owner_fk
  foreign key (quote_id, user_id)
  references public.quotes (id, user_id)
  on delete set null (quote_id);

-- ---- payments.charge_id -> charges (id, user_id), CASCADE ----
-- The only CASCADE among the new keys, and the only one that is right: a payment
-- describes a charge. With the charge gone the payment is an orphan number with
-- no meaning, and a NULL charge_id is forbidden by the column itself.
alter table public.payments drop constraint if exists payments_charge_same_owner_fk;
alter table public.payments add constraint payments_charge_same_owner_fk
  foreign key (charge_id, user_id)
  references public.charges (id, user_id)
  on delete cascade;

-- ---------------- indexes ----------------
-- The (col, user_id) shape is deliberate: it is the exact key each ON DELETE
-- action scans on the child side. Without it every client delete seq-scans
-- quotes, transactions and charges.
create index if not exists idx_charges_user_due    on public.charges (user_id, due_date);
create index if not exists idx_charges_client_user on public.charges (client_id, user_id) where client_id is not null;
create index if not exists idx_charges_quote_user  on public.charges (quote_id, user_id)  where quote_id is not null;
create index if not exists idx_payments_charge     on public.payments (charge_id, user_id);
create index if not exists idx_payments_user_paid  on public.payments (user_id, paid_at desc);
create index if not exists idx_quotes_client_user  on public.quotes (client_id, user_id)  where client_id is not null;
create index if not exists idx_tx_client_user      on public.transactions (client_id, user_id) where client_id is not null;

-- ---------------- updated_at triggers ----------------
drop trigger if exists trg_charges_updated on public.charges;
create trigger trg_charges_updated before update on public.charges
  for each row execute function public.set_updated_at();

drop trigger if exists trg_payments_updated on public.payments;
create trigger trg_payments_updated before update on public.payments
  for each row execute function public.set_updated_at();

-- ===================================================================
-- NO PAYMENT AGAINST A CANCELLED CHARGE — enforced HERE, not by the screen.
--
-- The client refuses this too, but a client refusal is advisory by definition:
-- a modal opened while the charge was open still holds `lifecycle: 'open'` after
-- another device cancels it, and any direct API caller bypasses the UI entirely.
-- A rule that only the current screen state enforces is not a rule.
--
-- WHY A TRIGGER AND NOT A CHECK: a CHECK sees one row of ONE table and cannot
-- read the parent charge. This is the same shape as
-- trg_campaigns_status_transition, for the same reason.
--
-- SECURITY INVOKER, deliberately: it reads public.charges as the caller, so RLS
-- applies. If the caller cannot see the charge the query returns no row and this
-- trigger stays silent — which is correct, because the composite foreign key
-- refuses that insert anyway (cross-account) a moment later. The trigger only
-- ever refuses a charge the caller CAN see and that IS cancelled, so it can
-- never block a legitimate write.
--
-- errcode 23514 (check_violation) so the client can map it to a truthful message
-- without string-matching.
--
-- It fires on UPDATE as well: payments are immutable in the product today, but
-- "today" is not an enforcement mechanism, and re-pointing a payment onto a
-- cancelled charge is the same act as inserting one.
-- ===================================================================
create or replace function public.payment_reject_cancelled_charge()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_lifecycle text;
begin
  -- FOR SHARE, not a plain read. Without a row lock this SELECT can observe
  -- `open` while a concurrent transaction is cancelling the same charge, allow
  -- the insert, and let that cancellation commit afterwards -- which is exactly
  -- the cross-device race the trigger exists to close. FOR SHARE conflicts with
  -- the FOR NO KEY UPDATE lock a plain UPDATE takes, so this blocks until the
  -- other transaction ends and then re-reads the committed row.
  -- (FOR KEY SHARE would NOT do: it is what the foreign-key check itself takes,
  -- and it does not conflict with a non-key update.)
  select c.lifecycle into parent_lifecycle
    from public.charges c
   where c.id = new.charge_id and c.user_id = new.user_id
     for share;

  if found and parent_lifecycle = 'cancelled' then
    raise exception 'payments: charge % is cancelled and cannot receive a payment', new.charge_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payments_reject_cancelled on public.payments;
create trigger trg_payments_reject_cancelled before insert or update on public.payments
  for each row execute function public.payment_reject_cancelled_charge();

-- ===================================================================
-- PART 5 — ROW LEVEL SECURITY.
--
-- FOUR PLAIN POLICIES PER TABLE, one per command, own-row only. No quota
-- predicate, therefore NO SECURITY DEFINER counter function -- which is also why
-- there is no `revoke ... from anon` to get wrong here (the class of bug that
-- 20260728130000 exists to close).
--
-- Split by command rather than a single FOR ALL for the same reason as
-- campaigns: a FOR ALL policy has ONE with_check, so any future per-command rule
-- would have to be duplicated or dropped. Four small policies say exactly what
-- each command may do and nothing else.
-- ===================================================================
alter table public.charges  enable row level security;
alter table public.payments enable row level security;

drop policy if exists "charges_own"        on public.charges;
drop policy if exists "charges_select_own" on public.charges;
drop policy if exists "charges_insert_own" on public.charges;
drop policy if exists "charges_update_own" on public.charges;
drop policy if exists "charges_delete_own" on public.charges;

create policy "charges_select_own" on public.charges
  for select to authenticated
  using (auth.uid() = user_id);

create policy "charges_insert_own" on public.charges
  for insert to authenticated
  with check (auth.uid() = user_id);

-- USING scopes which rows may be updated; WITH CHECK stops the updated row from
-- landing in another account.
create policy "charges_update_own" on public.charges
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "charges_delete_own" on public.charges
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "payments_own"        on public.payments;
drop policy if exists "payments_select_own" on public.payments;
drop policy if exists "payments_insert_own" on public.payments;
drop policy if exists "payments_update_own" on public.payments;
drop policy if exists "payments_delete_own" on public.payments;

create policy "payments_select_own" on public.payments
  for select to authenticated
  using (auth.uid() = user_id);

create policy "payments_insert_own" on public.payments
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "payments_update_own" on public.payments
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "payments_delete_own" on public.payments
  for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.charges  to authenticated;
grant select, insert, update, delete on public.payments to authenticated;

-- ===================================================================
-- PART 6 — SELF-VERIFYING ASSERTIONS.
-- The migration proves its own postcondition and ABORTS if any part landed
-- differently than intended. In particular a bare SET NULL -- the one mistake
-- that would break every client delete -- fails HERE rather than in production,
-- months later, the first time someone deletes a client that has transactions.
-- ===================================================================
do $$
declare
  r record;
  c record;
  setcols name[];
  keycols name[];
  parentcols name[];
  n int;
begin
  -- ---- columns: type, nullability, generated state, defaults ----
  for r in
    select * from (values
      ('charges',  'id',              'uuid',        'NO',  null),
      ('charges',  'user_id',         'uuid',        'NO',  null),
      ('charges',  'client_id',       'uuid',        'YES', null),
      ('charges',  'quote_id',        'text',        'YES', null),
      ('charges',  'kind',            'text',        'NO',  '''final''::text'),
      ('charges',  'payment_terms',   'text',        'NO',  '''immediate''::text'),
      ('charges',  'service_date',    'date',        'NO',  null),
      ('charges',  'due_date',        'date',        'NO',  null),
      ('charges',  'due_date_source', 'text',        'NO',  '''computed''::text'),
      ('charges',  'amount_total',    'numeric',     'NO',  null),
      ('charges',  'description',     'text',        'YES', null),
      ('charges',  'invoice_url',     'text',        'YES', null),
      ('charges',  'lifecycle',       'text',        'NO',  '''open''::text'),
      ('payments', 'id',              'uuid',        'NO',  null),
      ('payments', 'user_id',         'uuid',        'NO',  null),
      ('payments', 'charge_id',       'uuid',        'NO',  null),
      ('payments', 'amount',          'numeric',     'NO',  null),
      ('payments', 'paid_at',         'date',        'NO',  null)
    ) as t(tbl, col, typ, nullable, def)
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
        and data_type = r.typ and is_nullable = r.nullable and is_generated = 'NEVER'
        and column_default is not distinct from r.def
    ) then
      raise exception 'Receivables FAILED: public.%.% is not (% / is_nullable=% / NEVER generated / default %) -- found (% / % / % / %).',
        r.tbl, r.col, r.typ, r.nullable, coalesce(r.def, '<null>'),
        (select data_type       from information_schema.columns where table_schema='public' and table_name=r.tbl and column_name=r.col),
        (select is_nullable     from information_schema.columns where table_schema='public' and table_name=r.tbl and column_name=r.col),
        (select is_generated    from information_schema.columns where table_schema='public' and table_name=r.tbl and column_name=r.col),
        coalesce((select column_default from information_schema.columns where table_schema='public' and table_name=r.tbl and column_name=r.col), '<null>');
    end if;
  end loop;

  -- numeric(14,2) exactly -- data_type alone would accept numeric(6,4).
  for r in
    select * from (values ('charges', 'amount_total'), ('payments', 'amount')) as t(tbl, col)
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
        and numeric_precision = 14 and numeric_scale = 2
    ) then
      raise exception 'Receivables FAILED: public.%.% is not numeric(14,2).', r.tbl, r.col;
    end if;
  end loop;

  -- ---- NO stored payment status, on either table ----
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name in ('charges', 'payments')
      and column_name in ('status', 'payment_status', 'paid', 'is_paid')
  ) then
    raise exception 'Receivables FAILED: a stored payment-status column exists. Payment status is DERIVED from amount_total and the sum of payments.';
  end if;

  -- ---- CHECK constraints ----
  for r in
    select * from (values
      ('charges',  'charges_kind_allowed'),
      ('charges',  'charges_terms_allowed'),
      ('charges',  'charges_lifecycle_allowed'),
      ('charges',  'charges_due_source_allowed'),
      ('charges',  'charges_amount_positive'),
      ('charges',  'charges_description_bounded'),
      ('charges',  'charges_invoice_url_bounded'),
      ('charges',  'charges_invoice_url_scheme'),
      ('payments', 'payments_amount_positive')
    ) as t(tbl, con)
  loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = ('public.' || r.tbl)::regclass and conname = r.con and contype = 'c'
    ) then
      raise exception 'Receivables FAILED: CHECK constraint %.% is missing.', r.tbl, r.con;
    end if;
  end loop;

  -- The invoice bound must really be 2048, not merely present.
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'public.charges'::regclass and conname = 'charges_invoice_url_bounded')
     not like '%2048%' then
    raise exception 'Receivables FAILED: charges_invoice_url_bounded does not bound the link at 2048 characters.';
  end if;

  -- ...and the scheme constraint really restricts the scheme, rather than merely
  -- existing under that name.
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'public.charges'::regclass and conname = 'charges_invoice_url_scheme')
     not like '%https?://%' then
    raise exception 'Receivables FAILED: charges_invoice_url_scheme does not restrict invoice_url to http/https. A javascript: value is well under 2048 characters and is executable when rendered as a link.';
  end if;

  -- ---- indexes ----
  for r in
    select * from (values
      ('charges',      'idx_charges_user_due'),
      ('charges',      'idx_charges_client_user'),
      ('charges',      'idx_charges_quote_user'),
      ('payments',     'idx_payments_charge'),
      ('payments',     'idx_payments_user_paid'),
      ('quotes',       'idx_quotes_client_user'),
      ('transactions', 'idx_tx_client_user')
    ) as t(tbl, idx)
  loop
    if not exists (
      select 1 from pg_indexes
      where schemaname = 'public' and tablename = r.tbl and indexname = r.idx
    ) then
      raise exception 'Receivables FAILED: index %.% is missing.', r.tbl, r.idx;
    end if;
  end loop;

  -- ---- RLS: enabled, and EXACTLY four own-row policies per table ----
  for r in select unnest(array['charges', 'payments']) as tbl loop
    if not exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = r.tbl and rowsecurity
    ) then
      raise exception 'Receivables FAILED: RLS is not enabled on public.%.', r.tbl;
    end if;

    select count(*) into n from pg_policies where schemaname = 'public' and tablename = r.tbl;
    if n <> 4 then
      raise exception 'Receivables FAILED: public.% has % policies, expected exactly 4 (select/insert/update/delete).', r.tbl, n;
    end if;

    select count(*) into n
      from pg_policies
     where schemaname = 'public' and tablename = r.tbl
       and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
       and 'authenticated' = any (roles);
    if n <> 4 then
      raise exception 'Receivables FAILED: public.% does not have one authenticated policy per command.', r.tbl;
    end if;

    -- Every policy that can write must carry a WITH CHECK; without it an UPDATE
    -- could move a row into another account.
    select count(*) into n
      from pg_policies
     where schemaname = 'public' and tablename = r.tbl
       and cmd in ('INSERT', 'UPDATE')
       and (with_check is null or with_check not like '%user_id%');
    if n > 0 then
      raise exception 'Receivables FAILED: public.% has a writing policy without an ownership WITH CHECK.', r.tbl;
    end if;

    -- No quota predicate leaked in from the campaigns/assets pattern.
    if exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = r.tbl
         and (coalesce(qual, '') || coalesce(with_check, '')) like '%row_count%'
    ) then
      raise exception 'Receivables FAILED: public.% carries a row-quota predicate. Receivables are records of real money and are not capped.', r.tbl;
    end if;
  end loop;

  -- ---- NO SECURITY DEFINER function was introduced by this slice ----
  if exists (
    select 1 from pg_proc p
     join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prosecdef
      and p.proname in ('charge_row_count', 'payment_row_count', 'receivable_row_count')
  ) then
    raise exception 'Receivables FAILED: a SECURITY DEFINER counter function exists for this slice. None was declared and none is wanted.';
  end if;

  -- ---- THE FIVE COMPOSITE FOREIGN KEYS ----
  for r in
    select * from (values
      -- child table,   constraint name,                      parent,            delete action, set-null columns
      ('quotes',       'quotes_client_same_owner_fk',        'clients',  'c', null),
      ('transactions', 'transactions_client_same_owner_fk',  'clients',  'n', 'client_id'),
      ('charges',      'charges_client_same_owner_fk',       'clients',  'n', 'client_id'),
      ('charges',      'charges_quote_same_owner_fk',        'quotes',   'n', 'quote_id'),
      ('payments',     'payments_charge_same_owner_fk',      'charges',  'c', null)
    ) as t(child, con, parent, deltype, setcol)
  loop
    select con.oid, con.conkey, con.confkey, con.confrelid, con.confdeltype, con.confdelsetcols
      into c
      from pg_constraint con
     where con.conrelid = ('public.' || r.child)::regclass
       and con.contype = 'f'
       and con.conname = r.con;

    if not found then
      raise exception 'Receivables FAILED: foreign key %.% was not created.', r.child, r.con;
    end if;

    -- TWO columns, and the SECOND must be user_id. This is the assertion the
    -- whole slice turns on: a single-column key would let one account point at
    -- another account's row.
    select coalesce(array_agg(a.attname order by k.ord), array[]::name[])
      into keycols
      from unnest(c.conkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = ('public.' || r.child)::regclass and a.attnum = k.attnum;
    if array_length(keycols, 1) is distinct from 2 or keycols[2] <> 'user_id' then
      raise exception 'Receivables FAILED: %.% is not a COMPOSITE same-owner key -- columns are (%). A single-column key permits cross-account references, because a foreign key is checked by the system and not through RLS.',
        r.child, r.con, array_to_string(keycols, ', ');
    end if;

    if c.confrelid <> ('public.' || r.parent)::regclass then
      raise exception 'Receivables FAILED: %.% references %, expected public.%.',
        r.child, r.con, c.confrelid::regclass, r.parent;
    end if;

    select coalesce(array_agg(a.attname order by k.ord), array[]::name[])
      into parentcols
      from unnest(c.confkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = ('public.' || r.parent)::regclass and a.attnum = k.attnum;
    if parentcols is distinct from array['id', 'user_id']::name[] then
      raise exception 'Receivables FAILED: %.% references (%), expected (id, user_id).',
        r.child, r.con, array_to_string(parentcols, ', ');
    end if;

    -- `confdeltype` is the internal "char" type while r.deltype is text; cast
    -- BOTH sides so the comparison resolves to a real operator at runtime.
    if c.confdeltype::text is distinct from r.deltype::text then
      raise exception 'Receivables FAILED: %.% ON DELETE is %, expected %. The existing delete action must be preserved exactly.',
        r.child, r.con, c.confdeltype, r.deltype;
    end if;

    -- THE ASSERTION THAT MATTERS MOST for the SET NULL keys: it must apply to
    -- the link column ALONE. A bare SET NULL also nulls user_id (NOT NULL) and
    -- makes every parent delete fail.
    if r.deltype = 'n' then
      select coalesce(array_agg(a.attname order by a.attname), array[]::name[])
        into setcols
        from unnest(c.confdelsetcols) as s(attnum)
        join pg_attribute a on a.attrelid = ('public.' || r.child)::regclass and a.attnum = s.attnum;
      if setcols is distinct from array[r.setcol]::name[] then
        raise exception 'Receivables FAILED: %.% ON DELETE SET NULL must name % alone -- found %. A bare SET NULL would also null %.user_id (NOT NULL) and make every parent delete fail.',
          r.child, r.con, r.setcol,
          coalesce(nullif(array_to_string(setcols, ', '), ''), '<all key columns>'), r.child;
      end if;
    end if;
  end loop;

  -- ---- the primary key really is (id) on both tables ----
  for r in select unnest(array['charges', 'payments']) as tbl loop
    if (
      select coalesce(array_agg(a.attname order by k.ord), array[]::name[])
        from pg_constraint c
        cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
       where c.conrelid = ('public.' || r.tbl)::regclass and c.contype = 'p'
    ) is distinct from array['id']::name[] then
      raise exception 'Receivables FAILED: public.% does not have PRIMARY KEY (id). The app deletes by id; duplicates would make one correction remove several rows.', r.tbl;
    end if;
  end loop;

  -- ---- the timestamp columns the updated_at triggers write ----
  for r in
    select * from (values
      ('charges',  'created_at'), ('charges',  'updated_at'),
      ('payments', 'created_at'), ('payments', 'updated_at')
    ) as t(tbl, col)
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
        and data_type = 'timestamp with time zone'
        and is_generated = 'NEVER' and is_updatable = 'YES'
        -- the SAME expectations the preflight enforces: NOT NULL, default now().
        -- "some default" is not the contract -- a fixed epoch is also a default.
        and is_nullable = 'NO' and column_default = 'now()'
    ) then
      raise exception 'Receivables FAILED: public.%.% is not a plain assignable timestamptz that is NOT NULL DEFAULT now(). The updated_at trigger writes it on every UPDATE.',
        r.tbl, r.col;
    end if;
  end loop;

  -- ---- the cancelled-charge rule is a SERVER rule ----
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.payments'::regclass
       and not tgisinternal
       and tgname = 'trg_payments_reject_cancelled'
  ) then
    raise exception 'Receivables FAILED: trg_payments_reject_cancelled is missing. "No payment against a cancelled charge" would then depend on current UI state, which is not enforcement.';
  end if;

  -- ---- ownership cascades to auth.users (declared limitation L4) ----
  for r in select unnest(array['charges', 'payments']) as tbl loop
    if not exists (
      select 1 from pg_constraint c
       where c.conrelid = ('public.' || r.tbl)::regclass
         and c.contype = 'f'
         and c.confrelid = 'auth.users'::regclass
         and (select array_agg(a.attname order by k.ord)
                from unnest(c.conkey) with ordinality as k(attnum, ord)
                join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
             = array['user_id']::name[]
         and (select array_agg(a.attname order by k.ord)
                from unnest(c.confkey) with ordinality as k(attnum, ord)
                join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum)
             = array['id']::name[]
         and c.confdeltype = 'c'
    ) then
      raise exception 'Receivables FAILED: public.%.user_id does not REFERENCE auth.users(id) ON DELETE CASCADE. Deleting an account would orphan its financial rows.', r.tbl;
    end if;
  end loop;

  -- ---- NO single-column FK survives on ANY user-owned link column ----
  -- All five, not just the two replaced ones: a legacy single-column key left
  -- beside a composite one is still enforced, and its delete action wins where
  -- it is stricter.
  for r in
    select * from (values
      ('quotes',       'client_id'),
      ('transactions', 'client_id'),
      ('charges',      'client_id'),
      ('charges',      'quote_id'),
      ('payments',     'charge_id')
    ) as t(tbl, col)
  loop
    if exists (
      select 1 from pg_constraint con
       where con.conrelid = ('public.' || r.tbl)::regclass
         and con.contype = 'f'
         and array_length(con.conkey, 1) = 1
         and con.conkey[1] = (select attnum from pg_attribute
                               where attrelid = ('public.' || r.tbl)::regclass and attname = r.col)
    ) then
      raise exception 'Receivables FAILED: public.%.% still carries a SINGLE-COLUMN foreign key. It must be the composite same-owner key alone -- a surviving single-column key is enforced beside it and its delete action wins where it is stricter.',
        r.tbl, r.col;
    end if;
  end loop;
end;
$$;

-- ===================================================================
-- VERIFICATION -- run AFTER the migration. TWO PARTS, AND THEY ARE NOT THE SAME
-- KIND OF THING. Read PART B's warning before running any of it.
--
--   PART A (1-7): READ-ONLY catalog checks. Pure SELECTs. Safe on any database,
--                 including Production, at any time. They modify nothing.
--   PART B (8-15): MUTATING two-account acceptance controls. Every one of these
--                 WRITES, and controls 13-14 DELETE rows. They are not
--                 verification in the same sense as PART A -- they are an
--                 acceptance run that changes data.
-- ===================================================================
--
-- ---------------- PART A -- READ-ONLY (modifies nothing) ----------------
-- 1. Tables exist:
--      select to_regclass('public.charges'), to_regclass('public.payments');
-- 2. RLS enabled on both:
--      select tablename, rowsecurity from pg_tables
--       where schemaname='public' and tablename in ('charges','payments');   -- expect true, true
-- 3. EXACTLY four policies per table, all to `authenticated`, all own-row:
--      select tablename, policyname, cmd, roles, qual, with_check from pg_policies
--       where schemaname='public' and tablename in ('charges','payments')
--       order by tablename, cmd;
--    -- expect 8 rows total; no row may mention row_count (no quota).
-- 4. THE FIVE COMPOSITE FOREIGN KEYS, in full:
--      select conrelid::regclass as child, conname, pg_get_constraintdef(oid)
--        from pg_constraint
--       where conname in ('quotes_client_same_owner_fk','transactions_client_same_owner_fk',
--                         'charges_client_same_owner_fk','charges_quote_same_owner_fk',
--                         'payments_charge_same_owner_fk')
--       order by 1, 2;
--    -- expect verbatim:
--    --   quotes       FOREIGN KEY (client_id, user_id) REFERENCES clients(id, user_id) ON DELETE CASCADE
--    --   transactions FOREIGN KEY (client_id, user_id) REFERENCES clients(id, user_id) ON DELETE SET NULL (client_id)
--    --   charges      FOREIGN KEY (client_id, user_id) REFERENCES clients(id, user_id) ON DELETE SET NULL (client_id)
--    --   charges      FOREIGN KEY (quote_id, user_id)  REFERENCES quotes(id, user_id)  ON DELETE SET NULL (quote_id)
--    --   payments     FOREIGN KEY (charge_id, user_id) REFERENCES charges(id, user_id) ON DELETE CASCADE
-- 5. NO single-column client FK survives:
--      select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint
--       where conrelid in ('public.quotes'::regclass,'public.transactions'::regclass)
--         and contype='f' and array_length(conkey,1)=1;
--    -- expect only the user_id -> auth.users keys; NOTHING on client_id.
-- 6. No stored payment status:
--      select column_name from information_schema.columns
--       where table_schema='public' and table_name='charges'
--         and column_name in ('status','payment_status','paid','is_paid');   -- expect 0 rows
-- 7. Existing data untouched:
--      select (select count(*) from public.charges) as charges,
--             (select count(*) from public.payments) as payments;   -- expect 0, 0 on first apply
--
-- ---------------- PART B -- MUTATING ACCEPTANCE CONTROLS ----------------
--
--   ⚠️ THESE STATEMENTS WRITE TO THE DATABASE. CONTROLS 13-14 ARE DESTRUCTIVE:
--   they DELETE a charge and a client, and those deletes are not undoable.
--
--   MANDATORY PRECONDITIONS -- all three, before running anything in PART B:
--     (i)   Use DISPOSABLE QA RECORDS ONLY -- clients KA (account A) and KB
--           (account B), charge HA, payment PA, created for this run on QA
--           accounts. NEVER point these controls at a real client, a real quote
--           or real money.
--     (ii)  Record every id you create, so cleanup can be VERIFIED afterwards
--           rather than assumed.
--     (iii) Two signed-in accounts, A and B. Run each statement as the account
--           named -- running control 10 as B instead of A inverts its meaning and
--           it would pass while proving nothing.
--
--  8. POSITIVE (own client links) -- as A, with QA client KA:          [WRITES]
--       insert into public.charges (id,user_id,client_id,kind,payment_terms,
--         service_date,due_date,due_date_source,amount_total,lifecycle)
--       values ('<HA>','<A uuid>','<KA>','final','net60','2026-02-15','2026-04-29','computed',1000.00,'open');
--     -- expect 1 row. NOTE the due date: end of Feb 2026 (the 28th) + 60 days.
--  9. POSITIVE (payment records received money) -- as A:               [WRITES]
--       insert into public.payments (id,user_id,charge_id,amount,paid_at)
--       values ('<PA>','<A uuid>','<HA>',400.00,'2026-03-01');          -- expect 1 row
--     -- then: derived status must read partially_paid, balance 600.00:
--       select c.amount_total, coalesce(sum(p.amount),0) as received
--         from public.charges c left join public.payments p on p.charge_id=c.id
--        where c.id='<HA>' group by c.amount_total;
-- 10. NEGATIVE (THE ONE THIS SLICE EXISTS FOR) -- as A, naming B's QA client KB
--     (A cannot SELECT it, but can still name it):     [attempts a write; FAILS]
--       update public.charges set client_id='<KB>' where id='<HA>';
--     -- expect ERROR 23503 on charges_client_same_owner_fk.
--     -- If this SUCCEEDS, the key is single-column and the slice has failed.
-- 11. NEGATIVE (cross-account payment) -- as B, naming A's charge HA:
--                                                     [attempts a write; FAILS]
--       insert into public.payments (id,user_id,charge_id,amount,paid_at)
--       values (gen_random_uuid(),'<B uuid>','<HA>',10.00,'2026-03-02');
--     -- expect ERROR 23503 on payments_charge_same_owner_fk.
-- 12. NEGATIVE (a stored status cannot be written) -- as A:
--       update public.charges set status='paid' where id='<HA>';
--     -- expect ERROR 42703 column "status" does not exist.
-- 13. DELETION SEMANTICS, client side -- as A:
--                              [⚠️ DESTRUCTIVE -- PERMANENTLY DELETES CLIENT KA]
--       delete from public.clients where id='<KA>';                    -- expect 1 row
--       select id, client_id, user_id from public.charges where id='<HA>';
--     -- expect the charge STILL PRESENT, client_id NULL, user_id UNCHANGED.
--     -- A failure here ("null value in column user_id") is the bare-SET-NULL bug.
-- 14. DELETION SEMANTICS, charge side -- as A:
--                              [⚠️ DESTRUCTIVE -- PERMANENTLY DELETES CHARGE HA]
--       delete from public.charges where id='<HA>';                    -- expect 1 row
--       select count(*) from public.payments where id='<PA>';          -- expect 0 (CASCADE)
-- 15. NEGATIVE (a cancelled charge refuses new payments) -- as A:
--                                              [attempts a write; must FAIL]
--       update public.charges set lifecycle='cancelled' where id='<HA>';
--       insert into public.payments (id,user_id,charge_id,amount,paid_at)
--       values (gen_random_uuid(),'<A uuid>','<HA>',1.00,'2026-03-03');
--     -- expect ERROR 23514 "charge ... is cancelled and cannot receive a payment".
--     -- Deleting an EXISTING payment on a cancelled charge must still succeed --
--     -- that is the correction path, and refusing it would strand the mistake.
--       update public.charges set lifecycle='open' where id='<HA>';  -- restore for 13-14
-- 16. NEGATIVE (isolation) -- as A:
--       select count(*) from public.charges where user_id='<B uuid>';  -- expect 0
--
-- ---------------- PART B CLEANUP -- required, and VERIFIED not assumed -------
-- HA, PA and KA are already gone (controls 13-14). Remove the rest, then PROVE
-- it rather than trusting it:
--       delete from public.clients where id='<KB>';        -- as B
-- Verification query -- run as EACH account; expect 0 from every row:
--       select 'charge HA'  as record, count(*) from public.charges  where id='<HA>'
--       union all select 'payment PA', count(*) from public.payments where id='<PA>'
--       union all select 'client KA',  count(*) from public.clients  where id='<KA>'
--       union all select 'client KB',  count(*) from public.clients  where id='<KB>';
-- A non-zero count means QA residue is still in the database -- finish the
-- cleanup before calling this acceptance run complete.
