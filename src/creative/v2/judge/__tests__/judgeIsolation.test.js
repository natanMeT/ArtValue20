import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

// Proves the judge layer is OFFLINE / RUNTIME-INERT: every static import in every
// judge source resolves to a sibling judge module (./...), and there are NO dynamic
// imports — so no runtime, UI, frozen, or model (gemini.js) module can ever be pulled
// in. Parsing import SPECIFIERS (not raw substrings) avoids false positives from the
// header comments, which mention gemini.js by name only to say it is never imported.
const FILES = ['judgeSchema.js', 'judgePrompt.js', 'semanticJudge.js', 'judgeEval.js'];
const read = (f) => fs.readFileSync(`src/creative/v2/judge/${f}`, 'utf8');

describe('judge layer isolation (offline / runtime-inert)', () => {
  it('all four judge source files exist', () => {
    for (const f of FILES) expect(fs.existsSync(`src/creative/v2/judge/${f}`)).toBe(true);
  });

  it('every static import is intra-judge (./...) — no runtime/UI/model imports', () => {
    for (const f of FILES) {
      const src = read(f);
      const specs = [...src.matchAll(/(?:^|\s)(?:import|export)\b[^'"\n]*?\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const spec of specs) {
        expect(spec.startsWith('./'), `${f} imports ${spec}`).toBe(true);
        expect(spec.includes('..')).toBe(false);
      }
    }
  });

  it('contains NO dynamic import() (so nothing external can be lazily loaded)', () => {
    for (const f of FILES) {
      expect(read(f)).not.toMatch(/\bimport\s*\(/);
    }
  });

  it('the only modules imported across the layer are judgeSchema + judgePrompt', () => {
    const all = new Set();
    for (const f of FILES) {
      const src = read(f);
      [...src.matchAll(/from\s*['"]([^'"]+)['"]/g)].forEach((m) => all.add(m[1]));
    }
    for (const spec of all) expect(['./judgeSchema.js', './judgePrompt.js']).toContain(spec);
  });
});
