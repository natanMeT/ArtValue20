import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/store.jsx';
import Icon from '../components/ui/Icon.jsx';
import { SectionHeader, EmptyState } from '../components/ui/atoms.jsx';
import AppointmentModal from '../components/forms/AppointmentModal.jsx';
import { isSupabaseConfigured } from '../lib/supabase.js';
import {
  listAppointments, createAppointment, updateAppointment,
  setAppointmentStatus, deleteAppointment,
} from '../lib/api.js';
import {
  APPOINTMENT_KIND_LABELS, APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_CLASS,
  listToday, listWeek, sortByStart, groupByDay, findOverlapIds,
  formatTimeRange, scheduleCounts,
} from '../lib/schedule.js';

// ===================================================================
// Schedule Core slice 1 — the durable diary.
//
// WHAT THIS SCREEN IS, AND WHAT IT IS NOT. It is a TODAY / THIS WEEK list with
// create, edit and outcome. It is deliberately NOT a month grid: the grid is
// the expensive half and proves nothing about durability, and the היום/השבוע
// idiom is the one /tasks already uses, so the two screens read the same way.
// A calendar view is a later slice.
//
// IT IS ALSO NOT THE GROWTH MONTHLY ACTION CALENDAR (`/growth/calendar`), which
// plans activity VOLUME from an income target and persists nothing. This screen
// owns real occurrences in `public.appointments`. Neither imports the other.
//
// CLOUD-ONLY BY CONSTRUCTION, exactly like Campaigns: appointments exist only as
// durable cloud rows — no local reducer, no seed, no localStorage fallback. In
// local/demo mode this page renders a truthful unavailable state instead of a
// working form, because a form that appears to save and saves nothing is the
// one thing S0A exists to prevent.
//
// NOTHING IS OPTIMISTIC. Every write re-reads from the server before the list
// changes, so a row appears, moves or disappears on screen only after the
// server has said so.
// ===================================================================

const TABS = [
  { id: 'today', label: 'היום' },
  { id: 'week', label: 'השבוע' },
  { id: 'all', label: 'הכל' },
];

function LocalUnavailable() {
  return (
    <div>
      <SectionHeader title="יומן" sub="תורים, שיעורים ואירועים — היום והשבוע" />
      <div className="card panel">
        <EmptyState
          icon="lock"
          title="זמין רק בחשבון בענן"
          hint="היומן נשמר בענן בלבד ומשויך לחשבון. במצב ההדגמה המקומי אין לו אחסון עמיד, ולכן המסך אינו פעיל כאן — כדי לא להציג טופס ששומר לכאורה ולא שומר בפועל."
        />
      </div>
    </div>
  );
}

// Same markup as the /tasks KPI tile (kpi-grid > card kpi > kpi-top/kpi-value),
// so the two screens read identically — but WITHOUT CountUp or framer-motion.
// A count-up on a diary tile animates on every reload for no information gain,
// and an always-animating tile is what made a previous visual QA unscreenshotable.
function Kpi({ label, value, icon, accent }) {
  return (
    <div className="card kpi">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span
          className="kpi-ico"
          style={accent ? { background: 'var(--lime)', color: 'var(--on-lime)', borderColor: 'transparent' } : undefined}
        >
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className="kpi-value tnum">{value}</div>
    </div>
  );
}

