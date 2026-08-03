// ===================================================================
// PARSER-BACKED ACCESSIBILITY BUCKET SCANNER — the measured source of the
// numbers this project has been publishing by hand since slice A1.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────
// Every accessibility slice's headline is a COUNT: "109 → 107 → 98 → 86 → 77".
// Until now every one of those numbers was typed by a human into the tracker
// and into a comment in `accessibleNames.test.js`, and that comment says so
// outright: "THAT NUMBER IS A MEASURED SCAN RESULT, NOT AN INVARIANT THIS FILE
// ENFORCES — nothing here fails when the bucket moves." So five slices have
// published headline figures that NO test could contradict. This module makes
// them reproducible. It does not make them enforced — see REPORT-ONLY below.
//
// ── THE THREE BUCKETS, AND THE ARITHMETIC THAT IS NOT OBVIOUS ───────
// The tracker's table does NOT add up the way it looks:
//
//     visible-label-not-associated   77
//     no-visible-label               21
//     hidden input[type=file]         5
//     TOTAL remaining gaps           98      <-- 77 + 21, NOT 77 + 21 + 5
//
// The 5 hidden file inputs are tracked SEPARATELY and are deliberately EXCLUDED
// from the total, because they are a different fix class: the choice there is
// `aria-label` versus `aria-hidden` + `tabIndex={-1}`, decided per case, and
// A1 explicitly refused to blanket-label them. Summing all three would produce
// 103 and silently contradict five releases of published history. `totals()`
// below encodes that, and a test pins it, because it is exactly the kind of
// thing a later reader "corrects" into a bug.
//
// ── CLASSIFICATION ORDER MATTERS ────────────────────────────────────
// A control is classified by the FIRST rule it satisfies:
//   1. wrapped in a <label>            -> OK (implicit association)
//   2. id + a label[htmlFor] naming it -> OK (explicit association: A2..A5)
//   3. a visible <label> in its `.field` container, but no association
//                                      -> VISIBLE_NOT_ASSOCIATED
//   4. a non-empty aria-label / aria-labelledby
//                                      -> OK (A1's fix class)
//   5. hidden input[type=file]         -> HIDDEN_FILE (separate class)
//   6. otherwise                       -> NO_VISIBLE_LABEL
//
// ⚠️ 3 BEFORE 4 IS DELIBERATE. A control with BOTH a visible unassociated label
// AND an aria-label is still a defect of the "visible label not associated"
// kind: clicking the label does not focus the control, and the screen reader
// announces a name that no sighted user can see is connected to it. Ordering
// 4 before 3 would silently shrink the bucket and make a slice look done.
//
// ── WHY NOT A REGEX ─────────────────────────────────────────────────
// This repository has been bitten three times by regex-over-JSX (a `//` inside
// a URL, template-substitution depth, JSX text with no state), and once by a
// CRLF-dependent comment stripper. It reuses `parserOptionsFor` from
// ./sourceScan.js so this scanner and every existing guard cannot disagree
// about how a `.jsx` file is parsed.
//
// ── REPORT-ONLY ─────────────────────────────────────────────────────
// Nothing here throws or fails on a COUNT. Ordinary UI work legitimately moves
// these numbers, and a scanner that breaks the build every time someone adds a
// form field would be turned off within a week. The tests below assert the
// scanner's BEHAVIOUR (that it classifies a known shape correctly, and that it
// cannot silently match nothing), never the current totals.
// ===================================================================
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import { parserOptionsFor, collectModules } from './sourceScan.js';

export const CONTROL_TAGS = new Set(['input', 'select', 'textarea']);

export const BUCKET = Object.freeze({
  OK: 'ok',
  VISIBLE_NOT_ASSOCIATED: 'visible-label-not-associated',
  NO_VISIBLE_LABEL: 'no-visible-label',
  HIDDEN_FILE: 'hidden-file-input',
});

/** Raw source text of an attribute value: a literal's value, or the exact
 *  source of an expression container (so a template literal stays inspectable). */
export function attrText(attr, src) {
  const v = attr.value;
  if (!v) return '';                                   // bare attribute
  if (v.type === 'StringLiteral') return v.value;
  if (v.type === 'JSXExpressionContainer') return src.slice(v.expression.start, v.expression.end);
  return '';
}

