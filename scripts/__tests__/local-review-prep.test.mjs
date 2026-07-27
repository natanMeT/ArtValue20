import { describe, it, expect } from 'vitest';
import {
  parseArgs, parseNameStatus, computeGuardrails, classifyRisk,
  truncateDiff, formatOllamaSection, renderChecklist, reviewVerdict, buildBrief, depsChanged,
} from '../local-review-prep.mjs';

// ===================================================================
// local-review-prep — pure-helper coverage. No git, no Ollama, no fs.
// Every assertion is over deterministic string/array input.
// ===================================================================

describe('parseArgs', () => {
  it('applies defaults and flags', () => {
    expect(parseArgs([]).base).toBe('main');
    expect(parseArgs(['--base=dev']).base).toBe('dev');
    expect(parseArgs(['--no-model']).useModel).toBe(false);
    expect(parseArgs(['--model=aya-expanse:8b']).model).toBe('aya-expanse:8b');
    expect(parseArgs(['--out=x.md']).out).toBe('x.md');
    expect(parseArgs([]).useModel).toBe(true);
  });
});

describe('parseNameStatus', () => {
  it('parses statuses and rename destinations', () => {
    const text = 'M\tsrc/App.jsx\nA\tsrc/new.js\nR100\told/name.js\tnew/name.js';
    expect(parseNameStatus(text)).toEqual([
      { status: 'M', file: 'src/App.jsx' },
      { status: 'A', file: 'src/new.js' },
      { status: 'R', file: 'new/name.js' },
    ]);
  });
  it('is safe on empty / non-string', () => {
    expect(parseNameStatus('')).toEqual([]);
    expect(parseNameStatus(null)).toEqual([]);
    expect(parseNameStatus(undefined)).toEqual([]);
  });
});

describe('computeGuardrails — mechanical detection', () => {
  it('flags App.jsx + routes', () => {
    const g = computeGuardrails(['src/App.jsx']);
    expect(g.appJsx).toBe(true);
    expect(g.routes).toBe(true);
  });
  it('flags sidebar files', () => {
    expect(computeGuardrails(['src/components/layout/Sidebar.jsx']).sidebar).toBe(true);
    expect(computeGuardrails(['src/components/layout/sidebarNav.js']).sidebar).toBe(true);
  });
  it('flags Assistant / Jake files', () => {
    for (const f of ['src/components/ai/Assistant.jsx', 'src/lib/jakeAgent.js', 'src/lib/jakePack.js', 'src/lib/gemini.js']) {
      expect(computeGuardrails([f]).assistantJake).toBe(true);
    }
  });
  it('flags package.json and lockfile distinctly', () => {
    expect(computeGuardrails(['package.json']).packageJson).toBe(true);
    expect(computeGuardrails(['package.json']).lockfile).toBe(false);
    expect(computeGuardrails(['package-lock.json']).lockfile).toBe(true);
  });
  it('flags .env, vite config, launch.json', () => {
    expect(computeGuardrails(['.env']).envFile).toBe(true);
    expect(computeGuardrails(['.env.local']).envFile).toBe(true);
    expect(computeGuardrails(['vite.config.js']).viteConfig).toBe(true);
    expect(computeGuardrails(['vite.profile.config.js']).viteConfig).toBe(true);
    expect(computeGuardrails(['.claude/launch.json']).launchJson).toBe(true);
  });
  it('flags Growth OS, Studio/ComfyUI, Creative V2 + offer imports', () => {
    expect(computeGuardrails(['src/pages/growth/Calls.jsx']).growthOs).toBe(true);
    expect(computeGuardrails(['src/data/growthCalls.js']).growthOs).toBe(true);
    expect(computeGuardrails(['src/lib/hostedImage.js']).studioCreative).toBe(true);
    expect(computeGuardrails(['src/pages/ImageStudio.jsx']).studioCreative).toBe(true);
    expect(computeGuardrails(['src/creative/v2/campaignStore.js']).creativeV2).toBe(true);
    expect(computeGuardrails(['src/creative/v2/offer/offerActions.js']).offerImport).toBe(true);
  });
  it('detects dist-profile only when staged/committed, from files or porcelain', () => {
    expect(computeGuardrails(['dist-profile/index.html']).distProfile).toBe(true);
    expect(computeGuardrails([], 'A  dist-profile/index.html').distProfile).toBe(true);
    // untracked dist-profile in porcelain (??) is NOT a committed/staged change
    expect(computeGuardrails([], '?? dist-profile/').distProfile).toBe(false);
  });
  it('flags tests; leaves everything false for an unrelated tooling file', () => {
    expect(computeGuardrails(['scripts/__tests__/x.test.mjs']).tests).toBe(true);
    const g = computeGuardrails(['scripts/local-review-prep.mjs']);
    expect(g.appJsx || g.routes || g.sidebar || g.assistantJake || g.growthOs
      || g.studioCreative || g.creativeV2 || g.envFile || g.distProfile || g.deps).toBe(false);
  });
});

describe('depsChanged — adding an npm script must NOT count as a dependency change', () => {
  const base = JSON.stringify({ scripts: { test: 'vitest' }, dependencies: { react: '^18' }, devDependencies: { vite: '^5' } });
  it('ignores scripts/version changes', () => {
    const head = JSON.stringify({ scripts: { test: 'vitest', 'local:review-prep': 'node x.mjs' }, version: '2.0.0', dependencies: { react: '^18' }, devDependencies: { vite: '^5' } });
    expect(depsChanged(base, head)).toBe(false);
  });
  it('detects a real added / bumped dependency', () => {
    expect(depsChanged(base, JSON.stringify({ dependencies: { react: '^18', axios: '^1' }, devDependencies: { vite: '^5' } }))).toBe(true);
    expect(depsChanged(base, JSON.stringify({ dependencies: { react: '^19' }, devDependencies: { vite: '^5' } }))).toBe(true);
  });
  it('malformed JSON → false (never fabricates a stop)', () => {
    expect(depsChanged('not json', base)).toBe(false);
    expect(depsChanged(base, '{bad')).toBe(false);
  });
});

