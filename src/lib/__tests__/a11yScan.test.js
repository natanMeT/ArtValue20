// ===================================================================
// Tests for the accessibility bucket scanner.
//
// ⚠️ WHAT THIS FILE DELIBERATELY DOES NOT ASSERT: the current totals. Ordinary
// UI work moves them legitimately, and a guard that fails the build every time
// someone adds a form field gets switched off within a week — at which point it
// protects nothing. What IS asserted is the scanner's BEHAVIOUR: that it
// classifies each known shape correctly, that its rule ORDER is the documented
// one, that its arithmetic excludes the hidden file inputs, and that it cannot
// silently match nothing.
//
// Every classification test drives `classify()` — the same function the report
// calls — so a mutation cannot pass here while failing in the CLI.
// ===================================================================
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  controlsIn, labelsIn, classify, scanTree, totals, reachability,
  BUCKET, REACH,
} from './support/a11yScan.js';
import { collectModules, namesEngine, hasLocalAddress, executableSourceOf } from './support/sourceScan.js';

const SRC = path.resolve(__dirname, '..', '..');
const FAKE = path.join(SRC, 'fixture.jsx');   // only selects parser options

/** Parse an inline JSX snippet and classify its single control. */
function bucketOf(jsx) {
  const src = `export default function F() { return (<div>${jsx}</div>); }`;
  const controls = controlsIn(FAKE, src);
  expect(controls.length, 'the fixture must contain exactly one control').toBe(1);
  return classify(controls[0], labelsIn(FAKE, src));
}

describe('a11yScan — the walker cannot silently match nothing', () => {
  // POSITIVE CONTROL FIRST. Every count below is meaningless if the walker
  // stops finding controls: an all-zero report reads exactly like a clean
  // codebase. This is the failure mode the SECURITY DEFINER corpus guard and
  // the A1 guard both assert against, for the same reason.
  it('finds a substantial number of real controls in src/', () => {
    const t = totals(scanTree(SRC));
    expect(t.controls, 'walker found no controls — the scan is broken, not the repo clean').toBeGreaterThan(100);
  });

  it('finds real labels, and the fixture harness itself parses', () => {
    expect(bucketOf('<input />')).toBe(BUCKET.NO_VISIBLE_LABEL);
  });

  it('NEGATIVE: a snippet with no control is rejected by the harness, not silently passed', () => {
    expect(() => bucketOf('<span>no control here</span>')).toThrow();
  });
});

// ===================================================================
// THE RETIREMENT GUARD IS NOT WEAKENED BY THIS TOOL, AND THAT IS ASSERTED HERE
// RATHER THAN THERE.
//
// `localEngineRetirement.test.js` states that `scripts/` DOES NOT EXIST — a
// specific claim that the retired `scripts/local-review-prep.mjs`, which called
// a local model, is gone. An earlier draft of this work put the CLI in
// `scripts/` and edited that assertion to make room. That was the wrong trade:
// a read-only accessibility scanner has no business relaxing a retirement
// guard, however carefully. The CLI moved to `tools/` instead and that file is
// now UNTOUCHED by this PR.
//
// `tools/` is not an unguarded hiding place, and this is the fact that makes
// the move safe rather than evasive: the retirement corpus is
// `collectModules('.')` from the repository ROOT with NO ALLOWLIST — widening
// an allowlist three times is exactly why that suite abolished the allowlist —
// so the CLI is already scanned for engine names and loopback hosts by every
// repo-wide retirement invariant. These tests pin that, so the guarantee cannot
// quietly lapse if the corpus is ever narrowed.
// ===================================================================
describe('a11yScan — the CLI stays inside the local-engine retirement corpus', () => {
  const CLI = 'tools/a11y-count.mjs';

  it('the retired local-model script is still gone and scripts/ still does not exist', () => {
    expect(fs.existsSync('scripts/local-review-prep.mjs')).toBe(false);
    expect(fs.existsSync('scripts'), 'this PR must not create scripts/ — the guard asserts its absence').toBe(false);
  });

  it('POSITIVE CONTROL: the repo-wide retirement corpus actually contains this CLI', () => {
    const corpus = collectModules('.').map((f) => f.replace(/\\/g, '/'));
    expect(corpus, 'if tools/ were outside the corpus, the CLI would be unscanned').toContain(CLI);
  });

  it('the CLI names no retired engine and reaches no loopback host', () => {
    const code = executableSourceOf(CLI);
    expect(namesEngine(code)).toBe(false);
    expect(hasLocalAddress(code)).toBe(false);
  });

  // A "nothing found" assertion is weak on its own — a detector that cannot
  // detect looks identical to a clean file. Plant both bypasses.
  it('NEGATIVE: a local-engine CLI placed in tools/ WOULD be caught', () => {
    expect(namesEngine("import { ollama } from 'x';"), 'engine name not detected').toBe(true);
    expect(hasLocalAddress("fetch('http://127.0.0.1:11434/api')"), 'loopback host not detected').toBe(true);
  });
});

