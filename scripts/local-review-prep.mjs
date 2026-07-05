// ===================================================================
// local-review-prep — LOCAL tooling only. Generates a compact markdown
// review brief (artifacts/local-review-brief.md) from the current git
// state so Claude/Fable can read a small summary + a mechanical guardrail
// checklist and inspect only the risky files, instead of a full raw diff.
//
// The mechanical layer (git parsing + guardrail checklist + risk buckets)
// is 100% deterministic and NEVER depends on the model. An optional call
// to LOCAL Ollama adds an ADVISORY prose summary; if Ollama is down/slow
// the script still writes the full mechanical brief and says so.
//
// No dependencies, no external APIs, no keys. Ollama is localhost-only.
// Pure helpers are exported for unit tests; the CLI only runs when the
// file is executed directly (guarded at the bottom).
// ===================================================================
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const DEFAULTS = {
  base: 'main',
  out: 'artifacts/local-review-brief.md',
  ollamaUrl: 'http://127.0.0.1:11434',
  model: 'qwen3:14b',
  useModel: true,
  maxDiffChars: 24000, // safe input size for the model; well under qwen3:14b 40K ctx
};

// ---- arg parsing (pure) --------------------------------------------
export function parseArgs(argv, defaults = DEFAULTS) {
  const o = { ...defaults };
  for (const a of argv) {
    if (a === '--no-model') o.useModel = false;
    else if (a.startsWith('--base=')) o.base = a.slice(7);
    else if (a.startsWith('--model=')) o.model = a.slice(8);
    else if (a.startsWith('--out=')) o.out = a.slice(6);
    else if (a.startsWith('--ollama=')) o.ollamaUrl = a.slice(9);
  }
  return o;
}

// ---- git name-status parsing (pure) --------------------------------
// Parses `git diff --name-status` output into [{ status, file }]. Handles
// rename/copy lines (R100\told\tnew) by taking the destination path.
export function parseNameStatus(text) {
  if (typeof text !== 'string') return [];
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const parts = line.split('\t');
    const code = parts[0] || '';
    const status = code[0] || '?';
    const file = parts[parts.length - 1] || '';
    return { status, file };
  }).filter((e) => e.file);
}

// ---- guardrail matchers (pure) -------------------------------------
const has = (files, re) => files.some((f) => re.test(f));

