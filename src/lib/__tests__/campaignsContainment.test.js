import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NAV_SECTIONS, SIDEBAR_ROUTE_ITEMS, visibleNavSections } from '../../components/layout/sidebarNav.js';

// ===================================================================
// Campaigns slice 1 — cloud-only containment, route wiring, and the naming
// boundary against the device-local creative session.
//
// There is no DOM renderer in this repo, so the page-level rules are pinned
// against the source text (the demoModeContainment.test.js precedent).
// ===================================================================

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const page = read('../../pages/Campaigns.jsx');
const lib = read('../campaigns.js');
const api = read('../api.js');
const app = read('../../App.jsx');

// Statements only. A "must not contain X" scan run over the whole file matches
// the comment that EXPLAINS why X is absent — measured here: the page's own
// header, which documents that it uses no localStorage and deliberately avoids
// the BetaUnavailable copy, failed both scans. A checker that cannot tell live
// code from prose about the code is not a checker. (Same rule as the SQL test.)
//
// ORDER MATTERS, measured: block comments must be stripped AFTER line comments,
// not before. A line comment here contains the glob `src/creative/v2/**`, whose
// `/*` opens a block-comment match that then runs to the next `*/` — the JSX
// comment far below — swallowing the component and its copy. Stripping `//`
// lines first removes that false opener.
const strip = (src) => src
  .split('\n').filter((l) => !l.trim().startsWith('//'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '\n');

const pageCode = strip(page);
const libCode = strip(lib);
const apiCode = strip(api);

describe('route + nav wiring', () => {
  it('registers /campaigns in App.jsx', () => {
    expect(app).toContain('path="/campaigns"');
  });

  it('does NOT wrap the route in GrowthBetaGate — the module IS durable in cloud', () => {
    const line = app.split('\n').find((l) => l.includes('path="/campaigns"')) || '';
    expect(line).not.toContain('GrowthBetaGate');
    expect(line).not.toContain('BetaUnavailable');
  });

  it('adds exactly ONE nav item, and it points at a route registered in App.jsx', () => {
    const items = SIDEBAR_ROUTE_ITEMS.filter((i) => i.to === '/campaigns');
    expect(items).toHaveLength(1);
    expect(app).toContain(`path="${items[0].to}"`);
    expect(items[0].cloudOnly).toBe(true);
    expect(items[0].betaHidden).toBeUndefined();
  });

  it('every OTHER nav item is untouched by the new flag', () => {
    const flagged = SIDEBAR_ROUTE_ITEMS.filter((i) => i.cloudOnly);
    expect(flagged.map((i) => i.to)).toEqual(['/campaigns']);
  });
});

describe('cloudOnly is the inverse of betaHidden', () => {
  const inCloud = visibleNavSections(true).flatMap((s) => s.items).map((i) => i.to);
  const inLocal = visibleNavSections(false).flatMap((s) => s.items).map((i) => i.to);

  it('shows Campaigns in cloud mode and hides it in the local demo', () => {
    expect(inCloud).toContain('/campaigns');
    expect(inLocal).not.toContain('/campaigns');
  });

  // NEGATIVE CONTROL for the flag rewrite: the S0A behaviour must be unchanged.
  // Without this, a `visibleNavSections` that ignored betaHidden would still
  // pass the test above.
  it('still hides every betaHidden item in cloud and shows them locally (S0A intact)', () => {
    const betaHidden = SIDEBAR_ROUTE_ITEMS.filter((i) => i.betaHidden).map((i) => i.to);
    expect(betaHidden.length).toBeGreaterThan(0);
    for (const to of betaHidden) {
      expect(inCloud, `${to} must stay hidden in cloud`).not.toContain(to);
      expect(inLocal, `${to} must stay visible locally`).toContain(to);
    }
  });

  it('drops no unflagged item in either mode', () => {
    const plain = SIDEBAR_ROUTE_ITEMS.filter((i) => !i.betaHidden && !i.cloudOnly).map((i) => i.to);
    for (const to of plain) {
      expect(inCloud).toContain(to);
      expect(inLocal).toContain(to);
    }
  });

  it('never emits an empty section', () => {
    for (const mode of [true, false]) {
      for (const s of visibleNavSections(mode)) expect(s.items.length).toBeGreaterThan(0);
    }
    expect(NAV_SECTIONS.length).toBeGreaterThan(0);
  });
});

describe('local/demo mode shows an unavailable state, never a form', () => {
  it('returns the unavailable component before any form can render', () => {
    expect(page).toContain('if (!isSupabaseConfigured) return <LocalUnavailable />;');
    // the guard must sit ABOVE the form markup, not merely somewhere in the file
    expect(page.indexOf('if (!isSupabaseConfigured) return <LocalUnavailable />;'))
      .toBeLessThan(page.indexOf('<form'));
  });

  it('does not reuse the false "not yet in the beta" copy — Campaigns ARE in the beta', () => {
    expect(pageCode).not.toContain('BetaUnavailable');
    expect(pageCode).not.toContain('BETA_MESSAGES');
    expect(pageCode).toContain('זמין רק בחשבון בענן');
  });

  it('never writes anywhere but the cloud — no localStorage/IndexedDB fallback', () => {
    for (const forbidden of ['localStorage', 'indexedDB', 'sessionStorage']) {
      expect(pageCode, `page must not use ${forbidden}`).not.toContain(forbidden);
      expect(libCode, `lib must not use ${forbidden}`).not.toContain(forbidden);
    }
  });

  // POSITIVE CONTROL for the comment stripper: prove it actually removes prose,
  // otherwise the two scans above could be passing because they are pointed at
  // an empty string.
  it('the comment stripper removes prose but keeps code', () => {
    expect(page).toContain('BetaUnavailable');      // present, in a comment
    expect(pageCode).not.toContain('BetaUnavailable');
    expect(pageCode).toContain('export default function Campaigns');
    expect(pageCode.length).toBeGreaterThan(page.length / 2);
  });

  it('loads only in cloud mode', () => {
    expect(page).toContain('if (isSupabaseConfigured) load()');
  });
});

describe('naming boundary — business campaign ≠ creative session', () => {
  it('neither the page nor the lib imports from src/creative/v2/**', () => {
    for (const [name, src] of [['page', pageCode], ['lib', libCode]]) {
      expect(src, `${name} must not import creative/v2`).not.toMatch(/from\s+['"][^'"]*creative\/v2/);
      expect(src, `${name} must not name campaignStore as a dependency`).not.toMatch(/import[^;]*campaignStore/);
    }
  });

  it('does not read the device-local creative-session storage key', () => {
    for (const src of [pageCode, libCode, apiCode]) {
      expect(src).not.toContain('artvalue_creative_campaigns_v1');
      expect(src).not.toContain('artvalue_production_packages_v1');
    }
  });

  it('states the boundary in the source, so the next reader cannot miss it', () => {
    expect(lib).toContain('NAMING BOUNDARY');
    expect(page).toContain('NAMING BOUNDARY');
    expect(lib).toContain('campaignStore.js');
  });
});

describe('the client never claims authority it does not have', () => {
  it('documents every client rule as a mirror of a server rule', () => {
    expect(lib).toContain('ADVISORY');
    expect(lib).toContain('The server is');
    expect(lib).toContain('This file never decides that a write succeeded.');
  });

  it('re-reads from the server after every write instead of updating optimistically', () => {
    // `run()` is the single write path: call, then load(), then toast.
    expect(page).toMatch(/await fn\(\);\s*\n\s*await load\(\);/);
  });

  it('routes every status change through the single transition entry point', () => {
    expect(apiCode).toContain('export async function setCampaignStatus');
    // updateCampaign must not smuggle a status change past canTransition
    const upd = apiCode.slice(apiCode.indexOf('export async function updateCampaign'), apiCode.indexOf('export async function setCampaignStatus'));
    expect(upd).not.toContain('status:');
  });

  it('pre-refuses over quota with a truthful message but lets the server decide', () => {
    expect(apiCode).toContain('canCreateWithin');
    const create = apiCode.slice(apiCode.indexOf('export async function createCampaign'), apiCode.indexOf('export async function updateCampaign'));
    expect(create).toContain('userSafe = true');
  });
});
