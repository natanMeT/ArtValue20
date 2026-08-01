-- ===================================================================
-- Migration (Asset Library slice 3): the OPTIONAL asset -> campaign link.
--
-- WHAT THIS ADDS: one nullable column on public.assets, one composite foreign
-- key, one partial index, and ONE column added to the existing UPDATE grant.
-- Nothing else. No table, no policy, no function, no trigger, no data.
--
-- THE COMPOSITE KEY IS THE POINT (same reasoning as Campaigns slice 2).
--   foreign key (campaign_id, user_id) references public.campaigns (id, user_id)
-- A single-column FK on campaign_id alone would let account A link its asset to
-- account B's campaign: RLS hides B's row from A's SELECT, but a foreign key is
-- checked by the SYSTEM, not through RLS, so the reference would succeed and A
-- would hold a durable pointer into B's data. Carrying user_id INTO the key
-- makes that structurally impossible -- the referenced pair must exist, and A's
-- assets always carry A's user_id, so only A's campaigns can ever satisfy it.
--
-- The key it points at, `campaigns_id_user_unique UNIQUE (id, user_id)`, was
-- created INERT by Campaigns slice 1 (20260728120000) and has now served this
-- purpose twice. Verified live before this file was written.
--
-- DELETION SEMANTICS -- `on delete set null (campaign_id)`, and the column list
-- is load-bearing.
--   Deleting a campaign UNLINKS its assets; the assets survive.
--   A bare `on delete set null` (no column list) nulls EVERY column of the key
--   -- including assets.user_id, which is NOT NULL. Every campaign delete would
--   then fail with a not-null violation, and only once someone actually deleted
--   a campaign that had assets. The column-subset form nulls campaign_id ALONE.
--   It requires PostgreSQL 15+; the preflight checks that FIRST.
--
-- ===================================================================
-- THE GRANT IS THE WRITABLE SURFACE -- READ THIS BEFORE CHANGING ANYTHING.
--
-- Asset Library slice 2 (20260803120000) revoked the TABLE-WIDE update and left
-- `authenticated` holding a COLUMN grant on `is_favorite` alone. A policy cannot
-- restrict which columns an UPDATE touches; the GRANT does. Consequently a
-- `campaign_id` column added WITHOUT touching the grant would be unwritable by
-- every client path -- not merely unused, but structurally unreachable.
--
-- That is why this slice is NOT "the column now, the UI later". Campaigns slice
-- 2 added tasks.campaign_id with no client side and the column sat unusable for
-- two releases until slice 3 was needed just to expose it. Here it would have
-- been worse: blocked by the grant as well. The column, the grant and the UI
-- ship together, deliberately.
--
-- The revoke/grant pair below is idempotent and self-repairing: revoking the
-- table-level UPDATE also drops any column-level UPDATE grants, so whatever
-- exists beforehand, afterwards `authenticated` can write EXACTLY
-- (is_favorite, campaign_id) and `anon` can write nothing.
-- ===================================================================
--
-- SCOPE: additive + idempotent ONLY. No DROP TABLE, no DELETE, no UPDATE of
-- data, no change to any existing column, no new policy. The slice 2 UPDATE
-- policy is reused VERBATIM -- see the naming note at the comment below.
--
-- NOT TOUCHED BY THIS SLICE (asserted in the postconditions, not assumed):
--   * the `assets` bucket, its MIME allowlist and its file_size_limit
--   * all three storage.objects policies -- none added, changed or dropped
--   * the 40-item quota on both sides, and the counter functions
--   * the storage_path CHECK, the path shape, and signed-URL-only access
--   * `assets_kind_allowed` (kind = 'image'). Video remains out of scope.
--   * public.campaigns -- referenced only; not altered in any way
--
-- HOW TO RUN (owner-gated): Supabase Dashboard -> SQL Editor -> paste -> Run,
--   or as this timestamped CLI migration. NEVER run by the app.
--
-- DECLARED LIMITATIONS (known, accepted, NOT fixed here):
--   L7  MATCH SIMPLE. A NULL campaign_id is unchecked. That IS the optionality
--       this slice was asked for, not a loophole being tolerated.
--   L8  No reverse counter. There is no "campaign has N assets", and deleting
--       an asset never touches its campaign.
--   L9  Deleting a campaign unlinks its assets ON THE SERVER, but a client
--       holding an older snapshot still shows the old id until it re-reads. The
--       client resolves such an id to "campaign unknown" -- never to a guessed
--       name, and never to "no campaign".
--   L10 Re-running the slice 2 migration ALONE after this one would pass its own
--       preflight (it checks the policy NAME, not the grant) and would NARROW
--       the grant back to is_favorite, silently disabling the link. Ordered
--       replay of the whole set is unaffected. Declared, not solved -- an
--       applied migration is never edited.
--   L11 Campaigns in EVERY status are linkable, including completed/cancelled.
--       A status restriction would be a client-only rule with no server
--       counterpart, which is exactly the class this repository avoids.
--   L12 An asset links to AT MOST ONE campaign. Many-to-many is a different
--       data model (a join table) and is out of scope.
-- ===================================================================

