import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// ===================================================================
// P1 — atomic quote persistence.
// Confirmed defect: createQuote() inserted the quotes parent and
// writeItems() then wrote quote_items in SEPARATE statements — an item
// failure left a partially persisted quote, and a retry could mint a
// second one. Both create and update must now be ONE save_quote_atomic
// RPC call (single DB transaction: parent + items succeed or fail
// together).
//
// Evidence layers (a live transaction cannot run in this repo's test
// environment — the migration is NOT applied by this task):
//   * API behavioral mocks — exactly one rpc() call, zero table writes;
//   * pure payload-builder tests — snapshot/ownership contract;
//   * migration contract tests — DDL text: atomicity, SECURITY INVOKER,
//     auth.uid() ownership, grants, idempotency, non-destructiveness.
// ===================================================================

const h = vi.hoisted(() => {
  const state = { calls: { rpc: [], from: [] }, rpcError: null };
  return state;
});
vi.mock('../supabase.js', () => ({
  supabase: {
    rpc: (fn, args) => { h.calls.rpc.push({ fn, args }); return Promise.resolve({ data: null, error: h.rpcError }); },
    from: (table) => {
      h.calls.from.push(table);
      const chain = { insert: () => chain, update: () => chain, delete: () => chain, eq: () => chain, then: (r) => r({ error: null }) };
      return chain;
    },
  },
}));

import * as api from '../api.js';

const sql = readFileSync(
  new URL('../../../supabase/migrations/20260726120000_atomic_quote_persistence.sql', import.meta.url),
  'utf8',
);
const lower = sql.toLowerCase();
// the plpgsql function body — data DML is allowed ONLY inside it
const parts = lower.split('$fn$');
const fnBody = parts[1] || '';
// everything outside the function body, with comment lines stripped so the
// DML scan below matches real statements only
const outsideFn = parts
  .filter((_, i) => i !== 1)
  .join('\n')
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

const QUOTE = {
  id: 'qt_legacy_001', number: 'Q-77', clientId: 'c0ffee00-0000-4000-8000-000000000001',
  date: '2026-07-26', validDays: 14, vatRate: 18, status: 'sent', notes: 'הערה',
  items: [{ id: 'i1', desc: 'לוגו', qty: 2, price: 500 }, { id: 'i2', desc: '', qty: 0, price: 0 }],
};

beforeEach(() => { h.calls.rpc.length = 0; h.calls.from.length = 0; h.rpcError = null; });

describe('api · atomic quote save uses exactly ONE rpc call', () => {
  it('createQuote → one save_quote_atomic rpc, ZERO table statements', async () => {
    await api.createQuote('user-1', QUOTE);
    expect(h.calls.rpc).toHaveLength(1);
    expect(h.calls.rpc[0].fn).toBe('save_quote_atomic');
    expect(h.calls.from).toHaveLength(0);            // old sequential path is GONE
    expect(h.calls.rpc[0].args.p_mode).toBe('create');
  });

  it('updateQuote → one save_quote_atomic rpc, ZERO table statements', async () => {
    await api.updateQuote('user-1', QUOTE);
    expect(h.calls.rpc).toHaveLength(1);
    expect(h.calls.rpc[0].fn).toBe('save_quote_atomic');
    expect(h.calls.from).toHaveLength(0);
    expect(h.calls.rpc[0].args.p_mode).toBe('update');
  });

  it('rpc failure rejects (guard) — the store keeps its { ok:false } truthfulness', async () => {
    h.rpcError = { message: 'item validation failed' };
    await expect(api.createQuote('user-1', QUOTE)).rejects.toBe(h.rpcError);
    await expect(api.updateQuote('user-1', QUOTE)).rejects.toBe(h.rpcError);
    expect(h.calls.from).toHaveLength(0);            // no fallback to the old path on failure
  });

  it('the sequential helper is gone from the source (no writeItems, no quotes-then-items)', () => {
    const src = readFileSync(new URL('../api.js', import.meta.url), 'utf8');
    expect(src).not.toContain('writeItems');
    // no direct table write to quotes/quote_items remains in create/updateQuote
    const quoteFns = src.slice(src.indexOf('export async function createQuote'), src.indexOf('export async function deleteQuote'));
    expect(quoteFns).not.toContain("from('quotes')");
    expect(quoteFns).not.toContain("from('quote_items')");
  });
});

describe('api · RPC payload preserves the quote + item snapshot', () => {
  it('maps camelCase quote fields to the snake_case contract, id passed as-is (TEXT)', () => {
    const { p_mode, p_quote, p_items } = api.buildQuoteRpcArgs('create', QUOTE);
    expect(p_mode).toBe('create');
    expect(p_quote).toEqual({
      id: 'qt_legacy_001',                       // legacy text id supported unchanged
      number: 'Q-77', client_id: QUOTE.clientId, date: '2026-07-26',
      valid_days: 14, vat_rate: 18, status: 'sent', notes: 'הערה',
    });
    expect(p_items).toEqual([
      { description: 'לוגו', qty: 2, price: 500, position: 0 },
      { description: '', qty: 1, price: 0, position: 1 },     // qty falls back to 1 (previous writeItems parity)
    ]);
  });

  it('client-provided user_id is NOT trusted: no ownership key anywhere in the payload', () => {
    const args = api.buildQuoteRpcArgs('create', { ...QUOTE, userId: 'attacker', user_id: 'attacker' });
    const flat = JSON.stringify(args);
    expect(flat).not.toContain('user_id');
    expect(flat).not.toContain('attacker');
  });

  it('empty items: create sends [] (valid empty snapshot); update replaces with []', () => {
    expect(api.buildQuoteRpcArgs('create', { ...QUOTE, items: [] }).p_items).toEqual([]);
    expect(api.buildQuoteRpcArgs('update', { ...QUOTE, items: [] }).p_items).toEqual([]);
  });

  it('update with items undefined → p_items null (existing items kept, prior contract)', () => {
    const { items, ...noItems } = QUOTE;
    expect(api.buildQuoteRpcArgs('update', noItems).p_items).toBeNull();
    // create NEVER silently skips the snapshot
    expect(api.buildQuoteRpcArgs('create', noItems).p_items).toEqual([]);
  });

  it('partial update maps only provided fields (mapToRow parity)', () => {
    const { p_quote } = api.buildQuoteRpcArgs('update', { id: 'q1', status: 'accepted' });
    expect(p_quote).toEqual({ id: 'q1', status: 'accepted' });
  });
});

