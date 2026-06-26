// ===================================================================
// productionBriefEngine — the SINGLE engine of this slice. From a selected
// CreativeConcept it produces a ProductionPackage DRAFT (status 'draft', not
// persisted): creativeCore (preserve + deterministic derive + genericityRisk),
// a Hebrew copyPackage (via the injected draftCopy seam → existing draftWithJake),
// a deterministic visualBrief, and a deterministic English imagePrompt with a
// no-text negative prompt.
//
// It does NOT: call a new provider, build a Visual Metaphor / Hebrew Wordplay
// Engine, render an image, generate typography, make a PosterSpec, or publish.
// The copy brain is INJECTED (`draftCopy`) so tests never hit a real model and
// the composition root is the only place the real seam is wired.
//
// An OPTIONAL progress seam (opts.onProgress) emits real per-stage events. It is
// failure-safe and no-op when absent, so the engine behaves exactly as before
// when no callback is provided. No progress is persisted; nothing here touches
// React or the browser.
// ===================================================================
import { createProgressEmitter, PROGRESS_STATUS } from './productionProgress.js';

export class ProductionEngineError extends Error {
  constructor(code, message) { super(message); this.name = 'ProductionEngineError'; this.code = code; }
}

// The adapter's hero-object fallback string (a generic placeholder) — its
// presence is a genericity signal.
const GENERIC_HERO_FALLBACK = 'אובייקט מרכזי בקומפוזיציה';
// Deterministic blocklist of generic marketing clichés (he + en) — success /
// power / quality / leadership language that signals a non-specific concept.
const GENERIC_TERMS = [
  'הצלחה', 'מצליח', 'הכוח', 'כוח', 'המפתח', 'איכות', 'איכותי', 'הטוב ביותר', 'הטובה ביותר',
  'שירות מקצועי', 'מקצועי', 'מקצועיות', 'מוביל', 'מובילה', 'פתרון', 'נוכחות', 'חוויה',
  'מהפכה', 'פורץ דרך', 'חדשנות', 'מספר 1', 'גלה את',
  'success', 'power', 'best', 'leading', 'quality', 'solution', 'ultimate',
];
// Mixed-language marketing clichés — an English slogan dropped into Hebrew copy.
const MIXED_CLICHE = [/one[\s-]?stop[\s-]?shop/i, /all[\s-]?in[\s-]?one/i, /game[\s-]?changer/i, /next[\s-]?level/i, /must[\s-]?have/i];
const HEBREW_RE = /[֐-׿]/;
const LATIN_RUN = /[A-Za-z]{3,}/;
// Deterministic no-text negative prompt — guarantees no letters are drawn into
// the AI image (text is a separate layer, added later, out of this slice's scope).
const NO_TEXT_NEGATIVE = 'text, letters, words, typography, captions, watermark, logo, signature, label, lettering, numbers';

const ASPECT_BY_FORMAT = { '1:1': '1:1', '4:5': '4:5', '9:16': '9:16', '16:9': '16:9', A4: '4:5', A5: '4:5' };

// Returns a trimmed string only if it is non-empty AND Hebrew-free; else ''.
function ensureEnglish(s) {
  const t = String(s || '').trim();
  return t && !HEBREW_RE.test(t) ? t : '';
}

// ---- deterministic genericity guard (no model) ----
// Scans the whole concept (not just headline+core) for: generic success/power/
// quality vocabulary, mixed-language clichés, untranslated English inside Hebrew,
// metaphor overload (long/abstract), thin metaphor, and low upstream originality.
function deriveGenericityRisk(concept) {
  const reasons = [];
  let score = 0;

  const blob = ['name', 'strategicAngle', 'coreIdea', 'headlineDirection', 'visualDirection', 'whyItWorks']
    .map((k) => String(concept[k] || '')).filter(Boolean).join(' \n ');

  // 1) generic / placeholder hero object
  const hero = String(concept.heroObject || '').trim();
  if (!hero || hero === GENERIC_HERO_FALLBACK) { reasons.push('אובייקט הגיבור גנרי/חלופי'); score += 2; }

  // 2) generic success / power / quality vocabulary
  const hits = Array.from(new Set(GENERIC_TERMS.filter((t) => blob.includes(t))));
  if (hits.length) { reasons.push(`שפה גנרית (הצלחה/כוח/איכות): ${hits.join(', ')}`); score += Math.min(hits.length, 3); }

  // 3) mixed-language cliché, or any untranslated English slogan inside Hebrew copy
  if (MIXED_CLICHE.some((re) => re.test(blob))) {
    reasons.push('סלוגן אנגלי בתוך קופי עברי (קלישאה רב-לשונית)'); score += 2;
  } else if (HEBREW_RE.test(blob) && LATIN_RUN.test(blob)) {
    reasons.push('אנגלית לא מתורגמת בתוך קופי עברי'); score += 1;
  }

  // 4) visual-metaphor overload (long/abstract/multi-object) or, conversely, too thin
  const metaphor = String(concept.visualDirection || '').trim();
  if (metaphor.length > 160) { reasons.push('תיאור המטאפורה ארוך/עמוס/מופשט מדי'); score += 1; }
  else if (metaphor.length < 18) { reasons.push('המטאפורה הוויזואלית כללית/דקה מדי'); score += 1; }

  // 5) low originality reported by the upstream concept
  const orig = Number(concept.originalityScore);
  if (Number.isFinite(orig) && orig < 6) { reasons.push('ציון מקוריות נמוך'); score += 2; }

  const level = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';
  return { level, score, reasons };
}

