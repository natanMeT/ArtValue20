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
//     ⚠️ 109 WAS THE COUNT WHEN A1 SHIPPED, AND IT IS NO LONGER CURRENT.
//     A2 closed Login's 2 (→ 107), A3 closed ItemModal's 9 (→ 98), A4
//     closed ClientModal's 12 (→ 86) and A5 closed TaskModal's 9 (→ 77).
//     ⚠️ THAT NUMBER IS A MEASURED SCAN RESULT, NOT AN INVARIANT THIS FILE
//     ENFORCES — nothing here fails when the bucket moves, so treat it as a
//     comment that must be edited by hand each slice, exactly as it was here.
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
import { labelsIn, controlsIn } from './support/a11yScan.js';

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

// ⚠️ `labelsIn` and `controlsIn` USED TO BE DEFINED HERE and are now imported
// from ./support/a11yScan.js, which the `npm run a11y:count` report also uses.
// Two copies of a JSX walker in one repo is the drift this file has already
// been bitten by once — `missingAriaLabels` re-implemented its own traversal
// for the negative-control path, so a mutation could in principle pass in one
// and fail in the other. One definition, both consumers.
// The shared version returns the same `{ tag, attrs, line }` shape plus the
// structural fields the bucket classifier needs; nothing here reads those.
// ⚠️ Imported AND re-exported, not `export … from`: that form creates no local
// binding, and every assertion below calls `controlsIn` directly.
export { labelsIn, controlsIn };

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

  // Scope guard: A1 must NOT have started the `.field` work. Login (slice A2)
  // is deliberately NOT in this list — it is the one file where htmlFor is the
  // point, and it is guarded by its own block below.
  it('SCOPE: A1 stayed aria-label-only in the files it touched', () => {
    const touched = ['pages/Clients.jsx', 'pages/Inventory.jsx', 'pages/Assets.jsx',
      'pages/Outreach.jsx', 'pages/Tasks.jsx', 'pages/ProjectDetail.jsx',
      'pages/Pipeline.jsx', 'pages/Quotes.jsx', 'components/ai/Assistant.jsx'];
    for (const f of touched) {
      expect(fs.readFileSync(path.join(SRC, f), 'utf8'),
        `${f}: slice A1 is aria-label only — htmlFor belongs to the separate .field slice`).not.toContain('htmlFor');
    }
  });
});

