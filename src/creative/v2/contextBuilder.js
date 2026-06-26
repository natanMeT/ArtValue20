// ===================================================================
// Creative Context Builder — turns CRM state into a CANONICAL Creative V2 request
// ONLY (never V1-shaped input; it does not know V1 field names). Domain knowledge
// (what marketing context matters for THIS business) lives in the Pack's
// `buildCreativeContext` extension point; this generic builder orchestrates,
// sanitizes (whitelist + caps, strips PII), fills campaign defaults, and runtime-
// validates. Keeps creative-domain logic OUT of Jake's generic engine.
// ===================================================================
import { validateCreativeCampaignRequest } from './schema.js';

export class CreativeContextError extends Error {
  constructor(code, message) { super(message); this.name = 'CreativeContextError'; this.code = code; }
}

const MAX_PRODUCTS = 12;
const MAX_INSIGHTS = 8;
const PRODUCT_FIELDS = ['id', 'name', 'description', 'price', 'margin'];

// Whitelist product/service fields (drops any stray PII a pack might include) + cap.
function sanitizeProducts(list) {
  if (!Array.isArray(list)) return undefined;
  return list.slice(0, MAX_PRODUCTS).map((p) => {
    const out = {};
    for (const f of PRODUCT_FIELDS) if (p && p[f] !== undefined) out[f] = p[f];
    return out;
  });
}
const capStrings = (arr, n) => (Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x.trim()).slice(0, n) : undefined);

/**
 * @param {{
 *   data: object, pack: { id?:string, buildCreativeContext?: Function },
 *   objective: string, requestedEntityId?: string,
 *   tenantId?: string, userId?: string,
 *   channel?: string, format?: string, targetAudience?: string, offer?: string,
 *   constraints?: string[], requestId?: string, genId?: ()=>string
 * }} args
 * @returns {import('./types').CreativeCampaignRequest}
 */
export function buildCreativeContext(args) {
  const { data, pack, objective, requestedEntityId } = args || {};
  if (!pack || typeof pack.buildCreativeContext !== 'function') {
    throw new CreativeContextError('NO_PACK_SUPPORT', 'הפָאק הפעיל לא תומך בבניית הקשר קריאטיבי');
  }
  if (!objective) throw new CreativeContextError('NO_OBJECTIVE', 'חסר objective לבניית קמפיין');

  // Pack returns canonical sub-structures only: { business, brand, defaults? }.
  let ctx;
  try {
    ctx = pack.buildCreativeContext(data, { objective, requestedEntityId }) || {};
  } catch (e) {
    throw new CreativeContextError('PACK_BUILD_FAILED', `בניית ההקשר מהפאק נכשלה: ${(e && e.message) || e}`);
  }
  const business = ctx.business || {};
  const brand = ctx.brand || {};
  const defaults = ctx.defaults || {};

  const genId = typeof args.genId === 'function' ? args.genId : () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const request = {
    requestId: args.requestId || genId(),
    tenantId: args.tenantId || pack.id || 'default',
    ...(args.userId ? { userId: args.userId } : {}),
    business: {
      name: business.name,
      industry: business.industry,
      ...(business.description ? { description: business.description } : {}),
      ...(business.products ? { products: sanitizeProducts(business.products) } : {}),
      ...(business.services ? { services: sanitizeProducts(business.services) } : {}),
      ...(business.relevantInsights ? { relevantInsights: capStrings(business.relevantInsights, MAX_INSIGHTS) } : {}),
    },
    brand: {
      brandName: brand.brandName,
      audience: capStrings(brand.audience, 8) || [],
      tone: capStrings(brand.tone, 8) || [],
      ...(brand.colors ? { colors: capStrings(brand.colors, 8) } : {}),
      ...(brand.visualStyles ? { visualStyles: capStrings(brand.visualStyles, 8) } : {}),
      ...(brand.designRules ? { designRules: capStrings(brand.designRules, 8) } : {}),
      ...(brand.forbiddenStyles ? { forbiddenStyles: capStrings(brand.forbiddenStyles, 8) } : {}),
      language: 'he-IL',
    },
    campaign: {
      objective,
      targetAudience: args.targetAudience || defaults.targetAudience || (Array.isArray(brand.audience) && brand.audience[0]) || 'קהל יעד כללי',
      ...(args.offer ? { offer: args.offer } : {}),
      channel: args.channel || defaults.channel || 'instagram_post',
      format: args.format || defaults.format || '4:5',
      constraints: Array.isArray(args.constraints) ? args.constraints : [],
    },
    requestedConceptCount: 3,
  };

  const check = validateCreativeCampaignRequest(request);
  if (!check.ok) throw new CreativeContextError('INVALID_REQUEST', `הקשר קריאטיבי לא תקין: ${check.errors.join('; ')}`);
  return request;
}
