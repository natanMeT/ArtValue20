import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ===================================================================
// S0D migration contract — additive, idempotent, fail-loud preflight,
// per-user RLS. Verifies the DDL text (the migration is owner-run, not
// executed by the app or this suite).
// ===================================================================

const sql = readFileSync(
  new URL('../../../supabase/migrations/20260724120000_s0d_business_profile.sql', import.meta.url),
  'utf8',
).toLowerCase();

describe('S0D migration · table + columns', () => {
  it('creates public.business_profile with user_id as the PK → auth.users ON DELETE CASCADE', () => {
    expect(sql).toContain('create table if not exists public.business_profile');
    expect(sql).toMatch(/user_id\s+uuid\s+primary key\s+references auth\.users\s*\(id\)\s+on delete cascade/);
  });

  it('declares every expected column with the right type', () => {
    expect(sql).toMatch(/business_name\s+text/);
    expect(sql).toMatch(/positioning\s+text/);
    expect(sql).toMatch(/audiences\s+text\[\]/);
    expect(sql).toMatch(/tone\s+text\[\]/);
    expect(sql).toMatch(/differentiators\s+text\[\]/);
    expect(sql).toMatch(/services\s+jsonb/);
    expect(sql).toMatch(/brand_palette\s+jsonb/);
    expect(sql).toMatch(/created_at\s+timestamptz/);
    expect(sql).toMatch(/updated_at\s+timestamptz/);
  });

  it('adds every non-PK column with ADD COLUMN IF NOT EXISTS (completes a partial table)', () => {
    for (const col of ['business_name', 'positioning', 'audiences', 'tone', 'differentiators', 'services', 'brand_palette', 'created_at', 'updated_at']) {
      expect(sql).toContain(`add column if not exists ${col}`);
    }
  });
});

describe('S0D migration · idempotency + RLS + trigger', () => {
  it('reuses the canonical set_updated_at trigger (idempotent recreation)', () => {
    expect(sql).toContain('create or replace function public.set_updated_at()');
    expect(sql).toContain('drop trigger if exists trg_business_profile_updated');
    expect(sql).toContain('execute function public.set_updated_at()');
  });

  it('enables RLS + a per-user own-row policy (idempotent recreation)', () => {
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('drop policy if exists "business_profile_own"');
    expect(sql).toMatch(/create policy "business_profile_own".*for all using \(auth\.uid\(\) = user_id\) with check \(auth\.uid\(\) = user_id\)/s);
  });
});

describe('S0D migration · fail-loud preflight + safety', () => {
  it('runs a preflight that RAISEs on an incompatible pre-existing table', () => {
    expect(sql).toContain('to_regclass(\'public.business_profile\')');
    expect(sql).toContain('raise exception');
    // structural checks: base table, PK exactly user_id, uuid+not null, FK cascade
    expect(sql).toContain('is not a base table');
    expect(sql).toContain('primary key is not exactly (user_id)');
    expect(sql).toContain('is not uuid not null');
    expect(sql).toContain('fk is not auth.users(id) on delete cascade');
  });

  it('is non-destructive: no DROP TABLE / DELETE FROM / user-specific INSERT statement', () => {
    expect(sql).not.toMatch(/drop\s+table\s+(if\s+exists\s+)?public\.business_profile/);
    expect(sql).not.toMatch(/delete\s+from\s+public\.business_profile/);
    expect(sql).not.toMatch(/insert\s+into\s+public\.business_profile/);
  });

  it('does NOT modify legacy public.profile (only public.business_profile DDL)', () => {
    expect(sql).not.toMatch(/(alter table|drop table|create policy[^;]*on|create trigger[^;]*on|enable row level security)[^;]*\bpublic\.profile\b/);
  });

  it('carries no trailing executable verification SELECT block (verification lives in the runbook)', () => {
    // preflight SELECTs live inside the do $$ ... $$ control block; there must be
    // no bare verification query after the final DDL statement (the RLS policy).
    const tail = sql.slice(sql.lastIndexOf('create policy "business_profile_own"'));
    expect(tail).not.toContain('select');
    expect(sql).not.toContain('verification (read-only');
  });
});
