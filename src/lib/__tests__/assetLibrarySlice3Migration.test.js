import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ===================================================================
// Asset Library slice 3 — migration contract.
//
// The migration is OWNER-RUN, never executed by the app or this suite, so this
// file verifies the DDL TEXT and nothing more. It cannot prove that a live
// database enforces anything: that is what the rehearsal on a real PostgreSQL
// and the owner-run acceptance controls do.
//
// THE TWO CLAIMS THIS SLICE MUST NOT GET WRONG:
//   1. The foreign key is COMPOSITE — (campaign_id, user_id) referencing
//      (id, user_id). A single-column key would let account A link to account
//      B's campaign, because a foreign key is checked by the system and not
//      through RLS.
//   2. ON DELETE SET NULL names campaign_id ALONE. A bare SET NULL would also
//      null assets.user_id (NOT NULL) and make every campaign delete fail —
//      months later, the first time someone deleted a campaign with assets.
// ===================================================================

const sqlPath = new URL('../../../supabase/migrations/20260804120000_asset_library_slice3_campaign_link.sql', import.meta.url);
const sql = readFileSync(sqlPath, 'utf8').toLowerCase();

// Statements only. BOTH comment forms must go — a `--`-only strip once let a
// predicate that had been commented OUT with /* */ satisfy its own test.
const code = sql
  .replace(/\/\*[\s\S]*?\*\//g, '\n')
  .split('\n').filter((l) => !l.trim().startsWith('--'))
  .join('\n');

describe('slice 3 migration · the column', () => {
  it('adds campaign_id as a nullable uuid, additively, with no default', () => {
    expect(code).toMatch(/alter table public\.assets add column if not exists campaign_id uuid;/);
  });

  it('adds NOTHING else to the table — one slice, one column', () => {
    const added = code.match(/add column if not exists (\w+)/g) || [];
    expect(added).toEqual(['add column if not exists campaign_id']);
  });

  it('does not make the column NOT NULL or give it a default', () => {
    const stmt = (code.split('add column if not exists campaign_id')[1] || '').split(';')[0];
    expect(stmt).not.toMatch(/not null/);
    expect(stmt).not.toMatch(/default/);
  });
});

describe('slice 3 migration · the foreign key is COMPOSITE and same-owner', () => {
  const fk = (code.split('add constraint assets_campaign_same_owner_fk')[1] || '').split(';')[0];

  it('carries user_id INTO the key — this is what makes a cross-account link impossible', () => {
    expect(fk).toMatch(/foreign key \(campaign_id, user_id\)/);
  });

  it('references campaigns (id, user_id), NOT campaigns (id)', () => {
    expect(fk).toMatch(/references public\.campaigns \(id, user_id\)/);
    // The exact shape that would silently reintroduce the hole.
    expect(fk).not.toMatch(/references public\.campaigns \(id\)/);
  });

  it('nulls campaign_id ALONE on delete — a bare SET NULL would break every campaign delete', () => {
    expect(fk).toMatch(/on delete set null \(campaign_id\)/);
    expect(fk).not.toMatch(/on delete set null\s*(;|$)/);
  });

  it('does not cascade — deleting a campaign must never delete an asset', () => {
    expect(fk).not.toMatch(/on delete cascade/);
  });

  it('indexes the link partially, for the delete-time integrity scan', () => {
    expect(code).toMatch(/create index if not exists idx_assets_campaign\s+on public\.assets \(campaign_id\) where campaign_id is not null/);
  });
});

describe('slice 3 migration · the writable surface is EXACTLY two columns', () => {
  it('REVOKES table-wide UPDATE from public, anon AND authenticated before granting', () => {
    // `revoke ... from public` does NOT remove a role's own grant, and Supabase
    // grants new public tables to anon and authenticated by default. All three
    // must be named — the lesson the counter functions taught twice.
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(code).toContain(`revoke update on public.assets from ${role};`);
    }
    const revokeAt = code.indexOf('revoke update on public.assets from authenticated;');
    const grantAt = code.indexOf('grant update (is_favorite, campaign_id)');
    expect(revokeAt).toBeGreaterThan(-1);
    expect(grantAt).toBeGreaterThan(revokeAt); // revoke first, or the grant is erased
  });

  it('grants UPDATE on (is_favorite, campaign_id) ONLY, and to authenticated ONLY', () => {
    expect(code).toContain('grant update (is_favorite, campaign_id) on public.assets to authenticated;');
    const grants = code.match(/grant update[^;]*;/g) || [];
    expect(grants).toEqual(['grant update (is_favorite, campaign_id) on public.assets to authenticated;']);
    expect(code).not.toMatch(/grant update on public\.assets/); // never table-wide
    expect(code).not.toMatch(/grant[^;]*to anon/);
  });

  it('re-grants is_favorite — slice 2 must not be silently disabled by this slice', () => {
    // The revoke drops slice 2's column grant too. Forgetting to restore it
    // here would break favorites in production while every test still passed.
    expect(code).toMatch(/grant update \([^)]*is_favorite[^)]*\)/);
  });

  it('creates NO new policy — it extends the slice 2 seam rather than adding a second one', () => {
    expect(code).not.toMatch(/create policy/);
    expect(code).not.toMatch(/drop policy/);
  });
});

