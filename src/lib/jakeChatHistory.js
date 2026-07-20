// ===================================================================
// Jake chat history selector (M2 J2 preview hotfix) — CALLER-side
// conversation selection for the Gateway chat lane (chatJake).
//
// The Assistant UI legitimately shows assistant-first records — the proactive
// morning briefing, persisted greetings — but the deployed server chat input
// contract requires the model conversation to OPEN on a real user turn.
// Conversation selection is the CALLER's authority: this pure helper picks
// the valid chat window BEFORE chatJake is called; the chatJake mapper stays
// a byte-exact carrier of whatever it receives (it never trims / drops /
// coerces / reorders / repairs).
//
// Selection = the SAME candidate rule the caller has always used (textual,
// non-system records), then the SAME maximum window (last `maxMessages`),
// then the window OPENS at the first user message. Selected messages keep
// their role, text bytes, and order untouched — the very same objects are
// returned, nothing is rewritten, and no user turn is ever manufactured.
// UI-only records (system notes, previews/confirm cards, gates, handoffs,
// campaigns — anything without a truthy `text`) stay outside model history
// exactly as before. If the window holds no user message there is NO valid
// conversation → [] (the caller's error path handles it; nothing is sent).
// ===================================================================

export const JAKE_CHAT_HISTORY_WINDOW = 14;

export function selectJakeChatHistory(messages, maxMessages = JAKE_CHAT_HISTORY_WINDOW) {
  const list = Array.isArray(messages) ? messages : [];
  const textual = list.filter((m) => m && m.text && !m.system);
  const recent = textual.slice(-maxMessages);
  const firstUser = recent.findIndex((m) => m.role === 'user');
  return firstUser === -1 ? [] : recent.slice(firstUser);
}
