import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ===================================================================
// CLASS GUARD — every `SECURITY DEFINER` function declared anywhere under
// `supabase/` must revoke EXECUTE from `anon`.
//
// WHY THIS FILE EXISTS. `revoke ... from public` does NOT remove a role's own
// explicit grant, and Supabase's project-level default privileges grant EXECUTE
// on new functions to `anon`. The Asset Library and Campaigns migrations both
// ended their counter with `revoke ... from public` + `grant ... to
// authenticated`, and `anon` kept EXECUTE BOTH TIMES — the identical line
// produced the identical hole in two consecutive slices.
//
// Fixing the three live functions would fix three incidents. This test is what
// closes the CLASS: the next `SECURITY DEFINER` function added without a
// revoke-from-anon fails here, in CI, before it is ever applied.
//
// It reads SQL TEXT. It cannot prove anything about the live database — that is
// what the migration's own `has_function_privilege` assertions and the
// owner-run verification queries do.
// ===================================================================

const dir = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (path) => readFileSync(path, 'utf8');

const MIGRATIONS_DIR = dir('../../../supabase/migrations');
const SCHEMA_FILE = dir('../../../supabase/schema.sql');

// Statements only. A `revoke` mentioned in a comment must never satisfy this
// check, and a declaration inside a commented-out block must never trip it.
// (Measured twice in this repo: a `--`-only strip let a predicate commented out
// with block syntax satisfy its own test, and a whole-file scan matched the
// comment explaining why a string was absent.)
const stripComments = (sql) => sql
  .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '\n');

const files = [
  ...readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).map((f) => `${MIGRATIONS_DIR}/${f}`),
  SCHEMA_FILE,
];

// The whole SQL corpus, comments removed. Corpus-wide on purpose: a revoke may
// legitimately live in a LATER migration than the declaration it protects —
// which is exactly how the three counters are fixed.
const corpus = files.map((f) => stripComments(read(f))).join('\n');

/**
 * Every function declared `security definer`, by name.
 * A declaration runs from `create ... function public.NAME(` to the end of its
 * body (`$$;` / `$name$;`), so `security definer` is attributed to the function
 * it actually belongs to and never to the next one in the file.
 */
function securityDefinerFunctions(sql) {
  const found = new Set();
  const decl = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi;
  let m;
  while ((m = decl.exec(sql)) !== null) {
    const name = m[1];
    const rest = sql.slice(m.index);
    const end = rest.search(/\$[a-z_]*\$\s*;/i);
    const body = end === -1 ? rest : rest.slice(0, end);
    if (/\bsecurity\s+definer\b/i.test(body)) found.add(name);
  }
  return [...found].sort();
}

/** Does the corpus revoke EXECUTE on `name` from `anon`? */
function revokesFromAnon(sql, name) {
  // `revoke [all|execute] on function public.name(<any args>) from <roles incl. anon>`
  const re = new RegExp(
    String.raw`revoke\s+(?:all|execute)[\w\s]*?\s+on\s+function\s+public\.${name}\s*\([^)]*\)\s+from\s+([^;]+);`,
    'gi',
  );
  let m;
  while ((m = re.exec(sql)) !== null) {
    const roles = m[1].split(',').map((r) => r.trim().toLowerCase());
    if (roles.includes('anon')) return true;
  }
  return false;
}

const definers = securityDefinerFunctions(corpus);

describe('SECURITY DEFINER functions — EXECUTE must be revoked from anon', () => {
  // POSITIVE CONTROL for the parser itself. A zero-length list would make every
  // assertion below vacuously true, which is exactly how this guard could rot
  // into a check that passes because it finds nothing.
  it('finds the SECURITY DEFINER functions it is supposed to guard', () => {
    expect(definers.length).toBeGreaterThanOrEqual(4);
    for (const name of ['asset_row_count', 'asset_object_count', 'campaign_row_count', 'reserve_ai_budget']) {
      expect(definers, `parser missed ${name}`).toContain(name);
    }
  });

  // NEGATIVE CONTROL for the parser: functions that are NOT security definer
  // must not be demanded. If these appeared, the parser would be attributing
  // `security definer` across declaration boundaries.
  it('does not flag SECURITY INVOKER or plain trigger functions', () => {
    expect(definers).not.toContain('set_updated_at');
    expect(definers).not.toContain('campaign_enforce_status_transition');
    expect(definers).not.toContain('save_quote_atomic');
  });

  // THE CLASS RULE. This is the assertion that fails when the NEXT counter is
  // added without a revoke — the reason this file exists.
  it('revokes EXECUTE from anon for EVERY SECURITY DEFINER function', () => {
    const unprotected = definers.filter((name) => !revokesFromAnon(corpus, name));
    expect(
      unprotected,
      `SECURITY DEFINER function(s) without "revoke execute ... from anon": ${unprotected.join(', ')}. `
      + '`revoke ... from public` is NOT sufficient — Supabase grants EXECUTE to anon by default, '
      + 'so the role\'s own grant must be revoked explicitly. Add it to your migration.',
    ).toEqual([]);
  });

  it('names each of the three counters explicitly, so a rename cannot silently drop one', () => {
    for (const name of ['asset_row_count', 'asset_object_count', 'campaign_row_count']) {
      expect(revokesFromAnon(corpus, name), `${name} is not revoked from anon`).toBe(true);
    }
  });

  it('keeps authenticated able to call the three counters — the policies run as the caller', () => {
    // A revoke that also removed `authenticated` would break every quota check.
    for (const name of ['asset_row_count', 'asset_object_count', 'campaign_row_count']) {
      expect(
        new RegExp(String.raw`grant\s+execute\s+on\s+function\s+public\.${name}\s*\(\s*\)\s+to\s+authenticated`, 'i')
          .test(corpus),
        `${name} must still grant EXECUTE to authenticated`,
      ).toBe(true);
    }
  });
});

describe('the revoke migration itself', () => {
  const sql = stripComments(read(`${MIGRATIONS_DIR}/20260728130000_revoke_anon_counter_execute.sql`));

  it('changes grants only — no table, data or function-body change', () => {
    for (const forbidden of [
      /create\s+table/i, /alter\s+table/i, /drop\s+table/i,
      /\binsert\s+into\b/i, /\bupdate\s+public\./i, /\bdelete\s+from\b/i,
      /create\s+(or\s+replace\s+)?function/i, /create\s+policy/i, /drop\s+policy/i,
    ]) {
      expect(forbidden.test(sql), `migration must not contain ${forbidden}`).toBe(false);
    }
  });

  it('SAFE STOPs if a counter is missing rather than papering over it', () => {
    expect(sql).toContain('to_regprocedure');
    expect(read(`${MIGRATIONS_DIR}/20260728130000_revoke_anon_counter_execute.sql`))
      .toContain('revoke-anon preflight SAFE STOP');
  });

  it('asserts its own postcondition in BOTH directions before finishing', () => {
    expect(sql).toMatch(/has_function_privilege\('anon'/);
    expect(sql).toMatch(/has_function_privilege\('authenticated'/);
    expect(sql).toMatch(/raise exception 'revoke-anon FAILED/);
    expect(sql).toMatch(/raise exception 'revoke-anon BROKE the product/);
  });
});
