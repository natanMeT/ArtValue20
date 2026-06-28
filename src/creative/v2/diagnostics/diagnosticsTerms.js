// ===================================================================
// diagnosticsTerms — PURE DATA for the offline concept-diagnostics layer (Phase 0A).
//
// OFFLINE-ONLY / RUNTIME-INERT: no runtime module imports the diagnostics layer, so
// nothing here is ever loaded at runtime. This file adds NO new critic thresholds and
// CHANGES none — `CRITIC_THRESHOLDS` in criticTerms.js is untouched. The constants
// below are diagnostic-LOCAL and used solely to PROFILE concepts (expose signals),
// never to drive a selection / rerank / recommendation.
//
// Pure data + frozen arrays only. No logic, no React, no provider, no I/O.
// ===================================================================

// Diagnostic-local thresholds (0..1 unless noted). DELIBERATELY separate from
// CRITIC_THRESHOLDS so this layer can never alter critic behavior. These gate the
// boolean `flag` on each signal; the numeric `score` is always reported regardless.
export const DIAGNOSTIC_THRESHOLDS = Object.freeze({
  IDEA_STRENGTH_HIGH: 0.66,        // idea is strong enough to be worth rescuing (rule 1/6)
  EXECUTION_POLISH_LOW: 0.55,      // execution / language is rough (rule 1/6)
  STRONG_UNUSUAL_ORIGINALITY: 0.8, // V1 originality >= 8/10 qualifies as strong-unusual (rule 2)
  POSTER_POTENTIAL_HIGH: 0.6,      // poster/campaign potential bar (rule 5)
  CLIENT_USABILITY_OK: 0.5,        // usable-for-a-client bar (separate from creative value, rule 7)
  VISUAL_EXPLAINABLE_OK: 0.5,      // the visual can be clearly rendered/explained
  GENERICITY_FLAG: 0.5,            // genericity worth surfacing as a warning
  NEAR_DUP_FLAG: 0.55,             // blocking similarity that marks a near-duplicate
});

// Bilingual concrete-object lexicon for the RECOGNITION-GATED heroObjectMismatch
// check. Each entry pairs a canonical object with its he+en surface tokens. The
// check is intentionally CONSERVATIVE: a mismatch fires only when BOTH (a) the
// heroObject is recognized here and none of its synonyms appear in the descriptive
// text, AND (b) a DIFFERENT recognized object's synonym DOES appear in that text.
// Unknown objects therefore never produce a false positive — recall is limited by
// design (a diagnostic signal, not a guarantee). Homograph caveat: a few tokens are
// ambiguous (e.g. 'עץ' = tree OR wood); this only matters when the hero synonym is
// absent, and is accepted as a documented precision limit of an offline heuristic.
export const OBJECT_LEXICON = Object.freeze([
  { key: 'tree', syn: Object.freeze(['tree', 'trees', 'עץ', 'עצים']) },
  { key: 'mug', syn: Object.freeze(['mug', 'cup', 'coffee', 'ספל', 'כוס', 'קפה']) },
  { key: 'tower', syn: Object.freeze(['tower', 'מגדל']) },
  { key: 'desk', syn: Object.freeze(['desk', 'table', 'שולחן']) },
  { key: 'screen', syn: Object.freeze(['screen', 'monitor', 'מסך']) },
  { key: 'key', syn: Object.freeze(['key', 'מפתח']) },
  { key: 'window', syn: Object.freeze(['window', 'חלון']) },
  { key: 'candle', syn: Object.freeze(['candle', 'נר']) },
  { key: 'book', syn: Object.freeze(['book', 'ספר']) },
  { key: 'hand', syn: Object.freeze(['hand', 'hands', 'יד', 'ידיים', 'כף']) },
  { key: 'bike', syn: Object.freeze(['bike', 'bicycle', 'אופניים', 'אופני']) },
  { key: 'car', syn: Object.freeze(['car', 'vehicle', 'רכב', 'מכונית']) },
  { key: 'plate', syn: Object.freeze(['plate', 'dish', 'צלחת', 'מנה']) },
  { key: 'drop', syn: Object.freeze(['drop', 'droplet', 'serum', 'טיפה', 'סרום']) },
  { key: 'money', syn: Object.freeze(['money', 'cash', 'coin', 'coins', 'banknote', 'banknotes', 'כסף', 'שטר', 'שטרות', 'מטבע', 'מטבעות']) },
  { key: 'engine', syn: Object.freeze(['engine', 'motor', 'מנוע']) },
  { key: 'shelf', syn: Object.freeze(['shelf', 'shelves', 'מדף', 'מדפים']) },
]);

// Curated broken/garbled tokens for incoherentLanguage. Small + EXPLICIT; the
// structural garble heuristics in conceptDiagnostics.js (final-form misuse,
// intra-token latin/hebrew mixing, 3x char runs) catch additional garbling
// generically. 'שאחטה' is the example broken token from the failure notes.
export const INCOHERENT_TOKENS = Object.freeze(['שאחטה']);
