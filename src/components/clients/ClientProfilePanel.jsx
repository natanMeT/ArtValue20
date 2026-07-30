import Icon from '../ui/Icon.jsx';
import { EmptyState, StatusBadge } from '../ui/atoms.jsx';
import { formatCurrency, formatDate } from '../../lib/format.js';
import { quoteTotal } from '../../lib/calc.js';
import { labelOf, TASK_STATUS, TASK_PRIORITY, studioBadgeClass } from '../../data/studio.js';
import {
  CHARGE_KIND_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_CLASS,
} from '../../lib/receivables.js';
import {
  APPOINTMENT_KIND_LABELS, APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_CLASS, formatTimeRange, dayKey,
} from '../../lib/schedule.js';
import { buildClientProfile } from './clientProfile.js';

// ===================================================================
// Client Profile slice 1 — the panel.
//
// READ-ONLY BY CONSTRUCTION. It renders existing data and offers no control
// that writes anything. The only interactive elements are the navigations the
// Clients screen already shipped, handed in as `onOpen` — a section that could
// not act on real data would otherwise have grown a button that pretends to.
//
// Every section states what it does not know instead of showing zero as if it
// were a fact: the diary is cloud-only (see clientProfile.js), so in local/demo
// mode it says the diary is unavailable rather than "no appointments".
// ===================================================================

