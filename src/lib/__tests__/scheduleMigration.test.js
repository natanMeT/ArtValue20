import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ===================================================================
// Schedule Core slice 1 — migration contract.
//
// WHAT THIS FILE CAN AND CANNOT DO. It verifies the DDL TEXT. It does NOT prove
// that a real PostgreSQL accepts the file — that was proven separately, by
// EXECUTING this exact migration against PostgreSQL 17.6 (the live server
// version) before the PR was opened, which is the rule F1 established after two
// failed applies of a migration that had passed 21 review rounds and 105 text
// assertions. A migration that has never been run is not known to work.
//
// So the assertions here target the mistakes text CAN catch, plus the one
// structural class that text-level checks were blind to:
//   1. a single-column foreign key, which silently permits cross-account links;
//   2. a bare ON DELETE SET NULL, which nulls appointments.user_id (NOT NULL)
//      and makes every client/task delete fail, months later, in production;
//   3. a `date` where a `timestamptz` was approved, which would discard the
//      time of day and with it the entire slice;
//   4. a DO block whose DECLARE names collide with its own table aliases —
//      the PR #137 defect class, invisible to every other assertion because the
//      SQL is well-formed and every identifier exists.
// ===================================================================

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const MIGRATION = '../../../supabase/migrations/20260801120000_schedule_core_slice1.sql';

const raw = read(MIGRATION);
const sql = raw.toLowerCase();