describe('a11yScan — classification of each known shape', () => {
  it('a control wrapped in a <label> is associated implicitly', () => {
    expect(bucketOf('<label>שם<input /></label>')).toBe(BUCKET.OK);
  });

  it('id + a label[htmlFor] naming it is associated explicitly — the A2..A5 fix', () => {
    expect(bucketOf('<div className="field"><label htmlFor="x">שם</label><input id="x" /></div>')).toBe(BUCKET.OK);
  });

  it('a visible label in a .field with NO htmlFor is the unassociated bucket', () => {
    expect(bucketOf('<div className="field"><label>טלפון</label><input /></div>')).toBe(BUCKET.VISIBLE_NOT_ASSOCIATED);
  });

  it('a htmlFor that names a DIFFERENT id does not associate anything', () => {
    expect(bucketOf('<div className="field"><label htmlFor="other">טלפון</label><input id="x" /></div>'))
      .toBe(BUCKET.VISIBLE_NOT_ASSOCIATED);
  });

  it('an aria-label with no visible label is named — the A1 fix class', () => {
    expect(bucketOf('<input aria-label="חיפוש לקוחות" />')).toBe(BUCKET.OK);
  });

  it('an EMPTY aria-label names nothing', () => {
    expect(bucketOf('<input aria-label="  " />')).toBe(BUCKET.NO_VISIBLE_LABEL);
  });

  it('a bare control with nothing at all is nameless to everyone', () => {
    expect(bucketOf('<select><option/></select>')).toBe(BUCKET.NO_VISIBLE_LABEL);
  });

  it('input[type=hidden] is not user-reachable and is not a gap', () => {
    expect(bucketOf('<input type="hidden" value="x" />')).toBe(BUCKET.OK);
  });

  it('textarea is scanned, not only input/select', () => {
    expect(bucketOf('<div className="field"><label>הערות</label><textarea /></div>'))
      .toBe(BUCKET.VISIBLE_NOT_ASSOCIATED);
  });
});

describe('a11yScan — the RULE ORDER, which is the part that silently shrinks buckets when wrong', () => {
  // If aria-label were checked BEFORE the visible-label rule, this control
  // would read as OK — and the bucket would shrink without anything being
  // fixed. Clicking the label still does not focus the control, and a sighted
  // user cannot tell the announced name belongs to it.
  it('a visible unassociated label BEATS an aria-label — still a defect', () => {
    expect(bucketOf('<div className="field"><label>טלפון</label><input aria-label="טלפון" /></div>'))
      .toBe(BUCKET.VISIBLE_NOT_ASSOCIATED);
  });

  // ProjectDetail's form file input is exactly this shape and was being
  // counted as an unassociated visible label until hiddenness moved first.
  it('a HIDDEN file input inside a labelled .field is the file class, not the label class', () => {
    expect(bucketOf('<div className="field"><label>קובץ מהמחשב</label>'
      + '<input type="file" style={{ display: \'none\' }} /></div>')).toBe(BUCKET.HIDDEN_FILE);
  });

  it('a BARE `hidden` attribute counts as hidden — presence, not value', () => {
    expect(bucketOf('<input type="file" accept="image/*" hidden />')).toBe(BUCKET.HIDDEN_FILE);
  });

  it('style display:none counts as hidden', () => {
    expect(bucketOf('<input type="file" style={{ display: \'none\' }} />')).toBe(BUCKET.HIDDEN_FILE);
  });

  it('a VISIBLE file input is NOT the hidden class — it is an ordinary gap', () => {
    expect(bucketOf('<input type="file" />')).toBe(BUCKET.NO_VISIBLE_LABEL);
  });

  it('hiddenness applies to file inputs only — a hidden text input is not that fix class', () => {
    expect(bucketOf('<input type="text" hidden />')).toBe(BUCKET.NO_VISIBLE_LABEL);
  });
});

describe('a11yScan — the arithmetic the tracker table does NOT make obvious', () => {
  // 77 + 21 + 5 = 103, but the published TOTAL was 98. The hidden file inputs
  // are a separate fix class and are deliberately EXCLUDED. Summing all three
  // would contradict five releases of recorded history, and is exactly the kind
  // of thing a later reader "corrects" into a bug.
  it('TOTAL excludes the hidden file inputs', () => {
    const t = totals([{ file: 'f.jsx', controls: [
      { bucket: BUCKET.VISIBLE_NOT_ASSOCIATED }, { bucket: BUCKET.VISIBLE_NOT_ASSOCIATED },
      { bucket: BUCKET.NO_VISIBLE_LABEL },
      { bucket: BUCKET.HIDDEN_FILE }, { bucket: BUCKET.HIDDEN_FILE },
      { bucket: BUCKET.OK },
    ] }]);
    expect(t.visibleNotAssociated).toBe(2);
    expect(t.noVisibleLabel).toBe(1);
    expect(t.hiddenFileInputs).toBe(2);
    expect(t.totalRemainingGaps, 'the total must be vis + none, NOT vis + none + hidden').toBe(3);
    expect(t.controls).toBe(6);
    expect(t.ok).toBe(1);
  });
});

