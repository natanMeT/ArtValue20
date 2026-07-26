import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { visibleNavSections } from '../../layout/sidebarNav.js';
import { BETA_HIDDEN_MODULES, BETA_MESSAGES } from '../../../lib/betaCapabilities.js';
import { activePack } from '../../../lib/jakePack.js';
import { JAKE_PACK_PERSONA } from '../../../../supabase/functions/ai-gateway/actionProfiles.ts';

// ===================================================================
// S0F.1 — cloud truthfulness containment (D1/D3/D4) + persona (D2) +
// palette wiring (D5). Same proof style as the S0D containment suite:
// structural gates + behavioral checks on pure modules (this repo has no
// DOM renderer, so React surfaces are pinned via readFileSync).
//
// What must hold in AUTHENTICATED CLOUD mode, and only there:
//   * the Jake creative-campaign lane never runs the demo Creative path;
//   * AdStudio is hidden from nav and its route renders BetaUnavailable
//     BEFORE any scan / analyzer / image generation can run;
//   * the ArtValue offer-brief chip is hidden;
//   * local/demo keeps every one of these behaviors unchanged.
// ===================================================================

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const assistant = read('../Assistant.jsx');
const adStudio = read('../../../pages/AdStudio.jsx');
const outreachPage = read('../../../pages/Outreach.jsx');
const app = read('../../../App.jsx');

const flat = (sections) => sections.flatMap((s) => s.items).map((i) => i.to);

