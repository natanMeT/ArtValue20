import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Proves the poster layer is OFFLINE / RUNTIME-INERT for THIS slice:
//   (a) no file outside src/creative/v2/poster/ imports the poster module;
//   (b) poster runtime sources import nothing from judge/ or diagnostics/;
//   (c) poster sources contain no model/provider/gemini/fetch/dynamic-import code.
// Import SPECIFIERS are parsed (not raw substrings) so header comments that mention
// Gemini/provider by name only — to say they are NOT used — never trip the checks.

const SRC = 'src';
const POSTER_DIR = path.normalize('src/creative/v2/poster');
// Local-engine retirement (2026-07-27): comfyPosterPrompt.js was DELETED with its
// only consumer (the workstation poster adapter). The poster layer is back to
// FULLY runtime-inert — there is no sanctioned external importer left at all.
const RUNTIME_FILES = ['posterBridge.js', 'posterSchema.js', 'posterTypes.ts'];
const readPoster = (f) => fs.readFileSync(`src/creative/v2/poster/${f}`, 'utf8');
// Test files are not runtime wiring (mirrors the offer-isolation precedent).
const isTestFile = (p) => /\.test\.[jt]sx?$/.test(p) || /(^|[\\/])__tests__[\\/]/.test(p);

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

describe('poster layer isolation (offline / runtime-inert)', () => {
  it('all poster files exist', () => {
    for (const f of [...RUNTIME_FILES, '__tests__/posterBridge.test.js', '__tests__/posterSchema.test.js', '__tests__/posterIsolation.test.js']) {
      expect(fs.existsSync(`src/creative/v2/poster/${f}`)).toBe(true);
    }
  });

  it('the workstation poster prompt builder and its adapter are gone', () => {
    expect(fs.existsSync('src/creative/v2/poster/comfyPosterPrompt.js')).toBe(false);
    expect(fs.existsSync('src/lib/comfyPoster.js')).toBe(false);
  });

  // ZERO external RUNTIME importers. The single sanctioned exception (the
  // workstation poster adapter importing the prompt builder) went away with both
  // files, so the guard is unconditional again. Test files are not runtime wiring.
  it('18a/19. nothing outside poster/ imports poster/ at runtime', () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      const norm = path.normalize(file);
      if (norm.startsWith(POSTER_DIR)) continue; // skip poster's own files
      if (isTestFile(norm)) continue;            // tests are not runtime wiring
      for (const spec of importSpecifiers(fs.readFileSync(file, 'utf8'))) {
        const refsPoster = /(^|[./])poster\//.test(spec) || /creative\/v2\/poster/.test(spec);
        if (refsPoster) offenders.push(`${norm} → ${spec}`);
      }
    }
    expect(offenders, `unexpected runtime poster/ imports: ${offenders.join(', ')}`).toEqual([]);
  });

  it('18b/c. poster runtime sources import only sibling poster modules (no judge/diagnostics/runtime)', () => {
    const ALLOWED = ['./posterBridge.js'];
    for (const f of RUNTIME_FILES) {
      for (const spec of importSpecifiers(readPoster(f))) {
        expect(spec.includes('judge'), `${f} imports ${spec}`).toBe(false);
        expect(spec.includes('diagnostics'), `${f} imports ${spec}`).toBe(false);
        expect(spec.includes('..'), `${f} imports ${spec}`).toBe(false);
        expect(ALLOWED.includes(spec), `${f} imports ${spec}`).toBe(true);
      }
    }
  });

  it('18d. poster sources contain no model/provider/gemini imports, no fetch, no dynamic import', () => {
    const BANNED_SPEC = /gemini|provider|openai|ollama|\/lib\/|\/model/i;
    // Import-specifier purity holds for EVERY poster file (incl. tests).
    for (const f of [...RUNTIME_FILES, '__tests__/posterBridge.test.js', '__tests__/posterSchema.test.js', '__tests__/posterIsolation.test.js']) {
      for (const spec of importSpecifiers(readPoster(f))) {
        expect(BANNED_SPEC.test(spec), `${f} imports ${spec}`).toBe(false);
      }
    }
    // Raw-code checks apply to the RUNTIME sources (test files legitimately contain
    // these tokens as assertions/regex literals). Comments are stripped first.
    for (const f of RUNTIME_FILES) {
      const code = stripComments(readPoster(f));
      expect(/\bimport\s*\(/.test(code), `${f} has dynamic import()`).toBe(false);
      expect(/\bfetch\s*\(/.test(code), `${f} calls fetch()`).toBe(false);
      expect(/\brequire\s*\(/.test(code), `${f} calls require()`).toBe(false);
    }
  });

  it('the composers have no nondeterminism (no Date.now, no Math.random)', () => {
    for (const f of ['posterBridge.js']) {
      const code = stripComments(readPoster(f));
      expect(/Date\.now|new Date\(/.test(code), `${f} uses Date`).toBe(false);
      expect(/Math\.random/.test(code), `${f} uses Math.random`).toBe(false);
    }
  });
});
