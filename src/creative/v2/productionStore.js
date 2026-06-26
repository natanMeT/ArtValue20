// ===================================================================
// ProductionPackage persistence — its OWN versioned localStorage key, separate
// from the frozen campaignStore (which is NOT modified by this slice). Additive
// + non-invasive, with an INJECTABLE storage so tests run in-memory. No Supabase,
// no migration.
//
// Nothing is written unless save() is explicitly called → a cancelled review
// (no call) produces zero mutation. Corrupt JSON is tolerated (reads as empty).
// ===================================================================

const STORAGE_KEY = 'artvalue_production_packages_v1';

export class ProductionStoreError extends Error {
  constructor(code, message) { super(message); this.name = 'ProductionStoreError'; this.code = code; }
}

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
export function createProductionStore(deps = {}) {
  const storage = resolveStorage(deps.storage);
  let counter = 0;
  const genId = typeof deps.id === 'function' ? deps.id : () => `pkg_${Date.now().toString(36)}_${(counter += 1)}`;
  const nowIso = typeof deps.clock === 'function' ? deps.clock : () => new Date().toISOString();

  const readAll = () => {
    try { const raw = storage.getItem(STORAGE_KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : []; }
    catch { return []; } // corrupt JSON → empty, never throws
  };
  const writeAll = (list) => { try { storage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* ignore */ } };

  return {
    /** Persist a package (assigns identity + 'saved' status + timestamps). */
    save(pkg) {
      if (!pkg || !pkg.campaignId || !pkg.conceptId) {
        throw new ProductionStoreError('MISSING_FIELDS', 'save requires campaignId + conceptId');
      }
      const list = readAll();
      const ts = nowIso();
      const rec = {
        ...pkg,
        id: pkg.id || genId(),
        status: 'saved',
        createdAt: pkg.createdAt || ts,
        updatedAt: ts,
      };
      list.unshift(rec);
      writeAll(list);
      return rec;
    },

    get(id) { return readAll().find((r) => r && r.id === id) || null; },
    list(tenantId) { const all = readAll(); return tenantId ? all.filter((r) => r.tenantId === tenantId) : all; },
    _clearAll() { writeAll([]); }, // test/maintenance helper
  };
}

export const PRODUCTION_STORAGE_KEY = STORAGE_KEY;
