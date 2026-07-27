import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// ===================================================================
// Asset Library slice 1 — migration contract + product-wide invariants.
//
// The migration is OWNER-RUN, never executed by the app or this suite, so
// this file verifies the DDL TEXT. It cannot and does not prove that the
// live database enforces anything — that is what the owner-run SQL controls
// in the PR body do, against the real project, after the migration applies.
// ===================================================================

const sqlPath = new URL('../../../supabase/migrations/20260727120000_asset_library_slice1.sql', import.meta.url);
const raw = readFileSync(sqlPath, 'utf8');
const sql = raw.toLowerCase();
// statements only — comment lines carry prose that would fake matches
const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('migration · table + structural isolation', () => {
  it('creates public.assets with id as the PK and user_id → auth.users ON DELETE CASCADE', () => {
    expect(code).toContain('create table if not exists public.assets');
    expect(code).toMatch(/id\s+uuid\s+primary key/);
    expect(code).toMatch(/user_id\s+uuid\s+not null\s+references auth\.users\s*\(id\)\s+on delete cascade/);
  });

  it('binds storage_path to this row\'s OWN columns — byte-exact, not a prefix or LIKE test', () => {
    expect(code).toMatch(
      /check\s*\(\s*storage_path\s*=\s*user_id::text\s*\|\|\s*'\/'\s*\|\|\s*id::text\s*\|\|\s*'\.'\s*\|\|\s*ext\s*\)/,
    );
    expect(code).not.toMatch(/storage_path\s+like/);
  });

  it('enforces the MIME allowlist, the extension set and the per-file size ceiling', () => {
    expect(code).toMatch(/check\s*\(\s*mime in \('image\/png', 'image\/jpeg', 'image\/webp'\)\s*\)/);
    expect(code).toMatch(/check\s*\(\s*ext in \('png', 'jpg', 'jpeg', 'webp'\)\s*\)/);
    expect(code).toMatch(/byte_size\s*>\s*0\s+and\s+byte_size\s*<=\s*10485760/);
  });

  it('makes storage_path unique, so two rows cannot claim one object', () => {
    expect(code).toMatch(/unique\s*\(storage_path\)/);
  });
});

describe('migration · RLS is owner-only on both surfaces', () => {
  it('enables RLS on public.assets with a single own-row policy', () => {
    expect(code).toContain('alter table public.assets enable row level security');
    expect(code).toMatch(/create policy "assets_own" on public\.assets\s+for all using \(auth\.uid\(\) = user_id\) with check \(auth\.uid\(\) = user_id\)/);
  });

  it('scopes every storage.objects policy to this bucket AND the caller\'s own prefix', () => {
    for (const p of ['assets_objects_select_own', 'assets_objects_insert_own', 'assets_objects_delete_own']) {
      expect(code).toContain(`create policy "${p}" on storage.objects`);
    }
    // three policies, three prefix predicates — none may be missing
    const prefixChecks = code.match(/\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/g) || [];
    expect(prefixChecks.length).toBeGreaterThanOrEqual(3);
    const bucketChecks = code.match(/bucket_id = 'assets'/g) || [];
    expect(bucketChecks.length).toBeGreaterThanOrEqual(3);
  });

  it('declares NO update policy — absence is the denial, and it is what forces upsert:false', () => {
    expect(code).not.toMatch(/create policy[^;]*on storage\.objects\s+for update/);
  });

  it('uses auth.uid() only — never a client-supplied owner and never a JWT claim read', () => {
    expect(code).not.toContain('current_setting(');
    expect(code).not.toContain('request.jwt');
  });
});

describe('migration · the bucket is private with server-side limits', () => {
  it('creates `assets` as NOT public and repairs the flag if it already exists', () => {
    expect(code).toMatch(/insert into storage\.buckets[\s\S]*'assets'[\s\S]*false/);
    expect(code).toMatch(/on conflict \(id\) do update[\s\S]*set public\s*=\s*false/);
  });

  it('sets the size limit and the MIME allowlist ON THE BUCKET, not only on the row', () => {
    expect(code).toContain('file_size_limit');
    expect(code).toContain('allowed_mime_types');
    expect(code).toMatch(/array\['image\/png', 'image\/jpeg', 'image\/webp'\]/);
  });
});

