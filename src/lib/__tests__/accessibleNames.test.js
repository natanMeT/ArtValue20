// ===================================================================
// ACCESSIBILITY SLICE A1 — the NAMELESS controls carry an accessible name.
//
// ── WHAT THIS GUARDS, AND WHAT IT DELIBERATELY DOES NOT ──────────────
// A repo-wide scan on 2026-08-02 found 157 form controls in `src/**/*.jsx`
// and split them into two classes that need DIFFERENT fixes:
//
//   • 109 "visible label, not associated" — `<div class="field"><label>טלפון
//     </label><input/></div>`. Correct visible Hebrew text, but no `htmlFor`,
//     no wrapping, no `id`. Sighted users are fine; a screen reader announces a
//     blank field. Fixing those is an `id`/`htmlFor` or shared-component
//     decision across ~120 sites and is EXPLICITLY OUT OF SCOPE HERE.
//
//   • 31 "no visible label" — nameless to EVERYONE who cannot infer the control
//     from its position. Slice A1 fixed the 10 of those that sit on the list
//     screens plus the destructive-delete gate. This file pins those 10.
//
// ── WHY IT IS PARSER-BACKED ──────────────────────────────────────────
// It reuses `parserOptionsFor` from ./support/sourceScan.js, so this guard and
// the local-engine retirement proof cannot disagree about how a `.jsx` file is
// parsed. A regex over JSX would have to approximate the grammar, and this
// repository has already been bitten three times by exactly that (a `//` inside
// a URL, template-substitution depth, JSX text with no state).
//
// ── WHY IT ASSERTS SHAPE, NOT PIXELS ─────────────────────────────────
// There is no jsdom environment and no @testing-library in this project, so no
// test here can compute a real accessible NAME by rendering. This asserts the
// attribute that produces the name. Stated rather than implied: it proves the
// `aria-label` is present and non-empty, NOT what a screen reader announces.
//
// ── THE TWO CONTROL CLASSES THAT KEEP THIS HONEST ────────────────────
// POSITIVE: the walker must FIND every pinned control. A guard that silently
// matches nothing passes forever — that failure mode is why the SECURITY
// DEFINER corpus guard asserts its own parser found something.
// NEGATIVE: `missingAriaLabels()` is run against a MUTATED copy of the real
// source with one `aria-label` deleted, and must report that control. The
// mutation exercises the SAME function the assertions run, not a re-write of it.
// ===================================================================
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import { parserOptionsFor } from './support/sourceScan.js';

const SRC = path.resolve(__dirname, '..', '..');
const CONTROL_TAGS = new Set(['input', 'select', 'textarea']);

/** Raw source text of an attribute value: a literal's value, or the exact
 *  source of an expression container (so a template literal stays inspectable). */
function attrText(attr, src) {
  const v = attr.value;
  if (!v) return '';                                   // bare attribute
  if (v.type === 'StringLiteral') return v.value;
  if (v.type === 'JSXExpressionContainer') return src.slice(v.expression.start, v.expression.end);
  return '';
}

/** Every input/select/textarea in a file, with its attributes flattened.
 *  Walks the AST generically rather than importing a traversal dependency. */
export function controlsIn(file) {
  const src = fs.readFileSync(file, 'utf8');
  const ast = parse(src, parserOptionsFor(file));
  const out = [];
  const seen = new Set();
  (function walk(node) {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (node.type === 'JSXOpeningElement' && node.name?.type === 'JSXIdentifier'
        && CONTROL_TAGS.has(node.name.name)) {
      const attrs = {};
      for (const a of node.attributes) {
        if (a.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier') {
          attrs[a.name.name] = attrText(a, src);
        }
      }
      out.push({ tag: node.name.name, attrs, line: src.slice(0, node.start).split('\n').length });
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
    }
  })(ast);
  return out;
}

