import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { saveLabel } from '../lib/saveLabel.js';
import { StaggerGroup, Reveal } from '../components/ui/motion.jsx';
import Icon from '../components/ui/Icon.jsx';
import Modal from '../components/ui/Modal.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import ClientModal from '../components/forms/ClientModal.jsx';
import ClientProfilePanel from '../components/clients/ClientProfilePanel.jsx';
import { StatusBadge, SectionHeader, EmptyState } from '../components/ui/atoms.jsx';
import { CLIENT_STATUS } from '../data/seed.js';
import { PIPELINE_STAGES } from '../data/studio.js';
import { formatCurrency, formatDate, STATUS_LABELS } from '../lib/format.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { listAppointments } from '../lib/api.js';

const FILTERS = [{ key: 'all', label: 'הכל' }, ...CLIENT_STATUS.map((s) => ({ key: s, label: STATUS_LABELS[s] }))];

function waLink(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const intl = digits.startsWith('0') ? '972' + digits.slice(1) : digits;
  return `https://wa.me/${intl}`;
}

function initials(name) {
  return (name || '?').trim().slice(0, 2);
}

export default function Clients() {
  const { data, dispatch, toast, mode, session } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null); // client object or {} for new
  const [detail, setDetail] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const matchStatus = (c) => c.status === filter || (filter === 'completed' && c.status === 'completed_paid');
    return data.clients.filter((c) => {
      if (filter !== 'all' && !matchStatus(c)) return false;
      if (!term) return true;
      return [c.name, c.contact, c.email, c.phone, c.projectType].some((v) => (v || '').toLowerCase().includes(term));
    });
  }, [data.clients, q, filter]);

  const counts = useMemo(() => {
    const m = { all: data.clients.length };
    CLIENT_STATUS.forEach((s) => (m[s] = data.clients.filter((c) => c.status === s || (s === 'completed' && c.status === 'completed_paid')).length));
    return m;
  }, [data.clients]);

  // Client Profile slice 1 — the diary is the ONE part of the profile that is
  // not already in the store (appointments are cloud-only; see Schedule.jsx), so
  // it is read on demand when a profile is opened. Read-only: this page never
  // writes an appointment. In local/demo mode there is nothing to read and the
  // panel says the diary is unavailable rather than showing "no appointments",
  // which would be a claim we cannot make.
  const [appointments, setAppointments] = useState([]);
  const [scheduleState, setScheduleState] = useState(isSupabaseConfigured ? 'loading' : 'unavailable');

  useEffect(() => {
    if (!detail || !isSupabaseConfigured) return undefined;
    let live = true;
    setScheduleState('loading');
    listAppointments()
      .then((rows) => { if (live) { setAppointments(rows); setScheduleState('ready'); } })
      .catch(() => { if (live) { setAppointments([]); setScheduleState('error'); } });
    return () => { live = false; };
  }, [detail]);

  // S0B: client saves may carry follow-up fields (nextAction / nextActionDate).
  // Await the store's settled { ok } result — show success and close the modal
  // ONLY on ok:true. On failure the store restores authoritative cloud state; we
  // keep the modal open with the submitted values for correction, no success toast.
  const save = async (client) => {
    const res = await dispatch(client.id
      ? { type: 'UPDATE_CLIENT', payload: client }
      : { type: 'ADD_CLIENT', payload: client });
    if (res?.ok === false) return;
    toast(client.id ? `הלקוח עודכן · ${saveLabel(mode)}` : `לקוח נוסף · ${saveLabel(mode)}`);
    setEditing(null);
  };

  const remove = () => {
    if (!toDelete) return;
    dispatch({ type: 'DELETE_CLIENT', id: toDelete.id });
    toast('הלקוח נמחק', 'error');
    setToDelete(null);
    setDetail(null);
  };

  return (
    <div>
      <SectionHeader
        title="לקוחות"
        sub={`${data.clients.length} לקוחות במאגר`}
        action={
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            <Icon name="plus" size={18} /> לקוח חדש
          </button>
        }
      />

      <div className="toolbar">
        <div className="search-box">
          <span className="ico"><Icon name="search" size={18} /></span>
          <input aria-label="חיפוש לקוחות" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם, איש קשר, אימייל..." />
        </div>
        <div className="filter-tabs">
          {FILTERS.map((f) => (
            <button key={f.key} className={`filter-tab ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label} <span style={{ opacity: 0.6 }}>{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="users"
            title="אין לקוחות להצגה"
            hint={q || filter !== 'all' ? 'נסה לשנות את החיפוש או הסינון' : 'התחל בהוספת הלקוח הראשון שלך'}
            action={<button className="btn btn-primary" onClick={() => setEditing({})}><Icon name="plus" size={18} /> לקוח חדש</button>}
          />
        </div>
      ) : (
        <StaggerGroup className="client-grid">
          {list.map((c) => {
            const wa = waLink(c.phone);
            const openTasks = (data.tasks || []).filter((t) => t.clientId === c.id && t.status !== 'done').length;
            const activeProj = (data.projects || []).some((p) => p.clientId === c.id && p.status !== 'completed');
            const openPayment = c.status === 'await_payment' || data.quotes.some((q) => q.clientId === c.id && q.status === 'accepted');
            return (
              <Reveal key={c.id}>
                <motion.div className="card client-card" whileHover={{ scale: 1.02, y: -2 }} transition={{ duration: 0.2 }} onClick={() => setDetail(c)}>
                  <div className="client-card-top">
                    <div className="client-ava">{initials(c.name)}</div>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="client-name">{c.name}</div>
                      <div className="client-contact">{c.contact} · {c.projectType}</div>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>

                  {(c.nextAction || openTasks > 0 || activeProj || openPayment) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {c.nextAction && (
                        <div className="next-action" style={{ padding: '7px 10px', fontSize: '0.78rem' }}>
                          <Icon name="arrow" size={13} /><span>{c.nextAction}</span>
                        </div>
                      )}
                      <div className="row gap-2 wrap">
                        {activeProj && <span className="badge badge-active"><span className="dot" />פרויקט פעיל</span>}
                        {openTasks > 0 && <span className="badge badge-neutral"><Icon name="check" size={12} /> {openTasks} משימות</span>}
                        {openPayment && <span className="badge badge-payment"><span className="dot" />תשלום פתוח</span>}
                      </div>
                    </div>
                  )}

                  <div className="client-meta">
                    <div>
                      <div className="dim" style={{ fontSize: '0.72rem' }}>שווי פרויקט</div>
                      <div className="client-value tnum">{formatCurrency(c.value)}</div>
                    </div>
                    <div className="client-actions" onClick={(e) => e.stopPropagation()}>
                      {wa && (
                        <a className="icon-action wa" href={wa} target="_blank" rel="noreferrer" title="WhatsApp" aria-label="וואטסאפ">
                          <Icon name="whatsapp" size={17} />
                        </a>
                      )}
                      {c.phone && (
                        <a className="icon-action call" href={`tel:${c.phone}`} title="חיוג" aria-label="חיוג">
                          <Icon name="phone" size={16} />
                        </a>
                      )}
                      <button className="icon-action" onClick={() => navigate('/diagnose', { state: { diagnoseClient: c.id } })} title="אפיון לקוח (AI)" aria-label="אפיון">
                        <Icon name="spark" size={16} />
                      </button>
                      <button className="icon-action" onClick={() => setEditing(c)} title="עריכה" aria-label="עריכה">
                        <Icon name="edit" size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              </Reveal>
            );
          })}
        </StaggerGroup>
      )}

      {/* Add / Edit */}
      <ClientModal open={!!editing} onClose={() => setEditing(null)} onSave={save} initial={editing && editing.id ? editing : null} />

      {/* Detail */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name}
        subtitle={detail ? `${detail.contact} · ${detail.projectType}` : ''}
        // 620 → 760: the profile panel adds money rows with three trailing
        // badges; at 620 the amount and its status badge wrapped onto separate
        // lines and the row read as two facts instead of one.
        maxWidth={760}
        footer={
          detail && (
            <>
              <button className="btn btn-danger" onClick={() => setToDelete(detail)}>
                <Icon name="trash" size={16} /> מחיקה
              </button>
              <div className="grow" />
              <button className="btn btn-ghost" onClick={() => { const c = detail; setDetail(null); setEditing(c); }}>
                <Icon name="edit" size={16} /> עריכה
              </button>
              <button className="btn btn-ghost" onClick={() => { navigate('/diagnose', { state: { diagnoseClient: detail.id } }); }}>
                <Icon name="spark" size={16} /> אפיון
              </button>
              <button className="btn btn-primary" onClick={() => { navigate('/quotes', { state: { newForClient: detail.id } }); }}>
                <Icon name="doc" size={16} /> הצעת מחיר
              </button>
            </>
          )
        }
      >
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="row gap-2 wrap">
              <StatusBadge status={detail.status} />
              <span className="badge badge-neutral"><Icon name="briefcase" size={13} /> {detail.source}</span>
              <span className="badge badge-neutral"><Icon name="calendar" size={13} /> {formatDate(detail.date)}</span>
            </div>

            {/* Quick flow: ליד → אפיון → הצעה → פייפליין */}
            <div className="flow-row">
              <span className="flow-label">זרימה מהירה</span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/diagnose', { state: { diagnoseClient: detail.id } })}><Icon name="spark" size={14} /> אפיון</button>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/quotes', { state: { newForClient: detail.id } })}><Icon name="doc" size={14} /> הצעת מחיר</button>
              <div className="row gap-2" style={{ alignItems: 'center' }}>
                <select
                  className="select mini-select"
                  aria-label="שלב בפייפליין"
                  value={detail.pipelineStage || 'lead'}
                  onChange={(e) => { dispatch({ type: 'UPDATE_CLIENT', payload: { id: detail.id, pipelineStage: e.target.value } }); setDetail({ ...detail, pipelineStage: e.target.value }); toast('עודכן שלב בפייפליין'); }}
                >
                  {PIPELINE_STAGES.map((s) => <option key={s.id} value={s.id}>שלב: {s.label}</option>)}
                </select>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/pipeline')} title="פתח פייפליין"><Icon name="arrow" size={14} /></button>
              </div>
            </div>

            <div className="detail-grid">
              <div className="detail-item"><div className="k">שווי פרויקט</div><div className="v tnum" style={{ color: 'var(--lime-deep)', fontWeight: 700 }}>{formatCurrency(detail.value)}</div></div>
              <div className="detail-item"><div className="k">סוג פרויקט</div><div className="v">{detail.projectType}</div></div>
              <div className="detail-item"><div className="k">טלפון</div><div className="v" dir="ltr" style={{ textAlign: 'right' }}>{detail.phone || '—'}</div></div>
              <div className="detail-item"><div className="k">אימייל</div><div className="v" dir="ltr" style={{ textAlign: 'right' }}>{detail.email || '—'}</div></div>
            </div>

            {detail.notes && (
              <div>
                <div className="detail-item k" style={{ marginBottom: 6 }}>הערות</div>
                <p className="muted" style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>{detail.notes}</p>
              </div>
            )}

            {/* Client Profile slice 1 — the real snapshot, from existing data
                only: next action, tasks, diary, charges/balance, payments and
                quotes. Read-only; the write paths stay on their own screens. */}
            <ClientProfilePanel
              client={detail}
              data={data}
              appointments={appointments}
              scheduleState={scheduleState}
              userId={session?.user?.id || null}
              onOpen={(to, state) => { setDetail(null); navigate(to, state ? { state } : undefined); }}
            />

            <div className="row gap-2">
              {waLink(detail.phone) && (
                <a className="btn btn-ghost grow" href={waLink(detail.phone)} target="_blank" rel="noreferrer">
                  <Icon name="whatsapp" size={17} /> וואטסאפ
                </a>
              )}
              {detail.phone && (
                <a className="btn btn-ghost grow" href={`tel:${detail.phone}`}>
                  <Icon name="phone" size={16} /> חיוג
                </a>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        message={`למחוק את "${toDelete?.name}"? הפעולה תמחק גם את הצעות המחיר המקושרות ואינה ניתנת לשחזור.`}
      />
    </div>
  );
}
