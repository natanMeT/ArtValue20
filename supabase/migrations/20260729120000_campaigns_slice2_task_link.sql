-- ===================================================================
-- Migration (Campaigns slice 2): the OPTIONAL task -> campaign link.
--
-- WHAT THIS ADDS: one nullable column on public.tasks and one composite foreign
-- key. Nothing else. No table, no policy, no function, no trigger, no data.
--
-- THE WHOLE POINT IS THE COMPOSITE KEY.
--   foreign key (campaign_id, user_id) references public.campaigns (id, user_id)
-- A single-column FK on campaign_id alone would let account A link its task to
-- account B's campaign: RLS hides B's row from A's SELECT, but a foreign key is
-- checked by the system, NOT through RLS, so the reference would succeed and A
-- would hold a durable pointer into B's data. Carrying user_id INTO the key
-- makes that structurally impossible -- the referenced pair must exist, and A's
-- tasks always carry A's user_id, so only A's campaigns can ever satisfy it.
-- This is enforcement by the database, not by the client and not by a policy.
--
-- The key it points at, `campaigns_id_user_unique UNIQUE (id, user_id)`, was
-- created INERT by the slice 1 migration (20260728120000) for exactly this
-- moment. Verified live before this file was written: the index exists on
-- public.campaigns with columns in the order (id, user_id).
--
-- DELETION SEMANTICS -- `on delete set null (campaign_id)`, and the column list
-- is load-bearing.
--   Deleting a campaign UNLINKS its tasks; the tasks survive.
--   A bare `on delete set null` (no column list) nulls EVERY column of the key
--   -- including tasks.user_id, which is NOT NULL. Every campaign delete would
--   then fail with a not-null violation, and the failure would surface only
--   once someone actually deleted a campaign that had tasks. The column-subset
--   form nulls campaign_id ALONE and leaves ownership intact. It requires
--   PostgreSQL 15+; the live project runs 17.6 (verified before writing this).
--
-- NO BACKFILL, AND NONE IS NEEDED. Every existing task keeps campaign_id NULL
-- and remains valid: a composite FK is MATCH SIMPLE, so a NULL in any key
-- column skips the check entirely. That is not a loophole being tolerated --
-- it IS the optionality this slice was asked for.
--
-- SCOPE: additive + idempotent ONLY. No DROP TABLE, no DELETE, no UPDATE of
-- data, no change to any existing column, no change to RLS. public.tasks keeps
-- its S0B `tasks_own` policy verbatim; the new column inherits the table's
-- existing grants, so nothing needs re-granting.
--
-- HOW TO RUN (owner-gated): Supabase Dashboard -> SQL Editor -> paste -> Run,
--   or as this timestamped CLI migration. NEVER run by the app.
--
-- DECLARED LIMITATIONS (known, accepted, NOT fixed here):
--   L1 MATCH SIMPLE. A NULL campaign_id is unchecked. By design -- see above.
--   L2 No reverse cascade. Deleting a TASK never touches its campaign, and
--      there is no "campaign has N tasks" counter to keep in step.
--   L3 ON UPDATE is NO ACTION (the default). A campaign's (id, user_id) pair is
--      immutable in practice -- id is a PK and the UPDATE policy's WITH CHECK
--      already forbids moving a row to another account -- so an update would be
--      refused rather than propagated. Refusal is the safe direction.
-- ===================================================================

-- ---------------- fail-loud compatibility preflight ----------------
-- Every precondition this migration depends on is checked HERE, and any
-- mismatch aborts (SAFE STOP) before a single object is altered.
do $$
declare
  ukey_cols name[];