// ---- creativeCore: preserve (3) + deterministic derive (3) + risk ----
function deriveCreativeCore(concept) {
  return {
    creativeMechanism: concept.strategicAngle,   // PRESERVED
    visualMetaphor: concept.visualDirection,      // PRESERVED
    wordplayDirection: concept.headlineDirection, // DERIVED (verbal play lives in the headline direction)
    surpriseMechanism: concept.coreIdea,          // DERIVED (the unexpected core)
    heroObject: concept.heroObject,               // PRESERVED (one dominant Hero Object)
    memoryHook: concept.whyItWorks || concept.coreIdea, // DERIVED (why it sticks)
    genericityRisk: deriveGenericityRisk(concept),
  };
}

// ---- visualBrief: deterministic; REUSES the same hero object ----
function deriveVisualBrief(concept, core) {
  return {
    heroObject: core.heroObject, // single Hero Object — no divergence
    vibe: concept.emotionalTone || '',
    palette: Array.isArray(concept.colorDirection) ? concept.colorDirection.slice() : [],
    compositionNote: concept.compositionDirection || '',
    do: ['נקודת מיקוד אחת ודומיננטית', 'טקסט עברי קריא בשכבה נפרדת', 'ניגודיות גבוהה'],
    dont: ['סטוק גנרי', 'טקסט בתוך התמונה', 'ריבוי מוקדים מתחרים'],
  };
}

// ---- imagePrompt: deterministic English scaffold + no-text negative ----
// CONTRACT: promptEn is ENGLISH ONLY. Hebrew source fields are never inserted
// directly — heroEn/conceptEn arrive pre-translated + Hebrew-sanitized from
// build(). A final hard guard drops any clause that still contains Hebrew, so a
// failed/garbled translation degrades to a usable English-only skeleton.
function buildImagePrompt({ heroEn, conceptEn, palette, format }) {
  const parts = [
    'Premium advertising key visual.',
    `Single dominant hero object: ${heroEn}.`,
    conceptEn ? `Visual concept: ${conceptEn}.` : '',
    'Composition: one dominant focal point, high contrast, generous clean negative space.',
    palette ? `Color palette: ${palette}.` : '',
    'Style: cinematic, minimalist-rich, grounded surrealism, photographic, premium.',
    'Reserve clean negative space for text that is added later as a separate layer — no text rendered in the image.',
  ];
  // Hard guard: a clause survives only if it is present AND Hebrew-free.
  const promptEn = parts.filter((p) => p && !HEBREW_RE.test(p)).join(' ');
  return { promptEn, negativeEn: NO_TEXT_NEGATIVE, aspect: ASPECT_BY_FORMAT[format] || '4:5' };
}

// ---- Hebrew copy: prompt the injected brain, then parse deterministically ----
function buildCopyPrompt(concept, core) {
  return [
    'אתה קופירייטר ישראלי. נסח קופי קצר לקמפיין על בסיס הקונספט הבא בלבד — אל תמציא רעיון חדש ואל תסטה ממנו.',
    'החזר בדיוק בפורמט הזה, שורה לכל שדה:',
    'כותרת: <כותרת חדה אחת>',
    'תת-כותרת: <משפט תומך אחד>',
    'קריאה לפעולה: <קריאה קצרה>',
    'גוף: <משפט גוף אחד>',
    '',
    `מנגנון יצירתי: ${core.creativeMechanism}`,
    `רעיון מרכזי: ${concept.coreIdea}`,
    `כיוון כותרת: ${concept.headlineDirection}`,
    `אובייקט גיבור: ${core.heroObject}`,
    '',
    'כללי כתיבה (חובה):',
    '- עברית טבעית של דובר ילידי. בלי תרגום מילולי ובלי תחביר מאנגלית.',
    '- בלי אנגלית מיותרת ובלי סלוגנים באנגלית (לא "One Stop Shop", לא "Game Changer").',
    '- אסור להשתמש במילים גנריות כמו "הצלחה", "כוח", "הטוב ביותר", "איכותי", "פתרון מוביל" — אלא אם הן מגובות בעובדה קונקרטית מהקונספט.',
    '- קצר, חד ומוכן לשימוש מסחרי. בלי קלישאות ובלי מילוי.',
    '- אל תמציא מספרים, נתונים או עובדות. עברית בלבד.',
  ].join('\n');
}

