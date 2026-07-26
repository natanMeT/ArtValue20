// ===================================================================
// errorFlow — the CLASS-A invariant, derived from the PARSE TREE.
//
// WHY THIS REPLACES THE REGEX PREDICATE
// The round-4 predicate scanned source text for `(e|err|error|ex)…\.message`
// inside a hard-coded list of sink names. It was therefore blind to
// `catch (failure) { setError(failure.message) }` — the author only had to pick
// a different variable name. Enumerating *sinks* is also open-ended: any
// function can render.
//
// So the rule is inverted and taken from the AST:
//   1. Every `catch` clause is found STRUCTURALLY, and its binding is whatever
//      the author actually named it. Nothing is hard-coded.
//   2. Inside the handler, every use of that binding is DEFAULT-DENIED and must
//      match one of a small, closed set of SAFE handlings (below).
//
// Enumerating safe handling is closed and reviewable; enumerating unsafe sinks
// is not. A new render path cannot slip through, because it was never on an
// allowlist to begin with.
//
// SAFE handlings:
//   - passed (at any depth) into a declared boundary call: userFacingError,
//     engineError, userError, posterExportErrorText, creativeError
//   - passed into console.* (diagnostics never render)
//   - bare rethrow: `throw e`
//   - inspected without being surfaced: `e instanceof X`, `typeof e`,
//     `e.status === 500`, `!e.status`, `e?.name`, comparisons and conditions
//   - assigned to a local that is itself only used safely (one alias level)
//
// LIMITS, stated rather than hidden: alias tracking is ONE level, so
// `const m = e.message; const n = m; render(n)` is not followed. Full data-flow
// needs a type system or ESLint's scope analysis; this closes the shape that
// actually shipped four times. No new dependency: `@babel/parser` is already
// present in the tree (via @vitejs/plugin-react) and parses JSX.
// ===================================================================
import { parse } from '@babel/parser';
import { readFileSync } from 'node:fs';

// Calls that make a caught value safe to hold. Small and closed BY DESIGN.
export const BOUNDARY_CALLS = Object.freeze([
  'userFacingError', 'engineError', 'userError', 'posterExportErrorText',
  // Assistant.jsx owns two older, equally strict boundaries: `creativeError`
  // maps by structured `code` only, and `gentleError` matches the message
  // against a regex and returns one of two FIXED Hebrew strings — neither can
  // return the caught text. Verified by reading both before allowlisting.
  'creativeError', 'gentleError',
]);

export function parseModule(src) {
  return parse(src, {
    sourceType: 'module',
    allowReturnOutsideFunction: true,
    plugins: ['jsx', 'objectRestSpread', 'optionalChaining', 'nullishCoalescingOperator', 'classProperties', 'dynamicImport'],
  });
}

// Generic AST walk. `visit(node, ancestors)`; ancestors is outermost-first.
function walk(node, visit, ancestors = []) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walk(n, visit, ancestors); return; }
  if (typeof node.type !== 'string') return;
  visit(node, ancestors);
  const next = [...ancestors, node];
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'comments') continue;
    walk(node[key], visit, next);
  }
}

const isCallee = (parent, child) => parent.type === 'CallExpression' && parent.callee === child;

// Name of a call's callee for allowlist purposes: `f()` -> 'f', `a.b()` -> 'a.b'.
function calleeName(call) {
  const c = call.callee;
  if (!c) return '';
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed) {
    const objectName = c.object.type === 'Identifier' ? c.object.name : '';
    return objectName ? `${objectName}.${c.property.name || ''}` : (c.property.name || '');
  }
  return '';
}

const isBoundaryCall = (node) => node.type === 'CallExpression'
  && (BOUNDARY_CALLS.includes(calleeName(node)) || calleeName(node).startsWith('console.'));

