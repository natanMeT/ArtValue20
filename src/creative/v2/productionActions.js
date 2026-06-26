// ===================================================================
// Production actions — EXACTLY TWO for this slice:
//   generate_production_package  (read-only / generative — produces a DRAFT, NO confirm, ZERO mutation)
//   save_production_package      (mutating — CONFIRM-gated; persists exactly once)
//
// Dependency-injected (engine, store, getCampaign) so integration tests run with
// a fake engine + in-memory store and never touch the LLM. No pack permission is
// required: routing is the campaign-state guard below (status must be
// 'concept_selected'), so this slice adds no Pack contract change.
// ===================================================================
import { validateProductionPackage } from './productionSchema.js';
import { createProgressEmitter, PROGRESS_STATUS } from './productionProgress.js';

export class ProductionOrchestratorError extends Error {
  constructor(code, message, details = null) { super(message); this.name = 'ProductionOrchestratorError'; this.code = code; this.details = details; }
}

/** Action catalogue (metadata for audit/UI — not a Jake CRUD registry). */
export const PRODUCTION_ACTIONS = Object.freeze([
  { name: 'generate_production_package', description: 'יוצר טיוטת חבילת הפקה מהקונספט הנבחר (ליבה יצירתית, קופי, בריף, פרומפט) — ללא שמירה', confirm: false },
  { name: 'save_production_package', description: 'שומר את חבילת ההפקה — דורש אישור', confirm: true },
]);

/**
 * @param {{ engine:{ build:Function }, store:{ save:Function }, getCampaign:(id:string)=>object|null }} deps
 */
export function createProductionOrchestrator(deps) {
  const { engine, store, getCampaign } = deps || {};
  if (!engine || typeof engine.build !== 'function') throw new ProductionOrchestratorError('MISCONFIGURED', 'orchestrator requires a production engine');
  if (!store || typeof store.save !== 'function') throw new ProductionOrchestratorError('MISCONFIGURED', 'orchestrator requires a production store');
  if (typeof getCampaign !== 'function') throw new ProductionOrchestratorError('MISCONFIGURED', 'orchestrator requires getCampaign');

  return {
    productionActions: PRODUCTION_ACTIONS,

    /**
     * generate_production_package — DRAFT only. Reads the selected concept;
     * mutates nothing and persists nothing (not even progress).
     *
     * @param {{ campaignId?:string,
     *           onProgress?:(e:{stage:string,status:string,message:string,timestamp:number})=>void }} [params]
     *   onProgress is OPTIONAL and failure-safe. Without it, behaviour is identical
     *   to before. The engine emits analyze→visual; this layer owns context (read)
     *   and validate/ready (post-build). On any throw the REAL failing stage is
     *   labelled — engine-stage failures are labelled inside build(), so this layer
     *   only labels its own phases (context / validate).
     */
    async generateProductionPackage({ campaignId, onProgress } = {}) {
      const progress = createProgressEmitter(onProgress);
      let phase = 'context'; // 'context' | 'engine' | 'validate'
      try {
        // ---- context: read the campaign + locate the selected concept ----
        progress.emit('context', PROGRESS_STATUS.ACTIVE);
        const rec = getCampaign(campaignId);
        if (!rec) throw new ProductionOrchestratorError('NOT_FOUND', `קמפיין לא נמצא: ${campaignId}`);
        if (rec.status !== 'concept_selected' || !rec.selectedConceptId) {
          throw new ProductionOrchestratorError('NO_SELECTED_CONCEPT', 'יש לבחור קונספט לפני יצירת חבילת הפקה');
        }
        const concept = (rec.concepts || []).find((c) => c && c.id === rec.selectedConceptId);
        if (!concept) throw new ProductionOrchestratorError('UNKNOWN_CONCEPT', 'הקונספט הנבחר לא נמצא בקמפיין');
        progress.emit('context', PROGRESS_STATUS.DONE);

        // ---- engine: analyze → copy → lint → (rewrite) → translate → visual ----
        // build() emits its own stages and labels its own failing stage.
        phase = 'engine';
        const pkg = await engine.build(concept, {
          campaignId,
          conceptId: concept.id,
          tenantId: rec.tenantId,
          format: rec.format,
          onProgress,
        });

        // ---- validate: read-only schema check. An invalid package must NOT reach
        // the review card as if valid — it would fail at save anyway, so reject now. ----
        phase = 'validate';
        progress.emit('validate', PROGRESS_STATUS.ACTIVE);
        const v = validateProductionPackage(pkg);
        if (!v.ok) {
          throw new ProductionOrchestratorError('INVALID_PACKAGE', `חבילת הפקה לא תקינה: ${v.errors.join('; ')}`, v.errors);
        }
        progress.emit('validate', PROGRESS_STATUS.DONE);

        // ---- ready ----
        progress.emit('ready', PROGRESS_STATUS.DONE);
        return pkg;
      } catch (e) {
        // Label the real failing stage; engine-phase errors are already labelled
        // inside build(), so avoid double-emitting for that phase.
        if (phase === 'context') progress.emit('context', PROGRESS_STATUS.ERROR);
        else if (phase === 'validate') progress.emit('validate', PROGRESS_STATUS.ERROR);
        throw e;
      }
    },

    /** save_production_package — the CONFIRMED mutation. Validates then persists once. */
    saveProductionPackage({ campaignId, pkg } = {}) {
      if (!pkg) throw new ProductionOrchestratorError('NO_PACKAGE', 'אין חבילת הפקה לשמירה');
      const candidate = { ...pkg, campaignId: pkg.campaignId || campaignId };
      const v = validateProductionPackage(candidate);
      if (!v.ok) throw new ProductionOrchestratorError('INVALID_PACKAGE', `חבילת הפקה לא תקינה: ${v.errors.join('; ')}`, v.errors);
      return store.save(candidate);
    },
  };
}
