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
  namesEngine, hasLocalAddress, isLoopbackHost,
} from './support/sourceScan.js';
import {
  RETIRED_MODULES, RETIRED_MODULE_PATHS, RETIRED_SPECIFIER_FRAGMENTS,
  RETIRED_ENV_VARS, RETIRED_PROVIDERS, RETIRED_ROUTES, RETIRED_SCRIPT_TERMS,
} from './support/retirementManifest.js';

const SRC = 'src';

// THE MANIFEST IS THE AUTHORITY (see support/retirementManifest.js). Two
// hand-written lists used to live here and both were incomplete — Codex found
// exactly that on `753ee2e`. They are gone; nothing in this file may enumerate
// a retired module or variable of its own.
const DELETED_MODULES = RETIRED_MODULE_PATHS;

// Import-specifier fragments, DERIVED from the manifest basenames rather than
// typed, so a new manifest entry extends this automatically.
const RETIRED_SPECIFIER = new RegExp(`(${RETIRED_SPECIFIER_FRAGMENTS.join('|')})`);

const LOCAL_ENV_VARS = RETIRED_ENV_VARS;

const isTestPath = (p) => /\.test\.[jt]sx?$/.test(p) || /(^|[\\/])__tests__[\\/]/.test(p);

// Recursive collection of EVERY executable module extension (incl. .mjs/.cjs at
// any depth) is owned by support/sourceScan.js and shared with the controls.
const walk = collectModules;

// EVERY executable file in the repository, not just src/: application source,
// the Supabase Edge function and its shared modules, tooling, and any module at
// the repository root — collected by RECURSING FROM THE REPOSITORY ROOT, not
// from a fixed list of roots.
//
// This closes the last variant of a finding class that recurred three times:
// root-level `.mjs`/`.cjs` (Codex P2 on `1361a84`), then the `supabase/` tree
// (P2 on `1c6987b`), then any unlisted top-level directory (P2 on `d417d00`).
// Each round widened an ALLOWLIST, which is why the question kept coming back.
// There is no allowlist any more: everything is in scope unless it is a
// dependency, build output or operational state, and that exclusion set is
// owned by `collectModules`/`SKIP_DIRS` in support/sourceScan.js. Content
// directories that hold no module today (`docs/`, `posts/`, `public/`) stay IN
// scope deliberately, so a module placed in one later is caught.
function repoExecutables() {
  return collectModules('.');
}

