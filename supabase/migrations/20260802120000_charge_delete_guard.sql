-- ===================================================================
-- Finance Charge Safe Delete — public.delete_charge_if_unpaid(uuid)
--
-- THE RULE THIS FILE ENFORCES, once and in the only place that can enforce it:
--   DELETING A CHARGE MUST NEVER DESTROY A PAYMENT.
--
-- WHY IT IS NOT ALREADY ENFORCED. `payments_charge_same_owner_fk` is
-- ON DELETE CASCADE (F1, 20260731120000), so a plain
-- `delete from public.charges where id = ...` silently takes every payment row
-- with it. Payments are the SOURCE OF TRUTH for received revenue
-- (src/lib/receivables.js): destroying one moves "הכנסה בפועל" and cannot be
-- undone. The Finance screen can hide the delete control, but a screen is a
-- convenience, not an invariant — the client's `received === 0` is a SUM
-- computed from rows the client happens to hold, and it is 0 for a charge whose
-- payment row was dropped by `normalizePaymentRow`, or recorded after the last
-- fetch, or inserted in the moment between the confirm click and the DELETE.
--
-- WHY AN RPC AND NOT THE OBVIOUS ALTERNATIVES.
--   * FK CASCADE -> RESTRICT: `charges.user_id` and `payments.user_id` are both
--     `references auth.users (id) on delete cascade`. RESTRICT is checked
--     immediately, so deleting an auth user could fail mid-cascade — it would
--     move the rule onto a path where it is not wanted and break account
--     deletion. It also contradicts the CASCADE semantics that store.jsx's
--     DELETE_CHARGE reducer, the import path and existing tests all mirror.
--   * BEFORE DELETE trigger on charges: same defect — it fires on the
--     auth.users cascade too, with no clean way to tell a user-initiated delete
--     from a cascade.
--   * This function: enforces the rule on the ONE path that is user-initiated,
--     leaves every referential semantic exactly as F1 declared it, and is the
--     only option that also closes the race (see RACE SAFETY below).
--
-- WHY SECURITY DEFINER — this is the load-bearing reason, not a convenience.
-- Under SECURITY INVOKER the existence check
-- `exists (select 1 from public.payments where charge_id = ...)` would be
-- RLS-FILTERED. A payment row the caller cannot see would read as "no payments"
-- and the charge would be deleted, cascading that row away — the exact defect
-- this function exists to prevent. DEFINER makes the check see the table, so
-- "no payment row exists" means what it says. The cost of DEFINER is that RLS
-- no longer scopes the charge either, so ownership is enforced EXPLICITLY below
-- (`user_id = auth.uid()`), derived from the session and never from an argument.
--
-- CROSS-ACCOUNT NON-DISCLOSURE. "Charge does not exist" and "charge belongs to
-- another account" raise the IDENTICAL error with the IDENTICAL SQLSTATE, and
-- the ownership check runs BEFORE the payments check — so a caller can neither
-- probe which charge ids exist in other accounts nor learn anything about their
-- payments. Nothing about another account is observable through this function.
--
-- RACE SAFETY. The charge row is taken `FOR UPDATE` before anything is read or
-- written. Inserting a payment fires `payments_charge_same_owner_fk`, which
-- takes FOR KEY SHARE on the referenced charges row, and FOR UPDATE conflicts
-- with FOR KEY SHARE. Both interleavings are therefore safe:
--   * this function locks first  -> the concurrent INSERT blocks; we see no
--     payment, delete the charge, commit; the blocked INSERT then fails 23503
--     because its parent is gone. No orphan, no destroyed payment.
--   * the INSERT locks first     -> this function blocks until that transaction
--     ends; if it committed we then SEE the payment and refuse 23514.
-- Without the lock, EXISTS and DELETE would straddle a window in which a
-- payment can be committed and immediately cascaded away.
--
-- SQLSTATE IS THE CONTRACT, not the message text. src/lib/api.js switches on
-- `error.code` only:
--   28000  not authenticated
--   22023  p_charge_id missing
--   P0002  charge not found OR not owned (deliberately indistinguishable)
--   23514  the charge has at least one payment row — refuse, do not cascade
-- Within THIS function 23514 is unambiguous: the only DML it runs is a DELETE on
-- public.charges, which can violate no CHECK constraint.
--
-- SCOPE: additive and idempotent. One function plus its grants. NO table, NO
-- column, NO constraint, NO policy, NO data change. Gap 2 is untouched — a
-- payment on a cancelled charge keeps counting in actual revenue.
--
-- DECLARED LIMITATIONS.
--   L1 A charge that HAS payments still cannot be deleted at all. That is the
--      rule, not a gap: correcting money stays on the explicit DELETE_PAYMENT
--      path, and cancelling remains the non-destructive option.
--   L2 The ON DELETE CASCADE on payments_charge_same_owner_fk is UNCHANGED and
--      still fires for any OTHER delete path (a direct table delete by the
--      owner role, or the auth.users cascade). This function governs the
--      product's user-initiated path; it is not a database-wide prohibition.
--   L3 No audit row is written for a successful delete. The product has no
--      financial audit log yet, and inventing one here would be out of scope.
-- ===================================================================

