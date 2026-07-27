// ===================================================================
// sourceScan — the scanning primitives used by the local-engine retirement
// proof. Extracted so the NEGATIVE CONTROLS exercise the EXACT code the gate
// runs, rather than a re-implementation that could drift from it.
//
// WHY THIS EXISTS (Codex review of `1361a84`, 2 findings — both real):
//
//   1. P1 — the previous comment stripper was `s.replace(/\/\/[^\n]*/g, '')`.
//      That regex has no idea what a string is, so it treated the `//` inside
//      a URL as the start of a line comment: `fetch('http://127.0.0.1:8188')`
//      became `fetch('http:` BEFORE either assertion looked at it. The single
//      most common shape of a local-engine call therefore walked straight
//      through the gate. Stripping must be syntax-aware.
//
//   2. P2 — the recursive walker only collected `.js/.jsx/.ts/.tsx`, while
//      `.mjs`/`.cjs` were picked up only at the repository ROOT. A local-engine
//      caller added as `src/tool.mjs`, `supabase/functions/tool.mjs` or a
//      nested `.cjs` was silently outside both scans.
//
// DESIGN RULE — FAIL OPEN TOWARD DETECTION. Every ambiguous case resolves to
// PRESERVING text rather than removing it. Under-stripping can only produce a
// FALSE POSITIVE (a comment counted as code), which fails loudly and gets
// looked at. Over-stripping produces a FALSE NEGATIVE — a real call hidden
// from the gate — which is exactly the defect above.
// ===================================================================
import fs from 'node:fs';
import path from 'node:path';

// Every module extension the toolchain can execute. `.mjs`/`.cjs` are included
// at EVERY depth, not just the repository root.
export const MODULE_EXTENSIONS = Object.freeze(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.cts', '.mts']);

export const isModuleFile = (name) => MODULE_EXTENSIONS.some((e) => name.endsWith(e));

// Directories that are never product/tooling source.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-profile', 'coverage', 'artifacts', '.vite']);

/** Recursively collect every executable module below `dir`. */
export function collectModules(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...collectModules(path.join(dir, entry.name)));
    } else if (isModuleFile(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out.map((f) => path.normalize(f));
}

// Can a `/` at this position begin a regex literal? It cannot directly follow a
// value (identifier, literal, closing bracket) — there it is division. When the
// previous significant character is anything else, a regex is possible.
function regexCanFollow(prev) {
  if (prev === '') return true;
  return !/[\w$)\]]/.test(prev);
}

/**
 * Remove comments while PRESERVING string, template and regex literals.
 *
 * Comments are replaced by their contained newlines only, so line numbers in an
 * offender report stay meaningful. Everything else is emitted verbatim — a URL
 * inside a string literal survives untouched, which is the entire point.
 *
 * @param {string} src
 * @returns {string} source with comments removed and all literals intact
 */
export function stripComments(src) {
  const s = String(src == null ? '' : src);
  const n = s.length;
  let out = '';
  let i = 0;
  let prev = ''; // last significant (non-whitespace) emitted character

  const emit = (text) => {
    out += text;
    for (let k = text.length - 1; k >= 0; k -= 1) {
      if (!/\s/.test(text[k])) { prev = text[k]; break; }
    }
  };

  while (i < n) {
    const c = s[i];
    const next = s[i + 1];

    // ---- line comment: drop to end of line, keep the newline ----
    if (c === '/' && next === '/') {
      while (i < n && s[i] !== '\n') i += 1;
      continue;
    }

    // ---- block comment: drop, but keep its newlines ----
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(s[i] === '*' && s[i + 1] === '/')) {
        if (s[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2; // consume the closing */ (past-end is harmless)
      continue;
    }

    // ---- single/double quoted string: emit verbatim, honour escapes ----
    if (c === "'" || c === '"') {
      let lit = c;
      i += 1;
      while (i < n) {
        if (s[i] === '\\') { lit += s.slice(i, i + 2); i += 2; continue; }
        lit += s[i];
        const done = s[i] === c;
        i += 1;
        if (done) break;
        // An unterminated literal must not swallow the file: stop at the
        // newline and let the rest be scanned normally (FAIL OPEN).
        if (s[i - 1] === '\n') break;
      }
      emit(lit);
      continue;
    }

    // ---- template literal: emit verbatim, including ${...} substitutions ----
    if (c === '`') {
      let lit = '`';
      i += 1;
      let depth = 0; // ${ } nesting
      while (i < n) {
        if (s[i] === '\\') { lit += s.slice(i, i + 2); i += 2; continue; }
        if (s[i] === '$' && s[i + 1] === '{') { lit += '${'; i += 2; depth += 1; continue; }
        if (depth > 0 && s[i] === '}') { lit += '}'; i += 1; depth -= 1; continue; }
        lit += s[i];
        const done = s[i] === '`' && depth === 0;
        i += 1;
        if (done) break;
      }
      emit(lit);
      continue;
    }

    // ---- regex literal: emit verbatim so an embedded quote cannot open a
    //      phantom string and swallow the rest of the file ----
    if (c === '/' && regexCanFollow(prev)) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < n && s[j] !== '\n') {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === '[') inClass = true;
        else if (s[j] === ']') inClass = false;
        else if (s[j] === '/' && !inClass) { closed = true; break; }
        j += 1;
      }
      if (closed) {
        j += 1;
        while (j < n && /[a-z]/.test(s[j])) j += 1; // flags
        emit(s.slice(i, j));
        i = j;
        continue;
      }
      // No terminator on this line → it was division after all. Fall through.
    }

    emit(c);
    i += 1;
  }

  return out;
}

// ---- the two detectors the repository-wide assertions apply ----

/** A workstation-engine product name appearing as executable code. */
export const ENGINE_NAME_RE = /\b(comfy|comfyui|fooocus|ollama|automatic1111|a1111)\b/i;

/** A loopback / private-engine address or a known engine port. */
export const LOCAL_ADDRESS_RE = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|:8188|:7860|:11434|:8189/;

export const namesEngine = (code) => ENGINE_NAME_RE.test(code);
export const hasLocalAddress = (code) => LOCAL_ADDRESS_RE.test(code);