describe('migration · security + ownership model', () => {
  it('SECURITY INVOKER with hardened empty search_path — never DEFINER', () => {
    expect(fnBody).toBeTruthy();
    expect(lower).toContain('security invoker');
    expect(lower).not.toContain('security definer');
    expect(lower).toMatch(/set search_path = ''/);
  });

  it('ownership derived from auth.uid(); every quote/item statement pinned to it', () => {
    expect(fnBody).toContain('auth.uid()');
    expect(fnBody).not.toMatch(/p_quote\s*->>\s*'user_id'/); // payload ownership never read
    // update lock, update, and item delete are all user_id-pinned
    expect(fnBody).toMatch(/where q\.id = v_id and q\.user_id = v_uid\s+for update/);
    expect(fnBody).toMatch(/delete from public\.quote_items where quote_id = v_id and user_id = v_uid/);
  });

  it('item rows can only reference the quote being saved (quote_id forced to v_id)', () => {
    expect(fnBody).toMatch(/insert into public\.quote_items[\s\S]*?select\s+v_uid,\s*(--[^\n]*\n\s*)?v_id,/);
    // a client-supplied quote_id on an item is never read
    expect(fnBody).not.toMatch(/elem\s*->>\s*'quote_id'/);
  });

  it('update of a missing or foreign-owned quote fails loudly', () => {
    expect(fnBody).toMatch(/if not found then\s*raise exception 'save_quote_atomic: quote % not found/);
  });

  it('EXECUTE granted to authenticated ONLY; revoked from public and anon; no dynamic SQL', () => {
    expect(lower).toContain('revoke all on function public.save_quote_atomic(text, jsonb, jsonb) from public');
    expect(lower).toContain('revoke all on function public.save_quote_atomic(text, jsonb, jsonb) from anon');
    expect(lower).toContain('grant execute on function public.save_quote_atomic(text, jsonb, jsonb) to authenticated');
    expect(lower).not.toContain('execute format');
    expect(fnBody).not.toMatch(/\bexecute\s/);       // no dynamic SQL inside the function
  });
});

describe('migration · atomicity + rollback structure', () => {
  it('parent write and item replacement live in the SAME function invocation (one transaction)', () => {
    expect(fnBody).toContain('insert into public.quotes');
    expect(fnBody).toContain('update public.quotes');
    expect(fnBody).toContain('delete from public.quote_items');
    expect(fnBody).toContain('insert into public.quote_items');
    // no transaction-control escape hatches — any RAISE aborts everything
    expect(fnBody).not.toMatch(/\bcommit\b/);
    expect(fnBody).not.toMatch(/\bsavepoint\b/);
    expect(fnBody).not.toMatch(/\bexception\s+when\b/); // no swallowed errors
  });

  it('input contract fails loud: mode, object shape, required id, item field types', () => {
    expect(fnBody).toMatch(/p_mode must be/);
    expect(fnBody).toMatch(/p_quote must be a json object/);
    expect(fnBody).toMatch(/p_quote\.id \(text\) is required/);
    expect(fnBody).toMatch(/each item needs numeric qty\/price\/position/);
    expect(fnBody).toMatch(/create requires p_items/);
    expect(fnBody).toMatch(/not authenticated/);
  });

  it('existing TEXT quote ids stay supported — quote id is never cast to uuid', () => {
    expect(fnBody).toMatch(/v_id\s+text/);
    expect(fnBody).not.toMatch(/v_id\s*::\s*uuid/);
    expect(fnBody).not.toMatch(/'id'\s*\)\s*::\s*uuid/);
  });
});

describe('migration · additive, idempotent, non-destructive', () => {
  it('no data DML at migration time (INSERT/UPDATE/DELETE only inside the function body)', () => {
    expect(outsideFn).not.toMatch(/\b(insert into|delete from|truncate)\b/);
    expect(outsideFn).not.toMatch(/^\s*update\s+\S+\s+set\b/m);
  });

  it('no destructive DDL — nothing dropped/altered on existing tables, columns, policies, triggers', () => {
    expect(lower).not.toMatch(/drop\s+(table|column|policy|trigger|index)/);
    expect(lower).not.toMatch(/alter\s+table/);
  });

  it('idempotent: CREATE OR REPLACE + absolute grants; safe on a clean re-run', () => {
    expect(lower).toContain('create or replace function public.save_quote_atomic');
  });

  it('fail-loud preflight: tables, column types, RLS, policies and same-name conflicts checked BEFORE creating', () => {
    expect(lower).toMatch(/preflight failed: public\.quotes and\/or public\.quote_items do not exist/);
    expect(lower).toMatch(/preflight failed: live schema differs/);
    expect(lower).toMatch(/preflight failed: rls is not enabled/);
    expect(lower).toMatch(/preflight failed: ownership policies quotes_own\/quote_items_own are missing/);
    expect(lower).toMatch(/different argument list/);
    expect(lower).toContain('pg_get_function_identity_arguments');
  });
});