-- ---------- preflight: never redefine something else's function ----------
do $preflight$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_charge_if_unpaid'
      and pg_get_function_identity_arguments(p.oid) <> 'p_charge_id uuid'
  ) then
    raise exception 'charge-delete-guard preflight SAFE STOP: a function public.delete_charge_if_unpaid already exists with a DIFFERENT argument list. Nothing was changed — resolve the conflict manually.';
  end if;

  -- The rule is only meaningful if the tables it protects are the F1 ones.
  if to_regclass('public.charges') is null or to_regclass('public.payments') is null then
    raise exception 'charge-delete-guard preflight SAFE STOP: public.charges and/or public.payments do not exist. Apply 20260731120000_finance_receivables_slice1.sql first.';
  end if;
end;
$preflight$;

-- ---------- the guarded delete ----------
create or replace function public.delete_charge_if_unpaid(p_charge_id uuid)
returns void
language plpgsql
security definer              -- deliberate: the payments existence check must NOT be RLS-filtered
set search_path = ''          -- hardened: every reference below is fully qualified
as $fn$
declare
  v_uid uuid := auth.uid();   -- ownership from the session, NEVER from an argument
begin
  if v_uid is null then
    raise exception 'delete_charge_if_unpaid: not authenticated'
      using errcode = '28000';
  end if;
  if p_charge_id is null then
    raise exception 'delete_charge_if_unpaid: p_charge_id is required'
      using errcode = '22023';
  end if;

  -- (1) OWNERSHIP + LOCK, in one statement. `for update` conflicts with the
  -- FOR KEY SHARE that a concurrent payment INSERT takes on this row, so from
  -- here to commit no payment can appear behind our back. PERFORM sets FOUND.
  perform 1
     from public.charges
    where id = p_charge_id
      and user_id = v_uid
      for update;

  if not found then
    -- ONE error for "no such charge" and "not your charge". Splitting them
    -- would turn this function into an existence oracle for other accounts.
    raise exception 'delete_charge_if_unpaid: charge not found'
      using errcode = 'P0002';
  end if;

  -- (2) EXISTENCE, not a sum. `sum(amount) = 0` is a different question and a
  -- weaker one; a single row is enough to refuse. Deliberately NOT filtered by
  -- user_id: the composite FK already guarantees same-owner payments, and a row
  -- that somehow violated that must still BLOCK the delete rather than be
  -- filtered out of the check and then cascaded away.
  if exists (select 1 from public.payments where charge_id = p_charge_id) then
    raise exception 'delete_charge_if_unpaid: charge % has recorded payments and cannot be deleted', p_charge_id
      using errcode = '23514';
  end if;

  -- (3) The delete. Ownership is repeated on the statement itself so the write
  -- can never be broader than what was checked and locked.
  delete from public.charges
   where id = p_charge_id
     and user_id = v_uid;
