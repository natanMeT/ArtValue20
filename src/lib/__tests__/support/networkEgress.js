// ===================================================================
// networkEgress — STRUCTURAL discovery of network sinks in the AST.
//
// ── WHY THE TEXT SCANNER WAS NOT ENOUGH ────────────────────────────
// The cloud-only claim used to rest on scanning source text for URL-shaped
// literals. Codex showed that cannot hold:
//
//     const host = '127.0.0.1';
//     fetch('http://' + host + ':9000/x');
//     fetch(`http://${host}:9000/x`);
//
// The destination never exists as a literal, so NO text scan can see it. That
// is not a gap to patch with more patterns — it is proof that a source-level
// proxy cannot decide a runtime property.
//
// ── WHAT REPLACED IT ───────────────────────────────────────────────
// Two layers, and the claim is their conjunction:
//
//   RUNTIME (`src/lib/networkPolicy.js`) — the real execution boundary. Every
//   approved adapter issues its request through `guardedFetch()`, which
//   normalizes the destination with the WHATWG URL parser and refuses
//   loopback / private / link-local / unspecified / IPv4-mapped-IPv6 hosts.
//   However the string was assembled, by the time it reaches that function it
//   is concrete — and concrete destinations are decidable.
//
//   STRUCTURAL (this module) — finds every network SINK in the parsed AST, by
//   SHAPE, never by variable name or URL text, and the proof asserts that only
//   explicitly registered adapter modules contain one. That is what stops a new
//   raw `fetch` from quietly appearing somewhere that skips the boundary.
//
// Neither layer alone is the proof. Runtime validation without structural
// containment can be bypassed by adding a second sink; structural containment
// without runtime validation cannot see an assembled destination.
// ===================================================================
import fs from 'node:fs';
import { parse } from '@babel/parser';
import { parserOptionsFor, UnparseableSourceError } from './sourceScan.js';

/**
 * Every network sink class the platform exposes. Detection is by AST SHAPE:
 * a call to `fetch` is a sink whatever the surrounding identifiers are called,
 * and renaming an import cannot hide one.
 */
export const SINK_KINDS = Object.freeze({
  FETCH: 'fetch',
  XHR: 'XMLHttpRequest',
  WEBSOCKET: 'WebSocket',
  EVENT_SOURCE: 'EventSource',
  BEACON: 'navigator.sendBeacon',
  WORKER: 'Worker',
  IMPORT_SCRIPTS: 'importScripts',
  DYNAMIC_IMPORT: 'import()',
  ELEMENT_SRC: 'element.src=',
});

// Global callables that perform a request.
const CALL_SINKS = new Map([
  ['fetch', SINK_KINDS.FETCH],
  ['importScripts', SINK_KINDS.IMPORT_SCRIPTS],
]);

// Constructors that open a connection.
const NEW_SINKS = new Map([
  ['XMLHttpRequest', SINK_KINDS.XHR],
  ['WebSocket', SINK_KINDS.WEBSOCKET],
  ['EventSource', SINK_KINDS.EVENT_SOURCE],
  ['Worker', SINK_KINDS.WORKER],
  ['SharedWorker', SINK_KINDS.WORKER],
]);

// Roots that merely qualify a global (`window.fetch`, `globalThis.fetch`).
const GLOBAL_ROOTS = new Set(['window', 'globalThis', 'self', 'global']);

// Properties whose ASSIGNMENT causes the browser to fetch a resource.
const SRC_PROPS = new Set(['src', 'srcset']);

/** The bare callee name for `f()`, `window.f()` — or '' when it is neither. */
function calleeName(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed
    && node.object && node.object.type === 'Identifier'
    && GLOBAL_ROOTS.has(node.object.name)
    && node.property && node.property.type === 'Identifier') {
    return node.property.name;
  }
  return '';
}

/**
 * Walk every node depth-first, passing the PARENT and the key the child was
 * reached under. Parent context is what lets a bare `fetch` reference be told
 * apart from a property named `fetch` or a binding called `fetch`.
 */
function walkNodes(node, visit, parent = null, key = '', seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const n of node) walkNodes(n, visit, parent, key, seen);
    return;
  }
  if (typeof node.type === 'string') visit(node, parent, key);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
    const child = node[k];
    if (child && typeof child === 'object') walkNodes(child, visit, node, k, seen);
  }
}

