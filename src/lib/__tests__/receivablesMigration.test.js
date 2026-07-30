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

  it('and the migration asserts, in the database, that the old single-column keys are gone', () => {
    expect(code).toContain('still carries a single-column foreign key on client_id');
    expect(code).toMatch(/array_length\(con\.conkey,\s*1\)\s*=\s*1/);
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
    expect(code).toMatch(/\('charges',\s*'client_id',\s*'uuid',\s*'yes',\s*false\)/);
    expect(code).toMatch(/\('charges',\s*'quote_id',\s*'text',\s*'yes',\s*false\)/);
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

  it('declares NO function at all — so no SECURITY DEFINER, and no anon-grant hole', () => {
    // The only `create function` permitted is the canonical set_updated_at
    // helper, which is SECURITY INVOKER and already live.
    const fns = [...code.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)/g)].map((m) => m[1]);
    expect(fns).toEqual(['set_updated_at']);
    // Asserted on the DECLARATION, not on the file: the assertion block quotes
    // the phrase "SECURITY DEFINER" inside a raise-exception STRING, and a
    // file-wide scan would match that prose and call the check green for the
    // wrong reason (the mistake this repo has now measured three times).
    const decl = code.slice(code.indexOf('create or replace function public.set_updated_at'));
    const body = decl.slice(0, decl.search(/\$[a-z_]*\$\s*;/i));
    expect(body).not.toContain('security definer');
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

  it('the migration asserts type, nullability, generated state and defaults itself', () => {
    expect(code).toContain("is_generated = 'never'");
    expect(code).toContain('column_default is not distinct from r.def');
    expect(code).toContain('numeric_precision = 14');
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