describe('migration · the quota lives in the INSERT policy, not in a trigger', () => {
  it('puts the 40-asset predicate in the storage.objects INSERT WITH CHECK', () => {
    const insertPolicy = code.split('create policy "assets_objects_insert_own"')[1] || '';
    expect(insertPolicy).toContain('public.asset_object_count() < 40');
  });

  it('creates NO trigger on storage.objects (the documented extension surface is the policy)', () => {
    expect(code).not.toMatch(/create trigger[\s\S]*on storage\.objects/);
  });

  it('counts inside a SECURITY DEFINER function — the ONLY thing that breaks the RLS recursion', () => {
    expect(code).toMatch(/create or replace function public\.asset_object_count\(\)/);
    expect(code).toContain('security definer');
    expect(code).toContain("set search_path = ''");
  });

  it('takes NO owner argument, so no caller can count another account\'s objects', () => {
    expect(code).toMatch(/function public\.asset_object_count\(\)\s*\n?\s*returns integer/);
    expect(code).not.toMatch(/asset_object_count\(\s*p_\w+/);
  });

  it('is executable by authenticated only — PUBLIC is revoked', () => {
    expect(code).toContain('revoke all on function public.asset_object_count() from public');
    expect(code).toContain('grant execute on function public.asset_object_count() to authenticated');
  });
});

describe('migration · additive, idempotent, non-destructive', () => {
  it('is safe to re-run: create-if-not-exists, drop-then-create policy, on-conflict bucket', () => {
    expect(code).toContain('create table if not exists');
    expect(code).toContain('drop policy if exists');
    expect(code).toContain('on conflict (id) do update');
    expect(code).toContain('create index if not exists');
  });

  it('never destroys or rewrites data', () => {
    expect(code).not.toMatch(/\bdrop table\b/);
    expect(code).not.toMatch(/\bdelete from\b/);
    expect(code).not.toMatch(/\btruncate\b/);
    // the only INSERT is the bucket registration — no user rows are seeded
    const inserts = code.match(/insert into (\w|\.)+/g) || [];
    expect(inserts).toEqual(['insert into storage.buckets']);
  });

  it('grants the client only what it uses — no UPDATE on public.assets', () => {
    expect(code).toContain('grant select, insert, delete on public.assets to authenticated');
    expect(code).not.toMatch(/grant[^;]*update[^;]*on public\.assets/);
  });

  it('touches NO pre-existing table — the device gallery has no DB counterpart to migrate', () => {
    for (const t of ['business_profile', 'clients', 'quotes', 'tasks', 'transactions', 'outreach_leads']) {
      expect(code).not.toContain(t);
    }
  });

  it('fails loud on an incompatible pre-existing table instead of continuing', () => {
    expect(code).toContain('raise exception');
    expect(code).toContain('safe stop');
  });
});

describe('product invariant · bytes are reached ONLY through signed urls', () => {
  const root = fileURLToPath(new URL('../../../src', import.meta.url));
  const grep = (pattern) => {
    try {
      return execFileSync('git', ['grep', '-l', '--', pattern, root], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    } catch (e) {
      if (e.status === 1) return []; // git grep: no matches
      throw e;
    }
  };

  it('never calls getPublicUrl anywhere in src/', () => {
    // POSITIVE CONTROL for the scanner itself: it must be able to find a
    // string that IS present, or a zero result proves nothing (method §21).
    expect(grep('createSignedUrls').length).toBeGreaterThan(0);
    expect(grep('getPublicUrl').filter((f) => !f.includes('__tests__'))).toEqual([]);
  });

  it('the device IndexedDB gallery is never opened from the cloud path', () => {
    // galleryStore is imported by exactly one page, and only for local/demo.
    const importers = grep("from '../lib/galleryStore.js'").filter((f) => !f.includes('__tests__'));
    expect(importers).toHaveLength(1);
    expect(importers[0].replace(/\\/g, '/')).toMatch(/src\/pages\/ImageStudio\.jsx$/);
  });
});
