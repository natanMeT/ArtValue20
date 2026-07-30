import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ===================================================================
// STATIC guard for 20260802120000_charge_delete_guard.sql.
//
// It reads SQL TEXT and proves nothing about a live database — the migration's
// own postflight assertions and the PostgreSQL 17.6 rehearsal do that. What
// this file catches is the migration being edited later into something that
// still applies cleanly and no longer enforces the rule: a dropped FOR UPDATE,
// an existence check quietly rewritten as a sum, a missing revoke, a
// SECURITY DEFINER downgraded to INVOKER (which would make the payments check
// RLS-filtered and therefore blind).
//
// A separate file from receivablesMigration.test.js on purpose: that one guards
// F1's schema migration, this one guards a different file with different
// invariants. Merging them would put two unrelated failure reports under one name.
// ===================================================================

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const raw = read('../../../supabase/migrations/20260802120000_charge_delete_guard.sql');

// Statements only — a rule "present" in a comment must never satisfy a check,
// and a forbidden pattern inside an explanatory comment must never trip one.
const sql = raw
  .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '\n');

describe('charge delete guard · the function contract', () => {
  it('declares exactly the one function, with the one argument', () => {
    expect(sql).toContain('create or replace function public.delete_charge_if_unpaid(p_charge_id uuid)');
    expect((sql.match(/create\s+(or\s+replace\s+)?function/gi) || []).length).toBe(1);
  });

  it('is SECURITY DEFINER with an empty search_path', () => {
    // DEFINER is load-bearing, not incidental: under INVOKER the payments
    // existence check would be RLS-filtered and could miss the row it exists
    // to find. INVOKER here is a silent correctness bug, so it is pinned.
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).not.toMatch(/security\s+invoker/i);
    expect(sql).toMatch(/set\s+search_path\s*=\s*''/);
  });

  it('derives ownership from auth.uid(), never from an argument', () => {
    expect(sql).toContain('v_uid uuid := auth.uid()');
    expect(sql).toContain("using errcode = '28000'");
    // No user id may be accepted as a parameter — that would let a caller
    // nominate whose charge to delete.
    expect(sql).not.toMatch(/p_user_id/);
  });

  it('LOCKS the charge before it reads or writes anything', () => {
    expect(sql).toMatch(/for update/i);
    const fn = sql.slice(sql.indexOf('create or replace function public.delete_charge_if_unpaid'));
    const lockAt = fn.search(/for update/i);
    const existsAt = fn.indexOf('exists (select 1 from public.payments');
    const deleteAt = fn.indexOf('delete from public.charges');
    expect(lockAt).toBeGreaterThan(-1);
    expect(existsAt).toBeGreaterThan(lockAt);   // check happens under the lock
    expect(deleteAt).toBeGreaterThan(existsAt); // delete happens after the check
  });

  it('refuses on EXISTENCE of a payment row, never on a sum', () => {
    expect(sql).toContain('exists (select 1 from public.payments where charge_id = p_charge_id)');
    expect(sql).toMatch(/using errcode = '23514'/);
    // The whole point: `sum(amount) = 0` is a weaker, different question.
    expect(sql).not.toMatch(/sum\s*\(\s*amount/i);
    expect(sql).not.toMatch(/coalesce\s*\(\s*sum/i);
  });

  it('gives not-found and not-owned the SAME error — no cross-account oracle', () => {
    expect((sql.match(/errcode = 'P0002'/g) || []).length).toBe(1);
    expect(sql).toContain('delete_charge_if_unpaid: charge not found');
    // One raise site means the two cases physically cannot diverge.
  });

  it('scopes the DELETE itself to the owner, not only the earlier check', () => {
    const del = sql.slice(sql.indexOf('delete from public.charges'));
    expect(del).toContain('and user_id = v_uid');
  });
});

describe('charge delete guard · grants', () => {
  it('revokes from PUBLIC and from anon, and grants to authenticated', () => {
    // `revoke ... from public` alone is NOT enough: Supabase's default
    // privileges grant EXECUTE to anon, and revoking from PUBLIC does not
    // remove a role's own grant. That exact omission shipped twice before.
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.delete_charge_if_unpaid\(uuid\)\s+from\s+public;/);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.delete_charge_if_unpaid\(uuid\)\s+from\s+anon;/);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.delete_charge_if_unpaid\(uuid\)\s+to\s+authenticated;/);
  });

  it('asserts its own postcondition in BOTH directions before finishing', () => {
    expect(sql).toMatch(/has_function_privilege\('anon'/);
    expect(sql).toMatch(/has_function_privilege\('authenticated'/);
    expect(sql).toMatch(/raise exception 'charge-delete-guard FAILED/);
    expect(sql).toMatch(/raise exception 'charge-delete-guard BROKE the product/);
  });

  it('checks proconfig by PARSED VALUE, not a guessed literal', () => {
    // Measured on real PostgreSQL 17.6: `set search_path = ''` is stored as
    // `search_path=""` WITH quotes, so `proconfig @> array['search_path=']` is
    // false for a correctly hardened function. That assertion failed the first
    // rehearsal of this very file; this pins the corrected form.
    expect(sql).toContain("split_part(cfg, '=', 1) = 'search_path'");
    expect(sql).toContain(`btrim(split_part(cfg, '=', 2), '"') = ''`);
    expect(sql).not.toContain("proconfig @> array['search_path=']");
  });
});

describe('charge delete guard · scope discipline', () => {
  it('is additive: no table, column, constraint, policy or data change', () => {
    for (const forbidden of [
      /create\s+table/i, /alter\s+table/i, /drop\s+table/i,
      /add\s+constraint/i, /drop\s+constraint/i,
      /create\s+policy/i, /drop\s+policy/i, /create\s+trigger/i,
      /\binsert\s+into\s+public\./i, /\bupdate\s+public\./i,
    ]) {
      expect(forbidden.test(sql), `migration must not contain ${forbidden}`).toBe(false);
    }
  });

  it('the ONLY DML is the guarded delete of a charge', () => {
    const deletes = sql.match(/delete\s+from\s+[a-z_.]+/gi) || [];
    expect(deletes).toEqual(['delete from public.charges']);
  });

  it('leaves the F1 cascade alone — this slice changes no referential semantics', () => {
    expect(sql).not.toMatch(/on\s+delete\s+(restrict|no\s+action)/i);
    // The FK is NAMED in the `comment on function` string (that is the point of
    // the comment), so its mere presence proves nothing. What must be absent is
    // any statement that touches it.
    expect(sql).not.toMatch(/alter[\s\S]{0,120}payments_charge_same_owner_fk/i);
    expect(sql).not.toMatch(/drop\s+constraint/i);
  });

  it('SAFE STOPs rather than redefining someone else\'s function or a missing table', () => {
    expect(sql).toContain('charge-delete-guard preflight SAFE STOP');
    expect(sql).toContain('pg_get_function_identity_arguments');
    expect(sql).toContain("to_regclass('public.charges')");
    expect(sql).toContain("to_regclass('public.payments')");
  });

  it('documents WHY an RPC rather than RESTRICT or a trigger, and its limits', () => {
    // Prose, deliberately: the next person to reach for RESTRICT should meet
    // the reason it was rejected (the auth.users cascade) in the file itself.
    expect(raw).toContain('DECLARED LIMITATIONS');
    expect(raw).toMatch(/RESTRICT/);
    expect(raw).toMatch(/RACE SAFETY/);
    expect(raw).toMatch(/FOR KEY SHARE/);
  });
});
