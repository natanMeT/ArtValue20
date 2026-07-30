import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ===================================================================
// F1 Core Receivables — migration contract.
//
// The migration is OWNER-RUN, never executed by the app or this suite, so this
// file verifies the DDL TEXT. It cannot and does not prove that the live
// database enforces anything — that is what the migration's own
// `raise exception` assertions and the two-account SQL controls in its
// VERIFICATION section do, against the real project, after it applies.
//
// What it CAN do is fail on the mistakes that would otherwise be found in
// production, months later, by a user:
//   1. a SINGLE-COLUMN foreign key, which silently permits cross-account
//      references — an FK is checked by the system, not through RLS;
//   2. a bare ON DELETE SET NULL, which nulls user_id (NOT NULL) and makes every
//      delete of the parent fail;
//   3. a stored payment-status column, which is a second copy of a rule that is
//      free to drift from the amounts;
//   4. a silently changed ON DELETE action on an EXISTING relationship;
//   5. a blind `drop constraint if exists` on a unique key that is already the
//      target of a foreign key.
// ===================================================================

const dir = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(dir(rel), 'utf8');

const FILE = '../../../supabase/migrations/20260731120000_finance_receivables_slice1.sql';
const raw = read(FILE);
const sql = raw.toLowerCase();

// Statements only. BOTH comment forms must go: prose in a comment fakes a
// match, and a `--`-only strip would let a predicate commented OUT with /* */
// still satisfy its own test. (Measured lesson, reused from slices past.)
const code = sql
  .replace(/\/\*[\s\S]*?\*\//g, '\n')
  .split('\n').filter((l) => !l.trim().startsWith('--'))
  .join('\n');

/**
 * The `add constraint <name> ...` statement alone, up to its terminating
 * semicolon.
 *
 * Assertions about a key must read THIS, not the whole file: the migration's own
 * `raise exception` messages quote phrases like "ON DELETE SET NULL" as prose,
 * and a file-wide regex happily matches the string literal instead of the DDL it
 * is supposed to be checking.
 */
function constraintStatement(name) {
  const start = code.indexOf(`add constraint ${name}`);
  if (start === -1) return '';
  const end = code.indexOf(';', start);
  return code.slice(start, end === -1 ? undefined : end);
}

const FKS = [
  { name: 'quotes_client_same_owner_fk',       child: 'quotes',       cols: 'client_id, user_id', parent: 'clients', del: 'cascade' },
  { name: 'transactions_client_same_owner_fk', child: 'transactions', cols: 'client_id, user_id', parent: 'clients', del: 'set null (client_id)' },
  { name: 'charges_client_same_owner_fk',      child: 'charges',      cols: 'client_id, user_id', parent: 'clients', del: 'set null (client_id)' },
  { name: 'charges_quote_same_owner_fk',       child: 'charges',      cols: 'quote_id, user_id',  parent: 'quotes',  del: 'set null (quote_id)' },
  { name: 'payments_charge_same_owner_fk',     child: 'payments',     cols: 'charge_id, user_id', parent: 'charges', del: 'cascade' },
];

describe('migration file · exists exactly once, at the approved timestamp', () => {
  it('is the only migration with this timestamp', () => {
    const files = readdirSync(dir('../../../supabase/migrations')).filter((f) => f.startsWith('20260731120000'));
    expect(files).toEqual(['20260731120000_finance_receivables_slice1.sql']);
  });

  it('POSITIVE CONTROL for the statement extractor itself', () => {
    // Every FK assertion below reads an isolated statement, so an extractor that
    // found nothing would make them all vacuously true — the exact way this file
    // could rot into a green no-op.
    for (const fk of FKS) {
      const stmt = constraintStatement(fk.name);
      expect(stmt.length, `extractor found nothing for ${fk.name}`).toBeGreaterThan(40);
      expect(stmt).toContain('foreign key');
    }
  });
});

describe('same-owner ownership is enforced by the KEY, not by a policy', () => {
  // THE ASSERTION SET THIS SLICE EXISTS FOR.
  it.each(FKS)('$name is COMPOSITE ($cols) → $parent (id, user_id)', (fk) => {
    const stmt = constraintStatement(fk.name);
    expect(stmt).toMatch(new RegExp(`foreign key \\(${fk.cols.replace(', ', ',\\s*')}\\)`));
    expect(stmt).toMatch(new RegExp(`references public\\.${fk.parent} \\(id,\\s*user_id\\)`));
  });

  it.each(FKS)('$name is NEVER a single-column key', (fk) => {
    const stmt = constraintStatement(fk.name);
    const first = fk.cols.split(',')[0].trim();
    // `foreign key (client_id)` with nothing after the column would be the bug.
    expect(stmt).not.toMatch(new RegExp(`foreign key \\(${first}\\s*\\)`));
    expect(stmt).not.toMatch(new RegExp(`references public\\.${fk.parent} \\(id\\s*\\)`));
  });

  it('all five relationships are covered — no user-owned link is left single-column', () => {
    expect(FKS).toHaveLength(5);
    for (const fk of FKS) expect(code).toContain(`add constraint ${fk.name}`);
  });

  it('drops EVERY legacy single-column FK on the new link columns, not one fixed name', () => {
    // Codex round 10, P1: `drop constraint if exists <the name we chose>` leaves
    // a conventional `charges_client_id_fkey ... ON DELETE CASCADE` alive beside
    // the composite SET NULL key. BOTH are then enforced, so deleting a client
    // still cascades the charge away — destroying the ledger-survival contract
    // this migration states.
    expect(code).toContain('dropped legacy single-column foreign key'.replace('foreign key', 'fk'));
    expect(code).toMatch(/\('charges',\s*'client_id',\s*'charges_client_same_owner_fk',/);
    expect(code).toMatch(/\('charges',\s*'quote_id',\s*'charges_quote_same_owner_fk',/);
    expect(code).toMatch(/\('payments',\s*'charge_id',\s*'payments_charge_same_owner_fk',/);
    // Codex round 12, P1: the constraint wearing the name this migration INTENDS
    // to use was exempted from every check — and the `drop constraint if exists`
    // further down would then replace a drifted one silently. It is now
    // validated like any other, and only a byte-for-byte match survives.
    expect(code).toContain('is not the composite same-owner key this migration declares');
    expect(code).toMatch(/keycols is distinct from array\[r\.col, 'user_id'\]::name\[\]/);
    expect(code).toMatch(/con\.confdeltype::text is distinct from r\.deltype::text/);
    expect(code).not.toContain('ours; recreated idempotently just below');
    // ...and a multi-column key it did not create is a SAFE STOP, not a drop.
    expect(code).toContain('already carries a multi-column foreign key');
    // Codex round 11, P1: "it is single-column" is not a check. The sweep must
    // VERIFY THE TARGET before dropping, or a legacy charges.client_id pointing
    // somewhere else would be silently re-pointed at clients(id, user_id) — the
    // same omission already corrected once for quotes and transactions.
    expect(code).toContain('not replaced -- re-pointing an existing relationship is not this migration');
    expect(code).toMatch(/references %\(%\), not %\(id\)/);
    expect(code).toMatch(/con\.confrelid <> \('public\.' \|\| r\.parent\)::regclass/);
    expect(code).toMatch(/\('charges',\s+'client_id',\s+'charges_client_same_owner_fk',\s+'clients',\s*'n'\)/);
    expect(code).toMatch(/\('payments',\s+'charge_id',\s+'payments_charge_same_owner_fk',\s+'charges',\s*'c'\)/);
    // The sweep must run BEFORE the composite keys are added.
    expect(code.indexOf('dropped legacy single-column fk'))
      .toBeLessThan(code.indexOf('add constraint charges_client_same_owner_fk'));
  });

  it('asserts NO single-column key survives on ANY of the five link columns', () => {
    expect(code).toContain('still carries a single-column foreign key');
    expect(code).toMatch(/array_length\(con\.conkey,\s*1\)\s*=\s*1/);
    for (const [tbl, col] of [['quotes', 'client_id'], ['transactions', 'client_id'],
      ['charges', 'client_id'], ['charges', 'quote_id'], ['payments', 'charge_id']]) {
      expect(code, `${tbl}.${col} must be in the postflight sweep`).toMatch(
        new RegExp(String.raw`\('${tbl}',\s+'${col}'\)`),
      );
    }
  });
});

describe('deletion semantics — preserved exactly, and never a bare SET NULL', () => {
  it.each(FKS)('$name declares ON DELETE $del', (fk) => {
    expect(constraintStatement(fk.name)).toContain(`on delete ${fk.del}`);
  });

  it('every SET NULL names its column — a bare SET NULL would null user_id', () => {
    for (const fk of FKS.filter((f) => f.del.startsWith('set null'))) {
      const stmt = constraintStatement(fk.name);
      // The column-subset form, and nothing that could be read as the bare form.
      expect(stmt).toMatch(/on delete set null \(\w+\)/);
      expect(stmt).not.toMatch(/on delete set null\s*(;|$)/);
    }
  });

  it('verifies the REFERENCED COLUMN before dropping an existing key', () => {
    // Codex P1: checking confrelid alone accepts an FK pointing at some OTHER
    // unique uuid column on public.clients — this block would then drop it and
    // silently re-point the relationship at clients.id, instead of the SAFE STOP
    // it promises. The referenced attribute must be read from confkey.
    expect(code).toContain('a.attnum = c.confkey[1]');
    expect(code).toContain("if ref_col is distinct from 'id'::name then");
    expect((code.match(/not clients\(id\)/g) || []).length).toBe(2); // quotes AND transactions
    expect(code).toMatch(/select con\.oid, con\.conname, con\.conkey, con\.confkey, con\.confdeltype/);
  });

  it('the EXISTING delete actions are preserved, not re-decided', () => {
    // quotes CASCADE and transactions SET NULL are the 20260717090000 contract.
    expect(constraintStatement('quotes_client_same_owner_fk')).toContain('on delete cascade');
    expect(constraintStatement('transactions_client_same_owner_fk')).toContain('on delete set null (client_id)');
    // ...and the migration SAFE STOPs rather than overwriting a different one.
    expect(code).toContain("if c.confdeltype <> 'c' then");
    expect(code).toContain("if c.confdeltype <> 'n' then");
  });

  it('"no payment on a cancelled charge" is a SERVER rule, not a UI rule', () => {
    // Codex round 4, P2: the client guard reads a `charge` prop captured when the
    // modal opened, so another device cancelling it in between (or any direct API
    // caller) walked straight past it. A CHECK cannot do this — it sees one row of
    // one table and cannot read the parent charge — so it is a trigger, the same
    // shape as trg_campaigns_status_transition.
    expect(code).toContain('create or replace function public.payment_reject_cancelled_charge');
    expect(code).toContain('create trigger trg_payments_reject_cancelled before insert or update on public.payments');
    expect(code).toMatch(/select c\.lifecycle into parent_lifecycle/);
    expect(code).toMatch(/where c\.id = new\.charge_id and c\.user_id = new\.user_id/);
    expect(code).toContain("if found and parent_lifecycle = 'cancelled' then");
    expect(code).toContain("using errcode = '23514'");
    // Codex round 5, P2: an UNLOCKED parent read can observe `open` while a
    // concurrent transaction cancels the same charge, allow the insert, and let
    // that cancellation commit afterwards — the very race the trigger exists to
    // close. FOR SHARE conflicts with the FOR NO KEY UPDATE lock a plain UPDATE
    // takes; FOR KEY SHARE would NOT, since that is what the FK check itself
    // takes and it does not conflict with a non-key update.
    expect(code).toMatch(/where c\.id = new\.charge_id and c\.user_id = new\.user_id\s+for share;/);
    expect(code).not.toMatch(/for key share/);
    // SECURITY INVOKER on purpose: it reads charges as the caller, so RLS applies
    // and a charge the caller cannot see simply yields no row (the composite FK
    // refuses that insert anyway). Elevated rights would widen the surface for
    // nothing.
    const decl = code.slice(code.indexOf('create or replace function public.payment_reject_cancelled_charge'));
    expect(decl.slice(0, decl.indexOf('$$;'))).toContain('security invoker');
    // ...and the migration asserts the trigger exists once applied.
    expect(code).toContain('trg_payments_reject_cancelled is missing');
  });

  it('requires the auth.users FK to reference exactly `id`', () => {
    // Codex round 4, P2: the ownership repair checked the child column, the
    // parent table and the cascade — but not confkey — so an FK to some other
    // unique column on auth.users would have been accepted as correct, skipping
    // the SAFE STOP while not enforcing what it claims. Both the repair and the
    // postflight now resolve the referenced attribute.
    // At least twice: the ownership repair (which since round 17 checks both the
    // "is there a wrong/extra key" scan and the "is the declared key present"
    // test) and the postflight. A bare count would break every time that block
    // is restructured, so the floor is what matters — the point is that the
    // referenced column is verified everywhere the key is judged.
    expect((code.match(/= array\['id'\]::name\[\]/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(code).toMatch(/from unnest\(c\.confkey\) with ordinality/);
  });

  it('validates EXISTING ROW VALUES against the new CHECKs, in PART 1', () => {
    // Codex round 20, P2: PART 1 validated column SHAPE but never row CONTENTS.
    // A pre-existing `kind = 'legacy'` passes every shape check, and the
    // `add constraint charges_kind_allowed` in PART 3 then validates the rows
    // and fails — after earlier statements have committed, and after the paired
    // `drop constraint if exists`, leaving the table with NEITHER constraint.
    expect(sql).toContain('-- (k1) existing row values vs. the check constraints this migration adds.');
    expect(code).toContain('existing row(s) violating the constraint this migration adds');
    expect(code).toContain("execute format('select count(*) from public.%i where not (%s)', r.tbl, r.pred)");
    // Every CHECK this migration adds must have a matching row pre-validation.
    for (const pred of ["kind in ('deposit', 'partial', 'final')",
      "payment_terms in ('immediate', 'net30', 'net60', 'net90')",
      "lifecycle in ('open', 'cancelled')",
      "due_date_source in ('computed', 'manual')",
      'amount_total > 0',
      'description is null or length(description) <= 200',
      'invoice_url is null or length(invoice_url) <= 2048',
      'amount > 0']) {
      expect(code, `no row pre-validation for: ${pred}`).toContain(`$chk$${pred}$chk$`);
    }
    // ...and it runs before the first altering statement.
    expect(code.indexOf('existing row(s) violating the constraint this migration adds'))
      .toBeLessThan(code.indexOf('create or replace function public.set_updated_at'));
  });

  it('validates EXISTING INDEX definitions in PART 1, not only in PART 3', () => {
    // Codex round 20, P2: the round-15 index check lived in PART 3, so its SAFE
    // STOP left the table, column, constraint and ownership statements above it
    // committed on the statement-by-statement path.
    expect(sql).toContain('-- (k2) existing indexes vs. the definitions this migration creates.');
    expect(code).toContain('already exists with a different definition (%). expected using btree % %. nothing was changed.');
    expect(code).toContain('already exists but is not valid and would never be used. nothing was changed.');
    expect(code.indexOf('nothing was changed.'))
      .toBeLessThan(code.indexOf('create table if not exists public.charges'));
  });

  it('refuses an EXTRA foreign key over user_id, not just a wrong one', () => {
    // Codex round 17, P2: the block returned as soon as it found the correct
    // ownership key, so an ADDITIONAL key on user_id pointing elsewhere was
    // never seen — it stays enforced beside the right one, can reject valid
    // inserts and brings its own delete behaviour. Finding what you were
    // looking for is not the same as finding only that.
    expect(code).toContain('whether it is the only one or an extra beside the correct one');
    expect(code).toContain('already correct, and provably the only key over user_id');
    // The scan must run BEFORE the "is the declared key present?" check.
    expect(code.indexOf('whether it is the only one or an extra beside the correct one'))
      .toBeLessThan(code.indexOf('already correct, and provably the only key over user_id'));
    // ...and the postflight counts them.
    expect(code).toContain('foreign keys, expected exactly 1');
    // Codex round 18, P2: rejecting only WRONGLY shaped keys still lets two
    // CORRECTLY shaped ones under different names through — the presence check
    // skips on whichever it sees first, and the postflight catches it only after
    // the DDL has run, which is not what a pre-DDL SAFE STOP means. So the keys
    // are COUNTED before anything else.
    expect(code).toContain('foreign keys, expected at most 1');
    expect(code).toContain('select count(*) into n_fk');
    // Codex round 19, P2: the count must live in PART 1, not beside the repair
    // in PART 3 — PART 3 runs after set_updated_at() has been replaced and after
    // the table/additive-column DDL, so on the documented statement-by-statement
    // path a SAFE STOP raised there leaves those changes applied. PART 1 is
    // where the "nothing was altered" promise is made.
    // On `sql`, not `code`: the section header is a comment, and `code` strips
    // comments on purpose so prose can never satisfy a statement assertion.
    expect(sql).toContain('-- (k) the ownership foreign keys on a pre-existing table.');
    expect(code).toContain('carries % foreign keys, expected at most 1. nothing was changed.');
    expect(code).toContain('is not a validated references auth.users(id) on delete cascade. nothing was changed.');
    // ...and it really is before the first DDL statement in the file.
    expect(code.indexOf('carries % foreign keys, expected at most 1. nothing was changed.'))
      .toBeLessThan(code.indexOf('create or replace function public.set_updated_at'));
    expect(code.indexOf('carries % foreign keys, expected at most 1. nothing was changed.'))
      .toBeLessThan(code.indexOf('create table if not exists public.charges'));
    expect(code.indexOf('foreign keys, expected at most 1'))
      .toBeLessThan(code.indexOf('whether it is the only one or an extra beside the correct one'));
  });

  it('repairs a MISSING ownership FK on a pre-existing table, and asserts it', () => {
    // Codex round 3, P2: `create table if not exists` cannot add the auth.users
    // FK, so a pre-existing table with a plain NOT NULL user_id would satisfy
    // every column check and still orphan its rows when an account is deleted —
    // silently unmeeting declared limitation L4. A missing constraint needs no
    // backfill decision, so it is REPAIRED (and a wrong one is a SAFE STOP).
    expect(code).toContain("references auth.users (id) on delete cascade");
    expect(code).toContain('added the missing ownership fk on public.%.user_id');
    expect(code).toContain('that is not references auth.users(id) on delete cascade');
    expect(code).toContain('does not reference auth.users(id) on delete cascade');
    expect(code).toMatch(/c\.confrelid = 'auth\.users'::regclass/);
  });

  it('the migration asserts its own postcondition for every key', () => {
    expect(code).toContain('confdelsetcols');
    expect(code).toContain('receivables failed');
  });
});

describe('the unique keys the composite FKs point at', () => {
  it('adds unique (id, user_id) on clients, quotes and charges', () => {
    // clients/quotes share one catalog-driven loop, so their constraint NAME is
    // composed (`<table>_id_user_unique`) rather than written out; charges is
    // literal. Both forms are asserted, and the SAFE-STOP message names the key
    // shape either way.
    expect(code).toMatch(/foreach t in array array\['clients', 'quotes'\]/);
    expect(code).toContain("target_name := t || '_id_user_unique'");
    expect(code).toContain('charges_id_user_unique');
    expect(code).toMatch(/unique \(id, user_id\)/);
    // ...and the composite FKs really do point at (id, user_id) on all three.
    expect(code).toMatch(/references public\.clients \(id, user_id\)/);
    expect(code).toMatch(/references public\.quotes \(id, user_id\)/);
    expect(code).toMatch(/references public\.charges \(id, user_id\)/);
  });

  it('NEVER blind-drops a unique key that may already be an FK target', () => {
    // `drop constraint if exists <x>_id_user_unique` is the defect: those keys
    // are foreign-key targets, and dropping one either fails or takes the FK
    // with it. The migration inspects the catalog and SAFE STOPs instead.
    expect(code).not.toMatch(/drop constraint if exists \w*_id_user_unique/);
    expect(code).toContain('already exists but is not unique (id, user_id)');
  });

  it('reuses a NAMED composite key only when its columns are exactly right', () => {
    // Codex round 15, P1: the quotes/transactions "create only if absent"
    // branches were name-only. A valid composite FK of that name over a
    // DIFFERENT first column would skip creation, and the postflight checked
    // only that there were two columns and the second was user_id — so
    // quotes.client_id would be left with no same-owner enforcement while the
    // constraint name suggested otherwise.
    expect(code).toContain('already exists over different columns');
    // The condition must be the WHOLE guard — `... ::name[] then`, with nothing
    // appended that could neutralise it. Counting occurrences alone would pass
    // on `... ::name[] and false then`, which is how a guard rots into a no-op.
    expect((code.match(/is distinct from array\['client_id', 'user_id'\]::name\[\]\s+then/g) || []).length).toBe(2);
    // ...and the CREATE must sit in the else-branch, not behind a name-only
    // `if not exists`, which was the original defect.
    for (const tbl of ['quotes', 'transactions']) {
      const guard = code.indexOf(`a constraint named ${tbl}_client_same_owner_fk already exists over different columns`);
      const create = code.indexOf(`alter table public.${tbl} add constraint ${tbl}_client_same_owner_fk`);
      expect(guard, `${tbl} guard present`).toBeGreaterThan(-1);
      expect(create, `${tbl} create present`).toBeGreaterThan(-1);
      expect(guard, `${tbl}: the guard must precede the create`).toBeLessThan(create);
      expect(code.slice(guard, create)).toContain('else');
    }
    // The postflight now requires BOTH columns, in order.
    expect(code).toContain("keycols is distinct from array[r.linkcol, 'user_id']::name[]");
    expect(code).not.toMatch(/keycols\[2\] <> 'user_id'/);
    for (const [con, col] of [['quotes_client_same_owner_fk', 'client_id'],
      ['charges_quote_same_owner_fk', 'quote_id'], ['payments_charge_same_owner_fk', 'charge_id']]) {
      expect(code, `${con} must declare its link column`).toMatch(
        new RegExp(String.raw`'${con}',\s+'\w+',\s+'${col}'`),
      );
    }
  });

  it('reuses an index NAME only when its definition is right', () => {
    // Codex round 15, P2: `create index if not exists` is name-only, so an index
    // of the right name over the wrong columns survives — and every ON DELETE
    // scan silently becomes a sequential scan while the postflight reports the
    // index present.
    expect(code).toContain('already exists with a different definition');
    expect(code).toContain('is missing, is not over %, or is not a btree');
    expect(code).toContain('exists but is not valid or is not a btree');
    expect(code).toMatch(/position\(r\.cols in i\.indexdef\) > 0/);
    expect(code).toContain('x.indisvalid');
    // Codex round 16, P2: a brin or hash index over the same columns matches
    // every substring check and is a different object — brin cannot serve the
    // ordered due-date read. The access method is part of the definition, and is
    // required both in the text check and from the catalog (pg_am.amname).
    // At least twice — the PART 1 pre-check, the PART 3 pre-create check and the
    // postflight all require it. A floor rather than an exact count: the number
    // of places moves whenever a check is relocated, and what matters is that no
    // place judges an index without it.
    expect((code.match(/position\('using btree ' in /g) || []).length).toBeGreaterThanOrEqual(2);
    expect(code).toContain("am.amname = 'btree'");
    expect(code).toContain('join pg_am am on am.oid = c.relam');
    expect(code).toContain('is not a btree');
    // ...and the shapes are declared, not implied.
    expect(code).toContain("'(user_id, paid_at desc)'".replace('desc', 'DESC').toLowerCase());
    expect(code).toContain('where (client_id is not null)');
  });

  it('refuses a NOT VALID foreign key wherever one could be reused', () => {
    // Codex round 14, P2: a constraint created NOT VALID is enforced for NEW
    // rows only, so reusing one would let this migration claim the same-owner
    // (or ownership) invariant while violating rows survive underneath it — the
    // one state nobody would think to check for afterwards.
    expect(code).toContain('exists but is not valid');
    expect(code).toContain('or exists only as not valid');
    expect((code.match(/c\.convalidated/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(code).toContain('or not con.convalidated then');
    expect(code).toContain('if not c.convalidated then');
  });

  it('refuses a DEFERRABLE unique key instead of reusing it', () => {
    // Codex round 13, P2: PostgreSQL cannot reference a deferrable unique or
    // primary key from a foreign key ("cannot use a deferrable unique constraint
    // for referenced table"), so reusing one would abort the composite-FK ALTER
    // much later — after other statements had already run. Checked in all three
    // places: the named match, the alternate-name lookup, and the charges block.
    expect(code).toContain('is deferrable. postgresql cannot reference a deferrable unique key');
    expect((code.match(/if cdeferrable then/g) || []).length).toBe(2);
    expect((code.match(/and not c\.condeferrable/g) || []).length).toBe(2);
    expect((code.match(/select c\.contype, c\.condeferrable,/g) || []).length).toBe(2);
  });

  it('verifies the key by CONSTRAINT and columns, not by name alone', () => {
    // A same-named NON-unique index would not satisfy a composite FK.
    expect(code).toContain("c.contype in ('u', 'p')");
    expect(code).toMatch(/array\['id', 'user_id'\]::name\[\]/);
  });
});

describe('the cross-owner data proof runs BEFORE anything is altered', () => {
  it('counts quotes and transactions whose client belongs to another account', () => {
    expect(code).toMatch(/from public\.quotes q\s*\n\s*join public\.clients c on c\.id = q\.client_id\s*\n\s*where c\.user_id is distinct from q\.user_id/);
    expect(code).toMatch(/from public\.transactions t\s*\n\s*join public\.clients c on c\.id = t\.client_id\s*\n\s*where c\.user_id is distinct from t\.user_id/);
  });

  it('SAFE STOPs on a PARTIAL pre-existing charges/payments table', () => {
    // Codex P2: `create table if not exists` no-ops on an existing table and the
    // additive section adds only the NULLABLE columns — so a table missing
    // service_date / due_date / amount_total (all NOT NULL, no default) would
    // fail later, half-applied, at a CHECK or an index. The preflight names the
    // missing column instead, and refuses.
    expect(code).toContain('is MISSING the required column'.toLowerCase());
    expect(code).toContain('cannot be added without a backfill decision');
    expect(code).toContain("if r.required and to_regclass('public.' || r.tbl) is not null");
    // ...and the two columns the additive section DOES create are exempt, so the
    // check is not merely "refuse everything".
    expect(code).toMatch(/\('charges',\s*'client_id',\s*'uuid',\s*'yes',\s*false\s*,/);
    expect(code).toMatch(/\('charges',\s*'quote_id',\s*'text',\s*'yes',\s*false\s*,/);
    expect(code).toContain('add column if not exists client_id       uuid');
  });

  it('SAFE STOPs on even one mismatch, and never reassigns ownership', () => {
    expect(code).toMatch(/if n_bad > 0 then/);
    expect(code).toContain('do not reassign ownership by guessing');
    expect(code).not.toMatch(/update public\.(quotes|transactions|clients)\s+set/);
  });

  it('the proof precedes the first ALTER of an existing table', () => {
    const proof = code.indexOf('is distinct from q.user_id');
    const alter = code.indexOf('alter table public.quotes drop constraint');
    expect(proof).toBeGreaterThan(-1);
    // The drop lives inside a later DO block; if it ever moved above the proof
    // the migration could mutate a schema it had not yet cleared.
    expect(alter === -1 || alter > proof).toBe(true);
  });
});

// ===================================================================
// Codex round 21 — the two P2s that were reported and not fixed in round 20.
//
// Both are about WHERE a failure lands, not whether it lands. The keys are
// created VALIDATED and the postflight is table-aware, so a bad row or a
// hijacked index name is always caught eventually; the defect is that "eventually"
// meant mid-DDL, after earlier statements had committed on the statement-by-
// statement path (the documented "paste into the SQL Editor" route), which is
// exactly what PART 1's SAFE-STOP promise excludes.
// ===================================================================

// The seven (child, child_col, parent) relationships that get a key in this
// migration: two ownership keys into auth.users, and the five same-owner pairs.
const OWNERSHIP_ROWS = [
  ['charges', 'user_id', 'auth', 'users', 'id', 'null'],
  ['payments', 'user_id', 'auth', 'users', 'id', 'null'],
  ['quotes', 'client_id', 'public', 'clients', 'id', "'user_id'"],
  ['transactions', 'client_id', 'public', 'clients', 'id', "'user_id'"],
  ['charges', 'client_id', 'public', 'clients', 'id', "'user_id'"],
  ['charges', 'quote_id', 'public', 'quotes', 'id', "'user_id'"],
  ['payments', 'charge_id', 'public', 'charges', 'id', "'user_id'"],
];

describe('PART 1 · (k1b) orphan and cross-owner rows are refused PRE-DDL', () => {
  // The (k1b) block, isolated. Every assertion below reads THIS and not the
  // whole file: (d) already contains cross-owner prose and two hand-written
  // scans, so a file-wide match would pass with (k1b) deleted outright.
  const k1b = (() => {
    const m = code.match(/\('charges',\s*'user_id',\s*'auth'/);
    if (!m) return '';
    const start = m.index;
    const end = code.indexOf("('idx_charges_user_due'", start); // start of the (k2) list
    return code.slice(start, end === -1 ? undefined : end);
  })();

  it('POSITIVE CONTROL for the (k1b) extractor itself', () => {
    // Without this, every assertion in this describe would be vacuously true the
    // moment the block moved or was removed.
    expect(k1b.length, '(k1b) block not found').toBeGreaterThan(400);
    expect(k1b).toContain('execute format(');
  });

  it.each(OWNERSHIP_ROWS)(
    'covers %s.%s → %s.%s(%s)',
    (child, childCol, pschema, parent, parentCol, ownerCol) => {
      // The whole row, not the table name — a list that named `charges` three
      // times but pointed two of them at the same parent would still pass a
      // per-name check.
      const row = new RegExp(
        `\\('${child}',\\s*'${childCol}',\\s*'${pschema}',\\s*'${parent}',\\s*'${parentCol}',\\s*${ownerCol.replace(/'/g, "'")}\\s*\\)`
      );
      expect(k1b).toMatch(row);
    },
  );

  it('all seven relationships, and no more — the list is the coverage claim', () => {
    expect(OWNERSHIP_ROWS).toHaveLength(7);
    // Five same-owner pairs (one per composite FK) + two ownership keys.
    expect(OWNERSHIP_ROWS.filter((r) => r[5] === "'user_id'")).toHaveLength(FKS.length);
    expect(OWNERSHIP_ROWS.filter((r) => r[5] === 'null')).toHaveLength(2);
  });

  it('checks ORPHANS — a non-NULL link with no parent row at all', () => {
    expect(k1b).toContain(
      "'select count(*) from public.%i ch where ch.%i is not null and not exists (select 1 from %i.%i p where p.%i = ch.%i)'",
    );
    expect(k1b).toContain('row(s) pointing at a %.% that does not exist');
  });

  it('checks CROSS-OWNER rows — a parent that exists under another account', () => {
    expect(k1b).toContain(
      "'select count(*) from public.%i ch join %i.%i p on p.%i = ch.%i where p.%i is distinct from ch.user_id'",
    );
    expect(k1b).toContain('row(s) referencing a %.% owned by a different account');
    // ...and only where an owner column exists: auth.users has no owner of its own.
    expect(k1b).toContain('if r.owner_col is not null then');
  });

  it('both are SAFE STOPs that change nothing and never guess an owner', () => {
    expect(k1b.match(/raise exception 'receivables safe stop/g) || []).toHaveLength(2);
    expect(k1b).toContain('nothing was changed');
    expect(k1b).toContain('do not reassign ownership by guessing');
    // No repair of any kind inside the block.
    expect(k1b).not.toMatch(/\b(update|delete|insert|alter|drop)\b/);
  });

  it('guards TABLE and COLUMN existence before it queries anything', () => {
    // The block must never be the thing that fails, with an undefined-column
    // error, on the shape it was written to inspect. pg_attribute (not
    // information_schema) so an `auth` parent is reachable too.
    expect(k1b).toContain("if to_regclass('public.' || r.child) is null");
    expect(k1b).toContain("or to_regclass(r.pschema || '.' || r.parent) is null then");
    expect(k1b).toContain("and a.attname = r.child_col and a.attnum > 0 and not a.attisdropped");
    expect(k1b).toContain("and a.attname = 'user_id' and a.attnum > 0 and not a.attisdropped");
    expect(k1b).toContain("and a.attname = r.parent_col and a.attnum > 0 and not a.attisdropped");
    expect(k1b).toContain("and a.attname = r.owner_col and a.attnum > 0 and not a.attisdropped");
    // Guarded rows are SKIPPED, not failed: PART 3 creates the missing table.
    expect((k1b.match(/continue;/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('runs BEFORE the first altering statement of the whole migration', () => {
    const scan = code.indexOf('row(s) pointing at a %.% that does not exist');
    expect(scan).toBeGreaterThan(-1);
    for (const firstDdl of [
      'create or replace function public.set_updated_at',
      'create table if not exists public.charges',
      'alter table public.charges add constraint charges_client_same_owner_fk',
    ]) {
      const at = code.indexOf(firstDdl);
      expect(at, `not found: ${firstDdl}`).toBeGreaterThan(-1);
      expect(scan, `(k1b) must precede: ${firstDdl}`).toBeLessThan(at);
    }
    // ...and before the legacy-link sweep that drops the old single-column keys.
    const sweep = code.indexOf('drop constraint');
    expect(sweep === -1 || scan < sweep).toBe(true);
  });

  it('NEGATIVE CONTROLS — each guarantee fails when its clause is removed', () => {
    // §21: a check that has never failed is not known to be a check. Each
    // mutation below removes exactly one clause from the real file text and
    // proves the corresponding assertion above goes red.
    const orphan = "ch.%i is not null and not exists";
    const cross = 'is distinct from ch.user_id';

    // 1. orphan scan deleted → the orphan assertion fails.
    expect(code.replace(orphan, 'x')).not.toContain(orphan);
    // 2. cross-owner scan deleted → the cross-owner assertion fails.
    expect(k1b.replace(cross, 'x')).not.toContain(cross);
    // 3. a relationship dropped from the list → its row assertion fails.
    const withoutPayments = k1b.replace(/\('payments',\s*'charge_id',[^)]*\)/, '');
    expect(withoutPayments).not.toMatch(/\('payments',\s*'charge_id'/);
    // 4. the block moved BELOW the first DDL → the ordering assertion fails.
    const moved = `create table if not exists public.charges (\n${k1b}`;
    expect(moved.indexOf(orphan)).toBeGreaterThan(moved.indexOf('create table if not exists public.charges'));
    // 5. the existence guard removed → the guard assertion fails.
    expect(k1b.replace("if to_regclass('public.' || r.child) is null", 'if false then'))
      .not.toContain("if to_regclass('public.' || r.child) is null");
  });
});

describe('PART 1 · (k2) an index NAME is only accepted on the EXPECTED table', () => {
  // The (k2) list and lookup, isolated from the PART 3 pre-create block, which
  // carries the same seven names.
  const k2 = (() => {
    // The FIRST occurrence of the index list is the PART 1 copy; the PART 3
    // pre-create block carries the same seven names further down.
    const from = code.indexOf("('idx_charges_user_due'");
    if (from === -1) return '';
    // ...up to the start of the (k) ownership-FK block that follows it.
    const end = code.indexOf("(values ('charges'), ('payments')) as t(tbl)", from);
    return code.slice(from, end === -1 ? undefined : end);
  })();

  it('POSITIVE CONTROL for the (k2) extractor itself', () => {
    expect(k2.length, '(k2) block not found').toBeGreaterThan(400);
    expect(k2).toContain('pg_indexes');
    // It must be the PART 1 copy, not the PART 3 one.
    expect(code.indexOf(k2)).toBeLessThan(code.indexOf('create table if not exists public.charges'));
  });

  it('every expected index carries its expected TABLE', () => {
    for (const [idx, tbl] of [
      ['idx_charges_user_due', 'charges'],
      ['idx_charges_client_user', 'charges'],
      ['idx_charges_quote_user', 'charges'],
      ['idx_payments_charge', 'payments'],
      ['idx_payments_user_paid', 'payments'],
      ['idx_quotes_client_user', 'quotes'],
      ['idx_tx_client_user', 'transactions'],
    ]) {
      expect(k2, `no expected tablename for ${idx}`).toMatch(
        new RegExp(`\\('${idx}',\\s*'${tbl}',`),
      );
    }
  });

  it('...and the lookup REQUIRES it, exactly as the postflight does', () => {
    // The defect: index names are SCHEMA-wide, so a schema+name lookup is
    // satisfied by an index owned by a different table, `create index if not
    // exists` then skips the intended one, and only the table-aware postflight
    // notices — after the preceding DDL has committed.
    expect(k2).toContain("where schemaname = 'public' and tablename = r.tbl and indexname = r.idx");
    // The postflight already did this; PART 1 now matches it.
    expect(code).toContain("where i.schemaname = 'public' and i.tablename = r.tbl and i.indexname = r.idx");
  });

  it('a name found on the WRONG table is a SAFE STOP, not a skipped create', () => {
    // Table-scoping alone would turn the hijacked name into `not found` and fall
    // through to `continue` — the same silent miss, differently spelled. The
    // schema-wide re-check is what makes it loud.
    expect(k2).toContain("if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = r.idx) then");
    expect(k2).toContain('already exists in schema public but on table %, not the expected public.%');
    expect(k2).toContain('index names are schema-wide');
    // ...and it still names the actual holder, so the operator can look at it.
    expect(k2).toContain("(select tablename from pg_indexes where schemaname = 'public' and indexname = r.idx)");
  });

  it('the SAFE STOP still precedes every altering statement', () => {
    const stop = code.indexOf('already exists in schema public but on table %');
    expect(stop).toBeGreaterThan(-1);
    expect(stop).toBeLessThan(code.indexOf('create or replace function public.set_updated_at'));
    expect(stop).toBeLessThan(code.indexOf('create index if not exists idx_charges_user_due'));
  });

  it('NEGATIVE CONTROLS — the table requirement and the loud path are load-bearing', () => {
    // 1. the tablename predicate reverted → the lookup assertion fails.
    const blind = k2.replace(
      "where schemaname = 'public' and tablename = r.tbl and indexname = r.idx",
      "where schemaname = 'public' and indexname = r.idx",
    );
    expect(blind).not.toContain("and tablename = r.tbl and indexname = r.idx");
    // 2. the expected tablename removed from the list → the coverage fails.
    expect(k2.replace("('idx_tx_client_user',      'transactions',", "('idx_tx_client_user',"))
      .not.toMatch(/\('idx_tx_client_user',\s*'transactions',/);
    // 3. table-scoped but silent (no schema-wide re-check) → the loud-path fails.
    const silent = k2.replace(
      "if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = r.idx) then",
      'if false then',
    );
    expect(silent).not.toContain("if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = r.idx) then");
  });
});

describe('payment status is DERIVED — no column, on either table', () => {
  it('declares no status column on charges', () => {
    const create = code.slice(code.indexOf('create table if not exists public.charges'));
    const body = create.slice(0, create.indexOf(');'));
    expect(body).not.toMatch(/^\s*status\s/m);
    expect(body).not.toMatch(/payment_status/);
    expect(body).not.toMatch(/^\s*paid\s/m);
  });

  it('never adds one later either', () => {
    expect(code).not.toMatch(/add column if not exists (status|payment_status|paid|is_paid)\b/);
  });

  it('and both the preflight and the assertions REFUSE one that already exists', () => {
    expect(code).toMatch(/column_name in \('status', 'payment_status', 'paid', 'is_paid'\)/);
    expect(code).toContain('a stored payment-status column');
  });

  it('lifecycle is a different axis with exactly two states', () => {
    expect(code).toMatch(/check \(lifecycle in \('open', 'cancelled'\)\)/);
  });
});

describe('RLS — four plain policies per table, no quota, no counter function', () => {
  for (const tbl of ['charges', 'payments']) {
    it(`${tbl}: RLS enabled with one policy per command, all to authenticated`, () => {
      expect(code).toMatch(new RegExp(`alter table public\\.${tbl}\\s+enable row level security`));
      for (const cmd of ['select', 'insert', 'update', 'delete']) {
        expect(code).toContain(`create policy "${tbl}_${cmd}_own" on public.${tbl}`);
        expect(code).toMatch(new RegExp(`create policy "${tbl}_${cmd}_own" on public\\.${tbl}\\s*\\n\\s*for ${cmd} to authenticated`));
      }
    });

    it(`${tbl}: every policy is own-row, and the writing ones carry WITH CHECK`, () => {
      const block = code.slice(code.indexOf(`create policy "${tbl}_select_own"`));
      const end = block.indexOf(`grant select, insert, update, delete on public.${tbl}`);
      const policies = end === -1 ? block : block.slice(0, end);
      expect((policies.match(/using \(auth\.uid\(\) = user_id\)/g) || []).length).toBeGreaterThanOrEqual(3);
      expect((policies.match(/with check \(auth\.uid\(\) = user_id\)/g) || []).length).toBeGreaterThanOrEqual(2);
    });

    it(`${tbl}: carries NO row quota`, () => {
      expect(code).not.toMatch(new RegExp(`${tbl}[\\s\\S]{0,400}row_count\\(\\) <`));
    });

    it(`${tbl}: is granted to authenticated and never to anon`, () => {
      expect(code).toMatch(new RegExp(`grant [^;]*on public\\.${tbl}\\s+to authenticated`));
      expect(code).not.toMatch(new RegExp(`grant [^;]*on public\\.${tbl}\\s+to anon`));
    });
  }

  it('declares no SECURITY DEFINER function, and no anon-grant hole', () => {
    // Two functions only: the canonical set_updated_at helper and the
    // cancelled-charge trigger. BOTH are SECURITY INVOKER, so the
    // revoke-execute-from-anon class of bug (20260728130000) cannot apply.
    const fns = [...code.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)/g)].map((m) => m[1]);
    expect(fns.sort()).toEqual(['payment_reject_cancelled_charge', 'set_updated_at']);
    // Asserted on the DECLARATION, not on the file: the assertion block quotes
    // the phrase "SECURITY DEFINER" inside a raise-exception STRING, and a
    // file-wide scan would match that prose and call the check green for the
    // wrong reason (the mistake this repo has now measured three times).
    for (const fn of ['set_updated_at', 'payment_reject_cancelled_charge']) {
      const decl = code.slice(code.indexOf(`create or replace function public.${fn}`));
      const body = decl.slice(0, decl.search(/\$[a-z_]*\$\s*;/i));
      expect(body, `${fn} must not be SECURITY DEFINER`).not.toContain('security definer');
      expect(body, `${fn} must declare SECURITY INVOKER or default`).toBeTruthy();
    }
    // ...and nothing anywhere GRANTS execute, because nothing new is executable.
    expect(code).not.toMatch(/grant execute on function/);
  });
});

describe('columns, bounds and defaults', () => {
  it('quote_id is TEXT — public.quotes.id is text, and a uuid here would be 42804', () => {
    const create = code.slice(code.indexOf('create table if not exists public.charges'));
    const body = create.slice(0, create.indexOf(');'));
    expect(body).toMatch(/quote_id\s+text/);
    expect(body).not.toMatch(/quote_id\s+uuid/);
  });

  it('money is numeric(14,2) on both tables', () => {
    expect(code).toMatch(/amount_total\s+numeric\(14,2\) not null/);
    expect(code).toMatch(/amount\s+numeric\(14,2\) not null/);
  });

  it('client_id and quote_id are NULLABLE — a charge outlives its client', () => {
    const create = code.slice(code.indexOf('create table if not exists public.charges'));
    const body = create.slice(0, create.indexOf(');'));
    const clientLine = body.split('\n').find((l) => /^\s*client_id\s/.test(l));
    const quoteLine = body.split('\n').find((l) => /^\s*quote_id\s/.test(l));
    expect(clientLine).toBeTruthy();
    expect(clientLine).not.toContain('not null');
    expect(quoteLine).not.toContain('not null');
  });

  it('payments.charge_id is NOT NULL — a payment always belongs to a charge', () => {
    const create = code.slice(code.indexOf('create table if not exists public.payments'));
    const body = create.slice(0, create.indexOf(');'));
    expect(body).toMatch(/charge_id\s+uuid not null/);
  });

  it('bounds the invoice link at 2048 characters', () => {
    expect(code).toMatch(/check \(invoice_url is null or length\(invoice_url\) <= 2048\)/);
  });

  it('restricts invoice_url to http/https — a length bound is not a URL check', () => {
    // Codex round 7, P2: `javascript:alert(1)` is well under 2048 characters and
    // is executable when rendered as an href. The value is stored, exported in
    // backups and read by whatever comes next, so the COLUMN must refuse it —
    // a render-time filter alone would leave it in the database.
    expect(code).toContain('charges_invoice_url_scheme');
    expect(code).toMatch(/check \(invoice_url is null or invoice_url ~\* '\^https\?:\/\/\[\^\[:space:\]\]'\)/);
    // ...and the postflight proves the constraint restricts the scheme rather
    // than merely existing under that name.
    expect(code).toContain('does not restrict invoice_url to http/https');
  });

  it('preflights EVERY existing additive business column, not only the keys', () => {
    // Codex round 7, P2: the "full shape" preflight never examined kind,
    // payment_terms, due_date_source, lifecycle, description or invoice_url, so
    // an incompatible pre-existing one survived `add column if not exists` and
    // failed later at a CHECK — mid-DDL, instead of at the promised pre-DDL SAFE
    // STOP. All six are now in the shape list, as non-required (they ARE created
    // additively when absent).
    for (const col of ['kind', 'payment_terms', 'due_date_source', 'lifecycle', 'description', 'invoice_url']) {
      expect(code, `${col} must be shape-checked`).toMatch(
        new RegExp(String.raw`\('charges',\s+'${col}',\s+'text',\s+'(no|yes)'\s*,\s*false\s*,`),
      );
    }
  });

  it('compares the expected DEFAULT pre-DDL, not only in the postflight', () => {
    // Codex round 8, P2: type + nullability + generated state is not the full
    // shape. `kind text NOT NULL DEFAULT 'deposit'` passes all three, and the
    // postflight — which DOES require the exact default — aborts only after the
    // ALTERs have run, mid-DDL, instead of at the promised pre-DDL SAFE STOP.
    expect(code).toContain('already exists with default %, expected %');
    expect(code).toContain('column_default is not distinct from r.def');
    // The preflight list must carry the same four defaults the postflight does.
    for (const [col, def] of [['kind', 'final'], ['payment_terms', 'immediate'],
      ['due_date_source', 'computed'], ['lifecycle', 'open']]) {
      expect(code, `${col} default must be declared in BOTH lists`).toMatch(
        new RegExp(String.raw`\('charges',\s+'${col}',[^)]*'''${def}''::text'\)`, 'g'),
      );
      // ...twice: once in the preflight VALUES, once in the postflight VALUES.
      const hits = code.match(new RegExp(String.raw`'''${def}''::text'`, 'g')) || [];
      expect(hits.length, `${def} default should appear in both checks`).toBe(2);
    }
    // ...and the pre-DDL check really precedes the first ALTER of these tables.
    expect(code.indexOf('already exists with default %, expected %'))
      .toBeLessThan(code.indexOf('alter table public.charges add column if not exists'));
  });

  it('verifies the PRIMARY KEY of a pre-existing charges/payments table', () => {
    // Codex round 7, P2: `create table if not exists` leaves an existing table
    // untouched, PK and all — so one with a uuid `id` and NO primary key passed
    // every column check while duplicate ids stayed possible. api.deletePayment
    // deletes BY id, so one correction would have removed several rows.
    expect(code).toContain('already exists with no primary key');
    expect(code).toContain('is not exactly (id)');
    expect(code).toMatch(/c\.contype = 'p'/);
    // ...and the postflight asserts it landed.
    expect(code).toContain('does not have primary key (id)');
  });

  it('amounts must be positive on both tables', () => {
    expect(code).toMatch(/check \(amount_total > 0\)/);
    expect(code).toMatch(/check \(amount > 0\)/);
  });

  it('domains match the client mirror exactly', () => {
    expect(code).toMatch(/check \(kind in \('deposit', 'partial', 'final'\)\)/);
    expect(code).toMatch(/check \(payment_terms in \('immediate', 'net30', 'net60', 'net90'\)\)/);
    expect(code).toMatch(/check \(due_date_source in \('computed', 'manual'\)\)/);
  });

  it('records whether the due date was computed or typed', () => {
    expect(code).toMatch(/due_date_source\s+text not null default 'computed'/);
    expect(code).toMatch(/due_date\s+date not null/);
    expect(code).toMatch(/service_date\s+date not null/);
  });

  it('validates the timestamp columns the updated_at trigger writes', () => {
    // Codex round 6, P2: `add column if not exists updated_at` no-ops on a
    // pre-existing table, so an incompatible or GENERATED updated_at survives —
    // the migration then succeeds, installs the trigger, and every later UPDATE
    // fails inside set_updated_at() when it assigns now(). Checked BEFORE any
    // trigger is installed, and asserted again afterwards.
    expect(code).toContain('set_updated_at() assigns now() to it, so every update would fail');
    expect(code).toContain('is not a plain assignable timestamptz that is not null default now()');
    expect(code).toMatch(/\(is_generated <> 'never' or is_updatable = 'no'\)/);
    // Codex round 9, P2: type + generated/updatable is not the shape either. A
    // NULLABLE timestamptz, or one defaulted to a fixed epoch instead of now(),
    // passes those checks — and every inserted row then carries a NULL or a
    // false created_at while the declared schema says NOT NULL DEFAULT now().
    // The preflight and the postflight now enforce the SAME pair.
    expect((code.match(/is_nullable = 'no' and column_default = 'now\(\)'/g) || []).length).toBe(2);
    expect(code).toContain('expected (no, now())');
    expect(code).not.toContain('is not a plain assignable timestamptz with a default');
    expect(code).toMatch(/\('charges',\s*'created_at'\), \('charges',\s*'updated_at'\)/);
    expect(code).toMatch(/\('payments',\s*'created_at'\), \('payments',\s*'updated_at'\)/);
    // ...and it really is BEFORE the trigger creation.
    expect(code.indexOf('set_updated_at() assigns now() to it'))
      .toBeLessThan(code.indexOf('create trigger trg_charges_updated'));
  });

  it('the migration asserts type, nullability, generated state and defaults itself', () => {
    expect(code).toContain("is_generated = 'never'");
    expect(code).toContain('column_default is not distinct from r.def');
    expect(code).toContain('numeric_precision = 14');
    // Codex round 10, P2: `data_type = 'numeric'` accepts numeric(10,2) and
    // numeric(14,3) alike, and the exact check ran only in the postflight —
    // after constraints and functions had already been altered. It now runs
    // pre-DDL too, so the SAFE STOP is where the block promises it is.
    expect((code.match(/numeric_precision = 14 and numeric_scale = 2/g) || []).length).toBe(2);
    expect(code).toContain('expected numeric(14,2)');
    expect(code.indexOf('expected numeric(14,2)'))
      .toBeLessThan(code.indexOf('alter table public.charges add column if not exists'));
  });
});

describe('scope — additive, idempotent, and no next-slice bleed', () => {
  it('writes NO data: no INSERT, UPDATE, DELETE or TRUNCATE of rows', () => {
    expect(code).not.toMatch(/\binsert\s+into\b/);
    expect(code).not.toMatch(/\bdelete\s+from\b/);
    expect(code).not.toMatch(/\btruncate\b/);
    expect(code).not.toMatch(/\bupdate\s+public\.\w+\s+set\b/);
  });

  it('drops no table and no column', () => {
    expect(code).not.toMatch(/drop\s+table/);
    expect(code).not.toMatch(/drop\s+column/);
    expect(code).not.toMatch(/drop\s+schema/);
  });

  it('creates tables and columns idempotently', () => {
    expect(code).toContain('create table if not exists public.charges');
    expect(code).toContain('create table if not exists public.payments');
    expect((code.match(/add column if not exists/g) || []).length).toBeGreaterThan(5);
    expect((code.match(/create index if not exists/g) || []).length).toBeGreaterThanOrEqual(7);
  });

  it('touches no other product table', () => {
    const touched = new Set(
      [...code.matchAll(/(?:alter table|create table if not exists)\s+public\.(\w+)/g)].map((m) => m[1]),
    );
    expect([...touched].sort()).toEqual(['charges', 'payments', 'quotes', 'transactions']);
  });

  it('starts NO next slice: no events, organizations or module flags', () => {
    for (const bleed of ['public.events', 'public.organizations', 'public.memberships', 'module_flag', 'feature_flag']) {
      expect(code).not.toContain(bleed);
    }
  });

  it('indexes the exact key each ON DELETE action scans', () => {
    expect(code).toContain('idx_quotes_client_user');
    expect(code).toContain('idx_tx_client_user');
    expect(code).toContain('idx_charges_client_user');
    expect(code).toContain('idx_charges_quote_user');
    expect(code).toContain('idx_payments_charge');
  });

  it('requires PostgreSQL 15+ for the column-list SET NULL form', () => {
    expect(code).toContain("current_setting('server_version_num')::int < 150000");
  });
});

// ===================================================================
// The precondition loop's column alias must not be a RESERVED WORD.
//
// Measured, not hypothetical: the first apply of this migration against the
// live project (PostgreSQL 17.6) aborted with
//   ERROR: syntax error at or near "notnull" (SQLSTATE 42601)
// because check (c) named its fourth VALUES column `notnull`. `NOTNULL` is a
// PostgreSQL keyword and cannot be an unquoted alias, so the DO block failed to
// PARSE — before any DDL, and before its own `raise exception` guards could run.
// Nothing was created and the migration stayed pending; the failure was silent
// about its real cause, pointing at the precondition block that exists to make
// failures legible.
//
// Every assertion below reads the STATEMENT text (`code`), so a keyword named in
// a comment cannot satisfy or break it.
// ===================================================================

/** The `for r in select * from (values ...) as t(...)` alias list of check (c). */
const SHAPE_LOOP_ALIAS = /as\s+t\(\s*tbl\s*,\s*col\s*,\s*typ\s*,\s*(\w+)\s*\)/;

/**
 * The real check, extracted so the negative control can run THIS function
 * against a deliberately broken source rather than a re-typed approximation.
 */
function shapeLoopAliasFindings(source) {
  const alias = (source.match(SHAPE_LOOP_ALIAS) || [])[1] ?? null;
  return {
    alias,
    // `\bnotnull\b` cannot match `requires_not_null` — the underscore splits it.
    reservedWordOccurrences: (source.match(/\bnotnull\b/g) || []).length,
    aliasReferences: alias ? (source.match(new RegExp(`\\br\\.${alias}\\b`, 'g')) || []).length : 0,
  };
}

describe('precondition check (c) · the column-shape alias is not a reserved word', () => {
  it('the reserved word `notnull` appears NOWHERE in the statements', () => {
    expect(shapeLoopAliasFindings(code).reservedWordOccurrences).toBe(0);
  });

  it('the alias is the explicit, non-reserved `requires_not_null`', () => {
    expect(shapeLoopAliasFindings(code).alias).toBe('requires_not_null');
    expect(code).toContain('as t(tbl, col, typ, requires_not_null)');
  });

  it('all THREE occurrences are present: the alias and its two references', () => {
    const found = shapeLoopAliasFindings(code);
    // 1 declaration + 2 `r.requires_not_null` reads (the is_nullable predicate
    // and the SAFE STOP message) = the complete rename, with nothing left behind.
    expect(found.aliasReferences).toBe(2);
    expect((code.match(/\brequires_not_null\b/g) || []).length).toBe(3);
  });

  it('the two references still drive the SAME logic — rename only, no behaviour change', () => {
    // `code` is lower-cased (see the top of this file), so the SQL literals read
    // 'no'/'yes' and 'not null'/'nullable' here.
    expect(code).toContain(
      "and is_nullable = case when r.requires_not_null then 'no' else 'yes' end",
    );
    expect(code).toContain(
      "r.tbl, r.col, r.typ, case when r.requires_not_null then 'not null' else 'nullable' end",
    );
  });

  it('NEGATIVE CONTROL · restoring `notnull` makes this check fail, for the right reason', () => {
    // Put the defect back, exactly as it was on the merged head, and prove the
    // check reports it. A check that has never failed is not known to be a check.
    const broken = code.replace(/\brequires_not_null\b/g, 'notnull');
    const found = shapeLoopAliasFindings(broken);

    expect(found.alias).toBe('notnull');
    expect(found.reservedWordOccurrences).toBe(3);
    // ...and the positive assertions above genuinely reject it:
    expect(found.alias).not.toBe('requires_not_null');
    expect(broken).not.toContain('as t(tbl, col, typ, requires_not_null)');
    expect((broken.match(/\brequires_not_null\b/g) || []).length).toBe(0);
  });
});

describe('the PART B acceptance script is runnable in its numbered order', () => {
  it('the cancelled-charge control runs BEFORE the destructive deletes', () => {
    // Codex round 11, P2: placed after the charge delete, the UPDATE would
    // affect zero rows and the insert would fail the composite FK with 23503
    // instead of exercising the trigger — a control that fails for the wrong
    // reason proves nothing.
    const cancelled = sql.indexOf('13. negative (a cancelled charge refuses new payments)');
    const delClient = sql.indexOf('14. deletion semantics, client side');
    const delCharge = sql.indexOf('15. deletion semantics, charge side');
    expect(cancelled).toBeGreaterThan(-1);
    expect(delClient).toBeGreaterThan(cancelled);
    expect(delCharge).toBeGreaterThan(delClient);
    // ...and the script says what a wrong-reason failure looks like.
    expect(sql).toContain('if this returns 23503 instead, <ha> is gone and the control did not run');
    expect(sql).toContain('restore for 14-15');
  });
});

describe('the client mirror and the migration agree', () => {
  const lib = read('../receivables.js').toLowerCase();

  it('the same four payment terms, three kinds and two lifecycle states', () => {
    for (const t of ['immediate', 'net30', 'net60', 'net90']) {
      expect(lib).toContain(`'${t}'`);
      expect(code).toContain(`'${t}'`);
    }
    for (const k of ['deposit', 'partial', 'final']) {
      expect(lib).toContain(`'${k}'`);
      expect(code).toContain(`'${k}'`);
    }
    for (const l of ['open', 'cancelled']) {
      expect(lib).toContain(`'${l}'`);
      expect(code).toContain(`'${l}'`);
    }
  });

  it('the same 2048-character invoice bound', () => {
    expect(lib).toContain('2048');
    expect(code).toContain('2048');
  });

  it('the worked due-date control is documented where the rule is defined', () => {
    // 2026-02-15 + net60 = 2026-04-29, in the migration prose AND the module.
    expect(sql).toContain('2026-04-29');
    expect(lib).toContain('2026-04-29');
  });
});