// Statements only. BOTH comment forms must go: prose in a comment fakes a
// match, and a `--`-only strip would let a predicate commented OUT with /* */
// still satisfy its own test. (Measured lesson, reused from slices past.)
const code = sql
  .replace(/\/\*[\s\S]*?\*\//g, '\n')
  .split('\n').filter((l) => !l.trim().startsWith('--'))
  .join('\n');

/**
 * One `add constraint <name> ...` statement, up to its terminating semicolon.
 *
 * The whitespace between `add` and `constraint` is a regex, not a literal
 * space: the migration aligns some of these as `add  constraint` for
 * readability, and an indexOf on the single-space form silently returns '' —
 * which every `expect(stmt).toContain(...)` would then FAIL on, but every
 * `expect(stmt).not.toContain(...)` would vacuously PASS. A helper that can
 * return '' must never be paired with a negative assertion, so it is asserted
 * non-empty below.
 */
function constraintStatement(name) {
  const m = new RegExp(`add\\s+constraint ${name}[\\s\\S]*?;`).exec(code);
  return m ? m[0] : '';
}

/** Each `create [or replace] function ... $$;` definition, individually. */
function functionDefinitions(source) {
  return [...source.matchAll(/create (?:or replace )?function[\s\S]*?\$\$;/g)].map((m) => m[0]);
}

describe('migration · the table and its instant columns', () => {
  it('creates public.appointments idempotently', () => {
    expect(code).toMatch(/create table if not exists public\.appointments \(/);
  });

  it('start_at is timestamptz NOT NULL — a date would discard the time of day', () => {
    expect(code).toMatch(/start_at\s+timestamptz not null/);
  });

  it('end_at is timestamptz and NULLABLE — "no stated end" is a real state', () => {
    expect(code).toMatch(/end_at\s+timestamptz\s*,/);
    expect(code).not.toMatch(/end_at\s+timestamptz not null/);
  });

  // NEGATIVE CONTROL for assertion 3 above.
  it('never declares either instant column as a plain date or a zoneless timestamp', () => {
    expect(code).not.toMatch(/start_at\s+date\b/);
    expect(code).not.toMatch(/end_at\s+date\b/);
    expect(code).not.toMatch(/(start_at|end_at)\s+timestamp\s+without/);
  });

  it('id is uuid with NO default — the client assigns it, as for charges', () => {
    expect(code).toMatch(/id\s+uuid primary key\s*,/);
    expect(code).not.toMatch(/id\s+uuid primary key default/);
  });

  it('user_id is uuid NOT NULL and cascades from auth.users', () => {
    expect(code).toMatch(/user_id\s+uuid not null references auth\.users \(id\) on delete cascade/);
  });

  it('client_id and task_id are nullable, and task_id is TEXT to match tasks.id', () => {
    expect(code).toMatch(/client_id\s+uuid\s*,/);
    expect(code).toMatch(/task_id\s+text\s*,/);
    expect(code).not.toMatch(/task_id\s+uuid/);
  });
});

describe('migration · the two composite same-owner foreign keys', () => {
  for (const target of ['client', 'task']) {
    const stmt = constraintStatement(`appointments_${target}_same_owner_fk`);
    const parent = `${target}s`;

    it(`${target}: the key carries user_id — a single-column key would permit cross-account links`, () => {
      expect(stmt).toContain(`foreign key (${target}_id, user_id)`);
      expect(stmt).toContain(`references public.${parent} (id, user_id)`);
    });

    it(`${target}: ON DELETE SET NULL names ${target}_id ALONE`, () => {
      expect(stmt).toMatch(new RegExp(`on delete set null \\(${target}_id\\)`));
    });

    // NEGATIVE CONTROL for the column list. A bare `on delete set null` also
    // nulls user_id (NOT NULL) and every parent delete would fail.
    it(`${target}: never a BARE set null`, () => {
      expect(stmt).not.toMatch(/on delete set null\s*(;|$)/);
      expect(stmt).not.toMatch(/on delete set null\s+on update/);
    });

    it(`${target}: is SET NULL, not CASCADE — deleting a contact must not erase history`, () => {
      expect(stmt).not.toContain('on delete cascade');
      expect(stmt).not.toContain('on delete restrict');
    });
  }

  it('adds the UNIQUE (id, user_id) the task key points at', () => {
    expect(code).toMatch(/alter table public\.tasks add constraint tasks_id_user_unique unique \(id, user_id\)/);
  });

  // NEGATIVE CONTROL: dropping the target of a foreign key either fails or
  // takes the FK with it. PART 2 must inspect, never blind-drop.
  it('never blind-drops tasks_id_user_unique', () => {
    expect(code).not.toMatch(/alter table public\.tasks drop constraint if exists tasks_id_user_unique/);
  });

  it('requires clients_id_user_unique rather than creating a key F1 owns', () => {
    expect(code).not.toMatch(/alter table public\.clients add constraint .*unique/);
    expect(sql).toContain('clients');
  });
});

describe('migration · the domain checks', () => {
  // GUARD ON THE HELPER ITSELF. Every constraint this file names must actually
  // be found — otherwise a negative assertion elsewhere would pass against an
  // empty string and prove nothing.
  it('every constraint the tests reference is really located in the file', () => {
    for (const n of [
      'appointments_kind_allowed', 'appointments_status_allowed',
      'appointments_time_order', 'appointments_title_bounded',
      'appointments_notes_bounded',
      'appointments_client_same_owner_fk', 'appointments_task_same_owner_fk',
    ]) {
      expect(constraintStatement(n), `not found: ${n}`).not.toBe('');
    }
  });

  it('kind is exactly the three approved values', () => {
    expect(constraintStatement('appointments_kind_allowed'))
      .toContain("check (kind in ('appointment', 'lesson', 'event'))");
  });

  it('status is exactly the four approved values', () => {
    expect(constraintStatement('appointments_status_allowed'))
      .toContain("check (status in ('planned', 'completed', 'cancelled', 'no_show'))");
  });

  it('end must be STRICTLY after start, and a null end is permitted', () => {
    expect(constraintStatement('appointments_time_order'))
      .toContain('check (end_at is null or end_at > start_at)');
  });

  // NEGATIVE CONTROL: `>=` would allow a zero-length appointment.
  it('never permits end_at = start_at', () => {
    expect(constraintStatement('appointments_time_order')).not.toContain('end_at >= start_at');
  });

  it('title is bounded and cannot be whitespace-only', () => {
    const stmt = constraintStatement('appointments_title_bounded');
    expect(stmt).toContain('btrim(title)');
    expect(stmt).toContain('between 1 and 160');
  });

  it('notes are bounded', () => {
    expect(constraintStatement('appointments_notes_bounded')).toContain('<= 2000');
  });
});

describe('migration · RLS is four policies, one per command, authenticated only', () => {
  for (const cmd of ['select', 'insert', 'update', 'delete']) {
    it(`has an own-row ${cmd} policy scoped to the authenticated role`, () => {
      const re = new RegExp(`create policy "appointments_${cmd}_own" on public\\.appointments\\s+for ${cmd} to authenticated`);
      expect(code).toMatch(re);
    });
  }

  it('enables row level security', () => {
    expect(code).toMatch(/alter table public\.appointments enable row level security/);
  });

  it('never ships a single catch-all `for all` policy', () => {
    expect(code).not.toMatch(/create policy "appointments_own"[\s\S]{0,80}for all/);
  });

  it('the UPDATE policy has BOTH using and with check — either alone is a hole', () => {
    const start = code.indexOf('create policy "appointments_update_own"');
    const stmt = code.slice(start, code.indexOf(';', start));
    expect(stmt).toContain('using (auth.uid() = user_id)');
    expect(stmt).toContain('with check (auth.uid() = user_id)');
  });
});

describe('migration · no quota, no SECURITY DEFINER, nothing destructive', () => {
  it('declares no quota and CREATES no SECURITY DEFINER function', () => {
    // The phrase itself DOES appear — PART 8 asserts that no such function
    // exists and names it in the raise message. What must be absent is the DDL:
    // a function definition carrying the attribute. That is the thing whose
    // default `anon` EXECUTE grant needed its own migration (20260728130000).
    // Bounded to ONE definition each. An unbounded `create function[\s\S]*?
    // security definer` spans the whole file and matches the phrase inside
    // PART 8's raise message, which is prose about the absence of such a
    // function — the assertion would fail for the opposite of the real reason.
    for (const fn of functionDefinitions(code)) {
      expect(fn).not.toContain('security definer');
    }
    expect(code).not.toContain('row_count');
    expect(code).not.toMatch(/grant execute/);
  });

  // NEGATIVE CONTROL for the extractor above: it must fire on the real shape.
  it('the SECURITY DEFINER detector is not vacuous', () => {
    const bad = 'create or replace function public.appointment_row_count()\nreturns int\nlanguage sql\nsecurity definer\nas $$ select 1 $$;';
    const found = functionDefinitions(bad);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('security definer');
  });

  it('the only function it (re)declares is the canonical set_updated_at helper', () => {
    const fns = [...code.matchAll(/create or replace function (public\.\w+)/g)].map((m) => m[1]);
    expect(fns).toEqual(['public.set_updated_at']);
  });

  it('never drops a table, deletes, updates or inserts data', () => {
    expect(code).not.toMatch(/drop table/);
    expect(code).not.toMatch(/\bdelete from\b/);
    expect(code).not.toMatch(/^\s*insert into/m);
    expect(code).not.toMatch(/^\s*update public\./m);
  });

  it('adds NO column to public.tasks — an appointment is its own row', () => {
    expect(code).not.toMatch(/alter table public\.tasks add column/);
  });

  it('SAFE STOPs on a server older than 15 (the column-list SET NULL syntax)', () => {
    expect(code).toContain("current_setting('server_version_num')::int < 150000");
  });

  it('checks the referenced clients key and refuses a DEFERRABLE one', () => {
    expect(code).toContain('condeferrable');
  });
});

describe('migration · the indexes and the updated_at trigger', () => {
  it('indexes (user_id, start_at) — the only read this product performs', () => {
    expect(code).toMatch(/create index if not exists idx_appointments_user_start\s+on public\.appointments \(user_id, start_at\)/);
  });

  it('indexes both link columns partially, so parent deletes do not seq-scan', () => {
    expect(code).toMatch(/idx_appointments_client_user[\s\S]{0,120}where client_id is not null/);
    expect(code).toMatch(/idx_appointments_task_user[\s\S]{0,120}where task_id is not null/);
  });

  it('has exactly ONE non-internal trigger, and it is updated_at', () => {
    const triggers = code.match(/create trigger (\w+)/g) || [];
    expect(triggers).toEqual(['create trigger trg_appointments_updated']);
  });
});

// ===================================================================
// THE PR #137 STRUCTURAL GUARD.
//
// PL/pgSQL resolves a qualified name against a DECLARED VARIABLE before a table
// alias, so `declare c record;` plus `from pg_class c` yields
// `record "c" is not assigned yet (55000)` — AFTER the DDL has run. That defect
// survived 21 review rounds and 105 text assertions on F1 because the SQL was
// well-formed and every identifier existed. Only a structural check sees it.
// ===================================================================

/** Every `do $$ ... $$;` block in the file, comments stripped. */
function doBlocks(source) {
  const out = [];
  const re = /do \$\$([\s\S]*?)\$\$;/g;
  let m = re.exec(source);
  while (m) { out.push(m[1]); m = re.exec(source); }
  return out;
}

/** Names introduced by the block's own DECLARE section. */
function declaredNames(block) {
  const decl = block.split(/\bbegin\b/)[0];
  if (!/\bdeclare\b/.test(decl)) return [];
  return decl.split(/\bdeclare\b/)[1]
    .split(';')
    .map((l) => (l.trim().match(/^([a-z_][a-z0-9_]*)\s/) || [])[1])
    .filter(Boolean);
}

/** Table aliases the block uses: `from x y`, `join x y`, `<table> as k(...)`. */
function tableAliases(block) {
  const out = new Set();
  const re = /\b(?:from|join)\s+[a-z_][a-z0-9_.]*\s+(?:as\s+)?([a-z_][a-z0-9_]*)\b/g;
  let m = re.exec(block);
  while (m) {
    if (!['as', 'on', 'where', 'and', 'or', 'select', 'order', 'group', 'lateral', 'with', 'using', 'loop', 'array', 'cross'].includes(m[1])) {
      out.add(m[1]);
    }
    m = re.exec(block);
  }
  return out;
}

describe('migration · DO-block alias discipline (the PR #137 defect class)', () => {
  const blocks = doBlocks(code);

  it('the file really contains DO blocks to check', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(3);
  });

  it('no DECLARE name collides with a table alias in its OWN block', () => {
    const collisions = [];
    blocks.forEach((b, i) => {
      const declared = new Set(declaredNames(b));
      for (const alias of tableAliases(b)) {
        if (declared.has(alias)) collisions.push(`block ${i}: ${alias}`);
      }
    });
    expect(collisions).toEqual([]);
  });

  // POSITIVE CONTROL for the guard itself: the detector must FIRE on the exact
  // shape that broke F1's second apply. A check that has never failed is not
  // known to be a check.
  it('the detector fires on the real F1 defect shape', () => {
    const bad = `do $$
declare
  c record;
  n int;
begin
  select c.relname into c from pg_class c join pg_namespace n on n.oid = c.relnamespace;
end;
$$;`;
    const b = doBlocks(bad)[0];
    const declared = new Set(declaredNames(b));
    const hits = [...tableAliases(b)].filter((a) => declared.has(a));
    expect(hits.sort()).toEqual(['c', 'n']);
  });

  it('every declared name in this migration is v_-prefixed, by convention', () => {
    for (const b of blocks) {
      for (const name of declaredNames(b)) {
        expect(name.startsWith('v_'), `undeclared convention: ${name}`).toBe(true);
      }
    }
  });

  it('uses no reserved word as a bare column alias (the F1 `notnull` defect)', () => {
    expect(code).not.toMatch(/\bas notnull\b/);
    expect(code).not.toMatch(/\bnotnull\b/);
  });
});

// ===================================================================
// NAMING BOUNDARY + HYGIENE SCANS.
// ===================================================================

const SRC = fileURLToPath(new URL('../../', import.meta.url));

const SLICE_MODULES = [
  'lib/schedule.js',
  'lib/api.js',
  'pages/Schedule.jsx',
  'components/forms/AppointmentModal.jsx',
];

describe('naming boundary · the diary is not the Growth planning calendar', () => {
  for (const rel of SLICE_MODULES) {
    it(`${rel} imports nothing from growthCalendar.js or pages/growth/**`, () => {
      const src = readFileSync(`${SRC}${rel}`, 'utf8');
      const imports = [...src.matchAll(/(?:^|\n)\s*import[^;]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(spec, `${rel} imports ${spec}`).not.toMatch(/growthCalendar/);
        expect(spec, `${rel} imports ${spec}`).not.toMatch(/pages\/growth/);
      }
    });
  }

  // POSITIVE CONTROL: the import extractor really finds this file's imports.
  it('the import extractor is not vacuously passing', () => {
    const src = readFileSync(`${SRC}pages/Schedule.jsx`, 'utf8');
    const imports = [...src.matchAll(/(?:^|\n)\s*import[^;]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(imports).toContain('../lib/schedule.js');
    expect(imports.length).toBeGreaterThan(4);
  });

  it('nothing under pages/growth/** imports the schedule module', () => {
    const walk = (dir) => readdirSync(dir).flatMap((n) => {
      const p = `${dir}/${n}`;
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
    for (const f of walk(`${SRC}pages/growth`).filter((f) => /\.jsx?$/.test(f))) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/lib\/schedule\.js/);
    }
  });

  it('the migration names the boundary explicitly, so the next reader sees it', () => {
    expect(sql).toContain('growthcalendar.js');
    expect(sql).toContain('calendar_events');
  });
});

describe('hygiene · no PII, no credentials, no account identifiers', () => {
  const artifacts = [raw, ...SLICE_MODULES.map((r) => readFileSync(`${SRC}${r}`, 'utf8')),
    readFileSync(fileURLToPath(new URL('./schedule.test.js', import.meta.url)), 'utf8')];

  it('contains no email address', () => {
    for (const a of artifacts) {
      expect(a).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    }
  });

  it('contains no real-looking account UUID', () => {
    // The only uuids permitted anywhere in this slice are the all-placeholder
    // shapes used in the migration's commented PART B (<A>, <KA>, …) — i.e.
    // none at all in literal form.
    for (const a of artifacts) {
      const uuids = a.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi) || [];
      expect(uuids).toEqual([]);
    }
  });

  it('contains no secret-shaped token', () => {
    for (const a of artifacts) {
      expect(a).not.toMatch(/service_role|sb_secret|sk_live|sk-[a-z0-9]{20}|ghp_|xoxb-|AKIA[0-9A-Z]{16}|PRIVATE KEY/);
      expect(a).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./); // JWT-shaped
    }
  });

  it('names only SC_QA_ placeholders in the acceptance section — never a person', () => {
    const partB = raw.slice(raw.indexOf('PART B -- MUTATING'));
    expect(partB).toContain('SC_QA_');
    expect(partB).toContain('DISPOSABLE QA RECORDS ONLY');
  });
});

describe('hygiene · the migration is the only new SQL file in this slice', () => {
  it('supabase/migrations gains exactly one file, timestamped after F1', () => {
    const dir = fileURLToPath(new URL('../../../supabase/migrations', import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    // NOT `files[files.length - 1]`. That asserted this slice's migration is the
    // LAST file in the directory FOREVER, so the next slice to add any migration
    // fails a Schedule test that has nothing to do with it (measured: the charge
    // delete guard, 20260802120000). What this test actually guards is that
    // SCHEDULE contributed exactly one file and that it sorts after F1 — both
    // still asserted, and neither depends on nothing ever being added again.
    expect(files).toContain('20260801120000_schedule_core_slice1.sql');
    expect(files.filter((f) => f.includes('schedule'))).toHaveLength(1);
    expect(files.indexOf('20260801120000_schedule_core_slice1.sql'))
      .toBeGreaterThan(files.indexOf('20260731120000_finance_receivables_slice1.sql'));
  });
});