describe('classifyRisk', () => {
  it('routes runtime source to inspect and tests/styles/scripts to routine', () => {
    const { inspect, routine } = classifyRisk([
      { status: 'M', file: 'src/App.jsx' },
      { status: 'M', file: 'src/lib/foo.js' },
      { status: 'A', file: 'src/lib/__tests__/foo.test.js' },
      { status: 'M', file: 'src/styles/app.css' },
      { status: 'A', file: 'scripts/local-review-prep.mjs' },
      { status: 'M', file: 'README.md' },
    ]);
    expect(inspect).toContain('src/App.jsx');
    expect(inspect).toContain('src/lib/foo.js');
    expect(routine).toEqual(expect.arrayContaining([
      'src/lib/__tests__/foo.test.js', 'src/styles/app.css', 'scripts/local-review-prep.mjs', 'README.md',
    ]));
    expect(inspect).not.toContain('src/styles/app.css');
  });
});

describe('truncateDiff', () => {
  it('passes through small diffs untouched', () => {
    const r = truncateDiff('abc', 100);
    expect(r.truncated).toBe(false);
    expect(r.text).toBe('abc');
  });
  it('truncates and marks large diffs', () => {
    const r = truncateDiff('x'.repeat(500), 100);
    expect(r.truncated).toBe(true);
    expect(r.text).toContain('TRUNCATED');
    expect(r.originalLength).toBe(500);
  });
  it('is safe on non-string', () => {
    expect(truncateDiff(null, 10).truncated).toBe(false);
  });
});

describe('formatOllamaSection — advisory + offline fallback', () => {
  it('renders model text with advisory framing', () => {
    const s = formatOllamaSection({ ok: true, text: 'summary here', model: 'qwen3:14b' });
    expect(s).toContain('Local Model Advisory Summary');
    expect(s).toContain('Advisory only');
    expect(s).toContain('summary here');
    expect(s).toContain('qwen3:14b');
  });
  it('renders unavailable fallback with reason', () => {
    const s = formatOllamaSection({ ok: false, reason: 'timeout' });
    expect(s).toContain('Ollama summary unavailable');
    expect(s).toContain('timeout');
  });
  it('never throws on missing input', () => {
    expect(formatOllamaSection(null)).toContain('unavailable');
    expect(formatOllamaSection(undefined)).toContain('unavailable');
  });
});

describe('reviewVerdict', () => {
  const base = computeGuardrails([]);
  it('STOP on .env / deps / lockfile / dist-profile', () => {
    expect(reviewVerdict({ ...base, envFile: true }, 1).level).toBe('STOP');
    expect(reviewVerdict({ ...base, deps: true }, 1).level).toBe('STOP');
    expect(reviewVerdict({ ...base, distProfile: true }, 1).level).toBe('STOP');
  });
  it('FULL on app-critical surface or many files', () => {
    expect(reviewVerdict({ ...base, appJsx: true, routes: true }, 1).level).toBe('FULL');
    expect(reviewVerdict({ ...base, assistantJake: true }, 1).level).toBe('FULL');
    expect(reviewVerdict(base, 40).level).toBe('FULL');
  });
  it('COMPACT for small low-risk changes', () => {
    expect(reviewVerdict({ ...base, tests: true }, 3).level).toBe('COMPACT');
  });
});

describe('renderChecklist + buildBrief', () => {
  it('renders every checklist line as YES/NO', () => {
    const out = renderChecklist(computeGuardrails(['src/App.jsx']));
    expect(out).toContain('App.jsx changed: YES');
    expect(out).toContain('.env changed: NO');
    expect(out.split('\n').length).toBe(17);
  });
  it('assembles a complete brief with all sections', () => {
    const entries = [{ status: 'M', file: 'src/App.jsx' }];
    const g = computeGuardrails(['src/App.jsx']);
    const md = buildBrief({
      timestamp: '2026-07-06T00:00:00Z',
      branch: 'feat/x', commit: 'abc1234', base: 'main',
      status: 'M src/App.jsx', entries, diffStat: '1 file changed',
      guardrails: g, risk: classifyRisk(entries), verdict: reviewVerdict(g, 1),
      ollamaSection: formatOllamaSection({ ok: false, reason: 'timeout' }),
      truncated: false,
    });
    expect(md).toContain('# Local Review Brief');
    expect(md).toContain('## Mechanical Guardrail Checklist');
    expect(md).toContain('## Risk Classification');
    expect(md).toContain('Recommended Claude Review Input');
    expect(md).toContain('feat/x');
    expect(md).toContain('Verdict: FULL');
  });
  it('marks truncation warning in the brief header', () => {
    const entries = [{ status: 'M', file: 'src/lib/foo.js' }];
    const g = computeGuardrails(['src/lib/foo.js']);
    const md = buildBrief({
      timestamp: 't', branch: 'b', commit: 'c', base: 'main',
      status: '', entries, diffStat: '', guardrails: g,
      risk: classifyRisk(entries), verdict: reviewVerdict(g, 1),
      ollamaSection: formatOllamaSection({ ok: false }), truncated: true,
    });
    expect(md).toContain('TRUNCATED');
  });
});
