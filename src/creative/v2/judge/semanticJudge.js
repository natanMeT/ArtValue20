// ===================================================================
// semanticJudge — the offline JUDGE SEAM + per-concept/per-set runner.
//
// OFFLINE-ONLY / RUNTIME-INERT. The "judge" is an INJECTED async function
// `(prompt, meta) => string|object` (the model call). This module NEVER constructs a
// model, NEVER imports gemini.js, NEVER reads secrets, and NEVER calls a hosted API.
// With NO judge injected it returns a degraded marker (so it is inert by default and
// safe in unit tests). The REAL judge is supplied later ONLY by an opt-in, rig-guarded
// offline runner (a scratchpad/eval script) — never by runtime and never by tests.
//
// Model seam stays OFF for production: nothing here is wired into the app. Output is
// SEMANTIC DIAGNOSTICS ONLY (validated by judgeSchema) — no ranking, no selection.
// ===================================================================
import { validateJudgeOutput, JUDGE_VERSION } from './judgeSchema.js';
import { buildJudgePrompt } from './judgePrompt.js';

/**
 * Judge ONE concept. Pure orchestration around the injected judge seam. Never throws.
 * @param {object} concept canonical concept (must carry `id`)
 * @param {{ request?: object, strategy?: object, siblings?: object[] }} [ctx]
 * @param {{ judge?: (prompt:string, meta:object)=>Promise<string|object> }} [opts]
 * @returns {Promise<object>} a validated judge result or { ok:false, degraded:true, reason }
 */
export async function judgeConcept(concept, ctx = {}, opts = {}) {
  const conceptId = concept && concept.id;
  const judge = opts.judge;
  if (typeof judge !== 'function') {
    return { ok: false, degraded: true, reason: 'no_judge_configured', ...(conceptId != null ? { conceptId: String(conceptId) } : {}) };
  }
  let raw;
  try {
    const prompt = buildJudgePrompt({ request: ctx.request, strategy: ctx.strategy, concept, siblings: ctx.siblings });
    raw = await judge(prompt, { conceptId });
  } catch (e) {
    return { ok: false, degraded: true, reason: (e && e.message) || 'judge_threw', ...(conceptId != null ? { conceptId: String(conceptId) } : {}) };
  }
  return validateJudgeOutput(raw, { conceptId });
}

/**
 * Judge a SET of concepts (each gets its siblings' summaries for near-duplicate
 * detection). Never throws; degraded per-concept results are kept in `results`.
 * @param {{ concepts: object[], request?: object, strategy?: object }} input
 * @param {{ judge?: Function }} [opts]
 * @returns {Promise<{ ok:boolean, version:string, deterministic:false, results:object[], reason?:string }>}
 */
export async function judgeConcepts(input, opts = {}) {
  const concepts = input && Array.isArray(input.concepts) ? input.concepts : null;
  if (!concepts || concepts.length === 0) {
    return { ok: false, version: JUDGE_VERSION, deterministic: false, results: [], reason: 'no_concepts' };
  }
  const results = [];
  for (let i = 0; i < concepts.length; i += 1) {
    const siblings = concepts
      .filter((_, j) => j !== i)
      .map((c) => ({ id: c && c.id, name: c && c.name, coreIdea: c && c.coreIdea }));
    // eslint-disable-next-line no-await-in-loop
    const r = await judgeConcept(concepts[i], { request: input.request, strategy: input.strategy, siblings }, opts);
    results.push(r);
  }
  return { ok: true, version: JUDGE_VERSION, deterministic: false, results };
}
