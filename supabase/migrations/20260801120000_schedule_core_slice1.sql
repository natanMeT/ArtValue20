-- ===================================================================
-- Migration (Schedule Core, slice 1): the first DURABLE, TIME-OF-DAY entity.
--
-- WHAT THIS ADDS
--   public.appointments -- one scheduled occurrence: a meeting, a lesson or an
--                          event. Owner-scoped, with a start instant, an
--                          optional end instant, a status, and OPTIONAL links to
--                          a client and to a task.
--
-- WHY THIS IS NEW AND NOT A DUPLICATE OF ANYTHING.
--   Every date the product stores today is a `date` with NO time of day:
--   tasks.deadline, clients.next_action_date, charges.service_date /
--   charges.due_date, quotes.date, transactions.date. Nothing in the schema can
--   express "10:30 for 45 minutes", so "what do I have today?" cannot be
--   answered without guessing. This is the first `timestamptz` business entity
--   in the product, and that is the whole point of the slice.
--
-- NAMING BOUNDARY -- READ THIS BEFORE EXTENDING ANYTHING HERE.
--   This table is `appointments`, deliberately NOT `calendar_events`. The word
--   "calendar" is already taken in this repo by the Growth OS MONTHLY ACTION
--   CALENDAR (`src/data/growthCalendar.js`, `/growth/calendar`), which is a
--   pure, non-persisted PLANNING model -- it turns an income target into a
--   suggested weekly activity volume and stores nothing. Same word, two
--   completely different lifetimes. Campaigns slice 1 recorded exactly this
--   defect class (`public.campaigns` vs the device-local creative session), and
--   the mitigation is the same: separate vocabulary, plus a test that FAILS if
--   the new code imports from `src/data/growthCalendar.js` or
--   `src/pages/growth/**`.
--
-- ONE TABLE WITH A `kind`, NOT THREE TABLES.
--   appointment / lesson / event share an identical shape, an identical RLS
--   surface and an identical foreign-key set. What actually distinguishes a
--   LESSON -- cohorts, a recurring series, attendance, per-lesson billing -- is
--   vertical MODULE territory (roadmap 5.3), and none of those rules exist yet.
--   Splitting the table before those rules are known would fix a boundary this
--   slice has not measured. `kind` costs one CHECK constraint; a second table
--   would cost a second RLS surface, a second key set and a permanent merge
--   query on every read.
--
-- TIME IS STORED AS timestamptz (UTC INSTANTS), NOT date + text.
--   start_at / end_at are absolute instants. The client formats them for
--   Asia/Jerusalem. There is deliberately NO timezone column and NO per-user
--   timezone setting in this slice: a second copy of "which zone is this?" is
--   exactly the kind of duplicated rule that drifts. A `timestamp` (no zone)
--   would have made the stored value depend on whoever wrote it.
--
-- STATUS IS STORED, AND THAT IS A DELIBERATE DIFFERENCE FROM F1.
--   Receivables refused a stored status because it is DERIVABLE from amounts
--   nobody can dispute. An appointment's outcome is NOT derivable from anything
--   in the row: only a human knows whether the lesson happened, was cancelled,
--   or the client did not show up. A stored status here is the fact itself, not
--   a second copy of one.
--
-- BOTH LINKS ARE OPTIONAL, AND BOTH KEYS ARE COMPOSITE AND SAME-OWNER.
--   appointments (client_id, user_id) -> clients (id, user_id) ON DELETE SET NULL (client_id)
--   appointments (task_id,   user_id) -> tasks   (id, user_id) ON DELETE SET NULL (task_id)
--
--   WHY RLS IS NOT ENOUGH FOR A RELATIONSHIP. A foreign key is checked BY THE
--   SYSTEM, not through RLS. RLS hiding account B's client from account A's
--   SELECT does NOT stop A from REFERENCING it: A only needs the id. A
--   single-column FK therefore permits a durable pointer from A's data into B's.
--   Carrying user_id INTO the key makes that structurally impossible -- A's rows
--   always carry A's user_id, so only A's parents can ever satisfy the pair.
--   Same lesson as Campaigns slice 2 (tasks.campaign_id) and F1 (the money).
--
--   WHY THE COLUMN LIST ON SET NULL IS LOAD-BEARING. A bare `on delete set null`
--   nulls EVERY column of the key -- including user_id, which is NOT NULL here.
--   Every delete of a client (or task) that had appointments would then fail
--   with a not-null violation, months later, in production. `set null
--   (client_id)` nulls the link ALONE and leaves ownership intact. PG15+ syntax;
--   the live project runs 17.6 (verified before this file was written, and
--   asserted below).
--
--   WHY SET NULL AND NOT CASCADE, ON BOTH. An appointment is a record that
--   something was scheduled and how it ended. Deleting a contact, or tidying up
--   a task, must not silently erase the history of a lesson that was taught.
--   This is the same direction F1 chose for charges, and the OPPOSITE of
--   payments -> charges (a payment cannot outlive the charge it was recorded
--   against, because it means nothing on its own).
--
-- THE ONE THING THIS MIGRATION ADDS TO AN EXISTING TABLE.
--   public.tasks gains `tasks_id_user_unique UNIQUE (id, user_id)` -- and
--   nothing else. No column, no policy, no trigger, no data, no change to the
--   S0B `tasks_own` policy. That constraint is the key the task link points at;
--   a composite FK is rejected outright unless a UNIQUE (or PK) constraint
--   covers exactly those columns. It can never fail on existing data (`id` is
--   already the PRIMARY KEY, so no two rows can share one), which is precisely
--   why it is safe to add here -- but it is still added through an
--   inspect-then-add block rather than a blind drop/create, because dropping the
--   target of a foreign key either fails or takes the foreign key with it. The
--   equivalent key on public.clients (`clients_id_user_unique`) already exists,
--   created and verified live by F1; this migration REQUIRES it and never
--   creates it.
--
-- NO QUOTA AND NO SECURITY DEFINER FUNCTION.
--   Neither is declared here. The quota pattern exists for objects with an
--   unbounded free-tier cost (assets, campaigns) and drags in a counter function
--   whose default `anon` EXECUTE grant needed its own migration to revoke
--   (20260728130000). An appointment costs one row; capping it would refuse the
--   business its own diary. The assertion block below FAILS if a SECURITY
--   DEFINER function is ever added by this file.
--
-- SCOPE: additive + idempotent + self-verifying. No DROP TABLE, no DELETE, no
-- UPDATE of data, no INSERT, no backfill, no change to any existing column, and
-- no destructive operation of any kind. Recurrence, reminders, packages /
-- lesson balances, the Hebrew calendar, Google Calendar sync, a charge link and
-- Organizations are NOT part of this slice.
--
-- HOW TO RUN (owner-gated): Supabase Dashboard -> SQL Editor -> paste -> Run,
--   or as this timestamped CLI migration. NEVER run by the app.
--
-- DECLARED LIMITATIONS (known, accepted, NOT fixed here):
--   L1 MATCH SIMPLE. A NULL client_id / task_id skips its FK check entirely.
--      That IS the optionality: an appointment may belong to no client and no
--      task, and must survive either being deleted.
--   L2 NO OVERLAP CONSTRAINT. Two appointments may occupy the same instant. A
--      double-booking is a real thing a business does on purpose (two rooms, two
--      teachers), and the schema cannot tell the difference. The client SHOWS
--      overlaps; it never refuses them.
--   L3 NO charge_id. Linking a completed lesson to money is deferred to a later
--      slice by explicit owner decision. F1 already carries an unresolved
--      double-count limitation between transactions and payments (its L6);
--      adding a third money edge before that is settled would multiply it.
--   L4 NO RECURRENCE. A weekly lesson is N rows, not one rule. A recurrence
--      model that cannot express exceptions is worse than none, and exceptions
--      are a slice of their own.
--   L5 status has NO transition trigger. All four values are reachable from all
--      others on purpose: a no-show corrected to completed, or a cancellation
--      undone, are ordinary corrections. (Campaigns needed a trigger because its
--      graph is directed and terminal; this one is not.)
--   L6 NO timezone column. Every instant is stored in UTC and rendered in
--      Asia/Jerusalem by the client. A business operating across zones would
--      need a real decision, not a column added in passing.
--   L7 tasks.client_id remains a SINGLE-COLUMN FK (F1's L5). It is outside this
--      slice's approved file/scope list and is reported, not fixed here.
-- ===================================================================

-- ===================================================================
-- PART 1 -- FAIL-LOUD PREFLIGHT.
-- Every precondition is checked HERE, and any mismatch aborts (SAFE STOP)
-- before a single object is created or altered.
--
-- ALIAS DISCIPLINE (PR #137, the second failed F1 apply): every variable
-- declared in every DO block in this file is prefixed `v_`, and no table alias
-- used anywhere is a declared name. PL/pgSQL resolves `c.relname` against a
-- DECLARED VARIABLE `c` before it resolves the table alias `c`, and the result
-- is `record "c" is not assigned yet (55000)` -- AFTER the DDL has run. That
-- defect was invisible to 105 text-level assertions because the SQL was
-- well-formed and every identifier existed.
-- ===================================================================
do $$
declare
  v_bad        bigint;
  v_cols       name[];
  v_contype    "char";
  v_deferrable boolean;
  v_name       text;
  v_kind       "char";
  v_type       text;
begin
  -- (a) Server version. `on delete set null (col)` is PG15+. Without this the
  -- failure would be a bare syntax error at an ALTER, pointing at the wrong
  -- thing. This runs first and says what is actually wrong.
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'Schedule Core SAFE STOP: PostgreSQL 15+ required for ON DELETE SET NULL (column-list); this server is %.',
      current_setting('server_version');
  end if;

  -- (b) auth.uid(). Every policy below is written in terms of it. Without the
  -- function the policies would still be CREATED and would then fail at read
  -- time, per row, in production.
  if to_regprocedure('auth.uid()') is null then
    raise exception 'Schedule Core SAFE STOP: auth.uid() does not exist. This is not a Supabase database, or the auth schema is missing.';
  end if;

  -- (c) Both parent tables must exist. This slice references both.
  if to_regclass('public.clients') is null then
    raise exception 'Schedule Core SAFE STOP: public.clients does not exist.';
  end if;
  if to_regclass('public.tasks') is null then
    raise exception 'Schedule Core SAFE STOP: public.tasks does not exist (S0B migration 20260722120000 not applied).';
  end if;

  -- (d) THE REFERENCED KEY ON clients. Created by F1 (20260731120000) and
  -- verified live in its PART A. This migration REQUIRES it and never creates
  -- it: creating a key another slice owns is how two files come to disagree
  -- about the same constraint. Matched by COLUMNS, not by name -- the foreign
  -- key only needs SOME non-deferrable unique key over exactly those columns.
  select con.conname, con.condeferrable
    into v_name, v_deferrable
    from pg_constraint con
   where con.conrelid = 'public.clients'::regclass
     and con.contype = 'u'
     and (
       select coalesce(array_agg(att.attname order by k.ord), array[]::name[])
         from unnest(con.conkey) with ordinality as k(attnum, ord)
         join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
     ) = array['id', 'user_id']::name[]
   limit 1;

  if v_name is null then
    raise exception 'Schedule Core SAFE STOP: public.clients has no UNIQUE (id, user_id) for the composite key to reference. F1 (20260731120000) creates clients_id_user_unique -- apply it first.';
  end if;
  if v_deferrable then
    raise exception 'Schedule Core SAFE STOP: the UNIQUE (id, user_id) on public.clients (%) is DEFERRABLE. PostgreSQL cannot reference a deferrable unique key from a foreign key.',
      v_name;
  end if;

  -- (e) tasks.id must be TEXT, and the PRIMARY KEY must be exactly (id).
  -- appointments.task_id is declared `text` below; a uuid parent column would
  -- fail at the foreign key with 42804, and a composite PK would mean the
  -- UNIQUE (id, user_id) added in PART 2 is not the key it looks like.
  select col.data_type into v_type
    from information_schema.columns col
   where col.table_schema = 'public' and col.table_name = 'tasks' and col.column_name = 'id';
  if v_type is distinct from 'text' then
    raise exception 'Schedule Core SAFE STOP: public.tasks.id is % , not text. appointments.task_id is text and the foreign key would fail with 42804.',
      coalesce(v_type, '<missing>');
  end if;

  select coalesce(array_agg(att.attname order by k.ord), array[]::name[])
    into v_cols
    from pg_constraint con
    cross join lateral unnest(con.conkey) with ordinality as k(attnum, ord)
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
   where con.conrelid = 'public.tasks'::regclass and con.contype = 'p';

  if v_cols is distinct from array['id']::name[] then
    raise exception 'Schedule Core SAFE STOP: the PRIMARY KEY of public.tasks is not exactly (id) -- found %. The composite UNIQUE (id, user_id) added below is an ADDITIONAL constraint, never a replacement PK.',
      coalesce(nullif(array_to_string(v_cols, ', '), ''), '<missing>');
  end if;

  -- (f) Both parents must carry `user_id uuid NOT NULL`. It is half of each
  -- composite key and the entire reason cross-account linking is impossible.
  for v_name in select unnest(array['clients', 'tasks']) loop
    if not exists (
      select 1 from information_schema.columns col
       where col.table_schema = 'public' and col.table_name = v_name
         and col.column_name = 'user_id' and col.data_type = 'uuid' and col.is_nullable = 'NO'
    ) then
      raise exception 'Schedule Core SAFE STOP: public.%.user_id is not uuid NOT NULL.', v_name;
    end if;
  end loop;

  -- (g) public.appointments must not already exist as something that is not an
  -- ordinary table. `create table if not exists` silently no-ops against a
  -- table, but a VIEW, materialized view, foreign table or partitioned parent
  -- with this name would make every statement below land somewhere unintended.
  select ci.relkind into v_kind
    from pg_class ci
    join pg_namespace ns on ns.oid = ci.relnamespace
   where ns.nspname = 'public' and ci.relname = 'appointments';

  if v_kind is not null and v_kind <> 'r' then
    raise exception 'Schedule Core SAFE STOP: public.appointments already exists with relkind=% (expected an ordinary table, r). Nothing was changed.',
      v_kind;
  end if;

  -- (h) If the table ALREADY exists, every column this migration depends on
  -- must already have the right type -- `add column if not exists` no-ops and
  -- would leave the constraints below built on a different shape. The two
  -- instant columns are checked explicitly because a `date` or a `timestamp
  -- without time zone` would silently destroy the whole point of the slice.
  if v_kind = 'r' then
    for v_name, v_type in
      select col.column_name, col.data_type
        from information_schema.columns col
       where col.table_schema = 'public' and col.table_name = 'appointments'
         and col.column_name in ('id', 'user_id', 'kind', 'title', 'start_at', 'end_at', 'status', 'client_id', 'task_id')
    loop
      if (v_name in ('id', 'user_id', 'client_id') and v_type <> 'uuid')
         or (v_name in ('kind', 'title', 'status', 'task_id') and v_type <> 'text')
         or (v_name in ('start_at', 'end_at') and v_type <> 'timestamp with time zone') then
        raise exception 'Schedule Core SAFE STOP: public.appointments.% already exists as % , which is not the approved type. Nothing was changed.',
          v_name, v_type;
      end if;
    end loop;

    -- (i) Orphan / cross-owner rows. If the table exists with data, the two
    -- foreign keys below would fail at the ALTER with an opaque message. Say
    -- exactly which relationship is broken, and say it before any DDL runs.
    select count(*) into v_bad
      from public.appointments a
     where a.client_id is not null
       and not exists (
         select 1 from public.clients cl
          where cl.id = a.client_id and cl.user_id = a.user_id
       );
    if v_bad > 0 then
      raise exception 'Schedule Core SAFE STOP: % appointment row(s) reference a client that does not exist OR belongs to another account. The composite key cannot be added until they are resolved.', v_bad;
    end if;

    select count(*) into v_bad
      from public.appointments a
     where a.task_id is not null
       and not exists (
         select 1 from public.tasks tk
          where tk.id = a.task_id and tk.user_id = a.user_id
       );
    if v_bad > 0 then
      raise exception 'Schedule Core SAFE STOP: % appointment row(s) reference a task that does not exist OR belongs to another account. The composite key cannot be added until they are resolved.', v_bad;
    end if;
  end if;
end;
$$;

-- ===================================================================
-- PART 2 -- THE COMPOSITE UNIQUE KEY the task foreign key points at.
--
-- NO BLIND DROP. `drop constraint if exists <name>` followed by `add` is the
-- pattern earlier slices used, and it is WRONG for an FK target: dropping the
-- target of a foreign key either fails or takes the foreign key with it. So the
-- catalog is inspected first:
--     exact constraint already present            -> LEAVE IT ALONE
--     name taken, different columns / type / kind -> SAFE STOP
--     an equivalent unique over exactly (id, user_id) under another name
--                                                 -> keep it and skip
--     absent                                      -> add it
-- ===================================================================
do $$
declare
  v_cols       name[];
  v_contype    "char";
  v_deferrable boolean;
  v_other      text;
begin
  select con.contype, con.condeferrable,
         coalesce((
           select array_agg(att.attname order by k.ord)
             from unnest(con.conkey) with ordinality as k(attnum, ord)
             join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
         ), array[]::name[])
    into v_contype, v_deferrable, v_cols
    from pg_constraint con
   where con.conrelid = 'public.tasks'::regclass
     and con.conname = 'tasks_id_user_unique';

  if v_contype is not null then
    if v_contype <> 'u' or v_cols is distinct from array['id', 'user_id']::name[] then
      raise exception 'Schedule Core SAFE STOP: constraint tasks_id_user_unique already exists but is not UNIQUE (id, user_id) -- contype=%, columns=(%). Not replaced.',
        v_contype, coalesce(nullif(array_to_string(v_cols, ', '), ''), '<none>');
    end if;
    if v_deferrable then
      raise exception 'Schedule Core SAFE STOP: tasks_id_user_unique is DEFERRABLE. PostgreSQL cannot reference a deferrable unique key from a foreign key, so appointments_task_same_owner_fk would fail. Not replaced.';
    end if;
    raise notice 'Schedule Core: tasks_id_user_unique already present and correct -- left untouched.';
  else
    select con.conname into v_other
      from pg_constraint con
     where con.conrelid = 'public.tasks'::regclass
       and con.contype = 'u'
       and not con.condeferrable
       and (
         select coalesce(array_agg(att.attname order by k.ord), array[]::name[])
           from unnest(con.conkey) with ordinality as k(attnum, ord)
           join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
       ) = array['id', 'user_id']::name[]
     limit 1;

    if v_other is not null then
      raise notice 'Schedule Core: public.tasks already has an equivalent UNIQUE (id, user_id) named % -- reusing it.', v_other;
    else
      -- Cannot fail on existing data: `id` is already the PRIMARY KEY, so no
      -- two rows can share one, let alone an (id, user_id) pair.
      alter table public.tasks add constraint tasks_id_user_unique unique (id, user_id);
    end if;
  end if;
end;
$$;

-- ===================================================================
-- PART 3 -- THE TABLE.
-- ===================================================================

-- Canonical updated_at helper (already live; restated so this file is runnable
-- against a fresh database, exactly as S0B / Campaigns / F1 do).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- id is uuid with NO default: the client assigns it (api.uuid() ->
-- crypto.randomUUID()) so optimistic state and the stored row carry the same
-- id, matching charges / payments. client_id and task_id are NULLABLE on
-- purpose -- see L1.
create table if not exists public.appointments (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null default 'appointment',
  title      text not null,
  client_id  uuid,
  task_id    text,
  start_at   timestamptz not null,
  end_at     timestamptz,
  status     text not null default 'planned',
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- additive backfill (`create table if not exists` ALONE adds no missing column)
alter table public.appointments add column if not exists kind       text not null default 'appointment';
alter table public.appointments add column if not exists client_id  uuid;
alter table public.appointments add column if not exists task_id    text;
alter table public.appointments add column if not exists end_at     timestamptz;
alter table public.appointments add column if not exists status     text not null default 'planned';
alter table public.appointments add column if not exists notes      text;
alter table public.appointments add column if not exists created_at timestamptz not null default now();
alter table public.appointments add column if not exists updated_at timestamptz not null default now();

-- ---------------- ownership FK on a possibly PRE-EXISTING table ----------------
-- `create table if not exists` adds nothing to a table that already exists, so
-- an appointments table carrying a correctly typed NOT NULL user_id WITHOUT
-- `references auth.users (id) on delete cascade` would satisfy every check in
-- PART 1 and still leave deleted accounts' rows orphaned. Added only when
-- absent; if existing rows violate it the ALTER fails loudly, which is correct.
do $$
declare
  v_has boolean;
begin
  select exists (
    select 1
      from pg_constraint con
     where con.conrelid = 'public.appointments'::regclass
       and con.contype = 'f'
       and con.confrelid = 'auth.users'::regclass
       and con.conkey = array[(
         select att.attnum from pg_attribute att
          where att.attrelid = 'public.appointments'::regclass and att.attname = 'user_id'
       )]::int2[]
  ) into v_has;

  if not v_has then
    alter table public.appointments
      add constraint appointments_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end;
$$;

-- ===================================================================
-- PART 4 -- THE DOMAIN CHECKS.
-- drop-then-add is correct HERE (a CHECK constraint is never an FK target), and
-- it is what makes re-running this file converge on the approved definition
-- rather than silently keeping an older one.
-- ===================================================================

alter table public.appointments drop constraint if exists appointments_kind_allowed;
alter table public.appointments add  constraint appointments_kind_allowed
  check (kind in ('appointment', 'lesson', 'event'));

alter table public.appointments drop constraint if exists appointments_status_allowed;
alter table public.appointments add  constraint appointments_status_allowed
  check (status in ('planned', 'completed', 'cancelled', 'no_show'));

-- The end must be strictly after the start. NULL end_at is allowed and means
-- "no stated end" -- an open-ended appointment, not a zero-length one.
alter table public.appointments drop constraint if exists appointments_time_order;
alter table public.appointments add  constraint appointments_time_order
  check (end_at is null or end_at > start_at);

-- A blank title renders as an unidentifiable row in a day list. btrim, not
-- length: '   ' is blank.
alter table public.appointments drop constraint if exists appointments_title_bounded;
alter table public.appointments add  constraint appointments_title_bounded
  check (char_length(btrim(title)) between 1 and 160);

alter table public.appointments drop constraint if exists appointments_notes_bounded;
alter table public.appointments add  constraint appointments_notes_bounded
  check (notes is null or char_length(notes) <= 2000);

-- ===================================================================
-- PART 5 -- SAME-OWNER COMPOSITE FOREIGN KEYS.
-- These are the two constraints this slice exists for. Both are new (the table
-- is new), so there is no prior delete action to preserve and nothing to
-- replace: `drop constraint if exists` here only makes the file re-runnable.
-- ===================================================================

alter table public.appointments drop constraint if exists appointments_client_same_owner_fk;
alter table public.appointments add constraint appointments_client_same_owner_fk
  foreign key (client_id, user_id)
  references public.clients (id, user_id)
  on delete set null (client_id);

alter table public.appointments drop constraint if exists appointments_task_same_owner_fk;
alter table public.appointments add constraint appointments_task_same_owner_fk
  foreign key (task_id, user_id)
  references public.tasks (id, user_id)
  on delete set null (task_id);

-- ===================================================================
-- PART 6 -- INDEXES AND THE updated_at TRIGGER.
-- ===================================================================

-- The ONE read this product performs: "my appointments, in time order", sliced
-- to today or this week. Every list view is a range scan on this index.
create index if not exists idx_appointments_user_start
  on public.appointments (user_id, start_at);

-- Serves the referential-integrity scan that `on delete set null` runs on every
-- parent delete (without it, each delete seq-scans appointments) and the
-- "appointments of this client / task" read. Partial: while most rows are
-- unlinked, indexing the NULLs would be pure overhead.
create index if not exists idx_appointments_client_user
  on public.appointments (client_id, user_id) where client_id is not null;

create index if not exists idx_appointments_task_user
  on public.appointments (task_id, user_id) where task_id is not null;

drop trigger if exists trg_appointments_updated on public.appointments;
create trigger trg_appointments_updated before update on public.appointments
  for each row execute function public.set_updated_at();

-- ===================================================================
-- PART 7 -- ROW LEVEL SECURITY.
-- FOUR policies, one per command, all to `authenticated` -- the F1 shape, not
-- the older single `for all` policy. One policy per command is what makes a
-- future change to (say) DELETE reviewable on its own line.
-- ===================================================================
alter table public.appointments enable row level security;

drop policy if exists "appointments_own"        on public.appointments;
drop policy if exists "appointments_select_own" on public.appointments;
drop policy if exists "appointments_insert_own" on public.appointments;
drop policy if exists "appointments_update_own" on public.appointments;
drop policy if exists "appointments_delete_own" on public.appointments;

create policy "appointments_select_own" on public.appointments
  for select to authenticated
  using (auth.uid() = user_id);

create policy "appointments_insert_own" on public.appointments
  for insert to authenticated
  with check (auth.uid() = user_id);

-- USING scopes which rows may be updated; WITH CHECK forbids moving a row to
-- another account. Both are required; either one alone is a hole.
create policy "appointments_update_own" on public.appointments
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "appointments_delete_own" on public.appointments
  for delete to authenticated
  using (auth.uid() = user_id);

-- ===================================================================
-- PART 8 -- SELF-VERIFYING ASSERTIONS.
-- The migration proves its own postcondition and ABORTS if any part landed
-- differently than intended. A bare SET NULL -- the one mistake that would
-- break every client delete -- fails HERE rather than in production, months
-- later, the first time someone deletes a client who had an appointment.
--
-- Same alias discipline as PART 1: every declared name is `v_`-prefixed, and
-- the catalog aliases below (ci, ns, con, att, pol) are never declared names.
-- ===================================================================
do $$
declare
  v_fk       record;
  v_setcols  name[];
  v_n        int;
  v_rls      boolean;
  v_target   text;
begin
  -- 1. The table exists and RLS is ON.
  if to_regclass('public.appointments') is null then
    raise exception 'Schedule Core FAILED: public.appointments was not created.';
  end if;

  select ci.relrowsecurity into v_rls
    from pg_class ci
    join pg_namespace ns on ns.oid = ci.relnamespace
   where ns.nspname = 'public' and ci.relname = 'appointments';
  if not coalesce(v_rls, false) then
    raise exception 'Schedule Core FAILED: row level security is not enabled on public.appointments.';
  end if;

  -- 2. Exactly four policies, one per command, all to `authenticated`.
  select count(*) into v_n from pg_policies pol
   where pol.schemaname = 'public' and pol.tablename = 'appointments';
  if v_n <> 4 then
    raise exception 'Schedule Core FAILED: expected exactly 4 policies on public.appointments, found %.', v_n;
  end if;

  select count(*) into v_n from pg_policies pol
   where pol.schemaname = 'public' and pol.tablename = 'appointments'
     and pol.roles <> '{authenticated}'::name[];
  if v_n <> 0 then
    raise exception 'Schedule Core FAILED: % policy/policies on public.appointments are not scoped to the authenticated role alone.', v_n;
  end if;

  -- 3. NO SECURITY DEFINER function is introduced by this slice. The quota
  -- pattern drags one in, and its default `anon` EXECUTE grant needed its own
  -- migration to revoke (20260728130000). This slice declares no quota, so a
  -- definer function named for it can only be an accident.
  select count(*) into v_n
    from pg_proc pr
    join pg_namespace ns on ns.oid = pr.pronamespace
   where ns.nspname = 'public' and pr.prosecdef
     and pr.proname like '%appointment%';
  if v_n <> 0 then
    raise exception 'Schedule Core FAILED: % SECURITY DEFINER function(s) named for appointments exist. This slice declares none.', v_n;
  end if;

  -- 4. BOTH composite foreign keys, each checked in full: the referenced table,
  -- the delete action, and -- the assertion that matters most -- the SET NULL
  -- COLUMN LIST.
  foreach v_target in array array['client', 'task'] loop
    select con.oid, con.confdeltype, con.confrelid, con.confdelsetcols,
           (select coalesce(array_agg(att.attname order by k.ord), array[]::name[])
              from unnest(con.conkey) with ordinality as k(attnum, ord)
              join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum) as keycols
      into v_fk
      from pg_constraint con
     where con.conrelid = 'public.appointments'::regclass
       and con.contype = 'f'
       and con.conname = format('appointments_%s_same_owner_fk', v_target);

    if not found then
      raise exception 'Schedule Core FAILED: appointments_%_same_owner_fk was not created.', v_target;
    end if;

    if v_fk.keycols is distinct from array[v_target || '_id', 'user_id']::name[] then
      raise exception 'Schedule Core FAILED: appointments_%_same_owner_fk is not keyed on (%_id, user_id) -- found %. A single-column key would let one account reference another account''s rows.',
        v_target, v_target, array_to_string(v_fk.keycols, ', ');
    end if;

    if v_fk.confrelid <> format('public.%ss', v_target)::regclass then
      raise exception 'Schedule Core FAILED: appointments_%_same_owner_fk references % , not public.%s.',
        v_target, v_fk.confrelid::regclass::text, v_target;
    end if;

    -- 'n' = SET NULL. Anything else (cascade / restrict / no action) is a
    -- different product decision than the one that was approved.
    if v_fk.confdeltype <> 'n' then
      raise exception 'Schedule Core FAILED: appointments_%_same_owner_fk ON DELETE is not SET NULL (confdeltype=%). CASCADE here would erase the record that a lesson happened.',
        v_target, v_fk.confdeltype;
    end if;

    select coalesce(array_agg(att.attname order by att.attname), array[]::name[])
      into v_setcols
      from unnest(v_fk.confdelsetcols) as s(attnum)
      join pg_attribute att on att.attrelid = 'public.appointments'::regclass and att.attnum = s.attnum;

    if v_setcols is distinct from array[v_target || '_id']::name[] then
      raise exception 'Schedule Core FAILED: appointments_%_same_owner_fk ON DELETE SET NULL must name %_id ALONE -- found %. A bare SET NULL would also null appointments.user_id (NOT NULL) and make every parent delete fail.',
        v_target, v_target, coalesce(nullif(array_to_string(v_setcols, ', '), ''), '<all key columns>');
    end if;
  end loop;

  -- 5. The key the task FK points at is UNIQUE (id, user_id) and not deferrable.
  select con.contype into v_target
    from pg_constraint con
   where con.conrelid = 'public.tasks'::regclass and con.conname = 'tasks_id_user_unique';
  if v_target is null then
    -- An equivalent key under another name is acceptable (PART 2 reuses one),
    -- but SOME non-deferrable unique over exactly (id, user_id) must exist or
    -- the foreign key above could not have been created at all.
    select count(*) into v_n
      from pg_constraint con
     where con.conrelid = 'public.tasks'::regclass and con.contype = 'u' and not con.condeferrable
       and (select coalesce(array_agg(att.attname order by k.ord), array[]::name[])
              from unnest(con.conkey) with ordinality as k(attnum, ord)
              join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum)
           = array['id', 'user_id']::name[];
    if v_n = 0 then
      raise exception 'Schedule Core FAILED: public.tasks has no non-deferrable UNIQUE (id, user_id).';
    end if;
  end if;

  -- 6. public.tasks gained NOTHING BUT THE CONSTRAINT. This slice is additive to
  -- an existing table by exactly one UNIQUE key; a column added here by accident
  -- would be a change to a table outside the approved scope.
  --
  -- Deliberately NOT a total column count. A count pinned to today's schema
  -- (13 at the time of writing) would fail on the next legitimate task column
  -- added by some future slice, accusing THIS file of a change it did not make.
  -- The real invariant is narrower and permanent: none of the scheduling
  -- vocabulary may appear on public.tasks. Appointments live in their own table.
  select count(*) into v_n
    from information_schema.columns col
   where col.table_schema = 'public' and col.table_name = 'tasks'
     and col.column_name in ('start_at', 'end_at', 'kind', 'appointment_id', 'scheduled_at');
  if v_n <> 0 then
    raise exception 'Schedule Core FAILED: public.tasks carries % scheduling column(s). This migration must not add one -- an appointment is its own row, not a field on a task.', v_n;
  end if;

  -- And the PRIMARY KEY of public.tasks is STILL exactly (id): PART 2 adds an
  -- ADDITIONAL unique constraint, never a replacement primary key.
  select coalesce(array_agg(att.attname order by k.ord), array[]::name[])
    into v_setcols
    from pg_constraint con
    cross join lateral unnest(con.conkey) with ordinality as k(attnum, ord)
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
   where con.conrelid = 'public.tasks'::regclass and con.contype = 'p';
  if v_setcols is distinct from array['id']::name[] then
    raise exception 'Schedule Core FAILED: the PRIMARY KEY of public.tasks is no longer exactly (id) -- found %.',
      coalesce(nullif(array_to_string(v_setcols, ', '), ''), '<missing>');
  end if;

  -- 7. The instant columns really are timestamptz. A `date` here would silently
  -- discard the time of day, which is the entire slice.
  select count(*) into v_n
    from information_schema.columns col
   where col.table_schema = 'public' and col.table_name = 'appointments'
     and col.column_name in ('start_at', 'end_at')
     and col.data_type = 'timestamp with time zone';
  if v_n <> 2 then
    raise exception 'Schedule Core FAILED: start_at / end_at are not both timestamptz (% of 2).', v_n;
  end if;

  -- 8. start_at is NOT NULL and end_at IS nullable. An appointment with no
  -- start is not an appointment; an appointment with no stated end is ordinary.
  if exists (
    select 1 from information_schema.columns col
     where col.table_schema = 'public' and col.table_name = 'appointments'
       and col.column_name = 'start_at' and col.is_nullable = 'YES'
  ) then
    raise exception 'Schedule Core FAILED: appointments.start_at is nullable.';
  end if;
  if exists (
    select 1 from information_schema.columns col
     where col.table_schema = 'public' and col.table_name = 'appointments'
       and col.column_name = 'end_at' and col.is_nullable = 'NO'
  ) then
    raise exception 'Schedule Core FAILED: appointments.end_at is NOT NULL. An open-ended appointment must be expressible.';
  end if;
end;
$$;

-- ===================================================================
-- VERIFICATION -- run AFTER the migration. TWO PARTS, AND THEY ARE NOT THE
-- SAME KIND OF THING. Read PART B's warning before running any of it.
--
--   PART A (1-8):  READ-ONLY catalog checks. Pure SELECTs. Safe on any
--                  database, including Production, at any time.
--   PART B (9-17): MUTATING two-account acceptance controls. Every one of these
--                  WRITES, and controls 14/15 DELETE a client and a task row.
-- ===================================================================
--
-- ---------------- PART A -- READ-ONLY (modifies nothing) ----------------
-- 1. Table exists:
--      select to_regclass('public.appointments');
-- 2. RLS enabled:
--      select rowsecurity from pg_tables
--       where schemaname='public' and tablename='appointments';        -- expect true
-- 3. Exactly 4 policies, one per command, all {authenticated}, all own-row:
--      select policyname, cmd, roles, qual, with_check from pg_policies
--       where schemaname='public' and tablename='appointments' order by cmd;
--    -- expect 4 rows; every `roles` = {authenticated}; qual/with_check =
--    --   (auth.uid() = user_id); and NO policy mentioning row_count (no quota).
-- 4. Both composite foreign keys, in full:
--      select conname, pg_get_constraintdef(oid) from pg_constraint
--       where conrelid='public.appointments'::regclass and contype='f' order by conname;
--    -- expect:
--    --   FOREIGN KEY (client_id, user_id) REFERENCES clients(id, user_id) ON DELETE SET NULL (client_id)
--    --   FOREIGN KEY (task_id,   user_id) REFERENCES tasks(id, user_id)   ON DELETE SET NULL (task_id)
--    --   FOREIGN KEY (user_id)            REFERENCES auth.users(id)       ON DELETE CASCADE
-- 5. The referenced key on tasks:
--      select conname, pg_get_constraintdef(oid), condeferrable from pg_constraint
--       where conrelid='public.tasks'::regclass and contype='u';
--    -- expect UNIQUE (id, user_id), condeferrable = false
-- 6. The instant columns are timestamptz, start_at NOT NULL, end_at nullable:
--      select column_name, data_type, is_nullable, column_default
--        from information_schema.columns
--       where table_schema='public' and table_name='appointments' order by ordinal_position;
--    -- expect 12 columns; start_at/end_at = timestamp with time zone;
--    --   id has NO default (the client assigns it).
-- 7. Domain checks, indexes and triggers:
--      select conname, pg_get_constraintdef(oid) from pg_constraint
--       where conrelid='public.appointments'::regclass and contype='c' order by conname;   -- expect 5
--      select indexname from pg_indexes
--       where schemaname='public' and tablename='appointments' order by indexname;         -- expect 4 (pkey + 3)
--      select tgname from pg_trigger
--       where tgrelid='public.appointments'::regclass and not tgisinternal;                -- expect trg_appointments_updated ONLY
-- 8. No quota function was introduced:
--      select proname, prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public' and p.prosecdef and p.proname like '%appointment%';        -- expect 0 rows
--
-- ---------------- PART B -- MUTATING ACCEPTANCE CONTROLS ----------------
--
--   ⚠️ THESE STATEMENTS WRITE TO THE DATABASE. CONTROLS 14 AND 15 ARE
--   DESTRUCTIVE: they DELETE a client row and a task row.
--
--   MANDATORY PRECONDITIONS -- all three, before running anything in PART B:
--     (i)   Use DISPOSABLE QA RECORDS ONLY, created for this run, on QA
--           accounts. NEVER point these controls at a real client, a real task
--           or real business data. Prefix every QA record `SC_QA_`.
--     (ii)  Record the ids you create, so cleanup can be VERIFIED afterwards
--           rather than assumed.
--     (iii) Two accounts, A and B. Run each statement as the account named --
--           running control 12 as B instead of A inverts its meaning and it
--           would pass while proving nothing.
--
--  9. POSITIVE -- as A, own client KA and own task TA:                [WRITES]
--       insert into public.appointments (id,user_id,kind,title,client_id,task_id,start_at,end_at)
--       values ('<AP>','<A>','lesson','SC_QA_lesson','<KA>','<TA>',
--               '2026-08-03 07:30:00+00','2026-08-03 08:15:00+00');   -- expect 1 row
-- 10. NEGATIVE -- end_at not after start_at:      [attempts a write; must FAIL]
--       ... start_at '2026-08-03 08:00:00+00', end_at '2026-08-03 08:00:00+00'
--     -- expect ERROR 23514 on appointments_time_order
-- 11. NEGATIVE -- unknown kind, then unknown status:
--                                                 [attempts a write; must FAIL]
--       update public.appointments set kind='class'    where id='<AP>';  -- expect 23514
--       update public.appointments set status='maybe'  where id='<AP>';  -- expect 23514
-- 12. NEGATIVE -- THE ONE THIS SLICE EXISTS FOR. As A, naming B's client KB
--     (A cannot SELECT it, but can still name it):  [attempts a write; must FAIL]
--       update public.appointments set client_id='<KB>' where id='<AP>';
--     -- expect ERROR 23503 on appointments_client_same_owner_fk.
--     -- If this SUCCEEDS the key is single-column and the slice has failed.
--     -- A failed statement writes nothing, so this control leaves no residue.
-- 13. NEGATIVE -- as A, naming B's task TB:        [attempts a write; must FAIL]
--       update public.appointments set task_id='<TB>' where id='<AP>';
--     -- expect ERROR 23503 on appointments_task_same_owner_fk
-- 14. DELETION SEMANTICS, client:  [⚠️ DESTRUCTIVE -- DELETES QA CLIENT KA ⚠️]
--       delete from public.clients where id='<KA>';                   -- expect 1 row
--       select id, client_id, task_id, user_id from public.appointments where id='<AP>';
--     -- expect the appointment STILL PRESENT, client_id NULL, task_id UNCHANGED,
--     --   user_id UNCHANGED. A failure here ("null value in column user_id")
--     --   is the bare-SET-NULL bug.
-- 15. DELETION SEMANTICS, task:      [⚠️ DESTRUCTIVE -- DELETES QA TASK TA ⚠️]
--       delete from public.tasks where id='<TA>';                     -- expect 1 row
--       select id, task_id, user_id from public.appointments where id='<AP>';
--     -- expect still present, task_id NULL, user_id UNCHANGED.
-- 16. NEGATIVE -- cross-account isolation, as B:
--       select count(*) from public.appointments where id='<AP>';     -- expect 0
-- 17. POSITIVE -- status corrections are all reachable (L5):          [WRITES]
--       update public.appointments set status='no_show'   where id='<AP>';  -- 1 row
--       update public.appointments set status='completed' where id='<AP>';  -- 1 row
--
-- ---------------- PART B CLEANUP -- required, and VERIFIED not assumed ------
-- KA and TA are already gone (controls 14, 15). Remove the rest, then PROVE it:
--       delete from public.appointments where id='<AP>';       -- as A
--       delete from public.tasks        where id='<TB>';       -- as B
--       delete from public.clients      where id='<KB>';       -- as B
-- Verification query -- run as EACH account; expect 0 from every row:
--       select 'appointment AP' as record, count(*) from public.appointments where id='<AP>'
--       union all select 'client KA',  count(*) from public.clients  where id='<KA>'
--       union all select 'client KB',  count(*) from public.clients  where id='<KB>'
--       union all select 'task TA',    count(*) from public.tasks    where id='<TA>'
--       union all select 'task TB',    count(*) from public.tasks    where id='<TB>'
--       union all select 'SC_QA_ rows', count(*) from public.appointments where title like 'SC\_QA\_%';
-- A non-zero count means QA residue is still in the database -- finish the
-- cleanup before calling this acceptance run complete.
