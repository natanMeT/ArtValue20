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
  it('skips the preflight on a fresh install (guarded by to_regclass ... is null → return)', () => {
    // fresh install: table absent → preflight returns early; create-table handles it.
    // (This is also what lets a clean rerun after the canonical migration pass.)
    expect(sql).toMatch(/if to_regclass\('public\.business_profile'\) is null then\s*return/);
  });

  it('runs a preflight that RAISEs on every incompatible structural property', () => {
    expect(sql).toContain('raise exception');
    expect(sql).toContain('is not a base table');
    expect(sql).toContain('primary key is not exactly (user_id)');
    expect(sql).toContain('is not uuid not null');
    // FK must reference EXACTLY auth.users(id) — referenced-column (confkey) check
    expect(sql).toContain('is not exactly auth.users(id) on delete cascade');
    expect(sql).toContain("fa.attname = 'id'");
    expect(sql).toContain('array_length(c.confkey, 1) = 1');
    // conflicting policy / trigger assumptions abort, not silently continue
    expect(sql).toContain('unexpected/conflicting rls policy');
    expect(sql).toContain('unexpected trigger');
    // NOT NULL columns without a default that the upsert never sends abort too —
    // only user_id is exempt (created_at/updated_at must carry a default).
    expect(sql).toContain('not null column without a default');
    expect(sql).toMatch(/is_nullable = 'no' and column_default is null\s*and column_name <> 'user_id'/);
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
