-- ===================================================================
-- Migration (Campaigns slice 1): the durable per-account BUSINESS campaign.
--
-- NAMING BOUNDARY -- READ THIS BEFORE EXTENDING ANYTHING HERE.
--   public.campaigns is a BUSINESS CAMPAIGN: a durable, per-account object
--   with a lifecycle and dates.
--   `src/creative/v2/campaignStore.js` is a CREATIVE SESSION: a device-local
--   localStorage record of one brief -> 3 concepts -> selection. Same word,
--   different lifetime by an order of magnitude. It is NOT the origin of this
--   table, it is NOT migrated into it, and the two never reference each other.
--
-- SERVER-SIDE ENFORCEMENT (the client is never the authority):
--   * status DOMAIN      -- CHECK constraint on the column.
--   * status TRANSITIONS -- a BEFORE UPDATE trigger. A CHECK cannot do this:
--     a CHECK sees one row, never the (OLD -> NEW) pair. This is the repo's
--     FIRST transition trigger; every earlier migration used CHECK/RLS only.
--   * 200-row quota      -- WITH CHECK of the INSERT and UPDATE policies,
--     counted by a SECURITY DEFINER function (see the recursion note below).
--   * ownership          -- RLS, own-row only, one policy per command.
--
-- SLICE 2 PREPARATION (deliberate, inert here): `unique (id, user_id)` exists
-- so a later `tasks.campaign_id` can carry the COMPOSITE foreign key
--   foreign key (campaign_id, user_id) references public.campaigns (id, user_id)
-- which is what makes cross-account linking structurally impossible. Nothing
-- in THIS slice references it; it costs one index and removes a second
-- migration against a table that will by then hold real data.
--
-- SCOPE: additive + idempotent ONLY. No DROP TABLE, no DELETE, no UPDATE of
-- data, no user-specific INSERT, no change to any existing table. There is NO
-- data migration: device-local creative-session records are LEGACY and are
-- never read, converted, copied or deleted by this slice.
--
-- HOW TO RUN (owner-gated): Supabase Dashboard -> SQL Editor -> paste -> Run,
--   or as this timestamped CLI migration. NEVER run by the app.
--   Post-migration verification (positive AND negative controls) lives in the
--   PR body, not in this file -- this file is DDL only.
--
-- DECLARED LIMITATIONS (known, accepted, NOT fixed here):
--   L1 Concurrency. The quota predicate counts inside the statement snapshot,
--      so two simultaneous inserts at 199 can both pass and reach 201. It
--      bounds growth; it is not a security boundary. (Same shape as the
--      Asset Library's declared L1.)
--   L2 Quota operator is INTENTIONALLY asymmetric between the two policies:
--      INSERT uses `< 200`, UPDATE uses `<= 200`. Using `< 200` on UPDATE too
--      would lock an account that is exactly AT 200 out of editing OR
--      cancelling ANY campaign -- the state from which the only recovery is
--      editing or deleting. An UPDATE cannot raise the row count, and RLS
--      already forbids moving a row between accounts, so the UPDATE predicate
--      adds no bypass protection; it is present so the quota cannot be
--      removed from one policy without the other being noticed.
--   L3 Terminal states are final. completed/cancelled -> anything is refused.
--      Reopening is out of scope for this slice, by design, not by omission.
--   L4 No account-deletion cleanup beyond `on delete cascade` on user_id.
-- ===================================================================

-- ---------------- fail-loud compatibility preflight ----------------
-- Runs ONLY when public.campaigns already exists. Any structural mismatch with
-- what the app relies on aborts the migration (SAFE STOP) instead of silently
-- continuing. A fresh install skips this entirely.
do $$
declare
  r record;
begin
  if to_regclass('public.campaigns') is null then
    return; -- fresh install
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'campaigns'
      and table_type = 'BASE TABLE'
  ) then
    raise exception 'Campaigns preflight SAFE STOP: public.campaigns exists but is not a base table.';
  end if;

  -- PRIMARY KEY must be EXACTLY (id) -- the composite UNIQUE that slice 2
  -- depends on is an ADDITIONAL constraint, never a replacement PK.
  if (
    select coalesce(array_agg(a.attname order by a.attname), array[]::name[])
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
    where i.indrelid = 'public.campaigns'::regclass and i.indisprimary
  ) is distinct from array['id']::name[] then
    raise exception 'Campaigns preflight SAFE STOP: public.campaigns primary key is not exactly (id).';
  end if;

  -- id + user_id must be uuid NOT NULL: both are load-bearing for slice 2's
  -- composite FK, and user_id is the whole isolation story.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaigns'
      and column_name = 'id' and data_type = 'uuid' and is_nullable = 'NO'
  ) then
    raise exception 'Campaigns preflight SAFE STOP: public.campaigns.id is not uuid NOT NULL.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaigns'
      and column_name = 'user_id' and data_type = 'uuid' and is_nullable = 'NO'
  ) then
    raise exception 'Campaigns preflight SAFE STOP: public.campaigns.user_id is not uuid NOT NULL.';
  end if;

  -- EXISTING expected columns must have the expected type (a MISSING column is
  -- fine -- added below by ADD COLUMN IF NOT EXISTS).
  for r in
    select * from (values
      ('title',      'text'),
      ('objective',  'text'),
      ('status',     'text'),
      ('start_date', 'date'),
      ('end_date',   'date')
    ) as t(col, typ)
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'campaigns' and column_name = r.col
    ) and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'campaigns'
        and column_name = r.col and data_type = r.typ
    ) then
      raise exception 'Campaigns preflight SAFE STOP: public.campaigns.% is not %.', r.col, r.typ;
    end if;
  end loop;

  -- No NOT NULL column without a default that the app's insert does not send.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'campaigns'
      and is_nullable = 'NO' and column_default is null
      and column_name not in ('id', 'user_id', 'title')
  ) then
    raise exception 'Campaigns preflight SAFE STOP: public.campaigns has a NOT NULL column without a default that the app insert does not populate.';
  end if;