-- ---------------- fail-loud compatibility preflight ----------------
do $$
declare
  ukey_cols name[];
begin
  -- (a) Server version FIRST. `on delete set null (col)` is PG15+. Without this
  -- the failure would be a bare syntax error at the ALTER, pointing at the
  -- wrong thing entirely.
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'Asset Library slice 3 SAFE STOP: PostgreSQL 15+ required for ON DELETE SET NULL (column-list); this server is %.',
      current_setting('server_version');
  end if;

  -- (b) Both tables must exist. This slice alters one and references the other.
  if to_regclass('public.assets') is null then
    raise exception 'Asset Library slice 3 SAFE STOP: public.assets does not exist -- Asset Library slice 1 has not been applied.';
  end if;
  if to_regclass('public.campaigns') is null then
    raise exception 'Asset Library slice 3 SAFE STOP: public.campaigns does not exist -- Campaigns slice 1 has not been applied.';
  end if;

  -- (c) assets.user_id must be uuid NOT NULL -- it is half of the composite key
  -- and the entire reason cross-account linking is impossible.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'assets'
      and column_name = 'user_id' and data_type = 'uuid' and is_nullable = 'NO'
  ) then
    raise exception 'Asset Library slice 3 SAFE STOP: public.assets.user_id is not uuid NOT NULL.';
  end if;

  -- (d) THE REFERENCED KEY. A composite FK is rejected outright unless a UNIQUE
  -- (or PK) constraint covers exactly these columns IN THIS ORDER. Checked by
  -- CONSTRAINT, not by index name: a same-named non-unique index would not
  -- satisfy the FK.
  select coalesce(array_agg(a.attname order by k.ord), array[]::name[])
    into ukey_cols
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
   where c.conrelid = 'public.campaigns'::regclass
     and c.contype = 'u'
     and c.conname = 'campaigns_id_user_unique';

  if ukey_cols is distinct from array['id', 'user_id']::name[] then
    raise exception 'Asset Library slice 3 SAFE STOP: campaigns_id_user_unique is not UNIQUE (id, user_id) -- found %.',
      coalesce(nullif(array_to_string(ukey_cols, ', '), ''), '<missing>');
  end if;

  -- (e) SLICE 1 SHAPE. The three row policies must all still be there.
  if (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'assets'
      and policyname in ('assets_select_own', 'assets_insert_own', 'assets_delete_own')
  ) <> 3 then
    raise exception 'Asset Library slice 3 SAFE STOP: the three slice 1 policies on public.assets are not all present.';
  end if;

  -- (f) SLICE 2 SHAPE. This slice EXTENDS the slice 2 update seam rather than
  -- creating one, so that seam must be present and must be the ONLY one:
  -- policies for the same command are OR-ed, so a second permissive UPDATE
  -- policy would be a hole, not an addition.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'assets'
      and policyname = 'assets_update_favorite_own' and cmd = 'UPDATE'
  ) then
    raise exception 'Asset Library slice 3 SAFE STOP: assets_update_favorite_own is missing -- Asset Library slice 2 has not been applied.';
  end if;
  if (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'assets' and cmd = 'UPDATE'
  ) <> 1 then
    raise exception 'Asset Library slice 3 SAFE STOP: public.assets has more than one UPDATE policy -- they would be OR-ed together.';
  end if;

  -- (g) A PRE-EXISTING campaign_id must match the approved OPTIONAL column in
  -- FULL, because `add column if not exists` below silently no-ops and the FK
  -- would then be built on whatever shape is already there. Each failure mode
  -- is reported separately -- "wrong shape" would leave the operator guessing.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'assets' and column_name = 'campaign_id'
  ) then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'assets'
        and column_name = 'campaign_id' and data_type = 'uuid'
    ) then
      raise exception 'Asset Library slice 3 SAFE STOP: public.assets.campaign_id already exists and is not uuid (found %).',
        (select data_type from information_schema.columns
          where table_schema = 'public' and table_name = 'assets' and column_name = 'campaign_id');
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'assets'
        and column_name = 'campaign_id' and is_nullable = 'NO'
    ) then
      raise exception 'Asset Library slice 3 SAFE STOP: public.assets.campaign_id already exists and is NOT NULL. The link is OPTIONAL; a required column breaks every asset insert, because the client insert never sends campaign_id.';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'assets'
        and column_name = 'campaign_id' and column_default is not null
    ) then
      raise exception 'Asset Library slice 3 SAFE STOP: public.assets.campaign_id already exists with a DEFAULT (%). A defaulted link silently populates campaigns nobody chose.',
        (select column_default from information_schema.columns
          where table_schema = 'public' and table_name = 'assets' and column_name = 'campaign_id');
    end if;

    -- A GENERATED ALWAYS column reports uuid / nullable / NO default, so every
    -- check above passes and the FK installs cleanly. It is still wrong twice
    -- over: the value is DERIVED, and a client could never assign the link,
    -- which is the only thing the column is for. `column_default` does not
    -- cover this -- the expression lives in `generation_expression`.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'assets'
        and column_name = 'campaign_id' and is_generated <> 'NEVER'
    ) then
      raise exception 'Asset Library slice 3 SAFE STOP: public.assets.campaign_id already exists as a GENERATED column (%). The link must be client-assignable.',
        (select generation_expression from information_schema.columns
          where table_schema = 'public' and table_name = 'assets' and column_name = 'campaign_id');
    end if;
  end if;
