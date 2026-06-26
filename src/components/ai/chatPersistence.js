// ===================================================================
// Chat-history persistence helpers (pure, no React/DOM) — kept in their own
// module so they are unit-testable without importing the whole Assistant.
//
// A `productionProgress` message is TRANSIENT UI state: it is driven live by an
// onProgress callback + an elapsed-time interval. If it were persisted to chat
// storage, a reload/navigation mid-generation would restore it with no callback
// and no interval, leaving a card stuck "in progress" forever. So it must never
// be written to history, and any legacy-stored one is dropped on hydration.
//
// A campaign message's `campaign.critique` is the SAME class of transient state:
// the Concept Critic view is ephemeral and recomputable, never part of the
// persisted contract. The campaign CARD still persists (concepts, original order,
// recommendedConceptId — exactly as before), but `critique` is stripped on the way
// to storage AND on hydration (so a legacy-stored critique never restores stale).
// After reload, with no critique present, the card falls back to the original V1
// order + V1 recommendation until critique is recomputed in the current session.
//
// Everything else (normal/system messages, campaign cards, review cards, saved
// confirmations) persists exactly as before.
// ===================================================================

/** A chat message that is live-only UI state and must NOT be persisted. */
export function isTransientChatMessage(m) {
  return !!(m && m.productionProgress);
}

/**
 * Return a persistence-safe COPY of a message, dropping transient sub-state.
 * Pure: never mutates the input. Currently strips `campaign.critique` (the
 * ephemeral Concept Critic view); messages without it are returned unchanged.
 */
export function sanitizeChatMessage(m) {
  if (m && m.campaign && typeof m.campaign === 'object' && 'critique' in m.campaign) {
    const { critique, ...campaignRest } = m.campaign; // drop critique only
    void critique;
    return { ...m, campaign: campaignRest };
  }
  return m;
}

/** The subset of messages safe to persist / safe to restore from storage. */
export function persistableChatMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => !isTransientChatMessage(m))
    .map(sanitizeChatMessage);
}
