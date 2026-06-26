// ===================================================================
// Minimal creative-campaign state — the SMALLEST record needed for this slice.
// Additive + non-invasive: backed by localStorage (matching the CRM store's
// local-mode persistence), with an INJECTABLE storage so tests use in-memory.
// No CRM-store reducer change, no Supabase migration this phase.
//
// State machine (guarded): draft → concepts_ready → concept_selected.
// Re-selecting the SAME concept is idempotent; every other transition throws.
// Nothing is written unless a method is explicitly called → a cancelled
// selection (no call) produces zero mutation.
// ===================================================================

const STORAGE_KEY = 'artvalue_creative_campaigns_v1';

export class CampaignStateError extends Error {
  constructor(code, message) { super(message); this.name = 'CampaignStateError'; this.code = code; }
}

const VALID = {
  draft: ['concepts_ready'],
  concepts_ready: ['concept_selected'],
  concept_selected: ['concept_selected'], // idempotent re-select only
};

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

function resolveStorage(storage) {
  if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') return storage;
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
  } catch { /* access denied → memory */ }
  return memoryStorage();
}

/**
 * @param {{ storage?: { getItem(k:string):string|null, setItem(k:string,v:string):void },
 *           id?: ()=>string, clock?: ()=>string }} [deps]
 */
export function createCampaignStore(deps = {}) {
  const storage = resolveStorage(deps.storage);
  let counter = 0;
  const genId = typeof deps.id === 'function' ? deps.id : () => `cmp_${Date.now().toString(36)}_${(counter += 1)}`;
  const nowIso = typeof deps.clock === 'function' ? deps.clock : () => new Date().toISOString();

  const readAll = () => {
    try { const raw = storage.getItem(STORAGE_KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : []; }
    catch { return []; }
  };
  const writeAll = (list) => { try { storage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* ignore */ } };
  const indexOf = (list, id) => list.findIndex((r) => r && r.id === id);

  function assertTransition(from, to) {
    if (!(VALID[from] || []).includes(to)) {
      throw new CampaignStateError('INVALID_TRANSITION', `מעבר מצב לא חוקי: ${from} → ${to}`);
    }
  }

  return {
    /** Create a draft campaign (status 'draft'). */
    createDraft({ tenantId, requestId, objective, targetAudience, channel, format, createdBy } = {}) {
      if (!tenantId || !requestId) throw new CampaignStateError('MISSING_FIELDS', 'createDraft requires tenantId + requestId');
      const list = readAll();
      const ts = nowIso();
      const rec = {
        id: genId(),
        tenantId,
        requestId,
        status: 'draft',
        objective: objective || '',
        targetAudience: targetAudience || '',
        channel: channel || '',
        format: format || '',
        strategy: null,
        concepts: [],
        selectedConceptId: undefined,
        createdAt: ts,
        updatedAt: ts,
        createdBy,
      };
      list.unshift(rec);
      writeAll(list);
      return rec;
    },

    /** Attach the generated strategy + concepts (draft → concepts_ready). */
    attachConcepts(id, { strategy, concepts } = {}) {
      const list = readAll();
      const i = indexOf(list, id);
      if (i < 0) throw new CampaignStateError('NOT_FOUND', `קמפיין לא נמצא: ${id}`);
      assertTransition(list[i].status, 'concepts_ready');
      if (!strategy || !Array.isArray(concepts) || !concepts.length) {
        throw new CampaignStateError('MISSING_FIELDS', 'attachConcepts requires strategy + non-empty concepts');
      }
      list[i] = { ...list[i], status: 'concepts_ready', strategy, concepts, updatedAt: nowIso() };
      writeAll(list);
      return list[i];
    },

    /** Select a concept (concepts_ready → concept_selected). Idempotent for the same concept. */
    selectConcept(id, conceptId) {
      const list = readAll();
      const i = indexOf(list, id);
      if (i < 0) throw new CampaignStateError('NOT_FOUND', `קמפיין לא נמצא: ${id}`);
      const rec = list[i];
      // idempotency: re-selecting the SAME concept is a no-op success.
      if (rec.status === 'concept_selected' && rec.selectedConceptId === conceptId) return rec;
      assertTransition(rec.status, 'concept_selected');
      if (!rec.concepts.some((c) => c && c.id === conceptId)) {
        throw new CampaignStateError('UNKNOWN_CONCEPT', `הקונספט ${conceptId} אינו שייך לקמפיין זה`);
      }
      list[i] = { ...rec, status: 'concept_selected', selectedConceptId: conceptId, updatedAt: nowIso() };
      writeAll(list);
      return list[i];
    },

    get(id) { return readAll().find((r) => r && r.id === id) || null; },
    list(tenantId) { const all = readAll(); return tenantId ? all.filter((r) => r.tenantId === tenantId) : all; },
    _clearAll() { writeAll([]); }, // test/maintenance helper
  };
}

export const CAMPAIGN_STORAGE_KEY = STORAGE_KEY;
