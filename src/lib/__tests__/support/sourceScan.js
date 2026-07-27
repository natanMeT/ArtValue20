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

// Directories that are never product or tooling SOURCE, and are therefore the
// only things a repository-root walk may skip. Three kinds, and nothing else:
//   • dependencies        node_modules
//   • build / generated   dist, dist-profile, coverage, artifacts, .vite
//   • operational state   .git, .wrangler, .claude
// Ordinary CONTENT directories (docs/, posts/, public/, jakeos-doc/) are NOT
// listed. They hold no executable module today, and that is precisely why they
// must stay in scope: skipping them would rebuild the fixed allowlist inverted,
// and a module dropped into one of them later would again escape the scan.
const SKIP_DIRS = new Set([
  'node_modules',
  'dist', 'dist-profile', 'coverage', 'artifacts', '.vite',
  '.git', '.wrangler', '.claude',
]);

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
 * INDEXING (Codex P1 on `d84cfdc`): Babel's `start`/`end` are **UTF-16 code
 * unit** offsets. The previous implementation blanked through `[...s]`, which
 * iterates **code points**, so every astral character (an emoji, a rare CJK
 * glyph) before a comment shifted the blanked window one place right — with
 * enough of them the window slid off the comment and erased executable text
 * after it, including part of a later forbidden URL. That is precisely the
 * silent miss this scanner exists to prevent. Everything below therefore stays
 * in UTF-16 space: `String.prototype.slice` uses the same indexing Babel
 * reports, so the two representations cannot drift.
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

  const ranges = (ast.comments || [])
    .map((c) => [
      typeof c.start === 'number' ? c.start : (c.range && c.range[0]),
      typeof c.end === 'number' ? c.end : (c.range && c.range[1]),
    ])
    .filter(([a, b]) => typeof a === 'number' && typeof b === 'number' && b > a)
    .sort((x, y) => x[0] - y[0]);

  if (ranges.length === 0) return s;

  // Rebuild by slicing between comment ranges — UTF-16 indexed, like Babel.
  let out = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue; // defensive: never re-blank an overlap
    out += s.slice(cursor, start);
    out += s.slice(start, end).replace(/[^\n]/g, ' ');
    cursor = end;
  }
  out += s.slice(cursor);
  return out;
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

// ── retired-engine destinations ────────────────────────────────────
// SCOPE (deliberately narrow). This detector exists for ONE claim: the retired
// workstation engines — ComfyUI, Ollama, Fooocus and A1111 — are gone and
// cannot return. Those engines ran on THIS MACHINE'S LOOPBACK, on four known
// ports. So this looks for loopback destinations and those ports, and nothing
// else.
//
// It is NOT a general network-egress policy. An earlier revision of this file
// grew a universal private-address classifier (RFC1918, link-local, unique
// local, IPv4-mapped IPv6, the unspecified range) and a runtime `guardedFetch`
// boundary in production code. That was a scope expansion beyond the approved
// product decision, and it has been removed — see docs/PROJECT_TRACKER.md. A
// universal "no JavaScript may ever reach a private address" guarantee is a
// platform concern (CSP, server-side egress policy), not a source scan.
//
// The parsing method is kept, because it is what makes the NARROW claim
// correct: `127.1`, `2130706433` and `0x7f000001` are all the same loopback
// address, and only the URL parser knows that. Candidates are EXTRACTED (a
// scheme, a protocol-relative `//`, or an explicit `host:port`), normalized by
// the platform's WHATWG `URL` parser, and only then classified.
//
// The business-data boundary is preserved by the extraction step: standalone
// IP-like text — a version string, an SKU, a decimal pair — is never a
// candidate, so it is never normalized and never flagged.

// Base used only so a protocol-relative `//host/x` can be normalized at all.
const RELATIVE_BASE = 'http://invalid.example';

