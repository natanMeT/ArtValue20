import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// R1.1 — database type contract guard.
//
// The live public.quotes.id column is TEXT (quote ids are opaque app strings:
// legacy 'qt_...' prefixed local-mode ids + current crypto.randomUUID()
// strings). The first run of the missing-CRM-tables migration failed with
// Postgres 42804 because quote_items.quote_id was declared uuid against the
// text parent. These static guards pin the corrected contract so the drift
// can never silently return in either the canonical schema or the versioned
// migration.

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const SCHEMA = read('../../../supabase/schema.sql');
const MIGRATION = read('../../../supabase/migrations/20260716120000_add_missing_crm_tables.sql');
const S0B = read('../../../supabase/migrations/20260722120000_s0b_tasks_followups.sql');

// Extract the declared SQL type of `column` inside `create table ... public.<table> ( ... );`
function columnType(sql, table, column) {
  const m = sql.match(new RegExp(`create table if not exists public\\.${table} \\(([^;]*?)\\);`, 'i'));
  expect(m, `table ${table} present`).not.toBe(null);
  const line = m[1].split('\n').find((l) => new RegExp(`^\\s*${column}\\s`).test(l));
  expect(line, `${table}.${column} present`).toBeTruthy();
  return line.trim().split(/\s+/)[1];
}

describe('db type contract · schema.sql', () => {
  it('quotes.id and quote_items.quote_id use the SAME (FK-compatible) type: text', () => {
    const parent = columnType(SCHEMA, 'quotes', 'id');
    const child = columnType(SCHEMA, 'quote_items', 'quote_id');
    expect(parent).toBe('text'); // authoritative LIVE type — never uuid without a live migration
    expect(child).toBe(parent);  // 42804 guard: child FK must match the parent
  });

  it('clients.id stays uuid and every clients FK matches it', () => {
    expect(columnType(SCHEMA, 'clients', 'id')).toBe('uuid');
    expect(columnType(SCHEMA, 'quotes', 'client_id')).toBe('uuid');
    expect(columnType(SCHEMA, 'outreach_leads', 'client_id')).toBe('uuid');
  });

  it('quote_items keeps uuid id + user_id (only quote_id is text)', () => {
    expect(columnType(SCHEMA, 'quote_items', 'id')).toBe('uuid');
    expect(columnType(SCHEMA, 'quote_items', 'user_id')).toBe('uuid');
  });
});

describe('db type contract · versioned migration (20260716120000_add_missing_crm_tables)', () => {
  it('quote_items.quote_id is text; ids/user_id uuid; outreach_leads.client_id uuid', () => {
    expect(columnType(MIGRATION, 'quote_items', 'quote_id')).toBe('text');
    expect(columnType(MIGRATION, 'quote_items', 'id')).toBe('uuid');
    expect(columnType(MIGRATION, 'quote_items', 'user_id')).toBe('uuid');
    expect(columnType(MIGRATION, 'outreach_leads', 'client_id')).toBe('uuid');
    expect(columnType(MIGRATION, 'outreach_leads', 'user_id')).toBe('uuid');
  });

  it('migration and schema.sql declare the IDENTICAL quote_items.quote_id type (no re-drift)', () => {
    expect(columnType(MIGRATION, 'quote_items', 'quote_id'))
      .toBe(columnType(SCHEMA, 'quote_items', 'quote_id'));
  });

  it('still contains the required FKs, indexes, trigger, RLS and ownership policies', () => {
    for (const required of [
      'references public.quotes (id) on delete cascade',
      'references public.clients (id) on delete set null',
      'references auth.users (id) on delete cascade',
      'create index if not exists idx_quote_items_quote on public.quote_items (quote_id);',
      'create index if not exists idx_leads_user        on public.outreach_leads (user_id);',
      'create trigger trg_leads_updated before update on public.outreach_leads',
      'alter table public.quote_items    enable row level security;',
      'alter table public.outreach_leads enable row level security;',
      'create policy "quote_items_own" on public.quote_items',
      'create policy "outreach_leads_own" on public.outreach_leads',
      'for all using (auth.uid() = user_id) with check (auth.uid() = user_id);',
    ]) {
      expect(MIGRATION.includes(required), required).toBe(true);
    }
  });

  it('contains no destructive or data-mutating statements (executable lines only)', () => {
    const lines = MIGRATION.split('\n').filter((l) => !/^\s*--/.test(l)).map((l) => l.trim().toLowerCase());
    // Statement-initial keywords only — 'before update on' (trigger timing) and
    // 'updated_at' column references are legitimate and must not trip this.
    for (const banned of [/^drop table\b/, /^delete\b/, /^truncate\b/, /^update\b/, /^insert\b/, /^grant\b/, /^revoke\b/, /^alter table public\.quotes\b/]) {
      expect(lines.some((l) => banned.test(l)), String(banned)).toBe(false);
    }
  });
});

describe('db contract · S0B migration (tasks + client follow-ups)', () => {
  it('tasks.id is text; user_id uuid; project_id text (no FK); client_id uuid', () => {
    expect(columnType(S0B, 'tasks', 'id')).toBe('text');        // opaque app ids (legacy tk_ + uuid strings)
    expect(columnType(S0B, 'tasks', 'user_id')).toBe('uuid');
    expect(columnType(S0B, 'tasks', 'project_id').replace(/,$/, '')).toBe('text'); // soft link, no FK (bare `text,`)
    expect(columnType(S0B, 'tasks', 'client_id')).toBe('uuid');
  });

  it('tasks.client_id type matches clients.id (uuid) — FK-compatible', () => {
    expect(columnType(S0B, 'tasks', 'client_id')).toBe(columnType(SCHEMA, 'clients', 'id'));
  });

  it('status/priority CHECK constraints match the audited studio enums', () => {
    expect(S0B).toContain("check (status in ('new', 'todo', 'in_progress', 'await_client', 'await_material', 'review', 'done'))");
    expect(S0B).toContain("check (priority in ('low', 'normal', 'high', 'urgent'))");
  });

  it('declares the client follow-up columns, index, RLS, ownership policy and trigger', () => {
    for (const required of [
      'add column if not exists next_action      text',
      'add column if not exists next_action_date date',
      'references public.clients (id) on delete set null',
      'references auth.users (id) on delete cascade',
      'create index if not exists idx_tasks_user on public.tasks (user_id);',
      'drop trigger if exists trg_tasks_updated on public.tasks;',
      'create trigger trg_tasks_updated before update on public.tasks',
      'alter table public.tasks enable row level security;',
      'create policy "tasks_own" on public.tasks',
      'for all using (auth.uid() = user_id) with check (auth.uid() = user_id);',
    ]) {
      expect(S0B.includes(required), required).toBe(true);
    }
  });

  it('contains no destructive or data-mutating statements (executable lines only)', () => {
    const lines = S0B.split('\n').filter((l) => !/^\s*--/.test(l)).map((l) => l.trim().toLowerCase());
    for (const banned of [/^drop table\b/, /^delete\b/, /^truncate\b/, /^update\b/, /^insert\b/, /^grant\b/, /^revoke\b/]) {
      expect(lines.some((l) => banned.test(l)), String(banned)).toBe(false);
    }
  });
});
