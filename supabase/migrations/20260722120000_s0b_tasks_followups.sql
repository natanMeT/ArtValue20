-- ===================================================================
-- Migration (S0B): durable cloud persistence for Tasks + client Follow-ups
--
-- WHY: In authenticated cloud mode the app had NO durable store for tasks
-- (store.jsx persist() had no task route; api.fetchAll() never read tasks), and
-- the client follow-up fields (next_action / next_action_date) were silently
-- dropped by the client column mapping. S0A contained the resulting false
-- success; S0B makes both durable. This migration adds the missing schema.
--
-- SCOPE: additive + idempotent ONLY.
--   1. clients: add next_action (text) + next_action_date (date).
--   2. new public.tasks table (+ index, RLS, ownership policy, updated_at trigger).
-- No DROP TABLE, no DELETE, no UPDATE of data, no change to any existing column.
--
-- TYPE NOTES:
--   * tasks.id is TEXT (not uuid): task ids are opaque app strings — legacy
--     local-mode ids are prefixed ('tk_...', store/seed uid('tk')) and current
--     cloud ids are crypto.randomUUID() strings; both fit text (same rationale
--     as the live quotes.id TEXT column — see supabase/schema.sql).
--   * tasks.project_id is TEXT with NO foreign key: Projects have no durable
--     table (Memory-Only / beta-hidden), so a task's project link is a soft
--     reference only.
--   * tasks.client_id is uuid → public.clients(id) (uuid, per schema.sql) with
--     ON DELETE SET NULL so a task survives (unlinked) when its client is deleted.
--
-- HOW TO RUN (owner, gated): Supabase Dashboard → SQL Editor → paste → Run.
-- Also valid as a CLI migration (timestamped file in supabase/migrations/).
-- Safe to re-run: create table / add column / create index IF NOT EXISTS;
-- drop-then-create policy + trigger touch metadata only, never data.
-- ===================================================================

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

-- ---- clients: follow-up fields (additive) ----
alter table public.clients add column if not exists next_action      text;
alter table public.clients add column if not exists next_action_date date;

-- ---- tasks ----
create table if not exists public.tasks (
  id           text primary key default (gen_random_uuid()::text),  -- text: opaque app ids (legacy 'tk_...' + uuid strings)
  user_id      uuid not null references auth.users (id) on delete cascade,
  project_id   text,                                                -- soft link only, no FK (Projects have no durable table)
  client_id    uuid references public.clients (id) on delete set null,
  title        text not null,
  status       text not null default 'new'
                 check (status in ('new', 'todo', 'in_progress', 'await_client', 'await_material', 'review', 'done')),
  priority     text not null default 'normal'
                 check (priority in ('low', 'normal', 'high', 'urgent')),
  deadline     date,
  assignee     text,
  link_ref     text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------- index ----------------
create index if not exists idx_tasks_user on public.tasks (user_id);

-- ---------------- updated_at trigger ----------------
drop trigger if exists trg_tasks_updated on public.tasks;
create trigger trg_tasks_updated before update on public.tasks
  for each row execute function public.set_updated_at();

-- ===================================================================
-- ROW LEVEL SECURITY — a user can only touch rows where user_id = auth.uid()
-- ===================================================================
alter table public.tasks enable row level security;

drop policy if exists "tasks_own" on public.tasks;
create policy "tasks_own" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===================================================================
-- VERIFICATION (read-only — run AFTER the migration; none of these modify data)
-- ===================================================================
-- 1. Follow-up columns exist on clients:
--    select column_name, data_type from information_schema.columns
--     where table_schema='public' and table_name='clients'
--       and column_name in ('next_action','next_action_date');
-- 2. tasks table exists:   select to_regclass('public.tasks');
-- 3. RLS enabled:          select rowsecurity from pg_tables
--                           where schemaname='public' and tablename='tasks';  -- expect true
-- 4. Ownership policy:     select policyname, cmd, qual, with_check from pg_policies
--                           where schemaname='public' and tablename='tasks';
--    -- expect tasks_own, cmd=ALL, qual = with_check = (auth.uid() = user_id)
-- 5. Frontend: reload signed-in — fetchAll() returns tasks (no 404); created
--    tasks + client follow-up fields survive a full refresh.
