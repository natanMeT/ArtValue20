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
// There is NO remaining exception. The developer review-prep CLI that used to
// call a local Ollama (scripts/local-review-prep.mjs) has been DELETED together
// with the whole scripts/ directory, and the AI Gateway no longer registers a
// local provider — both are asserted below as ABSENCE, not as an allowance.
//
// The scanning primitives live in ./support/sourceScan.js so the NEGATIVE
// CONTROLS at the bottom exercise the EXACT code these assertions run. Two
// Codex findings on `1361a84` are why they exist: a regex comment stripper that
// ate the `//` inside URL string literals, and a walker that only recognised
// `.mjs`/`.cjs` at the repository root.
// ===================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  collectModules, isModuleFile, MODULE_EXTENSIONS,
  executableSource, executableSourceOf, parserOptionsFor, UnparseableSourceError,
  namesEngine, hasLocalAddress,
} from './support/sourceScan.js';

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

// Recursive collection of EVERY executable module extension (incl. .mjs/.cjs at
// any depth) is owned by support/sourceScan.js and shared with the controls.
const walk = collectModules;

const runtimeFiles = () => walk(SRC).filter((f) => !isTestPath(f));

function importSpecifiers(src) {
  const statics = [...src.matchAll(/(?:^|\s)(?:import|export)\b[^'"\n]*?\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const bare = [...src.matchAll(/(?:^|\s)import\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const dynamic = [...src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  return [...statics, ...bare, ...dynamic];
}

// `executableSourceOf` (imported above) parses a file with @babel/parser and
// blanks ONLY the byte ranges the parser reports as comments. Documentation that
// NAMES a retired engine — in order to record that it is gone — therefore never
// counts as executable code, while strings, template literals, JSX text and
// regex literals survive byte-for-byte. See its module header for the four
// hand-written-lexer defects that made a real parser mandatory.

// Resolve a relative specifier to a real EXECUTABLE module on disk.
// Non-module assets a component legitimately imports (`./styles/app.css`, an
// image, a .json) are deliberately NOT resolved: they are not executable code,
// they carry no import graph, and handing one to the parser would raise the
// loud UnparseableSourceError this suite reserves for genuinely broken source.
function resolveLocal(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.normalize(path.join(path.dirname(fromFile), spec));
  const candidates = [base, ...MODULE_EXTENSIONS.map((e) => `${base}${e}`),
    path.join(base, 'index.js'), path.join(base, 'index.jsx'), path.join(base, 'index.mjs')];
  const hit = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
  return hit && isModuleFile(hit) ? hit : null;
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
      const code = executableSourceOf(file);
      if (hasLocalAddress(code)) offenders.push(file);
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
      const code = executableSourceOf(file);
      if (namesEngine(code)) offenders.push(file);
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
      const code = executableSourceOf(file);
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
    const planner = executableSourceOf('src/lib/jakeExecutionPlanner.js');
    const resolver = executableSourceOf('src/lib/jakeHandoffResolver.js');
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
      const code = executableSourceOf(shim).trim();
      // the shim must be nothing but a re-export of the canonical module — so it
      // cannot hold a second, divergent copy of the provider table
      expect(code).toBe(`export * from '../../${canonical}';`);
    }
  });
});