begin
  -- (a) Server version. `on delete set null (col)` is PG15+. Without this the
  -- failure would be a bare syntax error at the ALTER, pointing at the wrong
  -- thing. This statement runs first and says what is actually wrong.
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'Campaigns slice 2 SAFE STOP: PostgreSQL 15+ required for ON DELETE SET NULL (column-list); this server is %.',
      current_setting('server_version');
  end if;

  -- (b) Both tables must exist. This slice alters one and references the other.
  if to_regclass('public.tasks') is null then
    raise exception 'Campaigns slice 2 SAFE STOP: public.tasks does not exist (S0B migration not applied).';
  end if;
  if to_regclass('public.campaigns') is null then
    raise exception 'Campaigns slice 2 SAFE STOP: public.campaigns does not exist (Campaigns slice 1 not applied).';
  end if;

  -- (c) tasks.user_id must be uuid NOT NULL -- it is half of the composite key
  -- and the entire reason cross-account linking is impossible.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks'
      and column_name = 'user_id' and data_type = 'uuid' and is_nullable = 'NO'
  ) then
    raise exception 'Campaigns slice 2 SAFE STOP: public.tasks.user_id is not uuid NOT NULL.';
  end if;

  -- (d) THE REFERENCED KEY. A composite FK is rejected outright unless a UNIQUE
  -- (or PK) constraint covers exactly these columns. Checked by CONSTRAINT, not
  -- by index name: a same-named non-unique index would not satisfy the FK.
  select coalesce(array_agg(a.attname order by k.ord), array[]::name[])
    into ukey_cols
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
   where c.conrelid = 'public.campaigns'::regclass
     and c.contype = 'u'
     and c.conname = 'campaigns_id_user_unique';

  if ukey_cols is distinct from array['id', 'user_id']::name[] then
    raise exception 'Campaigns slice 2 SAFE STOP: campaigns_id_user_unique is not UNIQUE (id, user_id) -- found %.',
      coalesce(array_to_string(ukey_cols, ', '), '<missing>');
  end if;

  -- (e) A PRE-EXISTING campaign_id must match the approved optional column in
  -- FULL -- uuid, NULLABLE, and NO DEFAULT -- because `add column if not
  -- exists` below silently no-ops and would then build the FK on whatever
  -- shape is already there. Checking only the TYPE is not enough:
  --   * NOT NULL  -> every task insert from the untouched frontend fails, since
  --     TASK_FIELDS is an allow-list that never sends campaign_id.
  --   * DEFAULT   -> new tasks silently acquire a campaign_id nobody asked for,
  --     which then fails the composite FK (or, worse, succeeds and links the
  --     task to a campaign by accident).
  -- Each is reported separately: "wrong shape" would leave the operator
  -- guessing which of the three it is.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'campaign_id'
  ) then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'tasks'
        and column_name = 'campaign_id' and data_type = 'uuid'
    ) then
      raise exception 'Campaigns slice 2 SAFE STOP: public.tasks.campaign_id already exists and is not uuid (found %).',
        (select data_type from information_schema.columns
          where table_schema = 'public' and table_name = 'tasks' and column_name = 'campaign_id');
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'tasks'
        and column_name = 'campaign_id' and is_nullable = 'NO'
    ) then
      raise exception 'Campaigns slice 2 SAFE STOP: public.tasks.campaign_id already exists and is NOT NULL. The link is OPTIONAL; a required column breaks every task insert, because the frontend never sends campaign_id.';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'tasks'
        and column_name = 'campaign_id' and column_default is not null
    ) then
      raise exception 'Campaigns slice 2 SAFE STOP: public.tasks.campaign_id already exists with a DEFAULT (%). A defaulted link silently populates campaigns nobody chose.',
        (select column_default from information_schema.columns
          where table_schema = 'public' and table_name = 'tasks' and column_name = 'campaign_id');
    end if;

    -- A GENERATED ALWAYS column reports uuid / nullable / NO default, so every
    -- check above passes and the FK installs cleanly on an empty table. It is
    -- still wrong twice over: the value is DERIVED, so inserts compute a
    -- campaign id nobody chose (which then fails the FK), and a client can
    -- never assign the link explicitly, which is the only thing the column is
    -- for. `column_default` does not cover this -- a generated column's
    -- expression lives in `generation_expression`, not `column_default`.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'tasks'
        and column_name = 'campaign_id' and is_generated <> 'NEVER'
    ) then
      raise exception 'Campaigns slice 2 SAFE STOP: public.tasks.campaign_id already exists as a GENERATED column (%). The link must be client-assignable; a generated column can never be set explicitly.',
        (select generation_expression from information_schema.columns
          where table_schema = 'public' and table_name = 'tasks' and column_name = 'campaign_id');
    end if;
  end if;
