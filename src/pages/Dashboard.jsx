import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import { StaggerGroup, Reveal, ScrollReveal } from '../components/ui/motion.jsx';
import CountUp from '../components/ui/CountUp.jsx';
import Icon from '../components/ui/Icon.jsx';
import { StatusBadge } from '../components/ui/atoms.jsx';
import { FinancialBars, GaugeDonut, DonutChart, DONUT_COLORS } from '../components/charts/charts.jsx';
import { dashboardKpis, monthlySeries, clientBreakdown, momChange, quoteTotal, financeTotals } from '../lib/calc.js';
import { formatCurrency, formatCompact, relativeTime } from '../lib/format.js';

const STATUS_NAMES = { lead: 'לידים', active: 'פעילים', completed: 'הושלמו', lost: 'אבודים' };

/* Rich KPI card — icon tile + delta pill + progress bar (Obsidian style) */
function KpiRich({ label, value, money = true, decimals = 0, icon, accent, deltaText, deltaUp, progress = 0, delayed = false }) {
  return (
    <Reveal>
      <div className={`card kpi-rich glass-i ${accent ? 'accent' : ''} ${delayed ? 'animate-float-delayed' : 'animate-float'}`}>
        <div className="kpi-rich-top">
          <span className="kpi-tile"><Icon name={icon} size={20} /></span>
          {deltaText && <span className={`delta-pill ${deltaUp ? 'up' : 'down'}`}>{deltaText}</span>}
        </div>
        <div className="kpi-rich-label">{label}</div>
        <div className="kpi-rich-value tnum">
          <CountUp value={value} format={(n) => (money ? formatCurrency(n, { decimals }) : decimals ? n.toFixed(1) : String(Math.round(n)))} />
          {!money && decimals ? '%' : ''}
        </div>
        <div className="kpi-bar"><motion.span className="kpi-bar-fill" initial={{ width: 0 }} animate={{ width: `${Math.min(100, progress)}%` }} transition={{ duration: 1.92, ease: [0.16, 1, 0.3, 1], delay: 0.54 }} /></div>
      </div>
    </Reveal>
  );
}

