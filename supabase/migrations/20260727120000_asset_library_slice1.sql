-- ===================================================================
-- Migration (Asset Library slice 1): durable CLOUD gallery images.
--
-- Adds the private `assets` Storage bucket + public.assets metadata rows.
-- Isolation is STRUCTURAL, not merely policy-based: an object's path is
-- `{auth.uid()}/{asset_id}.{ext}` and public.assets carries a CHECK that
-- reconstructs that exact string from its own columns, so a row can never
-- describe another account's object.
--
-- Bytes are reached ONLY through short-lived signed URLs. The bucket is
-- private; there is no public URL anywhere in the product.
--
-- SERVER-SIDE ENFORCEMENT (the client is never the authority):
--   * MIME allowlist  — bucket `allowed_mime_types` + a CHECK on the row.
--   * Per-file size    — bucket `file_size_limit` + a CHECK on the row.
--   * 40-asset quota   — the WITH CHECK of the storage.objects INSERT policy.
--
-- SCOPE: additive + idempotent ONLY. No DROP TABLE, no DELETE, no UPDATE of
-- data, no user-specific INSERT. There is NO data migration: the pre-existing
-- device-local IndexedDB gallery (`artvalue_gallery_<uid>`) is LEGACY and is
-- never read, converted, copied or deleted by this slice.
--
-- HOW TO RUN (owner-gated): Supabase Dashboard -> SQL Editor -> paste -> Run,
--   or as this timestamped CLI migration. NEVER run by the app.
--   Post-migration verification (positive AND negative controls) lives in the
--   PR body, not in this file -- this file is DDL only.
--
-- DECLARED LIMITATIONS (known, accepted, NOT fixed here):
--   L1 Concurrency. The quota predicate counts inside the statement snapshot,
--      so two simultaneous uploads at 39 can both pass and reach 41. Declared,
--      not solved. It bounds storage growth; it is not a security boundary.
--   L2 Account deletion. `on delete cascade` removes public.assets ROWS when
--      auth.users is deleted. It does NOT delete Storage objects -- deleting an
--      account leaves its objects in the bucket. Purging them is an operational
--      task outside this slice.
--   L3 Declared MIME. `allowed_mime_types` validates the Content-Type the
--      client DECLARES. It is not byte-signature sniffing.
--   L4 No UPDATE policy exists on storage.objects for this bucket (absence =
--      denied), so every upload MUST pass `upsert: false`. An overwrite is
--      rejected by policy, not silently accepted.
-- ===================================================================