end;
$fn$;

comment on function public.delete_charge_if_unpaid(uuid) is
  'Deletes ONE charge owned by auth.uid(), and ONLY if public.payments holds no row for it (existence, not sum). Refuses 23514 otherwise, so the ON DELETE CASCADE on payments_charge_same_owner_fk can never destroy a payment through the product. Not-found and not-owned both raise P0002 — no cross-account disclosure. SECURITY DEFINER on purpose: an RLS-filtered existence check could miss a payment row.';

-- ---------- grants: authenticated ONLY ----------
-- `revoke ... from public` is NOT sufficient. Supabase's project-level default
-- privileges grant EXECUTE on new functions to `anon`, and revoking from PUBLIC
-- does not remove a role's own explicit grant — the identical omission opened
-- the identical hole in two consecutive slices (20260728130000).
revoke all on function public.delete_charge_if_unpaid(uuid) from public;
revoke all on function public.delete_charge_if_unpaid(uuid) from anon;
grant execute on function public.delete_charge_if_unpaid(uuid) to authenticated;

-- ---------- postflight: assert the grants in BOTH directions ----------
do $postflight$
begin
  if has_function_privilege('anon', 'public.delete_charge_if_unpaid(uuid)', 'execute') then
    raise exception 'charge-delete-guard FAILED: anon still has EXECUTE on public.delete_charge_if_unpaid(uuid).';
  end if;
  if not has_function_privilege('authenticated', 'public.delete_charge_if_unpaid(uuid)', 'execute') then
    raise exception 'charge-delete-guard BROKE the product: authenticated cannot EXECUTE public.delete_charge_if_unpaid(uuid).';
  end if;

  -- The function is only as strong as the two properties it is built on.
  --
  -- The proconfig comparison is written the long way ON PURPOSE. PostgreSQL
  -- stores `set search_path = ''` as the string `search_path=""` — WITH the
  -- quotes — so the obvious `proconfig @> array['search_path=']` is false for a
  -- correctly hardened function. That exact assertion failed on the first real
  -- PostgreSQL 17.6 rehearsal of this file; matching on the parsed value instead
  -- of a guessed literal is what makes it true for either quoting.
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_charge_if_unpaid'
      and p.prosecdef
      and exists (
        select 1 from unnest(p.proconfig) as cfg
         where split_part(cfg, '=', 1) = 'search_path'
           and btrim(split_part(cfg, '=', 2), '"') = ''
      )
  ) then
    raise exception 'charge-delete-guard FAILED: public.delete_charge_if_unpaid is not SECURITY DEFINER with an empty search_path.';
  end if;
end;
$postflight$;

-- ===================================================================
-- VERIFICATION (read-only — run AFTER applying; nothing here writes)
-- ===================================================================
-- 1. Contract + hardening:
--    select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--           p.prosecdef as is_security_definer, p.proconfig
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname = 'delete_charge_if_unpaid';
--    -- expect: args = 'p_charge_id uuid', is_security_definer = true,
--    --         proconfig = {"search_path=\"\""}  (PostgreSQL keeps the quotes)
-- 2. Grants — authenticated may EXECUTE, anon may not:
--    select grantee, privilege_type from information_schema.routine_privileges
--     where routine_schema = 'public' and routine_name = 'delete_charge_if_unpaid';
-- 3. Behavioural, as a signed-in user, on DISPOSABLE records only:
--    a. charge with NO payment  -> rpc succeeds, charge row gone
--    b. charge WITH a payment   -> 23514, charge AND payment both still present
--    c. another account's charge-> P0002, that row untouched (and no way to tell
--                                  it apart from a charge id that never existed)
-- 4. Nothing else moved:
--    the FK payments_charge_same_owner_fk is still ON DELETE CASCADE (confdeltype='c').
