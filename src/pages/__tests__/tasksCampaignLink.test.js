import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ===================================================================
// Campaigns slice 3 — surfacing the OPTIONAL task → campaign link.
//
// SCOPE OF THESE TESTS, STATED HONESTLY. This repo has no jsdom and no
// @testing-library, so a React component cannot be rendered here; the page-test
// convention is source pinning (see tasksBetaContainment.test.js). Source pins
// are WEAKER than execution — PR #152 replaced exactly this kind of pin for
// api.deleteCharge after finding it had never run the function.
//
// So the load is split deliberately:
//   * the DATA CONTRACT — the '' → null coercion, the mapping, the hydration,
//     the import regression guard — is EXECUTED in
//     src/lib/__tests__/apiTaskMapping.test.js against the real functions.
//   * only the JSX WIRING that cannot be executed without a DOM is pinned here.
// ===================================================================
const tasksSrc = readFileSync(fileURLToPath(new URL('../Tasks.jsx', import.meta.url)), 'utf8');
const modalSrc = readFileSync(fileURLToPath(new URL('../../components/forms/TaskModal.jsx', import.meta.url)), 'utf8');

describe('TaskModal.jsx — the campaign picker follows the clients precedent', () => {
  it('campaigns is an OPTIONAL prop defaulting to [] (so ProjectDetail stays untouched)', () => {
    expect(/campaigns = \[\]/.test(modalSrc)).toBe(true);
  });

  it('the picker renders ONLY when campaigns exist — never an empty control', () => {
    expect(modalSrc.includes('{campaigns.length > 0 && (')).toBe(true);
  });

  it('the empty option is a real "no campaign" choice with an empty value', () => {
    expect(modalSrc.includes('<option value="">ללא קמפיין</option>')).toBe(true);
  });

  it('THE TRAP: submit coerces a blank selection to null, never sending an empty string', () => {
    const m = modalSrc.match(/const submit = \(\) => \{([\s\S]*?)\n  \};/);
    expect(m, 'submit present').not.toBe(null);
    expect(m[1].includes('campaignId: form.campaignId || null')).toBe(true);
  });

  it('the campaign option is labelled by title (the campaigns row shape has no `name`)', () => {
    expect(/campaigns\.map\(\(c\) => <option key=\{c\.id\} value=\{c\.id\}>\{c\.title\}<\/option>\)/.test(modalSrc)).toBe(true);
  });
});

describe('Tasks.jsx — page-local, fail-soft campaign load', () => {
  it('fetches campaigns on the page, NOT through fetchAll (hydration stays untouched)', () => {
    expect(tasksSrc.includes('listCampaigns')).toBe(true);
    expect(tasksSrc.includes('useEffect')).toBe(true);
  });

  it('skips the fetch entirely in local/demo mode (campaigns are cloud-only)', () => {
    const m = tasksSrc.match(/const loadCampaigns = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[\]\);/);
    expect(m, 'loadCampaigns present').not.toBe(null);
    expect(m[1].includes('if (!isSupabaseConfigured) return;')).toBe(true);
  });

  it('FAIL-SOFT: a rejected load degrades to an empty list and never throws at the page', () => {
    const m = tasksSrc.match(/const loadCampaigns = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[\]\);/);
    expect(m[1].includes('catch')).toBe(true);
    expect(m[1].includes('setCampaigns([])')).toBe(true);
  });

  it('the load never blocks or gates a task mutation (no await in save/setStatus/remove)', () => {
    for (const fn of ['save', 'setStatus', 'remove']) {
      const m = tasksSrc.match(new RegExp(`const ${fn} = async \\([^)]*\\) => \\{([\\s\\S]*?)\\n  \\};`));
      expect(m, `${fn} present`).not.toBe(null);
      expect(m[1].includes('loadCampaigns')).toBe(false);
      expect(m[1].includes('listCampaigns')).toBe(false);
    }
  });

  it('passes the list into TaskModal so the picker can appear', () => {
    expect(tasksSrc.includes('campaigns={campaigns}')).toBe(true);
  });

  it('the campaign column and its cell are BOTH gated on the same condition', () => {
    const headerGated = tasksSrc.includes('{campaigns.length > 0 && <th>קמפיין</th>}');
    const cellGated = tasksSrc.includes('{campaigns.length > 0 && <td className="muted">{campaignName(t.campaignId)}</td>}');
    expect(headerGated).toBe(true);
    expect(cellGated).toBe(true); // a mismatch here would shift every column in the row
  });

  it('an unlinked task, and one whose campaign was deleted, both read the same dash', () => {
    // The FK is `on delete set null`, so a deleted campaign leaves campaignId
    // null; an id that no longer resolves also falls through to '—'.
    expect(tasksSrc.includes("campaigns.find((c) => c.id === id)?.title || '—'")).toBe(true);
  });
});

describe('Campaigns slice 3 — scope discipline', () => {
  it('Jake bulk task creation is NOT given a campaign picker by this slice', () => {
    // buildBulkTaskRows forcing campaign_id to null is asserted (executed) in
    // apiTaskMapping.test.js; this pins that the Tasks page did not grow a
    // Jake-facing campaign control.
    expect(tasksSrc.includes('buildBulkTaskRows')).toBe(false);
  });

  it('ProjectDetail is not referenced or modified by the Tasks campaign wiring', () => {
    expect(tasksSrc.includes('ProjectDetail')).toBe(false);
  });
});
