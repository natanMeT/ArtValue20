-- ===================================================================
-- Migration: public.profile RLS lockdown (least privilege)
--
-- WHY (verified live): public.profile is a legacy business-details singleton
-- (integer id = 1, one row, no user_id) with RLS enabled but a single
-- PERMISSIVE PUBLIC policy ("Service role full access": roles public,
-- FOR ALL, USING true, WITH CHECK true). A read-only probe confirmed the
-- published anon key can read the row — and the same policy also allows
-- anyone with the anon key to UPDATE or DELETE the owner's PII.
--
-- ARCHITECTURE DECISION (least privilege): the repository has ZERO profile
-- consumers — `.from('profile')` appears nowhere on main, on any branch, or
-- in the built public one-pager bundle (which touches only
-- founding_applications). So NO client policy is justified: this migration
-- leaves the table with RLS enabled and ZERO policies. anon and
-- authenticated clients get nothing; Supabase administration keeps working
-- because the service role and the dashboard's Postgres roles BYPASS RLS.
-- If a future feature ever reads the profile, it must add its own scoped
-- policy in its own reviewed migration.
--
-- SAFETY: policy metadata ONLY. The existing row is never touched — no
-- INSERT/UPDATE/DELETE/TRUNCATE, no column or table change, no user_id is
-- added (owner-scoping a legacy singleton would mean guessing an owner).
-- Idempotent: enable RLS is a no-op when already on; drop policy IF EXISTS
-- is a no-op once dropped. Fails closed if the table does not exist.
--
-- HOW TO RUN (owner, gated): Supabase Dashboard → SQL Editor → paste →
-- Run. Expected: "Success. No rows returned."
-- ===================================================================

do $mig$
begin
  -- fail closed: this migration only makes sense against the live legacy table
  if to_regclass('public.profile') is null then
    raise exception
      'profile_rls_lockdown: public.profile does not exist — nothing was changed. This migration targets the legacy live singleton only.';
  end if;

  alter table public.profile enable row level security;

  -- remove the permissive public policy (read+write for anyone with the anon
  -- key). Deliberately NO replacement policy: zero client access, service
  -- role bypasses RLS.
  drop policy if exists "Service role full access" on public.profile;
end;
$mig$;

-- ===================================================================
-- VERIFICATION (read-only — run AFTER the migration)
-- ===================================================================

-- 1. RLS on, ZERO policies remain on profile:
--    select tablename, rowsecurity from pg_tables
--     where schemaname = 'public' and tablename = 'profile';        -- rowsecurity = true
--    select count(*) as profile_policies from pg_policies
--     where schemaname = 'public' and tablename = 'profile';        -- expect 0

-- 2. The row is intact and unreadable by clients:
--    select count(*) from public.profile;                           -- expect 1 (SQL editor runs as postgres)
--    -- anon/authenticated REST: GET /rest/v1/profile?select=id → [] (200, empty)
--    -- anon PATCH /rest/v1/profile → 0 rows affected (RLS filters everything)

-- 3. Unrelated tables untouched: pg_policies for clients/quotes/transactions/
--    quote_items/outreach_leads/founding_applications/ai_usage unchanged.
