// ===================================================================
// M2 J3C S1.1 — Truthful sidebar data status (source pins).
//
// The sidebar footer pill used to hardcode "מצב הדגמה — דאטה מקומית"
// even in authenticated Supabase production. It now keys on
// isSupabaseConfigured (build-time constant from src/lib/supabase.js):
//   configured   → "נתונים בענן"
//   unconfigured → "מצב הדגמה — דאטה מקומית"
// Non-clickable, no health check, no network call, no provider/model name.
// ===================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const sidebar = read('../Sidebar.jsx');

describe('S1.1 · sidebar footer status keys on the Supabase transport', () => {
  it('imports and uses isSupabaseConfigured from the frozen supabase module', () => {
    expect(sidebar.includes("import { isSupabaseConfigured } from '../../lib/supabase.js';")).toBe(true);
  });

  it('renders the exact configured / unconfigured texts inside the existing pill structure', () => {
    expect(sidebar.includes(`{isSupabaseConfigured ? 'נתונים בענן' : 'מצב הדגמה — דאטה מקומית'}`)).toBe(true);
    // the visual structure/classes are unchanged
    expect(sidebar.includes('className="demo-pill"')).toBe(true);
    expect(sidebar.includes('className="demo-dot"')).toBe(true);
  });

  it('the pill stays non-clickable and adds no state, tooltip, or handler', () => {
    const start = sidebar.indexOf('<div className="demo-pill"');
    expect(start).toBeGreaterThan(-1);
    const snippet = sidebar.slice(start, sidebar.indexOf('</div>', start) + 6);
    for (const banned of ['onClick', '<button', 'title=', 'useState', 'useEffect']) {
      expect(snippet.includes(banned), banned).toBe(false);
    }
  });

  it('no network call, health check, or provider/model text anywhere in Sidebar', () => {
    for (const banned of [
      'fetch(', 'XMLHttpRequest', 'WebSocket', 'checkLocalEngine', 'localhost', '127.0.0.1',
      'gemini', 'Gemini', 'Ollama', 'aiGateway', 'callAiGateway', 'localStorage',
    ]) {
      expect(sidebar.includes(banned), banned).toBe(false);
    }
    // the only import added by this slice is the boolean flag — no supabase client use
    expect(/\bsupabase\.(from|auth|functions|storage)/.test(sidebar)).toBe(false);
    // import + footer-pill render read + S0A beta-nav gate (visibleNavSections(isSupabaseConfigured)).
    // All three are pure build-time constant reads — still no network/health check.
    expect((sidebar.match(/isSupabaseConfigured/g) || []).length).toBe(3);
  });
});