-- ---------------- fail-loud compatibility preflight ----------------
-- Runs ONLY when public.assets already exists. Any structural mismatch with
-- what the app relies on aborts the migration (SAFE STOP) instead of silently
-- continuing. A fresh install skips this entirely.
do $$
begin
  if to_regclass('public.assets') is null then
    return; -- fresh install
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'assets'
      and table_type = 'BASE TABLE'
  ) then
    raise exception 'Asset Library preflight SAFE STOP: public.assets exists but is not a base table.';
  end if;

  -- PRIMARY KEY must be EXACTLY (id)
  if (
    select coalesce(array_agg(a.attname order by a.attname), array[]::name[])
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
    where i.indrelid = 'public.assets'::regclass and i.indisprimary
  ) is distinct from array['id']::name[] then
    raise exception 'Asset Library preflight SAFE STOP: public.assets primary key is not exactly (id).';
  end if;

  -- id + user_id must be uuid NOT NULL
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'assets'
      and column_name = 'id' and data_type = 'uuid' and is_nullable = 'NO'
  ) then
    raise exception 'Asset Library preflight SAFE STOP: public.assets.id is not uuid NOT NULL.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'assets'
      and column_name = 'user_id' and data_type = 'uuid' and is_nullable = 'NO'
  ) then
    raise exception 'Asset Library preflight SAFE STOP: public.assets.user_id is not uuid NOT NULL.';
  end if;

  -- user_id FK must target EXACTLY auth.users(id) ON DELETE CASCADE
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a  on a.attrelid  = c.conrelid  and a.attnum = c.conkey[1]
    join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
    where c.conrelid = 'public.assets'::regclass
      and c.contype = 'f'
      and a.attname = 'user_id'
      and c.confrelid = 'auth.users'::regclass
      and fa.attname = 'id'
      and c.confdeltype = 'c'                 -- 'c' = ON DELETE CASCADE
      and array_length(c.conkey, 1) = 1
      and array_length(c.confkey, 1) = 1
  ) then
    raise exception 'Asset Library preflight SAFE STOP: public.assets.user_id FK is not exactly auth.users(id) ON DELETE CASCADE.';
  end if;

  -- EXISTING expected columns must have the expected type (a MISSING column is
  -- fine -- added below by ADD COLUMN IF NOT EXISTS).
  declare
    r record;
  begin
    for r in
      select * from (values
        ('ext',          'text'),
        ('mime',         'text'),
        ('byte_size',    'bigint'),
        ('storage_path', 'text'),
        ('kind',         'text'),
        ('source',       'text'),
        ('prompt',       'text'),
        ('preset',       'text'),
        ('engine',       'text'),
        ('created_at',   'timestamp with time zone')
      ) as e(col, typ)
    loop
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'assets' and column_name = r.col
      ) and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'assets'
          and column_name = r.col and data_type = r.typ
      ) then
        raise exception 'Asset Library preflight SAFE STOP: public.assets.% has an incompatible type (expected %).', r.col, r.typ;
      end if;
    end loop;
  end;

  -- No NOT NULL column without a default that the app's insert does not send.
  -- The insert always provides: id, user_id, ext, mime, byte_size, storage_path.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'assets'
      and is_nullable = 'NO' and column_default is null
      and column_name not in ('id', 'user_id', 'ext', 'mime', 'byte_size', 'storage_path')
  ) then
    raise exception 'Asset Library preflight SAFE STOP: public.assets has a NOT NULL column without a default that the app insert does not populate.';
  end if;

  -- No UNEXPECTED / conflicting RLS policy -- only assets_own is expected. A
  -- broader permissive policy would widen access beyond own-row.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'assets'
      and policyname <> 'assets_own'
  ) then
    raise exception 'Asset Library preflight SAFE STOP: public.assets has an unexpected/conflicting RLS policy.';
  end if;
end $$;

-- ===================================================================
-- Metadata table -- ONE row per stored object.
-- ===================================================================
create table if not exists public.assets (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  ext          text not null,
  mime         text not null,
  byte_size    bigint not null,
  storage_path text not null,
  kind         text not null default 'image',
  source       text,
  prompt       text,
  preset       text,
  engine       text,
  created_at   timestamptz not null default now()
);

-- additive backfill (create table if not exists ALONE adds no missing column)
alter table public.assets add column if not exists ext          text;
alter table public.assets add column if not exists mime         text;
alter table public.assets add column if not exists byte_size    bigint;
alter table public.assets add column if not exists storage_path text;
alter table public.assets add column if not exists kind         text not null default 'image';
alter table public.assets add column if not exists source       text;
alter table public.assets add column if not exists prompt       text;
alter table public.assets add column if not exists preset       text;
alter table public.assets add column if not exists engine       text;
alter table public.assets add column if not exists created_at   timestamptz not null default now();

-- ---------------- constraints (idempotent: drop-then-add) ----------------
-- STRUCTURAL isolation: the path is RECONSTRUCTED from this row's own columns,
-- so a row can only ever describe an object under its own owner's prefix. This
-- is byte-exact -- not a prefix test, not a LIKE pattern.
alter table public.assets drop constraint if exists assets_storage_path_matches_owner;
alter table public.assets add  constraint assets_storage_path_matches_owner
  check (storage_path = user_id::text || '/' || id::text || '.' || ext);

