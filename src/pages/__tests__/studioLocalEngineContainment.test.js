import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ===================================================================
// Studio local-engine UI containment.
//
// Ordinary users — authenticated cloud OR local/demo — must not meet the
// implementation engine: no ComfyUI workflow-management surface, no local-GPU
// availability/setup screen, no checkpoint/provider picker, no engine names in
// copy, and NO local-engine request fired merely by opening the Studio.
//
// Coverage split, stated honestly:
//   • RUNTIME proof (behavioral): the route table is executed, and the mount
//     effects of ImageStudio are proven probe-free by asserting the real
//     capability flags are configuration-derived constants (imported and
//     evaluated) rather than promise-returning probes.
//   • SOURCE proof (proxy): the removed JSX/labels are pinned by reading the
//     page source. String absence alone is NOT treated as sufficient — it
//     backs up the structural assertions, it does not stand in for them.
// ===================================================================

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const imageStudio = read('../ImageStudio.jsx');
const adStudio = read('../AdStudio.jsx');
const app = read('../../App.jsx');
const sidebarNav = read('../../components/layout/sidebarNav.js');
const assistant = read('../../components/ai/Assistant.jsx');
const geminiImage = read('../../lib/geminiImage.js');
const presets = read('../../data/creativePresets.js');

// The body of the ImageStudio component (everything after the default export)
// — module-level comments describing what was removed live above it.
const studioBody = imageStudio.slice(imageStudio.indexOf('export default function ImageStudio'));

// Strip line/block comments so "we deleted X" notes can never satisfy — or
// falsely fail — an assertion about what the page actually renders or runs.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}
const studioCode = stripComments(studioBody);
const adStudioCode = stripComments(adStudio);
const assistantCode = stripComments(assistant);

// What a user can actually READ: every string/template literal plus every JSX
// text node. Deliberately excludes identifiers — `onComfyJob` is an internal
// function name that renders nothing, whereas "מנוע ComfyUI כבוי" is copy. An
// assertion over raw source would conflate the two and be satisfied (or
// defeated) by a rename, which is not what containment means.
function userVisibleText(src) {
  const code = stripComments(src).replace(/^\s*import[\s\S]*?from\s*'[^']*';$/gm, '');
  const literals = code.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || [];
  const jsxText = (code.match(/>[^<>{}]+</g) || []);
  return [...literals, ...jsxText].join('\n');
}
const studioText = userVisibleText(studioBody);
const adStudioText = userVisibleText(adStudio);
const assistantText = userVisibleText(assistant);
const sidebarNavCode = stripComments(sidebarNav);

describe('Studio containment · the local-GPU status/setup screen is gone', () => {
  it('no EngineStatus component, ping loop, or engine-state copy remains', () => {
    for (const banned of [
      'EngineStatus',          // the component itself
      'checkLocalEngine',      // its availability probe
      'engine-status',         // its container class
      'engine-help',
      'engine-label',
      'איך מפעילים',            // "how to start it"
      'מנוע התמונות כבוי',       // "the image engine is off"
      'מנוע התמונות פעיל',
      'start_engine',          // the .bat operator instruction
      'Start ArtValue Image Engine',
      'ComfyUI_windows_portable',
    ]) {
      expect(imageStudio.includes(banned) && stripComments(imageStudio).includes(banned), banned).toBe(false);
    }
  });

  it('the page sets up no polling interval against the engine', () => {
    // JobElapsed + the idea rotator keep their intervals; neither calls out.
    const intervals = studioCode.match(/setInterval\([^)]*/g) || [];
    for (const iv of intervals) {
      expect(iv.includes('ping'), iv).toBe(false);
      expect(iv.includes('checkLocalEngine'), iv).toBe(false);
    }
  });
});