end;
$$;

-- ---------------- the column ----------------
-- Nullable with no default: metadata-only, no table rewrite, and every existing
-- row is left unlinked and valid.
alter table public.assets add column if not exists campaign_id uuid;

-- ---------------- the composite foreign key ----------------
alter table public.assets drop constraint if exists assets_campaign_same_owner_fk;
alter table public.assets add constraint assets_campaign_same_owner_fk
  foreign key (campaign_id, user_id)
  references public.campaigns (id, user_id)
  on delete set null (campaign_id);

-- Serves the referential-integrity scan that `on delete set null` runs on every
-- campaign delete (without it, each delete seq-scans assets). Partial: while
-- most assets are unlinked, indexing the NULLs would be pure overhead.
create index if not exists idx_assets_campaign
  on public.assets (campaign_id) where campaign_id is not null;

-- ---------------- the grant -- THE actual writable surface ----------------
-- See the header. The revoke is not defensive noise: it is what guarantees the
-- final state regardless of what privileges existed beforehand.
revoke update on public.assets from public;
revoke update on public.assets from anon;
revoke update on public.assets from authenticated;

grant update (is_favorite, campaign_id) on public.assets to authenticated;

-- The slice 2 policy now governs a second column. Its NAME is deliberately
-- unchanged: renaming it would make the slice 2 migration's own preflight
-- ("an unexpected UPDATE policy already exists") fail on replay, buying nothing.
-- The comment carries the truth instead.
comment on policy "assets_update_favorite_own" on public.assets is
  'Owner-only UPDATE (created by Asset Library slice 2). The WRITABLE SURFACE is the column GRANT, not this policy: is_favorite (slice 2) + campaign_id (slice 3). Name is historical -- see 20260804120000.';

