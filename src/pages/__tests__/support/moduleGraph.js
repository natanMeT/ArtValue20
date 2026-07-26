// ===================================================================
// moduleGraph — derives the bounded set of PROJECT-LOCAL modules reachable
// from a set of route/root components, by walking their transitive imports.
//
// WHY THIS EXISTS
// Round 3 of the Studio containment work verified its "no raw engine error
// reaches the user" class against a HAND-WRITTEN list of surfaces. Three
// siblings escaped, one of them (PosterEditor) because it was simply not on
// the list — and the class test, encoding that same list, passed anyway.
// A test whose scope is a literal array cannot detect a missing member.
//
// So the scope is now DERIVED from the code: give it the route roots and it
// returns every project-local module those roots actually pull in. Adding a
// new creative child puts it under verification automatically; nobody has to
// remember to extend an array.
//
// CONTRACT
//   - Only RELATIVE specifiers are followed. Bare specifiers ('react',
//     'framer-motion', '@supabase/supabase-js') are third-party and are
//     excluded, so the graph stays bounded by the project.
//   - Static `from '…'`, side-effect `import '…'` and dynamic `import('…')`
//     are all followed.
//   - DETERMINISTIC: the returned list is sorted, repo-relative and
//     duplicate-free, independent of traversal order.
//   - A relative specifier that resolves to nothing (an asset, a .css file, a
//     path that does not exist) is skipped rather than throwing — it cannot
//     render an error message.
// ===================================================================
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';

// static `from '…'` | dynamic `import('…')` | side-effect `import '…'`
const SPEC_RE = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^[ \t]*import\s*['"]([^'"]+)['"]/gm;

const CODE_EXT = ['.js', '.jsx', '.mjs', '.ts', '.tsx'];

const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

// Resolve a relative specifier to a real project file, or null.
function resolveLocal(fromFile, spec) {
  if (!spec.startsWith('.')) return null;                 // third-party — out of scope
  const base = resolve(dirname(fromFile), spec);
  if (isFile(base)) return base;                          // explicit extension
  for (const ext of CODE_EXT) if (isFile(base + ext)) return base + ext;
  for (const ext of CODE_EXT) {                           // directory index
    const idx = resolve(base, `index${ext}`);
    if (isFile(idx)) return idx;
  }
  return null;
}

// Every relative specifier mentioned by `src`.
export function importSpecifiers(src) {
  const out = [];
  for (const m of src.matchAll(SPEC_RE)) out.push(m[1] || m[2] || m[3]);
  return out.filter(Boolean);
}

// The transitive project-local closure of `roots` (absolute paths in, absolute
// paths out), INCLUDING the roots themselves. Sorted; cycle-safe.
export function moduleGraph(roots) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const file = queue.shift();
    if (!file || seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    let src = '';
    try { src = readFileSync(file, 'utf8'); } catch { continue; }
    for (const spec of importSpecifiers(src)) {
      const next = resolveLocal(file, spec);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen].sort();
}

// Repo-relative, forward-slashed — stable across platforms and readable in
// assertion failure output.
export const rel = (repoRoot, file) => relative(repoRoot, file).split(sep).join('/');

// Only the files that can RENDER (component modules). The error-boundary class
// applies to every module in the graph, but some assertions are about JSX.
export const isComponent = (file) => file.endsWith('.jsx');

export const readSource = (file) => readFileSync(file, 'utf8');

// ---- balanced-delimiter extraction -------------------------------------
// Line-based scanning cannot tell whether a value is INSIDE a given call or
// merely near it, which is exactly the imprecision that let a defect through.
// These read the real extent of an expression instead of guessing from a
// window of characters.

const CLOSER = { '(': ')', '{': '}', '[': ']' };

// The source of the balanced group that OPENS at `openIdx` (which must be one
// of ( { [ ), delimiters included. Returns '' if it never closes.
export function balancedAt(src, openIdx) {
  const open = src[openIdx];
  const close = CLOSER[open];
  if (!close) return '';
  let depth = 0;
  for (let i = openIdx; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  return '';
}

// Every `name(...)` call in `src`, as { name, args, index } where `args` is the
// balanced argument list. `namePattern` must have the /g flag and capture the
// call name in group 1 (or match the name itself).
export function callsOf(src, namePattern) {
  const out = [];
  const re = new RegExp(namePattern.source, namePattern.flags.includes('g') ? namePattern.flags : `${namePattern.flags}g`);
  for (const m of src.matchAll(re)) {
    const open = src.indexOf('(', m.index + m[0].length - 1);
    if (open < 0) continue;
    out.push({ name: m[0], index: m.index, args: balancedAt(src, open) });
  }
  return out;
}

// The balanced `{ … }` JSX expression regions introduced by `marker` (e.g.
// `{lockBlend.available && (`). Used to prove that other references sit inside
// the same gate rather than merely in the same file.
export function gatedRegions(src, marker) {
  const out = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf(marker, from);
    if (at < 0) break;
    const open = src.lastIndexOf('{', at);
    const region = open >= 0 ? balancedAt(src, open) : '';
    if (region) out.push({ start: open, end: open + region.length, text: region });
    from = at + marker.length;
  }
  return out;
}

export const insideAny = (regions, index) => regions.some((r) => index >= r.start && index < r.end);
