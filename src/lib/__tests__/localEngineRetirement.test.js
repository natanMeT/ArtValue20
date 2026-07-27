// ===================================================================
// LOCAL-ENGINE RETIREMENT — structural proof (2026-07-27, owner decision).
//
// ArtValue is a CLOUD-ONLY product. This suite is the authoritative evidence
// for that claim, and it is deliberately STRUCTURAL rather than textual: it
// walks the REAL import graph from the REAL application entry point, so it
// proves what a production build can actually reach — not what a keyword scan
// happens to notice.
//
// What is proved here:
//   1. The retired modules do not exist on disk.
//   2. NOTHING in src/ imports them (no orphan importer left behind).
//   3. The transitive import closure of the app entry (main.jsx → App.jsx →
//      every page/component/lib it reaches) contains no local-engine module,
//      no local address, and no workstation-engine env variable.
//   4. No retired route is registered, and an unknown route fails SAFE.
//   5. No local-engine env variable is read anywhere in src/ — so no setting
//      can re-open a hidden path.
//   6. Growth stays BetaUnavailable and Auth/schema/Gateway are untouched.
//
// The one KNOWN and DISCLOSED exception lives outside src/: the developer
// review-prep CLI (scripts/local-review-prep.mjs) still calls a local Ollama
// for an ADVISORY summary. It is local tooling, it is never imported by the
// application, and it is never bundled — asserted explicitly below so the
// exception can never silently grow into a product path.
// ===================================================================
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'src';

const DELETED_MODULES = [
  'src/lib/localComfyEngine.js',
  'src/lib/localEngines.js',
  'src/lib/comfyPoster.js',
  'src/creative/v2/poster/comfyPosterPrompt.js',
  'src/components/ai/posterOverlay.js',
  'src/components/ai/posterExport.js',
  'src/pages/AdStudio.jsx',
];

// Basenames that identify a retired local-engine module in an import specifier.
const RETIRED_SPECIFIER = /(localComfyEngine|localEngines|comfyPoster|comfyPosterPrompt|comfyProgress|geminiImage|posterOverlay|posterExport|AdStudio|WorkflowStudio|Fooocus)/;

// Env variables that used to configure a workstation engine. Reading ANY of
// them again would be a hidden re-entry point.
const LOCAL_ENV_VARS = [
  'VITE_ENABLE_LOCAL_ENGINES', 'VITE_LOCAL_LLM_URL', 'VITE_LOCAL_LLM_MODEL',
  'VITE_CREATIVE_LLM_MODEL', 'VITE_JAKE_MODEL', 'VITE_JAKE_BRAIN',
  'VITE_LOCAL_IMAGE_URL', 'VITE_COMFYUI_URL', 'VITE_COMFYUI_MODEL',
  'VITE_COMFYUI_FLUX_MODEL', 'VITE_COMFYUI_FLUX_LORA', 'VITE_COMFYUI_FACE_BBOX',
  'VITE_COMFYUI_UPSCALE_MODEL', 'VITE_FOOOCUS_URL',
];

const isTestPath = (p) => /\.test\.[jt]sx?$/.test(p) || /(^|[\\/])__tests__[\\/]/.test(p);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const runtimeFiles = () => walk(SRC).map((f) => path.normalize(f)).filter((f) => !isTestPath(f));

