// ===================================================================
// T2 — Cloud Demo Containment.
//
// The defect: Settings' "טען נתוני הדגמה" was reachable in authenticated
// cloud. Its IMPORT dispatch fell into the generic optimistic path — the
// reducer REPLACED the whole store with ArtValue demo data, persist() had
// no IMPORT route and resolved { ok: true } from its default case, and the
// toast claimed success. Nothing persisted; a refresh reverted; a real
// account saw demo rows presented as its own. RESET shared the same class
// (its button was already local-only; the dispatch path was not guarded).
//
// The fix, three layers (each mutation-controlled):
//   1. UI gate — the demo-load button renders only in local/demo.
//   2. Store firewall — cloud dispatch refuses RESET/IMPORT outright
//      ({ ok: false }, no state change), via the executable classifier
//      isWholeStoreReplaceDispatch. The legitimate cloud backup import
//      (importBackup → api.bulkUpload + refetch) never dispatches IMPORT
//      and stays functional.
//   3. Truthful copy — loadDemo claims success only on { ok: true };
//      Intake's toast/DemoTag state the real persistence mode.
//
// Executable where the surface is executable (classifier + reducer);
// source pins where the wiring lives inside the provider closure — the
// same split storeAutoIncomeContainment.test.js established.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  isWholeStoreReplaceDispatch, WHOLE_STORE_REPLACE_DISPATCH,
  isMemoryOnlyDispatch, DURABLE_DISPATCH,
} from '../../lib/betaCapabilities.js';
import { reducer } from '../../store/store.jsx';
import { buildSeed, buildDemoSeed } from '../../data/seed.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const storeSrc = () => read('../../store/store.jsx');
const settingsSrc = () => read('../Settings.jsx');
const intakeSrc = () => read('../Intake.jsx');

describe('T2 · executable classifier — whole-store replacement dispatches', () => {
  it('RESET and IMPORT classify as whole-store replacement; nothing else does', () => {
    expect(isWholeStoreReplaceDispatch('RESET')).toBe(true);
    expect(isWholeStoreReplaceDispatch('IMPORT')).toBe(true);
    expect([...WHOLE_STORE_REPLACE_DISPATCH].sort()).toEqual(['IMPORT', 'RESET']);
    // Durable and memory-only entity mutations keep their own lanes.
    for (const t of DURABLE_DISPATCH) {
      expect(isWholeStoreReplaceDispatch(t), t).toBe(false);
    }
    expect(isWholeStoreReplaceDispatch('ADD_PROJECT')).toBe(false);
    expect(isMemoryOnlyDispatch('RESET')).toBe(false); // separate class, separate reason
  });
});

describe('T2 · local/demo behavior unchanged (executable reducer)', () => {
  it('the reducer still fully supports RESET and IMPORT for the local branch', () => {
    const demo = buildDemoSeed();
    const afterImport = reducer(buildSeed(), { type: 'IMPORT', payload: demo });
    expect(afterImport).toBe(demo);
    const afterReset = reducer(demo, { type: 'RESET' });
    expect(Array.isArray(afterReset.clients)).toBe(true);
    expect(afterReset.clients.length).toBe(0);
    expect(afterReset.outreachLeads.length).toBeGreaterThan(0); // seed keeps the lead-research tool
  });
});

describe('T2 · store firewall wiring (source pins)', () => {
  it('the CLOUD dispatch refuses whole-store replacement BEFORE any state change', () => {
    const s = storeSrc();
    const guard = /if \(isWholeStoreReplaceDispatch\(action\.type\)\) \{\s*\n\s*return Promise\.resolve\(\{ ok: false, reason: 'cloud_unavailable' \}\);\s*\n\s*\}/m;
    expect(guard.test(s)).toBe(true);
    // Ordering: the guard sits in the cloud path — AFTER the local-mode early
    // branch, BEFORE withId/optimistic apply. Slice the dispatch body to prove it.
    const body = s.slice(s.indexOf('---- dispatch (same signature in both modes)'));
    const iLocal = body.indexOf('if (!supabaseEnabled) {');
    const iGuard = body.indexOf('isWholeStoreReplaceDispatch(action.type)');
    const iWithId = body.indexOf('const act = withId(action);');
    expect(iLocal).toBeGreaterThan(-1);
    expect(iGuard).toBeGreaterThan(iLocal);
    expect(iWithId).toBeGreaterThan(iGuard);
    // The local branch itself never consults the classifier — RESET/IMPORT
    // stay fully available in local/demo.
    expect(body.slice(iLocal, body.indexOf('localStorage is durable')).includes('isWholeStoreReplaceDispatch')).toBe(false);
  });

  it('the legitimate cloud backup import path stays dispatch-free (bulkUpload + refetch)', () => {
    const s = storeSrc();
    const imp = s.slice(s.indexOf('const importBackup'), s.indexOf('const value = {'));
    expect(imp.includes('api.bulkUpload(userId, parsed)')).toBe(true);
    expect(imp.includes('refetch()')).toBe(true);
    expect(imp.includes("dispatch(")).toBe(false);
    expect(imp.includes("type: 'IMPORT'")).toBe(false);
  });
});

describe('T2 · Settings surface (source pins)', () => {
  it('the demo-load button renders ONLY in local/demo', () => {
    const s = settingsSrc();
    const gated = /\{!supabaseEnabled && \(\s*\n\s*<button className="btn btn-ghost" onClick=\{loadDemo\}/m;
    expect(gated.test(s)).toBe(true);
  });

  it('loadDemo claims success only when the store actually applied the import', () => {
    const s = settingsSrc();
    const fn = s.slice(s.indexOf('const loadDemo'), s.indexOf('const exportData'));
    expect(fn.includes('await dispatch(')).toBe(true);
    expect(fn.includes('if (r && r.ok)')).toBe(true);
    expect(fn.includes('אינה זמינה במצב ענן')).toBe(true);
    // The success toast must be inside the ok-branch, never unconditional.
    expect(fn.indexOf('if (r && r.ok)')).toBeLessThan(fn.indexOf('נתוני הדגמה נטענו'));
  });

  it('the local-only reset button arrangement is unchanged (cloud shows migrate, local shows reset)', () => {
    const s = settingsSrc();
    expect(s.includes('{supabaseEnabled ? (')).toBe(true);
    expect(s.includes('ניקוי כל הנתונים')).toBe(true);
    expect(s.includes('ייבוא נתונים מקומיים ל-Supabase')).toBe(true);
  });
});

describe('T2 · Intake truthfulness (source pins)', () => {
  it('the success toast states the REAL persistence mode per branch', () => {
    const s = intakeSrc();
    expect(s.includes("supabaseEnabled ? 'הליד נקלט במערכת · נשמר בענן' : 'הליד נקלט במערכת · נשמר מקומית'")).toBe(true);
  });

  it('DemoTag renders only where its "נשמר מקומית במצב הדגמה" claim is true', () => {
    const s = intakeSrc();
    expect(s.includes('action={supabaseEnabled ? null : <DemoTag />}')).toBe(true);
    expect(s.includes('action={<DemoTag />}')).toBe(false);
  });
});
