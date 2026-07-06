import { describe, it, expect } from 'vitest';
import {
  CREATIVE_WORKFLOWS, WORKFLOW_ENGINES, WORKFLOW_STATUSES, ENGINE_LABEL,
  CONSENT_NOTE, liveWorkflows, soonWorkflows,
} from '../creativeWorkflows.js';

// ===================================================================
// Creative Workflow Map — pure data-integrity coverage. No component
// render, no routing, no ComfyUI, no generation.
// ===================================================================

// The existing ImageStudio MODES ids a live card may activate.
const VALID_MODES = ['text', 'img2img', 'inpaint', 'video', 'flf', 'presenter', 'lock', 'character', 'album'];
// Existing hash routes a live card may link to.
const VALID_ROUTES = ['#/workflow', '#/fooocus'];
const REQUIRED_FIELDS = ['id', 'title', 'subtitle', 'description', 'engine', 'status', 'category', 'cta', 'tags'];

describe('creativeWorkflows · structure', () => {
  it('ids are unique', () => {
    const ids = CREATIVE_WORKFLOWS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every workflow has the required fields', () => {
    for (const w of CREATIVE_WORKFLOWS) {
      for (const f of REQUIRED_FIELDS) {
        expect(w[f], `${w.id}.${f}`).toBeDefined();
      }
      expect(typeof w.title).toBe('string');
      expect(w.title.length).toBeGreaterThan(0);
      expect(Array.isArray(w.tags)).toBe(true);
      expect(w.tags.length).toBeGreaterThan(0);
    }
  });

  it('engine is a valid enum with a label', () => {
    for (const w of CREATIVE_WORKFLOWS) {
      expect(WORKFLOW_ENGINES).toContain(w.engine);
      expect(typeof ENGINE_LABEL[w.engine]).toBe('string');
    }
  });

  it('status is a valid enum', () => {
    for (const w of CREATIVE_WORKFLOWS) {
      expect(WORKFLOW_STATUSES).toContain(w.status);
    }
  });
});

describe('creativeWorkflows · live vs soon targeting', () => {
  it('every live workflow has a valid mode OR a valid route (never both null)', () => {
    for (const w of liveWorkflows()) {
      const hasMode = VALID_MODES.includes(w.mode);
      const hasRoute = VALID_ROUTES.includes(w.route);
      expect(hasMode || hasRoute, `${w.id} must target a mode or route`).toBe(true);
      // never both — a card is either an in-page mode or an external route
      expect(hasMode && hasRoute).toBe(false);
    }
  });

  it('soon workflows never expose a runtime mode or route (cannot start generation)', () => {
    for (const w of soonWorkflows()) {
      expect(w.mode == null).toBe(true);
      expect(w.route == null).toBe(true);
    }
  });

  it('a live card that uses a mode declares a mode from the real MODES set', () => {
    for (const w of liveWorkflows()) {
      if (w.mode != null) expect(VALID_MODES).toContain(w.mode);
    }
  });
});

describe('creativeWorkflows · specific cards', () => {
  const byId = (id) => CREATIVE_WORKFLOWS.find((w) => w.id === id);

  it('Product Presenter is LIVE with the presenter mode (no route)', () => {
    const pp = byId('product-presenter');
    expect(pp).toBeTruthy();
    expect(pp.status).toBe('live');
    expect(pp.mode).toBe('presenter');
    expect(pp.route).toBeNull();
    expect(pp.engine).toBe('comfyui');
    // not accidentally still listed as coming soon
    expect(soonWorkflows().some((w) => w.id === 'product-presenter')).toBe(false);
  });

  it('Product Lock is LIVE, browser-engine, with the lock mode (no route)', () => {
    const pl = byId('product-lock');
    expect(pl).toBeTruthy();
    expect(pl.status).toBe('live');
    expect(pl.mode).toBe('lock');
    expect(pl.route).toBeNull();
    expect(pl.engine).toBe('browser');
    expect(pl.consent).toBe(true);
  });

  it('Jewelry / Outfit / Identity Pack remain soon', () => {
    for (const id of ['jewelry-composer', 'outfit-change', 'identity-pack']) {
      expect(byId(id), id).toBeTruthy();
      expect(byId(id).status).toBe('soon');
    }
  });

  it('Fooocus card links to #/fooocus and uses the fooocus engine', () => {
    expect(byId('fooocus').route).toBe('#/fooocus');
    expect(byId('fooocus').engine).toBe('fooocus');
  });

  it('Workflow Studio card links to #/workflow', () => {
    expect(byId('workflow-studio').route).toBe('#/workflow');
    expect(byId('workflow-studio').engine).toBe('comfyui');
  });

  it('exposes the consent note on presenter/reference workflows', () => {
    expect(CONSENT_NOTE).toContain('הרשאה');
    for (const id of ['character-series', 'model-album', 'product-presenter', 'jewelry-composer']) {
      expect(byId(id).consent, id).toBe(true);
    }
  });
});

describe('creativeWorkflows · safety', () => {
  it('no forbidden / unsafe copy in any card', () => {
    const FORBIDDEN = ['nude', 'nsfw', 'explicit', 'deepfake', 'עירום', 'פורנו'];
    const blob = JSON.stringify(CREATIVE_WORKFLOWS).toLowerCase();
    for (const bad of FORBIDDEN) expect(blob.includes(bad.toLowerCase())).toBe(false);
  });

  it('live/soon selectors partition the catalog', () => {
    expect(liveWorkflows().length + soonWorkflows().length).toBe(CREATIVE_WORKFLOWS.length);
    expect(liveWorkflows().length).toBeGreaterThan(0);
    expect(soonWorkflows().length).toBeGreaterThan(0);
  });
});
