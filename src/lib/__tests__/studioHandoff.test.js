import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  STUDIO_HANDOFF_SOURCE, STUDIO_HANDOFF_TARGET, workflowIdToMode, readStudioHandoff,
} from '../studioHandoff.js';
import { soonWorkflows } from '../../data/creativeWorkflows.js';

// ===================================================================
// studioHandoff — pure validation + workflow→mode mapping for a Jake
// router-state handoff. No DOM, no generation, no storage, no events.
// Plus source-level pins on the ImageStudio integration.
// ===================================================================

const validState = (over = {}) => ({
  jakeHandoff: { source: 'jake', target: 'studio', workflow: 'fast-image', prompt: 'a poster about CRM', ...over },
});

describe('exports', () => {
  it('exposes the source/target constants and both helpers', () => {
    expect(STUDIO_HANDOFF_SOURCE).toBe('jake');
    expect(STUDIO_HANDOFF_TARGET).toBe('studio');
    expect(typeof workflowIdToMode).toBe('function');
    expect(typeof readStudioHandoff).toBe('function');
  });
});

describe('workflowIdToMode', () => {
  it('maps the live studio workflows to their modes', () => {
    expect(workflowIdToMode('fast-image')).toBe('text');
    expect(workflowIdToMode('product-lock')).toBe('lock');
  });

  it('a RETIRED local workflow maps to no mode at all', () => {
    // PRODUCT BOUNDARY (2026-07-27): these cards left the catalog with their
    // engines, so a hand-off naming one carries no mode. The prompt still
    // prefills; the Studio stays on a mode that exists.
    for (const retired of ['product-presenter', 'smart-edit', 'area-edit', 'image-to-video', 'before-after', 'character-series', 'model-album']) {
      expect(workflowIdToMode(retired), retired).toBeNull();
    }
  });

  it('returns null for unknown / missing / hostile ids', () => {
    expect(workflowIdToMode('nope')).toBeNull();
    expect(workflowIdToMode('')).toBeNull();
    expect(workflowIdToMode(null)).toBeNull();
    expect(workflowIdToMode(undefined)).toBeNull();
    expect(workflowIdToMode(42)).toBeNull();
    expect(workflowIdToMode({})).toBeNull();
  });

  it('never maps a soon/deferred workflow', () => {
    for (const w of soonWorkflows()) {
      expect(workflowIdToMode(w.id), w.id).toBeNull();
    }
  });
});

describe('readStudioHandoff · valid payloads', () => {
  it('fast-image handoff → { prompt, mode: text }', () => {
    expect(readStudioHandoff(validState())).toEqual({ prompt: 'a poster about CRM', mode: 'text' });
  });

  it('a retired-workflow handoff keeps the prompt and carries NO mode', () => {
    const r = readStudioHandoff(validState({ workflow: 'product-presenter' }));
    expect(r.prompt).toBe('a poster about CRM');
    expect(r.mode).toBeNull();
  });

  it('product-lock handoff → mode lock', () => {
    expect(readStudioHandoff(validState({ workflow: 'product-lock' })).mode).toBe('lock');
  });

  it('unknown/missing workflow → prompt kept, mode null (safe partial)', () => {
    expect(readStudioHandoff(validState({ workflow: 'mystery' }))).toEqual({ prompt: 'a poster about CRM', mode: null });
    const noWf = validState(); delete noWf.jakeHandoff.workflow;
    expect(readStudioHandoff(noWf)).toEqual({ prompt: 'a poster about CRM', mode: null });
  });
});

