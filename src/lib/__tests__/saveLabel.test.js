import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { saveLabel } from '../saveLabel.js';

// Client-save toast wording — the toast must reflect where the row actually
// went. Verified defect: a successful Supabase save (row provably in
// public.clients, survives refresh) still toasted "לקוח נוסף · נשמר מקומית".
// The repo has no jsdom, so per house pattern: unit-test the pure helper and
// source-pin the wiring.

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('saveLabel · persistence-source distinction (pure)', () => {
  it('supabase mode → "נשמר במערכת"; anything else → the local wording', () => {
    expect(saveLabel('supabase')).toBe('נשמר במערכת');
    expect(saveLabel('local')).toBe('נשמר מקומית');
    // defensive: unknown/absent mode must NEVER claim a server save
    for (const m of [undefined, null, '', 'demo', 'SUPABASE']) {
      expect(saveLabel(m), String(m)).toBe('נשמר מקומית');
    }
  });

  it('the store really exposes the mode this label keys on', () => {
    const store = read('../../store/store.jsx');
    expect(store.includes("mode: supabaseEnabled ? 'supabase' : 'local'")).toBe(true);
    // and supabaseEnabled is the real persistence switch, not a UI flag
    expect(store.includes('const supabaseEnabled = isSupabaseConfigured;')).toBe(true);
  });
});

describe('saveLabel · Clients page wiring (source pins)', () => {
  const clients = read('../../pages/Clients.jsx');

  it('both client-save toasts use saveLabel(mode); no hardcoded local wording remains', () => {
    expect(clients.includes("import { saveLabel } from '../lib/saveLabel.js';")).toBe(true);
    expect(clients.includes('const { data, dispatch, toast, mode } = useStore();')).toBe(true);
    expect(clients.includes('toast(`הלקוח עודכן · ${saveLabel(mode)}`)')).toBe(true);
    expect(clients.includes('toast(`לקוח נוסף · ${saveLabel(mode)}`)')).toBe(true);
    expect(clients.includes('נשמר מקומית')).toBe(false);
  });

  it('scope stays surgical: no API/persistence change, and unrelated pages are untouched', () => {
    // Clients.jsx still persists through the same dispatch actions
    expect(clients.includes("dispatch({ type: 'ADD_CLIENT', payload: client })")).toBe(true);
    expect(clients.includes("dispatch({ type: 'UPDATE_CLIENT', payload: client })")).toBe(true);
    // the helper itself is pure — no store/api/supabase imports
    const helper = read('../saveLabel.js');
    expect(/^import\b/m.test(helper)).toBe(false);
    // out-of-scope pages keep their existing wording (changing them is a
    // separate, deliberate pass — this fix is the client-save toast only)
    expect(read('../../pages/Finance.jsx').includes('נשמר מקומית')).toBe(true);
    expect(read('../../pages/Quotes.jsx').includes('נשמר מקומית')).toBe(true);
  });
});
