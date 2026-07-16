// ===================================================================
// Central production-safety gate for LOCAL engine endpoints (ComfyUI,
// Fooocus, Ollama / local LLM, local Stable Diffusion).
//
// WHY: `vite build` bakes .env.local / .env values into the bundle, and
// .env.local is loaded for EVERY mode — so the studio machine's 127.0.0.1
// engine URLs end up inside hosted production builds, which then probe every
// visitor's localhost (CORS / Private-Network-Access console errors + 15s
// retry loops on the studio pages). Merely omitting the variables from
// .env.production does NOT unset them.
//
// CONTRACT:
//   - DEV builds (`vite` dev server / vitest): local engines ENABLED —
//     local development behavior is unchanged.
//   - Production builds: DISABLED BY DEFAULT, even when the build machine's
//     env carries local URLs. Explicit opt-in ONLY via
//     VITE_ENABLE_LOCAL_ENGINES=true (e.g. a deliberate intranet build that
//     really should reach the studio engines).
//   - EVERY local-engine base URL in the app MUST resolve through
//     resolveLocalEngineUrl() — no caller may read a local-engine env var or
//     hardcode a localhost fallback around it. With the gate closed the URL
//     resolves to '' and every engine's existing "not configured"
//     short-circuit prevents any fetch before it starts.
// ===================================================================

// Pure decision (unit-testable): enabled in dev, or with the explicit flag.
export function computeLocalEnginesEnabled(env) {
  return Boolean(env && (env.DEV || env.VITE_ENABLE_LOCAL_ENGINES === 'true'));
}

export const LOCAL_ENGINES_ENABLED = computeLocalEnginesEnabled(import.meta.env);

// Resolve a local-engine base URL through the gate. `devDefault` (e.g. the
// Fooocus localhost default) applies ONLY when the gate is open — a hosted
// build must never fall back to 127.0.0.1.
export function resolveLocalEngineUrl(raw, devDefault = '') {
  if (!LOCAL_ENGINES_ENABLED) return '';
  return String(raw || devDefault || '').replace(/\/$/, '');
}
