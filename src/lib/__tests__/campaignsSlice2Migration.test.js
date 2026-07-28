import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ===================================================================
// Campaigns slice 2 — the optional task -> campaign link. Migration contract.
//
// The migration is OWNER-RUN, never executed by the app or this suite, so this
// file verifies the DDL TEXT. It cannot and does not prove that the live
// database enforces anything — that is what the migration's own
// `raise exception` assertions and the two-account SQL controls in the PR body
// do, against the real project, after the migration applies.
//
// What it CAN do is fail on the two mistakes that would otherwise be found in
// production, months later, by a user:
//   1. a single-column FK, which silently permits cross-account linking;
//   2. a bare ON DELETE SET NULL, which nulls tasks.user_id (NOT NULL) and so
//      makes every delete of a campaign that has tasks fail.
// ===================================================================

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const raw = read('../../../supabase/migrations/20260729120000_campaigns_slice2_task_link.sql');
const sql = raw.toLowerCase();
// Statements only. BOTH comment forms must go: prose in a comment fakes a
// match, and a `--`-only strip would let a predicate commented OUT with /* */
// still satisfy its own test. (Measured lesson, reused from slices past.)
const code = sql
  .replace(/\/\*[\s\S]*?\*\//g, '\n')
  .split('\n').filter((l) => !l.trim().startsWith('--'))
  .join('\n');

/**
 * The `add constraint tasks_campaign_same_owner_fk ...` statement alone, up to
 * its terminating semicolon.
 *
 * Assertions about the FK must read THIS, not the whole file: the migration's
 * own `raise exception` messages quote phrases like "ON DELETE SET NULL" as
 * prose, and a file-wide regex happily matches the string literal instead of
 * the DDL it is supposed to be checking.
 */
function fkStatement() {
  const start = code.indexOf('add constraint tasks_campaign_same_owner_fk');
  if (start === -1) return '';
  const end = code.indexOf(';', start);
  return code.slice(start, end === -1 ? undefined : end);
}

// The slice 1 migration, to prove the key this FK depends on is really there.
const slice1 = read('../../../supabase/migrations/20260728120000_campaigns_slice1.sql')
  .toLowerCase()
  .split('\n').filter((l) => !l.trim().startsWith('--'))
  .join('\n');

describe('migration · the column is optional and needs no backfill', () => {
  it('adds campaign_id as a plain nullable uuid — no NOT NULL, no default', () => {
    expect(code).toMatch(/alter table public\.tasks add column if not exists campaign_id uuid\s*;/);
  });

  it('never declares the column NOT NULL — existing tasks must stay valid', () => {
    const line = code.split('\n').find((l) => l.includes('add column if not exists campaign_id'));
    expect(line).toBeTruthy();
    expect(line).not.toContain('not null');
    expect(line).not.toContain('default');
  });

  it('performs NO backfill — no UPDATE, INSERT or data statement anywhere', () => {
    expect(code).not.toMatch(/\bupdate\s+public\./);
    expect(code).not.toMatch(/\binsert\s+into\b/);
    expect(code).not.toMatch(/\bdelete\s+from\b/);
    expect(code).not.toMatch(/\btruncate\b/);
  });
});

describe('migration · same-account ownership is enforced by the KEY, not by a policy', () => {
  // THE ASSERTION THIS SLICE EXISTS FOR. A single-column FK on campaign_id
  // alone would let account A reference account B's campaign: an FK is checked
  // by the system, not through RLS, so RLS hiding B's row does NOT stop it.
  // POSITIVE CONTROL for the extractor itself. Every assertion below reads the
  // isolated statement, so an extractor that found nothing would make them all
  // vacuously true — the exact way this file could rot into a green no-op.
  it('locates the constraint statement it is about to assert on', () => {
    const fk = fkStatement();
    expect(fk.length).toBeGreaterThan(40);
    expect(fk).toContain('foreign key');
  });

  it('uses the COMPOSITE key (campaign_id, user_id) → campaigns (id, user_id)', () => {
    expect(fkStatement()).toMatch(
      /foreign key \(campaign_id,\s*user_id\)\s*references public\.campaigns \(id,\s*user_id\)/,
    );
  });

  it('never declares a single-column FK on campaign_id', () => {
    // `foreign key (campaign_id)` with nothing after the column would be the bug.
    const fk = fkStatement();
    expect(fk).not.toMatch(/foreign key \(campaign_id\s*\)/);
    expect(fk).not.toMatch(/references public\.campaigns \(id\s*\)/);
  });

  it('references the composite UNIQUE that slice 1 created for exactly this', () => {
    // Without UNIQUE (id, user_id) on campaigns, the FK above is rejected
    // outright by PostgreSQL. The dependency is real, so it is asserted.
    expect(slice1).toMatch(/unique\s*\(id,\s*user_id\)/);
    expect(slice1).toContain('campaigns_id_user_unique');
    // ...and the preflight must check it LIVE by constraint, not by index name:
    // a same-named non-unique index would not satisfy the FK.
    expect(code).toContain("c.contype = 'u'");
    expect(code).toContain('campaigns_id_user_unique');
  });
});

describe('migration · campaign deletion clears ONLY campaign_id', () => {
  // A bare `on delete set null` nulls EVERY column of the key, including
  // tasks.user_id, which is NOT NULL — so every campaign delete that had tasks
  // would fail. The column list is the whole fix, and it is PG15+ syntax.
  it('uses the column-subset form ON DELETE SET NULL (campaign_id)', () => {
    expect(fkStatement()).toMatch(/on delete set null \(campaign_id\)/);
  });

  it('never uses a bare ON DELETE SET NULL — it would null tasks.user_id too', () => {
    // Scoped to the CONSTRAINT STATEMENT, not the whole file: the migration's
    // own error message contains the words "ON DELETE SET NULL" as prose, and a
    // file-wide regex matches that string literal instead of any real DDL.
    // (Caught by this suite on first run — the assertion was over-broad.)
    const fk = fkStatement();
    expect(fk).toMatch(/on delete set null \(campaign_id\)/);
    expect(
      /on delete set null(?!\s*\()/.test(fk),
      'a SET NULL without a column list would take user_id down with it',
    ).toBe(false);
  });

  it('does not CASCADE — deleting a campaign must not delete its tasks', () => {
    const fk = fkStatement();
    expect(fk).not.toContain('on delete cascade');
    expect(fk).not.toContain('on delete restrict');
  });

  it('asserts the SET NULL column list in the DB itself, not just in this test', () => {
    // confdelsetcols is the catalog column that records WHICH columns SET NULL
    // touches. The migration proves its own postcondition and aborts otherwise.
    expect(code).toContain('confdelsetcols');
    expect(code).toMatch(/setcols is distinct from array\['campaign_id'\]::name\[\]/);
    expect(code).toMatch(/raise exception 'campaigns slice 2 failed/i);
  });

  it("asserts ON DELETE really is SET NULL ('n'), not merely present", () => {
    expect(code).toMatch(/c\.confdeltype <> 'n'/);
  });
});

describe('migration · indexing the referential-integrity scan', () => {
  it('indexes campaign_id partially, skipping the unlinked majority', () => {
    expect(code).toMatch(
      /create index if not exists idx_tasks_campaign\s*\n?\s*on public\.tasks \(campaign_id\) where campaign_id is not null/,
    );
  });
});

describe('migration · additive, idempotent, and narrow', () => {
  it('contains no destructive statement against data or structure', () => {
    expect(code).not.toMatch(/\bdrop table\b/);
    expect(code).not.toMatch(/\bdrop column\b/);
    expect(code).not.toMatch(/\bdrop index\b/);
  });

  it('is re-runnable: guarded add/create + drop-then-add for the constraint', () => {
    expect(code).toContain('add column if not exists');
    expect(code).toContain('create index if not exists');
    expect(code).toContain('drop constraint if exists tasks_campaign_same_owner_fk');
  });

  // SCOPE DISCIPLINE. This slice adds a column and a key. Anything else in this
  // file is unrelated schema debt riding along, which is what this test blocks.
  it('touches ONLY public.tasks — and only reads public.campaigns', () => {
    for (const t of ['public.clients', 'public.assets', 'public.quotes', 'public.business_profile', 'public.transactions', 'public.outreach_leads']) {
      expect(code, `must not reference ${t}`).not.toContain(t);
    }
    // exactly one ALTER TABLE target
    const altered = new Set((code.match(/alter table (public\.\w+)/g) || []).map((s) => s.replace('alter table ', '')));
    expect([...altered]).toEqual(['public.tasks']);
  });

  it('changes no RLS, no policy, no function and no trigger', () => {
    for (const forbidden of [/create policy/, /drop policy/, /enable row level security/,
      /create\s+(or replace\s+)?function/, /create trigger/, /drop trigger/]) {
      expect(forbidden.test(code), `must not contain ${forbidden}`).toBe(false);
    }
  });

  it('adds no SECURITY DEFINER function — so the anon-EXECUTE class cannot recur', () => {
    // The class guard in securityDefinerGrants.test.js is corpus-wide; this is
    // the local statement that this slice contributes nothing to that class.
    expect(code).not.toContain('security definer');
  });
});

// The verification block is a COMMENT, so it is read from `raw`, not `code`.
// It is still worth testing: an operator follows it against a live database
// with real account ids, and the previous version claimed "none of these
// modify data" while controls 3-8 wrote and one deleted a campaign row.
// (Codex P2 on PR #131, second round.)
describe('verification section · tells the truth about what mutates', () => {
  const verification = raw.slice(raw.indexOf('-- VERIFICATION'));

  it('exists and is the last block in the file', () => {
    expect(verification.length).toBeGreaterThan(1000);
  });

  it('never claims the whole section is read-only or non-mutating', () => {
    // The exact false claim that was there before.
    expect(verification).not.toMatch(/none of these modify data/i);
    expect(verification).not.toMatch(/^-- VERIFICATION \(read-only/m);
  });

  it('separates read-only catalog checks from mutating acceptance controls', () => {
    expect(verification).toMatch(/PART A -- READ-ONLY \(modifies nothing\)/);
    expect(verification).toMatch(/PART B -- MUTATING ACCEPTANCE CONTROLS/);
  });

  it('marks the campaign deletion as DESTRUCTIVE, in the control itself', () => {
    expect(verification).toMatch(/DESTRUCTIVE -- PERMANENTLY DELETES CA/);
    // ...and not merely in a distant preamble the operator may have scrolled past
    const control7 = verification.slice(verification.indexOf('-- 7. DELETION SEMANTICS'));
    expect(control7.slice(0, 400)).toMatch(/DESTRUCTIVE/);
  });

  it('requires disposable QA records and forbids pointing at real data', () => {
    expect(verification).toMatch(/DISPOSABLE QA RECORDS ONLY/);
    expect(verification).toMatch(/NEVER point these\s*\n?--\s*controls at a real campaign/);
  });

  it('requires cleanup that is VERIFIED, not assumed', () => {
    expect(verification).toMatch(/PART B CLEANUP/);
    expect(verification).toMatch(/VERIFIED not assumed/);
    // a query whose expected result proves the residue is gone
    expect(verification).toMatch(/expect 0 from every row/);
    expect(verification).toMatch(/non-zero count means QA residue/);
  });

  it('labels each mutating control at the point of use', () => {
    // Controls 4 and 6 write; 5 and 8 attempt a write that must fail.
    expect((verification.match(/\[WRITES\]/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((verification.match(/attempts a write; must FAIL/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('keeps PART A genuinely read-only — no write verb among checks 1-3', () => {
    const partA = verification.slice(
      verification.indexOf('PART A -- READ-ONLY'),
      verification.indexOf('PART B -- MUTATING'),
    );
    for (const verb of [/\bupdate\s+public\./i, /\bdelete\s+from\b/i, /\binsert\s+into\b/i]) {
      expect(verb.test(partA), `PART A must contain no ${verb}`).toBe(false);
    }
  });
});

describe('migration · fail-loud preflight', () => {
  it('SAFE STOPs on every precondition instead of silently continuing', () => {
    expect(raw).toContain('Campaigns slice 2 SAFE STOP');
    expect((raw.match(/SAFE STOP/g) || []).length).toBeGreaterThanOrEqual(5);
  });

  it('checks the server version, because the column-list SET NULL is PG15+', () => {
    expect(code).toContain('server_version_num');
    expect(code).toMatch(/< 150000/);
  });

  it('checks both tables and the NOT NULL uuid ownership column it keys on', () => {
    expect(code).toContain("to_regclass('public.tasks')");
    expect(code).toContain("to_regclass('public.campaigns')");
    expect(code).toMatch(/column_name = 'user_id' and data_type = 'uuid' and is_nullable = 'no'/);
  });

  // A PRE-EXISTING campaign_id is validated in FULL, not just by type.
  // `add column if not exists` silently no-ops, so whatever shape is already
  // there is the shape the FK gets built on. Codex P2 on PR #131: checking only
  // the type accepts a NOT NULL column (which breaks every task insert, since
  // TASK_FIELDS never sends campaign_id) and a defaulted one (which silently
  // populates campaigns nobody chose, then fails the FK).
  describe('a pre-existing campaign_id must match the approved optional column', () => {
    // The preflight branch that guards the pre-existing case, isolated so these
    // assertions cannot be satisfied by the ADD COLUMN statement further down.
    const guard = (() => {
      const start = code.indexOf("column_name = 'campaign_id'");
      return start === -1 ? '' : code.slice(start, code.indexOf('$$;', start));
    })();

    // POSITIVE CONTROL for the extractor — a miss would make the rest vacuous.
    it('locates the pre-existing-column guard', () => {
      expect(guard.length).toBeGreaterThan(200);
      expect(guard).toContain('raise exception');
    });

    it('rejects a WRONG TYPE', () => {
      expect(guard).toMatch(/data_type = 'uuid'/);
      expect(guard).toMatch(/campaign_id already exists and is not uuid/);
    });

    it('rejects NOT NULL — the link is optional, and the frontend never sends it', () => {
      expect(guard).toMatch(/is_nullable = 'no'/);
      expect(guard).toMatch(/campaign_id already exists and is not null/i);
    });

    it('rejects a DEFAULT — it would populate campaigns nobody chose', () => {
      expect(guard).toMatch(/column_default is not null/);
      expect(guard).toMatch(/campaign_id already exists with a default/i);
    });

    // A GENERATED ALWAYS column reports uuid / nullable / NO default, so it
    // passes every other check here and the FK installs cleanly on an empty
    // table. Its expression lives in `generation_expression`, NOT
    // `column_default`, which is why the default check does not catch it.
    // (Codex P2 on PR #131, second round.)
    it('rejects a GENERATED column — the link must be client-assignable', () => {
      expect(guard).toMatch(/is_generated <> 'never'/);
      expect(guard).toMatch(/campaign_id already exists as a generated column/i);
    });

    it('does not rely on column_default to catch a generated column', () => {
      // The two checks are independent: a generated column has a NULL
      // column_default, so conflating them would let it through.
      expect(guard).toContain('column_default is not null');
      expect(guard).toContain("is_generated <> 'never'");
    });

    it('reports the four failures SEPARATELY, so the operator is not left guessing', () => {
      const raises = (guard.match(/raise exception 'campaigns slice 2 safe stop: public\.tasks\.campaign_id/g) || []);
      expect(raises).toHaveLength(4);
    });

    // The shape asserted here must be the shape the migration actually creates,
    // or the preflight would refuse its own output on a re-run.
    it('demands exactly the shape ADD COLUMN creates — so a re-run is never refused', () => {
      const add = code.split('\n').find((l) => l.includes('add column if not exists campaign_id'));
      expect(add).toMatch(/campaign_id uuid\s*;/);   // uuid, no NOT NULL, no DEFAULT
      expect(add).not.toContain('not null');
      expect(add).not.toContain('default');
    });
  });

  it('declares its limitations rather than leaving them implicit', () => {
    for (const l of ['L1', 'L2', 'L3']) expect(raw).toContain(l);
    expect(raw).not.toContain('L4');
  });
});
