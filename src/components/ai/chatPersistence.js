// ===================================================================
// Chat-history persistence helpers (pure, no React/DOM) — kept in their own
// module so they are unit-testable without importing the whole Assistant.
//
// A `productionProgress` message is TRANSIENT UI state: it is driven live by an
// onProgress callback + an elapsed-time interval. If it were persisted to chat
// storage, a reload/navigation mid-generation would restore it with no callback
// and no interval, leaving a card stuck "in progress" forever. So it must never
// be written to history, and any legacy-stored one is dropped on hydration.
// Everything else (normal/system messages, campaign cards, review cards, saved
// confirmations) persists exactly as before.
// ===================================================================

/** A chat message that is live-only UI state and must NOT be persisted. */
export function isTransientChatMessage(m) {
  return !!(m && m.productionProgress);
}

/** The subset of messages safe to persist / safe to restore from storage. */
export function persistableChatMessages(messages) {
  return (Array.isArray(messages) ? messages : []).filter((m) => !isTransientChatMessage(m));
}