// ===================================================================
// ACCESSIBILITY SLICE A2 — Login's two fields are PROGRAMMATICALLY associated.
//
// A1 covered controls with NO label at all. Login is the other class: it has
// correct visible Hebrew labels (`אימייל`, `סיסמה`) that name nothing, because
// no `htmlFor` points at any `id`. A screen reader announced two unnamed edit
// fields, and clicking the label did not focus the input — on the one screen
// every user must pass through.
//
// A2 is `id` + `htmlFor` ONLY. It does NOT wrap the control in the label, does
// NOT introduce a shared <Field>, does NOT use useId and touches NO CSS —
// `.field label` is a DESCENDANT selector (index.css:321), so leaving the DOM
// shape alone means the styling cannot move.
//
// ⚠️ LITERAL IDS ARE SAFE HERE FOR A SPECIFIC REASON, NOT AS A GENERAL RULE.
// `App.jsx` renders <Login /> only when `supabaseEnabled && !session`, and the
// routed app is not rendered at the same time — a proven singleton, exactly one
// instance. Anything that can render more than once concurrently MUST derive a
// stable id from its own domain key instead, which is what the three existing
// sites already do (`gallery-campaign-${g.id}`, `plan-${f.key}`, `gc-${f.key}`).
// Copying a literal id into a repeated component would produce DUPLICATE IDS,
// which are invalid and SILENTLY break the very association this slice adds.
// ===================================================================
describe('accessibility A2 — Login labels are programmatically associated', () => {
  const LOGIN = 'pages/Login.jsx';
  const PAIRS = [
    { id: 'login-email', type: 'email' },
    { id: 'login-password', type: 'password' },
  ];

  /** THE CHECKER. Returns one problem per unsatisfied pairing. Both the
   *  assertions and the negative controls call this, so a mutation cannot pass
   *  here while failing in a re-implementation. */
  function unpairedLoginFields(source = null) {
    const abs = path.join(SRC, LOGIN);
    const controls = controlsIn(abs, source);
    const labels = labelsIn(abs, source);
    const problems = [];
    for (const p of PAIRS) {
      const control = controls.find((c) => c.attrs.id === p.id);
      if (!control) { problems.push({ id: p.id, reason: 'no control carries that id' }); continue; }
      if (control.attrs.type !== p.type) problems.push({ id: p.id, reason: `wrong control type ${control.attrs.type}` });
      if (!labels.some((l) => l.attrs.htmlFor === p.id)) problems.push({ id: p.id, reason: 'no label htmlFor points at it' });
    }
    return problems;
  }

  it('POSITIVE CONTROL: the walker finds Login\'s controls and labels at all', () => {
    const controls = controlsIn(path.join(SRC, LOGIN));
    const labels = labelsIn(path.join(SRC, LOGIN));
    expect(controls.length, 'no controls parsed — the guard would pass by finding nothing').toBeGreaterThanOrEqual(2);
    expect(labels.length, 'no labels parsed — the guard would pass by finding nothing').toBeGreaterThanOrEqual(2);
  });

  it('both Login fields have an id AND a label that references it', () => {
    expect(unpairedLoginFields()).toEqual([]);
  });

  // The whole point of the slice is the association, so assert the pairing in
  // BOTH directions rather than trusting that two attributes merely exist.
  it('every htmlFor in Login resolves to a control id in the same file', () => {
    const ids = new Set(controlsIn(path.join(SRC, LOGIN)).map((c) => c.attrs.id).filter(Boolean));
    for (const l of labelsIn(path.join(SRC, LOGIN))) {
      if (l.attrs.htmlFor) {
        expect(ids.has(l.attrs.htmlFor), `Login.jsx:${l.line} htmlFor="${l.attrs.htmlFor}" points at no control`).toBe(true);
      }
    }
  });

  // Password managers and autofill depend on these. The slice must not have
  // disturbed them while adding the ids.
  it('autoComplete and autoFocus survived the change', () => {
    const src = fs.readFileSync(path.join(SRC, LOGIN), 'utf8');
    expect(src).toContain('autoComplete="username"');
    expect(src).toContain('autoComplete="current-password"');
    expect(src).toContain('autoFocus');
  });

  // A2 is id/htmlFor only. Wrapping would change the DOM shape and would need a
  // CSS rule that does not exist for `.field`.
  it('SCOPE: Login uses id/htmlFor, not a wrapping label and not useId', () => {
    const src = fs.readFileSync(path.join(SRC, LOGIN), 'utf8');
    expect(src, 'A2 must not introduce useId').not.toContain('useId');
    for (const l of labelsIn(path.join(SRC, LOGIN))) {
      expect(l.attrs.htmlFor, 'every Login label must name a control explicitly').toBeTruthy();
    }
  });

  // ⚠️ DUPLICATE-ID GUARD. A literal id repeated anywhere in src/ is invalid
  // HTML and silently breaks label association — the exact defect this work
  // exists to fix. Only LITERAL ids can be compared statically; expression ids
  // (`gallery-campaign-${g.id}`) are excluded because their uniqueness is a
  // runtime property this scan cannot decide, and pretending otherwise would be
  // a check that looks stronger than it is.
  it('no literal id is used twice anywhere in src/**/*.jsx', () => {
    const files = [];
    (function walkDir(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') walkDir(p); }
        else if (e.name.endsWith('.jsx')) files.push(p);
      }
    })(SRC);
    expect(files.length, 'no .jsx files scanned').toBeGreaterThan(20);

    const seen = new Map();
    const dupes = [];
    for (const f of files) {
      for (const c of controlsIn(f)) {
        const id = c.attrs.id;
        // Literal only: an expression id contains a template/interpolation.
        if (!id || /[`${}]/.test(id)) continue;
        const where = `${path.relative(SRC, f).replace(/\\/g, '/')}:${c.line}`;
        if (seen.has(id)) dupes.push(`${id} — ${seen.get(id)} and ${where}`);
        else seen.set(id, where);
      }
    }
    // Sentinel: the scan must actually find the ids it exists to police, or a
    // broken walker would report "no duplicates" forever. Extended by A3 —
    // every literal id this work has added so far is named here on purpose.
    for (const id of ['login-email', 'login-password',
      'item-name', 'item-category', 'item-sku', 'item-supplier', 'item-qty',
      'item-low-threshold', 'item-unit-price', 'item-cost', 'item-note',
      'client-name', 'client-contact', 'client-phone', 'client-email',
      'client-status', 'client-value', 'client-paid-date', 'client-project-type',
      'client-source', 'client-next-action', 'client-next-action-date', 'client-notes']) {
      expect(seen.has(id), `the scan did not even find "${id}", one of the ids it is meant to police`).toBe(true);
    }
    expect(dupes).toEqual([]);
  });

  // NEGATIVE CONTROLS — each drives the SAME checker the assertions use.
  it('NEGATIVE: removing htmlFor from the real source is reported', () => {
    const real = fs.readFileSync(path.join(SRC, LOGIN), 'utf8');
    const mutated = real.replace(' htmlFor="login-email"', '');
    expect(mutated, 'mutation did not apply — the control would be vacuous').not.toBe(real);
    expect(unpairedLoginFields(mutated).some((p) => p.id === 'login-email'
      && p.reason === 'no label htmlFor points at it')).toBe(true);
  });

  it('NEGATIVE: removing the id from the real source is reported', () => {
    const real = fs.readFileSync(path.join(SRC, LOGIN), 'utf8');
    const mutated = real.replace(/\r?\n\s*id="login-password"/, '');
    expect(mutated).not.toBe(real);
    expect(unpairedLoginFields(mutated).some((p) => p.id === 'login-password'
      && p.reason === 'no control carries that id')).toBe(true);
  });

  it('NEGATIVE: a htmlFor/id typo mismatch is reported', () => {
    const real = fs.readFileSync(path.join(SRC, LOGIN), 'utf8');
    const mutated = real.replace('htmlFor="login-email"', 'htmlFor="login-emial"');
    expect(mutated).not.toBe(real);
    expect(unpairedLoginFields(mutated).some((p) => p.id === 'login-email')).toBe(true);
  });
});

// ===================================================================
// ACCESSIBILITY SLICE A3 — ItemModal's nine `.field` blocks are associated.
//
// A2 proved the pattern on Login (2 controls). A3 is the first slice INSIDE the
// bucket proper: nine `<div class="field"><label>…</label><input/></div>` blocks
// in one modal, fixed with `id` + `htmlFor` and nothing else.
//
// ⚠️ WHY LITERAL IDS ARE APPROVED HERE — THE SAME TEST A2 HAD TO PASS.
// A literal id is only safe on a control that cannot render twice at once. That
// was ESTABLISHED, not assumed, and the load-bearing facts are pinned below:
//   1. <ItemModal> is mounted at EXACTLY ONE site — Inventory.jsx.
//   2. Inventory.jsx mounts no other modal and has ZERO `.field` blocks of its
//      own, so nothing on that page can collide with these ids.
//   3. Modal.jsx renders `{open && (…)}`, so the fields UNMOUNT when closed —
//      two instances can never coexist even across open/close.
//   4. None of the nine sits inside a `.map()`.
// Anything failing 1–4 must derive its id from a domain key instead. The
// repo-wide duplicate-id guard above is the backstop, and it now also polices
// these nine.
//
// ⚠️ WHAT THIS CANNOT PROVE, unchanged since A1: no jsdom and no
// @testing-library exist here, so no test computes a rendered accessible NAME.
// This asserts the attributes that produce it. Unlike A2, the rendered result
// is NOT agent-measurable either — Inventory sits behind sign-in, so the
// DOM-level evidence has to come from an authenticated QA session.
// ===================================================================
describe('accessibility A3 — ItemModal .field labels are programmatically associated', () => {
  const ITEM_MODAL = 'components/forms/ItemModal.jsx';
  const A3_IDS = [
    'item-name', 'item-category', 'item-sku', 'item-supplier', 'item-qty',
    'item-low-threshold', 'item-unit-price', 'item-cost', 'item-note',
  ];

  /** THE CHECKER. Both the assertions and every negative control call this, so
   *  a mutation cannot pass here while failing in a re-implementation. */
  function unpairedItemFields(source = null) {
    const abs = path.join(SRC, ITEM_MODAL);
    const controls = controlsIn(abs, source);
    const labels = labelsIn(abs, source);
    const problems = [];
    for (const id of A3_IDS) {
      const control = controls.find((c) => c.attrs.id === id);
      if (!control) { problems.push({ id, reason: 'no control carries that id' }); continue; }
      if (!labels.some((l) => l.attrs.htmlFor === id)) problems.push({ id, reason: 'no label htmlFor points at it' });
    }
    return problems;
  }

  it('POSITIVE CONTROL: the walker finds ItemModal\'s controls and labels at all', () => {
    const controls = controlsIn(path.join(SRC, ITEM_MODAL));
    const labels = labelsIn(path.join(SRC, ITEM_MODAL));
    expect(controls.length, 'no controls parsed — the guard would pass by finding nothing').toBeGreaterThanOrEqual(9);
    expect(labels.length, 'no labels parsed — the guard would pass by finding nothing').toBeGreaterThanOrEqual(9);
  });

  it('all nine fields have an id AND a label that references it', () => {
    expect(unpairedItemFields()).toEqual([]);
  });

  it('every htmlFor in ItemModal resolves to a control id in the same file', () => {
    const ids = new Set(controlsIn(path.join(SRC, ITEM_MODAL)).map((c) => c.attrs.id).filter(Boolean));
    for (const l of labelsIn(path.join(SRC, ITEM_MODAL))) {
      if (l.attrs.htmlFor) {
        expect(ids.has(l.attrs.htmlFor), `ItemModal.jsx:${l.line} htmlFor="${l.attrs.htmlFor}" points at no control`).toBe(true);
      }
    }
  });

  // No label may be left behind: a partially-converted modal is the worst
  // outcome, because the fixed fields make the unfixed ones look intentional.
  it('NO label in ItemModal is left without a htmlFor', () => {
    for (const l of labelsIn(path.join(SRC, ITEM_MODAL))) {
      expect(l.attrs.htmlFor, `ItemModal.jsx:${l.line} label still names nothing`).toBeTruthy();
    }
  });

  // ⚠️ THE SINGLETON PREMISE, ASSERTED RATHER THAN TRUSTED. If someone mounts
  // ItemModal a second time, the literal ids silently become duplicates and the
  // association this slice added breaks without any visible symptom.
  it('SINGLETON PREMISE: <ItemModal> is mounted at exactly one site', () => {
    const mounts = [];
    (function walkDir(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') walkDir(p); }
        else if (e.name.endsWith('.jsx') && p !== path.join(SRC, ITEM_MODAL)) {
          if (/<ItemModal[\s/>]/.test(fs.readFileSync(p, 'utf8'))) {
            mounts.push(path.relative(SRC, p).replace(/\\/g, '/'));
          }
        }
      }
    })(SRC);
    expect(mounts, 'a second mount site invalidates the literal-id decision — derive ids from a domain key instead')
      .toEqual(['pages/Inventory.jsx']);
  });

  // The other half of the premise: the host page must not carry `.field` blocks
  // that could collide once the modal is open over it.
  it('SINGLETON PREMISE: Inventory.jsx has no .field blocks of its own', () => {
    const src = fs.readFileSync(path.join(SRC, 'pages/Inventory.jsx'), 'utf8');
    expect(src).not.toContain('className="field"');
  });

  // A3 is id/htmlFor only — the same boundary A2 held.
  it('SCOPE: ItemModal uses id/htmlFor, not a wrapping label, not useId, not a shared Field', () => {
    const src = fs.readFileSync(path.join(SRC, ITEM_MODAL), 'utf8');
    expect(src, 'A3 must not introduce useId').not.toContain('useId');
    expect(src, 'A3 must not introduce a shared Field component').not.toContain('<Field');
    // DOM shape unchanged: still nine `.field` divs, each with a sibling label.
    expect(src.match(/className="field/g) || []).toHaveLength(9);
  });

  // Scope guard: A3 must not have spilled into the files the spec excluded.
  // ⚠️ ImageStudio.jsx is NOT in this list — it already carried one EXPRESSION
  // `htmlFor` before any accessibility slice existed, so asserting zero there
  // would fail for a reason unrelated to this slice.
  // ⚠️ `TaskModal.jsx` WAS on this list and was REMOVED by A5, which is the
  // approved slice that fixed it. The list means "not yet started", not "must
  // never be touched" — leaving a completed file here would fail CI for the
  // very work that was authorised.
  it('SCOPE: A3 did not start the other .field files', () => {
    const untouched = ['components/forms/ProjectModal.jsx',
      'components/onboarding/OnboardingWizard.jsx', 'components/settings/BusinessContextEditor.jsx'];
    for (const f of untouched) {
      expect(fs.readFileSync(path.join(SRC, f), 'utf8'),
        `${f}: A3 is ItemModal-only — this file belongs to a later slice`).not.toContain('htmlFor');
    }
  });

  // NEGATIVE CONTROLS — each drives the SAME checker the assertions use.
  it('NEGATIVE: removing a htmlFor from the real source is reported', () => {
    const real = fs.readFileSync(path.join(SRC, ITEM_MODAL), 'utf8');
    const mutated = real.replace(' htmlFor="item-qty"', '');
    expect(mutated, 'mutation did not apply — the control would be vacuous').not.toBe(real);
    expect(unpairedItemFields(mutated).some((p) => p.id === 'item-qty'
      && p.reason === 'no label htmlFor points at it')).toBe(true);
  });

  it('NEGATIVE: removing an id from the real source is reported', () => {
    const real = fs.readFileSync(path.join(SRC, ITEM_MODAL), 'utf8');
    const mutated = real.replace(' id="item-category"', '');
    expect(mutated).not.toBe(real);
    expect(unpairedItemFields(mutated).some((p) => p.id === 'item-category'
      && p.reason === 'no control carries that id')).toBe(true);
  });

  it('NEGATIVE: a htmlFor/id typo mismatch is reported', () => {
    const real = fs.readFileSync(path.join(SRC, ITEM_MODAL), 'utf8');
    const mutated = real.replace('htmlFor="item-unit-price"', 'htmlFor="item-unitprice"');
    expect(mutated).not.toBe(real);
    expect(unpairedItemFields(mutated).some((p) => p.id === 'item-unit-price')).toBe(true);
  });

  // ⚠️ THE CLASS THIS SLICE IS MOST EXPOSED TO. Copying a literal id into a
  // second place is the failure the A2 rule exists to prevent, so prove the
  // repo-wide duplicate-id guard actually catches it rather than assuming it.
  it('NEGATIVE: a duplicated literal id would be caught by the duplicate scan', () => {
    const real = fs.readFileSync(path.join(SRC, ITEM_MODAL), 'utf8');
    const mutated = real.replace(' id="item-note"', ' id="item-name"');
    expect(mutated).not.toBe(real);
    const ids = controlsIn(path.join(SRC, ITEM_MODAL), mutated)
      .map((c) => c.attrs.id).filter((id) => id && !/[`${}]/.test(id));
    expect(ids.length - new Set(ids).size, 'the duplicate was not detected').toBeGreaterThan(0);
  });
});

// ===================================================================
// ACCESSIBILITY SLICE A4 — ClientModal's twelve `.field` blocks.
//
// ⚠️ WHY THIS FILE AND NOT THE ONES WITH MORE GAPS — A GATE A3 DID NOT APPLY.
// A3 fixed ItemModal, which is CORRECT but UNREACHABLE: `Inventory.jsx` returns
// <BetaUnavailable/> early whenever `isSupabaseConfigured`, so in cloud mode the
// page body — and therefore <ItemModal> — never renders at all. The same is true
// of Projects (ProjectModal, ProjectDetail), Templates and Activity, which are
// the very files that top the remaining-gap count. A fix nobody can reach cannot
// be owner-QA'd against the exact Production artifact.
//
// A4 therefore adds a THIRD condition to the A2 rule, and asserts it below:
//   REACHABILITY — the module must render in cloud mode.
//   SINGLETON    — mounted once, cannot render twice concurrently.
//   NOT REPEATED — not inside a `.map()`.
// `/clients` carries no `betaHidden` flag, is absent from BETA_HIDDEN_MODULES,
// and `Clients.jsx` has no BetaUnavailable early return — so the modal is
// reachable by a signed-in owner and the twelve labels can actually be clicked.
//
// ⚠️ ONE FIELD IS CONDITIONAL. `client-paid-date` renders only while status is
// `completed_paid`. That does not weaken the literal id — a conditional control
// still renders at most once — but it does mean the DOM assertion for it only
// holds in that state, which QA has to know.
// ===================================================================
describe('accessibility A4 — ClientModal .field labels are programmatically associated', () => {
  const CLIENT_MODAL = 'components/forms/ClientModal.jsx';
  const A4_IDS = [
    'client-name', 'client-contact', 'client-phone', 'client-email',
    'client-status', 'client-value', 'client-paid-date', 'client-project-type',
    'client-source', 'client-next-action', 'client-next-action-date', 'client-notes',
  ];

  /** THE CHECKER — shared by the assertions and every negative control. */
  function unpairedClientFields(source = null) {
    const abs = path.join(SRC, CLIENT_MODAL);
    const controls = controlsIn(abs, source);
    const labels = labelsIn(abs, source);
    const problems = [];
    for (const id of A4_IDS) {
      const control = controls.find((c) => c.attrs.id === id);
      if (!control) { problems.push({ id, reason: 'no control carries that id' }); continue; }
      if (!labels.some((l) => l.attrs.htmlFor === id)) problems.push({ id, reason: 'no label htmlFor points at it' });
    }
    return problems;
  }

  it('POSITIVE CONTROL: the walker finds ClientModal\'s controls and labels at all', () => {
    expect(controlsIn(path.join(SRC, CLIENT_MODAL)).length,
      'no controls parsed — the guard would pass by finding nothing').toBeGreaterThanOrEqual(12);
    expect(labelsIn(path.join(SRC, CLIENT_MODAL)).length,
      'no labels parsed — the guard would pass by finding nothing').toBeGreaterThanOrEqual(12);
  });

  it('all twelve fields have an id AND a label that references it', () => {
    expect(unpairedClientFields()).toEqual([]);
  });

  it('every htmlFor in ClientModal resolves to a control id in the same file', () => {
    const ids = new Set(controlsIn(path.join(SRC, CLIENT_MODAL)).map((c) => c.attrs.id).filter(Boolean));
    for (const l of labelsIn(path.join(SRC, CLIENT_MODAL))) {
      if (l.attrs.htmlFor) {
        expect(ids.has(l.attrs.htmlFor), `ClientModal.jsx:${l.line} htmlFor="${l.attrs.htmlFor}" points at no control`).toBe(true);
      }
    }
  });

  it('NO label in ClientModal is left without a htmlFor', () => {
    for (const l of labelsIn(path.join(SRC, CLIENT_MODAL))) {
      expect(l.attrs.htmlFor, `ClientModal.jsx:${l.line} label still names nothing`).toBeTruthy();
    }
  });

  // ⚠️ THE GATE A3 MISSED, NOW ENFORCED. If someone later adds a
  // BetaUnavailable early return to Clients.jsx, this slice silently becomes
  // unreachable exactly as A3 did — and this test is how that gets noticed.
  it('REACHABILITY: /clients renders in cloud mode — no BetaUnavailable, no betaHidden', () => {
    const page = fs.readFileSync(path.join(SRC, 'pages/Clients.jsx'), 'utf8');
    expect(page, 'Clients.jsx must not gate itself behind BetaUnavailable').not.toContain('BetaUnavailable');

    const nav = fs.readFileSync(path.join(SRC, 'components/layout/sidebarNav.js'), 'utf8');
    const clientsEntry = nav.split('\n').find((l) => l.includes("to: '/clients'")) || '';
    expect(clientsEntry, 'the /clients nav entry disappeared').toBeTruthy();
    expect(clientsEntry, '/clients must not become betaHidden — the modal would be unreachable in cloud mode').not.toContain('betaHidden');

    const beta = fs.readFileSync(path.join(SRC, 'lib/betaCapabilities.js'), 'utf8');
    const hidden = beta.split('\n').find((l) => l.includes('BETA_HIDDEN_MODULES = ')) || '';
    expect(hidden, 'BETA_HIDDEN_MODULES line not found — the reachability check would be vacuous').toBeTruthy();
    expect(hidden).not.toContain("'clients'");
  });

  it('SINGLETON PREMISE: <ClientModal> is mounted at exactly one site', () => {
    const mounts = [];
    (function walkDir(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') walkDir(p); }
        else if (e.name.endsWith('.jsx') && p !== path.join(SRC, CLIENT_MODAL)) {
          if (/<ClientModal[\s/>]/.test(fs.readFileSync(p, 'utf8'))) {
            mounts.push(path.relative(SRC, p).replace(/\\/g, '/'));
          }
        }
      }
    })(SRC);
    expect(mounts, 'a second mount site invalidates the literal-id decision — derive ids from a domain key instead')
      .toEqual(['pages/Clients.jsx']);
  });

  // ⚠️ Clients.jsx ALSO renders a second raw <Modal> (the client detail panel),
  // which is why this page needed a check ItemModal's did not. The two are
  // mutually exclusive in the UI, but the durable guarantee is simpler and is
  // what gets asserted: the host page declares no `client-` id of its own, so
  // even if both dialogs were mounted at once nothing could collide.
  it('HOST PAGE: Clients.jsx declares no client-* literal id of its own', () => {
    for (const c of controlsIn(path.join(SRC, 'pages/Clients.jsx'))) {
      expect(c.attrs.id === undefined || !String(c.attrs.id).startsWith('client-'),
        `Clients.jsx:${c.line} declares ${c.attrs.id}, which could collide with ClientModal`).toBe(true);
    }
  });

  it('SCOPE: ClientModal uses id/htmlFor, not a wrapping label, not useId, not a shared Field', () => {
    const src = fs.readFileSync(path.join(SRC, CLIENT_MODAL), 'utf8');
    expect(src, 'A4 must not introduce useId').not.toContain('useId');
    expect(src, 'A4 must not introduce a shared Field component').not.toContain('<Field');
    // DOM shape unchanged: 12 labelled `.field` blocks plus the unlabelled
    // `field full` notice row that holds the paid-status text and no control.
    expect(src.match(/className="field/g) || []).toHaveLength(13);
  });

  // ⚠️ `TaskModal.jsx` WAS on this list and was REMOVED by A5 — see the same
  // note on the A3 copy above.
  it('SCOPE: A4 did not start the other .field files', () => {
    const untouched = ['components/forms/ProjectModal.jsx',
      'components/onboarding/OnboardingWizard.jsx', 'components/settings/BusinessContextEditor.jsx'];
    for (const f of untouched) {
      expect(fs.readFileSync(path.join(SRC, f), 'utf8'),
        `${f}: A4 is ClientModal-only — this file belongs to a later slice`).not.toContain('htmlFor');
    }
  });

  // NEGATIVE CONTROLS — each drives the SAME checker the assertions use.
  it('NEGATIVE: removing a htmlFor from the real source is reported', () => {
    const real = fs.readFileSync(path.join(SRC, CLIENT_MODAL), 'utf8');
    const mutated = real.replace(' htmlFor="client-email"', '');
    expect(mutated, 'mutation did not apply — the control would be vacuous').not.toBe(real);
    expect(unpairedClientFields(mutated).some((p) => p.id === 'client-email'
      && p.reason === 'no label htmlFor points at it')).toBe(true);
  });

  it('NEGATIVE: removing an id from the real source is reported', () => {
    const real = fs.readFileSync(path.join(SRC, CLIENT_MODAL), 'utf8');
    const mutated = real.replace(' id="client-status"', '');
    expect(mutated).not.toBe(real);
    expect(unpairedClientFields(mutated).some((p) => p.id === 'client-status'
      && p.reason === 'no control carries that id')).toBe(true);
  });

  it('NEGATIVE: a htmlFor/id typo mismatch is reported', () => {
    const real = fs.readFileSync(path.join(SRC, CLIENT_MODAL), 'utf8');
    const mutated = real.replace('htmlFor="client-project-type"', 'htmlFor="client-projecttype"');
    expect(mutated).not.toBe(real);
    expect(unpairedClientFields(mutated).some((p) => p.id === 'client-project-type')).toBe(true);
  });

  // The conditional field is the one most likely to be dropped by a later edit,
  // because it is invisible unless the status is `completed_paid`.
  it('NEGATIVE: dropping the conditional paid-date pairing is reported', () => {
    const real = fs.readFileSync(path.join(SRC, CLIENT_MODAL), 'utf8');
    const mutated = real.replace(' id="client-paid-date"', '');
    expect(mutated).not.toBe(real);
    expect(unpairedClientFields(mutated).some((p) => p.id === 'client-paid-date')).toBe(true);
  });

  it('NEGATIVE: a reachability regression on Clients.jsx would be caught', () => {
    const real = fs.readFileSync(path.join(SRC, 'pages/Clients.jsx'), 'utf8');
    const mutated = `${real}\n// BetaUnavailable\n`;
    expect(mutated).toContain('BetaUnavailable');
    expect(real, 'the real file must be clean, or the control proves nothing').not.toContain('BetaUnavailable');
  });
});

// ===================================================================
// ACCESSIBILITY SLICE A5 — TaskModal's nine `.field` blocks.
//
// The three A4 conditions again, and this time the SECOND one is NOT satisfied
// the easy way — which is the whole reason this block is longer than A4's:
//
//   REACHABILITY — PASSES. `/tasks` carries neither `betaHidden` nor
//     `cloudOnly`, `Tasks.jsx` has no BetaUnavailable early return, and
//     'tasks' is absent from BETA_HIDDEN_MODULES. A signed-in owner opens the
//     dialog from the `משימה חדשה` button with NO existing task record, so QA
//     needs no write of any kind.
//   NOT REPEATED — PASSES. Neither mount site is inside a `.map()`.
//   SINGLETON — ⚠️ NOT BY MOUNT COUNT. <TaskModal> is mounted at TWO sites,
//     `pages/Tasks.jsx` and `pages/ProjectDetail.jsx`. A4 could simply assert
//     "exactly one mount"; here that assertion would be false, so the literal
//     ids are justified by a DIFFERENT, stated argument and each half of it is
//     pinned below:
//       (a) the two hosts are bound to DISTINCT routes (`/tasks` and
//           `/projects/:id`), so they are mutually exclusive by routing; and
//       (b) App.jsx wraps the page in <AnimatePresence mode="wait">, so the
//           outgoing page finishes exiting BEFORE the incoming one mounts —
//           the two hosts cannot be in the DOM at the same time even mid-
//           transition; and
//       (c) `Modal.jsx` renders `{open && …}` inside its own AnimatePresence,
//           so a CLOSED TaskModal contributes ZERO DOM nodes. Two `task-*` ids
//           in one document therefore requires two OPEN dialogs, which (a) and
//           (b) make impossible.
//     If any of those three changes, the literal-id decision is void and the
//     ids must be derived from the task's own id instead. That is what the
//     tests in this block exist to catch.
//
// ⚠️ TWO FIELDS ARE CONDITIONAL, not one as in A4. `task-client` renders only
// when `clients.length > 0` and `task-campaign` only when `campaigns.length >
// 0`; the ProjectDetail caller passes NEITHER list, so on that route those two
// fields never render at all. A conditional control still renders at most once,
// so the literal id holds — but the DOM assertion for each only applies in the
// state that shows it, which owner QA has to know. `campaigns` also loads
// fail-soft (`catch → []`), so the absence of `קמפיין` is not a defect.
// ===================================================================
describe('accessibility A5 — TaskModal .field labels are programmatically associated', () => {
  const TASK_MODAL = 'components/forms/TaskModal.jsx';
  const TASK_HOSTS = ['pages/ProjectDetail.jsx', 'pages/Tasks.jsx'];
  const A5_IDS = [
    'task-title', 'task-project', 'task-client', 'task-campaign', 'task-status',
    'task-priority', 'task-deadline', 'task-assignee', 'task-notes',
  ];

  /** THE CHECKER — shared by the assertions and every negative control. */
  function unpairedTaskFields(source = null) {
    const abs = path.join(SRC, TASK_MODAL);
    const controls = controlsIn(abs, source);
    const labels = labelsIn(abs, source);
    const problems = [];
    for (const id of A5_IDS) {
      const control = controls.find((c) => c.attrs.id === id);
      if (!control) { problems.push({ id, reason: 'no control carries that id' }); continue; }
      if (!labels.some((l) => l.attrs.htmlFor === id)) problems.push({ id, reason: 'no label htmlFor points at it' });
    }
    return problems;
  }

  it('POSITIVE CONTROL: the walker finds TaskModal\'s controls and labels at all', () => {
    expect(controlsIn(path.join(SRC, TASK_MODAL)).length,
      'no controls parsed — the guard would pass by finding nothing').toBeGreaterThanOrEqual(9);
    expect(labelsIn(path.join(SRC, TASK_MODAL)).length,
      'no labels parsed — the guard would pass by finding nothing').toBeGreaterThanOrEqual(9);
  });

  it('all nine fields have an id AND a label that references it', () => {
    expect(unpairedTaskFields()).toEqual([]);
  });

  it('every htmlFor in TaskModal resolves to a control id in the same file', () => {
    const ids = new Set(controlsIn(path.join(SRC, TASK_MODAL)).map((c) => c.attrs.id).filter(Boolean));
    for (const l of labelsIn(path.join(SRC, TASK_MODAL))) {
      if (l.attrs.htmlFor) {
        expect(ids.has(l.attrs.htmlFor), `TaskModal.jsx:${l.line} htmlFor="${l.attrs.htmlFor}" points at no control`).toBe(true);
      }
    }
  });

  it('NO label in TaskModal is left without a htmlFor', () => {
    for (const l of labelsIn(path.join(SRC, TASK_MODAL))) {
      expect(l.attrs.htmlFor, `TaskModal.jsx:${l.line} label still names nothing`).toBeTruthy();
    }
  });

  it('no task-* id is declared twice inside TaskModal', () => {
    const ids = controlsIn(path.join(SRC, TASK_MODAL))
      .map((c) => c.attrs.id).filter((id) => id && !/[`${}]/.test(id));
    expect(ids.length, 'no literal ids parsed — the duplicate check would be vacuous').toBeGreaterThanOrEqual(9);
    expect(ids.length - new Set(ids).size, `duplicate id in TaskModal: ${ids.join(', ')}`).toBe(0);
  });

  it('REACHABILITY: /tasks renders in cloud mode — no BetaUnavailable, no betaHidden', () => {
    const page = fs.readFileSync(path.join(SRC, 'pages/Tasks.jsx'), 'utf8');
    expect(page, 'Tasks.jsx must not gate itself behind BetaUnavailable').not.toContain('BetaUnavailable');

    const nav = fs.readFileSync(path.join(SRC, 'components/layout/sidebarNav.js'), 'utf8');
    const tasksEntry = nav.split('\n').find((l) => l.includes("to: '/tasks'")) || '';
    expect(tasksEntry, 'the /tasks nav entry disappeared').toBeTruthy();
    expect(tasksEntry, '/tasks must not become betaHidden — the modal would be unreachable in cloud mode').not.toContain('betaHidden');

    const beta = fs.readFileSync(path.join(SRC, 'lib/betaCapabilities.js'), 'utf8');
    const hidden = beta.split('\n').find((l) => l.includes('BETA_HIDDEN_MODULES = ')) || '';
    expect(hidden, 'BETA_HIDDEN_MODULES line not found — the reachability check would be vacuous').toBeTruthy();
    expect(hidden).not.toContain("'tasks'");
  });

  // ⚠️ The premise A4 got for free. TWO mount sites is the EXPECTED state here;
  // a THIRD one — or either of these moving onto a shared route — voids the
  // literal-id decision.
  it('MOUNT SITES: <TaskModal> is mounted at exactly the two known hosts', () => {
    const mounts = [];
    (function walkDir(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') walkDir(p); }
        else if (e.name.endsWith('.jsx') && p !== path.join(SRC, TASK_MODAL)) {
          if (/<TaskModal[\s/>]/.test(fs.readFileSync(p, 'utf8'))) {
            mounts.push(path.relative(SRC, p).replace(/\\/g, '/'));
          }
        }
      }
    })(SRC);
    expect(mounts.sort(), 'a THIRD mount site invalidates the literal-id decision — derive ids from the task id instead')
      .toEqual(TASK_HOSTS);
  });

  // (a) of the singleton argument: the two hosts are bound to distinct routes.
  it('ROUTE EXCLUSIVITY: the two hosts are bound to different routes', () => {
    const app = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8');
    expect(app, '/tasks must map to <Tasks/>').toContain('path="/tasks" element={<Tasks />}');
    expect(app, '/projects/:id must map to <ProjectDetail/>').toContain('path="/projects/:id" element={<ProjectDetail />}');
    // Distinct paths — so react-router can never render both hosts at once.
    expect('/tasks').not.toBe('/projects/:id');
  });

  // (b): the page transition waits, so the outgoing host is gone before the
  // incoming one mounts. Without `mode="wait"` the two overlap for ~240ms.
  it('TRANSITION: the page AnimatePresence is mode="wait", so hosts never overlap', () => {
    const app = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8');
    expect(app, 'losing mode="wait" lets two page hosts co-exist mid-transition')
      .toContain('<AnimatePresence mode="wait" initial={false}>');
  });

  // (c): a CLOSED modal contributes no DOM at all, which is what makes two
  // mount sites harmless even if (a) and (b) were somehow both defeated.
  it('CLOSED MODAL renders nothing — Modal.jsx gates its subtree on `open`', () => {
    const modal = fs.readFileSync(path.join(SRC, 'components/ui/Modal.jsx'), 'utf8');
    expect(modal, 'if the overlay stops being gated on `open`, a closed TaskModal would put task-* ids in the DOM')
      .toContain('{open && (');
  });

  // Neither host may declare a `task-` id of its own, or it could collide with
  // the dialog mounted on that same page.
  it('HOST PAGES: neither Tasks.jsx nor ProjectDetail.jsx declares a task-* literal id', () => {
    for (const host of TASK_HOSTS) {
      for (const c of controlsIn(path.join(SRC, host))) {
        expect(c.attrs.id === undefined || !String(c.attrs.id).startsWith('task-'),
          `${host}:${c.line} declares ${c.attrs.id}, which could collide with TaskModal`).toBe(true);
      }
    }
  });

  it('SCOPE: TaskModal uses id/htmlFor, not a wrapping label, not useId, not a shared Field', () => {
    const src = fs.readFileSync(path.join(SRC, TASK_MODAL), 'utf8');
    expect(src, 'A5 must not introduce useId').not.toContain('useId');
    expect(src, 'A5 must not introduce a shared Field component').not.toContain('<Field');
    // DOM shape unchanged: still nine `.field` divs, each with a sibling label.
    expect(src.match(/className="field/g) || []).toHaveLength(9);
  });

  // A5 is ADDITIVE ATTRIBUTES ONLY. These four are the behaviours the spec
  // named explicitly, and each is the kind a careless edit drops in passing.
  it('SCOPE: A5 changed no behaviour — autoFocus, the project lock, dir and the campaign coercion all survive', () => {
    const src = fs.readFileSync(path.join(SRC, TASK_MODAL), 'utf8');
    expect(src, 'the title input lost autoFocus').toContain('autoFocus');
    expect(src, 'the project select lost its ProjectDetail lock').toContain('disabled={!!lockProjectId}');
    expect(src, 'the deadline input lost dir="ltr"').toContain('dir="ltr"');
    expect(src, 'an unselected campaign must leave as null, never \'\' (22P02)').toContain('campaignId: form.campaignId || null');
    expect(src, 'the empty-title error styling was dropped').toContain("borderColor: '#ef6f6f'");
  });

  it('SCOPE: A5 did not start the other .field files', () => {
    const untouched = ['components/forms/ProjectModal.jsx',
      'components/onboarding/OnboardingWizard.jsx', 'components/settings/BusinessContextEditor.jsx'];
    for (const f of untouched) {
      expect(fs.readFileSync(path.join(SRC, f), 'utf8'),
        `${f}: A5 is TaskModal-only — this file belongs to a later slice`).not.toContain('htmlFor');
    }
  });

  // NEGATIVE CONTROLS — each drives the SAME checker the assertions use.
  it('NEGATIVE: removing a htmlFor from the real source is reported', () => {
    const real = fs.readFileSync(path.join(SRC, TASK_MODAL), 'utf8');
    const mutated = real.replace(' htmlFor="task-assignee"', '');
    expect(mutated, 'mutation did not apply — the control would be vacuous').not.toBe(real);
    expect(unpairedTaskFields(mutated).some((p) => p.id === 'task-assignee'
      && p.reason === 'no label htmlFor points at it')).toBe(true);
  });

  it('NEGATIVE: removing an id from the real source is reported', () => {
    const real = fs.readFileSync(path.join(SRC, TASK_MODAL), 'utf8');
    const mutated = real.replace(' id="task-status"', '');
    expect(mutated).not.toBe(real);
    expect(unpairedTaskFields(mutated).some((p) => p.id === 'task-status'
      && p.reason === 'no control carries that id')).toBe(true);
  });

  it('NEGATIVE: a htmlFor/id typo mismatch is reported', () => {
    const real = fs.readFileSync(path.join(SRC, TASK_MODAL), 'utf8');
    const mutated = real.replace('htmlFor="task-deadline"', 'htmlFor="task-dedline"');
    expect(mutated).not.toBe(real);
    expect(unpairedTaskFields(mutated).some((p) => p.id === 'task-deadline')).toBe(true);
  });

  // ⚠️ THE CLASS THIS SLICE IS MOST EXPOSED TO, and more so than A3/A4 was,
  // because TaskModal has two mount sites. Prove the duplicate scan bites.
  it('NEGATIVE: a duplicated literal id would be caught by the duplicate scan', () => {
    const real = fs.readFileSync(path.join(SRC, TASK_MODAL), 'utf8');
    const mutated = real.replace(' id="task-notes"', ' id="task-title"');
    expect(mutated).not.toBe(real);
    const ids = controlsIn(path.join(SRC, TASK_MODAL), mutated)
      .map((c) => c.attrs.id).filter((id) => id && !/[`${}]/.test(id));
    expect(ids.length - new Set(ids).size, 'the duplicate was not detected').toBeGreaterThan(0);
  });

  // The two conditional fields are the ones most likely to be dropped by a
  // later edit, because neither renders unless its list is non-empty — and on
  // the ProjectDetail route neither ever does.
  it('NEGATIVE: dropping either conditional pairing is reported', () => {
    const real = fs.readFileSync(path.join(SRC, TASK_MODAL), 'utf8');
    for (const id of ['task-client', 'task-campaign']) {
      const mutated = real.replace(` id="${id}"`, '');
      expect(mutated, `mutation for ${id} did not apply`).not.toBe(real);
      expect(unpairedTaskFields(mutated).some((p) => p.id === id)).toBe(true);
    }
  });

  it('NEGATIVE: a reachability regression on Tasks.jsx would be caught', () => {
    const real = fs.readFileSync(path.join(SRC, 'pages/Tasks.jsx'), 'utf8');
    const mutated = `${real}\n// BetaUnavailable\n`;
    expect(mutated).toContain('BetaUnavailable');
    expect(real, 'the real file must be clean, or the control proves nothing').not.toContain('BetaUnavailable');
  });

  // A third mount site is the specific regression that voids literal ids here.
  it('NEGATIVE: a third mount site would be caught by the mount scan', () => {
    const fake = 'const x = <TaskModal open={false} />;';
    expect(/<TaskModal[\s/>]/.test(fake), 'the mount detector does not match a real mount').toBe(true);
  });
});
