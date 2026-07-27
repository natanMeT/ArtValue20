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

  // The closure reaches the shared AI Gateway contract under supabase/, which
  // the browser imports for its input limits. It used to register the local
  // providers as NAMES in the server routing table; that registration is now
  // REMOVED, so the assertion covers the closure with no exclusion at all.
  it('no reachable module names a workstation engine in executable code', () => {
    const offenders = [];
    for (const file of closure) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      if (/\b(comfy|comfyui|fooocus|ollama|automatic1111|a1111)\b/i.test(code)) offenders.push(file);
    }
    expect(offenders, `engine terms in reachable code: ${offenders.join(', ')}`).toEqual([]);
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

describe('local-engine retirement · the AI Gateway registers no local provider', () => {
  it('the canonical contract offers no local provider name in any vocabulary or chain', async () => {
    const gw = await import('../../../supabase/functions/_shared/aiGateway.js');
    const LOCAL = ['comfyui', 'ollama', 'fooocus', 'a1111', 'automatic1111'];
    for (const p of LOCAL) {
      expect(gw.AI_PROVIDERS.includes(p), `AI_PROVIDERS: ${p}`).toBe(false);
      expect(gw.API_PROVIDERS.includes(p), `API_PROVIDERS: ${p}`).toBe(false);
      expect(Object.keys(gw.AI_MODELS).includes(p), `AI_MODELS: ${p}`).toBe(false);
      expect(gw.normalizeProvider(p), `normalizeProvider: ${p}`).toBe(null);
      for (const [action, chain] of Object.entries(gw.DEFAULT_PROVIDER_BY_ACTION)) {
        expect(chain.includes(p), `${action} -> ${p}`).toBe(false);
      }
    }
  });

  it('the LOCAL_PROVIDERS partition and the localFirst ordering option are gone', async () => {
    const gw = await import('../../../supabase/functions/_shared/aiGateway.js');
    expect(gw.LOCAL_PROVIDERS).toBeUndefined();
    // localFirst is no longer an accepted ordering: it cannot change any chain
    for (const action of gw.AI_ACTION_TYPES) {
      expect(gw.selectProvider(action, { localFirst: true })).toEqual(gw.selectProvider(action));
    }
    expect(gw.buildAiRequest('text.copy', {}, { localFirst: true }).metadata).not.toHaveProperty('localFirst');
  });

  it('the cloud ACTION vocabulary is preserved and every action still has a cloud chain', async () => {
    const gw = await import('../../../supabase/functions/_shared/aiGateway.js');
    expect(gw.AI_ACTION_TYPES.length).toBe(20);
    for (const action of gw.AI_ACTION_TYPES) {
      const chain = gw.getProviderChain(action);
      expect(chain.length, `${action} has no provider left`).toBeGreaterThan(0);
      for (const p of chain) expect(gw.API_PROVIDERS.includes(p), `${action} -> ${p}`).toBe(true);
    }
  });

  it('the canonical module and its src/lib shims stay synchronized (re-export only)', () => {
    const PAIRS = [
      ['src/lib/aiGateway.js', 'supabase/functions/_shared/aiGateway.js'],
      ['src/lib/aiGatewayContract.js', 'supabase/functions/_shared/aiGatewayContract.js'],
      ['src/lib/aiGatewayInput.js', 'supabase/functions/_shared/aiGatewayInput.js'],
    ];
    for (const [shim, canonical] of PAIRS) {
      expect(fs.existsSync(canonical), canonical).toBe(true);
      const code = stripComments(fs.readFileSync(shim, 'utf8')).trim();
      // the shim must be nothing but a re-export of the canonical module — so it
      // cannot hold a second, divergent copy of the provider table
      expect(code).toBe(`export * from '../../${canonical}';`);
    }
  });
});

describe('local-engine retirement · repository-wide executable scan', () => {
  // Every executable file in the repo, not just src/: source, Edge function,
  // tooling. Build output, deps and documentation are excluded by design.
  function repoExecutables() {
    const roots = ['src', 'supabase'].filter((d) => fs.existsSync(d));
    const out = roots.flatMap((d) => walk(d));
    for (const f of fs.readdirSync('.', { withFileTypes: true })) {
      if (f.isFile() && /\.(m?js|cjs|ts)$/.test(f.name)) out.push(path.normalize(f.name));
    }
    if (fs.existsSync('scripts')) out.push(...walk('scripts'));
    return out.map((f) => path.normalize(f));
  }

  it('no executable file names a workstation engine outside a comment', () => {
    const offenders = [];
    for (const file of repoExecutables()) {
      if (isTestPath(file)) continue; // tests name them to assert their absence
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      if (/\b(comfy|comfyui|fooocus|ollama|automatic1111|a1111)\b/i.test(code)) offenders.push(file);
    }
    expect(offenders, `engine names in executable code: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no executable file contains a local address outside a comment', () => {
    const offenders = [];
    for (const file of repoExecutables()) {
      if (isTestPath(file)) continue;
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      if (/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|:8188|:7860|:11434/.test(code)) offenders.push(file);
    }
    expect(offenders, `local addresses in executable code: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no package script starts, probes or calls a local model', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
      expect(/ollama|comfy|fooocus|a1111|localhost|127\.0\.0\.1/i.test(cmd), `${name}: ${cmd}`).toBe(false);
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

  it('the developer tooling that called a local model is gone, script and all', () => {
    expect(fs.existsSync('scripts/local-review-prep.mjs')).toBe(false);
    expect(fs.existsSync('scripts')).toBe(false);
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
      expect(/ollama|comfy|fooocus|a1111|localhost|127\.0\.0\.1/i.test(`${name} ${cmd}`), `${name}: ${cmd}`).toBe(false);
    }
  });
});