describe('S0F.1 · Jake creative-campaign lane is contained in cloud beta (D1)', () => {
  it('the lane returns the truthful unavailable message before any creative run', () => {
    expect(assistant).toMatch(
      /if \(isCampaignRequest\(text\)\) \{[\s\S]{0,900}?if \(isSupabaseConfigured\) \{[\s\S]{0,400}?BETA_MESSAGES\.creativeCampaignUnavailable[\s\S]{0,200}?return;/,
    );
  });

  it('the gate sits BEFORE setLoading / createCampaignBrief / runCreativeDirector', () => {
    const lane = assistant.slice(assistant.indexOf('if (isCampaignRequest(text)) {'));
    const gate = lane.indexOf('if (isSupabaseConfigured)');
    expect(gate).toBeGreaterThan(-1);
    for (const marker of ['setLoading(true)', 'createCampaignBrief', 'runCreativeDirector']) {
      expect(lane.indexOf(marker), marker).toBeGreaterThan(gate);
    }
  });

  it('the message claims nothing was run or saved, and names no other business', () => {
    const m = BETA_MESSAGES.creativeCampaignUnavailable;
    expect(m).toContain('לא הרצתי');
    expect(m).toContain('לא שמרתי');
    expect(m).not.toContain('Art Value');
    expect(m).not.toContain('ArtValue');
  });

  it('local/demo still reaches the full creative lane (unchanged)', () => {
    expect(assistant).toContain('const creative = creativeRef.current;');
    expect(assistant).toContain('creative.createCampaignBrief({ need })');
  });
});

describe('S0F.1 · AdStudio is contained, not retired (D4)', () => {
  it('adstudio is in the central BETA_HIDDEN_MODULES classification', () => {
    expect(BETA_HIDDEN_MODULES.has('adstudio')).toBe(true);
  });

  it('the nav entry is hidden in cloud beta and present in local/demo', () => {
    expect(flat(visibleNavSections(true))).not.toContain('/adstudio');
    expect(flat(visibleNavSections(false))).toContain('/adstudio');
  });

  it('the route stays registered so a direct URL renders the contained state', () => {
    expect(app).toContain('path="/adstudio" element={<AdStudio />}');
  });

  it('the page returns BetaUnavailable before scan / analyzer / image generation', () => {
    expect(adStudio).toContain("import BetaUnavailable from '../components/ui/BetaUnavailable.jsx'");
    expect(adStudio).toMatch(/if \(isSupabaseConfigured\) \{\s*return <BetaUnavailable/);
    const gate = adStudio.indexOf('if (isSupabaseConfigured) {');
    expect(gate).toBeGreaterThan(-1);
    for (const marker of ['fetchSiteText(url)', 'analyzeBusiness(text, url)', 'runCreativeDirector(brand', 'generateMaxRealism(']) {
      expect(adStudio.indexOf(marker), marker).toBeGreaterThan(gate);
    }
  });

  it('the frozen engine prompts were NOT edited to achieve containment', () => {
    // AdStudio still imports the same frozen engine entry points.
    expect(adStudio).toContain('fetchSiteText, analyzeBusiness, runCreativeDirector,');
  });
});

describe('S0F.1 · ArtValue offer-brief chip is hidden in cloud beta (D3)', () => {
  it('the chip renders only when NOT in authenticated cloud mode', () => {
    expect(assistant).toContain('{!isSupabaseConfigured && <button className="ai-sugg" onClick={openOfferForm}>');
  });

  it('the offer engine/preset itself is untouched (still wired, one-arg)', () => {
    expect(assistant).toContain('creativeRef.current.generateOfferCampaignBrief(request)');
  });
});

describe('S0F.1 · Jake persona (D2)', () => {
  it('frontend and server persona stay byte-identical (drift guard intact)', () => {
    expect(JAKE_PACK_PERSONA === activePack.persona).toBe(true);
  });

  it('ArtValue is the SYSTEM, never the account\'s own business', () => {
    const p = activePack.persona;
    expect(p).toContain('מערכת ArtValue');
    expect(p).not.toContain('סטודיו Art Value');
    expect(p).not.toContain('נתן');
    // no fixed ArtValue service list attributed to the signed-in account
    expect(p).not.toContain('אתרים, CRM, מיתוג, קמפיינים');
  });

  it('it binds Jake to the active account\'s approved context and forbids invention', () => {
    expect(activePack.persona).toContain('ההקשר העסקי המאושר של החשבון הפעיל');
    expect(activePack.persona).toContain('אל תמציא');
  });
});

describe('S0F.1 · Outreach is account-aware in cloud, unchanged in local/demo', () => {
  it('cloud uses the account builder; local/demo keeps the legacy templates', () => {
    expect(outreachPage).toContain("import { buildAccountOutreachMessage, canBuildAccountOutreach, OUTREACH_SETUP_REQUIRED } from '../lib/outreachMessage.js'");
    expect(outreachPage).toMatch(
      /isSupabaseConfigured\s*\?\s*buildAccountOutreachMessage\([\s\S]{0,200}?:\s*buildMessage\(category, leadName\)/,
    );
  });

  it('the sender name is session-derived (S0C), never hardcoded', () => {
    expect(outreachPage).toContain("import { resolveDisplayName } from '../lib/userIdentity.js'");
    expect(outreachPage).toContain('const senderName = resolveDisplayName(session);');
  });

  it('an unconfigured cloud account sees the setup state instead of a message', () => {
    expect(outreachPage).toContain('isSupabaseConfigured && !accountReady');
    expect(outreachPage).toContain('OUTREACH_SETUP_REQUIRED');
  });

  it('no automatic sending or external delivery was introduced', () => {
    expect(outreachPage).not.toMatch(/\bfetch\(/);
    expect(outreachPage).not.toContain('mailto:');
    expect(outreachPage).not.toContain('wa.me');
  });
});

describe('S0F.1 · previously contained lanes stay contained', () => {
  it('Growth (all five routes) and the Memory-Only modules are unchanged', () => {
    for (const m of ['growth', 'projects', 'inventory', 'templates', 'activity']) {
      expect(BETA_HIDDEN_MODULES.has(m), m).toBe(true);
    }
    expect((app.match(/<GrowthBetaGate/g) || []).length).toBe(5);
  });

  it('the Studio handoff stays contained and the LIVE lanes stay ungated', () => {
    expect((assistant.match(/isSupabaseConfigured \? null : studioHandoffFor\(text\)/g) || []).length).toBe(2);
    expect(app).toContain('path="/outreach" element={<Outreach />}');
    expect(app).toContain('path="/studio" element={<ImageStudio />}');
    expect(app).toContain('path="/diagnose" element={<Diagnose />}');
  });
});