end;
$$;

-- ---------------- the column ----------------
-- Nullable with no default: metadata-only, no table rewrite, and every existing
-- row is left unlinked and valid.
alter table public.tasks add column if not exists campaign_id uuid;

-- ---------------- the composite foreign key ----------------
alter table public.tasks drop constraint if exists tasks_campaign_same_owner_fk;
alter table public.tasks add constraint tasks_campaign_same_owner_fk
  foreign key (campaign_id, user_id)
  references public.campaigns (id, user_id)
  on delete set null (campaign_id);

-- Serves the referential-integrity scan that `on delete set null` runs on every
-- campaign delete (without it, each delete seq-scans tasks), and the "tasks of
-- this campaign" read the UI will want. Partial: while most tasks are unlinked,
-- indexing the NULLs would be pure overhead.
create index if not exists idx_tasks_campaign
  on public.tasks (campaign_id) where campaign_id is not null;

-- ---------------- self-verifying assertions ----------------
-- The migration proves its own postcondition and ABORTS if any part landed
-- differently than intended. In particular a bare SET NULL -- the one mistake
-- that would break every campaign delete -- fails HERE rather than in
-- production, months later, the first time someone deletes a campaign.
do $$
declare
  c record;
  setcols name[];
begin
  select con.oid, con.confdeltype, con.confupdtype, con.confmatchtype, con.confdelsetcols
    into c
    from pg_constraint con
   where con.conrelid = 'public.tasks'::regclass
     and con.contype = 'f'
     and con.conname = 'tasks_campaign_same_owner_fk';

  if not found then
    raise exception 'Campaigns slice 2 FAILED: tasks_campaign_same_owner_fk was not created.';
  end if;

  -- 'n' = SET NULL. Anything else (cascade / restrict / no action) is a
  -- different product decision than the one that was approved.
  if c.confdeltype <> 'n' then
    raise exception 'Campaigns slice 2 FAILED: ON DELETE is not SET NULL (confdeltype=%).', c.confdeltype;
  end if;

  -- THE ASSERTION THAT MATTERS MOST: SET NULL must apply to campaign_id ALONE.
  select coalesce(array_agg(a.attname order by a.attname), array[]::name[])
    into setcols
    from unnest(c.confdelsetcols) as s(attnum)
    join pg_attribute a on a.attrelid = 'public.tasks'::regclass and a.attnum = s.attnum;

  if setcols is distinct from array['campaign_id']::name[] then
    raise exception 'Campaigns slice 2 FAILED: ON DELETE SET NULL must name campaign_id alone -- found %. A bare SET NULL would also null tasks.user_id (NOT NULL) and make every campaign delete fail.',
      coalesce(nullif(array_to_string(setcols, ', '), ''), '<all key columns>');
  end if;
end;
$$;