// ---- deterministic copy-lint guard (no model in tests; one retry max) ----
// Narrow, PINNED blocklist of generic marketing phrases. A soft prompt rule does
// not reliably stop the local model from emitting these, so we detect + retry.
const GENERIC_COPY_PHRASES = [
  'הצלחה מובטחת', 'גלה את הכוח', 'One Stop Shop',
  'הצלחה', 'כוח', 'הטוב ביותר', 'מוביל', 'איכות', 'מקצועיות', 'חדשנות', 'פתרון',
];
// Pinned amount by which a still-generic copy raises the package genericityRisk.
const COPY_RISK_BUMP = 2;

function findGenericCopyPhrases(copy) {
  const blob = [copy.headline, copy.subline, copy.cta, ...(copy.bodyVariants || [])]
    .filter(Boolean).join(' \n ');
  return Array.from(new Set(GENERIC_COPY_PHRASES.filter((p) => blob.includes(p))));
}

// One stricter rewrite: name the offending phrases and demand concrete copy.
function buildCopyRewritePrompt(concept, core, phrases) {
  return [
    'הקופי הקודם השתמש בביטויים שיווקיים גנריים ואסורים. שכתב אותו לגרסה קונקרטית וספציפית לעסק.',
    `ביטויים אסורים שיש להחליף לחלוטין (אל תשתמש בהם ולא בנרדפים גנריים): ${phrases.join(', ')}.`,
    'השתמש בשפה מוחשית הנגזרת מהקונספט בלבד. אל תמציא רעיון חדש.',
    'החזר בדיוק בפורמט הזה, שורה לכל שדה:',
    'כותרת: <כותרת חדה אחת>',
    'תת-כותרת: <משפט תומך אחד>',
    'קריאה לפעולה: <קריאה קצרה>',
    'גוף: <משפט גוף אחד>',
    '',
    `מנגנון יצירתי: ${core.creativeMechanism}`,
    `רעיון מרכזי: ${concept.coreIdea}`,
    `אובייקט גיבור: ${core.heroObject}`,
    'עברית טבעית, קצרה ומסחרית. בלי אנגלית מיותרת. אל תמציא נתונים.',
  ].join('\n');
}

// Raise a genericityRisk by a pinned amount, re-deriving level on the same thresholds.
function bumpGenericityRisk(risk, amount, reason) {
  const score = (Number(risk.score) || 0) + amount;
  const reasons = [...(risk.reasons || []), reason];
  const level = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';
  return { level, score, reasons };
}

function pick(text, labels) {
  for (const lab of labels) {
    const re = new RegExp(`${lab}\\s*[:：]\\s*(.+)`);
    const m = text.match(re);
    if (m && m[1].trim()) return m[1].trim();
  }
  return '';
}

// Parse the drafted copy; every field has a deterministic, never-empty fallback
// to the concept so an empty/failed draft still yields a usable package.
function parseCopy(raw, concept) {
  const t = String(raw || '');
  const headline = pick(t, ['כותרת', 'headline']) || concept.headlineDirection || concept.coreIdea || 'כותרת';
  const subline = pick(t, ['תת-כותרת', 'תת כותרת', 'subline']) || concept.coreIdea || '';
  const cta = pick(t, ['קריאה לפעולה', 'call to action', 'cta', 'קריאה']) || 'דברו איתנו';
  let body = pick(t, ['גוף', 'body']);
  const bodyVariants = body ? [body] : [concept.coreIdea || headline];
  return { headline, subline, cta, bodyVariants };
}

/**
 * Build the production engine.
 * @param {{ draftCopy: (promptText:string)=>Promise<string>,
 *           translateToEn?: (heText:string)=>Promise<string> }} deps
 *   draftCopy: injected Hebrew copy seam (required).
 *   translateToEn: OPTIONAL injected he→en seam for the image prompt. When absent,
 *   promptEn still stays English-only via deterministic fallbacks.
 */