// Is this identifier use safe? `ancestors` runs outermost-first and ends at the
// identifier's direct parent.
function isSafeUse(ident, ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    const node = ancestors[i];
    const child = i === ancestors.length - 1 ? ident : ancestors[i + 1];

    // wrapped by a declared boundary (or diagnostics) at any depth
    if (isBoundaryCall(node)) return true;

    // being CALLED is not being rendered: e.g. `e.handler()` — but the callee
    // expression itself is not a value that reaches the UI
    if (isCallee(node, child)) return true;

    // bare rethrow: `throw e;`
    if (node.type === 'ThrowStatement' && node.argument === ident) return true;

    // inspection, never surfacing
    if (node.type === 'BinaryExpression' && (node.operator === 'instanceof' || node.operator === 'in')) return true;
    if (node.type === 'UnaryExpression' && (node.operator === 'typeof' || node.operator === '!')) return true;
    if (node.type === 'BinaryExpression' && ['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(node.operator)) return true;
    if ((node.type === 'IfStatement' || node.type === 'ConditionalExpression' || node.type === 'WhileStatement') && node.test === child) return true;

    // stop climbing at the handler boundary
    if (node.type === 'CatchClause' || node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') break;
  }
  return false;
}

// Locals assigned directly FROM the caught binding (one alias level).
// Returns Map<aliasName, declaratorNode> so the declaration site can be judged
// by how the alias is actually used.
function aliasesOf(handlerBody, bindingName) {
  const out = new Map();
  walk(handlerBody, (node) => {
    if (node.type !== 'VariableDeclarator' || !node.init || node.id.type !== 'Identifier') return;
    let root = node.init;
    // unwrap  e.message  /  e?.error?.message  /  String(e.message)  /  e.x || ''
    const seen = new Set();
    for (let guard = 0; guard < 12 && root && !seen.has(root); guard += 1) {
      seen.add(root);
      if (root.type === 'MemberExpression' || root.type === 'OptionalMemberExpression') root = root.object;
      else if (root.type === 'CallExpression' && root.arguments.length) root = root.arguments[0];
      else if (root.type === 'LogicalExpression') root = root.left;
      else if (root.type === 'TSNonNullExpression') root = root.expression;
      else break;
    }
    if (root && root.type === 'Identifier' && root.name === bindingName) out.set(node.id.name, node);
  });
  return out;
}

// Are ALL uses of `name` inside `handlerBody` safe (ignoring its declaration)?
// Extracting technical detail into a local and handing it to `engineError` is a
// deliberate, correct pattern — the detail is kept for diagnostics and the
// business text is declared separately — so the extraction itself is safe
// exactly when the extracted value never escapes unsafely.
function allUsesSafe(handlerBody, name, declarator) {
  let safe = true;
  walk(handlerBody, (inner, ancestors) => {
    if (!safe || inner.type !== 'Identifier' || inner.name !== name) return;
    if (declarator && declarator.id === inner) return;                 // its own declaration
    const parent = ancestors[ancestors.length - 1];
    if (parent && (parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') && parent.property === inner && !parent.computed) return;
    if (parent && parent.type === 'ObjectProperty' && parent.key === inner && !parent.computed) return;
    if (!isSafeUse(inner, ancestors)) safe = false;
  }, [handlerBody]);
  return safe;
}

// Every unsafe flow in `src`. Each entry: { binding, name, line, snippet }.
export function unsafeErrorFlows(src, label = '') {
  let ast;
  try { ast = parseModule(src); } catch (e) { return [{ binding: '', name: '', line: 0, snippet: `PARSE FAILED (${label}): ${e.message}` }]; }
  const out = [];
  const lines = src.split('\n');

  walk(ast, (node) => {
    if (node.type !== 'CatchClause' || !node.param || node.param.type !== 'Identifier') return; // `catch {}` holds nothing
    const binding = node.param.name;
    const aliases = aliasesOf(node.body, binding);
    // An alias whose every use is safe makes its EXTRACTION safe too, so
    // `const detail = String(e?.error?.message || ''); throw engineError(detail, …)`
    // is not reported. An alias that escapes is reported at both sites.
    const safeAliases = new Set(
      [...aliases.entries()].filter(([name, decl]) => allUsesSafe(node.body, name, decl)).map(([name]) => name),
    );
    const tainted = new Set([binding, ...aliases.keys()]);

    walk(node.body, (inner, ancestors) => {
      if (inner.type !== 'Identifier' || !tainted.has(inner.name)) return;
      // skip the declaration site of an alias (`const m = e.message`)
      const parent = ancestors[ancestors.length - 1];
      if (parent && parent.type === 'VariableDeclarator' && parent.id === inner) return;
      // ...and skip the binding inside a SAFE alias's initializer
      if (safeAliases.size) {
        const decl = ancestors.find((a) => a.type === 'VariableDeclarator' && a.id.type === 'Identifier' && safeAliases.has(a.id.name));
        if (decl) return;
      }
      if (safeAliases.has(inner.name)) return;
      // skip non-value positions: `{ e }` keys, `obj.e`
      if (parent && (parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') && parent.property === inner && !parent.computed) return;
      if (parent && parent.type === 'ObjectProperty' && parent.key === inner && !parent.computed) return;
      if (isSafeUse(inner, ancestors)) return;
      const line = inner.loc ? inner.loc.start.line : 0;
      out.push({ binding, name: inner.name, line, snippet: (lines[line - 1] || '').trim().slice(0, 120) });
    }, [node]);
  });
  return out;
}

// Only real JS/JSX modules hold catch clauses. The import graph legitimately
// contains assets and stylesheets (`import './x.css'`, `import png from …`);
// handing those to a JS parser produces noise, not findings. TypeScript is
// excluded deliberately rather than silently: the repo has exactly one `.ts`
// type-declaration file with no runtime code, and enabling the plugin for it
// would imply a coverage claim over a language this rule has not been validated
// against.
export const isParsableModule = (file) => /\.(js|jsx|mjs)$/.test(file);

export const unsafeErrorFlowsInFile = (file) => (isParsableModule(file)
  ? unsafeErrorFlows(readFileSync(file, 'utf8'), file)
  : []);
