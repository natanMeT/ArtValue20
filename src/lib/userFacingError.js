// ===================================================================
// userFacingError — the render boundary between diagnostic Errors and the
// text a business user is allowed to see.
//
// WHY THIS EXISTS
// The creative surfaces rendered `e.message` raw. Engine-originated failures
// therefore printed model, engine and node terminology straight into the UI —
// exactly what the containment slice was supposed to remove. The engines that
// raised those particular strings are gone (local-engine retirement,
// 2026-07-27), but the boundary stays: it is what keeps the NEXT technical
// throw — from any provider, now or later — out of the user's view.
//
// CONTRACT — classification by IDENTITY, never by substring matching:
//   - An Error is renderable ONLY if it was explicitly marked at its throw site
//     (`userSafe: true`), or carries an explicit `userMessage`.
//   - Everything else renders the caller's business-facing fallback. Unmarked
//     and unknown errors therefore FAIL CLOSED — a new technical throw added
//     later cannot leak by default; it degrades to the fallback instead.
//   - The Error object itself is never mutated or stripped: the technical
//     message stays intact in memory for debugging and telemetry. Only the
//     RENDERED string is constrained.
//
// This deliberately mirrors the structured `err.reason` pattern already used
// by the Jake poster path (`posterErrorText`), rather than inventing a second
// convention.
// ===================================================================

// Build an Error whose message is safe to show the user verbatim. Use for real
// business/validation guidance ("upload a presenter image") so those specific,
// useful messages are preserved rather than flattened into a generic one.
export function userError(message) {
  const e = new Error(String(message == null ? '' : message));
  e.userSafe = true;
  return e;
}

// Build an Error that KEEPS its technical message for diagnostics while
// declaring the business-facing text to render instead.
export function engineError(technicalMessage, userMessage) {
  const e = new Error(String(technicalMessage == null ? '' : technicalMessage));
  if (userMessage != null && String(userMessage).trim()) e.userMessage = String(userMessage);
  return e;
}

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

// Resolve what the user is shown. Order: explicit userMessage → explicitly
// user-safe message → caller's business fallback. Never returns undefined.
export function userFacingError(err, fallback) {
  const safeFallback = nonEmpty(fallback) ? fallback : 'הפעולה נכשלה כרגע. נסה/י שוב בעוד רגע.';
  if (!err || typeof err !== 'object') return safeFallback;
  if (nonEmpty(err.userMessage)) return err.userMessage;
  if (err.userSafe === true && nonEmpty(err.message)) return err.message;
  return safeFallback;
}
