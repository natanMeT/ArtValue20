// ===================================================================
// Human golden judgments — one per brief, PINNED to the committed snapshot sample
// (snapshotRef: "<brief>#sample0"). Authored as an independent human read of the
// concepts, NOT reverse-engineered from the critic. It deliberately includes a
// genuine Top-1 disagreement (b03: the human prefers concept-2; the deterministic
// critic prefers concept-1) so the evaluation surfaces real divergence rather than
// flattering the critic. Labels: best | acceptable | weak | reject.
// ===================================================================

export const GOLDENS = Object.freeze({
  b01: { briefId: 'b01', snapshotRef: 'b01#sample0',
    labels: { 'concept-1': 'best', 'concept-2': 'acceptable', 'concept-3': 'acceptable' },
    preferredOrder: ['concept-1', 'concept-2', 'concept-3'],
    mustNotReject: ['concept-1'], notes: 'control-tower is the strongest distinct idea' },

  b02: { briefId: 'b02', snapshotRef: 'b02#sample0',
    labels: { 'concept-1': 'acceptable', 'concept-2': 'best', 'concept-3': 'acceptable' },
    preferredOrder: ['concept-2', 'concept-1', 'concept-3'],
    mustNotReject: ['concept-2'], notes: 'neighborhood-belonging matches the key message best' },

  b03: { briefId: 'b03', snapshotRef: 'b03#sample0',
    labels: { 'concept-1': 'acceptable', 'concept-2': 'best', 'concept-3': 'reject' },
    preferredOrder: ['concept-2', 'concept-1', 'concept-3'],
    mustNotReject: ['concept-2'], shouldReject: ['concept-3'], generic: ['concept-3'],
    notes: 'human prefers the experience-led window (c2); c3 is generic success-language' },

  b04: { briefId: 'b04', snapshotRef: 'b04#sample0',
    labels: { 'concept-1': 'best', 'concept-2': 'acceptable', 'concept-3': 'weak' },
    preferredOrder: ['concept-1', 'concept-2', 'concept-3'],
    mustNotReject: ['concept-1'], shouldDemote: ['concept-3'], nearDupPairs: [['concept-2', 'concept-3']],
    notes: 'c3 is a near-duplicate of c2; keep the stronger c2' },

  b05: { briefId: 'b05', snapshotRef: 'b05#sample0',
    labels: { 'concept-1': 'best', 'concept-2': 'acceptable', 'concept-3': 'acceptable' },
    preferredOrder: ['concept-1', 'concept-3', 'concept-2'],
    mustNotReject: ['concept-1'], notes: 'motion energy is the classic sales winner' },

  b06: { briefId: 'b06', snapshotRef: 'b06#sample0',
    labels: { 'concept-1': 'best', 'concept-2': 'acceptable', 'concept-3': 'acceptable' },
    preferredOrder: ['concept-1', 'concept-3', 'concept-2'],
    mustNotReject: ['concept-1'], strongUnusual: ['concept-2'],
    notes: 'safe clear concept is the human best; c2 is a strong-but-unconventional alternative that must survive' },

  b07: { briefId: 'b07', snapshotRef: 'b07#sample0',
    labels: { 'concept-1': 'best', 'concept-2': 'acceptable', 'concept-3': 'reject' },
    preferredOrder: ['concept-1', 'concept-2', 'concept-3'],
    mustNotReject: ['concept-1'], shouldReject: ['concept-3'],
    notes: 'c3 piles up competing objects (overload)' },

  b08: { briefId: 'b08', snapshotRef: 'b08#sample0',
    labels: { 'concept-1': 'best', 'concept-2': 'acceptable', 'concept-3': 'acceptable' },
    preferredOrder: ['concept-1', 'concept-3', 'concept-2'],
    mustNotReject: ['concept-1'], notes: 'clasped hands is the strongest emotional hook' },

  b09: { briefId: 'b09', snapshotRef: 'b09#sample0',
    labels: { 'concept-1': 'best', 'concept-2': 'weak', 'concept-3': 'acceptable' },
    preferredOrder: ['concept-1', 'concept-3', 'concept-2'],
    mustNotReject: ['concept-1'], shouldDemote: ['concept-2'], generic: ['concept-2'],
    notes: 'c2 is generic/placeholder-hero; demote, do not necessarily reject' },

  b10: { briefId: 'b10', snapshotRef: 'b10#sample0',
    labels: { 'concept-1': 'acceptable', 'concept-2': 'best', 'concept-3': 'acceptable' },
    preferredOrder: ['concept-2', 'concept-1', 'concept-3'],
    mustNotReject: ['concept-2'], notes: 'mechanic-hands matches the "in good hands" key message' },
});
