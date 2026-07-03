// ===================================================================
// askJake — the ONLY place that dispatches the existing `jake:ask`
// assistant seam (Assistant.jsx listens; DemoMode is the other user of
// the seam). Fire-and-forget: no assistant/engine/provider imports, no
// storage, no network, no side effects on import. Must be called from
// an explicit user click handler — never on render or in effects.
// ===================================================================

// Dispatch `prompt` to Jake via the window event seam.
// Returns true only when a valid prompt was actually dispatched;
// returns false (never throws) for invalid prompts or non-browser
// environments (missing window/CustomEvent, e.g. tests/SSR).
export function askJake(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) return false;
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return false;
  if (typeof CustomEvent !== 'function') return false;
  window.dispatchEvent(new CustomEvent('jake:ask', { detail: prompt }));
  return true;
}