// 100% mechanical checklist. Booleans only — never model-driven.
export function computeGuardrails(files, statusPorcelain = '') {
  const distStaged = /^\s*[AM].*dist-profile\//m.test(statusPorcelain)
    || has(files, /(^|\/)dist-profile\//);
  return {
    appJsx: has(files, /(^|\/)src\/App\.jsx$/),
    routes: has(files, /(^|\/)src\/App\.jsx$/), // routes are declared in App.jsx
    sidebar: has(files, /(^|\/)src\/components\/layout\/(Sidebar\.jsx|sidebarNav\.js)$/),
    packageJson: has(files, /(^|\/)package\.json$/),
    lockfile: has(files, /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/),
    envFile: has(files, /(^|\/)\.env(\.|$)/),
    viteConfig: has(files, /(^|\/)vite(\.[\w-]+)?\.config\.[jt]s$/),
    launchJson: has(files, /(^|\/)\.claude\/launch\.json$/),
    assistantJake: has(files, /(^|\/)src\/(components\/ai\/Assistant\.jsx|lib\/(jakeAgent|jakePack|gemini)\.js)$/),
    growthOs: has(files, /(^|\/)src\/(pages\/growth\/|data\/growth[A-Za-z]*\.js)/),
    studioComfy: has(files, /(^|\/)src\/(pages\/(ImageStudio|WorkflowStudio|AdStudio|Fooocus)\.jsx|components\/studio\/|lib\/(geminiImage|comfyPoster|comfyProgress)\.js|data\/(studio|creativePresets)\.js)/),
    publicProfile: has(files, /(^|\/)(vite\.profile\.config\.js|src\/profile\/|profile\/|.*founding.*)/i),
    creativeV2: has(files, /(^|\/)src\/creative\/v2\//),
    offerImport: has(files, /(^|\/)src\/creative\/v2\/offer\//),
    distProfile: distStaged,
    deps: false, // set by caller from package.json dependency diff
    tests: has(files, /(__tests__\/|\.test\.[jt]sx?$|\.test\.mjs$)/),
  };
}

// A file needs Claude's eyes if it is runtime source or trips a guardrail;
// tests, styles, docs, and tooling are usually routine. Pure.
export function classifyRisk(entries) {
  const inspect = [];
  const routine = [];
  for (const e of entries) {
    const f = e.file;
    const risky = /(^|\/)src\/App\.jsx$/.test(f)
      || /(^|\/)src\/components\/layout\/(Sidebar|sidebarNav)/.test(f)
      || /(^|\/)src\/(components\/ai\/Assistant\.jsx|lib\/(jakeAgent|jakePack|gemini)\.js)$/.test(f)
      || /(^|\/)src\/creative\/v2\/offer\//.test(f)
      || /(^|\/)(package\.json|package-lock\.json|vite[\w.-]*\.config\.[jt]s|\.env)/.test(f)
      || (/(^|\/)src\/.*\.(jsx?|tsx?)$/.test(f) && !/\.test\.|__tests__\//.test(f));
    const clearlyRoutine = /(\.test\.[jt]sx?$|\.test\.mjs$|__tests__\/|\.md$|\.css$|(^|\/)scripts\/|(^|\/)artifacts\/)/.test(f);
    if (risky && !clearlyRoutine) inspect.push(f);
    else routine.push(f);
  }
  return { inspect, routine };
}

// True dependency change: compares the dependencies+devDependencies maps of
// two package.json texts. Ignores scripts/version/other fields (so adding an
// npm script never trips the deps flag). Malformed JSON → false. Pure.
export function depsChanged(baseText, headText) {
  const deps = (t) => {
    try {
      const p = JSON.parse(t);
      return JSON.stringify({ ...(p.dependencies || {}), ...(p.devDependencies || {}) });
    } catch { return null; }
  };
  const b = deps(baseText);
  const h = deps(headText);
  if (b === null || h === null) return false; // can't parse → don't fabricate a stop
  return b !== h;
}

// ---- diff truncation (pure) ----------------------------------------
export function truncateDiff(diff, maxChars = DEFAULTS.maxDiffChars) {
  const text = typeof diff === 'string' ? diff : '';
  if (text.length <= maxChars) return { text, truncated: false, originalLength: text.length };
  return {
    text: `${text.slice(0, maxChars)}\n\n[...TRUNCATED — ${text.length - maxChars} more chars omitted...]`,
    truncated: true,
    originalLength: text.length,
  };
}

// ---- Ollama advisory section formatting (pure) ---------------------
export function formatOllamaSection(result) {
  if (result && result.ok && result.text) {
    return `## Local Model Advisory Summary\n\n> Advisory only — generated by a LOCAL model (${result.model}). Claude/Fable remains the final reviewer for architecture, security, and merge approval.\n\n${result.text.trim()}\n`;
  }
  const why = (result && result.reason) ? ` (${result.reason})` : '';
  return `## Local Model Advisory Summary\n\n_Ollama summary unavailable${why} — mechanical brief above is complete and authoritative for guardrails._\n`;
}

// ---- checklist rendering (pure) ------------------------------------
const yn = (b) => (b ? 'YES' : 'NO');

export function renderChecklist(g) {
  return [
    `- App.jsx changed: ${yn(g.appJsx)}`,
    `- Routes changed: ${yn(g.routes)}`,
    `- Sidebar changed: ${yn(g.sidebar)}`,
    `- package.json changed: ${yn(g.packageJson)}`,
    `- Lockfile changed: ${yn(g.lockfile)}`,
    `- .env changed: ${yn(g.envFile)}`,
    `- Vite config changed: ${yn(g.viteConfig)}`,
    `- .claude/launch.json changed: ${yn(g.launchJson)}`,
    `- Assistant/Jake files changed: ${yn(g.assistantJake)}`,
    `- Growth OS changed: ${yn(g.growthOs)}`,
    `- Studio/ComfyUI changed: ${yn(g.studioComfy)}`,
    `- public-profile/campaign touched: ${yn(g.publicProfile)}`,
    `- Creative V2 touched: ${yn(g.creativeV2)}`,
    `- Imports from creative/v2/offer likely: ${yn(g.offerImport)}`,
    `- dist-profile committed/staged: ${yn(g.distProfile)}`,
    `- Dependencies changed: ${yn(g.deps)}`,
    `- Tests added/changed: ${yn(g.tests)}`,
  ].join('\n');
}

// A compact verdict from the mechanical checklist alone. Pure.
export function reviewVerdict(g, fileCount) {
  const stop = g.envFile || g.distProfile || g.deps || g.lockfile;
  const heavy = g.appJsx || g.routes || g.sidebar || g.assistantJake || g.viteConfig || g.publicProfile;
  if (stop) return { level: 'STOP', label: 'Stop and inspect manually — high-risk change detected (.env / deps / lockfile / dist-profile).' };
  if (heavy || fileCount > 25) return { level: 'FULL', label: 'Needs full Claude review — touches app-critical or wide-surface areas.' };
  return { level: 'COMPACT', label: 'Safe for compact Claude review — no high-risk guardrails tripped.' };
}

// ---- brief assembly (pure) -----------------------------------------
export function buildBrief(data) {
  const {
    timestamp, branch, commit, base, status, entries, diffStat,
    guardrails, risk, verdict, ollamaSection, truncated,
  } = data;
  const changedTable = entries.length
    ? entries.map((e) => `- \`${e.status}\` ${e.file}`).join('\n')
    : '_No changed files detected vs base._';
  const inspectList = risk.inspect.length ? risk.inspect.map((f) => `- ${f}`).join('\n') : '_None flagged._';
  const routineList = risk.routine.length ? risk.routine.map((f) => `- ${f}`).join('\n') : '_None._';
  const truncNote = truncated ? '\n> ⚠️ Raw diff was TRUNCATED for the model — inspect the flagged files directly rather than trusting a full-diff summary.\n' : '';

  return `# Local Review Brief

Generated: ${timestamp}
Repo: natanMeT/ArtValue20
Branch: ${branch}
Commit: ${commit}
Base: ${base}

> Local tooling output. The mechanical guardrail checklist below is deterministic and authoritative. The model summary (if present) is advisory only — Claude/Fable remains the final reviewer.
${truncNote}
## Status

\`\`\`
${status.trim() || '(clean working tree)'}
\`\`\`

## Changed Files (${entries.length})

${changedTable}

## Diff Stat

\`\`\`
${diffStat.trim() || '(no diff vs base)'}
\`\`\`

## Mechanical Guardrail Checklist

${renderChecklist(guardrails)}

## Risk Classification

**Verdict: ${verdict.level}** — ${verdict.label}

### Files Claude should inspect

${inspectList}

### Files likely safe / routine

${routineList}

### Stop Conditions

${verdict.level === 'STOP'
  ? '- One or more high-risk guardrails tripped (.env / dependencies / lockfile / dist-profile). Do NOT do a compact review — inspect manually first.'
  : '- No hard stop conditions detected by the mechanical checklist.'}

${ollamaSection}
## Recommended Claude Review Input

Paste this to Claude:

\`\`\`
Review the branch "${branch}" (${entries.length} changed files vs ${base}). Mechanical verdict: ${verdict.level}.
Inspect these files: ${risk.inspect.join(', ') || '(none flagged)'}.
Guardrails tripped: ${Object.entries(guardrails).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}.
The local model summary is advisory only; make the final call yourself.
\`\`\`
`;
}

// ---- side-effecting helpers (not unit-tested; smoke via CLI) -------
function git(args) {
  try { return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
  catch { return ''; }
}

async function callOllama(opts, prompt) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(`${opts.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: 'You are a concise code-review assistant. Output plain markdown, no preamble. You are advisory only; a senior reviewer makes the final call.' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        think: false,
        options: { temperature: 0.2, num_predict: 700 },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, reason: `http ${res.status}` };
    const j = await res.json();
    const text = j?.message?.content || '';
    if (!text.trim()) return { ok: false, reason: 'empty response' };
    return { ok: true, text, model: opts.model };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, reason: e.name === 'AbortError' ? 'timeout' : 'engine unreachable' };
  }
}

function modelPrompt(entries, diffTrunc) {
  return `Summarize this git diff for a senior reviewer. Produce, in this order:
1. Compact diff summary (3-6 bullets).
2. Likely risk areas.
3. Suggested reviewer focus (specific files).
4. Files that look routine.
5. A warning if the diff was truncated.

Changed files:
${entries.map((e) => `${e.status} ${e.file}`).join('\n')}

Diff${diffTrunc.truncated ? ' (TRUNCATED)' : ''}:
${diffTrunc.text || '(empty)'}`;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const opts = parseArgs(process.argv.slice(2));

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim() || '(detached)';
  const commit = git(['rev-parse', '--short', 'HEAD']).trim() || '(unknown)';
  const status = git(['status', '--porcelain']);

  // Prefer branch-vs-base diff; fall back to working-tree diff if empty.
  let nameStatus = git(['diff', '--name-status', `${opts.base}...HEAD`]);
  let diffStat = git(['diff', '--stat', `${opts.base}...HEAD`]);
  let rawDiff = git(['diff', `${opts.base}...HEAD`]);
  if (!nameStatus.trim()) {
    nameStatus = git(['diff', '--name-status', 'HEAD']);
    diffStat = git(['diff', '--stat', 'HEAD']);
    rawDiff = git(['diff', 'HEAD']);
  }

  const entries = parseNameStatus(nameStatus);
  const files = entries.map((e) => e.file);
  const guardrails = computeGuardrails(files, status);
  // Dependency change = package.json's dependency maps actually differ (adding
  // an npm script must NOT trip this). Compares base vs current package.json.
  if (guardrails.packageJson) {
    const basePkg = git(['show', `${opts.base}:package.json`]);
    const headPkg = readFileSync(resolve(root, 'package.json'), 'utf8');
    guardrails.deps = depsChanged(basePkg, headPkg);
  }
  const risk = classifyRisk(entries);
  const verdict = reviewVerdict(guardrails, entries.length);
  const diffTrunc = truncateDiff(rawDiff, opts.maxDiffChars);

  let ollama = { ok: false, reason: 'skipped (--no-model)' };
  if (opts.useModel && entries.length) {
    process.stdout.write(`Calling local Ollama (${opts.model})… `);
    ollama = await callOllama(opts, modelPrompt(entries, diffTrunc));
    process.stdout.write(ollama.ok ? 'done.\n' : `unavailable (${ollama.reason}).\n`);
  }

  const brief = buildBrief({
    timestamp: new Date().toISOString(),
    branch, commit, base: opts.base, status, entries, diffStat,
    guardrails, risk, verdict,
    ollamaSection: formatOllamaSection(ollama),
    truncated: diffTrunc.truncated,
  });

  const outPath = resolve(root, opts.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, brief, 'utf8');
  process.stdout.write(`Wrote ${opts.out} — verdict: ${verdict.level} (${entries.length} files).\n`);
}

// Run only when executed directly (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => { process.stderr.write(`local-review-prep failed: ${e.message}\n`); process.exit(1); });
}
