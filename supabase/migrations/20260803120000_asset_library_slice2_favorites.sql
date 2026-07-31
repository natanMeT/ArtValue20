-- ===================================================================
-- Migration (Asset Library slice 2): FAVORITES.
--
-- Adds ONE boolean to public.assets and the FIRST update seam this table has
-- ever had. Slice 1 declared "rows are immutable once written"; this slice
-- relaxes that for EXACTLY ONE COLUMN, deliberately and narrowly. That is an
-- intentional contract change, recorded here so it is never mistaken for drift.
--
-- WHAT MAKES THE NARROWING REAL (read this before changing anything):
-- The RLS policy below is owner-scoped but NOT column-scoped -- a policy cannot
-- restrict which columns an UPDATE touches. The column restriction is the GRANT:
--
--     revoke update on public.assets from ...;      -- remove any table-wide UPDATE
--     grant  update (is_favorite) on public.assets to authenticated;
--
-- The revoke is NOT cosmetic and NOT defensive noise. Supabase's default
-- privileges grant new `public` tables to `anon` and `authenticated`, and slice 1
-- never revoked UPDATE -- it did not need to, because with NO update policy RLS
-- denied every update regardless of the grant. The moment this migration adds an
-- update POLICY, any lingering table-wide UPDATE grant would let a signed-in user
-- rewrite `prompt`, `mime`, `byte_size`, `source`, `preset` or `engine` on their
-- own rows. So the grant is the authority here, exactly as the WITH CHECK is the
-- authority for the slice 1 quota. This is the same lesson the counter functions
-- taught: on Supabase, `revoke ... from public` does NOT remove a role's own
-- grant -- name the roles.
--
-- SCOPE: additive + idempotent ONLY. No DROP TABLE, no DELETE, no data
-- migration, no user-specific write.
--
-- NOT TOUCHED BY THIS SLICE (asserted below, not assumed):
--   * the `assets` bucket, its MIME allowlist and its file_size_limit
--   * all three storage.objects policies -- no policy added, changed or dropped
--   * the 40-item quota on BOTH sides, and both counter functions
--   * the storage_path CHECK, the path shape, and signed-URL-only access
--   * `assets_kind_allowed` (kind = 'image'). Video remains out of scope: the
--     cloud generation lane cannot produce video at all today, so storing it
--     would be a capability nobody can reach. Tracked as a separate item.
--
-- HOW TO RUN (owner-gated): Supabase Dashboard -> SQL Editor -> paste -> Run,
--   or as this timestamped CLI migration. NEVER run by the app.
--
-- DECLARED LIMITATIONS (known, accepted, NOT fixed here):
--   L5 Re-running the slice 1 migration ALONE will SAFE STOP after this one
--      applies: its preflight rejects any policy on public.assets outside its
--      own three names, and this slice adds a fourth. Ordered replay of the
--      whole migration set (slice 1 then slice 2) is unaffected. Declared,
--      not solved -- an applied migration is never edited.
--   L6 `is_favorite` is a per-row flag with no cross-row invariant: it does
--      NOT exempt a row from the 40-item quota and does NOT block deletion.
--      Deleting a favorite deletes it, like any other row.
-- ===================================================================

-- ---------------- fail-loud compatibility preflight ----------------
-- This slice EXTENDS slice 1. If slice 1's shape is not present, stop rather
-- than build a favorites seam on top of something else.
do $$
begin
  if to_regclass('public.assets') is null then
    raise exception 'Asset Library slice 2 preflight SAFE STOP: public.assets does not exist -- slice 1 has not been applied.';
  end if;

  -- The three slice 1 policies must all still be there. A missing one means the
  -- table is not in the state this slice was designed against.
  if (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'assets'
      and policyname in ('assets_select_own', 'assets_insert_own', 'assets_delete_own')
  ) <> 3 then
    raise exception 'Asset Library slice 2 preflight SAFE STOP: the three slice 1 policies on public.assets are not all present.';
  end if;

  -- No OTHER update policy may already exist: policies for one command are
  -- OR-ed, so a second permissive UPDATE policy would be a hole, not an
  -- addition -- the same trap slice 1 documented for INSERT.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'assets'
      and cmd = 'UPDATE'
      and policyname <> 'assets_update_favorite_own'
  ) then
    raise exception 'Asset Library slice 2 preflight SAFE STOP: an unexpected UPDATE policy already exists on public.assets.';
  end if;

  -- If the column already exists it must be the exact type/nullability this
  -- slice relies on -- a text or nullable `is_favorite` is not this column.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'assets' and column_name = 'is_favorite'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'assets' and column_name = 'is_favorite'
      and data_type = 'boolean' and is_nullable = 'NO'
  ) then
    raise exception 'Asset Library slice 2 preflight SAFE STOP: public.assets.is_favorite exists but is not boolean NOT NULL.';
  end if;