// Characters that cannot appear inside a URL token in source.
const STOP = "\\s'\"`)\\]}<>\\\\,;";
// A bracketed IPv6 host must be consumed WHOLE: `]` is a stop character
// everywhere else, so without this alternative `http://[fe80::1]:9000` was
// truncated to `http://[fe80::1` and never reached the normalizer. The class
// inside the brackets admits zone-identifier characters too (`%25eth0`).
const V6_BRACKET = '\\[[0-9A-Za-z:.%]+\\]';
const HOST_AND_REST = `(?:${V6_BRACKET})?[^${STOP}]*`;
const SCHEMED = `\\b(?:https?|wss?|ftp):\\/\\/${HOST_AND_REST}`;
const PROTOCOL_RELATIVE = `(?<![:\\w])\\/\\/${HOST_AND_REST}`;
// `host:port` with no scheme — a bare destination. The host may be a dotted or
// numeric IPv4 form, a bracketed IPv6, or a hostname.
const HOST_PORT = `(?<![\\w.:/])(?:\\[[0-9A-Fa-f:.%]+\\]|[A-Za-z0-9][A-Za-z0-9.\\-_]*):\\d{1,5}\\b`;

const URL_CANDIDATE_RE = new RegExp(`${SCHEMED}|${PROTOCOL_RELATIVE}|${HOST_PORT}`, 'gi');

// Known workstation-engine ports stay a signal in their own right: they appear
// in composed expressions (`base + ':8188/prompt'`) where no host is present to
// normalize, and they are specific enough to be worth failing on alone.
const ENGINE_PORT_RE = /:(?:8188|8189|7860|11434)\b/;

const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Parse one candidate into a normalized hostname, or '' when it is not a URL. */
function normalizedHost(candidate) {
  // Exactly ONE parse shape per candidate. Prefixing an already-schemed
  // candidate with `http://` would parse `http://http://[fe80::1%25eth0]…` as
  // the host `http` — a truthy result that silently pre-empted the zone-id
  // retry below and swallowed a link-local destination.
  let attempt;
  if (candidate.startsWith('//')) attempt = () => new URL(candidate, RELATIVE_BASE);
  else if (HAS_SCHEME_RE.test(candidate)) attempt = () => new URL(candidate);
  else attempt = () => new URL(`http://${candidate}`);

  try {
    const host = attempt().hostname;
    if (host) return host.toLowerCase();
  } catch { /* fall through to the zone-identifier retry */ }

  // A zone identifier (`fe80::1%eth0`, `fe80::1%25eth0`) is not permitted inside
  // a URL host, so the parse above throws. Strip the zone and classify the base
  // address rather than losing the destination entirely.
  const zoneless = candidate.replace(/%25[^\]\s/]+/gi, '').replace(/%[A-Za-z0-9]+(?=\])/g, '');
  if (zoneless !== candidate) return normalizedHost(zoneless);
  return '';
}

const V4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Is this NORMALIZED host the loopback the retired engines listened on? */
export function isLoopbackHost(host) {
  if (!host) return false;
  const h = String(host).toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;

  const v4 = V4_RE.exec(h);
  // 127.0.0.0/8 — the whole loopback block, because `127.1` normalizes into it.
  if (v4) return v4.slice(1).every((o) => Number(o) <= 255) && Number(v4[1]) === 127;

  // IPv6: only the loopback address itself, and the IPv4-mapped form of a
  // loopback address (`[::ffff:127.0.0.1]` normalizes to `[::ffff:7f00:1]`).
  const inner = h.replace(/^\[|\]$/g, '');
  if (!inner.includes(':')) return false;
  if (inner === '::1') return true;
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(inner);
  if (mapped) return (parseInt(mapped[1], 16) >> 8) === 127;
  const mappedDotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(inner);
  if (mappedDotted) return isLoopbackHost(mappedDotted[1]);
  return false;
}

/**
 * Does this executable source reference a retired workstation-engine
 * destination — a loopback address, or one of the four engine ports?
 * Every candidate is normalized by the platform URL parser before classification.
 */
export function hasLocalAddress(code) {
  const text = String(code == null ? '' : code);
  if (ENGINE_PORT_RE.test(text)) return true;
  if (/\blocalhost\b/i.test(text)) return true;
  for (const m of text.matchAll(URL_CANDIDATE_RE)) {
    if (isLoopbackHost(normalizedHost(m[0]))) return true;
  }
  return false;
}

export const namesEngine = (code) => ENGINE_NAME_RE.test(code);

/** Convenience for the scans: does this FILE contain a forbidden reference? */
export function scanFile(file) {
  const code = executableSourceOf(file);
  return { engine: namesEngine(code), address: hasLocalAddress(code) };
}
