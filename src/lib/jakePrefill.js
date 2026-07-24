// ===================================================================
// jakePrefill (S0E · M2) — PURE helper for the additive `jake:prefill`
// browser-event seam. It places suggested text into Jake's composer
// WITHOUT sending it.
//
// By construction it has NO access to send / chatJake / draftWithJake /
// forceActionsJake / Gateway / dispatch / fetch — the injected `ctx`
// exposes ONLY { open, getInput, setInput }. So "no auto-send" is a
// structural property, provable behaviorally (a ctx may carry a `send`
// spy; this function can never reach it).
//
// Rules:
//   * blank/whitespace/invalid text → do nothing (don't even open);
//   * valid text → open the Jake panel;
//   * composer empty → fill it with the text;
//   * composer already has non-empty user text → preserve it verbatim
//     (never overwrite), still open.
// It never appends a chat message and never touches chat history.
// ===================================================================

export function applyJakePrefill(detail, ctx) {
  const text = detail && typeof detail.text === 'string' ? detail.text : '';
  if (!text.trim()) return { opened: false, filled: false };

  if (ctx && typeof ctx.open === 'function') ctx.open();

  const current = ctx && typeof ctx.getInput === 'function' ? ctx.getInput() : '';
  if (String(current == null ? '' : current).trim()) {
    // existing user text — preserve verbatim, do not overwrite.
    return { opened: true, filled: false };
  }

  if (ctx && typeof ctx.setInput === 'function') ctx.setInput(text);
  return { opened: true, filled: true };
}
