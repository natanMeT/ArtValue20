import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// R3 — LIVE CRM schema contract + RLS repair guards.
//
// Production failed with PGRST204 (clients.project_type missing): the live
// clients/quotes/transactions tables predate the canonical schema and also
// carried a PERMISSIVE PUBLIC policy ("Service role full access", USING true).
// These tests pin (a) the exact frontend DB contract, (b) that the canonical
// schema satisfies it, and (c) that the repair migration adds exactly the
// missing pieces, fails closed on non-empty tables, and installs real
// ownership policies — with zero destructive statements.

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const API = read('../api.js');
const SCHEMA = read('../../../supabase/schema.sql');
const MIG = read('../../../supabase/migrations/20260717090000_crm_live_schema_contract_repair.sql');

// The exact column sets the frontend writes (api.js field maps + id/user_id)
// and reads (row mappers + order clauses). Changing api.js must update this.
const CONTRACT = {
  clients: ['id', 'user_id', 'name', 'contact', 'phone', 'email', 'status', 'value', 'date', 'source', 'project_type', 'notes', 'created_at'],
  quotes: ['id', 'user_id', 'number', 'client_id', 'date', 'valid_days', 'vat_rate', 'status', 'notes', 'created_at'],
  transactions: ['id', 'user_id', 'type', 'amount', 'category', 'date', 'description', 'client_id', 'created_at'],
};

// Columns the owner-verified LIVE tables are missing vs. the contract — the
// migration must add exactly these (plus canonical updated_at).
const LIVE_MISSING = {
  clients: ['user_id', 'value', 'source', 'project_type', 'updated_at'],
  quotes: ['user_id', 'number', 'valid_days', 'vat_rate', 'notes', 'updated_at'],
  transactions: ['user_id', 'client_id', 'updated_at'],
};

function schemaColumnLine(table, column) {
  const m = SCHEMA.match(new RegExp(`create table if not exists public\\.${table} \\(([^;]*?)\\);`));
  expect(m, `schema table ${table}`).not.toBe(null);
  return m[1].split('\n').find((l) => new RegExp(`^\\s*${column}\\s`).test(l)) || null;
}

describe('R3 · frontend DB contract (api.js is the source of truth)', () => {
  it('api.js field maps still match the pinned contract', () => {
    expect(API).toContain("projectType: 'project_type'");
    expect(API).toContain("status: 'status', value: 'value', date: 'date', source: 'source',");
    expect(API).toContain("number: 'number', clientId: 'client_id', date: 'date', validDays: 'valid_days',");
    expect(API).toContain("vatRate: 'vat_rate', status: 'status', notes: 'notes',");
    expect(API).toContain("type: 'type', amount: 'amount', category: 'category', date: 'date',");
    expect(API).toContain("description: 'description', clientId: 'client_id',");
    // reads: row mappers + order clauses
    for (const col of ['r.project_type', 'r.valid_days', 'r.vat_rate', 'r.client_id']) {
      expect(API.includes(col), col).toBe(true);
    }
    expect(API).toContain(".order('created_at', { ascending: false })");
  });

  it('canonical schema.sql provides every contract column for a fresh database', () => {
    for (const [table, cols] of Object.entries(CONTRACT)) {
      for (const col of cols) {
        expect(schemaColumnLine(table, col), `${table}.${col}`).toBeTruthy();
      }
    }
  });
});

describe('R3 · repair migration — coverage and types', () => {
  it('adds exactly the live-missing columns for each table (add column if not exists)', () => {
    for (const [table, cols] of Object.entries(LIVE_MISSING)) {
      for (const col of cols) {
        const re = new RegExp(`alter table public\\.${table} add column if not exists ${col}\\s`);
        expect(re.test(MIG), `${table}.${col}`).toBe(true);
      }
      // and no add-column for anything else on this table
      const added = [...MIG.matchAll(new RegExp(`alter table public\\.${table} add column if not exists (\\w+)`, 'g'))].map((m) => m[1]);
      expect(added.sort()).toEqual([...cols].sort());
    }
  });

  it('added columns use the canonical production-compatible types/defaults', () => {
    expect(MIG).toContain('add column if not exists value        numeric not null default 0');
    expect(MIG).toContain('add column if not exists valid_days integer default 30');
    expect(MIG).toContain('add column if not exists vat_rate   numeric default 18');
    // every user_id is uuid and becomes NOT NULL (zero-row guarantee makes this safe)
    for (const t of ['clients', 'quotes', 'transactions']) {
      expect(new RegExp(`alter table public\\.${t} add column if not exists user_id\\s+uuid`).test(MIG), t).toBe(true);
      expect(MIG.includes(`alter table public.${t} alter column user_id set not null`), t).toBe(true);
    }
    // updated_at everywhere + canonical triggers
    expect((MIG.match(/add column if not exists updated_at\s+timestamptz not null default now\(\)/g) || []).length).toBe(3);
    for (const trg of ['trg_clients_updated', 'trg_quotes_updated', 'trg_tx_updated']) {
      expect(MIG.includes(`drop trigger if exists ${trg}`), trg).toBe(true);
      expect(new RegExp(`create trigger ${trg} before update`).test(MIG), trg).toBe(true);
    }
  });

  it('adds the canonical FKs and indexes', () => {
    expect(MIG).toContain('foreign key (user_id) references auth.users (id) on delete cascade');
    expect(MIG).toContain('foreign key (client_id) references public.clients (id) on delete cascade');      // quotes
    expect(MIG).toContain('foreign key (client_id) references public.clients (id) on delete set null');     // transactions
    for (const idx of ['idx_clients_user', 'idx_quotes_user', 'idx_quotes_client', 'idx_tx_user']) {
      expect(new RegExp(`create index if not exists ${idx} `).test(MIG), idx).toBe(true);
    }
  });

  it('quotes.id / quote_items / outreach_leads are untouched (text compat preserved)', () => {
    const exe = MIG.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
    expect(/alter\s+column\s+id\b/i.test(exe)).toBe(false);            // never retypes any id
    expect(exe.includes('quote_items')).toBe(false);                   // not touched at all
    expect(exe.includes('outreach_leads')).toBe(false);                // not touched at all
    // schema-side compat is pinned in dbSchemaContract.test.js (quotes.id text
    // === quote_items.quote_id text); here we only need "migration keeps out".
  });
});