describe('a11yScan — cloud reachability, the gate A3 shipped without', () => {
  const reach = reachability(SRC);
  const of = (f) => reach.get(f);

  it('POSITIVE CONTROL: the route map resolved real pages', () => {
    expect(reach.size, 'no files classified — the reachability check would be vacuous').toBeGreaterThan(20);
  });

  it('/tasks is reachable — the premise A5 shipped on', () => {
    expect(of('pages/Tasks.jsx')).toBe(REACH.REACHABLE);
  });

  it('Inventory is gated by a BetaUnavailable early return — the A3 mistake', () => {
    expect(of('pages/Inventory.jsx')).toBe(REACH.BETA_UNAVAILABLE);
  });

  it('ItemModal inherits its only host\'s gate — LIVE but LATENT', () => {
    expect(of('components/forms/ItemModal.jsx')).toBe(REACH.BETA_UNAVAILABLE);
  });

  // The case that made the parent-route rule necessary: judged alone,
  // ProjectDetail has no early return and /projects/:id carries no flag, so it
  // reads as reachable — and the scanner would have recommended a slice nobody
  // can open, re-making the A3 mistake it exists to prevent.
  it('ProjectDetail inherits /projects\' betaHidden through the parent route', () => {
    expect(of('pages/ProjectDetail.jsx')).toBe(REACH.BETA_HIDDEN);
  });

  it('ClientModal is reachable — the premise A4 shipped on', () => {
    expect(of('components/forms/ClientModal.jsx')).toBe(REACH.REACHABLE);
  });

  // TaskModal has TWO hosts, one reachable and one not. "Reachable" is the
  // useful direction — can a signed-in owner open it AT ALL — and is NOT a
  // claim that every mount site is reachable.
  it('TaskModal is reachable via /tasks even though its ProjectDetail host is not', () => {
    expect(of('components/forms/TaskModal.jsx')).toBe(REACH.REACHABLE);
  });
});

describe('a11yScan — end-to-end on the real tree', () => {
  const perFile = scanTree(SRC);
  const find = (f) => perFile.find((x) => x.file === f);
  const count = (f, b) => (find(f)?.controls || []).filter((c) => c.bucket === b).length;

  it('the five hidden file inputs are found, and they are the five that exist', () => {
    expect(totals(perFile).hiddenFileInputs).toBe(5);
    expect(count('components/studio/MockupStudio.jsx', BUCKET.HIDDEN_FILE)).toBe(2);
    expect(count('pages/ProjectDetail.jsx', BUCKET.HIDDEN_FILE)).toBe(2);
    expect(count('pages/Settings.jsx', BUCKET.HIDDEN_FILE)).toBe(1);
  });

  it('the slices already shipped read as CLOSED — no gaps left in their files', () => {
    for (const f of ['components/forms/TaskModal.jsx', 'components/forms/ClientModal.jsx',
      'components/forms/ItemModal.jsx', 'pages/Login.jsx']) {
      expect(count(f, BUCKET.VISIBLE_NOT_ASSOCIATED), `${f} still has unassociated labels`).toBe(0);
    }
  });

  // A5's own nine, measured rather than remembered.
  it('TaskModal contributes zero gaps of any kind after A5', () => {
    const controls = find('components/forms/TaskModal.jsx').controls;
    expect(controls.length).toBe(9);
    expect(controls.every((c) => c.bucket === BUCKET.OK)).toBe(true);
  });

  // NEGATIVE CONTROL on the real source: strip one shipped htmlFor and the
  // scanner must report that control. Without this, "0 gaps" above could be the
  // scanner failing to look.
  it('NEGATIVE: removing a shipped htmlFor makes TaskModal report a gap again', () => {
    const abs = path.join(SRC, 'components/forms/TaskModal.jsx');
    const real = require('node:fs').readFileSync(abs, 'utf8');
    const mutated = real.replace(' htmlFor="task-status"', '');
    expect(mutated, 'mutation did not apply — the control would be vacuous').not.toBe(real);
    const buckets = controlsIn(abs, mutated).map((c) => classify(c, labelsIn(abs, mutated)));
    expect(buckets.filter((b) => b === BUCKET.VISIBLE_NOT_ASSOCIATED).length).toBe(1);
  });
});
