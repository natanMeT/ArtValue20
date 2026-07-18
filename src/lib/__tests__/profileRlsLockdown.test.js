import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Profile RLS lockdown — static contract guards.
//
// public.profile is a legacy live singleton with NO consumer anywhere in this
// repository, so the lockdown is least-privilege: drop the permissive public
// policy and leave RLS enabled with ZERO client policies (service role
// bypasses RLS). These guards pin that contract.

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const MIG = read('../../../supabase/migrations/20260719100000_profile_rls_lockdown.sql');
const exeLines = MIG.split('\n').filter((l) => !/^\s*--/.test(l)).map((l) => l.trim().toLowerCase());
const exe = exeLines.join('\n');

describe('profile RLS lockdown · migration contract', () => {
  it('drops the permissive policy and creates NO policy at all', () => {
    // the unsafe policy name appears in exactly one executable line — a drop
    const mentions = MIG.split('\n').filter((l) => l.includes('"Service role full access"') && !/^\s*--/.test(l));
    expect(mentions.length).toBe(1);
    expect(mentions[0].trim().startsWith('drop policy if exists')).toBe(true);
    // least privilege: zero CREATE POLICY statements in this migration
    expect(exe.includes('create policy')).toBe(false);
    // and no permissive grant could slip in any other way
    expect(/using\s*\(\s*true\s*\)/.test(exe)).toBe(false);
    expect(/with check\s*\(\s*true\s*\)/.test(exe)).toBe(false);
    expect(exe.includes('grant')).toBe(false);
    // RLS stays enforced
    expect(exe.includes('alter table public.profile enable row level security;')).toBe(true);
    expect(exe.includes('disable row level security')).toBe(false);
    expect(exe.includes('force row level security')).toBe(false);
  });

  it('mutates no data and no schema: policy metadata only', () => {
    for (const banned of [/^drop table\b/, /^delete\b/, /^truncate\b/, /^update\b/, /^insert\b/, /^revoke\b/, /rename\b/, /add column/, /drop column/, /alter column/, /add constraint/, /create table/, /create index/, /user_id/]) {
      expect(exeLines.some((l) => banned.test(l)), String(banned)).toBe(false);
    }
  });

  it('fails closed: the table-exists guard precedes the policy change, inside one atomic DO block', () => {
    const guard = exe.indexOf("to_regclass('public.profile') is null");
    const raise = exe.indexOf('raise exception');
    const change = exe.indexOf('drop policy');
    expect(guard).toBeGreaterThan(-1);
    expect(raise).toBeGreaterThan(guard);
    expect(raise).toBeLessThan(change);
    expect((MIG.match(/do \$mig\$/g) || []).length).toBe(1); // single statement = atomic
  });

  it('touches ONLY public.profile — every unrelated table stays out', () => {
    for (const t of ['clients', 'quotes', 'transactions', 'quote_items', 'outreach_leads', 'founding_applications', 'ai_usage', 'ai_budget_counters']) {
      expect(exe.includes(t), t).toBe(false);
    }
    // every executable table reference is public.profile
    const refs = exe.match(/public\.\w+/g) || [];
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(r).toBe('public.profile');
  });
});