describe('readStudioHandoff · rejected payloads → null', () => {
  it('wrong source', () => {
    expect(readStudioHandoff(validState({ source: 'evil' }))).toBeNull();
  });
  it('wrong target', () => {
    expect(readStudioHandoff(validState({ target: 'growth' }))).toBeNull();
  });
  it('missing / empty / whitespace / non-string prompt', () => {
    const missing = validState(); delete missing.jakeHandoff.prompt;
    expect(readStudioHandoff(missing)).toBeNull();
    expect(readStudioHandoff(validState({ prompt: '' }))).toBeNull();
    expect(readStudioHandoff(validState({ prompt: '   ' }))).toBeNull();
    expect(readStudioHandoff(validState({ prompt: 42 }))).toBeNull();
  });
  it('no jakeHandoff / malformed handoff', () => {
    expect(readStudioHandoff({})).toBeNull();
    expect(readStudioHandoff({ jakeHandoff: null })).toBeNull();
    expect(readStudioHandoff({ jakeHandoff: 'x' })).toBeNull();
    expect(readStudioHandoff({ jakeHandoff: [] })).toBeNull();
  });
  it('hostile / non-object location state never throws', () => {
    for (const bad of [null, undefined, 42, 'str', [], NaN, true]) {
      expect(() => readStudioHandoff(bad)).not.toThrow();
      expect(readStudioHandoff(bad)).toBeNull();
    }
  });
});

describe('determinism', () => {
  it('repeated calls deep-equal', () => {
    expect(readStudioHandoff(validState())).toEqual(readStudioHandoff(validState()));
    expect(workflowIdToMode('product-lock')).toBe(workflowIdToMode('product-lock'));
  });
});

describe('purity · studioHandoff source', () => {
  it('imports only creativeWorkflows and touches no impure/execution API', () => {
    const code = readFileSync(fileURLToPath(new URL('../studioHandoff.js', import.meta.url)), 'utf8');
    const importLines = code.split('\n').filter((l) => /^\s*import\b/.test(l));
    expect(importLines.length).toBe(1);
    expect(importLines[0]).toMatch(/from '\.\.\/data\/creativeWorkflows\.js'/);
    const codeOnly = code
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    for (const banned of ['Date.now(', 'Math.random(', 'window.', 'fetch(', 'localStorage', 'sessionStorage', 'dispatchEvent', 'CustomEvent', 'jake:ask', 'askJake', 'navigate', 'useNavigate', 'useSearchParams', 'URLSearchParams']) {
      expect(codeOnly.includes(banned), banned).toBe(false);
    }
  });
});

describe('ImageStudio integration · source-level', () => {
  const studio = readFileSync(fileURLToPath(new URL('../../pages/ImageStudio.jsx', import.meta.url)), 'utf8');

  it('imports useLocation and readStudioHandoff', () => {
    expect(studio).toMatch(/import\s*\{\s*useLocation\s*\}\s*from\s*'react-router-dom'/);
    expect(studio).toMatch(/import\s*\{\s*readStudioHandoff\s*\}\s*from\s*'[^']*lib\/studioHandoff\.js'/);
  });

  it('reads the handoff through readStudioHandoff(location.state)', () => {
    expect(studio).toContain('readStudioHandoff(location.state)');
  });

  it('the prefill effect contains NO generation call', () => {
    // isolate the prefill effect body (comment marker → its `}, [location.key]);`)
    const start = studio.indexOf('Jake handoff prefill');
    expect(start).toBeGreaterThan(-1);
    const effect = studio.slice(start, studio.indexOf('}, [location.key]);', start));
    for (const gen of ['run(', 'onCta(', 'buildLockComposite(']) {
      expect(effect.includes(gen), gen).toBe(false);
    }
    // and it does not navigate / clear state
    expect(effect.includes('navigate')).toBe(false);
    expect(effect.includes('window.')).toBe(false);
  });

  it('generation call sites remain click-bound', () => {
    expect(studio).toContain('onClick={onCta}');
  });

  it('this slice added no storage / events / query parsing', () => {
    for (const banned of ['localStorage', 'sessionStorage', 'dispatchEvent', 'CustomEvent', 'URLSearchParams', 'useSearchParams', 'useNavigate']) {
      expect(studio.includes(banned), banned).toBe(false);
    }
  });
});
