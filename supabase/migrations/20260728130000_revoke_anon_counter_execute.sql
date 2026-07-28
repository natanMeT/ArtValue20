-- ===================================================================
-- Migration: revoke EXECUTE on the quota counters from `anon`.
--
-- WHY THIS EXISTS, AND WHY IT IS ONE MIGRATION RATHER THAN THREE FIXES.
--   Both the Asset Library and Campaigns migrations ended their counter with
--       revoke all on function public.<counter>() from public;
--       grant execute on function public.<counter>() to authenticated;
--   That is NOT enough. `revoke ... from public` removes the PUBLIC pseudo-role
--   grant; it does NOT remove a role's OWN explicit grant, and Supabase's
--   project-level default privileges grant EXECUTE on new functions to `anon`,
--   `authenticated` and `service_role`. So `anon` kept EXECUTE in both slices —
--   the identical line produced the identical hole twice. That is a CLASS, not
--   three incidents, which is why the fix is one migration plus a test that
--   fails on the next occurrence (see
--   `src/lib/__tests__/securityDefinerGrants.test.js`).
--
-- EXPOSURE TODAY IS ZERO — AND THAT IS AN ACCIDENT WORTH REMOVING.
--   Each counter takes NO argument and reads `auth.uid()` itself, so an `anon`
--   caller (whose `auth.uid()` is NULL) counts nothing and measurably gets `0`.
--   The moment anyone adds a `p_owner uuid` parameter to one of them, the same
--   grant becomes a cross-account count leak. This migration removes the grant
--   so that future change cannot silently become a leak.
--
--   `public.reserve_ai_budget(...)` in `supabase/schema.sql` is the one function
--   in the repo that already did this correctly (revoked from public, anon AND
--   authenticated; granted to service_role only). It is the precedent.
--
-- SCOPE: grants only. This migration creates nothing, drops nothing, alters no
-- table, touches no data, and changes no function BODY — so it cannot change
-- any behaviour for a signed-in user. `authenticated` keeps EXECUTE on all
-- three counters, which the assertions below prove before the migration ends.
--
-- HOW TO RUN (owner-gated): Supabase Dashboard -> SQL Editor -> paste -> Run,
--   or as this timestamped CLI migration. NEVER run by the app.
-- ===================================================================

-- ---------------- fail-loud preflight ----------------
-- All three counters must exist. A missing one means the earlier migrations did
-- not apply as recorded, and this file must not paper over that.
do $$
declare
  missing text[] := array[]::text[];
  fn text;
begin
  foreach fn in array array[
    'public.asset_row_count()',
    'public.asset_object_count()',
    'public.campaign_row_count()'
  ] loop
    if to_regprocedure(fn) is null then
      missing := missing || fn;
    end if;
  end loop;

  if array_length(missing, 1) is not null then
    raise exception 'revoke-anon preflight SAFE STOP: counter function(s) not found: %', array_to_string(missing, ', ');
  end if;
end;
$$;

-- ---------------- the revoke ----------------
-- `from public` is repeated deliberately: it is idempotent, and it keeps this
-- file a complete statement of the intended grant state rather than a patch
-- that only makes sense when read next to two earlier migrations.
revoke execute on function public.asset_row_count()     from anon;
revoke execute on function public.asset_row_count()     from public;
revoke execute on function public.asset_object_count()  from anon;
revoke execute on function public.asset_object_count()  from public;
revoke execute on function public.campaign_row_count()  from anon;
revoke execute on function public.campaign_row_count()  from public;

-- `authenticated` is the only client-facing role that may call these. Re-granted
-- explicitly so the end state does not depend on what the earlier files left.
grant execute on function public.asset_row_count()     to authenticated;
grant execute on function public.asset_object_count()  to authenticated;
grant execute on function public.campaign_row_count()  to authenticated;

-- ---------------- self-verifying assertions ----------------
-- The migration proves its own postcondition and ABORTS if either half is
-- wrong. A revoke that silently did nothing, or that took `authenticated` down
-- with it, fails here instead of in production.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.asset_row_count()',
    'public.asset_object_count()',
    'public.campaign_row_count()'
  ] loop
    if has_function_privilege('anon', to_regprocedure(fn), 'EXECUTE') then
      raise exception 'revoke-anon FAILED: anon still holds EXECUTE on %', fn;
    end if;
    if not has_function_privilege('authenticated', to_regprocedure(fn), 'EXECUTE') then
      raise exception 'revoke-anon BROKE the product: authenticated lost EXECUTE on %', fn;
    end if;
  end loop;
end;
$$;

-- ===================================================================
-- VERIFICATION (read-only — run AFTER the migration; none of these modify data)
-- ===================================================================
-- 1. POSITIVE + NEGATIVE control in one query — expect anon_exec=false and
--    auth_exec=true on all three rows:
--      select p.proname,
--             has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
--             has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public'
--         and p.proname in ('asset_row_count','asset_object_count','campaign_row_count')
--       order by p.proname;
--
-- 2. The product must be unaffected — as a signed-in account, creating an asset
--    or a campaign still works and the quota still refuses at the cap. The
--    counters are called from INSIDE the RLS policies, which run as the policy
--    owner, not as the caller, so revoking the CALLER's EXECUTE does not stop
--    the policy from counting. That is the one thing worth re-checking live.
--
-- 3. Whole-class sweep — every SECURITY DEFINER function in `public` and who may
--    execute it (expect no client-facing role beyond `authenticated`, and
--    `reserve_ai_budget` service_role-only):
--      select p.proname, p.pronargs,
--             has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
--             has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.prosecdef
--       order by p.proname;