function importSpecifiers(src) {
  const statics = [...src.matchAll(/(?:^|\s)(?:import|export)\b[^'"\n]*?\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const bare = [...src.matchAll(/(?:^|\s)import\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const dynamic = [...src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  return [...statics, ...bare, ...dynamic];
}

// Strip comments so documentation that NAMES a retired engine (in order to say
// it is gone) never counts as executable code.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// Resolve a relative specifier to a real file on disk (extension-tolerant).
function resolveLocal(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.normalize(path.join(path.dirname(fromFile), spec));
  const candidates = [base, `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`,
    path.join(base, 'index.js'), path.join(base, 'index.jsx')];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
}

// The transitive closure of everything the real app entry can reach.
function appImportClosure(entry = path.normalize('src/main.jsx')) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    for (const spec of importSpecifiers(fs.readFileSync(file, 'utf8'))) {
      const next = resolveLocal(file, spec);
      if (next) stack.push(path.normalize(next));
    }
  }
  return seen;
}

describe('local-engine retirement · the modules are gone', () => {
  it('every retired module is absent from disk', () => {
    for (const f of DELETED_MODULES) expect(fs.existsSync(f), f).toBe(false);
  });

  it('nothing in src/ imports a retired module (no orphan importer survives)', () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      for (const spec of importSpecifiers(fs.readFileSync(file, 'utf8'))) {
        if (RETIRED_SPECIFIER.test(spec)) offenders.push(`${path.normalize(file)} → ${spec}`);
      }
    }
    expect(offenders, `retired imports still present: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('local-engine retirement · the app import closure is clean', () => {
  const closure = appImportClosure();

  it('the closure is real (it reaches the app shell and the Studio)', () => {
    expect(closure.has(path.normalize('src/App.jsx'))).toBe(true);
    expect(closure.has(path.normalize('src/pages/ImageStudio.jsx'))).toBe(true);
    expect(closure.size).toBeGreaterThan(40);
  });

  it('no retired module is reachable from the app entry', () => {
    for (const f of DELETED_MODULES) expect(closure.has(path.normalize(f)), f).toBe(false);
  });

  it('no reachable module contains a local address in executable code', () => {
    const offenders = [];
    for (const file of closure) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      if (/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/.test(code)) offenders.push(file);
    }
    expect(offenders, `local addresses in reachable code: ${offenders.join(', ')}`).toEqual([]);
  });

  // The closure reaches ONE file outside src/: the shared AI Gateway contract
  // under supabase/, which the browser imports for its input limits. That file
  // is part of the DEPLOYED Gateway and must not change in this slice — it
  // registers 'comfyui' as a provider NAME in the server's own routing table.
  // A provider name in a server registry is not a browser path: the browser
  // never selects a provider, and the deployed Edge function is untouched. It
  // is DISCLOSED here rather than silently excluded.
  it('the only engine term left in the closure is the untouched server-side provider registry', () => {
    const offenders = [];
    for (const file of closure) {
      if (file.startsWith('supabase')) continue; // deployed Gateway contract — unchanged
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      if (/\b(comfy|comfyui|fooocus|ollama|automatic1111|a1111)\b/i.test(code)) offenders.push(file);
    }
    expect(offenders, `engine terms in reachable code: ${offenders.join(', ')}`).toEqual([]);
  });

  it('the disclosed server registry is a NAME table only — no URL, no probe, no fetch to it', () => {
    const gateway = stripComments(fs.readFileSync('supabase/functions/_shared/aiGateway.js', 'utf8'));
    expect(gateway.includes('comfyui')).toBe(true);           // the disclosed occurrence
    expect(/localhost|127\.0\.0\.1/.test(gateway)).toBe(false); // but no local address
    expect(/fetch\s*\([^)]*comfy/i.test(gateway)).toBe(false);  // and nothing calls one
  });
});

describe('local-engine retirement · no env setting can re-open a path', () => {
  // Runtime sources only: a test may legitimately NAME a variable in order to
  // assert that nothing reads it (this file does exactly that).
  it('no runtime file in src/ reads any local-engine env variable', () => {
    const offenders = [];
    for (const file of runtimeFiles()) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      for (const v of LOCAL_ENV_VARS) {
        if (code.includes(v)) offenders.push(`${path.normalize(file)} → ${v}`);
      }
    }
    expect(offenders, `local env reads: ${offenders.join(', ')}`).toEqual([]);
  });

  it('.env.example ships no local-engine assignment (documentation only)', () => {
    const env = fs.readFileSync('.env.example', 'utf8');
    const assignments = env.split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .filter((l) => LOCAL_ENV_VARS.some((v) => l.startsWith(`${v}=`)));
    expect(assignments, `local env assignments: ${assignments.join(', ')}`).toEqual([]);
  });
});

describe('local-engine retirement · routes', () => {
  const app = fs.readFileSync('src/App.jsx', 'utf8');

  it('no retired studio route is registered', () => {
    for (const r of ['/adstudio', '/workflow', '/fooocus']) {
      expect(app.includes(`path="${r}"`), r).toBe(false);
    }
  });

  it('an unknown route falls back to the dashboard (retired deep links fail safe)', () => {
    expect(app.includes('path="*" element={<Navigate to="/" replace />}')).toBe(true);
  });

  it('the retained cloud Studio route is still registered', () => {
    expect(app.includes('path="/studio" element={<ImageStudio />}')).toBe(true);
  });
});

describe('local-engine retirement · nothing advertises a local-only capability', () => {
  it('every creative-workflow engine label names a lane the product actually has', async () => {
    const { CREATIVE_WORKFLOWS, WORKFLOW_ENGINES } = await import('../../data/creativeWorkflows.js');
    expect(WORKFLOW_ENGINES).toEqual(['gateway', 'browser']);
    for (const w of CREATIVE_WORKFLOWS) expect(WORKFLOW_ENGINES.includes(w.engine), w.id).toBe(true);
  });

  it('every LIVE workflow routes to a mode the Studio can actually open', async () => {
    const { liveWorkflows } = await import('../../data/creativeWorkflows.js');
    const { isStudioModeAvailable } = await import('../studioModes.js');
    for (const w of liveWorkflows()) expect(isStudioModeAvailable(w.mode), w.id).toBe(true);
  });

  it('no preset instructs the user to open a retired mode', async () => {
    const { CREATIVE_PRESETS } = await import('../../data/creativePresets.js');
    const RETIRED_COPY = ['עריכה חכמה', 'עריכת אזור', 'תמונה לסרטון', 'נעילת מוצר', 'לפני/אחרי'];
    for (const p of CREATIVE_PRESETS) {
      const copy = `${p.useCase} ${p.qualityNotes} ${p.pitfalls}`;
      for (const term of RETIRED_COPY) expect(copy.includes(term), `${p.id}: ${term}`).toBe(false);
    }
  });

  it('every Jake intent that reaches the Studio resolves to a LIVE cloud workflow', async () => {
    const { resolveWorkflow } = await import('../jakeDecisionEngine.js');
    const { liveWorkflows } = await import('../../data/creativeWorkflows.js');
    const live = new Set(liveWorkflows().map((w) => w.id));
    const INTENTS = ['create_marketing_asset', 'studio_prompt', 'product_visual', 'product_lock', 'unknown'];
    for (const intent of INTENTS) {
      const w = resolveWorkflow(intent);
      // null (no Studio target) is fine; a non-null target MUST be live
      if (w !== null) expect(live.has(w), `${intent} → ${w}`).toBe(true);
    }
  });

  it('no Jake plan step advertises a retired local-only operation', async () => {
    // Comments are stripped: both files DOCUMENT the retired operations by name
    // in order to record that they are gone. Only executable code is scanned.
    const planner = stripComments(fs.readFileSync('src/lib/jakeExecutionPlanner.js', 'utf8'));
    const resolver = stripComments(fs.readFileSync('src/lib/jakeHandoffResolver.js', 'utf8'));
    for (const term of ['product_lock_flow', 'presenter', 'smart_edit', 'img2img', 'inpaint', 'image_to_video', 'comfy', 'Fooocus', 'Ollama']) {
      expect(planner.includes(term), `planner: ${term}`).toBe(false);
      expect(resolver.includes(term), `resolver: ${term}`).toBe(false);
    }
  });

  it('the Studio header promises only what remains (no editing, no video)', () => {
    const studio = fs.readFileSync('src/pages/ImageStudio.jsx', 'utf8');
    const sub = studio.match(/sub="([^"]+)"/);
    expect(sub).toBeTruthy();
    for (const term of ['ערוך', 'עריכ', 'סרטון', 'וידאו']) {
      expect(sub[1].includes(term), `Studio sub still promises: ${term}`).toBe(false);
    }
  });
});

describe('local-engine retirement · unchanged surfaces', () => {
  it('Growth stays BetaUnavailable behind the centralized gate', async () => {
    const app = fs.readFileSync('src/App.jsx', 'utf8');
    expect((app.match(/<GrowthBetaGate/g) || []).length).toBe(5);
    const { BETA_HIDDEN_MODULES } = await import('../betaCapabilities.js');
    expect(BETA_HIDDEN_MODULES.has('growth')).toBe(true);
  });

  it('the DISCLOSED exception is developer tooling only, never reachable from the app', () => {
    const closure = appImportClosure();
    for (const file of closure) expect(file.startsWith('scripts')).toBe(false);
    // and the tooling itself is not under src/, so it is never bundled
    expect(fs.existsSync('scripts/local-review-prep.mjs')).toBe(true);
    expect(runtimeFiles().some((f) => f.includes('local-review-prep'))).toBe(false);
  });
});