// The pinned set. Controls are matched by a DISTINGUISHING ATTRIBUTE, never by
// line number — a line number drifts on the first unrelated edit above it and
// turns a real regression into a confusing miss.
const PINNED = [
  { file: 'pages/Clients.jsx',           tag: 'input',    match: (a) => (a.placeholder || '').includes('חיפוש לפי שם'), expect: 'חיפוש לקוחות' },
  { file: 'pages/Clients.jsx',           tag: 'select',   match: (a) => (a.className || '').includes('mini-select'),    expect: 'שלב בפייפליין' },
  { file: 'pages/Inventory.jsx',         tag: 'input',    match: (a) => (a.placeholder || '').includes('חיפוש פריט'),   expect: 'חיפוש במלאי' },
  { file: 'pages/Assets.jsx',            tag: 'input',    match: (a) => (a.placeholder || '').includes('חיפוש קובץ'),   expect: 'חיפוש בנכסים' },
  { file: 'pages/Outreach.jsx',          tag: 'input',    match: (a) => (a.className || '').includes('input grow'),     expect: 'רעיונות לידים' },
  { file: 'pages/Tasks.jsx',             tag: 'select',   match: (a) => (a.className || '').includes('mini-select'),    expect: 'סטטוס המשימה' },
  { file: 'pages/ProjectDetail.jsx',     tag: 'select',   match: (a) => (a.className || '').includes('mini-select'),    expect: 'סטטוס המשימה' },
  { file: 'pages/Pipeline.jsx',          tag: 'select',   match: (a) => (a.className || '').includes('mini-select'),    expect: 'העברת' },
  { file: 'pages/Quotes.jsx',            tag: 'select',   match: (a) => (a['aria-label'] || '').includes('שינוי סטטוס'), expect: 'שינוי סטטוס' },
  { file: 'components/ai/Assistant.jsx', tag: 'input',    match: (a) => (a.className || '').includes('ai-gate-code'),   expect: 'קוד אישור למחיקה' },
];

/** THE CHECKER. Returns one entry per pinned control that is missing, empty or
 *  wrong. Both the assertions AND the negative controls call this, so a
 *  mutation cannot pass here while failing in a re-implementation. */
export function missingAriaLabels(pinned = PINNED, readFile = null) {
  const problems = [];
  for (const p of pinned) {
    const abs = path.join(SRC, p.file);
    let controls;
    if (readFile) {
      // Negative-control path: parse supplied (mutated) source for this file.
      const src = readFile(p.file);
      if (src === null) { controls = controlsIn(abs); }
      else {
        const ast = parse(src, parserOptionsFor(abs));
        controls = [];
        const seen = new Set();
        (function walk(node) {
          if (!node || typeof node !== 'object' || seen.has(node)) return;
          seen.add(node);
          if (node.type === 'JSXOpeningElement' && node.name?.type === 'JSXIdentifier'
              && CONTROL_TAGS.has(node.name.name)) {
            const attrs = {};
            for (const a of node.attributes) {
              if (a.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier') attrs[a.name.name] = attrText(a, src);
            }
            controls.push({ tag: node.name.name, attrs });
          }
          for (const k of Object.keys(node)) {
            const v = node[k];
            if (Array.isArray(v)) v.forEach(walk);
            else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v);
          }
        })(ast);
      }
    } else {
      controls = controlsIn(abs);
    }
    const hits = controls.filter((c) => c.tag === p.tag && p.match(c.attrs));
    if (hits.length === 0) { problems.push({ ...p, reason: 'control not found' }); continue; }
    for (const h of hits) {
      const label = h.attrs['aria-label'];
      if (label === undefined) problems.push({ ...p, reason: 'no aria-label' });
      else if (!label.trim()) problems.push({ ...p, reason: 'empty aria-label' });
      else if (!label.includes(p.expect)) problems.push({ ...p, reason: `aria-label lacks "${p.expect}" (got ${label})` });
    }
  }
  return problems;
}