describe('local-engine retirement · repository-wide executable scan', () => {
  // Every executable file in the repo, not just src/: source, Edge function,
  // tooling. Build output, deps and documentation are excluded by design.
  // Every root is walked RECURSIVELY with the same full extension set, so a
  // nested `src/tool.mjs`, `supabase/functions/tool.mjs` or tooling `.cjs`
  // cannot sit outside the scan (Codex P2 on `1361a84`).
  function repoExecutables() {
    const out = ['src', 'supabase', 'scripts'].flatMap((d) => collectModules(d));
    for (const f of fs.readdirSync('.', { withFileTypes: true })) {
      if (f.isFile() && isModuleFile(f.name)) out.push(path.normalize(f.name));
    }
    return out;
  }

  it('no executable file names a workstation engine outside a comment', () => {
    const offenders = [];
    for (const file of repoExecutables()) {
      if (isTestPath(file)) continue; // tests name them to assert their absence
      const code = executableSourceOf(file);
      if (namesEngine(code)) offenders.push(file);
    }
    expect(offenders, `engine names in executable code: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no executable file contains a local address outside a comment', () => {
    const offenders = [];
    for (const file of repoExecutables()) {
      if (isTestPath(file)) continue;
      const code = executableSourceOf(file);
      if (hasLocalAddress(code)) offenders.push(file);
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

// ===================================================================
// NEGATIVE CONTROLS — prove the gate CATCHES what it is supposed to catch.
//
// Every assertion above is a "nothing found" assertion. On its own that is weak
// evidence: a scan that silently cannot find anything looks identical to one
// that found nothing. Codex proved that four times against the hand-written
// lexer this proof used to carry — each break was a SILENT MISS.
//
// The lexer is gone. `executableSource` now parses with @babel/parser and blanks
// only the parser's own comment ranges, so there is no grammar approximation
// left to get wrong. These controls plant each historical bypass — including
// Codex's three exact reproductions — and require the SHARED primitive the
// assertions above call to report it.
// ===================================================================

describe('negative control · parser-backed comment removal, Codex exact reproductions', () => {
  // Each entry is a VERBATIM reproduction from the review of `b6fbd04`.
  const REPRODUCTIONS = [
    [
      'local URL in unquoted JSX text',
      'export const C = () => <p>Open http://127.0.0.1:8188/prompt</p>;',
      'Component.jsx',
    ],
    [
      'nested template whose substitution holds an object literal and a nested template',
      'const u = `${({}).x ? `http://127.0.0.1:8188/prompt` : ``}`;',
      'nested.js',
    ],
    [
      'regex after `return`, with a forbidden URL later on the SAME line',
      "function f(){ return /it's fine/; fetch('http://127.0.0.1:8188/prompt'); }",
      'afterReturn.js',
    ],
  ];

  it.each(REPRODUCTIONS)('detects the address in: %s', (_label, source, filename) => {
    const code = executableSource(source, filename);
    expect(code, 'the literal must survive parsing intact').toContain('127.0.0.1:8188');
    expect(hasLocalAddress(code), `bypassed: ${JSON.stringify(code)}`).toBe(true);
  });

  // Control-flow contexts are their own class: a regex may legally open after
  // `return`, `typeof`, `case`, `&&`, `,`, `(` and `[`. A character-level guess
  // misreads these as division, and the regex body then corrupts the scan.
  const REGEX_CONTEXTS = [
    ["function f(){ return /a'b/; fetch('http://127.0.0.1:8188/x'); }", 'after return'],
    ["if (/it's/.test(s)) { fetch('http://127.0.0.1:8188/x'); }", 'inside if(...)'],
    ["while (/it's/.test(s)) { fetch('http://10.0.0.5:7860/x'); }", 'inside while(...)'],
    ["switch (k) { case 1: /it's/.test(s); fetch('http://localhost:11434/x'); }", 'after case'],
    ["const r = [/it's/, /b'c/]; fetch('http://192.168.1.9:8188/x');", 'inside an array'],
    ["const ok = a && /it's/.test(b); fetch('http://127.0.0.1:8188/x');", 'after &&'],
    ["f(/it's/, 2); fetch('http://[::1]:11434/x');", 'as a call argument'],
    ["const t = typeof /it's/; fetch('http://169.254.1.2:8188/x');", 'after typeof'],
  ];

  it.each(REGEX_CONTEXTS)('a regex %s cannot corrupt the rest of the scan', (source) => {
    const code = executableSource(source, 'ctx.js');
    expect(hasLocalAddress(code), `corrupted: ${JSON.stringify(code)}`).toBe(true);
  });

  const PLANTED_CALLS = [
    ["fetch('http://127.0.0.1:8188/prompt')", 'single-quoted URL', 'a.js'],
    ['fetch("http://localhost:11434/api/generate")', 'double-quoted URL', 'a.js'],
    ['const u = `http://127.0.0.1:7860/sdapi`;', 'template literal URL', 'a.js'],
    ['const u = `${base}//127.0.0.1:8188/view`;', 'template with substitution', 'a.js'],
    ["const e = { comfy: 'http://localhost:8188' };", 'object literal', 'a.js'],
    ['export const C = () => <div title="x">http://10.1.2.3:7860</div>;', 'JSX text in TSX', 'a.tsx'],
    ["export const u: string = 'http://192.168.0.7:8188';", 'typed TS declaration', 'a.ts'],
    ["module.exports = { u: 'http://127.0.0.1:8188' };", 'CommonJS export', 'a.cjs'],
  ];

  it.each(PLANTED_CALLS)('detects a local address in %s', (source, _label, filename) => {
    expect(hasLocalAddress(executableSource(source, filename)), source).toBe(true);
  });

  const COMMENT_FORMS = [
    ['// legacy: http://127.0.0.1:8188 was the ComfyUI bridge', 'line comment', 'a.js'],
    ['/* historical: ollama ran at http://localhost:11434 */', 'block comment', 'a.js'],
    ['const a = 1; // comfyui http://127.0.0.1:8188', 'trailing comment', 'a.js'],
    ['/**\n * Fooocus lived at http://127.0.0.1:7860\n */\nconst b = 2;', 'JSDoc block', 'a.js'],
    ['export const C = () => <p>{/* http://127.0.0.1:8188 */}ok</p>;', 'JSX expression comment', 'a.jsx'],
  ];

  it.each(COMMENT_FORMS)('ignores a retired address/name in a %s', (source, _label, filename) => {
    const code = executableSource(source, filename);
    expect(hasLocalAddress(code), `comment leaked: ${JSON.stringify(code)}`).toBe(false);
    expect(namesEngine(code), `comment leaked: ${JSON.stringify(code)}`).toBe(false);
  });

  it('an engine NAME in executable code is detected; the same name in a comment is not', () => {
    expect(namesEngine(executableSource("const provider = 'ollama';", 'a.js'))).toBe(true);
    expect(namesEngine(executableSource('// ollama was removed on 2026-07-27', 'a.js'))).toBe(false);
  });

  it('comment blanking preserves length and line structure (offsets stay meaningful)', () => {
    const src = 'const a = 1; // http://127.0.0.1:8188\nconst b = 2;\n';
    const code = executableSource(src, 'a.js');
    expect(code).toHaveLength(src.length);
    expect(code.split('\n')).toHaveLength(src.split('\n').length);
    expect(code).toContain('const b = 2;');
  });
});

describe('negative control · every real syntax parses as itself, or fails LOUDLY', () => {
  // A `.ts` file reads `<T>x` as a type assertion; a `.tsx` reads it as JSX.
  // Applying one plugin set uniformly would mis-parse one of them, and a
  // mis-parse that were swallowed would look exactly like "nothing found".
  const SYNTAXES = [
    ['a.js', "const u = 'http://127.0.0.1:8188';"],
    ['a.jsx', 'export const C = () => <p>http://127.0.0.1:8188</p>;'],
    ['a.mjs', "export const u = 'http://127.0.0.1:8188';"],
    ['a.cjs', "module.exports = 'http://127.0.0.1:8188';"],
    ['a.ts', "const u = <string>'http://127.0.0.1:8188';"],
    ['a.tsx', 'export const C = (): JSX.Element => <p>http://127.0.0.1:8188</p>;'],
    ['a.mts', "export const u: string = 'http://127.0.0.1:8188';"],
    ['a.cts', "const u: string = 'http://127.0.0.1:8188'; export = u;"],
  ];

  it.each(SYNTAXES)('%s parses with its own grammar and stays inspectable', (filename, source) => {
    expect(hasLocalAddress(executableSource(source, filename)), filename).toBe(true);
  });

  it('TS and TSX get different plugin sets (they are not interchangeable)', () => {
    expect(parserOptionsFor('a.ts').plugins).toEqual(['typescript']);
    expect(parserOptionsFor('a.tsx').plugins).toEqual(['typescript', 'jsx']);
    expect(parserOptionsFor('a.jsx').plugins).toEqual(['jsx']);
    // 'unambiguous' accepts CommonJS AND the TS export-assignment legal in .cts
    expect(parserOptionsFor('a.cjs').sourceType).toBe('unambiguous');
    expect(parserOptionsFor('a.cts').plugins).toEqual(['typescript']);
  });

  it('unparseable executable source THROWS — it is never silently skipped', () => {
    expect(() => executableSource('const = = ;', 'broken.js')).toThrow(UnparseableSourceError);
    expect(() => executableSource('function f( {', 'broken.js')).toThrow(UnparseableSourceError);
    // and the error names the file, so a failure is actionable
    expect(() => executableSource('const = = ;', 'broken.js')).toThrow(/broken\.js/);
  });

  it('every file the repository scan covers actually parses (the scan is not silently empty)', () => {
    const files = ['src', 'supabase', 'scripts'].flatMap((d) => collectModules(d));
    expect(files.length).toBeGreaterThan(100);
    for (const f of files) expect(() => executableSourceOf(f), f).not.toThrow();
  });
});

describe('negative control · private / workstation address classes', () => {
  // The cloud-only invariant is about NETWORK DESTINATIONS the product must
  // never reach. A workstation engine is just as reachable on the studio LAN at
  // 192.168.x.x or 10.x.x.x as it is on 127.0.0.1, so the detector covers
  // loopback, RFC1918, link-local and private/link-local IPv6.
  const FORBIDDEN = [
    ["const u = 'http://127.0.0.1:8188/prompt';", 'IPv4 loopback'],
    ["const u = 'http://127.5.6.7:9000/x';", 'IPv4 loopback across the whole /8'],
    ["const u = 'http://10.0.0.5:7860/x';", 'RFC1918 10.0.0.0/8'],
    ["const u = 'http://192.168.1.50:8188/x';", 'RFC1918 192.168.0.0/16'],
    ["const u = 'http://172.16.3.4:8080/x';", 'RFC1918 172.16.0.0/12'],
    ["const u = 'http://172.31.255.1:8080/x';", 'RFC1918 172.31 upper bound'],
    ["const u = 'http://169.254.10.20/x';", 'IPv4 link-local'],
    ["const u = 'http://0.0.0.0:8188/x';", 'the unspecified address'],
    ["const u = 'ws://localhost:11434/socket';", 'localhost over ws'],
    ["const u = 'http://[::1]:11434/api';", 'IPv6 loopback'],
    ["const u = 'http://[fe80::1ff:fe23:4567]:8188/';", 'IPv6 link-local'],
    ["const u = 'http://[fd00::1]:7860/';", 'IPv6 unique-local'],
    ["const u = '//192.168.0.9/x';", 'protocol-relative private host'],
    ["const u = base + ':8188/prompt';", 'a known engine port'],
  ];

  it.each(FORBIDDEN)('flags %s', (source) => {
    expect(hasLocalAddress(executableSource(source, 'a.js')), source).toBe(true);
  });

  // Numeric business data must never be mistaken for an endpoint. Each of these
  // contains digits overlapping a private range but is not a destination.
  const ALLOWED = [
    ['const price = 10.0; const qty = 192168;', 'prices and quantities'],
    ["const version = '10.0.0.1';", 'a version string with no scheme or port'],
    ["const ratio = '172.16';", 'a bare decimal pair'],
    ['const total = 127.0 + 0.1;', 'arithmetic on floats'],
    ["const sku = '192.168.1.50-BLUE';", 'an SKU that embeds digits'],
    ["const u = 'https://api.artvalue.example/v1/generate';", 'a real remote endpoint'],
    ["const u = 'https://8.8.8.8:443/';", 'a PUBLIC IP endpoint'],
    ["const at = '12:30';", 'a clock time'],
  ];

  it.each(ALLOWED)('does NOT flag %s', (source) => {
    expect(hasLocalAddress(executableSource(source, 'a.js')), source).toBe(false);
  });
});

describe('negative control · recursive scan of every module extension', () => {
  // THE BYPASS: the walker matched only .js/.jsx/.ts/.tsx recursively, and
  // .mjs/.cjs ONLY at the repository root — so a nested `src/tool.mjs` or
  // `supabase/functions/tool.cjs` was invisible to both repository-wide scans.
  const PLANTED = [
    ['tool.mjs', "fetch('http://127.0.0.1:8188/prompt');"],
    ['nested/deep/probe.cjs', "require('node:http').get('http://localhost:11434/api/tags');"],
    ['nested/adapter.ts', "export const url: string = 'http://192.168.1.9:7860';"],
    ['nested/deep/legacy.cts', "const p = 'ollama'; export = p;"],
    ['nested/View.tsx', 'export const V = () => <p>http://10.0.0.5:8188/x</p>;'],
  ];

  let root;
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'av-scan-control-'));
    for (const [rel, body] of PLANTED) {
      const full = path.join(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, body, 'utf8');
    }
  });
  afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('collectModules finds every planted module at every depth', () => {
    const found = collectModules(root).map((f) => path.relative(root, f).split(path.sep).join('/'));
    for (const [rel] of PLANTED) expect(found, `missed: ${rel}`).toContain(rel);
    expect(found).toHaveLength(PLANTED.length);
  });

  it('the OLD extension filter demonstrably missed the .mjs/.cjs modules', () => {
    const oldFilter = (name) => /\.(js|jsx|ts|tsx)$/.test(name);
    expect(oldFilter('tool.mjs')).toBe(false);
    expect(oldFilter('probe.cjs')).toBe(false);
    expect(isModuleFile('tool.mjs')).toBe(true);
    expect(isModuleFile('probe.cjs')).toBe(true);
  });

  it('each planted module is reported by the detectors the scans apply', () => {
    const offenders = [];
    for (const file of collectModules(root)) {
      const code = executableSourceOf(file);
      if (hasLocalAddress(code) || namesEngine(code)) offenders.push(path.basename(file));
    }
    expect(offenders.sort()).toEqual(['View.tsx', 'adapter.ts', 'legacy.cts', 'probe.cjs', 'tool.mjs']);
  });

  it('the extension set covers every module form the toolchain executes', () => {
    for (const ext of ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.cts', '.mts']) {
      expect(MODULE_EXTENSIONS, ext).toContain(ext);
    }
  });
});