describe('R3 · repair migration — safety', () => {
  const executable = MIG.split('\n').filter((l) => !/^\s*--/.test(l)).map((l) => l.trim().toLowerCase());

  it('fail-closed zero-row preflight runs BEFORE any schema/policy change, inside one DO block', () => {
    // order is checked over EXECUTABLE text only (the header comment also
    // narrates the changes, which must not confuse the position check)
    const exe = MIG.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
    const raise = exe.indexOf('raise exception');
    const firstChange = exe.search(/alter table|create policy|drop policy|create trigger|create index/);
    expect(MIG.includes('PREFLIGHT')).toBe(true);
    expect(raise).toBeGreaterThan(-1);
    expect(firstChange).toBeGreaterThan(-1);
    expect(raise).toBeLessThan(firstChange);
    // the count covers all three tables
    for (const t of ['from public.clients', 'from public.quotes', 'from public.transactions']) {
      expect(exe.slice(0, firstChange).includes(t), t).toBe(true);
    }
    // single DO block = single statement = atomic (abort ⇒ nothing applied)
    expect((MIG.match(/do \$mig\$/g) || []).length).toBe(1);
    expect(MIG.includes('$mig$;')).toBe(true);
  });

  it('contains no destructive or data-mutating statements', () => {
    for (const banned of [/^drop table\b/, /^drop column\b/, /^delete\b/, /^truncate\b/, /^update\b/, /^insert\b/, /^grant\b/, /^revoke\b/, /rename\b/]) {
      expect(executable.some((l) => banned.test(l)), String(banned)).toBe(false);
    }
    expect(MIG.includes('backfill')).toBe(true); // the guard message forbids guessing ownership
  });

  it('replaces the permissive public policy with real ownership policies', () => {
    // the unsafe policy name appears ONLY in drop statements
    const mentions = MIG.split('\n').filter((l) => l.includes('"Service role full access"') && !/^\s*--/.test(l));
    expect(mentions.length).toBe(3);
    for (const l of mentions) expect(l.trim().startsWith('drop policy if exists')).toBe(true);
    // no permissive USING/WITH CHECK true anywhere
    expect(/using\s*\(\s*true\s*\)/i.test(MIG)).toBe(false);
    expect(/with check\s*\(\s*true\s*\)/i.test(MIG)).toBe(false);
    // the three canonical ownership policies, USING + WITH CHECK on auth.uid()
    for (const p of ['clients_own', 'quotes_own', 'transactions_own']) {
      expect(new RegExp(`drop policy if exists "${p}"`).test(MIG), p).toBe(true);
      expect(new RegExp(`create policy "${p}"[^;]*for all using \\(auth\\.uid\\(\\) = user_id\\) with check \\(auth\\.uid\\(\\) = user_id\\);`, 's').test(MIG), p).toBe(true);
    }
  });

  it('is idempotent: guarded adds only, conditional FKs, drop-if-exists before recreate', () => {
    for (const l of executable.filter((x) => x.startsWith('alter table') && x.includes('add column'))) {
      expect(l.includes('if not exists'), l).toBe(true);
    }
    for (const l of executable.filter((x) => x.startsWith('create index'))) {
      expect(l.includes('if not exists'), l).toBe(true);
    }
    // FK additions are wrapped in pg_constraint existence checks
    expect((MIG.match(/add constraint \w+_fkey/g) || []).length).toBe((MIG.match(/from pg_constraint con/g) || []).length);
  });
});
