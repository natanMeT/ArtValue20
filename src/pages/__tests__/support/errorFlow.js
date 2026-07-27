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

// ---- boundary SEMANTICS, per argument position -------------------------
// A boundary is not uniformly safe. Being "inside a call to a named boundary"
// says nothing on its own: `userError(e.message)` marks the caught provider text
// `userSafe` so `userFacingError` renders it VERBATIM, and `engineError(tech,
// userMessage)` stores its SECOND argument as `userMessage`, which is likewise
// returned verbatim. Both would have passed a name-only allowlist — the leak the
// whole boundary exists to prevent, laundered through the boundary itself.
//
// So each boundary declares WHICH argument positions may receive a caught value:
//   safe: [0]    -> only the first argument
//   safe: 'all'  -> every argument (diagnostics)
//   safe: []     -> none; this call renders whatever it is given
export const BOUNDARY_SEMANTICS = Object.freeze({
  // (err, fallbackText) — arg0 is classified/sanitized; arg1 is rendered text
  userFacingError: Object.freeze({ safe: Object.freeze([0]) }),
  // (technicalMessage, userMessage) — arg0 stays diagnostic; arg1 is rendered
  engineError: Object.freeze({ safe: Object.freeze([0]) }),
  // (message) — its ONLY argument becomes the verbatim user-facing message
  userError: Object.freeze({ safe: Object.freeze([]) }),
  // (err) — sanitizing wrappers that can only return their own fixed strings.
  // `creativeError` maps by structured `code`; `gentleError` regex-matches and
  // returns one of two FIXED Hebrew strings; `posterExportErrorText` delegates
  // to `userFacingError`. Each verified by reading it before allowlisting.
  posterExportErrorText: Object.freeze({ safe: Object.freeze([0]) }),
  creativeError: Object.freeze({ safe: Object.freeze([0]) }),
  gentleError: Object.freeze({ safe: Object.freeze([0]) }),
});
export const BOUNDARY_CALLS = Object.freeze(Object.keys(BOUNDARY_SEMANTICS));

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

// Which argument positions of this call may receive a caught value?
// null = not a boundary at all. 'all' = every position (diagnostics).
function boundarySafeArgs(node) {
  if (node.type !== 'CallExpression') return null;
  const name = calleeName(node);
  if (name.startsWith('console.')) return 'all';
  return Object.prototype.hasOwnProperty.call(BOUNDARY_SEMANTICS, name) ? BOUNDARY_SEMANTICS[name].safe : null;
}

// Index of the top-level argument of `call` that contains `child`, or -1.
const argIndexOf = (call, child) => call.arguments.indexOf(child);

// Nodes that DO something rather than merely read. If any appears in a subtree,
// that subtree is not "inspection" — evaluating it can already have rendered.
const EFFECTFUL = new Set([
  'CallExpression', 'OptionalCallExpression', 'NewExpression', 'TaggedTemplateExpression',
  'AssignmentExpression', 'UpdateExpression', 'AwaitExpression', 'YieldExpression',
]);

// Is this whole sub-expression free of side effects? Conservative: unknown node
// types are traversed, and anything effectful anywhere inside disqualifies it.
export function isSideEffectFree(node) {
  let clean = true;
  const visit = (n) => {
    if (!clean || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (typeof n.type !== 'string') return;
    if (EFFECTFUL.has(n.type)) { clean = false; return; }
    for (const key of Object.keys(n)) {
      if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'comments') continue;
      visit(n[key]);
    }
  };
  visit(node);
  return clean;
}

// Statements/expressions whose `test` is evaluated as a condition.
const TEST_CARRIERS = new Set(['IfStatement', 'ConditionalExpression', 'WhileStatement', 'DoWhileStatement', 'ForStatement', 'SwitchCase']);

