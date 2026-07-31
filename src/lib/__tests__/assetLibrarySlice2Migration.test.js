import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ===================================================================
// Asset Library slice 2 — migration contract.
//
// The migration is OWNER-RUN, never executed by the app or this suite, so this
// file verifies the DDL TEXT and nothing more. It cannot prove that a live
// database enforces anything: that is what the rehearsal on a real PostgreSQL
// and the owner-run controls in the PR body do.
//
// THE ONE CLAIM THIS SLICE MUST NOT GET WRONG: the update seam is limited to a
// SINGLE COLUMN, and the limit lives in the GRANT, not in the policy. A policy
// cannot restrict columns. So the tests below check the revoke/grant pair as
// carefully as the policy itself.
// ===================================================================

const sqlPath = new URL('../../../supabase/migrations/20260803120000_asset_library_slice2_favorites.sql', import.meta.url);
const sql = readFileSync(sqlPath, 'utf8').toLowerCase();

// Statements only. BOTH comment forms must go — a `--`-only strip once let a
// predicate that had been commented OUT with /* */ satisfy its own test.
const code = sql
  .replace(/\/\*[\s\S]*?\*\//g, '\n')
  .split('\n').filter((l) => !l.trim().startsWith('--'))
  .join('\n');

describe('slice 2 migration · the column', () => {
  it('adds is_favorite as boolean NOT NULL DEFAULT false, additively', () => {
    expect(code).toMatch(
      /alter table public\.assets add column if not exists is_favorite boolean not null default false/,
    );
  });

  it('adds NOTHING else to the table — one slice, one column', () => {
    const added = code.match(/add column if not exists (\w+)/g) || [];
    expect(added).toEqual(['add column if not exists is_favorite']);
  });
});

describe('slice 2 migration · the update seam is owner-only AND single-column', () => {
  it('creates exactly one UPDATE policy, owner-scoped in BOTH directions', () => {
    expect(code).toContain('create policy "assets_update_favorite_own" on public.assets');
    const policy = (code.split('create policy "assets_update_favorite_own"')[1] || '').split(';')[0];
    expect(policy).toMatch(/for update to authenticated/);
    // USING decides which rows may be updated; WITH CHECK decides what they may
    // become. Without WITH CHECK an owner could rewrite user_id.
    expect(policy).toMatch(/using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/);
    expect(policy).toMatch(/with check\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/);
    expect((code.match(/create policy[^;]*on public\.assets/g) || []).length).toBe(1);
  });

  it('REVOKES table-wide UPDATE from public, anon AND authenticated before granting', () => {
    // `revoke ... from public` does not remove a role's own grant — the counter
    // functions taught this. Each role is named.
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(code).toMatch(new RegExp(`revoke update on public\\.assets from ${role}`));
    }
    const revokeAt = code.indexOf('revoke update on public.assets from authenticated');
    const grantAt = code.indexOf('grant update (is_favorite) on public.assets to authenticated');
    expect(revokeAt).toBeGreaterThan(-1);
    expect(grantAt).toBeGreaterThan(revokeAt); // revoking AFTER granting would erase the grant
  });

  it('grants UPDATE on is_favorite ONLY, and to authenticated ONLY', () => {
    expect(code).toContain('grant update (is_favorite) on public.assets to authenticated');
    // no table-wide update grant, and no column grant for any other column
    expect(code).not.toMatch(/grant\s+update\s+on public\.assets/);
    const grants = code.match(/grant update \(([^)]*)\) on public\.assets to (\w+)/g) || [];
    expect(grants).toEqual(['grant update (is_favorite) on public.assets to authenticated']);
    expect(code).not.toMatch(/grant[^;]*on public\.assets[^;]*to anon/);
  });

  it('does not weaken slice 1 — no new insert/select/delete policy, no dropped policy', () => {
    expect(code).not.toMatch(/create policy[^;]*on public\.assets\s+for (insert|select|delete)/);
    expect(code).not.toMatch(/drop policy if exists "assets_(select|insert|delete)_own"/);
  });
});

describe('slice 2 migration · Storage and the quota are untouched', () => {
  it('creates, alters or drops NO storage.objects policy', () => {
    expect(code).not.toMatch(/(create|drop|alter) policy[^;]*on storage\.objects/);
  });

  it('does not touch the bucket, the counters or the 40-item quota', () => {
    expect(code).not.toMatch(/storage\.buckets/);
    expect(code).not.toMatch(/create or replace function public\.asset_(object|row)_count/);
    expect(code).not.toMatch(/\b40\b/);
  });

  it('leaves kind = image alone — video is NOT smuggled in', () => {
    expect(code).not.toMatch(/assets_kind_allowed/);
    expect(code).not.toMatch(/kind in \(/);
  });
});

describe('slice 2 migration · safety envelope', () => {
  it('is additive only — no destructive statement anywhere', () => {
    expect(code).not.toMatch(/drop table/);
    expect(code).not.toMatch(/drop column/);
    expect(code).not.toMatch(/\bdelete from\b/);
    expect(code).not.toMatch(/truncate/);
    // the only UPDATE in the file is the privilege verb, never a data write
    expect(code).not.toMatch(/update public\.assets set/);
  });

  it('is safe to re-run: if-not-exists column and drop-then-create policy', () => {
    expect(code).toContain('add column if not exists');
    expect(code).toContain('drop policy if exists "assets_update_favorite_own"');
  });

  it('SAFE STOPs when slice 1 is absent or an unexpected UPDATE policy exists', () => {
    expect(code).toMatch(/preflight safe stop[^']*slice 1 has not been applied/);
    expect(code).toMatch(/preflight safe stop[^']*unexpected update policy/);
  });

  it('asserts its OWN security outcome instead of leaving it to a reader', () => {
    // the postcondition block must prove the grant surface, both directions
    expect(code).toMatch(/has_column_privilege\('authenticated', 'public\.assets', 'is_favorite', 'update'\)/);
    expect(code).toMatch(/if has_table_privilege\('authenticated', 'public\.assets', 'update'\)/);
    for (const col of ['prompt', 'storage_path', 'user_id']) {
      expect(code).toMatch(new RegExp(`has_column_privilege\\('authenticated', 'public\\.assets', '${col}', 'update'\\)`));
    }
    expect(code).toMatch(/has_table_privilege\('anon', 'public\.assets', 'update'\)/);
    expect(code).toMatch(/postcondition failed/);
  });
});
