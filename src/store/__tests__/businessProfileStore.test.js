import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { reducer } from '../store.jsx';
import { isMemoryOnlyDispatch } from '../../lib/betaCapabilities.js';

// ===================================================================
// store — SAVE_BUSINESS_PROFILE reducer + persist-first source guards (S0D).
// (Persist-first behavior is enforced source-level, mirroring the S0B task
// pattern — the store has no DOM/network harness in this repo.)
// ===================================================================

const storeSrc = readFileSync(new URL('../store.jsx', import.meta.url), 'utf8');

describe('reducer · SAVE_BUSINESS_PROFILE', () => {
  it('sets businessProfile without disturbing other state', () => {
    const prev = { clients: [{ id: 'c1' }], tasks: [], businessProfile: null, activity: [] };
    const profile = { businessName: 'סטודיו אלפא', audiences: [], tone: [], differentiators: [], services: [], brandPalette: null };
    const next = reducer(prev, { type: 'SAVE_BUSINESS_PROFILE', payload: profile });
    expect(next.businessProfile).toEqual(profile);
    expect(next.clients).toBe(prev.clients); // untouched reference
  });

  it('overwrites an existing profile (upsert semantics)', () => {
    const prev = { businessProfile: { businessName: 'ישן' } };
    const next = reducer(prev, { type: 'SAVE_BUSINESS_PROFILE', payload: { businessName: 'חדש' } });
    expect(next.businessProfile).toEqual({ businessName: 'חדש' });
  });
});

describe('store source guards (S0D)', () => {
  it('EMPTY seeds businessProfile: null (unconfigured by default)', () => {
    expect(storeSrc).toContain('businessProfile: null');
  });

  it('is NOT classified memory-only (durable write, must reach persistence)', () => {
    expect(isMemoryOnlyDispatch('SAVE_BUSINESS_PROFILE')).toBe(false);
  });

  it('persist-first: upsert BEFORE reducer; success → { ok: true }, failure → refetch + { ok: false }', () => {
    // the S0D branch calls the api directly (single-row upsert, not entity CRUD)
    expect(storeSrc).toContain("if (act.type === 'SAVE_BUSINESS_PROFILE')");
    expect(storeSrc).toContain('api.upsertBusinessProfile(userId, act.payload).then(');
    // persist BEFORE reducer (same ordering as the S0B task branch)
    const branch = storeSrc.slice(storeSrc.indexOf("if (act.type === 'SAVE_BUSINESS_PROFILE')"));
    expect(branch.indexOf('api.upsertBusinessProfile')).toBeLessThan(branch.indexOf('setData((d) => reducer(d, act))'));
    expect(branch).toContain('await refetch()');           // authoritative restore on failure
    expect(branch.slice(0, 400)).toContain('{ ok: false }');
  });

  it('does NOT route SAVE_BUSINESS_PROFILE through the entity persist() switch', () => {
    const persistBody = storeSrc.slice(storeSrc.indexOf('function persist('), storeSrc.indexOf('const StoreCtx'));
    expect(persistBody).not.toContain('SAVE_BUSINESS_PROFILE');
  });
});
