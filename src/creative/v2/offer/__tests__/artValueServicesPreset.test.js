import { describe, it, expect } from 'vitest';
import {
  artValueServicesPreset,
  ARTVALUE_PRESET_ID,
  ARTVALUE_SERVICES,
  ARTVALUE_DEFAULT_LANGUAGE,
} from '../presets/artValueServices.js';

const preset = artValueServicesPreset;

describe('ArtValue Services preset — data', () => {
  it('exposes the expected services catalog', () => {
    for (const id of [
      'smart_crm', 'business_management', 'ai_assistant', 'website', 'landing_page',
      'automation', 'sales_funnel', 'custom_demo', 'digital_presence', 'creative_campaign',
    ]) {
      expect(ARTVALUE_SERVICES[id], `missing service ${id}`).toBeTruthy();
      expect(ARTVALUE_SERVICES[id].name.length).toBeGreaterThan(0);
      expect(ARTVALUE_SERVICES[id].valueProposition.length).toBeGreaterThan(0);
      expect(ARTVALUE_SERVICES[id].whatsIncluded.length).toBeGreaterThan(0);
    }
  });

  it('has a stable preset id and the expected interface', () => {
    expect(preset.id).toBe(ARTVALUE_PRESET_ID);
    expect(typeof preset.selectOffer).toBe('function');
    expect(typeof preset.defaultsFor).toBe('function');
    expect(typeof preset.objectionsFor).toBe('function');
  });
});

describe('ArtValue Services preset — defaultsFor', () => {
  it('defaults to he-IL with a concrete tone', () => {
    const d = preset.defaultsFor({ prospect: { businessType: 'x' }, goal: {} });
    expect(d.language).toBe(ARTVALUE_DEFAULT_LANGUAGE);
    expect(Array.isArray(d.tone)).toBe(true);
    expect(d.tone.length).toBeGreaterThan(0);
    expect(d.channel.length).toBeGreaterThan(0);
    expect(d.objective.length).toBeGreaterThan(0);
  });

  it('honours an explicitly supplied language/channel/objective', () => {
    const d = preset.defaultsFor({ goal: { language: 'en-US', channel: 'print', objective: 'increase_sales' } });
    expect(d.language).toBe('en-US');
    expect(d.channel).toBe('print');
    expect(d.objective).toBe('increase_sales');
  });
});

describe('ArtValue Services preset — selectOffer', () => {
  it('maps real-estate to the smart CRM offer (matchType=rule)', () => {
    const sel = preset.selectOffer({ prospect: { businessType: 'משרד תיווך נדל"ן' } });
    expect(sel.serviceId).toBe('smart_crm');
    expect(sel.service).toBe(ARTVALUE_SERVICES.smart_crm.name);
    expect(sel.matchType).toBe('rule');
    expect(sel.pains.length).toBeGreaterThan(0);
    expect(sel.angle.keyMessage.length).toBeGreaterThan(0);
  });

  it('maps a clinic to the automation offer', () => {
    const sel = preset.selectOffer({ prospect: { businessType: 'מרפאת שיניים' } });
    expect(sel.serviceId).toBe('automation');
  });

  it('falls back to a default offer for an unknown businessType (matchType=default)', () => {
    const sel = preset.selectOffer({ prospect: { businessType: 'qqq-zzz' } });
    expect(sel.serviceId).toBe('digital_presence');
    expect(sel.matchType).toBe('default');
  });

  it('honours offerOverride (matchType=override)', () => {
    const sel = preset.selectOffer({ prospect: { businessType: 'qqq' }, offerOverride: { service: 'משפך מכירות' } });
    expect(sel.serviceId).toBe('sales_funnel');
    expect(sel.matchType).toBe('override');
  });

  it('does not mutate the request', () => {
    const req = { prospect: { businessType: 'מרפאת שיניים' }, offerOverride: { service: 'דף נחיתה' } };
    const snap = JSON.parse(JSON.stringify(req));
    preset.selectOffer(req);
    expect(req).toEqual(snap);
  });
});

describe('ArtValue Services preset — objectionsFor', () => {
  it('returns a populated, well-formed objection bank', () => {
    const sel = preset.selectOffer({ prospect: { businessType: 'משרד תיווך נדל"ן' } });
    const objections = preset.objectionsFor(sel);
    expect(objections.length).toBeGreaterThanOrEqual(4);
    for (const o of objections) {
      expect(o.objection.length).toBeGreaterThan(0);
      expect(o.reply.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate objections', () => {
    const sel = preset.selectOffer({ prospect: { businessType: 'משרד תיווך נדל"ן' } });
    const objections = preset.objectionsFor(sel);
    const keys = objections.map((o) => o.objection.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });
});