describe('Studio containment · no local-engine request on mount', () => {
  it('the discovery probes are not imported or called by the page', () => {
    for (const probe of ['listImageModels', 'hasPulidNode', 'hasQwenEditNode', 'hasFaceDetailerNode', 'hasUpscaleModel']) {
      expect(studioCode.includes(probe), probe).toBe(false);
    }
  });

  it('the page itself opens no direct connection to a local engine', () => {
    for (const banned of ['XMLHttpRequest', 'new WebSocket', 'localhost', '127.0.0.1', ':8188']) {
      expect(studioCode.includes(banned), banned).toBe(false);
    }
    // Exactly ONE fetch survives, and it is not a probe: it re-reads the image
    // the user already generated, on an explicit "animate this result" click.
    const fetches = studioCode.match(/fetch\([^)]*\)/g) || [];
    expect(fetches).toEqual(['fetch(result.src)']);
  });

  it('RUNTIME: the capability flags the Studio reads are plain booleans, not probes', async () => {
    // Imported for real. A probe would be a function returning a Promise and
    // would have to be awaited on mount; a constant cannot issue a request.
    const img = await import('../../lib/geminiImage.js');
    for (const flag of ['hasLocalComfy', 'hasVideoModel', 'hasLtxVideo', 'hasKontextModel', 'hasPulidModel', 'hasQwenEdit']) {
      expect(typeof img[flag], flag).toBe('boolean');
    }
    // …and the page consumes exactly those, assigning them directly.
    expect(studioCode).toContain('const pulidReady = hasPulidModel;');
    expect(studioCode).toContain('const qwenReady = hasQwenEdit;');
  });

  it('the capability consts are declared BEFORE the mode list that reads them', () => {
    // Regression guard. Replacing the former useState pair with plain consts
    // moved them below `const modes = MODES.filter(… pulidReady … qwenReady)`,
    // which threw a temporal-dead-zone ReferenceError and blanked the whole
    // Studio at runtime. No source-string assertion caught it — only rendering
    // the page did — so the ordering itself is pinned here.
    const iPulid = studioCode.indexOf('const pulidReady =');
    const iQwen = studioCode.indexOf('const qwenReady =');
    const iModes = studioCode.indexOf('const modes = MODES.filter');
    expect(iPulid).toBeGreaterThan(-1);
    expect(iQwen).toBeGreaterThan(-1);
    expect(iModes).toBeGreaterThan(-1);
    expect(iModes, 'pulidReady must precede modes').toBeGreaterThan(iPulid);
    expect(iModes, 'qwenReady must precede modes').toBeGreaterThan(iQwen);
    // and `modes` really does depend on them (guard stays meaningful)
    const modesLine = studioCode.slice(iModes, studioCode.indexOf('\n', iModes));
    expect(modesLine).toContain('pulidReady');
    expect(modesLine).toContain('qwenReady');
  });

  it('the new flags are derived from configuration only (no network in their definition)', () => {
    for (const decl of [
      'export const hasPulidModel = Boolean(COMFY_URL',
      'export const hasQwenEdit = Boolean(COMFY_URL',
    ]) {
      expect(geminiImage).toContain(decl);
    }
    // With the localEngines gate closed (every hosted build) COMFY_URL is ''
    // and therefore every capability flag is false.
    expect(geminiImage).toContain("import { resolveLocalEngineUrl } from './localEngines.js'");
  });
});

describe('Studio containment · no workflow-management surface', () => {
  it('the CreativeWorkflowMap component is deleted and unreferenced', () => {
    expect(existsSync(fileURLToPath(new URL('../../components/studio/CreativeWorkflowMap.jsx', import.meta.url)))).toBe(false);
    expect(imageStudio.includes('CreativeWorkflowMap')).toBe(false);
    expect(stripComments(imageStudio).includes('מפת ה־Workflows')).toBe(false);
  });

  it('RETAINED: the workflow CATALOG DATA stays — it has live non-Studio consumers', async () => {
    // Deleting it would break Jake's decision engine, the business brain and
    // the Studio hand-off. This is the dependency that narrowed the cleanup.
    const data = await import('../../data/creativeWorkflows.js');
    expect(Array.isArray(data.CREATIVE_WORKFLOWS)).toBe(true);
    expect(data.CREATIVE_WORKFLOWS.length).toBeGreaterThan(0);
    for (const rel of ['../../lib/studioHandoff.js', '../../lib/jakeDecisionEngine.js', '../../data/businessBrain.js']) {
      expect(read(rel).includes('creativeWorkflows.js'), rel).toBe(true);
    }
  });
});

