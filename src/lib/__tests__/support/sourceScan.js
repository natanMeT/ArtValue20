// ===================================================================
// sourceScan — the scanning primitives used by the local-engine retirement
// proof. Extracted so the NEGATIVE CONTROLS exercise the EXACT code the gate
// runs, rather than a re-implementation that could drift from it.
//
// ── WHY THIS IS PARSER-BACKED ──────────────────────────────────────
// This module used to hand-roll a lexical scanner to remove comments while
// preserving literals. Codex broke it three times in a row, and each break was
// a SILENT MISS — a real local-engine call hidden from the gate:
//
//   1. `s.replace(/\/\/[^\n]*/g, '')` read the `//` inside a URL as a line
//      comment: `fetch('http://127.0.0.1:8188/prompt')` → `fetch('http:`.
//   2. Template-substitution depth counted only `${` and `}`, so an ordinary
//      object literal inside `${...}` decremented a depth its `{` never
//      incremented — ending the template early and eating the URL after it.
//   3. JSX text had no state at all, so `<p>Open http://127.0.0.1:8188/x</p>`
//      was truncated at `http:`.
//   4. Regex detection looked only at the previous CHARACTER, so `return /it's
//      fine/;` was read as division; the apostrophe then opened a phantom
//      string that swallowed the rest of the line.
//
// Every one of those is the same class of bug: a hand-written approximation of
// JavaScript's grammar. The approximation is the defect, so it is GONE. We now
// hand the file to `@babel/parser` — a real parser, already a declared direct
// devDependency — and use its authoritative comment ranges.
//
// ── THE METHOD ─────────────────────────────────────────────────────
// `executableSource()` parses the file and blanks out ONLY the byte ranges the
// parser reports as comments, preserving length and newlines. Nothing else is
// touched. That single rule satisfies every invariant at once, structurally:
//
//   • actual comments are excluded                    → their ranges are blanked
//   • strings and template literals stay inspectable  → never touched
//   • nested substitutions / nested braces can't hide → the PARSER tracks them
//   • JSX text stays inspectable                      → never touched
//   • regex literals can't corrupt the remainder      → the PARSER tokenizes them
//   • JS/JSX/TS/TSX/MJS/CJS/MTS/CTS parse as themselves → per-extension plugins
//   • unparseable executable source FAILS LOUDLY      → the parse error rethrows
//
// There is no ambiguity left to resolve heuristically, because we no longer
// decide what a token is — we only ask where the comments are.
// ===================================================================
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

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

/** Thrown when executable source cannot be parsed. Never swallowed. */
export class UnparseableSourceError extends Error {
  constructor(filename, cause) {
    super(`sourceScan: cannot parse ${filename || '<inline>'} — ${cause && cause.message}`);
    this.name = 'UnparseableSourceError';
    this.filename = filename;
    this.cause = cause;
  }
}

// Parser configuration per real file syntax. TS and JSX are NOT interchangeable:
// in a `.ts` file `<T>x` is a type assertion, in `.tsx` it opens an element, so
// the plugin set must follow the extension rather than be applied uniformly.
export function parserOptionsFor(filename = '') {
  const ext = MODULE_EXTENSIONS.find((e) => filename.endsWith(e)) || '.js';
  const plugins = [];
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') plugins.push('typescript');
  else if (ext === '.tsx') plugins.push('typescript', 'jsx');
  else plugins.push('jsx'); // .js/.jsx/.mjs/.cjs — harmless for plain JS

  // 'unambiguous' for EVERY extension: it accepts CommonJS (`module.exports`)
  // and ESM alike, and — unlike 'script' — it also accepts the TypeScript
  // export-assignment (`export = x`) that is legal in a .cts file. Pinning
  // .cjs/.cts to 'script' made valid .cts source unparseable, which the
  // loud-failure control caught.
  return { sourceType: 'unambiguous', plugins, ranges: true, errorRecovery: false, allowReturnOutsideFunction: true };
}

/**
 * Return the source with ONLY its comments blanked out.
 *
 * The parser's own comment ranges are the authority. Comment bytes become
 * spaces (newlines preserved) so offsets, line numbers and every other byte —
 * strings, templates, JSX text, regex literals — survive exactly.
 *
 * @param {string} src
 * @param {string} [filename] drives plugin selection and error messages
 * @returns {string}
 * @throws {UnparseableSourceError} if the source is not valid for its extension
 */
