// Formatting helpers (Hebrew / ILS)

export function formatCurrency(n, { decimals = 0 } = {}) {
  const num = Number(n) || 0;
  return (
    '₪' +
    num.toLocaleString('he-IL', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

export function formatNumber(n) {
  return (Number(n) || 0).toLocaleString('he-IL');
}

// Compact for axes / tight spaces: 48000 -> ₪48K
export function formatCompact(n) {
  const num = Number(n) || 0;
  if (Math.abs(num) >= 1000000) return '₪' + (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(num) >= 1000) return '₪' + Math.round(num / 1000) + 'K';
  return '₪' + num;
}

const MONTHS_HE = [
  'ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני',
  'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ',
];

export function monthLabel(dateStr) {
  const d = new Date(dateStr);
  return MONTHS_HE[d.getMonth()];
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

export function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`;
  if (days < 365) return `לפני ${Math.floor(days / 30)} חודשים`;
  return `לפני ${Math.floor(days / 365)} שנים`;
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export const STATUS_LABELS = {
  lead: 'ליד',
  active: 'פעיל',
  completed: 'הושלם',
  lost: 'אבוד',
  draft: 'טיוטה',
  sent: 'נשלחה',
  viewed: 'נצפתה',
  accepted: 'אושרה',
  rejected: 'נדחתה',
  await_material: 'ממתין לחומר',
  await_approval: 'ממתין לאישור',
  await_payment: 'ממתין לתשלום',
  completed_paid: 'הושלם · שולם',
  maintenance: 'תחזוקה',
};

export function statusClass(status) {
  switch (status) {
    case 'lead':
    case 'draft':
    case 'await_approval':
      return 'badge-lead';
    case 'active':
    case 'sent':
    case 'accepted':
      return 'badge-active';
    case 'completed':
    case 'completed_paid':
    case 'viewed':
    case 'maintenance':
      return 'badge-completed';
    case 'lost':
    case 'rejected':
      return 'badge-lost';
    case 'await_payment':
      return 'badge-payment';
    default:
      return 'badge-neutral';
  }
}
