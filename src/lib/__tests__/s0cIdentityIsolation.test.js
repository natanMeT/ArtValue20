import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { activePack } from '../jakePack.js';
import { executeActions } from '../jakeAgent.js';
import { JAKE_PACK_PERSONA } from '../../../supabase/functions/ai-gateway/actionProfiles.ts';

// ===================================================================
// S0C — Identity & User-Isolation Trust Hardening: source + content guards.
//
// Repo test convention: pure-function tests + SOURCE-GUARD tests (read the
// real source files and pin the load-bearing facts). These guards prove the
// locked S0C product decisions and keep them from regressing:
//   * no hardcoded person identity in the active cloud UI surfaces;
//   * per-user (user.id-scoped) Jake chat + daily-brief keys;
//   * the legacy device-global keys are never read/migrated/deleted;
//   * generic Jake persona (frontend + server, drift-guarded elsewhere);
//   * signature-neutral drafting (frontend guide + server profile);
//   * frozen contained pages (Projects/Templates) deliberately NOT touched.
// ===================================================================

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const topbar = read('../../components/layout/Topbar.jsx');
const dashboard = read('../../pages/Dashboard.jsx');
const tasksPage = read('../../pages/Tasks.jsx');
const taskModal = read('../../components/forms/TaskModal.jsx');
const assistant = read('../../components/ai/Assistant.jsx');
const jakePackSrc = read('../jakePack.js');
const actionProfilesSrc = read('../../../supabase/functions/ai-gateway/actionProfiles.ts');

const HARD_NAME = 'נתן';           // the previously hardcoded person
const FULL_NAME = 'נתן תורג';      // full-name prefix (both apostrophe variants)
const PERSONAL_CLAIM = 'העוזר האישי של נתן';
const FORCED_SIGNATURE = 'חתום בשם נתן';

describe('S0C · no hardcoded person identity in active cloud UI surfaces', () => {
  it('Topbar has no hardcoded name/role and renders session identity', () => {
    expect(topbar.includes(FULL_NAME)).toBe(false);
    expect(topbar.includes(HARD_NAME)).toBe(false);
    expect(topbar.includes('מנהל מערכת')).toBe(false);
    // session-derived rendering
    expect(topbar.includes('resolveDisplayName')).toBe(true);
    expect(topbar.includes('avatarInitial')).toBe(true);
    expect(topbar.includes('{displayName}')).toBe(true);
    expect(topbar.includes('session.user.email')).toBe(true); // secondary line = session email
  });

  it('Dashboard greeting + assignee follow the signed-in account', () => {
    expect(dashboard.includes(HARD_NAME)).toBe(false);
    expect(dashboard.includes('ברוך שובך, {displayName}')).toBe(true);
    expect(dashboard.includes('resolveDisplayName')).toBe(true);
    expect(dashboard.includes('avatarInitial(session)')).toBe(true);
  });

  it('TaskModal: neutral empty assignee + session-driven default for NEW tasks only', () => {
    expect(taskModal.includes(HARD_NAME)).toBe(false);
    expect(taskModal.includes("assignee: ''")).toBe(true);            // neutral base
    expect(taskModal.includes('defaultAssignee = ')).toBe(true);      // prop with neutral default
    expect(taskModal.includes('assignee: defaultAssignee')).toBe(true); // seeds only the new-task branch
  });

  it('Tasks page passes the resolved display name as the default assignee', () => {
    expect(tasksPage.includes(HARD_NAME)).toBe(false);
    expect(tasksPage.includes('defaultAssignee={resolveDisplayName(session)}')).toBe(true);
  });

  it('Assistant carries no hardcoded person (greeting, creative user, comments)', () => {
    expect(assistant.includes(HARD_NAME)).toBe(false);
    expect(assistant.includes('${greet}, ${displayName}!')).toBe(true);
    expect(assistant.includes('user: displayName')).toBe(true);
  });
});