-- ===================================================================
-- VERIFICATION -- run AFTER the migration. TWO PARTS, AND THEY ARE NOT THE
-- SAME KIND OF THING. Read PART B's warning before running any of it.
--
--   PART A (1-3): READ-ONLY catalog checks. Pure SELECTs. Safe on any database,
--                 including Production, at any time. They modify nothing.
--   PART B (4-8): MUTATING two-account acceptance controls. Every one of these
--                 WRITES, and control 7 DELETES A CAMPAIGN ROW. They are not
--                 verification in the same sense as PART A -- they are an
--                 acceptance run that changes data.
-- ===================================================================
--
-- ---------------- PART A -- READ-ONLY (modifies nothing) ----------------
-- 1. Column exists, is nullable, has no default, and is not generated:
--      select column_name, data_type, is_nullable, column_default, is_generated
--        from information_schema.columns
--       where table_schema='public' and table_name='tasks' and column_name='campaign_id';
--    -- expect uuid / YES / NULL / NEVER
-- 2. The FK definition, in full:
--      select conname, pg_get_constraintdef(oid) from pg_constraint
--       where conrelid='public.tasks'::regclass and conname='tasks_campaign_same_owner_fk';
--    -- expect: FOREIGN KEY (campaign_id, user_id) REFERENCES campaigns(id, user_id)
--    --         ON DELETE SET NULL (campaign_id)
-- 3. Existing tasks are untouched and still valid:
--      select count(*) from public.tasks where campaign_id is not null;  -- expect 0
--
-- ---------------- PART B -- MUTATING ACCEPTANCE CONTROLS ----------------
--
--   ⚠️ THESE STATEMENTS WRITE TO THE DATABASE. CONTROL 7 IS DESTRUCTIVE: it
--   DELETES a campaign row, and that delete is not undoable from the app.
--
--   MANDATORY PRECONDITIONS -- all three, before running anything in PART B:
--     (i)   Use DISPOSABLE QA RECORDS ONLY. Create campaigns CA and CB and task
--           TA specifically for this run, on QA accounts. NEVER point these
--           controls at a real campaign, a real task, or a real client's data.
--           Control 7 destroys whatever CA names.
--     (ii)  Record the ids you created, so cleanup can be verified afterwards
--           rather than assumed.
--     (iii) Two signed-in accounts, A and B. Run each statement as the account
--           named -- running control 5 as B instead of A inverts its meaning
--           and it would pass while proving nothing.
--
-- 4. POSITIVE CONTROL (own campaign links) -- as A, with QA campaign CA and QA
--    task TA:                                                        [WRITES]
--      update public.tasks set campaign_id='<CA>' where id='<TA>';   -- expect 1 row
-- 5. NEGATIVE CONTROL (THE ONE THIS SLICE EXISTS FOR) -- as A, using B's QA
--    campaign id CB (A cannot SELECT it, but can still name it):
--                                              [attempts a write; must FAIL]
--      update public.tasks set campaign_id='<CB>' where id='<TA>';
--    -- expect ERROR 23503 foreign key violation on tasks_campaign_same_owner_fk.
--    -- If this SUCCEEDS, the key is single-column and the slice has failed.
--    -- A failed statement writes nothing, so this control leaves no residue.
-- 6. POSITIVE CONTROL (unlink is always allowed):                    [WRITES]
--      update public.tasks set campaign_id=null where id='<TA>';     -- expect 1 row
-- 7. DELETION SEMANTICS -- as A, with TA linked to CA:
--                              [⚠️ DESTRUCTIVE -- PERMANENTLY DELETES CA ⚠️]
--      update public.tasks set campaign_id='<CA>' where id='<TA>';   -- relink first
--      delete from public.campaigns where id='<CA>';                 -- expect 1 row
--      select id, campaign_id, user_id from public.tasks where id='<TA>';
--    -- expect the task still present, campaign_id NULL, user_id UNCHANGED.
--    -- A failure here ("null value in column user_id") is the bare-SET-NULL bug.
-- 8. NEGATIVE CONTROL (a nonexistent campaign is refused too):
--                                              [attempts a write; must FAIL]
--      update public.tasks set campaign_id=gen_random_uuid() where id='<TA>';
--    -- expect ERROR 23503
--
-- ---------------- PART B CLEANUP -- required, and VERIFIED not assumed -------
-- CA is already gone (control 7 deleted it). Remove the remaining QA records
-- created for this run, then PROVE the removal rather than trusting it:
--      delete from public.tasks     where id='<TA>';        -- as A
--      delete from public.campaigns where id='<CB>';        -- as B
-- Verification query -- run as EACH account; expect 0 from every row:
--      select 'task TA'     as record, count(*) from public.tasks     where id='<TA>'
--      union all
--      select 'campaign CA', count(*) from public.campaigns where id='<CA>'
--      union all
--      select 'campaign CB', count(*) from public.campaigns where id='<CB>';
-- A non-zero count means QA residue is still in the database -- finish the
-- cleanup before calling this acceptance run complete.
