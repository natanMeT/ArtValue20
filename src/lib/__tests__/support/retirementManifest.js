// ===================================================================
// RETIREMENT MANIFEST — the single authoritative record of what the
// local-engine / Product Lock retirement removed.
//
// WHY THIS FILE EXISTS. The regression suite used to carry two hand-written
// lists inline: a `DELETED_MODULES` array and a `LOCAL_ENV_VARS` array. Both
// were incomplete, and Codex found them so on `753ee2e`:
//
//   P2 — the removed-module set omitted implementations this PR actually
//        deleted (`comfyProgress.js`, `geminiImage.js`, `productLock.js`,
//        `ProductPlacer.jsx`, `local-review-prep.mjs`).
//   P2 — the retired-variable set omitted most of the ComfyUI configuration
//        family (the PuLID / Kontext / Qwen / LTX / SVD / FLUX-tuning
//        variables, and `VITE_JAKE_CLOUD_MODEL`).
//
// The lists were incomplete because they were WRITTEN, not DERIVED. So the
// contents below were derived mechanically and are recorded with the command
// that produced them, so the next person can re-derive rather than re-guess:
//
//   modules   git diff --diff-filter=D --name-only \
//               5d7506d1..HEAD -- . | grep -v __tests__
//             (plus the earlier retirement commits `1233034`, `705575a`,
//             `95e70a1`, each named against its entry below)
//
//   env vars  comm -23 <(git grep -hoE 'VITE_[A-Z0-9_]+' 5d7506d1 -- src supabase scripts \
//                          ':(exclude)*__tests__*' ':(exclude)*.test.*' | sort -u) \
//                      <(git grep -hoE 'VITE_[A-Z0-9_]+' HEAD   -- src supabase scripts \
//                          ':(exclude)*__tests__*' ':(exclude)*.test.*' | sort -u)
//             unioned with the `VITE_*` assignments this PR removed from
//             `.env.example`, minus everything production still reads.
//
// SCOPE DISCIPLINE. This is a manifest of the RETIREMENT — specific modules,
// variables, providers, routes and scripts that were removed and must not come
// back. It is deliberately NOT a general policy about networking, address
// classes or future code. Terminology scanning (engine names, loopback
// addresses) remains in `sourceScan.js` as SUPPORTING evidence; it is not how
// this set is discovered, because word-boundary matching is exactly what let
// `VITE_COMFYUI_QWEN_VAE` and `src/lib/comfyProgress.js` slip through before.
// ===================================================================

/**
 * Every production module deliberately deleted by the retirement.
 * `since` names the commit that removed it, so an entry can be checked against
 * history rather than taken on trust.
 */
export const RETIRED_MODULES = Object.freeze([
  // ── removed by this PR (derived from the PR diff) ──────────────────
  { path: 'src/lib/localEngines.js', since: '1233034', what: 'local-engine gate + probe' },
  { path: 'src/lib/comfyPoster.js', since: '1233034', what: 'ComfyUI poster job submission' },
  { path: 'src/lib/comfyProgress.js', since: '1233034', what: 'ComfyUI job progress polling' },
  { path: 'src/lib/geminiImage.js', since: '1233034', what: 'hybrid local/cloud image lane' },
  { path: 'src/lib/productLock.js', since: '1233034', what: 'Product Lock engine' },
  { path: 'src/creative/v2/poster/comfyPosterPrompt.js', since: '1233034', what: 'ComfyUI poster prompt builder' },
  { path: 'src/components/ai/posterOverlay.js', since: '1233034', what: 'local poster overlay' },
  { path: 'src/components/ai/posterExport.js', since: '1233034', what: 'local poster export' },
  { path: 'src/components/studio/ProductPlacer.jsx', since: '1233034', what: 'Product Lock placement UI' },
  { path: 'src/pages/AdStudio.jsx', since: '1233034', what: 'local-engine ad studio page' },
  { path: 'scripts/local-review-prep.mjs', since: '1233034', what: 'developer CLI calling a local Ollama' },

  // ── removed by the earlier rounds of the same retirement ───────────
  { path: 'src/lib/localComfyEngine.js', since: '1233034', what: 'ComfyUI HTTP client' },
  { path: 'src/components/studio/CreativeWorkflowMap.jsx', since: '95e70a1', what: 'ComfyUI/Fooocus-badged workflow map' },
  { path: 'src/pages/Fooocus.jsx', since: '705575a', what: 'Fooocus page' },
  { path: 'src/pages/WorkflowStudio.jsx', since: '705575a', what: 'workflow studio page' },
]);