export function executableSource(src, filename = '') {
  const s = String(src == null ? '' : src);
  let ast;
  try {
    ast = parse(s, parserOptionsFor(filename));
  } catch (e) {
    // LOUD BY DESIGN: an unparseable executable file must never be treated as
    // "nothing found". Silence here is exactly how a bypass would hide.
    throw new UnparseableSourceError(filename, e);
  }

  const comments = ast.comments || [];
  if (comments.length === 0) return s;

  const chars = [...s];
  for (const c of comments) {
    const start = typeof c.start === 'number' ? c.start : (c.range && c.range[0]);
    const end = typeof c.end === 'number' ? c.end : (c.range && c.range[1]);
    if (typeof start !== 'number' || typeof end !== 'number') continue;
    for (let i = start; i < end && i < chars.length; i += 1) {
      if (chars[i] !== '\n') chars[i] = ' ';
    }
  }
  return chars.join('');
}

/** Read a file from disk and return its executable (comment-free) source. */
export function executableSourceOf(file) {
  return executableSource(fs.readFileSync(file, 'utf8'), file);
}

// Back-compat alias: the assertions read more naturally as "strip the comments".
export const stripComments = executableSource;

// ---- the two detectors the repository-wide assertions apply ----

/** A workstation-engine product name appearing as executable code. */
export const ENGINE_NAME_RE = /\b(comfy|comfyui|fooocus|ollama|automatic1111|a1111)\b/i;

// ── address classes ────────────────────────────────────────────────
// The cloud-only invariant is about NETWORK DESTINATIONS the product must never
// reach, which is wider than "localhost and four known ports": a workstation
// engine is just as reachable at 192.168.x.x or 10.x.x.x on the studio LAN.
//
// Every class below is matched ONLY in a network context — behind a scheme,
// behind a protocol-relative `//`, or followed by a port — so ordinary numeric
// business data (a price, a version, an id, a quantity) is never mistaken for
// an endpoint. `localhost` is the one bare-word exception; it is unambiguous.
const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const V4_LOOPBACK = `127(?:\\.${OCTET}){3}`;                                   // 127.0.0.0/8
const V4_PRIVATE = `(?:10(?:\\.${OCTET}){3}`                                   // 10.0.0.0/8
  + `|192\\.168(?:\\.${OCTET}){2}`                                             // 192.168.0.0/16
  + `|172\\.(?:1[6-9]|2\\d|3[01])(?:\\.${OCTET}){2})`;                         // 172.16.0.0/12
const V4_LINK_LOCAL = `169\\.254(?:\\.${OCTET}){2}`;                           // 169.254.0.0/16
const V4_UNSPECIFIED = '0\\.0\\.0\\.0';
const V4_HOST = `(?:${V4_LOOPBACK}|${V4_PRIVATE}|${V4_LINK_LOCAL}|${V4_UNSPECIFIED})`;

// IPv6 loopback (::1), link-local (fe80::/10) and unique-local (fc00::/7).
const V6_HOST = '(?:::1|fe80(?::[0-9a-f]{0,4}){1,7}|f[cd][0-9a-f]{2}(?::[0-9a-f]{0,4}){1,7})';
const V6_BRACKETED = `\\[${V6_HOST}\\]`;

const SCHEME = '(?:https?|wss?|ftp)';
const PORT = ':\\d{2,5}';

// Engine ports remain a signal on their own — they are specific enough that a
// bare occurrence is worth failing on.
const ENGINE_PORTS = ':(?:8188|8189|7860|11434)\\b';

export const LOCAL_ADDRESS_RE = new RegExp([
  `\\blocalhost\\b`,                              // bare hostname (unambiguous)
  `(?:${SCHEME}:)?//${V4_HOST}\\b`,               // scheme:// or protocol-relative
  `\\b${V4_HOST}${PORT}`,                         // host:port
  `(?:${SCHEME}:)?//${V6_BRACKETED}`,             // bracketed IPv6 in a URL
  `${V6_BRACKETED}${PORT}`,                       // [ipv6]:port
  ENGINE_PORTS,                                   // a known engine port anywhere
].join('|'), 'i');

export const namesEngine = (code) => ENGINE_NAME_RE.test(code);
export const hasLocalAddress = (code) => LOCAL_ADDRESS_RE.test(code);

/** Convenience for the scans: does this FILE contain a forbidden reference? */
export function scanFile(file) {
  const code = executableSourceOf(file);
  return { engine: namesEngine(code), address: hasLocalAddress(code) };
}
