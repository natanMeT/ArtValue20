import { useMemo, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import Icon from '../components/ui/Icon.jsx';
import Modal from '../components/ui/Modal.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import ProjectModal from '../components/forms/ProjectModal.jsx';
import TaskModal from '../components/forms/TaskModal.jsx';
import { EmptyState } from '../components/ui/atoms.jsx';
import { StudioBadge } from './Projects.jsx';
import {
  PROJECT_STATUS, TASK_STATUS, TASK_PRIORITY, LINK_CATEGORIES, FILE_TYPES, FILE_STATUS,
  COMM_TYPES, serviceLabel, labelOf, studioBadgeClass,
} from '../data/studio.js';
import { formatCurrency, formatDate, formatDateShort } from '../lib/format.js';
import { putFile, deleteFile as deleteStoredFile, openStoredFile, downloadStoredFile, guessFileType, formatBytes, MAX_BYTES } from '../lib/fileStore.js';
import { quoteTotal } from '../lib/calc.js';

const TABS = [
  { id: 'overview', label: 'סקירה' },
  { id: 'tasks', label: 'משימות' },
  { id: 'links', label: 'קישורים' },
  { id: 'files', label: 'קבצים' },
  { id: 'quotes', label: 'הצעות ותשלומים' },
  { id: 'comm', label: 'תקשורת' },
  { id: 'notes', label: 'הערות' },
];

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, dispatch, toast } = useStore();
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);

  const project = (data.projects || []).find((p) => p.id === id);
  if (!project) {
    return (
      <div className="card"><EmptyState icon="briefcase" title="הפרויקט לא נמצא" hint="ייתכן שנמחק" action={<button className="btn btn-primary" onClick={() => navigate('/projects')}>חזרה לפרויקטים</button>} /></div>
    );
  }

  const saveProject = (p) => { dispatch({ type: 'UPDATE_PROJECT', payload: p }); toast('הפרויקט עודכן'); setEditing(false); };

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/projects')} style={{ marginBottom: 14 }}>
        <Icon name="chevronR" size={16} /> כל הפרויקטים
      </button>

      {/* Header */}
      <div className="card panel project-head">
        <div className="row between wrap" style={{ gap: 14 }}>
          <div>
            <h2 style={{ fontSize: '1.5rem' }}>{project.name}</h2>
            <div className="muted" style={{ marginTop: 4 }}>{project.clientName} · {serviceLabel(project.serviceType)}</div>
          </div>
          <div className="row gap-2">
            <StudioBadge id={project.status} list={PROJECT_STATUS} />
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}><Icon name="edit" size={15} /> עריכה</button>
          </div>
        </div>
        <div className="head-stats">
          <div><div className="k">שווי</div><div className="v tnum">{project.internal ? 'פנימי' : formatCurrency(project.value)}</div></div>
          <div><div className="k">דדליין</div><div className="v">{project.deadline ? formatDate(project.deadline) : 'פתוח'}</div></div>
          <div><div className="k">התקדמות</div><div className="v tnum">{project.progress || 0}%</div></div>
          <div><div className="k">פעולה הבאה</div><div className="v" style={{ color: 'var(--lime-deep)' }}>{project.nextAction || '—'}</div></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {tab === t.id && <motion.span layoutId="tab-underline" className="tab-underline" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
          </button>
        ))}
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
        {tab === 'overview' && <OverviewTab project={project} />}
        {tab === 'tasks' && <TasksTab project={project} data={data} dispatch={dispatch} toast={toast} />}
        {tab === 'links' && <LinksTab project={project} data={data} dispatch={dispatch} toast={toast} />}
        {tab === 'files' && <FilesTab project={project} data={data} dispatch={dispatch} toast={toast} />}
        {tab === 'quotes' && <QuotesTab project={project} data={data} navigate={navigate} />}
        {tab === 'comm' && <CommTab project={project} data={data} dispatch={dispatch} toast={toast} />}
        {tab === 'notes' && <NotesTab project={project} dispatch={dispatch} toast={toast} />}
      </motion.div>

      <ProjectModal open={editing} onClose={() => setEditing(false)} onSave={saveProject} clients={data.clients} initial={project} />
    </div>
  );
}