// Contexts in which a value is TESTED rather than surfaced. Being one of these
// is necessary but NOT sufficient — see the side-effect requirement at the use.
function isInspection(node, child) {
  if (node.type === 'BinaryExpression') {
    return ['instanceof', 'in', '===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(node.operator);
  }
  if (node.type === 'UnaryExpression') return node.operator === 'typeof' || node.operator === '!';
  // a condition position — `if (e.code) …`, `while (e.retryable) …`
  if (TEST_CARRIERS.has(node.type)) return node.test === child;
  return false;
}

// Is this identifier use safe? `ancestors` runs outermost-first and ends at the
// identifier's direct parent.
function isSafeUse(ident, ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    const node = ancestors[i];
    const child = i === ancestors.length - 1 ? ident : ancestors[i + 1];

    // A boundary decides DEFINITIVELY, by argument position. Reaching an unsafe
    // position is a violation even if an outer wrapper is itself a boundary —
    // `setError(userFacingError(userError(e.message), 'x'))` still renders the
    // provider text, because `userError` marked it renderable on the way in.
    const safeArgs = boundarySafeArgs(node);
    if (safeArgs !== null) {
      if (safeArgs === 'all') return true;
      const idx = argIndexOf(node, child);
      return idx >= 0 && safeArgs.includes(idx);
    }

    // being CALLED is not being rendered: e.g. `e.handler()` — but the callee
    // expression itself is not a value that reaches the UI
    if (isCallee(node, child)) return true;

    // bare rethrow: `throw e;`
    if (node.type === 'ThrowStatement' && node.argument === ident) return true;

    // INSPECTION — and only inspection. Each exemption below additionally
    // requires the sub-expression carrying the caught value to be SIDE-EFFECT
    // FREE. Without that requirement the exemptions were positional only, so
    // `if (setError(e.message)) retry();` reached the IfStatement with the whole
    // call as `node.test` and was classified safe — the value had already been
    // rendered by the time the condition was evaluated. The same held for
    // `!setError(e.message)` and `setError(e.message) === 1` via the unary and
    // comparison exemptions. A call is never inspection.
    if (isInspection(node, child) && isSideEffectFree(child)) return true;

    // stop climbing at the handler boundary
    if (node.type === 'CatchClause' || node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') break;
  }
  return false;
}

// ---- catch parameter patterns -------------------------------------------
// `catch (e)` is not the only legal shape. `catch ({ message })` binds the raw
// message directly, and an early return on "param is not an Identifier" skipped
// the ENTIRE handler — raw engine text could reach a render sink while the
// default-deny invariant stayed green. Every binding a pattern introduces is
// extracted; an unrecognised pattern FAILS CLOSED (reported, never skipped).
export function catchBindingNames(param) {
  const names = [];
  let unsupported = '';
  const visitPattern = (node) => {
    if (!node || unsupported) return;
    switch (node.type) {
      case 'Identifier': names.push(node.name); return;
      case 'ObjectPattern':
        for (const prop of node.properties) {
          if (prop.type === 'RestElement') visitPattern(prop.argument);
          else if (prop.type === 'ObjectProperty') visitPattern(prop.value); // key is not a binding
          else unsupported = prop.type;
        }
        return;
      case 'ArrayPattern':
        for (const el of node.elements) if (el) visitPattern(el); // holes bind nothing
        return;
      case 'AssignmentPattern': visitPattern(node.left); return;   // `catch ({ m = '' })`
      case 'RestElement': visitPattern(node.argument); return;
      default: unsupported = node.type;
    }
  };
  visitPattern(param);
  return { names, unsupported };
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
    if (node.type !== 'CatchClause') return;
    if (!node.param) return;                      // `catch {}` binds nothing at all
    const { names, unsupported } = catchBindingNames(node.param);
    if (unsupported) {                            // FAIL CLOSED — never skip a handler
      const line = node.param.loc ? node.param.loc.start.line : 0;
      out.push({ binding: '', name: '', line, snippet: `UNSUPPORTED catch parameter pattern (${unsupported}) — cannot be analysed, so it is reported` });
      return;
    }
    if (!names.length) return;                    // e.g. `catch ([])` — binds nothing
    const binding = names.join('|');
    // Aliases are resolved per bound name, then merged.
    const aliases = new Map();
    for (const n of names) for (const [k, v] of aliasesOf(node.body, n)) aliases.set(k, v);
    // An alias whose every use is safe makes its EXTRACTION safe too, so
    // `const detail = String(e?.error?.message || ''); throw engineError(detail, …)`
    // is not reported. An alias that escapes is reported at both sites.
    const safeAliases = new Set(
      [...aliases.entries()].filter(([name, decl]) => allUsesSafe(node.body, name, decl)).map(([name]) => name),
    );
    const tainted = new Set([...names, ...aliases.keys()]);

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
