-- ===================================================================
-- Migration (S0D): durable PER-ACCOUNT Business Context
--
-- Adds public.business_profile — ONE row per user (user_id is the PK, so
-- natural onConflict:user_id upsert). Distinct from legacy public.profile,
-- which is NOT touched. Gives each account its own approved business facts
-- (name / positioning / audiences / tone / differentiators / services /
-- brand palette) that Jake's chat + draft lanes consume account-aware; no
-- configured profile → neutral context (never ArtValue fallback).
--
-- SCOPE: additive + idempotent ONLY.
--   * No DROP TABLE, no DELETE, no UPDATE of data, no user-specific INSERT.
--   * A partial-but-compatible pre-existing table is completed with
--     ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
--   * A structurally INCOMPATIBLE pre-existing table makes the fail-loud
--     preflight RAISE and ABORT (SAFE STOP) rather than silently continue.
--
-- HOW TO RUN (owner, gated): Supabase Dashboard → SQL Editor → paste → Run.
--   Also valid as a CLI migration (this timestamped file). NOT run by the app.
--   Post-migration VERIFICATION queries live in the PR body / release runbook,
--   NOT in this file (this file is DDL only — no ambiguous SELECT logic).
-- ===================================================================

-- ---------------- fail-loud compatibility preflight ----------------
-- Runs ONLY when public.business_profile already exists. Verifies every
-- structural assumption the app relies on; any mismatch → RAISE (SAFE STOP).
-- A fresh install skips this entirely (create-table below handles it).
do $$
declare
  r record;
begin
  if to_regclass('public.business_profile') is null then
    return; -- fresh install
  end if;

  -- must be a base table in the public schema
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'business_profile'
      and table_type = 'BASE TABLE'
  ) then
    raise exception 'S0D preflight SAFE STOP: public.business_profile exists but is not a base table.';
  end if;

  -- PRIMARY KEY must be EXACTLY (user_id)
  if (
    select coalesce(array_agg(a.attname order by a.attname), array[]::name[])
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
    where i.indrelid = 'public.business_profile'::regclass and i.indisprimary
  ) is distinct from array['user_id']::name[] then
    raise exception 'S0D preflight SAFE STOP: public.business_profile primary key is not exactly (user_id).';
  end if;

  -- user_id must be uuid + NOT NULL
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'business_profile'
      and column_name = 'user_id' and data_type = 'uuid' and is_nullable = 'NO'
  ) then
    raise exception 'S0D preflight SAFE STOP: public.business_profile.user_id is not uuid NOT NULL.';
  end if;

  -- user_id FK must target EXACTLY auth.users(id) — verify the referenced
  -- column (confkey) is auth.users.id, not merely the target table — with
  -- ON DELETE CASCADE and a single-column key on both sides.
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a  on a.attrelid  = c.conrelid  and a.attnum = c.conkey[1]   -- local column
    join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1] -- referenced column
    where c.conrelid = 'public.business_profile'::regclass
      and c.contype = 'f'
      and a.attname = 'user_id'
      and c.confrelid = 'auth.users'::regclass
      and fa.attname = 'id'                   -- referenced column is exactly auth.users.id
      and c.confdeltype = 'c'                 -- 'c' = ON DELETE CASCADE
      and array_length(c.conkey, 1) = 1
      and array_length(c.confkey, 1) = 1
  ) then
    raise exception 'S0D preflight SAFE STOP: public.business_profile.user_id FK is not exactly auth.users(id) ON DELETE CASCADE.';
  end if;

  -- EXISTING expected scalar/jsonb columns must have the expected type
  -- (a MISSING non-PK column is fine — added below by ADD COLUMN IF NOT EXISTS).
  for r in
    select * from (values
      ('business_name', 'text'),
      ('positioning',   'text'),
      ('services',      'jsonb'),
      ('brand_palette', 'jsonb'),
      ('created_at',    'timestamp with time zone'),
      ('updated_at',    'timestamp with time zone')
    ) as e(col, typ)
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'business_profile' and column_name = r.col
    ) and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'business_profile'
        and column_name = r.col and data_type = r.typ
    ) then
      raise exception 'S0D preflight SAFE STOP: public.business_profile.% has an incompatible type (expected %).', r.col, r.typ;
    end if;
  end loop;

  -- EXISTING text[] columns must be arrays of text (data_type ARRAY, udt_name _text)
  for r in select unnest(array['audiences', 'tone', 'differentiators']) as col
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'business_profile' and column_name = r.col
    ) and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'business_profile'
        and column_name = r.col and data_type = 'ARRAY' and udt_name = '_text'
    ) then
      raise exception 'S0D preflight SAFE STOP: public.business_profile.% is not text[].', r.col;
    end if;
  end loop;

  -- no UNEXPECTED NOT NULL column lacking a default (would break upsert)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'business_profile'
      and is_nullable = 'NO' and column_default is null
      and column_name not in ('user_id', 'created_at', 'updated_at')
  ) then
    raise exception 'S0D preflight SAFE STOP: public.business_profile has an unexpected NOT NULL column without a default.';
  end if;

  -- no UNEXPECTED / conflicting RLS policy — only business_profile_own is
  -- expected. Any other (e.g. a broader permissive policy) would widen access
  -- beyond own-row and must abort rather than be silently accepted.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'business_profile'
      and policyname <> 'business_profile_own'
  ) then
    raise exception 'S0D preflight SAFE STOP: public.business_profile has an unexpected/conflicting RLS policy.';
  end if;

  -- no UNEXPECTED trigger — only trg_business_profile_updated is expected
  -- (a conflicting trigger assumption must abort, not silently continue).
  if exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.business_profile'::regclass
      and not t.tgisinternal
      and t.tgname <> 'trg_business_profile_updated'
  ) then
    raise exception 'S0D preflight SAFE STOP: public.business_profile has an unexpected trigger.';
  end if;
end $$;

-- ---------------- dependency: updated_at helper (canonical, already live) ----------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------- table (one row per user; user_id is the PK) ----------------
create table if not exists public.business_profile (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  business_name   text,
  positioning     text,
  audiences       text[],
  tone            text[],
  differentiators text[],
  services        jsonb,
  brand_palette   jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------- additive column backfill (completes a partial-but-compatible table) ----------------
-- create table if not exists ALONE does NOT add missing columns; these do.
alter table public.business_profile add column if not exists business_name   text;
alter table public.business_profile add column if not exists positioning     text;
alter table public.business_profile add column if not exists audiences       text[];
alter table public.business_profile add column if not exists tone            text[];
alter table public.business_profile add column if not exists differentiators text[];
alter table public.business_profile add column if not exists services        jsonb;
alter table public.business_profile add column if not exists brand_palette   jsonb;
alter table public.business_profile add column if not exists created_at      timestamptz not null default now();
alter table public.business_profile add column if not exists updated_at      timestamptz not null default now();

-- ---------------- updated_at trigger (idempotent recreation) ----------------
drop trigger if exists trg_business_profile_updated on public.business_profile;
create trigger trg_business_profile_updated before update on public.business_profile
  for each row execute function public.set_updated_at();

-- ===================================================================
-- ROW LEVEL SECURITY — a user can only touch the row where user_id = auth.uid()
-- ===================================================================
alter table public.business_profile enable row level security;

drop policy if exists "business_profile_own" on public.business_profile;
create policy "business_profile_own" on public.business_profile
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