// The production surface the retirement invariants apply to: the repository-wide
// executable set MINUS tests. A test may legitimately NAME a retired module or
// variable in order to assert that nothing reads it — this file does exactly
// that — so tests are excluded here rather than in each assertion.
// A src/-only walk is NOT a substitute: it cannot see the Edge function, so a
// retired variable read in `supabase/functions/` went unchecked until Codex
// found it on `1c6987b`. That src/-only helper is gone; every retirement
// invariant now shares this one set.
const productionExecutables = () => repoExecutables().filter((f) => !isTestPath(f));

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
  it('no production executable anywhere in the repository reads a local-engine env variable', () => {
    const offenders = [];
    for (const file of productionExecutables()) {
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
    for (const r of RETIRED_ROUTES) {
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
    for (const p of RETIRED_PROVIDERS) {
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
  // `repoExecutables()` is defined at module scope and shared with the
  // manifest invariants, so both scans cover the same set by construction.

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
      for (const t of RETIRED_SCRIPT_TERMS) {
        expect(cmd.toLowerCase().includes(t), `${name}: ${cmd} :: ${t}`).toBe(false);
      }
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

describe('negative control · UTF-16 parser-range fidelity (Codex P1)', () => {
  // THE BYPASS: Babel reports `start`/`end` as UTF-16 code-unit offsets, but the
  // blanking loop walked `[...s]`, which iterates CODE POINTS. Every astral
  // character before a comment shifted the blanked window one place right; with
  // enough of them the window slid past the comment and erased executable text
  // after it — including part of a later forbidden URL. A silent miss.
  const EMOJI = '🎨🚀🔥🌟💡🧠🛰️🪄';

  it('an emoji before a comment cannot shift the blanked range or erase the URL after it', () => {
    // Codex's exact shape: astral characters, then a comment, then a forbidden
    // executable destination that MUST remain detectable.
    const src = `const label = '${EMOJI}'; // legacy note about the old bridge\n`
      + "fetch('http://127.0.0.1:8188/prompt');\n";
    const code = executableSource(src, 'emoji.js');

    expect(code).toContain("fetch('http://127.0.0.1:8188/prompt')");
    expect(hasLocalAddress(code), 'the destination was erased by range drift').toBe(true);
    expect(code).not.toContain('legacy note');
  });

  it('the drift scales with the number of astral characters and is still contained', () => {
    for (const n of [1, 2, 5, 20, 80]) {
      const src = `const l = '${'🎨'.repeat(n)}'; // note\n`
        + "fetch('http://127.0.0.1:9000/x');\n";
      const code = executableSource(src, 'emoji.js');
      expect(hasLocalAddress(code), `${n} emoji`).toBe(true);
      expect(code, `${n} emoji`).toContain('127.0.0.1:9000');
    }
  });

  it('astral characters INSIDE the comment are blanked without touching the code after', () => {
    const src = "/* 🎨🚀 the old bridge 🔥 */ fetch('http://127.0.0.1:9000/x');\n";
    const code = executableSource(src, 'emoji.js');
    expect(code).toContain("fetch('http://127.0.0.1:9000/x')");
    expect(code).not.toContain('the old bridge');
  });

  it('blanking preserves UTF-16 length and line structure even with astral text', () => {
    const src = `const a = '${EMOJI}'; // c\nconst b = 2;\n`;
    const code = executableSource(src, 'emoji.js');
    expect(code).toHaveLength(src.length); // UTF-16 code units, like Babel
    expect(code.split('\n')).toHaveLength(src.split('\n').length);
    expect(code).toContain(EMOJI);
    expect(code).toContain('const b = 2;');
  });

  it('the OLD code-point indexing demonstrably drifts (bypass reproduced)', () => {
    // Reproduces the defect against the same input the control above proves
    // fixed: code-point indexing blanks the wrong window once an emoji precedes
    // the comment, so the emitted text no longer matches the fixed output.
    const src = `const l = '${EMOJI}'; // note\nfetch('http://127.0.0.1:8188/prompt');\n`;
    const naiveBlank = (s, ranges) => {
      const chars = [...s]; // ← code points: the bug
      for (const [a, b] of ranges) for (let i = a; i < b && i < chars.length; i += 1) {
        if (chars[i] !== '\n') chars[i] = ' ';
      }
      return chars.join('');
    };
    const commentStart = src.indexOf('//');
    const commentEnd = src.indexOf('\n', commentStart);
    const drifted = naiveBlank(src, [[commentStart, commentEnd]]);
    // the naive result differs from the correct one — that difference IS the drift
    expect(drifted).not.toBe(executableSource(src, 'emoji.js'));
    expect(drifted).toContain('note'); // it failed to blank the comment it aimed at
  });
});

describe('negative control · browser-normalized loopback destinations', () => {
  // THE BYPASS this control exists for: loopback detection used to be a list of
  // textual regex forms, but URL parsing normalizes `127.1`, `2130706433` and
  // `0x7f000001` all to 127.0.0.1. With an unlisted port such as 9000 nothing
  // matched at all, so a retired-engine call could read as clean.
  //
  // SCOPE. This detector answers ONE question: does the source reach a retired
  // workstation engine — i.e. THIS MACHINE'S LOOPBACK, or one of the four engine
  // ports. It is not a general private-network policy; the universal
  // private-address classifier and the runtime egress boundary that briefly
  // lived here were a scope expansion and have been removed.
  const FORBIDDEN = [
    // — every textual form of loopback, all on an unlisted port —
    ["const u = 'http://127.1:9000/x';", 'IPv4 shorthand 127.1'],
    ["const u = 'http://2130706433:9000/x';", 'decimal-encoded IPv4'],
    ["const u = 'http://0x7f000001:9000/x';", 'hexadecimal-encoded IPv4'],
    ["const u = 'http://127.0.0.1:9000/x';", 'IPv4 loopback'],
    ["const u = 'http://127.5.6.7:9000/x';", 'loopback across the whole /8'],
    ["const u = 'http://0177.0.0.1/x';", 'octal-encoded IPv4'],
    // — IPv6 loopback, including the IPv4-mapped form —
    ["const u = 'http://[::1]:9000/api';", 'IPv6 loopback'],
    ["const u = 'http://[0:0:0:0:0:0:0:1]:9000/api';", 'uncompressed IPv6 loopback'],
    ["const u = 'http://[::ffff:127.0.0.1]:9000/x';", 'IPv4-mapped IPv6 loopback'],
    // — shapes other than scheme://host —
    ["const u = '//127.0.0.1/x';", 'protocol-relative loopback'],
    ["const u = '127.0.0.1:9000';", 'bare host:port, no scheme'],
    ["const u = 'ws://localhost:9000/socket';", 'localhost over ws'],
    ["const u = 'http://sub.localhost:9000/x';", 'a localhost subdomain'],
    // — the four retired engine ports, wherever they appear —
    ["const u = base + ':8188/prompt';", 'ComfyUI port in a composed expression'],
    ["const u = base + ':11434/api/tags';", 'Ollama port in a composed expression'],
    ["const u = base + ':7860/sdapi/v1/txt2img';", 'A1111/Fooocus port in a composed expression'],
  ];

  it.each(FORBIDDEN)('flags %s', (source) => {
    expect(hasLocalAddress(executableSource(source, 'a.js')), source).toBe(true);
  });

  // The business-data boundary. Extraction requires an executable DESTINATION
  // shape (a scheme, a protocol-relative `//`, or an explicit host:port), so
  // standalone IP-like text is never normalized and never flagged. The LAN and
  // public entries below are deliberate: this detector is scoped to the retired
  // engines' loopback, not to network egress in general.
  const ALLOWED = [
    ['const price = 10.0; const qty = 192168;', 'prices and quantities'],
    ["const version = '10.0.0.1';", 'a version string with no scheme or port'],
    ["const ratio = '172.16';", 'a bare decimal pair'],
    ['const total = 127.0 + 0.1;', 'arithmetic on floats'],
    ["const sku = '192.168.1.50-BLUE';", 'an SKU embedding a dotted quad'],
    ['const n = 2130706433;', 'a bare integer that WOULD normalize to loopback as a host'],
    ["const at = '12:30';", 'a clock time'],
    ["const u = 'https://api.artvalue.example/v1/generate';", 'a real remote endpoint'],
    ["const u = 'https://8.8.8.8:443/';", 'a PUBLIC IPv4 endpoint'],
    ["const u = 'http://[2606:4700::1]:443/';", 'a PUBLIC IPv6 endpoint'],
    ["const u = 'http://126.0.0.1:9000/';", 'just below the 127/8 loopback block'],
    ["const u = 'http://128.0.0.1:9000/';", 'just above the 127/8 loopback block'],
  ];

  it.each(ALLOWED)('does NOT flag %s', (source) => {
    expect(hasLocalAddress(executableSource(source, 'a.js')), source).toBe(false);
  });

  it('classification is numeric, so it holds for every textual form of one host', () => {
    // Each of these normalizes to 127.0.0.1 under the URL parser.
    for (const form of ['127.0.0.1', '127.1', '2130706433', '0x7f000001', '0177.0.0.1']) {
      expect(hasLocalAddress(executableSource(`const u = 'http://${form}:9000/';`, 'a.js')), form).toBe(true);
    }
  });

  it('isLoopbackHost classifies NORMALIZED hosts, not raw text', () => {
    for (const h of ['localhost', 'sub.localhost', '127.0.0.1', '127.255.255.254', '[::1]',
      '[::ffff:7f00:1]']) {
      expect(isLoopbackHost(h), h).toBe(true);
    }
    // Explicitly OUT of scope: this is a retired-engine detector, not a
    // private-network policy. LAN and public hosts alike are not its business.
    for (const h of ['8.8.8.8', 'api.example.com', '10.1.2.3', '192.168.0.1', '169.254.0.1',
      '[2606:4700::1]', '[fe80::1]', '[::ffff:8.8.8.8]', '']) {
      expect(isLoopbackHost(h), h).toBe(false);
    }
  });

  it('an arbitrary port is enough — detection does not depend on a known engine port', () => {
    for (const port of ['80', '443', '3000', '9000', '65535']) {
      expect(hasLocalAddress(executableSource(`const u = 'http://127.0.0.1:${port}/x';`, 'a.js')), port).toBe(true);
    }
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

// ===================================================================
// THE MANIFEST IS THE INVARIANT (Codex P2 ×2 on `753ee2e`)
//
// Both findings had the same root cause: the retirement was enforced against
// two lists that were WRITTEN rather than DERIVED, so anything nobody happened
// to type stayed unprotected. `support/retirementManifest.js` is now the single
// authoritative source, derived from the PR diff and repository history (the
// derivation commands are recorded in its header). These assertions prove the
// manifest is both COMPLETE against the real deletions and HONEST about what is
// still live.
// ===================================================================
describe('retirement manifest · it is the single authoritative source', () => {
  it('every manifest-listed retired file is absent from disk', () => {
    const present = RETIRED_MODULE_PATHS.filter((f) => fs.existsSync(f));
    expect(present, `retired files that came back: ${present.join(', ')}`).toEqual([]);
  });

  it('no production source imports or recreates a manifest module under its retired path', () => {
    const offenders = [];
    for (const file of productionExecutables()) {
      for (const spec of importSpecifiers(fs.readFileSync(file, 'utf8'))) {
        const resolved = resolveLocal(file, spec);
        const norm = resolved && path.normalize(resolved);
        for (const retired of RETIRED_MODULE_PATHS) {
          if (norm === path.normalize(retired)) offenders.push(`${file} -> ${retired}`);
          // also catch a specifier that NAMES the retired module even if the
          // file does not exist yet — an importer added ahead of the module
          const base = retired.split('/').pop().replace(/\.(jsx?|mjs|tsx?)$/, '');
          if (new RegExp(`(^|/)${base}(\\.[a-z]+)?$`).test(spec)) {
            offenders.push(`${path.normalize(file)} -> ${spec}`);
          }
        }
      }
    }
    expect([...new Set(offenders)], `retired-path imports: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no executable production source reads any manifest-listed env variable', () => {
    const offenders = [];
    // REPOSITORY-WIDE, not src/: the Supabase Edge function and its shared
    // modules are production code too (Codex P2 on `1c6987b`).
    for (const file of productionExecutables()) {
      const code = executableSourceOf(file);
      for (const v of RETIRED_ENV_VARS) {
        if (code.includes(v)) offenders.push(`${path.normalize(file)} -> ${v}`);
      }
    }
    expect(offenders, `retired env reads: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no retired environment assignment remains in the shipped environment example', () => {
    const lines = fs.readFileSync('.env.example', 'utf8').split('\n').map((l) => l.trim());
    const offenders = [];
    for (const l of lines) {
      // commented-out documentation is not a shipped assignment
      if (!l || l.startsWith('#')) continue;
      const name = (l.match(/^([A-Z][A-Z0-9_]*)\s*=/) || [])[1];
      if (name && RETIRED_ENV_VARS.includes(name)) offenders.push(l);
    }
    expect(offenders, `retired assignments still shipped: ${offenders.join(', ')}`).toEqual([]);
  });

  // COMPLETENESS, not just correctness: the manifest must cover the specific
  // omissions Codex named — and it is asserted to be strictly LARGER than those
  // examples, so nobody can satisfy the finding by adding exactly five strings.
  it('the manifest covers the omissions Codex identified — and is not limited to them', () => {
    const CODEX_MODULES = [
      'src/lib/comfyProgress.js',
      'src/lib/geminiImage.js',
      'src/lib/productLock.js',
      'src/components/studio/ProductPlacer.jsx',
      'scripts/local-review-prep.mjs',
    ];
    const CODEX_ENV = [
      'VITE_COMFYUI_PULID', 'VITE_COMFYUI_KONTEXT_MODEL', 'VITE_COMFYUI_QWEN_EDIT',
      'VITE_COMFYUI_SVD_MODEL', 'VITE_GEMINI_IMAGE_MODEL',
    ];
    for (const m of CODEX_MODULES) expect(RETIRED_MODULE_PATHS, m).toContain(m);
    for (const v of CODEX_ENV) expect(RETIRED_ENV_VARS, v).toContain(v);
    // the whole removed ComfyUI configuration family, not a sample of it
    const comfy = RETIRED_ENV_VARS.filter((v) => v.startsWith('VITE_COMFYUI_'));
    expect(comfy.length, `ComfyUI family too small: ${comfy.join(', ')}`).toBeGreaterThanOrEqual(18);
    expect(RETIRED_MODULE_PATHS.length).toBeGreaterThan(CODEX_MODULES.length);
    expect(RETIRED_ENV_VARS.length).toBeGreaterThan(CODEX_ENV.length);
  });

  // The opposite failure direction: over-listing would make the suite lie about
  // what the product still needs. A manifest variable must be read by NOTHING.
  it('the manifest lists no variable the product still legitimately reads', () => {
    const LIVE = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_GEMINI_API_KEY',
      'VITE_GEMINI_MODEL', 'VITE_POLLINATIONS_TOKEN', 'VITE_POLLINATIONS_MODEL',
      'VITE_READER_PROXY'];
    for (const v of LIVE) expect(RETIRED_ENV_VARS, v).not.toContain(v);
  });

  // The repository-wide assertion above passes because there ARE no offenders.
  // This proves the predicate it uses is not vacuous: the same shape fires on a
  // retired specifier and stays quiet on a legitimate neighbour.
  it('the retired-path specifier predicate fires (and does not over-fire)', () => {
    const fires = (spec) => RETIRED_MODULE_PATHS.some((r) => {
      const base = r.split('/').pop().replace(/\.(jsx?|mjs|tsx?)$/, '');
      return new RegExp(`(^|/)${base}(\\.[a-z]+)?$`).test(spec);
    });
    for (const s of ['./comfyProgress.js', '../lib/comfyProgress', './productLock.js',
      '../studio/ProductPlacer.jsx', './geminiImage.js']) {
      expect(fires(s), `should fire: ${s}`).toBe(true);
    }
    for (const s of ['./hostedImage.js', './userIdentity.js', './productLockUnrelatedThing',
      './studioModes.js']) {
      expect(fires(s), `should NOT fire: ${s}`).toBe(false);
    }
  });

  it('every manifest module entry records the commit that removed it', () => {
    for (const m of RETIRED_MODULES) {
      expect(m.path, JSON.stringify(m)).toMatch(/^(src|scripts)\//);
      expect(m.since, m.path).toMatch(/^[0-9a-f]{7,40}$/);
      expect(String(m.what).length, m.path).toBeGreaterThan(3);
    }
  });
});

describe('negative control · the PRE-FIX lists would have let a retirement regress', () => {
  // The two lists exactly as they stood on `753ee2e`, before the manifest.
  const PRE_FIX_MODULES = [
    'src/lib/localComfyEngine.js', 'src/lib/localEngines.js', 'src/lib/comfyPoster.js',
    'src/creative/v2/poster/comfyPosterPrompt.js', 'src/components/ai/posterOverlay.js',
    'src/components/ai/posterExport.js', 'src/pages/AdStudio.jsx',
  ];
  const PRE_FIX_ENV = [
    'VITE_ENABLE_LOCAL_ENGINES', 'VITE_LOCAL_LLM_URL', 'VITE_LOCAL_LLM_MODEL',
    'VITE_CREATIVE_LLM_MODEL', 'VITE_JAKE_MODEL', 'VITE_JAKE_BRAIN',
    'VITE_LOCAL_IMAGE_URL', 'VITE_COMFYUI_URL', 'VITE_COMFYUI_MODEL',
    'VITE_COMFYUI_FLUX_MODEL', 'VITE_COMFYUI_FLUX_LORA', 'VITE_COMFYUI_FACE_BBOX',
    'VITE_COMFYUI_UPSCALE_MODEL', 'VITE_FOOOCUS_URL',
  ];

  // The SAME predicate shapes the suite applies, with the "does it exist" and
  // "what is the source" inputs injected — so this exercises the real gate, not
  // a re-implementation of it.
  const revivedFiles = (list, present) => list.filter((f) => present.has(path.normalize(f)));
  const envReads = (list, code) => list.filter((v) => code.includes(v));

  it('a deleted module could return under a path the old list never named', () => {
    // `comfyProgress.js` was deleted by this PR and was NOT in the old list.
    const revived = new Set([path.normalize('src/lib/comfyProgress.js')]);

    expect(revivedFiles(PRE_FIX_MODULES, revived),
      'the pre-fix list reported CLEAN while a retired module was back').toEqual([]);
    expect(revivedFiles(RETIRED_MODULE_PATHS, revived))
      .toEqual(['src/lib/comfyProgress.js']);
  });

  it('a retired variable could be read again without the old list noticing', () => {
    // `VITE_COMFYUI_PULID` configured the retired PuLID identity lane.
    const code = "const pulid = import.meta.env.VITE_COMFYUI_PULID || '';";

    expect(envReads(PRE_FIX_ENV, code),
      'the pre-fix list reported CLEAN while a retired variable was read').toEqual([]);
    expect(envReads(RETIRED_ENV_VARS, code)).toEqual(['VITE_COMFYUI_PULID']);
  });

  it('the gap was systematic, not two unlucky omissions', () => {
    const missedModules = RETIRED_MODULE_PATHS.filter((m) => !PRE_FIX_MODULES.includes(m));
    const missedEnv = RETIRED_ENV_VARS.filter((v) => !PRE_FIX_ENV.includes(v));
    expect(missedModules.length, `modules the old list missed: ${missedModules.join(', ')}`)
      .toBeGreaterThanOrEqual(8);
    expect(missedEnv.length, `variables the old list missed: ${missedEnv.join(', ')}`)
      .toBeGreaterThanOrEqual(14);
  });

  it('word-boundary engine matching alone would NOT have found the retired variables', () => {
    // Why the manifest cannot be replaced by terminology scanning: the engine
    // regex is a word-anchored match, so a variable NAME never trips it.
    for (const v of ['VITE_COMFYUI_QWEN_VAE', 'VITE_COMFYUI_PULID_MODEL', 'VITE_JAKE_CLOUD_MODEL']) {
      const code = `const x = import.meta.env.${v};`;
      expect(namesEngine(code), `${v} should NOT be discoverable by word-boundary scan`).toBe(false);
      expect(RETIRED_ENV_VARS, v).toContain(v);
    }
  });
});

describe('negative control · the retirement invariants cover the WHOLE repository', () => {
  // THE BYPASS, in three rounds, all the same class:
  //   `1361a84` — root-level `.mjs`/`.cjs` sat outside the scan
  //   `1c6987b` — `src/`-only walk never inspected the Supabase Edge function
  //   `d417d00` — a FIXED root allowlist (src, supabase, scripts) omitted every
  //               other top-level directory, so a shipped `public/foo.js`
  //               reading a retired variable would pass
  // Each fix widened an allowlist, which is why the question kept returning.
  // The collection now RECURSES FROM THE REPOSITORY ROOT and there is no
  // allowlist left to be incomplete.
  const SRC_ONLY = () => collectModules('src').filter((f) => !isTestPath(f));
  const FIXED_ROOTS = () => ['src', 'supabase', 'scripts']
    .flatMap((d) => collectModules(d))
    .filter((f) => !isTestPath(f))
    .map((f) => path.normalize(f));

  const norm = (list) => list.map((f) => path.normalize(f));
  const under = (set, dir) => set.some((f) => f.startsWith(path.normalize(dir) + path.sep));

  it('the production set reaches src/, the Edge function and the repository root', () => {
    const set = norm(productionExecutables());
    expect(under(set, 'src'), 'src/ not covered').toBe(true);
    expect(under(set, 'supabase/functions'), 'Edge function not covered').toBe(true);
    expect(set, 'the root vite config is not covered').toContain(path.normalize('vite.config.js'));
    expect(set.length).toBeGreaterThan(SRC_ONLY().length);
  });

  // THE REQUIRED PROOF: a module placed in a directory NO list ever named is
  // collected. `docs/` holds no executable today — that is exactly why it must
  // be in scope — so one is planted, collected, and removed again.
  it('an executable module in a previously unlisted top-level directory IS included', () => {
    const planted = path.normalize('docs/__retirement_walk_probe__.mjs');
    expect(fs.existsSync(planted), 'probe path must not already exist').toBe(false);
    fs.writeFileSync(planted, "export const probe = import.meta.env.VITE_COMFYUI_PULID;\n", 'utf8');
    try {
      const set = norm(productionExecutables());
      expect(set, 'a module under docs/ escaped the production scan').toContain(planted);

      // and the fixed-root scope this round replaced does NOT contain it —
      // the bypass reproduced, not merely described
      expect(FIXED_ROOTS(), 'the pre-fix allowlist should have missed it').not.toContain(planted);

      // the retirement assertion applied to it would have FIRED
      const code = executableSourceOf(planted);
      expect(RETIRED_ENV_VARS.filter((v) => code.includes(v))).toEqual(['VITE_COMFYUI_PULID']);
    } finally {
      fs.rmSync(planted, { force: true });
    }
    expect(fs.existsSync(planted), 'the probe must be cleaned up').toBe(false);
  });

  it('tests remain excluded (a test may NAME what it asserts is gone)', () => {
    const leaked = productionExecutables().filter((f) => isTestPath(f));
    expect(leaked, `tests leaked into the production set: ${leaked.join(', ')}`).toEqual([]);
    // …including this file, which names every retired module and variable
    const set = norm(productionExecutables());
    expect(set).not.toContain(path.normalize('src/lib/__tests__/localEngineRetirement.test.js'));
    expect(set).not.toContain(path.normalize('src/lib/__tests__/support/retirementManifest.js'));
    // the raw walk DOES see them — exclusion is centralized, not accidental
    expect(norm(repoExecutables()))
      .toContain(path.normalize('src/lib/__tests__/localEngineRetirement.test.js'));
  });

  it('dependencies, build output and operational state remain excluded', () => {
    const set = norm(repoExecutables());
    for (const dir of ['node_modules', 'dist', 'dist-profile', 'coverage', 'artifacts',
      '.git', '.wrangler', '.claude', '.vite']) {
      expect(under(set, dir), `${dir} leaked into the scan`).toBe(false);
    }
    // …and the walk is not accidentally empty because of over-exclusion
    expect(set.length).toBeGreaterThan(200);
  });

  it('the scan is a measurement, not a skip (non-vacuity)', () => {
    const files = productionExecutables();
    expect(files.length).toBeGreaterThan(100);
    for (const f of files.slice(0, 5)) expect(typeof executableSourceOf(f)).toBe('string');
    const plantedSource = 'const u = import.meta.env.VITE_COMFYUI_QWEN_UNET;';
    expect(RETIRED_ENV_VARS.filter((v) => plantedSource.includes(v)))
      .toEqual(['VITE_COMFYUI_QWEN_UNET']);
  });
});