describe('Studio containment · no technical provider/model/tool selection', () => {
  it('the local checkpoint picker and its state are gone', () => {
    for (const banned of ['listImageModels', 'setModelFile', 'selModel', 'isFluxModel', 'modelLabel', 'מודל מומלץ', 'safetensors']) {
      expect(studioCode.includes(banned), banned).toBe(false);
    }
    expect(stripComments(imageStudio).includes('PRESET_PROVIDER_LABEL')).toBe(false);
  });

  it('the generation call sends no model or architecture from the UI', () => {
    expect(studioCode).toContain('r = await generateImage(p, { width: asp.w, height: asp.h, hd, aspect });');
    expect(studioCode.includes('arch:')).toBe(false);
    expect(studioCode.includes('model: selModel')).toBe(false);
  });

  it('the engine-implementation toggle for character consistency is gone', () => {
    for (const banned of ['packEngine', 'setPackEngine', 'מנוע עקביות']) {
      expect(studioCode.includes(banned), banned).toBe(false);
    }
  });

  it('the HD control is only offered where it actually applies', () => {
    // Previously rendered in hosted builds too, where it did nothing.
    expect(studioCode).toContain("{mode === 'text' && hasLocalComfy && (");
  });
});

describe('Studio containment · no engine names in user-visible copy', () => {
  const ENGINE_WORDS = [
    'ComfyUI', 'Comfy', 'Ollama', 'Fooocus', 'PuLID', 'Kontext', 'SDXL',
    'FLUX', 'Flux', 'LTX', 'SVD', 'Qwen', 'Pollinations', 'diffusion',
  ];

  it('ImageStudio renders no engine or model name', () => {
    for (const w of ENGINE_WORDS) {
      expect(studioText.includes(w), `ImageStudio copy: ${w}`).toBe(false);
    }
  });

  it('the job card no longer exposes the engine graph node', () => {
    for (const banned of ['job.node', 'job-node', 'class_type']) {
      expect(studioCode.includes(banned), banned).toBe(false);
    }
    // progress / queue position / elapsed are business-readable and stay
    expect(studioCode).toContain('job.phase');
    expect(studioCode).toContain('JobElapsed');
  });

  it('the local-GPU framing is gone from the Studio header and empty state', () => {
    for (const banned of ['GPU', 'המעבד הגרפי', 'מנוע הווידאו']) {
      expect(studioText.includes(banned), banned).toBe(false);
    }
  });

  it('AdStudio no longer tells the user to start a local LLM', () => {
    for (const banned of ['Ollama', 'aya-expanse', 'מנוע הטקסט כבוי', 'engine-status', 'engine-label']) {
      expect(adStudioText.includes(banned), banned).toBe(false);
    }
  });

  it('Jake never labels the poster lane with an engine name', () => {
    for (const banned of ['פוסטר עם ComfyUI', 'נוצר מקומית · ComfyUI', 'מרנדר מקומית', 'מנוע ה-ComfyUI', 'מחולל הפוסטרים המקומי']) {
      expect(assistantText.includes(banned), banned).toBe(false);
    }
    // the lane itself is retained
    expect(assistantCode).toContain('generatePoster(b)');
  });

  it('the preset recipe card exposes no engine, model file or provider label', () => {
    // These are the preset fields the card actually renders.
    for (const p of presets.match(/pitfalls: '[^']*'/g) || []) {
      for (const w of ['diffusion', 'FLUX', 'SDXL', 'Qwen', 'GPT Image', 'LTX']) {
        expect(p.includes(w), `${w} in ${p}`).toBe(false);
      }
    }
  });

  it('the local-engine setup instruction is gone from the generation error path', () => {
    expect(geminiImage.includes('Start ArtValue Image Engine')).toBe(false);
    expect(geminiImage.includes('אייקון')).toBe(false);
  });

  it('no thrown generation error names an engine or tells the user to start one', () => {
    // These messages surface verbatim in the Studio error banner, and the Jake
    // hand-off can select a mode whose engine is unconfigured — so they ARE
    // user-reachable, not just internal.
    const thrown = geminiImage.match(/throw new Error\((?:'[^']*'|`[^`]*`)\)/g) || [];
    expect(thrown.length).toBeGreaterThan(5);
    for (const t of thrown) {
      for (const w of ['ComfyUI', 'Kontext', 'Stable Diffusion', 'Ollama', 'A1111', '--api', 'localhost', '127.0.0.1']) {
        expect(t.includes(w), `${w} in ${t}`).toBe(false);
      }
    }
  });

  it('RUNTIME: the workflow catalog Jake is given names no engine', async () => {
    // systemCapabilities() → the Jake system prompt (title + description). An
    // engine name here would be spoken back to the user by the assistant.
    const brain = await import('../../data/businessBrain.js');
    const caps = brain.systemCapabilities();
    expect(caps.length).toBeGreaterThan(0);
    for (const c of caps) {
      for (const w of ['ComfyUI', 'Fooocus', 'PuLID', 'Kontext', 'Qwen', 'LTX', 'SDXL', 'FLUX', 'Inpaint', 'LoRA', 'Ollama']) {
        expect(`${c.title} ${c.description}`.includes(w), `${w} in "${c.title}"`).toBe(false);
      }
    }
    // …and it no longer advertises the workflow-map screen that was removed.
    expect(caps.some((c) => c.title.includes('Workflows'))).toBe(false);
  });

  it('RUNTIME: no live workflow tag or description carries an engine name', async () => {
    const { CREATIVE_WORKFLOWS } = await import('../../data/creativeWorkflows.js');
    for (const w of CREATIVE_WORKFLOWS) {
      const text = `${w.title} ${w.subtitle} ${w.description} ${(w.tags || []).join(' ')}`;
      for (const banned of ['ComfyUI', 'Fooocus', 'PuLID', 'Kontext', 'Qwen', 'LTX', 'SDXL', 'FLUX', 'LoRA']) {
        expect(text.includes(banned), `${banned} in workflow ${w.id}`).toBe(false);
      }
    }
  });
});

describe('Studio containment · retained business-facing surfaces are untouched', () => {
  it('the business creative capabilities still render', () => {
    for (const kept of [
      'מתכוני עסק',            // business preset recipes
      'CREATIVE_PRESETS.map',
      'brand-palette-row',      // S0F.1 brand palette
      'PosterEditor',           // poster text editor
      'MockupStudio',           // mockup studio
      'ProductPlacer',          // Product Lock composite
      'גלריה (',                // gallery + history
      'filterGalleryItems',
      'buildMontage',
      'readStudioHandoff',      // Jake → Studio prefill
      'callAiGateway',          // protected prompt enhancement
    ]) {
      expect(studioCode.includes(kept), kept).toBe(true);
    }
  });

  it('every business-facing Studio route still resolves to its page', () => {
    expect(app).toContain('<Route path="/studio" element={<ImageStudio />} />');
    expect(app).toContain('<Route path="/adstudio" element={<AdStudio />} />');
  });

  it('the retired local-engine routes still redirect to the Studio (never a technical screen)', () => {
    expect(app).toContain('<Route path="/workflow" element={<Navigate to="/studio" replace />} />');
    expect(app).toContain('<Route path="/fooocus" element={<Navigate to="/studio" replace />} />');
  });

  it('navigation exposes no engine, workflow or diagnostics entry', () => {
    for (const banned of ['/workflow', '/fooocus', 'ComfyUI', 'Fooocus', 'Ollama', 'מנוע']) {
      expect(sidebarNavCode.includes(banned), banned).toBe(false);
    }
    expect(sidebarNav).toContain("{ to: '/studio', label: 'מחולל תמונות', icon: 'image' }");
  });

  it('Growth containment is unchanged (no accidental widening)', () => {
    expect(app).toContain('function GrowthBetaGate({ title, sub, children }) {');
    expect(app).toContain('if (isSupabaseConfigured) return <BetaUnavailable title={title} sub={sub} />;');
    expect((app.match(/<GrowthBetaGate/g) || []).length).toBe(5);
  });

  it('AdStudio stays contained in authenticated cloud beta', () => {
    expect(adStudioCode).toContain('if (isSupabaseConfigured) {');
    expect(adStudioCode).toContain('<BetaUnavailable title="סטודיו פרסום"');
  });
});