function Section({ title, count, children, action }) {
  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="panel-title">{title}</div>
        <div className="row gap-2" style={{ alignItems: 'center' }}>
          {count != null && <span className="dim" style={{ fontSize: '0.8rem' }}>{count}</span>}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

function Row({ children }) {
  return (
    <div
      className="row between"
      style={{ padding: '11px 14px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)', gap: 10 }}
    >
      {children}
    </div>
  );
}

function List({ children }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>;
}

function Blank({ text }) {
  return <p className="dim" style={{ fontSize: '0.86rem', margin: 0 }}>{text}</p>;
}

// Hebrew counts read wrong in the plural form at exactly one ("1 הצעות"), and
// these counters sit next to every section title, so the singular is spelled out
// rather than numbered.
const he = (n, one, many) => (n === 1 ? one : `${n} ${many}`);

const NEXT_ACTION_SOURCE = {
  client: 'מעקב שהוגדר על הלקוח',
  task: 'המשימה הפתוחה הקרובה',
  appointment: 'הרישום המתוכנן הקרוב',
};

export default function ClientProfilePanel({
  client,
  data,
  appointments = [],
  scheduleState = 'ready', // 'ready' | 'loading' | 'error' | 'unavailable'
  userId,
  onOpen,
}) {
  if (!client) return null;
  const profile = buildClientProfile(client, data, appointments, userId);
  const { tasks, quotes, money, nextAction } = profile;
  const { totals } = money;
  const go = (to, state) => () => onOpen && onOpen(to, state);

  const scheduleNote = {
    loading: 'טוען את היומן…',
    error: 'לא הצלחתי לקרוא את היומן כרגע, ולכן לא ידוע אם יש רישומים ללקוח הזה.',
    unavailable: 'היומן נשמר בענן בלבד ואינו זמין במצב ההדגמה המקומי — לכן לא ידוע אם יש ללקוח רישומים.',
  }[scheduleState];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ---- פעולה הבאה ---- */}
      <Section title="פעולה הבאה">
        {nextAction ? (
          <div className="next-action" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="row gap-2" style={{ alignItems: 'center' }}>
              <Icon name="arrow" size={14} />
              <span style={{ fontWeight: 600 }}>{nextAction.text}</span>
            </div>
            <span className="dim" style={{ fontSize: '0.76rem' }}>
              {NEXT_ACTION_SOURCE[nextAction.source]}
              {nextAction.date ? ` · ${formatDate(nextAction.date)}` : ''}
            </span>
          </div>
        ) : (
          <Blank text="אין פעולה הבאה: לא הוגדר מעקב על הלקוח, אין משימה פתוחה ואין רישום מתוכנן ביומן." />
        )}
      </Section>

      {/* ---- יתרה / חיובים ---- */}
      <Section title="חיובים ויתרה" count={he(money.openCharges.length, 'חיוב פתוח אחד', 'חיובים פתוחים')}>
        <div className="detail-grid" style={{ marginBottom: money.charges.length ? 10 : 0 }}>
          <div className="detail-item"><div className="k">צפוי לחיוב</div><div className="v tnum">{formatCurrency(totals.expected)}</div></div>
          <div className="detail-item"><div className="k">התקבל</div><div className="v tnum">{formatCurrency(totals.received)}</div></div>
          <div className="detail-item">
            <div className="k">יתרה פתוחה</div>
            <div className="v tnum" style={{ color: totals.open > 0 ? 'var(--warn, var(--lime-deep))' : 'var(--lime-deep)', fontWeight: 700 }}>
              {formatCurrency(totals.open)}
            </div>
          </div>
          {totals.overpaid > 0 && (
            <div className="detail-item"><div className="k">עודף תשלום</div><div className="v tnum">{formatCurrency(totals.overpaid)}</div></div>
          )}
        </div>
        {money.charges.length === 0 ? (
          <Blank text="אין חיובים מקושרים ללקוח הזה — לא ישירות ולא דרך הצעת מחיר." />
        ) : (
          <List>
            {money.charges.map((c) => (
              <Row key={c.id}>
                <div className="row gap-3" style={{ minWidth: 0 }}>
                  <Icon name="wallet" size={18} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      {CHARGE_KIND_LABELS[c.kind] || c.kind}
                      {c.description ? ` · ${c.description}` : ''}
                    </div>
                    <div className="dim" style={{ fontSize: '0.76rem' }}>
                      {c.dueDate ? `לתשלום עד ${formatDate(c.dueDate)}` : 'ללא תאריך יעד'}
                      {c.lifecycle === 'cancelled' ? ' · חיוב מבוטל' : ''}
                    </div>
                  </div>
                </div>
                <div className="row gap-3" style={{ alignItems: 'center' }}>
                  <span className="tnum" style={{ fontWeight: 700 }}>{formatCurrency(c.amountTotal)}</span>
                  <span className="tnum dim" style={{ fontSize: '0.78rem' }}>יתרה {formatCurrency(c.balance)}</span>
                  <span className={`badge ${PAYMENT_STATUS_CLASS[c.paymentStatus]}`}>{PAYMENT_STATUS_LABELS[c.paymentStatus]}</span>
                </div>
              </Row>
            ))}
          </List>
        )}
        {money.cancelledCount > 0 && (
          <p className="dim" style={{ fontSize: '0.76rem', marginTop: 8 }}>
            {money.cancelledCount === 1
              ? 'חיוב מבוטל אחד אינו נכלל בסכומים שלמעלה.'
              : `${money.cancelledCount} חיובים מבוטלים אינם נכללים בסכומים שלמעלה.`}
          </p>
        )}
      </Section>

      {/* ---- תשלומים שהתקבלו ---- */}
      <Section title="תשלומים שהתקבלו" count={he(money.payments.length, 'תשלום אחד', 'תשלומים')}>
        {money.payments.length === 0 ? (
          <Blank text="לא נרשמו תשלומים כנגד החיובים של הלקוח." />
        ) : (
          <List>
            {money.payments.map((p) => (
              <Row key={p.id}>
                <div className="row gap-3">
                  <Icon name="check" size={18} />
                  <div className="dim" style={{ fontSize: '0.82rem' }}>{p.paidAt ? formatDate(p.paidAt) : 'ללא תאריך'}</div>
                </div>
                <span className="tnum" style={{ fontWeight: 700 }}>{formatCurrency(p.amount)}</span>
              </Row>
            ))}
          </List>
        )}
      </Section>

      {/* ---- משימות קשורות ---- */}
      <Section
        title="משימות קשורות"
        count={`${he(tasks.open.length, 'פתוחה אחת', 'פתוחות')} · ${he(tasks.done.length, 'הושלמה אחת', 'הושלמו')}`}
        action={<button className="btn btn-ghost btn-sm" onClick={go('/tasks')}>למשימות</button>}
      >
        {tasks.open.length === 0 && tasks.done.length === 0 ? (
          <Blank text="אין משימות המקושרות ללקוח הזה." />
        ) : (
          <List>
            {[...tasks.open, ...tasks.done].map((t) => (
              <Row key={t.id}>
                <div className="row gap-3" style={{ minWidth: 0 }}>
                  <Icon name="check" size={18} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', opacity: t.status === 'done' ? 0.6 : 1 }}>{t.title}</div>
                    <div className="dim" style={{ fontSize: '0.76rem' }}>
                      {t.deadline ? formatDate(t.deadline) : 'ללא תאריך יעד'}
                    </div>
                  </div>
                </div>
                <div className="row gap-2">
                  {t.priority && t.priority !== 'normal' && (
                    <span className={`badge ${studioBadgeClass(t.priority)}`}>{labelOf(TASK_PRIORITY, t.priority)}</span>
                  )}
                  <span className={`badge ${studioBadgeClass(t.status)}`}>{labelOf(TASK_STATUS, t.status)}</span>
                </div>
              </Row>
            ))}
          </List>
        )}
      </Section>

      {/* ---- יומן ---- */}
      <Section
        title="תורים ושיעורים"
        count={scheduleState === 'ready' ? he(profile.appointments.all.length, 'רישום אחד', 'רישומים') : null}
        action={scheduleState === 'ready' ? <button className="btn btn-ghost btn-sm" onClick={go('/schedule')}>ליומן</button> : null}
      >
        {scheduleState !== 'ready' ? (
          <Blank text={scheduleNote} />
        ) : profile.appointments.all.length === 0 ? (
          <Blank text="אין תורים, שיעורים או אירועים המקושרים ללקוח הזה." />
        ) : (
          <List>
            {profile.appointments.all.map((a) => (
              <Row key={a.id}>
                <div className="row gap-3" style={{ minWidth: 0 }}>
                  <Icon name="calendar" size={18} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{a.title}</div>
                    <div className="dim tnum" style={{ fontSize: '0.76rem' }} dir="ltr">
                      {dayKey(a.startAt)} · {formatTimeRange(a.startAt, a.endAt)}
                    </div>
                  </div>
                </div>
                <div className="row gap-2">
                  <span className="badge badge-neutral">{APPOINTMENT_KIND_LABELS[a.kind] || a.kind}</span>
                  <span className={`badge ${APPOINTMENT_STATUS_CLASS[a.status]}`}>{APPOINTMENT_STATUS_LABELS[a.status]}</span>
                </div>
              </Row>
            ))}
          </List>
        )}
      </Section>

      {/* ---- הצעות מחיר ---- */}
      <Section
        title="הצעות מחיר מקושרות"
        count={he(quotes.length, 'הצעה אחת', 'הצעות')}
        action={<button className="btn btn-ghost btn-sm" onClick={go('/quotes')}>להצעות</button>}
      >
        {quotes.length === 0 ? (
          <EmptyState
            icon="doc"
            title="אין הצעות מחיר מקושרות"
            hint="אפשר להפיק הצעה ללקוח הזה מהכפתור שבתחתית החלון."
          />
        ) : (
          <List>
            {quotes.map((quote) => (
              <Row key={quote.id}>
                <div className="row gap-3">
                  <Icon name="doc" size={18} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{quote.number}</div>
                    <div className="dim" style={{ fontSize: '0.76rem' }}>{formatDate(quote.date)}</div>
                  </div>
                </div>
                <div className="row gap-3">
                  <span className="tnum" style={{ fontWeight: 700 }}>{formatCurrency(quoteTotal(quote))}</span>
                  <StatusBadge status={quote.status} />
                </div>
              </Row>
            ))}
          </List>
        )}
      </Section>
    </div>
  );
}