export function createProductionBriefEngine(deps = {}) {
  const { draftCopy, translateToEn } = deps;
  if (typeof draftCopy !== 'function') {
    throw new ProductionEngineError('MISCONFIGURED', 'production engine requires a draftCopy seam');
  }

  return {
    /**
     * Produce a ProductionPackage DRAFT from a selected concept. No persistence.
     * @param {object} concept - a CreativeConcept
     * @param {{ campaignId?:string, conceptId?:string, tenantId?:string, format?:string }} [opts]
     */
    async build(concept, opts = {}) {
      if (!concept || !concept.id) throw new ProductionEngineError('NO_CONCEPT', 'build requires a selected concept');

      // Optional, failure-safe progress. `stage` always names the work currently
      // in flight so the outer catch can label the REAL failing stage (never a
      // generic one). Stages map 1:1 to the real code points below.
      const progress = createProgressEmitter(opts.onProgress);
      let stage = 'analyze';
      const enter = (s) => { stage = s; progress.emit(s, PROGRESS_STATUS.ACTIVE); };
      const done = (s) => progress.emit(s, PROGRESS_STATUS.DONE);

      try {
        // ---- analyze: creativeCore + deterministic genericityRisk ----
        enter('analyze');
        const creativeCore = deriveCreativeCore(concept);
        done('analyze');

        // ---- copy: prompt the injected brain, then parse deterministically ----
        // A THROWN provider/model error is FATAL: it propagates to the outer catch,
        // which emits copy:error and rejects (no later stages). An empty/invalid
        // (non-throwing) response is the SUPPORTED deterministic fallback: parseCopy
        // derives copy from the concept and the stage completes (copy:done).
        enter('copy');
        const rawCopy = await draftCopy(buildCopyPrompt(concept, creativeCore));
        let copyPackage = parseCopy(rawCopy, concept);
        done('copy');

        // ---- lint: deterministic generic-marketing-language check (no model) ----
        enter('lint');
        const detected = findGenericCopyPhrases(copyPackage);
        done('lint');

        // ---- rewrite: emitted ONLY when an actual retry runs (detected phrases) ----
        // Same fatal/fallback split as copy: a THROWN retry propagates → rewrite:error
        // and rejects (we never keep the original copy as though the rewrite worked).
        // An empty/invalid (non-throwing) retry is the supported fallback: keep the
        // original copy, attach a warning, bump genericityRisk, and complete (rewrite:done).
        let copyWarning = null;
        if (detected.length) {
          enter('rewrite');
          const rawRetry = await draftCopy(buildCopyRewritePrompt(concept, creativeCore, detected));
          const retryCopy = parseCopy(rawRetry, concept);
          if (rawRetry && findGenericCopyPhrases(retryCopy).length === 0) {
            copyPackage = retryCopy; // clean rewrite → adopt, no warning
          } else {
            copyWarning = `הקופי עדיין כולל ביטויים גנריים לאחר ניסיון שכתוב: ${detected.join(', ')}`;
            creativeCore.genericityRisk = bumpGenericityRisk(creativeCore.genericityRisk, COPY_RISK_BUMP, 'קופי גנרי נותר אחרי שכתוב');
          }
          done('rewrite');
        }
        copyPackage.copyWarning = copyWarning; // string | null

        // ---- translate: hero + visual concept → English (Hebrew-sanitized) ----
        // Translation is NON-FATAL by policy: if the seam throws we continue with the
        // deterministic English skeleton — but that is reported HONESTLY as
        // translate:fallback (not an unqualified translate:done). An unusable but
        // non-throwing return (empty / still-Hebrew) is the ordinary documented
        // fallback and completes as translate:done.
        enter('translate');
        let translateThrew = false;
        const translate = async (heText) => {
          if (!translateToEn) return '';
          try { return ensureEnglish(await translateToEn(heText)); }
          catch { translateThrew = true; return ''; } // non-fatal → skeleton, flagged below
        };
        const heroRaw = String(creativeCore.heroObject || '').trim();
        let heroEn = ensureEnglish(heroRaw);
        if (!heroEn) heroEn = (await translate(heroRaw)) || 'the central hero object';
        const metaphorRaw = String(creativeCore.visualMetaphor || '').trim();
        const conceptEn = ensureEnglish(metaphorRaw) || (await translate(metaphorRaw));
        progress.emit('translate', translateThrew ? PROGRESS_STATUS.FALLBACK : PROGRESS_STATUS.DONE);

        // ---- visual: deterministic visual brief + English-only image prompt ----
        enter('visual');
        const visualBrief = deriveVisualBrief(concept, creativeCore);
        const palette = (Array.isArray(concept.colorDirection) ? concept.colorDirection : []).join(', ');
        const imagePrompt = buildImagePrompt({ heroEn, conceptEn, palette, format: opts.format });
        done('visual');

        return {
          campaignId: opts.campaignId,
          conceptId: opts.conceptId || concept.id,
          tenantId: opts.tenantId,
          status: 'draft',
          creativeCore,
          copyPackage,
          visualBrief,
          imagePrompt,
        };
      } catch (e) {
        progress.emit(stage, PROGRESS_STATUS.ERROR); // label the REAL failing stage
        throw e;
      }
    },
  };
}
