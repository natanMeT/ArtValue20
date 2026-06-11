import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useStore } from '../../store/store.jsx';
import { formatCompact, formatCurrency } from '../../lib/format.js';

const LIME = '#d4ff3f'; // Obsidian electric lime
const BLUE = '#c7bfff'; // Iris — secondary series (e.g. expenses)

function useChartTheme() {
  const { theme } = useStore();
  const dark = theme === 'dark';
  return {
    dark,
    axis: dark ? '#7c8079' : '#8b8f83',
    grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(20,22,15,0.07)',
    tipBg: dark ? '#1d1f21' : '#ffffff',
    tipBorder: dark ? 'rgba(255,255,255,0.1)' : 'rgba(20,22,15,0.1)',
    muted: dark ? '#3a3d39' : '#cfd2c6',
  };
}

function TipBox({ active, payload, label, t }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: t.tipBg,
        border: `1px solid ${t.tipBorder}`,
        borderRadius: 12,
        padding: '10px 13px',
        boxShadow: '0 12px 30px -14px rgba(0,0,0,0.5)',
        fontSize: '0.82rem',
      }}
    >
      {label && <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 9, background: p.color || p.payload?.fill }} />
          <span>{p.name}</span>
          <strong className="tnum" style={{ color: 'var(--text)', marginInlineStart: 'auto' }}>
            {formatCurrency(p.value)}
          </strong>
        </div>
      ))}
    </div>
  );
}

// ---------------- Revenue vs Expenses (area) ----------------
export function RevenueExpenseChart({ data, height = 260 }) {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 6, left: 6, bottom: 0 }}>
        <defs>
          <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={LIME} stopOpacity={0.45} />
            <stop offset="100%" stopColor={LIME} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BLUE} stopOpacity={0.28} />
            <stop offset="100%" stopColor={BLUE} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: t.axis, fontSize: 12 }} dy={6} reversed />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={formatCompact} width={46} orientation="right" />
        <Tooltip content={(p) => <TipBox {...p} t={t} />} />
        <Area type="monotone" dataKey="income" name="הכנסות" stroke={LIME} strokeWidth={1.6} fill="url(#gRev)" />
        <Area type="monotone" dataKey="expense" name="הוצאות" stroke={BLUE} strokeWidth={1.4} fill="url(#gExp)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------- Monthly bar with current month highlighted ----------------
export function MonthlyBarChart({ data, height = 220 }) {
  const t = useChartTheme();
  const lastKey = data[data.length - 1]?.key;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 6, left: 6, bottom: 0 }} barCategoryGap="32%">
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: t.axis, fontSize: 12 }} dy={6} reversed />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={formatCompact} width={46} orientation="right" />
        <Tooltip cursor={{ fill: t.grid }} content={(p) => <TipBox {...p} t={t} />} />
        <Bar dataKey="net" name="רווח נקי" radius={[3, 3, 3, 3]}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.key === lastKey ? LIME : t.muted} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------- Monthly financial summary (grouped bars) ----------------
export function FinancialBars({ data, height = 260 }) {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 6, left: 6, bottom: 0 }} barGap={4} barCategoryGap="26%">
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: t.axis, fontSize: 12 }} dy={6} reversed />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={formatCompact} width={46} orientation="right" />
        <Tooltip cursor={{ fill: t.grid }} content={(p) => <TipBox {...p} t={t} />} />
        <Bar dataKey="income" name="הכנסות" fill={LIME} radius={[5, 5, 5, 5]} />
        <Bar dataKey="expense" name="הוצאות" fill={t.muted} radius={[5, 5, 5, 5]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------- Single-value gauge donut (performance) ----------------
export function GaugeDonut({ value = 0, height = 190, color = LIME }) {
  const t = useChartTheme();
  const v = Math.max(0, Math.min(100, value));
  const data = [{ name: 'v', value: v }, { name: 'r', value: 100 - v }];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" innerRadius="72%" outerRadius="92%" startAngle={90} endAngle={-270} stroke="none" cornerRadius={10}>
          <Cell fill={color} />
          <Cell fill={t.muted} />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

// ---------------- Trend line with gradient fill ----------------
export function TrendLineChart({ data, dataKey = 'income', height = 200 }) {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 6, left: 6, bottom: 0 }}>
        <defs>
          <linearGradient id="gTrend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={LIME} stopOpacity={0.4} />
            <stop offset="100%" stopColor={LIME} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: t.axis, fontSize: 11 }} dy={6} reversed />
        <Tooltip content={(p) => <TipBox {...p} t={t} />} />
        <Area type="monotone" dataKey={dataKey} name="הכנסות" stroke={LIME} strokeWidth={1.8} fill="url(#gTrend)" dot={false} activeDot={{ r: 3, fill: LIME }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------------- Donut ----------------
const DONUT_COLORS = {
  active: '#d4ff3f',
  lead: '#8f937a',
  completed: '#c7bfff',
  lost: '#5a5a52',
};

export function DonutChart({ data, height = 200 }) {
  const t = useChartTheme();
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="62%"
          outerRadius="92%"
          paddingAngle={3}
          stroke="none"
          startAngle={90}
          endAngle={-270}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={DONUT_COLORS[d.key] || t.muted} />
          ))}
        </Pie>
        <Tooltip content={(p) => <TipBox {...p} t={t} />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export { DONUT_COLORS };