describe('S0C · per-user Jake state isolation (localStorage scoping)', () => {
  it('chat + daily-brief keys derive through userScopeKey(user.id)', () => {
    expect(assistant.includes("const CHAT_KEY_BASE = 'artvalue_jake_chat'")).toBe(true);
    expect(assistant.includes("const BRIEF_DATE_KEY_BASE = 'artvalue_jake_brief_date'")).toBe(true);
    expect(assistant.includes('userScopeKey(CHAT_KEY_BASE, session)')).toBe(true);
    expect(assistant.includes('userScopeKey(BRIEF_DATE_KEY_BASE, session)')).toBe(true);
  });

  it('every localStorage access goes through the scoped keys — never a bare legacy literal', () => {
    // No direct localStorage call may use a quoted artvalue_jake_* literal.
    expect(/localStorage\.(getItem|setItem|removeItem)\(\s*['"`]artvalue_jake_/.test(assistant)).toBe(false);
    // The scoped variables are actually used for read, write, clear and the brief marker.
    expect(assistant.includes('localStorage.getItem(chatKey)')).toBe(true);
    expect(assistant.includes('localStorage.setItem(chatKey')).toBe(true);
    expect(assistant.includes('localStorage.removeItem(chatKey)')).toBe(true);
    expect(assistant.includes('localStorage.getItem(briefDateKey)')).toBe(true);
    expect(assistant.includes('localStorage.setItem(briefDateKey')).toBe(true);
  });

  it('legacy device-global keys are never read, migrated or deleted', () => {
    // The bare legacy literals may appear ONLY in comments or in the two
    // *_BASE constant definitions — never in any other executable line
    // (i.e. no code path reads/copies/removes the legacy keys).
    const offending = assistant
      .split('\n')
      .filter((line) => /'artvalue_jake_(chat|brief_date)'/.test(line))
      .filter((line) => !line.trim().startsWith('//') && !line.includes('KEY_BASE ='));
    expect(offending).toEqual([]);
  });

  it('the account-switch save guard precedes the loader (no cross-account write)', () => {
    const guard = assistant.indexOf('chatKeyRef.current !== chatKey'); // save-effect guard
    const loader = assistant.indexOf('chatKeyRef.current === chatKey'); // loader early-return
    expect(guard).toBeGreaterThan(-1);
    expect(loader).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(loader);
  });
});

describe('S0C · generic Jake persona + signature-neutral drafting', () => {
  it('frontend pack persona holds no personal-assistant-of-one-person claim', () => {
    expect(activePack.persona.includes(PERSONAL_CLAIM)).toBe(false);
    expect(activePack.persona.includes(HARD_NAME)).toBe(false);
    expect(activePack.persona.includes('אתה ג׳יק')).toBe(true); // Jake stays the product name
  });

  it('server chat persona is generic too (byte-equality with the pack is drift-guarded elsewhere)', () => {
    expect(JAKE_PACK_PERSONA.includes(PERSONAL_CLAIM)).toBe(false);
    expect(JAKE_PACK_PERSONA.includes(HARD_NAME)).toBe(false);
    // Do not weaken the existing drift guard — re-assert equality here as well.
    expect(JAKE_PACK_PERSONA === activePack.persona).toBe(true);
  });

  it('frontend drafting guide never forces a personal signature', () => {
    expect(activePack.draftingGuide.includes(FORCED_SIGNATURE)).toBe(false);
    expect(activePack.draftingGuide.includes(HARD_NAME)).toBe(false);
    expect(activePack.draftingGuide.includes('אל תחתום בשם אדם ספציפי')).toBe(true);
  });

  it('server draft profile (jake.draft_message) never forces a personal signature', () => {
    expect(actionProfilesSrc.includes(FORCED_SIGNATURE)).toBe(false);
    expect(actionProfilesSrc.includes(PERSONAL_CLAIM)).toBe(false);
    expect(actionProfilesSrc.includes(HARD_NAME)).toBe(false);
    expect(actionProfilesSrc.includes('אל תחתום בשם אדם ספציפי')).toBe(true);
  });

  it('jakePack has no remaining hardcoded person anywhere', () => {
    expect(jakePackSrc.includes(HARD_NAME)).toBe(false);
  });
});

describe('S0C · Jake add_task assignee follows the active account (PR #100 blocker fix)', () => {
  const emptyData = { clients: [], projects: [], tasks: [], inventory: [], quotes: [], transactions: [], outreachLeads: [] };
  const run = (action) => {
    const dispatched = [];
    executeActions([action], emptyData, (a) => { dispatched.push(a); });
    return dispatched.find((d) => d.type === 'ADD_TASK')?.payload;
  };

  it('explicit user-supplied assignee is preserved unchanged', () => {
    expect(run({ op: 'add_task', title: 'משימה', assignee: 'דנה לוי' }).assignee).toBe('דנה לוי');
  });

  it('omitted assignee falls back to the locked NEUTRAL name — never a hardcoded person', () => {
    const p = run({ op: 'add_task', title: 'משימה' });
    expect(p.assignee).toBe('משתמש');
    expect(p.assignee).not.toBe('נתן');
  });

  it('an enriched action (as Assistant produces for the active account) persists that exact name', () => {
    // Assistant enriches un-assigned add_task with the session displayName;
    // the handler must persist it verbatim (accounts never share a fallback).
    expect(run({ op: 'add_task', title: 'משימה', assignee: 'Account B' }).assignee).toBe('Account B');
    expect(run({ op: 'add_task', title: 'משימה', assignee: 'Account A' }).assignee).toBe('Account A');
  });

  it('no active Jake task path contains a literal hardcoded person', () => {
    const jakeAgentSrc = read('../jakeAgent.js');
    expect(jakeAgentSrc.includes(HARD_NAME)).toBe(false);
  });

  it('Assistant enriches BEFORE the proposal card — approved == persisted', () => {
    // Enrichment exists, targets only un-assigned add_task, uses the session
    // displayName, and the SAME enriched array feeds describeActions + the
    // preview card that approvePreview later executes.
    expect(assistant.includes("a.op === 'add_task'")).toBe(true);
    expect(assistant.includes('assignee: displayName')).toBe(true);
    expect(assistant.includes('describeActions(enrichedActions, data)')).toBe(true);
    expect(assistant.includes('preview: { actions: enrichedActions, items }')).toBe(true);
    // no un-enriched proposal path remains
    expect(assistant.includes('preview: { actions: allowedActions')).toBe(false);
    // the enrichment is conditional on a MISSING explicit assignee only
    expect(assistant.includes("!(typeof a.assignee === 'string' && a.assignee.trim())")).toBe(true);
  });
});

describe('S0C · frozen contained pages deliberately untouched', () => {
  it('Projects.jsx and Templates.jsx keep their pre-S0C content (dead behind BetaUnavailable)', () => {
    // These pages are FROZEN + hidden in cloud beta; S0C must not edit them.
    // Their legacy hardcoded assignee stays as-is and is unreachable in beta.
    const projects = read('../../pages/Projects.jsx');
    const templates = read('../../pages/Templates.jsx');
    expect(projects.includes("assignee: 'נתן'")).toBe(true);
    expect(templates.includes("assignee: 'נתן'")).toBe(true);
  });
});