function flattenAttrs(node, src) {
  const attrs = {};
  for (const a of node.attributes) {
    if (a.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier') attrs[a.name.name] = attrText(a, src);
  }
  return attrs;
}

/** Names of BARE attributes (`hidden`, `autoFocus`, `multiple`), which carry
 *  meaning by their presence alone. `attrText` returns '' for these — correct
 *  for a value, useless for a flag — so presence is tracked separately rather
 *  than by changing attrText's contract, which existing guards depend on.
 *  ⚠️ Without this, `<input type="file" hidden />` is indistinguishable from a
 *  visible one, and MockupStudio's two file inputs were mis-bucketed. */
function bareAttrNames(node) {
  const flags = new Set();
  for (const a of node.attributes) {
    if (a.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier' && !a.value) flags.add(a.name.name);
  }
  return flags;
}

/** Generic AST walk. Shared by every collector here so they cannot drift apart
 *  in how they traverse — the failure mode `missingAriaLabels` once had when it
 *  re-implemented its own walker for the negative-control path. */
function walkAst(ast, visit) {
  const seen = new Set();
  (function walk(node, ancestors) {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    visit(node, ancestors);
    const next = node.type === 'JSXElement' ? [...ancestors, node] : ancestors;
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => walk(c, next));
      else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, next);
    }
  })(ast, []);
}

function astOf(file, source) {
  const src = source === null || source === undefined ? fs.readFileSync(file, 'utf8') : source;
  return { src, ast: parse(src, parserOptionsFor(file)) };
}

/** Every <label> in a file, with its attributes flattened. A `htmlFor` only
 *  names a control if some control really carries that exact `id`, so both
 *  sides have to be read. */
export function labelsIn(file, source = null) {
  const { src, ast } = astOf(file, source);
  const out = [];
  walkAst(ast, (node) => {
    if (node.type === 'JSXOpeningElement' && node.name?.type === 'JSXIdentifier' && node.name.name === 'label') {
      out.push({ attrs: flattenAttrs(node, src), line: src.slice(0, node.start).split('\n').length });
    }
  });
  return out;
}

/** Every input/select/textarea in a file, with its attributes flattened, plus
 *  the structural facts the classifier needs (ancestor label, ancestor `.field`
 *  container, and whether that container holds a <label>). */
export function controlsIn(file, source = null) {
  const { src, ast } = astOf(file, source);
  const out = [];
  walkAst(ast, (node, ancestors) => {
    if (node.type !== 'JSXOpeningElement') return;
    if (node.name?.type !== 'JSXIdentifier' || !CONTROL_TAGS.has(node.name.name)) return;
    out.push({
      tag: node.name.name,
      attrs: flattenAttrs(node, src),
      flags: bareAttrNames(node),
      line: src.slice(0, node.start).split('\n').length,
      insideLabel: ancestors.some(isLabelElement),
      fieldLabelText: nearestFieldLabelText(ancestors, src),
    });
  });
  return out;
}

const isLabelElement = (el) =>
  el.openingElement?.name?.type === 'JSXIdentifier' && el.openingElement.name.name === 'label';

/** Direct <label> children of an element (not nested deeper, so a sibling
 *  dialog's label cannot be attributed to this field). */
function directLabelText(el, src) {
  for (const child of el.children || []) {
    if (child.type !== 'JSXElement' || !isLabelElement(child)) continue;
    const attrs = flattenAttrs(child.openingElement, src);
    const text = (child.children || [])
      .map((c) => (c.type === 'JSXText' ? c.value : ''))
      .join('').trim();
    return { text, htmlFor: attrs.htmlFor };
  }
  return null;
}

/** Walk OUTWARD from the control to the nearest container carrying a `field`
 *  class, and report the visible label sitting in it. This is the exact shape
 *  the tracker names: <div class="field"><label>טלפון</label><input/></div>. */