-- ===================================================================
-- POSTCONDITIONS -- this migration verifies its own claims and aborts if any
-- of them is false. A migration that can assert its outcome should not leave
-- that to a reviewer's reading.
-- ===================================================================
do $$
declare
  c record;
  setcols name[];
  refcols name[];
begin
  -- ---- the column ----
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'assets'
      and column_name = 'campaign_id' and data_type = 'uuid'
      and is_nullable = 'YES' and column_default is null and is_generated = 'NEVER'
  ) then
    raise exception 'Asset Library slice 3 POSTCONDITION FAILED: campaign_id is not a nullable uuid with no default and no generation expression.';
  end if;

  -- ---- the foreign key ----
  select con.oid, con.confdeltype, con.confkey, con.confrelid, con.confdelsetcols
    into c
    from pg_constraint con
   where con.conrelid = 'public.assets'::regclass
     and con.contype = 'f'
     and con.conname = 'assets_campaign_same_owner_fk';

  if not found then
    raise exception 'Asset Library slice 3 POSTCONDITION FAILED: assets_campaign_same_owner_fk was not created.';
  end if;

  if c.confrelid <> 'public.campaigns'::regclass then
    raise exception 'Asset Library slice 3 POSTCONDITION FAILED: the foreign key does not reference public.campaigns.';
  end if;

  -- It must reference (id, user_id) -- a key on id ALONE is precisely the
  -- cross-account hole this slice exists to make impossible.
  select coalesce(array_agg(a.attname order by k.ord), array[]::name[])
    into refcols
    from unnest(c.confkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum;

  if refcols is distinct from array['id', 'user_id']::name[] then
    raise exception 'Asset Library slice 3 POSTCONDITION FAILED: the foreign key references campaigns(%) -- it must be (id, user_id), or account A could link to account B''s campaign.',
      coalesce(nullif(array_to_string(refcols, ', '), ''), '<none>');
  end if;

  -- 'n' = SET NULL. Anything else is a different product decision.
  if c.confdeltype <> 'n' then
    raise exception 'Asset Library slice 3 POSTCONDITION FAILED: ON DELETE is not SET NULL (confdeltype=%).', c.confdeltype;
  end if;

  -- THE ASSERTION THAT MATTERS MOST: SET NULL must apply to campaign_id ALONE.
  select coalesce(array_agg(a.attname order by a.attname), array[]::name[])
    into setcols
    from unnest(c.confdelsetcols) as s(attnum)
    join pg_attribute a on a.attrelid = 'public.assets'::regclass and a.attnum = s.attnum;

  if setcols is distinct from array['campaign_id']::name[] then
    raise exception 'Asset Library slice 3 POSTCONDITION FAILED: ON DELETE SET NULL must name campaign_id alone -- found %. A bare SET NULL would also null assets.user_id (NOT NULL) and make every campaign delete fail.',
      coalesce(nullif(array_to_string(setcols, ', '), ''), '<all key columns>');
  end if;

  -- ---- the writable surface: EXACTLY two columns, for exactly one role ----
  if not has_column_privilege('authenticated', 'public.assets', 'is_favorite', 'UPDATE') then
    raise exception 'Asset Library slice 3 POSTCONDITION FAILED: authenticated cannot update is_favorite -- slice 2 has been broken.';
  end if;
  if not has_column_privilege('authenticated', 'public.assets', 'campaign_id', 'UPDATE') then
    raise exception 'Asset Library slice 3 POSTCONDITION FAILED: authenticated cannot update campaign_id -- the column would be unreachable.';
  end if;
  if has_table_privilege('authenticated', 'public.assets', 'UPDATE') then
    raise exception 'Asset Library slice 3 POSTCONDITION FAILED: authenticated still holds a TABLE-WIDE update grant.';
  end if;

  -- Every other column, named explicitly. A loop over information_schema would
  -- silently cover a column added later; naming them is the point.
  if has_column_privilege('authenticated', 'public.assets', 'id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assets', 'user_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assets', 'ext', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assets', 'mime', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assets', 'byte_size', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assets', 'storage_path', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assets', 'kind', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assets', 'source', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assets', 'prompt', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assets', 'preset', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assets', 'engine', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assets', 'created_at', 'UPDATE')
  then
    raise exception 'Asset Library slice 3 POSTCONDITION FAILED: authenticated can update a column other than (is_favorite, campaign_id).';
  end if;

  if has_table_privilege('anon', 'public.assets', 'UPDATE')
     or has_column_privilege('anon', 'public.assets', 'is_favorite', 'UPDATE')
     or has_column_privilege('anon', 'public.assets', 'campaign_id', 'UPDATE')
  then
    raise exception 'Asset Library slice 3 POSTCONDITION FAILED: anon holds an update grant on public.assets.';
  end if;

  -- ---- slices 1 and 2 intact ----
  if (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'assets' and cmd = 'UPDATE'
  ) <> 1 then
    raise exception 'Asset Library slice 3 POSTCONDITION FAILED: public.assets no longer has exactly one UPDATE policy.';
  end if;
  if (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'assets'
      and policyname in ('assets_select_own', 'assets_insert_own', 'assets_delete_own')
  ) <> 3 then
    raise exception 'Asset Library slice 3 POSTCONDITION FAILED: the slice 1 row policies are not intact.';
  end if;
  if (
    select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('assets_objects_select_own', 'assets_objects_insert_own', 'assets_objects_delete_own')
  ) <> 3 then
    raise exception 'Asset Library slice 3 POSTCONDITION FAILED: the slice 1 storage.objects policies are not intact.';
  end if;
end;
$$;

-- ===================================================================
-- VERIFICATION -- run AFTER the migration. TWO PARTS, AND THEY ARE NOT THE
-- SAME KIND OF THING.
--
--   PART A (1-4): READ-ONLY catalog checks. Pure SELECTs. Safe on any database,
--                 including Production, at any time. They modify nothing.
--   PART B (5-13): MUTATING two-account acceptance controls. Every one WRITES,
--                 and control 9 DELETES A CAMPAIGN ROW.
-- ===================================================================
--
-- ---------------- PART A -- READ-ONLY (modifies nothing) ----------------
-- 1. The column:
--      select column_name, data_type, is_nullable, column_default, is_generated
--        from information_schema.columns
--       where table_schema='public' and table_name='assets' and column_name='campaign_id';
--    -- expect uuid / YES / NULL / NEVER
-- 2. The FK, in full:
--      select conname, pg_get_constraintdef(oid) from pg_constraint
--       where conrelid='public.assets'::regclass and conname='assets_campaign_same_owner_fk';
--    -- expect: FOREIGN KEY (campaign_id, user_id) REFERENCES campaigns(id, user_id)
--    --         ON DELETE SET NULL (campaign_id)
-- 3. The writable surface is exactly two columns:
--      select column_name, privilege_type from information_schema.column_privileges
--       where table_schema='public' and table_name='assets'
--         and grantee='authenticated' and privilege_type='UPDATE' order by column_name;
--    -- expect EXACTLY two rows: campaign_id, is_favorite
-- 4. Existing assets are untouched:
--      select count(*) from public.assets where campaign_id is not null;  -- expect 0
--
-- ---------------- PART B -- MUTATING ACCEPTANCE CONTROLS ----------------
--
--   ⚠️ THESE STATEMENTS WRITE. CONTROL 9 IS DESTRUCTIVE: it DELETES a campaign
--   row, and that delete is not undoable from the app.
--
--   MANDATORY PRECONDITIONS -- all four, before running anything in PART B:
--     (i)   DISPOSABLE QA RECORDS ONLY, on QA accounts. Create campaigns CA and
--           CB and asset XA specifically for this run. NEVER point these at a
--           real campaign, a real asset, or a real client's data.
--     (ii)  Record the ids you created, so cleanup can be VERIFIED afterwards
--           rather than assumed.
--     (iii) Two signed-in accounts, A and B. Run each statement AS THE ACCOUNT
--           NAMED -- running control 6 as B inverts its meaning and it would
--           pass while proving nothing.
--     (iv)  PROVE THE IMPERSONATION TOOK before trusting any refusal:
--             select current_user, auth.uid();
--           A refusal under the wrong role proves nothing at all.
--
-- 5.  POSITIVE (own campaign links) -- as A:                          [WRITES]
--       update public.assets set campaign_id='<CA>' where id='<XA>';  -- expect 1 row
-- 6.  NEGATIVE -- THE ONE THIS SLICE EXISTS FOR -- as A, naming B's campaign CB
--     (A cannot SELECT it, but can still name it):        [must FAIL, no write]
--       update public.assets set campaign_id='<CB>' where id='<XA>';
--     -- expect ERROR 23503 on assets_campaign_same_owner_fk.
--     -- If this SUCCEEDS, the key is single-column and the slice has FAILED.
-- 7.  NEGATIVE (a nonexistent campaign is refused too) -- as A:  [must FAIL]
--       update public.assets set campaign_id=gen_random_uuid() where id='<XA>';
--     -- expect ERROR 23503
-- 8.  POSITIVE (unlink is always allowed) -- as A:                    [WRITES]
--       update public.assets set campaign_id=null where id='<XA>';    -- expect 1 row
-- 9.  DELETION SEMANTICS -- as A:  [⚠️ DESTRUCTIVE -- PERMANENTLY DELETES CA ⚠️]
--       update public.assets set campaign_id='<CA>' where id='<XA>';  -- relink
--       delete from public.campaigns where id='<CA>';                 -- expect 1 row
--       select id, campaign_id, user_id from public.assets where id='<XA>';
--     -- expect the asset still present, campaign_id NULL, user_id UNCHANGED.
--     -- A failure here ("null value in column user_id") is the bare-SET-NULL bug.
-- 10. NEGATIVE (the grant, not the policy) -- as A:              [must FAIL]
--       update public.assets set prompt='x' where id='<XA>';
--     -- expect ERROR 42501 permission denied for column prompt
-- 11. NEGATIVE (ownership cannot be handed over) -- as A:        [must FAIL]
--       update public.assets set user_id='<B uid>' where id='<XA>';
--     -- expect ERROR 42501
-- 12. NEGATIVE (cross-account row) -- as B, targeting A's asset XA:
--       update public.assets set campaign_id='<CB>' where id='<XA>';
--     -- expect 0 ROWS AND NO ERROR. RLS refusal is NOT an error -- this is
--     -- exactly why linkAssetCampaign() requires .select() to return 1 row.
-- 13. REGRESSION (slice 2 still works) -- as A:                       [WRITES]
--       update public.assets set is_favorite=true where id='<XA>';    -- expect 1 row
--
-- ---------------- PART B CLEANUP -- required, and VERIFIED not assumed -------
-- CA is already gone (control 9 deleted it). Remove the rest, then PROVE it:
--       delete from public.assets    where id='<XA>';        -- as A
--       delete from public.campaigns where id='<CB>';        -- as B
-- Verification -- run as EACH account; expect 0 from every row:
--       select 'asset XA'    as record, count(*) from public.assets    where id='<XA>'
--       union all
--       select 'campaign CA', count(*) from public.campaigns where id='<CA>'
--       union all
--       select 'campaign CB', count(*) from public.campaigns where id='<CB>';
-- A non-zero count means QA residue is still in the database.
-- NOTE: deleting asset XA removes only the ROW. If XA was created through the
-- app it also has a storage object; delete it through the app so both sides go.
-- ===================================================================
