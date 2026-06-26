import { describe, it, expect } from 'vitest';
import { buildCreativeContext, CreativeContextError } from '../contextBuilder.js';
import { validateCreativeCampaignRequest } from '../schema.js';
import { artValuePack } from '../../../lib/jakePack.js';

const fixedId = () => 'req_fixed_1';

describe('D. context builder — generic + sanitization', () => {
  it('produces a valid canonical request and NO V1-specific field names', () => {
    const fakePack = {
      id: 'tenantX',
      buildCreativeContext: () => ({
        business: { name: 'Biz', industry: 'Retail' },
        brand: { brandName: 'Biz', audience: ['shoppers'], tone: ['fun'], language: 'he-IL' },
        defaults: { channel: 'whatsapp', format: 'A5', targetAudience: 'locals' },
      }),
    };
    const req = buildCreativeContext({ data: {}, pack: fakePack, objective: 'generate_leads', genId: fixedId });
    expect(validateCreativeCampaignRequest(req).ok).toBe(true);
    expect(req.campaign.channel).toBe('whatsapp');
    const json = JSON.stringify(req);
    // canonical names only — never V1 internals
    expect(json).not.toContain('positioning');
    expect(json).not.toContain('palette');
    expect(json).not.toContain('luxury_level');
  });

  it('sanitizes products — whitelists fields (strips stray PII) and caps the list', () => {
    const fakePack = {
      id: 't',
      buildCreativeContext: () => ({
        business: {
          name: 'B', industry: 'I',
          products: Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, price: i, ownerPhone: '050-1234567', secretMargin: 99 })),
        },
        brand: { brandName: 'B', audience: ['a'], tone: ['t'], language: 'he-IL' },
      }),
    };
    const req = buildCreativeContext({ data: {}, pack: fakePack, objective: 'promote_product', genId: fixedId });
    expect(req.business.products).toHaveLength(12); // capped
    const p = req.business.products[0];
    expect(Object.keys(p).sort()).toEqual(['id', 'name', 'price']); // ownerPhone/secretMargin dropped
    expect(JSON.stringify(req)).not.toContain('050-1234567');
  });

  it('throws when the pack has no creative support', () => {
    expect(() => buildCreativeContext({ data: {}, pack: {}, objective: 'generate_leads' }))
      .toThrowError(CreativeContextError);
  });

  it('throws when objective is missing', () => {
    const fakePack = { id: 't', buildCreativeContext: () => ({ business: {}, brand: {} }) };
    expect(() => buildCreativeContext({ data: {}, pack: fakePack })).toThrow(/objective/);
  });
});

describe('D. context builder — Art Value pack (PII-free, aggregate)', () => {
  const data = {
    clients: [{ id: 'c1', name: 'דני כהן', phone: '050-1234567', email: 'dani@x.com', status: 'active', value: 5000 }],
    inventory: [{ id: 'i1', name: 'הדפסת קנבס', unitPrice: 120, cost: 40, category: 'מוצר' }],
    transactions: [], quotes: [], tasks: [], projects: [], outreachLeads: [], activity: [],
  };

  it('builds a valid request that contains NO individual customer PII', () => {
    const req = buildCreativeContext({ data, pack: artValuePack, objective: 'increase_sales', genId: fixedId });
    expect(validateCreativeCampaignRequest(req).ok).toBe(true);
    const json = JSON.stringify(req);
    expect(json).not.toContain('דני כהן');
    expect(json).not.toContain('050-1234567');
    expect(json).not.toContain('dani@x.com');
    expect(req.business.name).toBe('Art Value');
  });

  it('is stable for stable CRM input (deterministic with a fixed id)', () => {
    const a = buildCreativeContext({ data, pack: artValuePack, objective: 'increase_sales', genId: fixedId });
    const b = buildCreativeContext({ data, pack: artValuePack, objective: 'increase_sales', genId: fixedId });
    expect(a).toEqual(b);
  });
});
