import { useMemo, useState } from 'react';
import { userFacingError } from '../lib/userFacingError.js';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { StaggerGroup, Reveal, ScrollReveal } from '../components/ui/motion.jsx';
import Icon from '../components/ui/Icon.jsx';
import Modal from '../components/ui/Modal.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { SectionHeader, EmptyState } from '../components/ui/atoms.jsx';
import { CATS, buildMessage, needFor, OUTREACH_NEEDS_DEFAULT, OUTREACH_TO_GROWTH_CATEGORY } from '../data/outreach.js';
import { leadsRouteForCategory } from '../data/growthCalendar.js';
import { uuid } from '../lib/api.js';
import { generateLeadIdeas } from '../lib/gemini.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { buildAccountOutreachMessage, canBuildAccountOutreach, OUTREACH_SETUP_REQUIRED } from '../lib/outreachMessage.js';
import { resolveDisplayName } from '../lib/userIdentity.js';

const FILTERS = [
  { key: 'all', label: 'הכל' },
  { key: 'pending', label: 'ממתינים' },
  { key: 'contacted', label: 'נוצר קשר' },
  { key: 'irrelevant', label: 'לא רלוונטי' },
];

const today = () => new Date().toISOString().slice(0, 10);

export default function Outreach() {
  const { data, dispatch, toast, session } = useStore();
  const leads = data.outreachLeads || [];

  // S0F.1 — outreach copy in authenticated cloud beta is built from the ACTIVE
  // account only: its session-derived sender name (S0C) + its approved Business
  // Context (S0D) + the account's own lead record. The legacy category templates
  // in data/outreach.js open with one specific person at one specific business,
  // so they are never rendered to a signed-in account. Without an approved
  // business name we show a truthful setup-required state and invent nothing.
  const senderName = resolveDisplayName(session);
  const accountReady = canBuildAccountOutreach(data.businessProfile);
  const messageFor = (category, leadName, need) => (
    isSupabaseConfigured
      ? buildAccountOutreachMessage({ leadName, need, senderName, businessProfile: data.businessProfile })
      : buildMessage(category, leadName)
  );

  const [filter, setFilter] = useState('all');
  const [copiedId, setCopiedId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState(CATS[0].id);
  const [newNeed, setNewNeed] = useState(OUTREACH_NEEDS_DEFAULT[CATS[0].id]);
  const [toDelete, setToDelete] = useState(null);
  const [niche, setNiche] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState('');

  const pickCat = (id) => { setNewCat(id); setNewNeed(OUTREACH_NEEDS_DEFAULT[id] || ''); };

  const generate = async () => {
    setGenLoading(true); setGenError('');
    try {
      const ideas = await generateLeadIdeas(niche, 6);
      if (!ideas.length) { setGenError('לא התקבלו רעיונות, נסה ניסוח אחר'); return; }
      ideas.forEach((idea) => {
        const category = CATS.some((c) => c.id === idea.category) ? idea.category : 'services';
        dispatch({ type: 'ADD_LEAD', payload: { name: idea.name, category, status: 'pending', clientId: null, need: idea.need || '' } });
      });
      toast(`נוספו ${ideas.length} רעיונות לידים`);
      setNiche('');
    } catch (e) {
      setGenError(userFacingError(e, 'שגיאה ביצירת רעיונות'));
    } finally {
      setGenLoading(false);
    }
  };

  const counts = useMemo(() => {
    const c = { total: leads.length, contacted: 0, pending: 0, irrelevant: 0 };
    leads.forEach((l) => { c[l.status] = (c[l.status] || 0) + 1; });
    return c;
  }, [leads]);
  const pct = counts.total ? Math.round((counts.contacted / counts.total) * 100) : 0;

  const shown = useMemo(
    () => leads.filter((l) => (filter === 'all' ? true : l.status === filter)),
    [leads, filter]
  );

  // ---- actions ----
  const copy = (text, id) => {
    const ok = () => { setCopiedId(id); toast('ההודעה הועתקה'); setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(ok, () => toast('לא ניתן להעתיק', 'error'));
    else toast('לא ניתן להעתיק', 'error');
  };

  const renameLead = (lead, value) => {
    const v = value.trim();
    if (v && v !== lead.name) dispatch({ type: 'UPDATE_LEAD', payload: { id: lead.id, name: v } });
  };

  // Mark "✓ פניתי" → also create a CRM client (status ליד) if not linked yet.
  const toggleContacted = (lead) => {
    if (lead.status === 'contacted') {
      dispatch({ type: 'UPDATE_LEAD', payload: { id: lead.id, status: 'pending' } });
      return;
    }
    let clientId = lead.clientId;
    if (!clientId) {
      const existing = data.clients.find((c) => (c.name || '').trim() === lead.name.trim());
      if (existing) {
        clientId = existing.id;
      } else {
        clientId = uuid();
        dispatch({
          type: 'ADD_CLIENT',
          payload: {
            id: clientId, name: lead.name, contact: '', phone: '', email: '',
            status: 'lead', value: 0, projectType: '', source: 'פנייה קרה',
            date: today(), notes: 'נוצר אוטומטית מפנייה קרה (מודול פניות).',
          },
        });
        toast('נוצר ליד חדש ב-CRM · פנייה קרה');
      }
    }
    dispatch({ type: 'UPDATE_LEAD', payload: { id: lead.id, status: 'contacted', clientId } });
  };

  const toggleIrrelevant = (lead) => {
    dispatch({ type: 'UPDATE_LEAD', payload: { id: lead.id, status: lead.status === 'irrelevant' ? 'pending' : 'irrelevant' } });
  };

  const removeLead = () => {
    if (!toDelete) return;
    dispatch({ type: 'DELETE_LEAD', id: toDelete.id });
    toast('הליד נמחק', 'error');
    setToDelete(null);
  };

  const addLead = () => {
    const name = newName.trim();
    if (!name) return;
    dispatch({ type: 'ADD_LEAD', payload: { name, category: newCat, status: 'pending', clientId: null, need: newNeed.trim() } });
    toast('ליד נוסף לרשימה');
    setNewName('');
    pickCat(CATS[0].id);
    setAdding(false);
  };

  return (
    <div>
      <SectionHeader
        title="מחקר לידים"
        sub="רעיונות ללידים ופניות קרות · העתק הודעה, סמן מצב, והתקדם משיחה להזדמנות"
        action={
          <button className="btn btn-ghost" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> הוסף ליד ידני
          </button>
        }
      />

      {/* S0F.1 — truthful setup-required notice: in authenticated cloud beta the
          opening message is built ONLY from the account's approved Business
          Context, so without one we say so instead of showing another
          business's copy. */}
      {isSupabaseConfigured && !accountReady && (
        <div className="card panel" style={{ marginBottom: 18 }} data-testid="outreach-setup-required">
          <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>{OUTREACH_SETUP_REQUIRED}</p>
          <Link className="btn btn-sm btn-outline" to="/settings" style={{ marginTop: 10 }}>
            <Icon name="edit" size={15} /> להשלמת ההקשר העסקי
          </Link>
        </div>
      )}

      {/* AI lead idea generator */}
      <ScrollReveal>
        <div className="card panel" style={{ marginBottom: 18, borderColor: 'rgba(212,255,63,0.22)' }}>
          <div className="panel-title row gap-2" style={{ marginBottom: 6 }}>
            <Icon name="spark" size={18} style={{ color: 'var(--lime-deep)' }} /> מחקר לידים עם AI
          </div>
          <p className="dim" style={{ fontSize: '0.84rem', marginBottom: 14 }}>
            הזן תחום, אזור או סוג קהל — וקבל רעיונות ללידים שכדאי לפנות אליהם, עם הצורך העסקי של כל אחד: מערכת CRM, דשבורד, אוטומציות, מערכת פולואפים או דף נחיתה.
            {!isSupabaseConfigured && ' (מצב הדגמה)'}
          </p>
          <div className="row gap-2 wrap">
            <input
              className="input grow"
              aria-label="נישה או תחום לייצור רעיונות לידים"
              style={{ minWidth: 220 }}
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') generate(); }}
              placeholder="למשל: יקבים בגליל · מסעדות שף · קליניקות אסתטיקה בתל אביב"
            />
            <button className="btn btn-primary" onClick={generate} disabled={genLoading} style={genLoading ? { opacity: 0.8 } : undefined}>
              {genLoading ? <><span className="loader-ring" style={{ width: 16, height: 16, borderWidth: 2 }} /> מייצר…</> : <><Icon name="spark" size={17} /> צור רעיונות לידים</>}
            </button>
          </div>
          {genError && <div className="login-error" style={{ marginTop: 12 }}><Icon name="x" size={15} strokeWidth={2.4} /> {genError}</div>}
        </div>
      </ScrollReveal>

      {/* Progress */}
      <ScrollReveal>
        <div className="card panel" style={{ marginBottom: 18 }}>
          <div className="row wrap" style={{ gap: 28, marginBottom: 16 }}>
            <Stat n={counts.total} l="סה״כ לידים" />
            <Stat n={counts.contacted} l="נוצר קשר" accent />
            <Stat n={counts.pending} l="ממתינים" />
            <Stat n={counts.irrelevant} l="לא רלוונטי" />
            <div className="grow" />
            <div style={{ alignSelf: 'center', fontSize: '1.4rem', fontWeight: 800 }} className="tnum">{pct}%</div>
          </div>
          <div className="progress-track">
            <motion.span className="progress-fill" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        </div>
      </ScrollReveal>

      {/* Filters */}
      <div className="toolbar">
        <div className="filter-tabs">
          {FILTERS.map((f) => {
            const n = f.key === 'all' ? counts.total : counts[f.key];
            return (
              <button key={f.key} className={`filter-tab ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
                {f.label} <span style={{ opacity: 0.6 }}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Groups */}
      {shown.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="send"
            title="אין לידים להצגה"
            hint={filter !== 'all' ? 'נסה להחליף סינון' : 'הוסף ליד חדש כדי להתחיל'}
            action={<button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} /> הוסף ליד</button>}
          />
        </div>
      ) : (
        CATS.map((cat) => {
          const inCat = shown.filter((l) => l.category === cat.id);
          if (!inCat.length) return null;
          return (
            <div key={cat.id} style={{ marginBottom: 26 }}>
              <div className="group-head">
                <span className="group-ico">{cat.icon}</span>
                <span>{cat.label}</span>
                <span className="dim" style={{ fontSize: '0.8rem', fontWeight: 600 }}>· {inCat.length}</span>
                <div className="grow" />
                <Link
                  className="btn btn-ghost btn-sm"
                  to={leadsRouteForCategory(OUTREACH_TO_GROWTH_CATEGORY[cat.id])}
                >
                  <Icon name="target" size={14} /> מיפוי אסטרטגי
                </Link>
              </div>
              <StaggerGroup style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {inCat.map((lead) => {
                  const msg = messageFor(lead.category, lead.name, needFor(lead));
                  return (
                  <Reveal key={lead.id}>
                    <div className={`card lead-card lead-${lead.status}`}>
                      <div className="row gap-2" style={{ marginBottom: 11 }}>
                        <input
                          className="lead-name-input"
                          defaultValue={lead.name}
                          key={lead.name}
                          spellCheck={false}
                          aria-label="שם העסק"
                          onBlur={(e) => renameLead(lead, e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        />
                        <Icon name="edit" size={13} className="dim" />
                        {lead.status === 'contacted' && <span className="badge badge-active"><span className="dot" />נוצר קשר</span>}
                        <div className="grow" />
                        <button className="icon-action del" onClick={() => setToDelete(lead)} aria-label="מחיקה"><Icon name="trash" size={15} /></button>
                      </div>

                      <div className="lead-need">
                        <Icon name="target" size={15} />
                        <span><b>צורך מרכזי:</b> {needFor(lead)}</span>
                      </div>

                      {msg
                        ? <div className="lead-msg">{msg}</div>
                        : <div className="lead-msg lead-msg-setup">נוסח הפנייה יופיע אחרי השלמת ההקשר העסקי — לא נציג נוסח של עסק אחר.</div>}

                      <div className="row gap-2 wrap">
                        {msg ? (
                          <button className={`btn btn-sm ${copiedId === lead.id ? 'btn-primary' : 'btn-primary'}`} onClick={() => copy(msg, lead.id)}>
                            <Icon name={copiedId === lead.id ? 'check' : 'copy'} size={15} />
                            {copiedId === lead.id ? 'הועתק' : 'העתק הודעה'}
                          </button>
                        ) : (
                          <Link className="btn btn-sm btn-outline" to="/settings"><Icon name="edit" size={15} /> להשלמת ההקשר העסקי</Link>
                        )}
                        <button className={`btn btn-sm ${lead.status === 'contacted' ? 'btn-toggle-on' : 'btn-outline'}`} onClick={() => toggleContacted(lead)}>
                          <Icon name="check" size={15} /> פניתי
                        </button>
                        <button className={`btn btn-sm ${lead.status === 'irrelevant' ? 'btn-toggle-off' : 'btn-outline'}`} onClick={() => toggleIrrelevant(lead)}>
                          <Icon name="x" size={15} /> לא רלוונטי
                        </button>
                      </div>
                    </div>
                  </Reveal>
                  );
                })}
              </StaggerGroup>
            </div>
          );
        })
      )}

      {/* Add modal */}
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="ליד חדש לפניות"
        subtitle="פנייה קרה — קטגוריה קובעת את נוסח ההודעה"
        maxWidth={480}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setAdding(false)}>ביטול</button>
            <button className="btn btn-primary" onClick={addLead} disabled={!newName.trim()} style={!newName.trim() ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>הוספה</button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field">
            <label>שם העסק</label>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="לדוגמה: יקב רמת הגולן" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') addLead(); }} />
          </div>
          <div className="field">
            <label>קטגוריה</label>
            <select className="select" value={newCat} onChange={(e) => pickCat(e.target.value)}>
              {CATS.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>צורך מרכזי (מה להציע)</label>
            <textarea className="textarea" style={{ minHeight: 64 }} value={newNeed} onChange={(e) => setNewNeed(e.target.value)} placeholder="במה העסק הזה צריך עזרה?" />
          </div>
          <div className="lead-msg" style={{ marginBottom: 0 }}>
            {messageFor(newCat, newName || '{שם העסק}', newNeed) || OUTREACH_SETUP_REQUIRED}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={removeLead}
        message={`למחוק את הליד "${toDelete?.name}"? פעולה זו אינה ניתנת לשחזור.`}
      />
    </div>
  );
}

function Stat({ n, l, accent }) {
  return (
    <div>
      <div className="tnum" style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1, color: accent ? 'var(--lime-deep)' : 'var(--text)' }}>{n}</div>
      <div className="dim" style={{ fontSize: '0.78rem', marginTop: 4 }}>{l}</div>
    </div>
  );
}
