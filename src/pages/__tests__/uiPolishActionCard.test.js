import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ===================================================================
// UI polish slice — source guards for the visible fixes.
//
// Repo test convention (same as s0cIdentityIsolation / demoModeContainment):
// read the REAL source files and pin the load-bearing facts, so a later slice
// cannot quietly undo them.
//
// What these guards pin:
//   1. the conversion-rate KPI is GONE from the Dashboard, and the action card
//      that replaced it is truthful (no invented data source, no fabricated
//      zero for the diary, which fetchAll does not load);
//   2. module CTAs are module-specific — the generic "ליד חדש" is not the
//      primary CTA of a module that is not the lead-intake module;
//   3. empty states make no false claim and their CTAs are reachable;
//   4. the date/time inputs stay on the themed control path (className="input"
//      everywhere + a single `color-scheme` declaration per theme);
//   5. the previously-undefined layout classes now HAVE definitions.
//
// Each block below carries a positive control (proving the scan looks at the
// right file and can report a hit) alongside the zeroes — §21.
// ===================================================================

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const dashboard = read('../Dashboard.jsx');
const pipeline = read('../Pipeline.jsx');
const schedule = read('../Schedule.jsx');
const campaigns = read('../Campaigns.jsx');
const assets = read('../Assets.jsx');
const indexCss = read('../../index.css');
const appCss = read('../../styles/app.css');
const appointmentModal = read('../../components/forms/AppointmentModal.jsx');
const clientModal = read('../../components/forms/ClientModal.jsx');

// ---------------------------------------------------------------
// 1) The conversion-rate card is gone; the action card replaced it.
// ---------------------------------------------------------------
describe('Dashboard · the conversion-rate KPI is replaced, not merely renamed', () => {
  it('renders no "אחוז המרה" card and computes no conversion metric', () => {
    expect(dashboard.includes('אחוז המרה')).toBe(false);
    expect(dashboard.includes('conversion')).toBe(false);
    // POSITIVE CONTROL: the scan is pointed at the real Dashboard — the OTHER
    // three KPI tiles are still there. Without this, an empty file would pass.
    expect(dashboard.includes('הכנסות החודש')).toBe(true);
    expect(dashboard.includes('עסקאות פעילות')).toBe(true);
    expect(dashboard.includes('לידים חדשים')).toBe(true);
  });

  it('the decided/accepted ratio that fed it is gone, but `closed` still works', () => {
    expect(dashboard.includes('const decided =')).toBe(false);
    // metrics.closed is still rendered ("עסקאות שנסגרו") so `accepted` must stay.
    expect(dashboard.includes('const accepted =')).toBe(true);
    expect(dashboard.includes('closed: accepted.length')).toBe(true);
  });

  it('the replacement KPI tile counts work waiting, and does not read as good news', () => {
    expect(dashboard.includes('label="דורש טיפול"')).toBe(true);
    expect(dashboard.includes('value={attention.total}')).toBe(true);
    // A non-zero backlog must NOT render the green "up" delta pill.
    expect(dashboard.includes('deltaUp={attention.total === 0}')).toBe(true);
  });
});

describe('Dashboard · the action card is truthful', () => {
  it('renders the "מה דורש טיפול" panel', () => {
    expect(dashboard.includes('מה דורש טיפול')).toBe(true);
  });

  it('draws ONLY on data fetchAll already hydrates — it fetches nothing itself', () => {
    for (const source of ['data.tasks', 'data.clients', 'data.charges', 'data.payments']) {
      expect(dashboard.includes(source)).toBe(true);
    }
    // No network call, no API import, no direct client, no diary read.
    // (`supabaseEnabled` from the store is a MODE flag the S0E banner already
    // used — it is not a data fetch, so it is deliberately not banned here.)
    expect(dashboard.includes('listAppointments')).toBe(false);
    expect(dashboard.includes("from '../lib/api.js'")).toBe(false);
    expect(dashboard.includes('supabase.from(')).toBe(false);
    expect(dashboard.includes('await ')).toBe(false);
  });

  it('states the diary limitation instead of fabricating a zero for it', () => {
    // The card must not claim anything numeric about appointments...
    expect(dashboard.includes('פגישות היום')).toBe(false);
    expect(dashboard.includes('appointments')).toBe(false);
    // ...and must say out loud that the diary is not included here.
    expect(dashboard.includes('רישומי היומן אינם נכללים כאן')).toBe(true);
  });

  it('suppresses zero-count rows rather than rendering "0" lines', () => {
    for (const guard of [
      'if (tasksOverdue.length)',
      'if (tasksToday.length)',
      'if (chargesOverdue.length)',
      'if (clientsNoNext.length)',
    ]) {
      expect(dashboard.includes(guard)).toBe(true);
    }
  });

  it('uses the shared receivables definitions rather than a second money rule', () => {
    expect(dashboard.includes("from '../lib/receivables.js'")).toBe(true);
    expect(dashboard.includes('isChargeOpen')).toBe(true);
    expect(dashboard.includes('decorateCharge')).toBe(true);
    // Cancelled/paid charges are excluded — only a real open balance counts.
    expect(dashboard.includes('c.balance > 0')).toBe(true);
  });

  it('the all-clear message claims only what was actually checked', () => {
    // It names the three sources it measured; it does not say "אין מה לעשות".
    expect(dashboard.includes('אין כרגע משימות באיחור, חיובים באיחור או לקוחות ללא פעולה מתוכננת.')).toBe(true);
  });
});

