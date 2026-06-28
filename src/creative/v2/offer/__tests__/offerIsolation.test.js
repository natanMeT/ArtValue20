import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Proves the offer layer is OFFLINE / RUNTIME-INERT for THIS slice:
//   (a) no file outside src/creative/v2/offer/ imports the offer module;
//   (b) offer runtime sources import only sibling offer modules (no runtime /
//       poster / judge / diagnostics / eval / providers);
//   (c) offer runtime sources contain no model/provider/gemini/fetch/dynamic-import
//       code and no Date.now / Math.random.
// Import SPECIFIERS are parsed (not raw substrings) so header comments that mention
// Gemini/provider by name only — to say they are NOT used — never trip the checks.

const SRC = 'src';
const OFFER_DIR = path.normalize('src/creative/v2/offer');
const RUNTIME_FILES = ['offerCampaignBridge.js', 'offerSchema.js', 'offerTypes.ts', 'presets/artValueServices.js'];
const TEST_FILES = [
  '__tests__/offerCampaignBridge.test.js',
  '__tests__/offerSchema.test.js',
  '__tests__/artValueServicesPreset.test.js',
  '__tests__/offerIsolation.test.js',
];
const readOffer = (f) => fs.readFileSync(`src/creative/v2/offer/${f}`, 'utf8');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function importSpecifiers(src) {
  return [...src.matchAll(/(?:^|\s)(?:import|export)\b[^'"\n]*?\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

// Strip block + line comments so the raw-code scans below are not tripped by this
// file's own documentation (which names Date.now / fetch only to say they are absent).
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('offer layer isolation (offline / runtime-inert)', () => {
  it('all eight offer files exist', () => {
    for (const f of [...RUNTIME_FILES, ...TEST_FILES]) {
      expect(fs.existsSync(`src/creative/v2/offer/${f}`), `missing ${f}`).toBe(true);
    }
  });

  // Exactly ONE sanctioned external importer is allowed: the composition root may
  // import the PUBLIC offer action entry — and ONLY that entry. Every other outside
  // importer, and any DEEPER offer/ import from the composition root (the bridge,
  // schema, presets, or types), remains an offender. This keeps the offer engine's
  // internals sealed while permitting the single product-wiring seam.
  // This guard targets RUNTIME wiring: production sources must not import offer/
  // except the one sanctioned seam. Test files are NOT runtime wiring — the offer
  // engine's own tests already import offer modules to assert behaviour, and a
  // sibling surface test legitimately imports the offer validator for the same
  // reason — so *.test.* files are exempt from the external-importer scan. The
  // runtime guard below stays fully strict.
  const isTestFile = (p) => /\.test\.[jt]sx?$/.test(p) || /(^|[\\/])__tests__[\\/]/.test(p);
  it('20. only the sanctioned composition root imports offer/ at runtime, and only the action entry', () => {
    const SANCTIONED_IMPORTER = path.normalize('src/creative/v2/createArtValueCreative.js');
    const SANCTIONED_SPEC = './offer/offerActions.js';
    const offenders = [];
    let sanctionedWired = false;
    for (const file of walk(SRC)) {
      const norm = path.normalize(file);
      if (norm.startsWith(OFFER_DIR)) continue; // skip offer's own files
      if (isTestFile(norm)) continue;           // tests are not runtime wiring
      const isSanctioned = norm === SANCTIONED_IMPORTER;
      for (const spec of importSpecifiers(fs.readFileSync(file, 'utf8'))) {
        const refsOffer = /(^|[./])offer\//.test(spec) || /creative\/v2\/offer/.test(spec);
        if (!refsOffer) continue;
        if (isSanctioned && spec === SANCTIONED_SPEC) { sanctionedWired = true; continue; }
        offenders.push(`${norm} → ${spec}`); // any other offer/ import (incl. bridge/schema/presets/types)
      }
    }
    expect(offenders, `unexpected runtime offer/ imports: ${offenders.join(', ')}`).toEqual([]);
    // The one sanctioned seam must actually exist (guards against a silently broken wiring).
    expect(sanctionedWired, 'createArtValueCreative.js must import ./offer/offerActions.js').toBe(true);
  });

  it('15/16/17. offer runtime sources import only sibling offer modules', () => {
    const BANNED = ['judge', 'diagnostics', 'eval', 'poster', 'production', 'contextBuilder', 'campaignStore'];
    for (const f of RUNTIME_FILES) {
      for (const spec of importSpecifiers(readOffer(f))) {
        // must stay inside offer/: relative, no parent-escape
        expect(spec.startsWith('.'), `${f} imports non-relative ${spec}`).toBe(true);
        expect(spec.includes('..'), `${f} escapes offer/ via ${spec}`).toBe(false);
        for (const bad of BANNED) {
          expect(spec.includes(bad), `${f} imports banned ${spec}`).toBe(false);
        }
      }
    }
  });

  it('18. offer sources contain no model/provider/gemini imports, no fetch, no dynamic import, no Date.now/Math.random', () => {
    // `(^|\/)schema\.js$` targets the canonical runtime schema (`../schema.js`)
    // WITHOUT catching the offer's own sibling validator (`../offerSchema.js`).
    const BANNED_SPEC = /gemini|provider|openai|ollama|\/lib\/|\/model|(^|\/)schema\.js$|\/schema$|runtime/i;
    // Import-specifier purity holds for EVERY offer file (incl. tests).
    for (const f of [...RUNTIME_FILES, ...TEST_FILES]) {
      for (const spec of importSpecifiers(readOffer(f))) {
        expect(BANNED_SPEC.test(spec), `${f} imports ${spec}`).toBe(false);
      }
    }
    // Raw-code checks apply to the RUNTIME sources (test files legitimately contain
    // these tokens as assertions). Comments are stripped first.
    for (const f of RUNTIME_FILES) {
      const code = stripComments(readOffer(f));
      expect(/\bimport\s*\(/.test(code), `${f} has dynamic import()`).toBe(false);
      expect(/\bfetch\s*\(/.test(code), `${f} calls fetch()`).toBe(false);
      expect(/\brequire\s*\(/.test(code), `${f} calls require()`).toBe(false);
      expect(/Date\.now|new Date\(/.test(code), `${f} uses Date`).toBe(false);
      expect(/Math\.random/.test(code), `${f} uses Math.random`).toBe(false);
    }
  });
});
