import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ===================================================================
// Campaign delete safety — the confirmation before an irreversible unlink.
//
// WHY THIS SLICE EXISTS. `deleteCampaign` used to run straight from the
// button's onClick. Combined with the FK's `on delete set null (campaign_id)`,
// one click deleted a campaign AND silently unlinked every task attached to it,
// with no warning and no undo.
//
// SCOPE OF THESE TESTS, STATED HONESTLY. No jsdom / @testing-library in this
// repo, so the JSX cannot be rendered; the page-test convention is source
// pinning, which is weaker than execution. The part that actually computes
// something — countTasksForCampaign — is EXECUTED in
// src/lib/__tests__/campaigns.test.js. Only the wiring is pinned here.
// ===================================================================
const src = readFileSync(fileURLToPath(new URL('../Campaigns.jsx', import.meta.url)), 'utf8');

describe('Campaigns.jsx — delete goes through a confirmation', () => {
  it('the מחק button no longer deletes inline; it opens the confirmation', () => {
    // The defect being guarded: onClick={() => run(() => deleteCampaign(c.id), ...)}
    expect(/onClick=\{\(\) => run\(\(\) => deleteCampaign/.test(src)).toBe(false);
    expect(src.includes('onClick={() => setToDelete(c)}')).toBe(true);
  });

  it('ConfirmDialog is wired to the pending campaign', () => {
    expect(src.includes("import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'")).toBe(true);
    expect(src.includes('open={!!toDelete}')).toBe(true);
    expect(src.includes('onConfirm={confirmDelete}')).toBe(true);
    expect(src.includes('onClose={() => setToDelete(null)}')).toBe(true);
  });

  it('the delete still happens after confirmation — this is a warning, NOT a gate', () => {
    const m = src.match(/const confirmDelete = \(\) => \{([\s\S]*?)\n  \};/);
    expect(m, 'confirmDelete present').not.toBe(null);
    expect(m[1].includes('deleteCampaign(toDelete.id)')).toBe(true);
    // No count-based refusal anywhere: a client-side count cannot enforce, so
    // it must never disable the button or short-circuit the delete.
    expect(/linkedCount\s*(>|>=|===|!==)\s*\d+\s*\)\s*return/.test(m[1])).toBe(false);
    expect(/disabled=\{[^}]*linkedCount/.test(src)).toBe(false);
  });

  it('the dialog is closed explicitly on confirm, not left to the child component', () => {
    // ConfirmDialog does call onClose itself, but relying on that alone would
    // be an assumption; the page closes its own state too.
    const m = src.match(/const confirmDelete = \(\) => \{([\s\S]*?)\n  \};/);
    expect(m[1].includes('setToDelete(null)')).toBe(true);
  });
});

describe('Campaigns.jsx — the warning copy tells the truth', () => {
  it('the linked-task branch says tasks are NOT deleted but the link is removed', () => {
    expect(src.includes('המשימות המקושרות לא יימחקו')).toBe(true);
    expect(src.includes('הקישור שלהן לקמפיין יוסר')).toBe(true);
  });

  it('it says "ידועות N" — never "בדיוק N" — because the count can under-report', () => {
    expect(src.includes('ידועות ${linkedCount} משימות מקושרות')).toBe(true);
    // Scoped to the message templates. A blanket src-wide ban on "בדיוק" also
    // matches the comment that EXPLAINS why the word is avoided, which is the
    // same over-reaching-assertion mistake the slice-3 isSupabaseConfigured pin
    // made. Assert the user-facing copy, not the prose around it.
    const m = src.match(/const deleteMessage = toDelete([\s\S]*?)\n    : '';/);
    expect(m, 'deleteMessage present').not.toBe(null);
    expect(m[1].includes('בדיוק')).toBe(false);
  });

  it('the no-links branch still warns that the delete is irreversible', () => {
    expect(src.includes('הפעולה אינה הפיכה')).toBe(true);
  });

  it('the count comes from client data already held — no new query', () => {
    expect(src.includes('countTasksForCampaign(data?.tasks, toDelete.id)')).toBe(true);
    // No extra fetch was added for the count.
    expect(src.includes('listTasks')).toBe(false);
  });
});