function nearestFieldLabelText(ancestors, src) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const el = ancestors[i];
    const open = el.openingElement;
    if (!open || open.name?.type !== 'JSXIdentifier') continue;
    const cls = flattenAttrs(open, src).className || '';
    if (!/(^|[\s'"`{])field(\s|$|['"`}])/.test(cls) && !/\bfield\b/.test(cls)) continue;
    const lab = directLabelText(el, src);
    if (lab) return lab;
  }
  return null;
}

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

/** Hidden file inputs are a SEPARATE fix class, never folded into the totals.
 *  `display:none` but not `type="hidden"`, so still reachable to a screen
 *  reader and to the tab order. */
function isHiddenFileInput(c) {
  if (c.tag !== 'input') return false;
  if (!/file/.test(c.attrs.type || '')) return false;
  const style = c.attrs.style || '';
  const cls = c.attrs.className || '';
  return /display\s*:\s*['"]?none/.test(style)
    || (c.flags && c.flags.has('hidden'))            // <input type="file" hidden />
    || /\bhidden\b/.test(cls) || /\bsr-only\b/.test(cls);
}

/** THE CLASSIFIER. Pure: takes a control and the file's label set, returns a
 *  bucket. Both the report and every test drive THIS function, so a mutation
 *  cannot pass in one and fail in the other. */
export function classify(control, labels) {
  if (control.tag === 'input' && (control.attrs.type || '') === 'hidden') return BUCKET.OK; // not user-reachable

  // ⚠️ HIDDENNESS IS EVALUATED FIRST, BEFORE ANY LABEL RULE, and that ordering
  // is the point rather than an optimisation. A `display:none` file input
  // behind a styled button is a DIFFERENT FIX CLASS — `aria-label` versus
  // `aria-hidden` + `tabIndex={-1}`, decided per case, which A1 explicitly
  // refused to blanket-apply. Whether a visible label happens to sit beside it
  // does not change which fix it needs, so a label rule must not capture it
  // first. ProjectDetail's form file input sits inside a labelled `.field` and
  // was being counted as an unassociated visible label until this moved up.
  if (isHiddenFileInput(control)) return BUCKET.HIDDEN_FILE;

  if (control.insideLabel) return BUCKET.OK;                                    // 1. implicit association

  const id = control.attrs.id;
  if (nonEmpty(id) && labels.some((l) => l.attrs.htmlFor === id)) return BUCKET.OK; // 2. explicit association

  // 3. BEFORE 4 — see the header. A visible label that names nothing is a
  //    defect even when an aria-label happens to be present.
  if (control.fieldLabelText && nonEmpty(control.fieldLabelText.text)) return BUCKET.VISIBLE_NOT_ASSOCIATED;

  if (nonEmpty(control.attrs['aria-label']) || nonEmpty(control.attrs['aria-labelledby'])) return BUCKET.OK; // 4.
  return BUCKET.NO_VISIBLE_LABEL;                                               // 5.
}

/** Scan one file. Returns every control with its bucket. */
export function scanFileControls(file) {
  const labels = labelsIn(file);
  return controlsIn(file).map((c) => ({ ...c, bucket: classify(c, labels) }));
}

/** Scan a whole tree. `__tests__` is excluded: fixtures and mutated sources
 *  there are not product UI and would inflate every bucket. */
export function scanTree(root) {
  const files = collectModules(root)
    .filter((f) => f.endsWith('.jsx'))
    .filter((f) => !f.split(path.sep).includes('__tests__'));
  const perFile = [];
  for (const file of files) {
    const controls = scanFileControls(file);
    if (controls.length === 0) continue;
    perFile.push({ file: path.relative(root, file).replace(/\\/g, '/'), controls });
  }
  return perFile;
}

/** ⚠️ TOTAL EXCLUDES the hidden file inputs — see the header. Changing this to
 *  a three-way sum would contradict every release recorded in the tracker. */
export function totals(perFile) {
  const t = { controls: 0, ok: 0, visibleNotAssociated: 0, noVisibleLabel: 0, hiddenFileInputs: 0 };
  for (const f of perFile) {
    for (const c of f.controls) {
      t.controls++;
      if (c.bucket === BUCKET.OK) t.ok++;
      else if (c.bucket === BUCKET.VISIBLE_NOT_ASSOCIATED) t.visibleNotAssociated++;
      else if (c.bucket === BUCKET.NO_VISIBLE_LABEL) t.noVisibleLabel++;
      else if (c.bucket === BUCKET.HIDDEN_FILE) t.hiddenFileInputs++;
    }
  }
  t.totalRemainingGaps = t.visibleNotAssociated + t.noVisibleLabel;
  return t;
}

// ===================================================================
// CLOUD REACHABILITY — the gate A3 shipped without and A4 added.
//
// A fix nobody can open cannot be owner-QA'd against the exact Production
// artifact. A3 fixed `ItemModal`, which `Inventory.jsx` gates behind
// <BetaUnavailable/> in cloud mode, and that only surfaced when the owner could
// not find the module in the sidebar. This resolves the same question
// mechanically, so the next slice's candidate list is measured rather than
// remembered.
//
// ⚠️ STATED LIMIT: a component reachable through ANY reachable page is called
// reachable. That is the useful direction (can a signed-in owner open it at
// all), and it is NOT a claim that every mount site is reachable — TaskModal is
// reachable via /tasks while its ProjectDetail mount is not.
// ===================================================================
export const REACH = Object.freeze({
  REACHABLE: 'reachable',
  BETA_UNAVAILABLE: 'BetaUnavailable early return',
  BETA_HIDDEN: 'betaHidden',
  UNKNOWN: 'unknown (not a routed page, no reachable mount found)',
});

/** Page component -> route path, read from App.jsx's <Route> elements. */
export function routeMap(srcRoot) {
  const app = fs.readFileSync(path.join(srcRoot, 'App.jsx'), 'utf8');
  const map = new Map();
  for (const m of app.matchAll(/path="([^"]+)"\s+element=\{<(\w+)\s*\/?>/g)) map.set(m[2], m[1]);
  return map;
}

function betaHiddenRoutes(srcRoot) {
  const nav = fs.readFileSync(path.join(srcRoot, 'components/layout/sidebarNav.js'), 'utf8');
  const growth = fs.readFileSync(path.join(srcRoot, 'pages/growth/growthNav.js'), 'utf8');
  const out = new Set();
  for (const line of `${nav}\n${growth}`.split('\n')) {
    if (!line.includes('betaHidden')) continue;
    const m = line.match(/to:\s*'([^']+)'/);
    if (m) out.add(m[1]);
  }
  return out;
}

/** A DETAIL ROUTE INHERITS ITS PARENT'S GATE. `/projects/:id` carries no flag
 *  of its own and `ProjectDetail.jsx` has no early return, so judged in
 *  isolation it looks reachable — yet `/projects` is `betaHidden` AND
 *  `Projects.jsx` returns <BetaUnavailable/>, so nothing in the product links
 *  to it and its list screen refuses to render. Reading the detail route as
 *  reachable would have re-made exactly the A3 mistake: recommending a slice
 *  nobody can open. You reach `/projects/:id` THROUGH `/projects`. */
function isHiddenRoute(route, hidden) {
  if (!route) return false;
  if (hidden.has(route)) return true;
  const segs = route.split('/').filter(Boolean);
  for (let i = segs.length - 1; i > 0; i--) {
    if (hidden.has('/' + segs.slice(0, i).join('/'))) return true;
  }
  return false;
}

/** Classify every page file, then propagate to the components each page mounts. */
export function reachability(srcRoot) {
  const routes = routeMap(srcRoot);
  const hidden = betaHiddenRoutes(srcRoot);
  const files = collectModules(srcRoot)
    .filter((f) => f.endsWith('.jsx'))
    .filter((f) => !f.split(path.sep).includes('__tests__'));

  const rel = (f) => path.relative(srcRoot, f).replace(/\\/g, '/');
  const componentName = (f) => path.basename(f, '.jsx');
  const result = new Map();

  // Pass 1 — routed pages judge themselves.
  const pageStatus = new Map();
  for (const f of files) {
    const name = componentName(f);
    if (!routes.has(name)) continue;
    const src = fs.readFileSync(f, 'utf8');
    // A comment mentioning BetaUnavailable is not a gate; require a real return.
    const gated = /return\s*<BetaUnavailable/.test(src);
    const route = routes.get(name);
    let status = REACH.REACHABLE;
    if (gated) status = REACH.BETA_UNAVAILABLE;
    else if (isHiddenRoute(route, hidden)) status = REACH.BETA_HIDDEN;
    pageStatus.set(name, status);
    result.set(rel(f), status);
  }

  // Pass 2 — a component inherits the BEST status among the pages that mount it.
  for (const f of files) {
    const key = rel(f);
    if (result.has(key)) continue;
    const name = componentName(f);
    let best = null;
    for (const host of files) {
      if (host === f) continue;
      const hostName = componentName(host);
      if (!pageStatus.has(hostName)) continue;
      if (!new RegExp(`<${name}[\\s/>]`).test(fs.readFileSync(host, 'utf8'))) continue;
      const s = pageStatus.get(hostName);
      if (s === REACH.REACHABLE) { best = s; break; }
      if (best === null) best = s;
    }
    result.set(key, best === null ? REACH.UNKNOWN : best);
  }
  return result;
}
