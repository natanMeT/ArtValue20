import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/store.jsx';
import Icon from '../components/ui/Icon.jsx';
import { formatCurrency, formatDate, addDays } from '../lib/format.js';
import { quoteSubtotal, quoteVat, quoteTotal } from '../lib/calc.js';
import '../styles/print.css';

export default function QuotePrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data } = useStore();
  const quote = data.quotes.find((q) => q.id === id);
  const client = quote && data.clients.find((c) => c.id === quote.clientId);

  if (!quote) {
    return (
      <div className="qp-screen">
        <div className="qp-sheet" style={{ textAlign: 'center', padding: 60 }}>
          <h2>ההצעה לא נמצאה</h2>
          <p style={{ color: '#666', marginTop: 8 }}>ייתכן שההצעה נמחקה.</p>
          <button className="qp-btn primary" style={{ marginTop: 20 }} onClick={() => navigate('/quotes')}>חזרה להצעות</button>
        </div>
      </div>
    );
  }

  return (
    <div className="qp-screen">
      {/* Toolbar — hidden on print */}
      <div className="qp-toolbar no-print">
        <button className="qp-btn" onClick={() => navigate('/quotes')}>
          <Icon name="chevronR" size={17} /> חזרה
        </button>
        <div style={{ flex: 1 }} />
        <button className="qp-btn primary" onClick={() => window.print()}>
          <Icon name="print" size={17} /> הדפסה / שמירה כ-PDF
        </button>
      </div>

      <div className="qp-sheet">
        {/* Header */}
        <div className="qp-head">
          <div className="qp-brand">
            <div className="qp-logo">
              <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true">
                <path d="M20 44 L32 18 L44 44" fill="none" stroke="#11160a" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="25" y1="37" x2="39" y2="37" stroke="#11160a" strokeWidth="5.5" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <div className="qp-brand-name">Art Value</div>
              <div className="qp-brand-sub">סטודיו למיתוג ועיצוב דיגיטלי</div>
            </div>
          </div>
          <div className="qp-doc-meta">
            <div className="qp-doc-title">הצעת מחיר</div>
            <div className="qp-doc-num">{quote.number}</div>
          </div>
        </div>

        {/* Parties */}
        <div className="qp-parties">
          <div>
            <div className="qp-label">לכבוד</div>
            <div className="qp-party-name">{client?.name || '—'}</div>
            {client?.contact && <div className="qp-party-line">{client.contact}</div>}
            {client?.phone && <div className="qp-party-line" dir="ltr">{client.phone}</div>}
            {client?.email && <div className="qp-party-line" dir="ltr">{client.email}</div>}
          </div>
          <div className="qp-dates">
            <div className="qp-date-row"><span>תאריך</span><strong>{formatDate(quote.date)}</strong></div>
            <div className="qp-date-row"><span>בתוקף עד</span><strong>{formatDate(addDays(quote.date, quote.validDays || 30))}</strong></div>
            <div className="qp-date-row"><span>מספר</span><strong>{quote.number}</strong></div>
          </div>
        </div>

        {/* Items */}
        <table className="qp-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'start' }}>תיאור</th>
              <th>כמות</th>
              <th>מחיר ליח׳</th>
              <th style={{ textAlign: 'end' }}>סה״כ</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((it) => (
              <tr key={it.id}>
                <td style={{ textAlign: 'start', fontWeight: 500 }}>{it.desc}</td>
                <td className="tnum">{it.qty}</td>
                <td className="tnum">{formatCurrency(it.price)}</td>
                <td className="tnum" style={{ textAlign: 'end', fontWeight: 600 }}>{formatCurrency(it.qty * it.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="qp-totals">
          <div className="qp-tot-row"><span>סכום ביניים</span><span className="tnum">{formatCurrency(quoteSubtotal(quote))}</span></div>
          <div className="qp-tot-row"><span>מע״מ ({quote.vatRate}%)</span><span className="tnum">{formatCurrency(quoteVat(quote))}</span></div>
          <div className="qp-tot-row grand"><span>סה״כ לתשלום</span><span className="tnum">{formatCurrency(quoteTotal(quote))}</span></div>
        </div>

        {/* Notes */}
        {quote.notes && (
          <div className="qp-notes">
            <div className="qp-label">הערות ותנאים</div>
            <p>{quote.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="qp-foot">
          <div>תודה על האמון · Art Value</div>
          <div>natanturgeman365@gmail.com</div>
        </div>
      </div>
    </div>
  );
}