/** Just the paths — the form most assertions want. */
export const RETIRED_MODULE_PATHS = Object.freeze(RETIRED_MODULES.map((m) => m.path));

/**
 * Import-specifier fragments that identify a retired module. Derived from the
 * manifest basenames rather than typed out, so adding a module to
 * `RETIRED_MODULES` automatically extends the no-orphan-importer assertion.
 */
export const RETIRED_SPECIFIER_FRAGMENTS = Object.freeze(
  [...new Set(RETIRED_MODULE_PATHS.map((p) => p.split('/').pop().replace(/\.(jsx?|mjs|tsx?)$/, '')))],
);

/**
 * Every retired local-engine / model / capability configuration variable.
 *
 * Derived, not recalled: production reads at the PR base minus production reads
 * at HEAD, unioned with the `.env.example` assignments this PR removed. A
 * variable belongs here only if NOTHING in production reads it any more — the
 * seven still-live variables (`VITE_SUPABASE_*`, `VITE_GEMINI_API_KEY`,
 * `VITE_GEMINI_MODEL`, `VITE_POLLINATIONS_*`, `VITE_READER_PROXY`) are
 * deliberately absent.
 */
export const RETIRED_ENV_VARS = Object.freeze([
  // engine endpoints and the master gate
  'VITE_ENABLE_LOCAL_ENGINES',
  'VITE_LOCAL_LLM_URL',
  'VITE_LOCAL_IMAGE_URL',
  'VITE_COMFYUI_URL',
  'VITE_FOOOCUS_URL',

  // local text-model selection
  'VITE_LOCAL_LLM_MODEL',
  'VITE_CREATIVE_LLM_MODEL',
  'VITE_JAKE_MODEL',
  'VITE_JAKE_BRAIN',
  'VITE_JAKE_CLOUD_MODEL',

  // ComfyUI checkpoints / capability models — the family the old word-boundary
  // list missed almost entirely
  'VITE_COMFYUI_MODEL',
  'VITE_COMFYUI_FLUX_MODEL',
  'VITE_COMFYUI_FLUX_LORA',
  'VITE_COMFYUI_FLUX_LORA_STRENGTH',
  'VITE_COMFYUI_FLUX_GUIDANCE',
  'VITE_COMFYUI_UPSCALE_MODEL',
  'VITE_COMFYUI_FACE_BBOX',
  'VITE_COMFYUI_KONTEXT_MODEL',
  'VITE_COMFYUI_SVD_MODEL',
  'VITE_COMFYUI_PULID',
  'VITE_COMFYUI_PULID_MODEL',
  'VITE_COMFYUI_QWEN_EDIT',
  'VITE_COMFYUI_QWEN_UNET',
  'VITE_COMFYUI_QWEN_CLIP',
  'VITE_COMFYUI_QWEN_VAE',
  'VITE_COMFYUI_QWEN_LIGHTNING',
  'VITE_COMFYUI_LTX_MODEL',
  'VITE_COMFYUI_LTX_CLIP',

  // configured the deleted hybrid image lane (`geminiImage.js`)
  'VITE_GEMINI_IMAGE_MODEL',
]);

/** Provider names the AI Gateway must never register again. */
export const RETIRED_PROVIDERS = Object.freeze([
  'comfyui', 'ollama', 'fooocus', 'a1111', 'automatic1111',
]);

/** Routes the retirement removed. A retired deep link must fail safe. */
export const RETIRED_ROUTES = Object.freeze([
  '/adstudio', '/workflow', '/fooocus',
]);

/** Terms no `package.json` script may contain. */
export const RETIRED_SCRIPT_TERMS = Object.freeze([
  'ollama', 'comfy', 'fooocus', 'a1111', 'localhost', '127.0.0.1',
]);
