// ===================================================================
// Concept-diversity validator — lightweight, deterministic, rule-based (NO
// embeddings; none exist in the repo). Ensures the three concepts are
// MEANINGFULLY different across the axes the spec lists. Returns a structured
// verdict; the action layer uses it to present-or-regenerate.
// ===================================================================

// Axes compared (per spec). STRONG axes fail the set on near-equality (hero also
// on exact match — a repeated hero is the strongest dup signal). compositionDirection
// is a WEAK/`soft` signal: a reused LAYOUT is reported but does NOT by itself fail a
// set whose angle/idea/hero/headline/visual all differ (avoids rejecting genuinely
// diverse V1 output that happens to share a layout template).
const AXES = [
  { key: 'strategicAngle', threshold: 0.6, label: 'זווית אסטרטגית' },
  { key: 'coreIdea', threshold: 0.6, label: 'רעיון מרכזי' },
  { key: 'visualDirection', threshold: 0.62, label: 'כיוון ויזואלי' },
  { key: 'heroObject', threshold: 0.55, label: 'אובייקט גיבור', exactFlags: true },
  { key: 'headlineDirection', threshold: 0.65, label: 'כיוון כותרת' },
  { key: 'compositionDirection', threshold: 0.7, label: 'כיוון קומפוזיציה', soft: true },
];

const TOKEN_RE = /[a-z0-9֐-׿]+/gi;
function tokens(s) {
  return new Set(String(s || '').toLowerCase().match(TOKEN_RE) || []);
}
function jaccard(a, b) {
  if (!a.size && !b.size) return 1; // both empty → identical
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((t) => { if (b.has(t)) inter += 1; });
  return inter / (a.size + b.size - inter);
}
const normEq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/**
 * Validate that exactly N concepts are meaningfully different.
 * @param {import('./types').CreativeConcept[]} concepts
 * @param {{ expected?: number }} [opts]
 * @returns {{ ok: boolean, action: 'present'|'regenerate', issues: Array<{pair:[number,number], axis:string, label:string, similarity:number, message:string}> }}
 */
export function validateConceptDiversity(concepts, opts = {}) {
  const expected = opts.expected || 3;
  const issues = [];

  if (!Array.isArray(concepts) || concepts.length !== expected) {
    return {
      ok: false,
      action: 'regenerate',
      issues: [{ pair: [-1, -1], axis: 'count', label: 'מספר קונספטים', similarity: 1, message: `נדרשים בדיוק ${expected} קונספטים, התקבלו ${Array.isArray(concepts) ? concepts.length : 0}` }],
    };
  }

  for (let i = 0; i < concepts.length; i += 1) {
    for (let j = i + 1; j < concepts.length; j += 1) {
      const a = concepts[i];
      const b = concepts[j];
      for (const axis of AXES) {
        const va = a[axis.key];
        const vb = b[axis.key];
        const exact = normEq(va, vb);
        const sim = jaccard(tokens(va), tokens(vb));
        if ((axis.exactFlags && exact) || sim >= axis.threshold) {
          issues.push({
            pair: [i, j],
            axis: axis.key,
            label: axis.label,
            soft: !!axis.soft,
            similarity: Math.round(sim * 100) / 100,
            message: exact
              ? `קונספט ${i + 1} ו-${j + 1} חולקים אותו ${axis.label}`
              : `קונספט ${i + 1} ו-${j + 1} דומים מדי ב${axis.label} (${Math.round(sim * 100)}%)`,
          });
        }
      }
    }
  }

  // Only STRONG-axis collisions fail the set; soft (layout) issues are informational.
  const blocking = issues.filter((i) => !i.soft);
  return { ok: blocking.length === 0, action: blocking.length === 0 ? 'present' : 'regenerate', issues };
}