end;
$$;

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

-- ---------------- table ----------------
create table if not exists public.campaigns (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  objective  text,
  status     text not null default 'draft',
  start_date date,
  end_date   date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- additive backfill (create table if not exists ALONE adds no missing column)
alter table public.campaigns add column if not exists objective  text;
alter table public.campaigns add column if not exists status     text not null default 'draft';
alter table public.campaigns add column if not exists start_date date;
alter table public.campaigns add column if not exists end_date   date;
alter table public.campaigns add column if not exists created_at timestamptz not null default now();
alter table public.campaigns add column if not exists updated_at timestamptz not null default now();

-- ---------------- constraints (idempotent: drop-then-add) ----------------
-- The status DOMAIN. The transition GRAPH is a trigger (a CHECK sees one row).
alter table public.campaigns drop constraint if exists campaigns_status_allowed;
alter table public.campaigns add  constraint campaigns_status_allowed
  check (status in ('draft', 'active', 'completed', 'cancelled'));

-- A title is what the list screen shows; a blank one produces an unidentifiable
-- row. btrim so whitespace cannot satisfy it.
alter table public.campaigns drop constraint if exists campaigns_title_bounded;
alter table public.campaigns add  constraint campaigns_title_bounded
  check (length(btrim(title)) between 1 and 120);

alter table public.campaigns drop constraint if exists campaigns_objective_bounded;
alter table public.campaigns add  constraint campaigns_objective_bounded
  check (objective is null or length(objective) <= 200);

-- Dates are optional, but an inverted range is never meaningful.
alter table public.campaigns drop constraint if exists campaigns_date_order;
alter table public.campaigns add  constraint campaigns_date_order
  check (start_date is null or end_date is null or end_date >= start_date);

-- SLICE 2 PREPARATION. Inert in this slice. This is the constraint a composite
-- FK on tasks(campaign_id, user_id) requires: without it, `references
-- campaigns (id, user_id)` is rejected outright, because a composite FK must
-- point at a UNIQUE (or PK) key over exactly those columns.
alter table public.campaigns drop constraint if exists campaigns_id_user_unique;
alter table public.campaigns add  constraint campaigns_id_user_unique unique (id, user_id);

create index if not exists campaigns_user_created_idx
  on public.campaigns (user_id, created_at desc);

-- ---------------- updated_at trigger ----------------
drop trigger if exists trg_campaigns_updated on public.campaigns;
create trigger trg_campaigns_updated before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ===================================================================
-- STATUS TRANSITION AUTHORITY -- server-side, not advisory.
--
--   draft ---> active ---> completed
--     |          |
--     +--> cancelled <-----+
--
-- completed and cancelled are TERMINAL (L3). status unchanged is always
-- allowed, so editing a title never trips this.
--
-- SECURITY INVOKER: this must NOT run with elevated rights. It reads only OLD
-- and NEW; running it as the definer would grant nothing and widen the surface.
-- errcode 23514 (check_violation) so the client can map it to a truthful
-- message without string-matching.
-- ===================================================================
create or replace function public.campaign_enforce_status_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if old.status = 'draft' and new.status in ('active', 'cancelled') then
    return new;
  end if;
  if old.status = 'active' and new.status in ('completed', 'cancelled') then
    return new;
  end if;
  raise exception 'campaigns: illegal status transition % -> %', old.status, new.status
    using errcode = '23514';
end;
$$;

-- Plain BEFORE UPDATE, deliberately NOT `before update of status`: the column
-- form fires only when `status` appears in the statement's SET list, which
-- makes enforcement depend on how the client writes its UPDATE. This form
-- always fires and the function short-circuits when the value is unchanged.
drop trigger if exists trg_campaigns_status_transition on public.campaigns;
create trigger trg_campaigns_status_transition before update on public.campaigns
  for each row execute function public.campaign_enforce_status_transition();

-- ===================================================================
-- ROW LEVEL SECURITY -- a user can only touch rows where user_id = auth.uid()
-- ===================================================================
alter table public.campaigns enable row level security;

-- ---------------- quota authority ----------------
-- WHY A FUNCTION AND NOT AN INLINE SUBQUERY: the predicate lives in a policy ON
-- public.campaigns and must COUNT public.campaigns. Reading that table from its
-- own policy re-enters the policy -> infinite recursion. A SECURITY DEFINER
-- function runs with the definer's rights and so does NOT re-enter RLS, which
-- breaks the cycle. (Same trap, same answer, as public.asset_row_count().)
--
-- WHY NO PARAMETER: it reads auth.uid() itself. A `p_owner uuid` argument would
-- let any caller count another account's rows.
create or replace function public.campaign_row_count()
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  select count(*)::int
  from public.campaigns
  where user_id = (select auth.uid());
$$;

revoke all on function public.campaign_row_count() from public;
grant execute on function public.campaign_row_count() to authenticated;

-- ---------------- policies (one per command) ----------------
-- Split by command rather than a single FOR ALL, because a FOR ALL WITH CHECK
-- would apply the INSERT quota to UPDATE as well -- see L2. SELECT and DELETE
-- must never be gated by the quota: deleting is how a full account recovers.
drop policy if exists "campaigns_own" on public.campaigns;
drop policy if exists "campaigns_select_own" on public.campaigns;
drop policy if exists "campaigns_insert_own" on public.campaigns;
drop policy if exists "campaigns_update_own" on public.campaigns;
drop policy if exists "campaigns_delete_own" on public.campaigns;

create policy "campaigns_select_own" on public.campaigns
  for select to authenticated
  using (auth.uid() = user_id);

create policy "campaigns_insert_own" on public.campaigns
  for insert to authenticated
  with check (
    auth.uid() = user_id
    -- SERVER-SIDE ROW QUOTA (200). The client mirror in src/lib/campaigns.js is
    -- advisory only and exists to refuse with a truthful message; THIS is the
    -- authority.
    and public.campaign_row_count() < 200
  );

create policy "campaigns_update_own" on public.campaigns
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    -- `<=` not `<` -- see declared limitation L2. An account at exactly 200
    -- must still be able to edit and cancel; that is the only way out.
    and public.campaign_row_count() <= 200
  );