/* ---------------- Overview ---------------- */
function OverviewTab({ project }) {
  const Row = ({ k, v }) => <div className="detail-item"><div className="k">{k}</div><div className="v">{v || '—'}</div></div>;
  return (
    <div className="bento">
      <div className="card panel b-span-7">
        <div className="panel-title" style={{ marginBottom: 14 }}>פרטי פרויקט</div>
        <div className="detail-grid">
          <Row k="לקוח" v={project.clientName} />
          <Row k="סוג שירות" v={serviceLabel(project.serviceType)} />
          <Row k="שווי" v={project.internal ? 'פנימי' : formatCurrency(project.value)} />
          <Row k="דדליין" v={project.deadline ? formatDate(project.deadline) : 'פתוח'} />
        </div>
        <div style={{ marginTop: 16 }}>
          <div className="detail-item k" style={{ marginBottom: 5 }}>תיאור</div>
          <p className="muted" style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>{project.description || '—'}</p>
        </div>
      </div>
      <div className="card panel b-span-5">
        <div className="panel-title" style={{ marginBottom: 14 }}>סטטוס והתקדמות</div>
        <div className="row between" style={{ fontSize: '0.8rem', marginBottom: 6 }}>
          <span className="dim">התקדמות</span><span className="tnum" style={{ fontWeight: 700 }}>{project.progress || 0}%</span>
        </div>
        <div className="progress-track" style={{ marginBottom: 18 }}><span className="progress-fill" style={{ width: `${project.progress || 0}%` }} /></div>
        <div className="next-action" style={{ marginBottom: 12 }}><Icon name="arrow" size={14} /><span><b>פעולה הבאה:</b> {project.nextAction || '—'}</span></div>
        <div className="detail-item" style={{ marginBottom: 10 }}><div className="k">חסר מהלקוח</div><div className="v">{project.missing || '—'}</div></div>
        <div className="detail-item"><div className="k">תוצרים למסירה</div><div className="v">{project.deliverables || '—'}</div></div>
      </div>
    </div>
  );
}

