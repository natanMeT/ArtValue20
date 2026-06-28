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
const RUNTIME_FILES = ['posterBridge.js', 'posterSchema.js', 'posterTypes.ts'];
const readPoster = (f) => fs.readFileSync(`src/creative/v2/poster/${f}`, 'utf8');

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
  it('all six poster files exist', () => {
    for (const f of [...RUNTIME_FILES, '__tests__/posterBridge.test.js', '__tests__/posterSchema.test.js', '__tests__/posterIsolation.test.js']) {
      expect(fs.existsSync(`src/creative/v2/poster/${f}`)).toBe(true);
    }
  });

  it('18a/19. no file OUTSIDE poster/ imports the poster module (runtime-inert, no wiring)', () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      if (path.normalize(file).startsWith(POSTER_DIR)) continue; // skip poster's own files
      const specs = importSpecifiers(fs.readFileSync(file, 'utf8'));
      for (const spec of specs) {
        if (/(^|[./])poster\//.test(spec) || /creative\/v2\/poster/.test(spec)) offenders.push(`${file} → ${spec}`);
      }
    }
    expect(offenders, `unexpected importers of poster/: ${offenders.join(', ')}`).toEqual([]);
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

  it('the composer has no nondeterminism (no Date.now, no Math.random)', () => {
    const code = stripComments(readPoster('posterBridge.js'));
    expect(/Date\.now|new Date\(/.test(code)).toBe(false);
    expect(/Math\.random/.test(code)).toBe(false);
  });
});
