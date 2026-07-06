import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BUSINESS_BRAIN, buildPosterBrief, buildMonthlyContentPlanSeed,
  buildServiceCampaignSeed, buildStudioPromptSeed,
} from '../../../data/businessBrain.js';

// ===================================================================
// BusinessBrainPanel — source-level wiring + prompt-shape guarantees.
// Follows the growthAskJakeButtons.test.js readFileSync pattern (no DOM
// renderer in this repo): pin imports, labels, and click-only dispatch
// without brittle full-render tests. Plus a smoke-check of the builders
// this panel dispatches.
// ===================================================================

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const panel = src('../BusinessBrainPanel.jsx');
const growth = src('../../../pages/growth/Growth.jsx');

describe('BusinessBrainPanel · imports', () => {
  it('imports askJake from the seam helper', () => {
    expect(panel).toMatch(/import\s*\{\s*askJake\s*\}\s*from\s*'[^']*lib\/askJake\.js'/);
  });

  it('imports BUSINESS_BRAIN and the four builders from businessBrain.js', () => {
    expect(panel).toMatch(/from\s*'[^']*data\/businessBrain\.js'/);
    for (const name of ['BUSINESS_BRAIN', 'buildPosterBrief', 'buildMonthlyContentPlanSeed', 'buildServiceCampaignSeed', 'buildStudioPromptSeed']) {
      expect(panel, name).toContain(name);
    }
  });

  it('does NOT import the assistant engine, gemini, or the jake pack/agent', () => {
    const imports = panel.split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n');
    for (const forbidden of ['Assistant', 'lib/gemini', 'jakePack', 'jakeAgent']) {
      expect(imports, forbidden).not.toContain(forbidden);
    }
  });
});

describe('BusinessBrainPanel · UI copy', () => {
  it('renders the panel title, subtitle, select label and safety note', () => {
    expect(panel).toContain('המוח העסקי של ג׳יק');
    expect(panel).toContain('בחר שירות, וג׳יק יכין עבורך בריף');
    expect(panel).toContain('בחר שירות');
    expect(panel).toContain('הכפתורים שולחים לג׳יק בקשה מוכנה בלבד. שום פעולה לא מתבצעת בלי אישור שלך.');
  });

  it('renders all four Hebrew button labels', () => {
    for (const label of ['תכין פוסטר לשירות', 'בנה קמפיין לשירות', 'תכנן חודש תוכן', 'בריף ל-Studio']) {
      expect(panel, label).toContain(label);
    }
  });

  it('defaults the selected service to crm and uses fast-image for the Studio brief', () => {
    expect(panel).toContain("useState('crm')");
    expect(panel).toContain("buildStudioPromptSeed('fast-image'");
  });
});

describe('BusinessBrainPanel · click-only dispatch', () => {
  it('every askJake call is bound to an onClick (no render/effect dispatch)', () => {
    const body = panel.split('\n').filter((l) => !/^\s*import\b/.test(l)).join('\n');
    const total = (body.match(/askJake\(/g) || []).length;
    expect(total).toBe(4); // exactly the four buttons
    const inline = (body.match(/onClick=\{\(\)\s*=>\s*askJake\(/g) || []).length;
    expect(inline, `${total} askJake call(s) but only ${inline} inline-click-bound`).toBe(total);
  });

  it('has no useEffect/useLayoutEffect dispatch at all', () => {
    expect(panel).not.toMatch(/use(?:Layout)?Effect/);
  });

  it('never touches the raw seam — no dispatchEvent/CustomEvent/jake:ask literal', () => {
    expect(panel).not.toContain('dispatchEvent');
    expect(panel).not.toContain('CustomEvent');
    expect(panel).not.toContain('jake:ask');
  });
});

describe('Growth hub embed', () => {
  it('imports and renders <BusinessBrainPanel />', () => {
    expect(growth).toMatch(/import\s+BusinessBrainPanel\s+from\s+'[^']*components\/growth\/BusinessBrainPanel\.jsx'/);
    expect(growth).toContain('<BusinessBrainPanel />');
  });
});

describe('BusinessBrainPanel · dispatched builder outputs (smoke)', () => {
  // The panel selects by BUSINESS_BRAIN.services KEY; assert each builder
  // resolves those keys and returns a bounded, safe seed.
  const keys = Object.keys(BUSINESS_BRAIN.services);

  it('poster brief carries the 7 required sections and the safety block', () => {
    const brief = buildPosterBrief('crm');
    for (const s of ['1. קונספט מרכזי', '2. כותרת לפוסטר', '3. טקסט קצר לפוסטר', '4. קופי לפוסט', '5. CTA', '6. פרומפט באנגלית ל־Image Studio', '7. רעיון לפולואפ / המשך פרסום']) {
      expect(brief, s).toContain(s);
    }
    expect(brief).toContain('כללים:');
  });

  it('all four builders resolve every service key and stay under a length bound', () => {
    for (const key of keys) {
      const outs = [
        buildPosterBrief(key),
        buildServiceCampaignSeed(key),
        buildMonthlyContentPlanSeed({ focusService: key }),
        buildStudioPromptSeed('fast-image', BUSINESS_BRAIN.services[key].name),
      ];
      for (const out of outs) {
        expect(out.length, key).toBeGreaterThan(0);
        expect(out.length, key).toBeLessThan(4000);
        expect(out, key).toContain('כללים:'); // safety block always present
      }
    }
  });
});
