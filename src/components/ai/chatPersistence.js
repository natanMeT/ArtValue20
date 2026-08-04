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
// The Offer Campaign Assistant Surface cards — `offerForm` (a live input form with
// its own transient field state) and `offerBrief` (the read-only generated brief) —
// are TRANSIENT BY DESIGN: this slice persists no offer brief at all. Excluding them
// guarantees nothing offer-related is written to chat storage, and a reload never
// restores a half-filled form or a stale brief card.
//
// The Poster MVP cards — `posterProgress`, `posterResult` and `posterError` —
// were REMOVED with the workstation engine that rendered them (local-engine
// retirement, 2026-07-27). Their keys are still listed in the transient
// predicate below, and deliberately so: a browser that stored one BEFORE the
// removal must still drop it on hydration rather than restore a card the
// Assistant can no longer render. Nothing writes these keys any more.
//
// A campaign message's `campaign.critique` is the SAME class of transient state:
// the Concept Critic view is ephemeral and recomputable, never part of the
// persisted contract. The campaign CARD still persists (concepts, original order,
// recommendedConceptId — exactly as before), but `critique` is stripped on the way
// to storage AND on hydration (so a legacy-stored critique never restores stale).
// After reload, with no critique present, the card falls back to the original V1
// order + V1 recommendation until critique is recomputed in the current session.
//
// A `handoff` message (the Assistant → Studio handoff card) is TRANSIENT BY
// DESIGN: its payload carries the full resolved business prompt text, which
// must never sit in localStorage (privacy), and a restored card could hand
// Studio stale state. It is recomputable by simply asking Jake again — so it
// is never persisted, and any legacy-stored one drops on hydration.
//
// The EXECUTABLE ACTION CARDS — `gate` (the code-gated bulk-delete picker),
// `confirm` (a single pending delete) and `preview` (a batch awaiting "אשר
// ובצע") — are TRANSIENT ACTION CONFIRMATIONS. Each one carries a SNAPSHOT
// taken when the card was built (buildBulkDeleteGate freezes the row list; a
// confirm/preview freezes the target ids), so after a reload it offers a
// destructive action the user never requested THIS session, against a list that
// may have moved underneath it — a "delete all (N)" whose N is the old count
// silently omits every row created since. Two live gate cards were observed in
// the DOM at once. They are recomputable by simply asking Jake again, so — like
// `handoff` — they are never persisted and any legacy-stored one drops on
// hydration. This is the SAME three-part reason that excluded `handoff`:
// snapshot payload, restores stale, trivially recomputable.
//
// ⚠️ A DECIDED card is NOT lost. confirmAction / cancelAction / approvePreview /
// cancelPreview REPLACE the card in place with a plain `system` text message, and
// those replacements persist exactly as before — so the record of what was done
// or cancelled survives a reload. Only an UNDECIDED card disappears.
//
// ⚠️ ACCEPTED RESIDUE, NOT AN OVERSIGHT: a gate is emitted as a PAIR — a lead-in
// `system` text ("…נדרש קוד אישור 🔒") followed by the card. After a reload the
// sentence remains and the card is gone. That is correct: the sentence is a
// truthful record of something Jake said, in the past tense. Suppressing it would
// need a render change and a coupling between two messages — more machinery than
// the residue costs.
//
// Everything else (normal/system messages, campaign cards, campaignSelect,
// productionOffer, review cards, saved confirmations) persists exactly as before.
// ===================================================================

/** A chat message that is live-only UI state and must NOT be persisted. */
export function isTransientChatMessage(m) {
  return !!(m && (m.productionProgress || m.offerForm || m.offerBrief
    || m.posterProgress || m.posterResult || m.posterError || m.handoff
    // Executable action cards — see the header block above.
    || m.gate || m.confirm || m.preview));
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