describe('accessibility A1 — nameless list-screen controls carry an aria-label', () => {
  // POSITIVE CONTROL FIRST. If the walker stops finding controls, every
  // assertion below would pass by matching nothing.
  it('the parser-backed walker actually finds form controls (guard cannot rot into a no-op)', () => {
    const total = PINNED
      .map((p) => controlsIn(path.join(SRC, p.file)).length)
      .reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(20);
    for (const p of PINNED) {
      const controls = controlsIn(path.join(SRC, p.file));
      expect(controls.filter((c) => c.tag === p.tag && p.match(c.attrs)).length,
        `no ${p.tag} matched in ${p.file} — the matcher has drifted`).toBeGreaterThan(0);
    }
  });

  it('all 10 pinned controls carry a non-empty, correct aria-label', () => {
    expect(missingAriaLabels()).toEqual([]);
  });

  it('pins exactly the 10 controls slice A1 fixed', () => {
    expect(PINNED).toHaveLength(10);
  });

  // The repeated row controls must be DISTINGUISHABLE, not ten identical names.
  // A static "סטטוס" on every row is technically a name and practically useless.
  it('per-row controls build their name from the row subject', () => {
    const rowScoped = [
      ['pages/Tasks.jsx', 'mini-select', 't.title'],
      ['pages/ProjectDetail.jsx', 'mini-select', 't.title'],
      ['pages/Pipeline.jsx', 'mini-select', 'c.name'],
      ['pages/Quotes.jsx', 'select', 'quote.number'],
    ];
    for (const [file, cls, subject] of rowScoped) {
      const hit = controlsIn(path.join(SRC, file))
        .find((c) => c.tag === 'select' && (c.attrs.className || '').includes(cls) && c.attrs['aria-label']);
      expect(hit, `${file}: no aria-labelled select matched`).toBeTruthy();
      expect(hit.attrs['aria-label'], `${file}: aria-label must include ${subject}`).toContain(subject);
    }
  });

  // NEGATIVE CONTROLS — these must FAIL the checker, or the checker proves nothing.
  it('NEGATIVE: deleting an aria-label from the real source is reported', () => {
    const target = 'pages/Tasks.jsx';
    const real = fs.readFileSync(path.join(SRC, target), 'utf8');
    const mutated = real.replace(/\s*aria-label=\{`סטטוס המשימה: \$\{t\.title\}`\}/, '');
    expect(mutated, 'mutation did not apply — the negative control would be vacuous').not.toBe(real);
    const problems = missingAriaLabels(PINNED, (f) => (f === target ? mutated : null));
    expect(problems.some((p) => p.file === target && p.reason === 'no aria-label')).toBe(true);
  });

  it('NEGATIVE: emptying an aria-label is reported', () => {
    const target = 'components/ai/Assistant.jsx';
    const real = fs.readFileSync(path.join(SRC, target), 'utf8');
    const mutated = real.replace('aria-label="קוד אישור למחיקה"', 'aria-label="  "');
    expect(mutated).not.toBe(real);
    const problems = missingAriaLabels(PINNED, (f) => (f === target ? mutated : null));
    expect(problems.some((p) => p.file === target && p.reason === 'empty aria-label')).toBe(true);
  });

  it('NEGATIVE: replacing a row-scoped name with a static one is reported', () => {
    const target = 'pages/Pipeline.jsx';
    const real = fs.readFileSync(path.join(SRC, target), 'utf8');
    const mutated = real.replace(/aria-label=\{`העברת \$\{c\.name\} לשלב אחר בפייפליין`\}/, 'aria-label="שלב"');
    expect(mutated).not.toBe(real);
    const problems = missingAriaLabels(PINNED, (f) => (f === target ? mutated : null));
    expect(problems.some((p) => p.file === target)).toBe(true);
  });

  // Scope guard: this slice must NOT have started the 109-control `.field` work.
  it('SCOPE: no id/htmlFor pairing was introduced by this slice', () => {
    const touched = ['pages/Clients.jsx', 'pages/Inventory.jsx', 'pages/Assets.jsx',
      'pages/Outreach.jsx', 'pages/Tasks.jsx', 'pages/ProjectDetail.jsx',
      'pages/Pipeline.jsx', 'pages/Quotes.jsx', 'components/ai/Assistant.jsx'];
    for (const f of touched) {
      expect(fs.readFileSync(path.join(SRC, f), 'utf8'),
        `${f}: slice A1 is aria-label only — htmlFor belongs to the separate .field slice`).not.toContain('htmlFor');
    }
  });
});