/* ---------------- Tasks tab ---------------- */
function TasksTab({ project, data, dispatch, toast }) {
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const tasks = (data.tasks || []).filter((t) => t.projectId === project.id);

  const save = (task) => {
    if (task.id) dispatch({ type: 'UPDATE_TASK', payload: task });
    else dispatch({ type: 'ADD_TASK', payload: { ...task, projectId: project.id } });
    toast('נשמר'); setEditing(null);
  };
  const setStatus = (t, status) => dispatch({ type: 'UPDATE_TASK', payload: { id: t.id, status } });

  return (
    <div className="card panel">
      <div className="panel-head"><div className="panel-title">משימות הפרויקט ({tasks.length})</div><button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> משימה</button></div>
      {tasks.length === 0 ? <EmptyState icon="check" title="אין משימות" hint="הוסף משימה לפרויקט" /> : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>משימה</th><th>סטטוס</th><th>עדיפות</th><th>דדליין</th><th>אחראי</th><th style={{ textAlign: 'end' }}></th></tr></thead>
          <tbody>{tasks.map((t) => (
            <tr key={t.id} style={t.status === 'done' ? { opacity: 0.55 } : undefined}>
              <td style={{ fontWeight: 500 }}>{t.title}</td>
              <td><select className="select mini-select" value={t.status} onChange={(e) => setStatus(t, e.target.value)}>{TASK_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></td>
              <td><span className={`badge ${studioBadgeClass(t.priority)}`}><span className="dot" />{labelOf(TASK_PRIORITY, t.priority)}</span></td>
              <td className="muted" style={{ whiteSpace: 'nowrap' }}>{t.deadline ? formatDateShort(t.deadline) : '—'}</td>
              <td className="muted">{t.assignee}</td>
              <td><div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
                <button className="icon-action" onClick={() => setEditing(t)} aria-label="עריכה"><Icon name="edit" size={15} /></button>
                <button className="icon-action del" onClick={() => setToDelete(t)} aria-label="מחיקה"><Icon name="trash" size={15} /></button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <TaskModal open={!!editing} onClose={() => setEditing(null)} onSave={save} projects={data.projects || []} lockProjectId={project.id} initial={editing && editing !== 'new' ? editing : null} />
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)} onConfirm={() => { dispatch({ type: 'DELETE_TASK', id: toDelete.id }); toast('נמחק', 'error'); setToDelete(null); }} message={`למחוק את "${toDelete?.title}"?`} />
    </div>
  );
}

/* ---------------- Links tab ---------------- */
function LinksTab({ project, data, dispatch, toast }) {
  const blank = { name: '', category: 'design', url: '', shareWithClient: false, note: '' };
  const [form, setForm] = useState(null);
  const links = (data.plinks || []).filter((l) => l.projectId === project.id);
  const save = () => {
    if (!form.name.trim()) return;
    const payload = { ...form, projectId: project.id, clientId: project.clientId, updatedAt: new Date().toISOString().slice(0, 10) };
    if (form.id) dispatch({ type: 'UPDATE_LINK', payload }); else dispatch({ type: 'ADD_LINK', payload });
    toast('נשמר'); setForm(null);
  };
  return (
    <div className="card panel">
      <div className="panel-head"><div className="panel-title">קישורים ({links.length})</div><button className="btn btn-primary btn-sm" onClick={() => setForm(blank)}><Icon name="plus" size={16} /> קישור</button></div>
      {links.length === 0 ? <EmptyState icon="link" title="אין קישורים" hint="הוסף קישור לפרויקט" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {links.map((l) => (
            <div key={l.id} className="asset-row">
              <span className="activity-ico" style={{ width: 36, height: 36 }}><Icon name="link" size={16} /></span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row gap-2"><span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{l.name}</span><span className="badge badge-neutral">{labelOf(LINK_CATEGORIES, l.category)}</span>{l.shareWithClient && <span className="badge badge-completed"><span className="dot" />ללקוח</span>}</div>
                <div className="dim" style={{ fontSize: '0.76rem', marginTop: 2, direction: 'ltr', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url}{l.note ? ` · ${l.note}` : ''}</div>
              </div>
              <div className="row gap-2">
                {l.url && <a className="icon-action call" href={l.url} target="_blank" rel="noreferrer" aria-label="פתיחה"><Icon name="arrow" size={15} /></a>}
                <button className="icon-action" onClick={() => setForm(l)} aria-label="עריכה"><Icon name="edit" size={14} /></button>
                <button className="icon-action del" onClick={() => { dispatch({ type: 'DELETE_LINK', id: l.id }); toast('נמחק', 'error'); }} aria-label="מחיקה"><Icon name="trash" size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'עריכת קישור' : 'קישור חדש'} maxWidth={500}
        footer={<><button className="btn btn-ghost" onClick={() => setForm(null)}>ביטול</button><button className="btn btn-primary" onClick={save}>שמירה</button></>}>
        {form && (
          <div className="form-grid">
            <div className="field full"><label>שם הקישור</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="סקיצת אתר" autoFocus /></div>
            <div className="field"><label>קטגוריה</label><select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{LINK_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
            <div className="field"><label>שיתוף עם לקוח</label><select className="select" value={form.shareWithClient ? '1' : '0'} onChange={(e) => setForm({ ...form, shareWithClient: e.target.value === '1' })}><option value="0">לא</option><option value="1">כן</option></select></div>
            <div className="field full"><label>URL</label><input className="input" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" dir="ltr" style={{ textAlign: 'left' }} /></div>
            <div className="field full"><label>הערה</label><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------------- Files tab ---------------- */
function newFileId() { return `fl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

function FilesTab({ project, data, dispatch, toast }) {
  const blank = { name: '', fileType: 'image', status: 'received', url: '', note: '' };
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const uploadRef = useRef(null);
  const fileRef = useRef(null);
  const files = (data.pfiles || []).filter((f) => f.projectId === project.id);

  // Top-level "upload from computer" — stores bytes in IndexedDB, metadata in state.
  const onUpload = async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    if (!list.length) return;
    setBusy(true);
    try {
      for (const file of list) {
        if (file.size > MAX_BYTES) { toast(`«${file.name}» גדול מ-${Math.round(MAX_BYTES / 1024 / 1024)}MB ולא נשמר`, 'error'); continue; }
        const id = newFileId();
        await putFile(id, file);
        dispatch({ type: 'ADD_FILE', payload: { id, name: file.name, fileType: guessFileType(file.name, file.type), status: 'received', local: true, size: file.size, mime: file.type, note: '', projectId: project.id, clientId: project.clientId, uploadedAt: new Date().toISOString().slice(0, 10) } });
      }
      toast(`${list.length > 1 ? list.length + ' קבצים הועלו' : 'הקובץ הועלה'}`);
    } catch (err) {
      toast(err.message || 'שגיאה בהעלאת הקובץ', 'error');
    } finally { setBusy(false); }
  };

  // Attach a file to the metadata form (stored on save).
  const onFormFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) { toast(`הקובץ גדול מ-${Math.round(MAX_BYTES / 1024 / 1024)}MB`, 'error'); return; }
    setForm((f) => ({ ...f, _file: file, name: f.name || file.name, fileType: guessFileType(file.name, file.type), local: true, size: file.size, mime: file.type }));
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const id = form.id || newFileId();
      if (form._file) await putFile(id, form._file);
      const { _file, ...rest } = form;
      const payload = { ...rest, id, projectId: project.id, clientId: project.clientId, uploadedAt: form.uploadedAt || new Date().toISOString().slice(0, 10) };
      dispatch({ type: form.id ? 'UPDATE_FILE' : 'ADD_FILE', payload });
      toast('נשמר'); setForm(null);
    } catch (err) {
      toast(err.message || 'שגיאה בשמירה', 'error');
    } finally { setBusy(false); }
  };

  const removeFile = async (f) => {
    if (f.local) await deleteStoredFile(f.id);
    dispatch({ type: 'DELETE_FILE', id: f.id });
    toast('נמחק', 'error');
  };

  const openFile = async (f) => {
    try { if (f.local) await openStoredFile(f); else if (f.url) window.open(f.url, '_blank'); }
    catch (err) { toast(err.message || 'לא ניתן לפתוח את הקובץ', 'error'); }
  };

  return (
    <div className="card panel">
      <div className="panel-head">
        <div className="panel-title">קבצים ({files.length})</div>
        <div className="row gap-2">
          <input ref={uploadRef} type="file" multiple onChange={onUpload} style={{ display: 'none' }} />
          <button className="btn btn-primary btn-sm" onClick={() => uploadRef.current?.click()} disabled={busy}><Icon name="download" size={15} style={{ transform: 'rotate(180deg)' }} /> העלאה מהמחשב</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setForm(blank)} disabled={busy}><Icon name="link" size={15} /> קישור</button>
        </div>
      </div>
      {files.length === 0 ? <EmptyState icon="doc" title="אין קבצים" hint="העלה קובץ מהמחשב או הוסף קישור" /> : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>שם</th><th>סוג</th><th>גודל</th><th>סטטוס</th><th>תאריך</th><th style={{ textAlign: 'end' }}></th></tr></thead>
          <tbody>{files.map((f) => (
            <tr key={f.id}>
              <td style={{ fontWeight: 500 }}>
                <button className="link-btn" style={{ fontWeight: 500 }} onClick={() => openFile(f)}>{f.local && <Icon name="doc" size={13} style={{ marginInlineEnd: 5, opacity: 0.7 }} />}{f.name}</button>
              </td>
              <td><span className="badge badge-neutral">{labelOf(FILE_TYPES, f.fileType)}</span></td>
              <td className="muted" style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{f.local ? formatBytes(f.size) : '—'}</td>
              <td><span className={`badge ${studioBadgeClass(f.status)}`}><span className="dot" />{labelOf(FILE_STATUS, f.status)}</span></td>
              <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatDateShort(f.uploadedAt)}</td>
              <td><div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
                {f.local ? <button className="icon-action call" onClick={() => downloadStoredFile(f).catch(() => toast('הקובץ לא נמצא', 'error'))} aria-label="הורדה"><Icon name="download" size={15} /></button>
                  : f.url && <a className="icon-action call" href={f.url} target="_blank" rel="noreferrer" aria-label="פתיחה"><Icon name="arrow" size={15} /></a>}
                <button className="icon-action" onClick={() => setForm(f)} aria-label="עריכה"><Icon name="edit" size={14} /></button>
                <button className="icon-action del" onClick={() => removeFile(f)} aria-label="מחיקה"><Icon name="trash" size={14} /></button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'עריכת קובץ' : 'קובץ חדש'} maxWidth={500}
        footer={<><button className="btn btn-ghost" onClick={() => setForm(null)}>ביטול</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button></>}>
        {form && (
          <div className="form-grid">
            <div className="field full">
              <label>קובץ מהמחשב</label>
              <input ref={fileRef} type="file" onChange={onFormFile} style={{ display: 'none' }} />
              <button type="button" className="btn btn-ghost btn-block" onClick={() => fileRef.current?.click()}>
                <Icon name="download" size={15} style={{ transform: 'rotate(180deg)' }} /> {form._file || form.local ? `מצורף: ${form.name}${form.size ? ` (${formatBytes(form.size)})` : ''}` : 'בחר קובץ להעלאה'}
              </button>
            </div>
            <div className="field full"><label>שם הקובץ</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="logo.svg" /></div>
            <div className="field"><label>סוג</label><select className="select" value={form.fileType} onChange={(e) => setForm({ ...form, fileType: e.target.value })}>{FILE_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
            <div className="field"><label>סטטוס</label><select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{FILE_STATUS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
            {!form.local && <div className="field full"><label>קישור (אופציונלי)</label><input className="input" value={form.url || ''} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" dir="ltr" style={{ textAlign: 'left' }} /></div>}
            <div className="field full"><label>הערה</label><input className="input" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------------- Quotes & payments tab ---------------- */
function QuotesTab({ project, data, navigate }) {
  const quotes = data.quotes.filter((q) => q.clientId === project.clientId);
  return (
    <div className="card panel">
      <div className="panel-title" style={{ marginBottom: 14 }}>הצעות מחיר ותשלומים</div>
      {quotes.length === 0 ? <EmptyState icon="doc" title="אין הצעות מקושרות" hint="הצעות של לקוח זה יופיעו כאן" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {quotes.map((q) => {
            const total = quoteTotal(q);
            const deposit = Math.round(total * 0.5);
            return (
              <div key={q.id} className="asset-row">
                <span className="activity-ico" style={{ width: 38, height: 38 }}><Icon name="doc" size={17} /></span>
                <div className="grow">
                  <div className="row gap-2"><span style={{ fontWeight: 700 }}>{q.number}</span><span className={`badge ${studioBadgeClass(q.status === 'accepted' ? 'done' : q.status === 'rejected' ? 'lost' : 'quote_sent')}`}><span className="dot" />{q.status}</span></div>
                  <div className="dim" style={{ fontSize: '0.78rem', marginTop: 2 }}>מקדמה {formatCurrency(deposit)} · יתרה {formatCurrency(total - deposit)}</div>
                </div>
                <div className="row gap-3">
                  <span className="tnum" style={{ fontWeight: 800 }}>{formatCurrency(total)}</span>
                  <button className="icon-action call" onClick={() => window.open(`${window.location.pathname}#/quote/${q.id}/print`, '_blank')} aria-label="PDF"><Icon name="print" size={15} /></button>
                </div>
              </div>
            );
          })}
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => navigate('/quotes')}><Icon name="arrow" size={15} /> לכל ההצעות</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Communication tab ---------------- */
function CommTab({ project, data, dispatch, toast }) {
  const blank = { type: 'whatsapp', date: new Date().toISOString().slice(0, 10), summary: '', decisions: '', nextAction: '' };
  const [form, setForm] = useState(null);
  const comms = (data.comms || []).filter((c) => c.projectId === project.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const save = () => {
    if (!form.summary.trim()) return;
    if (form.id) dispatch({ type: 'UPDATE_COMM', payload: form }); else dispatch({ type: 'ADD_COMM', payload: { ...form, projectId: project.id } });
    toast('נשמר'); setForm(null);
  };
  return (
    <div className="card panel">
      <div className="panel-head"><div className="panel-title">תקשורת ({comms.length})</div><button className="btn btn-primary btn-sm" onClick={() => setForm(blank)}><Icon name="plus" size={16} /> רישום</button></div>
      {comms.length === 0 ? <EmptyState icon="whatsapp" title="אין רישומי תקשורת" hint="תעד שיחות, פגישות והחלטות" /> : (
        <div className="timeline">
          {comms.map((c) => (
            <div key={c.id} className="timeline-item">
              <span className="timeline-dot" />
              <div className="card" style={{ padding: 14, flex: 1 }}>
                <div className="row between"><span className="badge badge-neutral">{labelOf(COMM_TYPES, c.type)}</span><span className="dim" style={{ fontSize: '0.78rem' }}>{formatDate(c.date)}</span></div>
                <p style={{ fontSize: '0.92rem', marginTop: 8, lineHeight: 1.55 }}>{c.summary}</p>
                {c.decisions && <p className="muted" style={{ fontSize: '0.82rem', marginTop: 6 }}><b>החלטות:</b> {c.decisions}</p>}
                {c.nextAction && <p style={{ fontSize: '0.82rem', marginTop: 6, color: 'var(--lime-deep)' }}><b>הבא:</b> {c.nextAction}</p>}
                <div className="row gap-2" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
                  <button className="icon-action" onClick={() => setForm(c)} aria-label="עריכה"><Icon name="edit" size={13} /></button>
                  <button className="icon-action del" onClick={() => { dispatch({ type: 'DELETE_COMM', id: c.id }); toast('נמחק', 'error'); }} aria-label="מחיקה"><Icon name="trash" size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'עריכת רישום' : 'רישום תקשורת'} maxWidth={520}
        footer={<><button className="btn btn-ghost" onClick={() => setForm(null)}>ביטול</button><button className="btn btn-primary" onClick={save}>שמירה</button></>}>
        {form && (
          <div className="form-grid">
            <div className="field"><label>סוג</label><select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{COMM_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
            <div className="field"><label>תאריך</label><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} dir="ltr" style={{ textAlign: 'right' }} /></div>
            <div className="field full"><label>סיכום</label><textarea className="textarea" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} autoFocus /></div>
            <div className="field full"><label>החלטות</label><input className="input" value={form.decisions} onChange={(e) => setForm({ ...form, decisions: e.target.value })} /></div>
            <div className="field full"><label>פעולה הבאה</label><input className="input" value={form.nextAction} onChange={(e) => setForm({ ...form, nextAction: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------------- Notes tab ---------------- */
function NotesTab({ project, dispatch, toast }) {
  const [text, setText] = useState(project.internalNotes || '');
  const important = project.notesImportant || false;
  const save = () => { dispatch({ type: 'UPDATE_PROJECT', payload: { id: project.id, internalNotes: text } }); toast('ההערות נשמרו'); };
  return (
    <div className="card panel">
      <div className="panel-head">
        <div className="panel-title">הערות פנימיות</div>
        <button className={`btn btn-sm ${important ? 'btn-toggle-on' : 'btn-ghost'}`} onClick={() => dispatch({ type: 'UPDATE_PROJECT', payload: { id: project.id, notesImportant: !important } })}>
          <Icon name="spark" size={15} /> {important ? 'מסומן כחשוב' : 'סמן כחשוב'}
        </button>
      </div>
      <textarea className="textarea" style={{ minHeight: 200 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="הערות פנימיות לפרויקט (לא נשלח ללקוח)..." />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><button className="btn btn-primary btn-sm" onClick={save}><Icon name="check" size={15} /> שמירת הערות</button></div>
    </div>
  );
}