// Every global whose mere REFERENCE hands out a network capability. Capturing
// one into a friendlier name (`const cloudTransport = fetch`) is still egress.
const SINK_GLOBALS = new Map([
  ...CALL_SINKS,
  ...NEW_SINKS,
]);

/**
 * Is this Identifier a real VALUE reference to a global, rather than a property
 * name, a declared binding, a parameter or an object key that merely shares the
 * spelling? Answered from the parent node, never from the text.
 */
function isValueReference(parent, key) {
  if (!parent) return true;
  const t = parent.type;
  if (t === 'MemberExpression' && key === 'property' && !parent.computed) return false;
  if ((t === 'ObjectProperty' || t === 'Property' || t === 'ObjectMethod'
    || t === 'ClassProperty' || t === 'ClassMethod') && key === 'key' && !parent.computed) return false;
  if (key === 'id' || key === 'local' || key === 'imported' || key === 'exported') return false;
  if (key === 'params' || t === 'FunctionDeclaration' && key === 'id') return false;
  if (t === 'CallExpression' && key === 'callee') return false;   // already counted as a call
  if (t === 'NewExpression' && key === 'callee') return false;    // already counted as a construction
  if (t === 'JSXAttribute' || t === 'JSXIdentifier') return false;
  return true;
}

/**
 * Find every network sink in one source file, structurally.
 * @returns {Array<{kind: string, line: number}>}
 * @throws {UnparseableSourceError} — unparseable source is NEVER skipped.
 */
export function findNetworkSinks(src, filename = '') {
  let ast;
  try {
    ast = parse(String(src == null ? '' : src), parserOptionsFor(filename));
  } catch (e) {
    throw new UnparseableSourceError(filename, e);
  }

  const sinks = [];
  const at = (n) => (n && n.loc && n.loc.start ? n.loc.start.line : 0);

  walkNodes(ast.program, (n, parent, key) => {
    if (n.type === 'CallExpression') {
      const name = calleeName(n.callee);
      if (CALL_SINKS.has(name)) sinks.push({ kind: CALL_SINKS.get(name), line: at(n) });
      // Babel models `import(x)` as a CallExpression whose callee is `Import`
      // in some configurations and as an ImportExpression in others. Both.
      if (n.callee && n.callee.type === 'Import') {
        const arg0 = n.arguments && n.arguments[0];
        if (!arg0 || arg0.type !== 'StringLiteral') sinks.push({ kind: SINK_KINDS.DYNAMIC_IMPORT, line: at(n) });
      }
      // navigator.sendBeacon(...) — shape, not name of the holder
      if (n.callee && n.callee.type === 'MemberExpression' && !n.callee.computed
        && n.callee.property && n.callee.property.type === 'Identifier'
        && n.callee.property.name === 'sendBeacon') {
        sinks.push({ kind: SINK_KINDS.BEACON, line: at(n) });
      }
      return;
    }
    if (n.type === 'NewExpression') {
      const name = n.callee && n.callee.type === 'Identifier' ? n.callee.name : calleeName(n.callee);
      if (NEW_SINKS.has(name)) sinks.push({ kind: NEW_SINKS.get(name), line: at(n) });
      return;
    }
    // import(expr) with a NON-literal specifier can load an arbitrary URL.
    if (n.type === 'ImportExpression') {
      const arg = n.source;
      if (!arg || arg.type !== 'StringLiteral') sinks.push({ kind: SINK_KINDS.DYNAMIC_IMPORT, line: at(n) });
      return;
    }
    // `el.src = value` / `el.srcset = value` — the browser fetches on assignment.
    if (n.type === 'AssignmentExpression' && n.left && n.left.type === 'MemberExpression'
      && !n.left.computed && n.left.property && n.left.property.type === 'Identifier'
      && SRC_PROPS.has(n.left.property.name)) {
      sinks.push({ kind: SINK_KINDS.ELEMENT_SRC, line: at(n) });
      return;
    }
    // A bare REFERENCE to a sink global hands the capability to another name:
    // `const cloudTransport = fetch;` is egress wearing a friendly label.
    if (n.type === 'Identifier' && SINK_GLOBALS.has(n.name) && isValueReference(parent, key)) {
      sinks.push({ kind: SINK_GLOBALS.get(n.name), line: at(n) });
    }
  });

  return sinks;
}

/** Read a file and return its structural sinks. */
export function findNetworkSinksInFile(file) {
  return findNetworkSinks(fs.readFileSync(file, 'utf8'), file);
}
