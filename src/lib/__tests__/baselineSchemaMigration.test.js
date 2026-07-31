import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ===================================================================
// BASELINE migration — contract guard.
//
// WHAT THIS PROTECTS. Before the baseline, `supabase/migrations/**` could not
// rebuild the database from zero: measured, 9 of 14 migrations failed against
// an empty Supabase-shaped Postgres. The baseline is what makes the set
// replayable — so the two ways it can silently rot are:
//
//   1. it drifts from `supabase/schema.sql` (the historical copy it embeds), or
//   2. someone "improves" `public.profile` into it, widening access on a table
//      that deliberately has RLS on and ZERO policies.
//
// Both are guarded below. This file reads SQL TEXT: it cannot prove the live
// database enforces anything, and it does not try. The rebuild proof is
// `supabase db reset` reaching 15/15 plus the inventory diff against live.
//
// LINE ENDINGS. The repo checks out CRLF and tooling writes LF, so every
// comparison here normalizes first. A byte-compare would fail for a reason that
// has nothing to do with the contract, and a test that fails for the wrong
// reason gets disabled rather than believed.
// ===================================================================

const dir = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const MIGRATIONS_DIR = dir('../../../supabase/migrations');
const BASELINE = `${MIGRATIONS_DIR}/00000000000000_baseline_schema.sql`;
const SCHEMA = dir('../../../supabase/schema.sql');

const norm = (s) => s.replace(/\r\n/g, '\n');
const baseline = norm(readFileSync(BASELINE, 'utf8'));
const schema = norm(readFileSync(SCHEMA, 'utf8'));

// Statements only — a claim made in a comment must never satisfy a check, and a
// commented-out statement must never trip one. (Measured twice in this repo.)
const code = baseline
  .replace(/\/\*[\s\S]*?\*\//g, '\n')
  .split('\n').filter((l) => !l.trim().startsWith('--'))
  .join('\n');

describe('baseline · it embeds schema.sql without drift', () => {
  it('carries the schema.sql body VERBATIM between its markers', () => {
    const m = baseline.match(/^-- >>> BEGIN schema\.sql[^\n]*\n([\s\S]*?)\n-- <<< END schema\.sql/m);
    expect(m, 'the schema.sql region markers must both be present').not.toBeNull();
    // The whole point: if schema.sql is edited and the baseline is not, this
    // fails — the two cannot drift silently while both are retained.
    expect(m[1].trimEnd()).toBe(schema.trimEnd());
  });

  it('sorts FIRST in the migration directory, or it is not a baseline', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    expect(files[0]).toBe('00000000000000_baseline_schema.sql');
  });

  it('states that it is registered by `migration repair`, never pushed', () => {
    // The safety of this slice is the ORDER, not the SQL. That has to be
    // written down in the file a future reader actually opens.
    expect(baseline).toMatch(/migration repair --status applied/);
    expect(baseline).toMatch(/db push` must\s*\n?-- NEVER be used|NEVER be used to deliver this file/);
  });
});

describe('baseline · public.profile is RECONSTRUCTED, never redesigned', () => {
  it('creates the table with the live columns and defaults', () => {
    expect(code).toMatch(/create table if not exists public\.profile/);
    expect(code).toMatch(/id\s+integer primary key default 1/);
    for (const col of ['full_name', 'email', 'phone', 'business_id', 'address']) {
      expect(code).toMatch(new RegExp(`${col}\\s+text default ''::text`));
    }
    expect(code).toMatch(/business_name\s+text default 'ArtValue'::text/);
  });

  it('keeps the id = 1 singleton CHECK that exists live', () => {
    expect(code).toMatch(/add\s+constraint profile_id_check check \(id = 1\)/);
  });

  it('enables RLS and creates NO policy on profile — zero client access', () => {
    expect(code).toMatch(/alter table public\.profile enable row level security/);
    // THE load-bearing assertion. A policy here would widen access on a table
    // that currently grants none, undoing 20260719100000_profile_rls_lockdown.
    const profileRegion = code.slice(code.indexOf('public.profile'));
    expect(profileRegion).not.toMatch(/create policy[^;]*on public\.profile/);
    expect(code).not.toMatch(/create policy[^;]*on public\.profile/);
  });

  it('does not restate table grants — RLS with no policy is the control', () => {
    expect(code).not.toMatch(/grant[^;]*on public\.profile/);
  });
});

describe('baseline · safety envelope', () => {
  it('is additive and idempotent — nothing destructive to existing data', () => {
    expect(code).not.toMatch(/drop table/i);
    expect(code).not.toMatch(/drop column/i);
    expect(code).not.toMatch(/\bdelete from\b/i);
    expect(code).not.toMatch(/truncate/i);
    expect(code).toMatch(/create table if not exists public\.profile/);
  });

  it('adds NO table beyond profile — everything else comes from schema.sql', () => {
    // Tables created AFTER the embedded region are this file's own additions.
    const own = baseline.split('-- <<< END schema.sql')[1] || '';
    const tables = (own.replace(/^\s*--.*$/gm, '').match(/create table(?: if not exists)? (\S+)/g) || []);
    expect(tables).toEqual(['create table if not exists public.profile']);
  });
});
