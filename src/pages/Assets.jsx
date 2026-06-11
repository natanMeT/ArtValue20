import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/store.jsx';
import { ScrollReveal } from '../components/ui/motion.jsx';
import Icon from '../components/ui/Icon.jsx';
import { SectionHeader, EmptyState } from '../components/ui/atoms.jsx';
import { LINK_CATEGORIES, FILE_TYPES, labelOf } from '../data/studio.js';
import { formatDateShort } from '../lib/format.js';
import { openStoredFile, downloadStoredFile } from '../lib/fileStore.js';

const FILTERS = [
  { id: 'all', label: 'הכל' },
  { id: 'links', label: 'קישורים' },
  { id: 'files', label: 'קבצים' },
  { id: 'logos', label: 'לוגואים' },
  { id: 'websites', label: 'אתרים' },
  { id: 'canva', label: 'Canva' },
  { id: 'drive', label: 'Drive' },
  { id: 'github', label: 'GitHub' },
  { id: 'pdf', label: 'PDF' },
  { id: 'zip', label: 'ZIP' },
];

export default function Assets() {
  const { data } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  const clientName = (id) => data.clients.find((c) => c.id === id)?.name || '—';
  const projName = (id) => (data.projects || []).find((p) => p.id === id)?.name || '—';

  const rows = useMemo(() => {
    const links = (data.plinks || []).map((l) => ({
      kind: 'link', id: l.id, name: l.name, typeLabel: labelOf(LINK_CATEGORIES, l.category),
      category: l.category, url: l.url, clientId: l.clientId, projectId: l.projectId, date: l.updatedAt,
    }));
    const files = (data.pfiles || []).map((f) => ({
      kind: 'file', id: f.id, name: f.name, typeLabel: labelOf(FILE_TYPES, f.fileType),
      fileType: f.fileType, url: f.url, local: f.local, size: f.size, mime: f.mime, name_: f.name,
      clientId: f.clientId, projectId: f.projectId, date: f.uploadedAt,
    }));
    return [...links, ...files];
  }, [data.plinks, data.pfiles]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'links' && r.kind !== 'link') return false;
      if (filter === 'files' && r.kind !== 'file') return false;
      if (filter === 'logos' && r.fileType !== 'logo') return false;
      if (filter === 'websites' && r.category !== 'website') return false;
      if (filter === 'pdf' && r.fileType !== 'pdf') return false;
      if (filter === 'zip' && r.fileType !== 'zip') return false;
      if (['canva', 'drive', 'github'].includes(filter) && !(r.url || '').toLowerCase().includes(filter)) return false;
      if (!term) return true;
      return [r.name, r.url, clientName(r.clientId), projName(r.projectId), r.typeLabel].some((v) => (v || '').toLowerCase().includes(term));
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [rows, q, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <SectionHeader title="קבצים וקישורים" sub="חיפוש וניהול כל הנכסים הדיגיטליים של כל הלקוחות" />

      <div className="toolbar">
        <div className="search-box">
          <span className="ico"><Icon name="search" size={18} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש קובץ, קישור, לקוח או פרויקט..." />
        </div>
        <div className="filter-tabs hide-scroll" style={{ overflowX: 'auto', maxWidth: '100%' }}>
          {FILTERS.map((f) => (
            <button key={f.id} className={`filter-tab ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
      </div>

      <ScrollReveal>
        <div className="card panel">
          {list.length === 0 ? (
            <EmptyState icon="link" title="לא נמצאו נכסים" hint="נסה חיפוש או סינון אחר" />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>שם</th><th>סוג</th><th>לקוח</th><th>פרויקט</th><th>עודכן</th><th style={{ textAlign: 'end' }}>פעולה</th></tr></thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={`${r.kind}-${r.id}`}>
                      <td>
                        <div className="row gap-3">
                          <span className="activity-ico" style={{ width: 34, height: 34 }}><Icon name={r.kind === 'link' ? 'link' : 'doc'} size={15} /></span>
                          <span style={{ fontWeight: 500 }}>{r.name}</span>
                        </div>
                      </td>
                      <td><span className="badge badge-neutral">{r.typeLabel}</span></td>
                      <td className="muted">{clientName(r.clientId)}</td>
                      <td className="muted">
                        <button className="link-btn" onClick={() => r.projectId && navigate(`/projects/${r.projectId}`)}>{projName(r.projectId)}</button>
                      </td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatDateShort(r.date)}</td>
                      <td>
                        <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
                          {r.local
                            ? <button className="icon-action call" onClick={() => (r.fileType === 'image' || r.fileType === 'pdf' ? openStoredFile(r) : downloadStoredFile(r))} aria-label="פתיחה"><Icon name="arrow" size={15} /></button>
                            : r.url ? <a className="icon-action call" href={r.url} target="_blank" rel="noreferrer" aria-label="פתיחה"><Icon name="arrow" size={15} /></a>
                              : <span className="dim" style={{ fontSize: '0.78rem' }}>—</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ScrollReveal>
    </div>
  );
}
