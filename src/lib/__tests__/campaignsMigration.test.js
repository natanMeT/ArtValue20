import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CAMPAIGN_QUOTA, CAMPAIGN_STATUSES, CAMPAIGN_LIMITS } from '../campaigns.js';

// ===================================================================
// Campaigns slice 1 — migration contract.
//
// The migration is OWNER-RUN, never executed by the app or this suite, so this
// file verifies the DDL TEXT. It cannot and does not prove that the live
// database enforces anything — that is what the owner-run SQL controls in the
// PR body do, against the real project, after the migration applies.
// ===================================================================

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const raw = read('../../../supabase/migrations/20260728120000_campaigns_slice1.sql');
const sql = raw.toLowerCase();
// Statements only. BOTH comment forms must go: prose in a comment fakes a
// match, and a `--`-only strip would let a predicate commented OUT with /* */
// still satisfy its own test. (Measured lesson, reused from the Asset Library.)
const code = sql
  .replace(/\/\*[\s\S]*?\*\//g, '\n')
  .split('\n').filter((l) => !l.trim().startsWith('--'))
  .join('\n');

describe('migration · table shape', () => {
  it('creates public.campaigns with id as the PK and user_id → auth.users ON DELETE CASCADE', () => {
    expect(code).toContain('create table if not exists public.campaigns');
    expect(code).toMatch(/id\s+uuid\s+primary key/);
    expect(code).toMatch(/user_id\s+uuid\s+not null\s+references auth\.users\s*\(id\)\s+on delete cascade/);
  });

  it('constrains the status DOMAIN to exactly the four client-side states', () => {
    const m = code.match(/check\s*\(status in \(([^)]*)\)\)/);
    expect(m, 'campaigns_status_allowed CHECK not found').toBeTruthy();
    const inSql = m[1].split(',').map((s) => s.trim().replace(/'/g, '')).sort();
    expect(inSql).toEqual([...CAMPAIGN_STATUSES].sort());
  });

  it('bounds title and objective with the SAME numbers the client mirrors', () => {
    expect(code).toMatch(new RegExp(`length\\(btrim\\(title\\)\\)\\s+between 1 and ${CAMPAIGN_LIMITS.title}`));
    expect(code).toMatch(new RegExp(`length\\(objective\\)\\s*<=\\s*${CAMPAIGN_LIMITS.objective}`));
  });

  it('rejects an inverted date range', () => {
    expect(code).toMatch(/check\s*\(start_date is null or end_date is null or end_date\s*>=\s*start_date\)/);
  });

  it('carries the composite UNIQUE (id, user_id) that slice 2\'s FK requires', () => {
    expect(code).toMatch(/unique\s*\(id,\s*user_id\)/);
  });

  it('indexes (user_id, created_at desc) to match the list ordering', () => {
    expect(code).toMatch(/on public\.campaigns \(user_id,\s*created_at desc\)/);
  });
});

describe('migration · status transitions are enforced SERVER-SIDE', () => {
  it('installs a BEFORE UPDATE trigger — not a column-list trigger', () => {
    expect(code).toContain('create or replace function public.campaign_enforce_status_transition()');
    expect(code).toMatch(/create trigger trg_campaigns_status_transition before update on public\.campaigns/);
    // `before update of status` would fire only when the client happens to name
    // the column in its SET list, making enforcement depend on the caller.
    expect(code).not.toMatch(/before update of status/);
  });

  it('encodes exactly the legal graph and raises otherwise', () => {
    expect(code).toMatch(/old\.status = 'draft' and new\.status in \('active', 'cancelled'\)/);
    expect(code).toMatch(/old\.status = 'active' and new\.status in \('completed', 'cancelled'\)/);
    expect(code).toMatch(/raise exception 'campaigns: illegal status transition/);
    // check_violation, so the client can map it without string-matching.
    expect(code).toMatch(/errcode = '23514'/);
  });

  it('short-circuits an unchanged status so editing a title is never refused', () => {
    expect(code).toMatch(/if new\.status = old\.status then\s*\n\s*return new;/);
  });

  it('runs the transition check as SECURITY INVOKER with an empty search_path', () => {
    const fn = code.slice(code.indexOf('function public.campaign_enforce_status_transition'));
    expect(fn.slice(0, 400)).toContain('security invoker');
    expect(fn.slice(0, 400)).toMatch(/set search_path = ''/);
  });
});

describe('migration · RLS + the 200-row quota', () => {
  it('enables RLS and creates one own-row policy PER COMMAND', () => {
    expect(code).toContain('alter table public.campaigns enable row level security');
    for (const p of ['campaigns_select_own', 'campaigns_insert_own', 'campaigns_update_own', 'campaigns_delete_own']) {
      expect(code).toContain(`create policy "${p}" on public.campaigns`);
    }
    // A FOR ALL policy would apply the INSERT quota to UPDATE as well.
    expect(code).not.toMatch(/create policy "[^"]*" on public\.campaigns\s*\n\s*for all/);
  });

  it('counts rows through a SECURITY DEFINER function, not an inline subquery', () => {
    // An inline subquery on public.campaigns inside a policy ON public.campaigns
    // re-enters that policy → infinite recursion.
    const fn = code.slice(code.indexOf('function public.campaign_row_count'));
    expect(fn.slice(0, 400)).toContain('security definer');
    expect(fn.slice(0, 400)).toMatch(/set search_path = ''/);
    // No owner argument — it reads auth.uid() itself, so no caller can point it
    // at another account.
    expect(code).toMatch(/function public\.campaign_row_count\(\)/);
    expect(code).toMatch(/where user_id = \(select auth\.uid\(\)\)/);
    expect(code).toMatch(/grant execute on function public\.campaign_row_count\(\) to authenticated/);
  });

  it('enforces the quota in the INSERT policy with the number the client mirrors', () => {
    const insert = code.slice(
      code.indexOf('create policy "campaigns_insert_own"'),
      code.indexOf('create policy "campaigns_update_own"'),
    );
    expect(insert).toContain('auth.uid() = user_id');
    expect(insert).toMatch(new RegExp(`public\\.campaign_row_count\\(\\)\\s*<\\s*${CAMPAIGN_QUOTA}`));
  });

  // The quota lives in ONE place. An UPDATE cannot raise the row count and its
  // WITH CHECK already forbids moving a row to another account, so a quota
  // predicate there could never fail — and a condition that can never fire is
  // a second copy of the rule, free to drift from the first when the cap
  // changes. It is absent by design, not by oversight.
  it('puts the quota on INSERT ALONE — UPDATE carries ownership and nothing else', () => {
    const update = code.slice(
      code.indexOf('create policy "campaigns_update_own"'),
      code.indexOf('create policy "campaigns_delete_own"'),
    );
    expect(update).not.toContain('campaign_row_count');
    expect(update).not.toContain(String(CAMPAIGN_QUOTA));
    // both sides still pinned to the owner: USING scopes which rows may be
    // updated, WITH CHECK stops the row landing in another account.
    expect(update).toMatch(/using \(auth\.uid\(\) = user_id\)/);
    expect(update).toMatch(/with check \(auth\.uid\(\) = user_id\)/);
  });

  it('never gates SELECT or DELETE by the quota — deleting is how a full account recovers', () => {
    const select = code.slice(
      code.indexOf('create policy "campaigns_select_own"'),
      code.indexOf('create policy "campaigns_insert_own"'),
    );
    const del = code.slice(code.indexOf('create policy "campaigns_delete_own"'));
    expect(select).not.toContain('campaign_row_count');
    expect(del.slice(0, 300)).not.toContain('campaign_row_count');
  });

  // Counting rule: occurrences of the counter call in live SQL, excluding its
  // own definition and the grant/revoke lines. Exactly one — the INSERT policy.
  it('calls the counter exactly once in a policy predicate', () => {
    const calls = code
      .split('\n')
      .filter((l) => l.includes('campaign_row_count()'))
      .filter((l) => !/create or replace function|revoke all|grant execute/.test(l));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(new RegExp(`<\\s*${CAMPAIGN_QUOTA}`));
  });
});

describe('migration · additive and idempotent only', () => {
  it('contains no destructive statement against data', () => {
    expect(code).not.toMatch(/\bdrop table\b/);
    expect(code).not.toMatch(/\bdelete from\b/);
    expect(code).not.toMatch(/\btruncate\b/);
    expect(code).not.toMatch(/\bdrop column\b/);
  });

  it('touches no existing table — this slice adds, it does not alter', () => {
    for (const t of ['public.tasks', 'public.clients', 'public.assets', 'public.quotes', 'public.business_profile']) {
      expect(code, `must not reference ${t}`).not.toContain(t);
    }
  });

  it('is re-runnable: guarded create/add/drop-then-add throughout', () => {
    expect(code).toContain('create table if not exists');
    expect(code).toContain('create index if not exists');
    expect((code.match(/drop constraint if exists/g) || []).length).toBeGreaterThanOrEqual(5);
    expect((code.match(/drop policy if exists/g) || []).length).toBeGreaterThanOrEqual(5);
  });

  it('has a fail-loud preflight that SAFE STOPs instead of silently continuing', () => {
    expect(code).toContain("if to_regclass('public.campaigns') is null then");
    expect(raw).toContain('Campaigns preflight SAFE STOP');
    expect((raw.match(/SAFE STOP/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it('states the naming boundary against the creative session in the DDL itself', () => {
    expect(raw).toContain('NAMING BOUNDARY');
    expect(raw).toContain('campaignStore.js');
  });

  it('declares its limitations rather than leaving them implicit, with no gap in the numbering', () => {
    for (const l of ['L1', 'L2', 'L3']) expect(raw).toContain(l);
    // L4 was removed when the UPDATE quota predicate was deleted: that was
    // never a limitation, it was redundant code. A dangling L4 would imply a
    // fourth caveat nobody can find.
    expect(raw).not.toContain('L4');
  });
});