create policy "campaigns_delete_own" on public.campaigns
  for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.campaigns to authenticated;

-- ===================================================================
-- VERIFICATION (read-only -- run AFTER the migration; none of these modify data)
-- ===================================================================
-- 1. Table exists:      select to_regclass('public.campaigns');
-- 2. RLS enabled:       select rowsecurity from pg_tables
--                        where schemaname='public' and tablename='campaigns';  -- expect true
-- 3. Policies:          select policyname, cmd, qual, with_check from pg_policies
--                        where schemaname='public' and tablename='campaigns';
--    -- expect 4 rows: select/insert/update/delete, each own-row; insert
--    --   with_check contains campaign_row_count() < 200; update contains <= 200
-- 4. Composite unique:  select conname, pg_get_constraintdef(oid)
--                        from pg_constraint where conrelid='public.campaigns'::regclass
--                          and conname='campaigns_id_user_unique';   -- expect UNIQUE (id, user_id)
-- 5. Transition trigger: select tgname from pg_trigger
--                        where tgrelid='public.campaigns'::regclass and not tgisinternal;
--    -- expect trg_campaigns_updated + trg_campaigns_status_transition
-- 6. NEGATIVE CONTROL (illegal transition) -- as a signed-in account that owns
--    campaign X in status 'draft':
--      update public.campaigns set status='completed' where id='<X>';
--    -- expect ERROR 23514 "illegal status transition draft -> completed", 0 rows
-- 7. POSITIVE CONTROL (legal transition):
--      update public.campaigns set status='active' where id='<X>';   -- expect 1 row
-- 8. NEGATIVE CONTROL (quota) -- with 200 rows owned, insert one more:
--    -- expect ERROR 42501 new row violates row-level security policy
-- 9. POSITIVE CONTROL (quota does NOT lock editing at the cap) -- with exactly
--    200 rows owned:
--      update public.campaigns set title = title where id='<any owned>';
--    -- expect 1 row. This is the control that proves L2 was implemented and
--    -- not merely described.
-- 10. NEGATIVE CONTROL (isolation) -- as account A:
--      select count(*) from public.campaigns where user_id='<B uuid>';  -- expect 0
