#!/usr/bin/env node
// ===================================================================
// `npm run a11y:count` — report the accessibility bucket counts.
//
// READ-ONLY. Reads .jsx source, writes nothing, touches no network, no
// database, no Cloudflare, no Supabase. It exists so the numbers published in
// docs/PROJECT_TRACKER.md stop being unfalsifiable prose.
//
// REPORT-ONLY BY DESIGN: exit code is 0 whatever the counts are. Ordinary UI
// work moves these numbers legitimately, and a scanner that breaks the build
// on every new form field gets switched off. `--expect` is available for a
// release-day spot check and is the ONLY way to make it exit non-zero.
//
// Usage:
//   npm run a11y:count
//   npm run a11y:count -- --json
//   npm run a11y:count -- --files            (per-control detail, not just per file)
//   npm run a11y:count -- --expect 77,21,5   (visibleNotAssociated,noVisibleLabel,hiddenFileInputs)
// ===================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTree, totals, reachability, BUCKET, REACH } from '../src/lib/__tests__/support/a11yScan.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f) => { const i = argv.indexOf(f); return i === -1 ? null : argv[i + 1]; };

const perFile = scanTree(SRC);
const t = totals(perFile);
const reach = reachability(SRC);

// POSITIVE CONTROL. A scanner that silently matches nothing reports all-zero
// and reads exactly like a clean codebase. Refuse to print in that case.
if (t.controls === 0) {
  console.error('a11y:count: FATAL — the walker found 0 controls in src/. That is a broken scan, not a clean repo.');
  process.exit(2);
}

const gapsOf = (f) => f.controls.filter((c) => c.bucket !== BUCKET.OK);
const countIn = (f, b) => f.controls.filter((c) => c.bucket === b).length;
const withGaps = perFile.filter((f) => gapsOf(f).length > 0)
  .sort((a, b) => gapsOf(b).length - gapsOf(a).length || a.file.localeCompare(b.file));

if (has('--json')) {
  console.log(JSON.stringify({
    totals: t,
    files: withGaps.map((f) => ({
      file: f.file,
      reachability: reach.get(f.file) || REACH.UNKNOWN,
      visibleNotAssociated: countIn(f, BUCKET.VISIBLE_NOT_ASSOCIATED),
      noVisibleLabel: countIn(f, BUCKET.NO_VISIBLE_LABEL),
      hiddenFileInputs: countIn(f, BUCKET.HIDDEN_FILE),
      controls: has('--files') ? f.controls : undefined,
    })),
  }, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  const num = (s, n) => String(s).padStart(n);

  console.log('\nACCESSIBILITY BUCKETS — measured from src/**/*.jsx by a parser-backed scan\n');
  console.log(`  form controls found (input/select/textarea)   ${num(t.controls, 5)}`);
  console.log(`  already named / associated                    ${num(t.ok, 5)}`);
  console.log('  ' + '-'.repeat(52));
  console.log(`  visible-label-not-associated                  ${num(t.visibleNotAssociated, 5)}`);
  console.log(`  no-visible-label                              ${num(t.noVisibleLabel, 5)}`);
  console.log(`  TOTAL remaining gaps                          ${num(t.totalRemainingGaps, 5)}`);
  console.log('  ' + '-'.repeat(52));
  console.log(`  hidden input[type=file]  (separate fix class, ${num(t.hiddenFileInputs, 5)}`);
  console.log('   NOT counted in the total above)');

  console.log('\nPER FILE — gaps only, most first. Reachability is the A4 gate:');
  console.log(`  ${pad('file', 46)} ${num('vis', 4)} ${num('none', 5)} ${num('file', 5)}  reachability`);
  for (const f of withGaps) {
    console.log(`  ${pad(f.file, 46)} ${num(countIn(f, BUCKET.VISIBLE_NOT_ASSOCIATED), 4)} `
      + `${num(countIn(f, BUCKET.NO_VISIBLE_LABEL), 5)} ${num(countIn(f, BUCKET.HIDDEN_FILE), 5)}  `
      + `${reach.get(f.file) || REACH.UNKNOWN}`);
    if (has('--files')) {
      for (const c of gapsOf(f)) {
        console.log(`      L${pad(c.line, 5)} <${pad(c.tag, 9)} ${pad(c.bucket, 30)} `
          + `${c.fieldLabelText ? `label="${c.fieldLabelText.text}"` : ''}`);
      }
    }
  }

  const reachable = withGaps.filter((f) => (reach.get(f.file) || REACH.UNKNOWN) === REACH.REACHABLE);
  console.log('\nNEXT-SLICE CANDIDATES — reachable in cloud mode, so owner-QA-able:');
  for (const f of reachable.slice(0, 10)) console.log(`  ${pad(f.file, 46)} ${gapsOf(f).length}`);
  console.log('\n⚠️  Reachable means the module renders in cloud mode. It does NOT settle the');
  console.log('   singleton question — ask whether two instances can be in the DOM AT ONCE,');
  console.log('   not how many mount sites exist. See slice A5.\n');
}

// The only path that can exit non-zero on a count, and only when asked.
const expect = valueOf('--expect');
if (expect) {
  const [v, n, h] = expect.split(',').map((x) => Number(x.trim()));
  const bad = [];
  if (Number.isFinite(v) && v !== t.visibleNotAssociated) bad.push(`visible-label-not-associated expected ${v}, measured ${t.visibleNotAssociated}`);
  if (Number.isFinite(n) && n !== t.noVisibleLabel) bad.push(`no-visible-label expected ${n}, measured ${t.noVisibleLabel}`);
  if (Number.isFinite(h) && h !== t.hiddenFileInputs) bad.push(`hidden file inputs expected ${h}, measured ${t.hiddenFileInputs}`);
  if (bad.length) { console.error('\na11y:count --expect MISMATCH:\n  ' + bad.join('\n  ') + '\n'); process.exit(1); }
  console.error('a11y:count --expect: all supplied counts match.\n');
}