export default function Dashboard() {
  const { data } = useStore();
  const navigate = useNavigate();

  const kpis = useMemo(() => dashboardKpis(data), [data]);
  const series = useMemo(() => monthlySeries(data.transactions, 12), [data.transactions]);
  const breakdown = useMemo(() => clientBreakdown(data.clients), [data.clients]);
  const revDelta = useMemo(() => momChange(data.transactions, 'income'), [data.transactions]);

  const metrics = useMemo(() => {
    const totals = financeTotals(data.transactions);
    const margin = totals.income ? Math.round((totals.net / totals.income) * 100) : 0;
    const activeDeals = (data.projects || []).filter((p) => p.status !== 'completed' && p.status !== 'frozen').length;
    const decided = data.quotes.filter((q) => ['accepted', 'rejected', 'sent', 'viewed'].includes(q.status));
    const accepted = data.quotes.filter((q) => q.status === 'accepted');
    const conversion = decided.length ? Math.round((accepted.length / decided.length) * 100) : 0;
    const newLeads = data.clients.filter((c) => c.status === 'lead').length;
    const avgProject = (data.projects || []).length ? Math.round(totals.income / (data.projects || []).length) : 0;
    const maxMonth = Math.max(...series.map((s) => s.income), 1);
    return { margin, activeDeals, conversion, newLeads, closed: accepted.length, avgProject, maxMonth };
  }, [data, series]);

  const donutData = ['active', 'lead', 'completed', 'lost']
    .map((k) => ({ key: k, name: STATUS_NAMES[k], value: breakdown[k] || 0 }))
    .filter((d) => d.value > 0);

  // operational snapshot
  const ops = useMemo(() => {
    const DAY = 86400000;
    const tasks = data.tasks || [];
    const isToday = (d) => d && new Date(d).toDateString() === new Date().toDateString();
    const inDays = (d, n) => { if (!d) return false; const diff = new Date(d).getTime() - Date.now(); return diff >= -DAY && diff <= n * DAY; };
    const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : 999);
    const open = tasks.filter((t) => t.status !== 'done');
    return {
      open, week: open.filter((t) => inDays(t.deadline, 7)),
      stuck: data.clients.filter((c) => ['lead', 'active', 'await_material', 'await_approval'].includes(c.status) && daysSince(c.nextActionDate || c.date) > 5),
    };
  }, [data]);
  const projName = (id) => (data.projects || []).find((p) => p.id === id)?.name || '';

  // recent activity (latest quotes)
  const activity = useMemo(() =>
    [...data.quotes]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .map((q) => ({ id: q.id, client: data.clients.find((c) => c.id === q.clientId)?.name || 'לקוח', number: q.number, amount: quoteTotal(q), status: q.status })),
  [data.quotes, data.clients]);

  const growthText = revDelta != null ? `${revDelta >= 0 ? 'צמח' : 'ירד'} ב-${Math.abs(revDelta).toFixed(1)}%` : 'יציב';

  return (
    <div>
      {/* Hero greeting */}
      <motion.section className="hero-greeting" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.44, ease: [0.16, 1, 0.3, 1] }}>
        <div>
          <h1 className="hero-title">ברוך שובך, נתן</h1>
          <p className="hero-sub">הפייפליין שלך <span className="hl">{growthText}</span> החודש. בוא נסגור עוד עסקאות.</p>
        </div>
        <div className="row gap-3 wrap">
          <button className="btn btn-primary" onClick={() => navigate('/intake')}><Icon name="userPlus" size={18} /> ליד חדש</button>
          <button className="btn btn-ghost" onClick={() => navigate('/finance')}><Icon name="download" size={17} /> הפקת דוח</button>
          <button className="btn btn-ghost" onClick={() => window.dispatchEvent(new CustomEvent('artvalue:demo:open'))}><Icon name="spark" size={17} /> מצב הדגמה</button>
        </div>
      </motion.section>

      {/* KPI + performance */}
      <div className="dash-top">
        <StaggerGroup className="kpi-quad">
          <KpiRich label="הכנסות החודש" value={kpis.revenue} icon="wallet" accent deltaText={revDelta != null ? `${revDelta >= 0 ? '+' : ''}${revDelta.toFixed(0)}%` : null} deltaUp={(revDelta || 0) >= 0} progress={(kpis.revenue / metrics.maxMonth) * 100} />
          <KpiRich label="עסקאות פעילות" value={metrics.activeDeals} money={false} icon="briefcase" deltaText={`${metrics.activeDeals}`} deltaUp progress={Math.min(100, metrics.activeDeals * 14)} delayed />
          <KpiRich label="אחוז המרה" value={metrics.conversion} money={false} decimals={1} icon="trendUp" accent deltaText={`${metrics.conversion}%`} deltaUp progress={metrics.conversion} delayed />
          <KpiRich label="לידים חדשים" value={metrics.newLeads} money={false} icon="users" deltaText="New" deltaUp progress={Math.min(100, metrics.newLeads * 22)} />
        </StaggerGroup>

        <ScrollReveal className="perf-card-wrap">
          <div className="card panel perf-card glass-i">
            <div className="panel-title" style={{ marginBottom: 6 }}>ביצועים כלליים</div>
            <div className="dim" style={{ fontSize: '0.78rem', marginBottom: 8 }}>שיעור רווחיות שנתי</div>
            <div className="gauge-wrap">
              <div className="perf-rings spin-slow">
                <span className="ring" style={{ width: 196, height: 196 }} />
                <span className="ring" style={{ width: 168, height: 168 }} />
              </div>
              <GaugeDonut value={metrics.margin} height={170} />
              <div className="gauge-center">
                <span className="big tnum">{metrics.margin}%</span>
                <span className="small">רווחיות</span>
              </div>
            </div>
            <div className="perf-stats">
              <div><div className="dim" style={{ fontSize: '0.72rem' }}>עסקאות שנסגרו</div><div className="tnum" style={{ fontWeight: 800, fontSize: '1.15rem' }}>{metrics.closed}</div></div>
              <div style={{ borderInlineStart: '1px solid var(--border)', paddingInlineStart: 16 }}><div className="dim" style={{ fontSize: '0.72rem' }}>ממוצע / פרויקט</div><div className="tnum" style={{ fontWeight: 800, fontSize: '1.15rem' }}>{formatCompact(metrics.avgProject)}</div></div>
            </div>
          </div>
        </ScrollReveal>
      </div>

      {/* Financial summary + client donut */}
      <div className="bento">
        <ScrollReveal className="b-span-8">
          <div className="card panel" style={{ height: '100%' }}>
            <div className="panel-head">
              <div><div className="panel-title">סיכום פיננסי חודשי</div><div className="sub">הכנסות מול הוצאות · 12 חודשים</div></div>
              <div className="legend">
                <span className="legend-item"><span className="legend-dot" style={{ background: '#d4ff3f' }} />הכנסות</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#c7bfff' }} />הוצאות</span>
              </div>
            </div>
            <FinancialBars data={series} />
          </div>
        </ScrollReveal>

        <ScrollReveal className="b-span-4" delay={0.05}>
          <div className="card panel" style={{ height: '100%' }}>
            <div className="panel-head"><div><div className="panel-title">פילוח לקוחות</div><div className="sub">לפי סטטוס</div></div></div>
            <div className="donut-wrap">
              <DonutChart data={donutData} height={180} />
              <div className="donut-center"><span className="big tnum">{data.clients.length}</span><span className="small">לקוחות</span></div>
            </div>
            <div className="donut-legend">
              {donutData.map((d) => (
                <div className="donut-legend-row" key={d.key}><span className="legend-dot" style={{ background: DONUT_COLORS[d.key], borderRadius: 9 }} /><span className="nm">{d.name}</span><span className="vl tnum">{d.value}</span></div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </div>

      {/* Recent activity table */}
      <ScrollReveal style={{ marginTop: 16 }}>
        <div className="card panel">
          <div className="panel-head">
            <div className="panel-title">פעילות אחרונה</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/quotes')}>כל ההצעות <Icon name="arrow" size={15} /></button>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>לקוח / הצעה</th><th>שווי עסקה</th><th>סטטוס</th><th>אחראי</th><th style={{ textAlign: 'end' }}>פעולה</th></tr></thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="row gap-3">
                        <span className="client-ava" style={{ width: 36, height: 36, fontSize: '0.85rem', borderRadius: 11 }}>{a.client.slice(0, 2)}</span>
                        <div><div style={{ fontWeight: 600 }}>{a.client}</div><div className="dim" style={{ fontSize: '0.76rem' }}>{a.number}</div></div>
                      </div>
                    </td>
                    <td className="tnum" style={{ fontWeight: 700 }}>{formatCurrency(a.amount)}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td><div className="row gap-2"><span className="assignee-ava">נ</span><span className="muted">נתן</span></div></td>
                    <td><div className="row" style={{ justifyContent: 'flex-end' }}><button className="icon-action" onClick={() => navigate('/quotes')} aria-label="פתיחה"><Icon name="arrow" size={15} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ScrollReveal>

      {/* Operational area (our addition) */}
      <div className="bento">
        <ScrollReveal className="b-span-6">
          <div className="card panel" style={{ height: '100%' }}>
            <div className="panel-head"><div className="panel-title">היום ב-ArtValue</div><button className="btn btn-ghost btn-sm" onClick={() => navigate('/tasks')}>כל המשימות <Icon name="arrow" size={15} /></button></div>
            {ops.open.length === 0 ? <p className="dim" style={{ fontSize: '0.88rem', padding: '8px 0' }}>אין משימות פתוחות 🎉</p> : (
              <div className="activity-list">
                {ops.open.slice(0, 5).map((t) => (
                  <div className="activity-row" key={t.id}>
                    <span className="activity-ico"><Icon name="check" size={16} /></span>
                    <div className="activity-main"><div className="t">{t.title}</div><div className="s">{projName(t.projectId)}</div></div>
                    <span className={`badge ${t.priority === 'urgent' ? 'badge-lost' : t.priority === 'high' ? 'badge-payment' : 'badge-neutral'}`}>{t.deadline ? relativeTime(t.deadline) : 'ללא דדליין'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollReveal>
        <ScrollReveal className="b-span-6" delay={0.05}>
          <div className="card panel" style={{ height: '100%' }}>
            <div className="panel-head"><div className="panel-title">דורש תשומת לב</div><button className="btn btn-ghost btn-sm" onClick={() => navigate('/pipeline')}>פייפליין <Icon name="arrow" size={15} /></button></div>
            {ops.stuck.length === 0 ? <p className="dim" style={{ fontSize: '0.88rem', padding: '8px 0' }}>אין לקוחות תקועים — כל הכבוד!</p> : (
              <div className="activity-list">
                {ops.stuck.slice(0, 5).map((c) => (
                  <div className="activity-row" key={c.id} onClick={() => navigate('/clients')} style={{ cursor: 'pointer' }}>
                    <span className="activity-ico"><Icon name="clock" size={16} /></span>
                    <div className="activity-main"><div className="t">{c.name}</div><div className="s">{c.nextAction || 'אין פעולה מתוכננת'}</div></div>
                    <span className="badge badge-lost"><span className="dot" />תקוע</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollReveal>
      </div>
    </div>
  );
}