// ---------------------------------------------------------------
// 2) Module-specific CTA labels.
// ---------------------------------------------------------------
describe('module primary CTAs are module-specific', () => {
  it('the Dashboard hero no longer uses the generic "ליד חדש"', () => {
    expect(dashboard.includes('ליד חדש')).toBe(false);
    expect(dashboard.includes('הוספת לקוח')).toBe(true);
  });

  it('Pipeline has its own CTA', () => {
    expect(pipeline.includes('לקוח חדש')).toBe(true);
    expect(pipeline.includes('ליד חדש')).toBe(false);
  });

  it('Schedule keeps the diary-specific CTA', () => {
    expect(schedule.includes('רישום חדש')).toBe(true);
    expect(schedule.includes('ליד חדש')).toBe(false);
  });

  it('POSITIVE CONTROL: the lead-intake module legitimately still says it', () => {
    // Proves the assertions above are a real signal and not a broken query:
    // the one module whose subject IS a new lead keeps the wording.
    const intake = read('../Intake.jsx');
    expect(intake.includes('ליד חדש')).toBe(true);
  });
});

// ---------------------------------------------------------------
// 3) Empty states: useful, and never a false claim.
// ---------------------------------------------------------------
describe('empty states', () => {
  it('Schedule offers a CTA only past the cloud-mode guard', () => {
    expect(schedule.includes('action={(')).toBe(true);
    // The local/demo unavailable state must NOT gain a create button — that is
    // exactly the false-success shape S0A exists to prevent.
    const localBlock = schedule.slice(
      schedule.indexOf('function LocalUnavailable'),
      schedule.indexOf('function Kpi'),
    );
    expect(localBlock.includes('action=')).toBe(false);
    expect(localBlock.includes('btn-primary')).toBe(false);
  });

  it('Assets distinguishes "no assets" from "nothing matched the filter"', () => {
    expect(assets.includes('rows.length === 0')).toBe(true);
    expect(assets.includes('אין עדיין קבצים או קישורים')).toBe(true);
    expect(assets.includes('לא נמצאו נכסים')).toBe(true);
    // The clear-filter CTA actually clears both controls.
    expect(assets.includes("setQ(''); setFilter('all');")).toBe(true);
  });

  it('Campaigns keeps its truthful local-mode wording', () => {
    expect(campaigns.includes('זמין רק בחשבון בענן')).toBe(true);
  });
});

// ---------------------------------------------------------------
// 4) Date/time controls stay dark.
// ---------------------------------------------------------------
describe('date and time inputs are themed, not native-white', () => {
  it('each theme declares color-scheme exactly once', () => {
    expect((indexCss.match(/color-scheme:\s*dark/g) || []).length).toBe(1);
    expect((indexCss.match(/color-scheme:\s*light/g) || []).length).toBe(1);
  });

  it('every date/time input in the product carries the themed input class', () => {
    const files = {
      'Campaigns.jsx': campaigns,
      'AppointmentModal.jsx': appointmentModal,
      'ClientModal.jsx': clientModal,
    };
    for (const [name, src] of Object.entries(files)) {
      // A bare `<input type="date"` with no className was the Campaigns defect.
      const bare = src.match(/<input\s+type="(date|time)"/g) || [];
      expect(`${name}: ${bare.length}`).toBe(`${name}: 0`);
      // POSITIVE CONTROL: the file really does contain date/time inputs, so a
      // zero above means "all themed", not "none found".
      expect((src.match(/type="(date|time)"/g) || []).length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------
// 5) The layout classes that had no definition now have one.
// ---------------------------------------------------------------
describe('previously-undefined layout classes are defined', () => {
  it('.table, .form-row, .form-actions, .form-error and .row-actions exist', () => {
    for (const sel of ['.table {', '.form-row {', '.form-actions {', '.form-error {', '.row-actions {']) {
      expect(indexCss.includes(sel)).toBe(true);
    }
  });

  it('the wide tables are wrapped so they scroll instead of cropping', () => {
    expect(schedule.includes('<div className="table-wrap">')).toBe(true);
    expect(campaigns.includes('<div className="table-wrap">')).toBe(true);
    expect(appCss.includes('.table-wrap {')).toBe(true);
  });

  it('the assistant layer yields to modals without touching the frozen Assistant', () => {
    expect(appCss.includes('body:has(.modal-overlay) .agent')).toBe(true);
    expect(appCss.includes('body:has(.modal-overlay) .ai-fab')).toBe(true);
    // The suppression must be invisible AND unclickable, not merely faded.
    const block = appCss.slice(appCss.indexOf('body:has(.modal-overlay) .ai-fab'));
    const rule = block.slice(0, block.indexOf('}'));
    expect(rule.includes('pointer-events: none')).toBe(true);
    expect(rule.includes('visibility: hidden')).toBe(true);
  });

  it('Schedule opts into the 3-up KPI grid instead of the 5-column default', () => {
    expect(schedule.includes('kpi-grid kpi-grid-3')).toBe(true);
    expect(appCss.includes('.kpi-grid-3 {')).toBe(true);
  });
});