end $$;

-- ===================================================================
-- The column. NOT NULL DEFAULT false, so every pre-existing row is
-- unambiguously "not a favorite" and the client never sees NULL.
-- ===================================================================
alter table public.assets add column if not exists is_favorite boolean not null default false;

-- ===================================================================
-- The update policy -- owner-only, both directions.
--
-- USING decides which rows may be updated; WITH CHECK decides what the row is
-- allowed to look like afterwards. BOTH are required: USING alone would let an
-- owner hand their row to another account by rewriting user_id (the grant
-- already forbids that, but a policy must not depend on a grant for its own
-- correctness).
--
-- There is deliberately no quota predicate here. The 40-item cap belongs to
-- INSERT alone: an account at the cap must still be able to star, unstar and
-- delete -- deleting is precisely how a full account recovers.
-- ===================================================================
drop policy if exists "assets_update_favorite_own" on public.assets;
create policy "assets_update_favorite_own" on public.assets
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ===================================================================
-- The column grant -- THE actual restriction (see the header).
--
-- Revoking the table-level UPDATE also removes any column-level UPDATE grants,
-- so this pair is idempotent and self-repairing: whatever UPDATE privileges
-- exist beforehand, afterwards `authenticated` can write is_favorite and
-- nothing else, and `anon` can write nothing.
-- ===================================================================
revoke update on public.assets from public;
revoke update on public.assets from anon;
revoke update on public.assets from authenticated;

grant update (is_favorite) on public.assets to authenticated;

-- ===================================================================
-- POSTCONDITIONS -- this migration verifies its own security claims and
-- aborts if any of them is false. A migration that can assert its outcome
-- should not leave that to a reviewer's reading.
-- ===================================================================
do $$
begin
  -- the seam exists
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'assets'
      and column_name = 'is_favorite' and data_type = 'boolean' and is_nullable = 'NO'
  ) then
    raise exception 'Asset Library slice 2 POSTCONDITION FAILED: is_favorite is not boolean NOT NULL.';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'assets'
      and policyname = 'assets_update_favorite_own' and cmd = 'UPDATE'
  ) then
    raise exception 'Asset Library slice 2 POSTCONDITION FAILED: the update policy is missing.';
  end if;

  -- exactly ONE update policy -- a second one would be OR-ed in as a hole
  if (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'assets' and cmd = 'UPDATE'
  ) <> 1 then
    raise exception 'Asset Library slice 2 POSTCONDITION FAILED: more than one UPDATE policy exists on public.assets.';
  end if;

  -- the writable surface is EXACTLY one column, for exactly one role
  if not has_column_privilege('authenticated', 'public.assets', 'is_favorite', 'UPDATE') then
    raise exception 'Asset Library slice 2 POSTCONDITION FAILED: authenticated cannot update is_favorite.';
  end if;
  if has_table_privilege('authenticated', 'public.assets', 'UPDATE') then
    raise exception 'Asset Library slice 2 POSTCONDITION FAILED: authenticated still holds a TABLE-WIDE update grant.';
  end if;
  if has_column_privilege('authenticated', 'public.assets', 'prompt', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assets', 'storage_path', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assets', 'user_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assets', 'byte_size', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assets', 'mime', 'UPDATE')
  then
    raise exception 'Asset Library slice 2 POSTCONDITION FAILED: authenticated can update a column other than is_favorite.';
  end if;
  if has_table_privilege('anon', 'public.assets', 'UPDATE')
     or has_column_privilege('anon', 'public.assets', 'is_favorite', 'UPDATE')
  then
    raise exception 'Asset Library slice 2 POSTCONDITION FAILED: anon holds an update grant on public.assets.';
  end if;

  -- slice 1 is untouched: still exactly three storage.objects policies for this
  -- bucket, and the row-level select/insert/delete policies still present.
  if (
    select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('assets_objects_select_own', 'assets_objects_insert_own', 'assets_objects_delete_own')
  ) <> 3 then
    raise exception 'Asset Library slice 2 POSTCONDITION FAILED: the slice 1 storage.objects policies are not intact.';
  end if;
  if (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'assets'
      and policyname in ('assets_select_own', 'assets_insert_own', 'assets_delete_own')
  ) <> 3 then
    raise exception 'Asset Library slice 2 POSTCONDITION FAILED: the slice 1 row policies are not intact.';
  end if;
end $$;