describe('slice 3 migration · slice 1, slice 2 and Storage are untouched', () => {
  it('creates, alters or drops NO storage.objects policy', () => {
    expect(code).not.toMatch(/on storage\.objects/);
  });

  it('does not touch the bucket, the counters or the 40-item quota', () => {
    expect(code).not.toMatch(/storage\.buckets/);
    expect(code).not.toMatch(/asset_row_count|asset_object_count/);
    expect(code).not.toMatch(/create (or replace )?function/);
  });

  it('leaves kind = image alone — video is NOT smuggled in', () => {
    expect(code).not.toMatch(/assets_kind_allowed/);
    expect(code).not.toMatch(/'video'/);
  });

  it('does not alter public.campaigns in any way — it only references it', () => {
    expect(code).not.toMatch(/alter table public\.campaigns/);
    expect(code).not.toMatch(/drop .*campaigns_id_user_unique/);
  });
});

describe('slice 3 migration · safety envelope', () => {
  it('is additive only — no destructive statement anywhere', () => {
    expect(code).not.toMatch(/drop table/);
    expect(code).not.toMatch(/truncate/);
    expect(code).not.toMatch(/delete from/);
    expect(code).not.toMatch(/update public\./); // no data migration
    expect(code).not.toMatch(/drop column/);
  });

  it('is safe to re-run: if-not-exists column and index, drop-then-add constraint', () => {
    expect(code).toContain('add column if not exists campaign_id');
    expect(code).toContain('create index if not exists idx_assets_campaign');
    expect(code).toContain('drop constraint if exists assets_campaign_same_owner_fk');
  });

  it('SAFE STOPs on PG < 15, a missing table, or a wrong pre-existing column', () => {
    expect(code).toMatch(/server_version_num[^;]*150000/);
    expect(code).toMatch(/to_regclass\('public\.assets'\) is null/);
    expect(code).toMatch(/to_regclass\('public\.campaigns'\) is null/);
    // each wrong shape reported separately, not as one "wrong shape"
    for (const probe of ['is not uuid', 'is not null', 'default', 'generated']) {
      expect(code).toContain(probe);
    }
  });

  it('SAFE STOPs unless the referenced UNIQUE key is exactly (id, user_id)', () => {
    expect(code).toContain('campaigns_id_user_unique');
    expect(code).toMatch(/array\['id', 'user_id'\]::name\[\]/);
    // checked by CONSTRAINT, not by index name — a same-named non-unique index
    // would not satisfy the foreign key.
    expect(code).toMatch(/pg_constraint/);
    expect(code).toMatch(/c\.contype = 'u'/);
  });

  it('SAFE STOPs unless the slice 2 update seam is present and is the ONLY one', () => {
    expect(code).toContain('assets_update_favorite_own');
    expect(code).toMatch(/cmd = 'update'\s*\n?\s*\) <> 1 then/);
  });

  it('asserts its OWN security outcome instead of leaving it to a reader', () => {
    // both directions, and the FK shape
    expect(code).toMatch(/has_column_privilege\('authenticated', 'public\.assets', 'campaign_id', 'update'\)/);
    expect(code).toMatch(/has_column_privilege\('authenticated', 'public\.assets', 'is_favorite', 'update'\)/);
    expect(code).toMatch(/has_table_privilege\('authenticated', 'public\.assets', 'update'\)/);
    expect(code).toMatch(/has_table_privilege\('anon', 'public\.assets', 'update'\)/);
    expect(code).toMatch(/confdeltype <> 'n'/);
    expect(code).toMatch(/confdelsetcols/);
    expect(code).toMatch(/postcondition failed/);
  });

  it('names every other column explicitly in the negative privilege assertion', () => {
    // A loop over information_schema would silently cover a column added later;
    // naming them is the point.
    for (const col of ['prompt', 'storage_path', 'user_id', 'byte_size', 'mime', 'ext', 'kind', 'created_at']) {
      expect(code).toContain(`has_column_privilege('authenticated', 'public.assets', '${col}', 'update')`);
    }
  });
});