alter table public.assets drop constraint if exists assets_storage_path_unique;
alter table public.assets add  constraint assets_storage_path_unique unique (storage_path);

alter table public.assets drop constraint if exists assets_ext_allowed;
alter table public.assets add  constraint assets_ext_allowed
  check (ext in ('png', 'jpg', 'jpeg', 'webp'));

alter table public.assets drop constraint if exists assets_mime_allowed;
alter table public.assets add  constraint assets_mime_allowed
  check (mime in ('image/png', 'image/jpeg', 'image/webp'));

-- per-file size ceiling: 10 MiB, mirroring the bucket's file_size_limit.
alter table public.assets drop constraint if exists assets_byte_size_bounded;
alter table public.assets add  constraint assets_byte_size_bounded
  check (byte_size > 0 and byte_size <= 10485760);

-- slice 1 stores images only (video is explicitly out of scope).
alter table public.assets drop constraint if exists assets_kind_allowed;
alter table public.assets add  constraint assets_kind_allowed check (kind = 'image');

-- descriptive metadata is bounded so a row can never become a payload.
alter table public.assets drop constraint if exists assets_meta_bounded;
alter table public.assets add  constraint assets_meta_bounded check (
      coalesce(length(source), 0) <= 40
  and coalesce(length(prompt), 0) <= 2000
  and coalesce(length(preset), 0) <= 120
  and coalesce(length(engine), 0) <= 40
);

create index if not exists assets_user_created_idx
  on public.assets (user_id, created_at desc);

-- ===================================================================
-- ROW LEVEL SECURITY -- a user can only touch rows where user_id = auth.uid()
-- ===================================================================
alter table public.assets enable row level security;

drop policy if exists "assets_own" on public.assets;
create policy "assets_own" on public.assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, delete on public.assets to authenticated;

-- ===================================================================
-- Private Storage bucket. `on conflict do update` makes this idempotent AND
-- repairs the configuration if the bucket already exists with wrong limits.
-- ===================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assets', 'assets', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public            = false,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ===================================================================
-- Quota authority -- 40 objects per account.
--
-- WHY A FUNCTION AND NOT AN INLINE SUBQUERY: the predicate lives in a policy
-- ON storage.objects and must COUNT storage.objects. Reading that table from
-- its own policy re-enters the policy -> infinite recursion. A SECURITY DEFINER
-- function runs with the definer's rights and so does NOT re-enter RLS, which
-- breaks the cycle.
--
-- WHY NO PARAMETER: it reads auth.uid() itself. A `p_owner uuid` argument would
-- let any caller count another account's objects -- a small but real leak. With
-- no argument there is nothing to point at another account.
--
-- Limitation L1 (declared above): STABLE evaluation inside the statement
-- snapshot means concurrent uploads at 39 can both pass and reach 41.
-- ===================================================================
create or replace function public.asset_object_count()
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  select count(*)::int
  from storage.objects
  where bucket_id = 'assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text;
$$;

revoke all on function public.asset_object_count() from public;
grant execute on function public.asset_object_count() to authenticated;

-- ===================================================================
-- storage.objects policies -- own-prefix only, for THIS bucket only.
--
-- SELECT is required for signed-URL creation. There is deliberately NO UPDATE
-- policy (limitation L4): absence = denied, so an overwrite cannot silently
-- replace an existing object and every upload must pass `upsert: false`.
-- ===================================================================
drop policy if exists "assets_objects_select_own" on storage.objects;
create policy "assets_objects_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "assets_objects_insert_own" on storage.objects;
create policy "assets_objects_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    -- SERVER-SIDE QUOTA. This predicate -- not the client -- is the authority.
    and public.asset_object_count() < 40
  );

drop policy if exists "assets_objects_delete_own" on storage.objects;
create policy "assets_objects_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