export default function Schedule() {
  const { data, toast, session } = useStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('today');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // The clock is read HERE, once, and injected into every pure helper. Nothing
  // in src/lib/schedule.js reads it, which is what makes midnight, month-end and
  // week-boundary behaviour testable.
  const [now] = useState(() => new Date());

  const userId = session?.user?.id || null;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await listAppointments());
    } catch (e) {
      setError(e?.userSafe ? e.message : 'לא הצלחתי לטעון את היומן כרגע. אפשר לנסות שוב.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isSupabaseConfigured) load(); }, [load]);

  const counts = useMemo(() => scheduleCounts(items, now), [items, now]);

  const shown = useMemo(() => {
    if (tab === 'today') return listToday(items, now);
    if (tab === 'week') return listWeek(items, now);
    return sortByStart(items);
  }, [items, tab, now]);

  const groups = useMemo(() => groupByDay(shown), [shown]);
  const overlapIds = useMemo(() => findOverlapIds(shown), [shown]);

  if (!isSupabaseConfigured) return <LocalUnavailable />;

  const clients = data?.clients || [];
  const tasks = data?.tasks || [];
  const clientName = (id) => clients.find((c) => c.id === id)?.name || '';
  const taskTitle = (id) => tasks.find((t) => t.id === id)?.title || '';

  // Every handler re-reads from the server after a write. Nothing updates local
  // state optimistically.
  const run = async (fn, okMsg) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      toast(okMsg);
      return true;
    } catch (e) {
      setError(e?.userSafe ? e.message : 'הפעולה לא הושלמה ולא נשמר דבר. אפשר לנסות שוב.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async (payload) => {
    const ok = await run(
      () => (payload.id
        ? updateAppointment(payload.id, payload)
        : createAppointment(userId, payload)),
      payload.id ? 'הרישום עודכן' : 'הרישום נוסף ליומן',
    );
    // The modal stays OPEN on failure, with the typed values intact — closing it
    // would look exactly like a successful save.
    if (ok) { setModalOpen(false); setEditing(null); }
  };

  const openNew = () => { setEditing(null); setError(''); setModalOpen(true); };
  const openEdit = (a) => { setEditing(a); setError(''); setModalOpen(true); };

  return (
    <div>
      <SectionHeader
        title="יומן"
        sub="תורים, שיעורים ואירועים — היום והשבוע"
        action={(
          <button className="btn btn-primary" onClick={openNew} disabled={busy}>
            <Icon name="plus" size={17} /> רישום חדש
          </button>
        )}
      />

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi label="להיום" value={counts.today} icon="clock" accent />
        <Kpi label="השבוע" value={counts.week} icon="calendar" />
        <Kpi label="מתוכננים" value={counts.planned} icon="check" />
      </div>

      <div className="card panel">
        <div className="filter-tabs" style={{ marginBottom: 12 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`filter-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}

        {loading ? (
          <EmptyState icon="clock" title="טוען…" hint="קורא את היומן של החשבון" />
        ) : !groups.length ? (
          <EmptyState
            icon="calendar"
            title={tab === 'all' ? 'היומן ריק' : 'אין רישומים בטווח הזה'}
            hint={tab === 'all'
              ? 'אפשר להוסיף תור, שיעור או אירוע — עם לקוח ומשימה, או בלעדיהם.'
              : 'הרשימות של היום והשבוע מציגות רישומים מתוכננים בלבד. רישום שבוטל או שכבר התקיים נשאר ביומן, תחת "הכל".'}
          />
        ) : (
          groups.map((g) => (
            <div key={g.day} style={{ marginBottom: 18 }}>
              <div className="panel-title" style={{ marginBottom: 8 }}>{g.day}</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>שעה</th><th>סוג</th><th>כותרת</th><th>לקוח</th><th>משימה</th><th>מצב</th><th>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((a) => (
                    <tr key={a.id}>
                      <td className="tnum" style={{ whiteSpace: 'nowrap' }} dir="ltr">
                        {formatTimeRange(a.startAt, a.endAt)}
                        {overlapIds.has(a.id) && (
                          // SHOWN, never refused — see findOverlapIds and L2.
                          <span className="badge badge-payment" style={{ marginInlineStart: 6 }}>חפיפה</span>
                        )}
                      </td>
                      <td>{APPOINTMENT_KIND_LABELS[a.kind]}</td>
                      <td>{a.title}</td>
                      <td className="muted">{a.clientId ? (clientName(a.clientId) || '—') : '—'}</td>
                      <td className="muted">{a.taskId ? (taskTitle(a.taskId) || '—') : '—'}</td>
                      <td>
                        <span className={`badge ${APPOINTMENT_STATUS_CLASS[a.status]}`}>
                          {APPOINTMENT_STATUS_LABELS[a.status]}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-sm btn-ghost" onClick={() => openEdit(a)} disabled={busy}>ערוך</button>
                          {/* Every status is reachable from every other (L5):
                              a no-show corrected to completed, or a cancellation
                              undone, are ordinary corrections. */}
                          {APPOINTMENT_STATUSES.filter((s) => s !== a.status).map((s) => (
                            <button
                              key={s}
                              className="btn btn-sm btn-ghost"
                              disabled={busy}
                              onClick={() => run(
                                () => setAppointmentStatus(a.id, s),
                                `הרישום סומן כ${APPOINTMENT_STATUS_LABELS[s]}`,
                              )}
                            >
                              {APPOINTMENT_STATUS_LABELS[s]}
                            </button>
                          ))}
                          <button
                            className="btn btn-sm btn-ghost"
                            disabled={busy}
                            onClick={() => run(() => deleteAppointment(a.id), 'הרישום נמחק')}
                          >
                            מחק
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      <AppointmentModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={save}
        initial={editing}
        clients={clients}
        tasks={tasks}
        saving={busy}
      />
    </div>
  );
}
