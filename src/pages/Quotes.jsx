import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { StaggerGroup, Reveal } from '../components/ui/motion.jsx';
import Icon from '../components/ui/Icon.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import QuoteModal from '../components/forms/QuoteModal.jsx';
import { StatusBadge, SectionHeader, EmptyState } from '../components/ui/atoms.jsx';
import { QUOTE_STATUS, uid } from '../data/seed.js';
import { formatCurrency, formatDate, STATUS_LABELS } from '../lib/format.js';
import { quoteTotal } from '../lib/calc.js';

const FILTERS = [{ key: 'all', label: 'הכל' }, ...QUOTE_STATUS.map((s) => ({ key: s, label: STATUS_LABELS[s] }))];

function waLink(phone, text) {
  const digits = (phone || '').replace(/\D/g, '');
  const intl = digits.startsWith('0') ? '972' + digits.slice(1) : digits;
  const base = digits ? `https://wa.me/${intl}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}

export default function Quotes() {
  const { data, dispatch, toast } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null); // 'new' | quote
  const [preset, setPreset] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [convertOffer, setConvertOffer] = useState(null);

  const clientName = (id) => data.clients.find((c) => c.id === id)?.name || 'לקוח לא ידוע';
  const clientPhone = (id) => data.clients.find((c) => c.id === id)?.phone || '';

  // open builder pre-filled when navigated from a client
  useEffect(() => {
    if (location.state?.newForClient) {
      setPreset(location.state.newForClient);
      setEditing('new');
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const arr = filter === 'all' ? data.quotes : data.quotes.filter((q) => q.status === filter);
    return [...arr].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [data.quotes, filter]);

  const counts = useMemo(() => {
    const m = { all: data.quotes.length };
    QUOTE_STATUS.forEach((s) => (m[s] = data.quotes.filter((q) => q.status === s).length));
    return m;
  }, [data.quotes]);

  const save = (quote) => {
    if (quote.id) {
      dispatch({ type: 'UPDATE_QUOTE', payload: quote });
      toast('ההצעה עודכנה · נשמר מקומית');
    } else {
      dispatch({ type: 'ADD_QUOTE', payload: quote });
      toast('הצעת מחיר נוצרה · נשמר מקומית');
    }
    setEditing(null);
    setPreset(null);
  };

  const setStatus = (quote, status) => {
    dispatch({ type: 'UPDATE_QUOTE', payload: { id: quote.id, status } });
    toast(`סטטוס עודכן: ${STATUS_LABELS[status]}`);
    if (status === 'accepted') setConvertOffer(quote);
  };

  const toProject = (quote) => {
    const id = uid('pr');
    const client = data.clients.find((c) => c.id === quote.clientId);
    dispatch({
      type: 'ADD_PROJECT',
      payload: {
        id, name: `פרויקט — ${clientName(quote.clientId)}`, clientId: quote.clientId,
        clientName: client?.name || 'לקוח', serviceType: 'website', value: quoteTotal(quote),
        status: 'active', deadline: '', nextAction: 'תיאום התחלת עבודה', progress: 0,
        description: `נוצר מהצעת מחיר ${quote.number}.`, missing: '', deliverables: '', internal: false,
      },
    });
    toast('נוצר פרויקט מההצעה');
    setConvertOffer(null);
    navigate(`/projects/${id}`);
  };

  const remove = () => {
    if (!toDelete) return;
    dispatch({ type: 'DELETE_QUOTE', id: toDelete.id });
    toast('ההצעה נמחקה', 'error');
    setToDelete(null);
  };

  const shareLink = (quote) => {
    const url = `${window.location.origin}${window.location.pathname}#/quote/${quote.id}/print`;
    navigator.clipboard?.writeText(url).then(
      () => toast('קישור להצעה הועתק'),
      () => toast('לא ניתן להעתיק', 'error')
    );
  };

  const openPrint = (quote) => {
    window.open(`${window.location.pathname}#/quote/${quote.id}/print`, '_blank');
  };

  const total = data.quotes.reduce((s, q) => s + quoteTotal(q), 0);

  return (
    <div>
      <SectionHeader
        title="הצעות מחיר"
        sub={`${data.quotes.length} הצעות · שווי כולל ${formatCurrency(total)}`}
        action={
          <button className="btn btn-primary" onClick={() => { setPreset(null); setEditing('new'); }} disabled={data.clients.length === 0}>
            <Icon name="plus" size={18} /> הצעה חדשה
          </button>
        }
      />

      <div className="toolbar">
        <div className="filter-tabs" style={{ marginInlineEnd: 'auto' }}>
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
            icon="doc"
            title="אין הצעות מחיר"
            hint={data.clients.length === 0 ? 'הוסף לקוח תחילה כדי ליצור הצעה' : 'צור את הצעת המחיר הראשונה'}
            action={data.clients.length > 0 && <button className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={18} /> הצעה חדשה</button>}
          />
        </div>
      ) : (
        <StaggerGroup className="client-grid">
          {list.map((quote) => (
            <Reveal key={quote.id}>
              <motion.div className="card panel" whileHover={{ scale: 1.015, y: -2 }} transition={{ duration: 0.2 }} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 19 }}>
                <div className="row between">
                  <div className="row gap-3">
                    <span className="activity-ico"><Icon name="doc" size={18} /></span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>{quote.number}</div>
                      <div className="dim" style={{ fontSize: '0.78rem' }}>{clientName(quote.clientId)}</div>
                    </div>
                  </div>
                  <StatusBadge status={quote.status} />
                </div>

                <div className="row between" style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div>
                    <div className="dim" style={{ fontSize: '0.72rem' }}>סה״כ כולל מע״מ</div>
                    <div className="tnum" style={{ fontSize: '1.25rem', fontWeight: 800 }}>{formatCurrency(quoteTotal(quote))}</div>
                  </div>
                  <div className="dim" style={{ fontSize: '0.78rem', textAlign: 'end' }}>
                    <div>{formatDate(quote.date)}</div>
                    <div>{quote.items.length} פריטים</div>
                  </div>
                </div>

                {/* status selector */}
                <select className="select" value={quote.status} onChange={(e) => setStatus(quote, e.target.value)} style={{ height: 38, padding: '0 36px 0 12px', fontSize: '0.84rem' }}>
                  {QUOTE_STATUS.map((s) => <option key={s} value={s}>שינוי סטטוס · {STATUS_LABELS[s]}</option>)}
                </select>

                {quote.status === 'accepted' && (
                  <button className="btn btn-primary btn-sm btn-block" onClick={() => toProject(quote)}>
                    <Icon name="briefcase" size={16} /> הפוך לפרויקט
                  </button>
                )}

                <div className="row gap-2 wrap">
                  <button className="icon-action call" onClick={() => openPrint(quote)} title="תצוגה / PDF" aria-label="הדפסה"><Icon name="print" size={16} /></button>
                  <button className="icon-action" onClick={() => shareLink(quote)} title="העתקת קישור" aria-label="קישור"><Icon name="link" size={16} /></button>
                  <a className="icon-action wa" href={waLink(clientPhone(quote.clientId), `שלום, מצורפת הצעת מחיר ${quote.number} מ-Art Value על סך ${formatCurrency(quoteTotal(quote))}.`)} target="_blank" rel="noreferrer" title="שליחה בוואטסאפ" aria-label="וואטסאפ"><Icon name="whatsapp" size={17} /></a>
                  <div className="grow" />
                  <button className="icon-action" onClick={() => setEditing(quote)} title="עריכה" aria-label="עריכה"><Icon name="edit" size={16} /></button>
                  <button className="icon-action del" onClick={() => setToDelete(quote)} title="מחיקה" aria-label="מחיקה"><Icon name="trash" size={16} /></button>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </StaggerGroup>
      )}

      <QuoteModal
        open={!!editing}
        onClose={() => { setEditing(null); setPreset(null); }}
        onSave={save}
        clients={data.clients}
        quotes={data.quotes}
        initial={editing && editing !== 'new' ? editing : null}
        presetClientId={preset}
      />

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        message={`למחוק את הצעת המחיר ${toDelete?.number}? פעולה זו אינה ניתנת לשחזור.`}
      />

      <ConfirmDialog
        open={!!convertOffer}
        onClose={() => setConvertOffer(null)}
        onConfirm={() => toProject(convertOffer)}
        title="ההצעה אושרה 🎉"
        confirmLabel="צור פרויקט"
        danger={false}
        message={`ליצור פרויקט חדש מהצעת המחיר ${convertOffer?.number} עבור ${clientName(convertOffer?.clientId)}?`}
      />
    </div>
  );
}
