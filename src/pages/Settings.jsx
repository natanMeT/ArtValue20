import { useRef, useState } from 'react';
import { useStore } from '../store/store.jsx';
import { ScrollReveal } from '../components/ui/motion.jsx';
import Icon from '../components/ui/Icon.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { SectionHeader } from '../components/ui/atoms.jsx';
import { buildDemoSeed } from '../data/seed.js';

export default function Settings() {
  const {
    data, dispatch, theme, toggleTheme, toast,
    supabaseEnabled, session, signOut, migrateFromLocal, importBackup,
  } = useStore();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmMigrate, setConfirmMigrate] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const reset = () => {
    dispatch({ type: 'RESET' });
    toast('כל הנתונים נוקו · נשמר מקומית');
  };

  const loadDemo = () => {
    dispatch({ type: 'IMPORT', payload: buildDemoSeed() });
    toast('נתוני הדגמה נטענו · נשמר מקומית');
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'artvalue-backup.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('הנתונים יוצאו לקובץ');
  };

  const importData = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.clients || !parsed.quotes || !parsed.transactions) throw new Error('bad');
        setBusy(true);
        const counts = await importBackup(parsed);
        toast(counts ? `יובאו ${counts.clients} לקוחות, ${counts.quotes} הצעות, ${counts.transactions} תנועות, ${counts.leads || 0} פניות` : 'הנתונים יובאו בהצלחה');
      } catch {
        toast('קובץ לא תקין או שגיאת ייבוא', 'error');
      } finally {
        setBusy(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const runMigrate = async () => {
    setBusy(true);
    try {
      const counts = await migrateFromLocal();
      toast(`הועלו לענן: ${counts.clients} לקוחות, ${counts.quotes} הצעות, ${counts.transactions} תנועות, ${counts.leads || 0} פניות`);
    } catch (err) {
      toast(err.message === 'אין נתונים מקומיים לייבוא' ? err.message : 'שגיאה בהעלאה לענן', 'error');
    } finally {
      setBusy(false);
    }
  };

  const stats = [
    { label: 'לקוחות', value: data.clients.length, icon: 'users' },
    { label: 'הצעות מחיר', value: data.quotes.length, icon: 'doc' },
    { label: 'תנועות', value: data.transactions.length, icon: 'wallet' },
  ];

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <SectionHeader
        title="הגדרות"
        sub="העדפות תצוגה וניהול נתונים"
        action={
          <span className={`badge ${supabaseEnabled ? 'badge-active' : 'badge-neutral'}`}>
            <Icon name={supabaseEnabled ? 'cloud' : 'spark'} size={13} />
            {supabaseEnabled ? 'מצב ענן · Supabase' : 'מצב מקומי'}
          </span>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Account (supabase mode) */}
        {supabaseEnabled && (
          <ScrollReveal>
            <div className="card panel">
              <div className="panel-title" style={{ marginBottom: 16 }}>חשבון</div>
              <div className="row between">
                <div className="row gap-3">
                  <span className="kpi-ico"><Icon name="lock" size={18} /></span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{session?.user?.email || 'מחובר'}</div>
                    <div className="dim" style={{ fontSize: '0.82rem' }}>מחובר · נתונים מסונכרנים בענן</div>
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={async () => { await signOut(); }}>
                  <Icon name="logout" size={17} /> התנתקות
                </button>
              </div>
            </div>
          </ScrollReveal>
        )}

        {/* Appearance */}
        <ScrollReveal delay={0.02}>
          <div className="card panel">
            <div className="panel-title" style={{ marginBottom: 16 }}>תצוגה</div>
            <div className="row between">
              <div className="row gap-3">
                <span className="kpi-ico"><Icon name={theme === 'dark' ? 'moon' : 'sun'} size={18} /></span>
                <div>
                  <div style={{ fontWeight: 600 }}>מצב תצוגה</div>
                  <div className="dim" style={{ fontSize: '0.82rem' }}>{theme === 'dark' ? 'כהה' : 'בהיר'}</div>
                </div>
              </div>
              <button className="btn btn-ghost" onClick={toggleTheme}>
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
                מעבר ל{theme === 'dark' ? 'בהיר' : 'כהה'}
              </button>
            </div>
          </div>
        </ScrollReveal>

        {/* Data overview */}
        <ScrollReveal delay={0.04}>
          <div className="card panel">
            <div className="panel-title" style={{ marginBottom: 16 }}>סקירת נתונים</div>
            <div className="stat-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {stats.map((s) => (
                <div key={s.label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 18px' }}>
                  <div className="row gap-2" style={{ color: 'var(--text-3)', marginBottom: 8 }}>
                    <Icon name={s.icon} size={16} /> <span style={{ fontSize: '0.82rem' }}>{s.label}</span>
                  </div>
                  <div className="tnum" style={{ fontSize: '1.6rem', fontWeight: 800 }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>

        {/* Data management */}
        <ScrollReveal delay={0.08}>
          <div className="card panel">
            <div className="panel-title" style={{ marginBottom: 6 }}>ניהול נתונים</div>
            <p className="dim" style={{ fontSize: '0.84rem', marginBottom: 16 }}>
              {supabaseEnabled
                ? 'הנתונים נשמרים בענן (Supabase) ומסונכרנים בין מכשירים.'
                : 'כל הנתונים נשמרים מקומית בדפדפן (localStorage) במצב הדגמה.'}
            </p>
            <div className="row gap-2 wrap">
              <button className="btn btn-ghost" onClick={exportData} disabled={busy}><Icon name="download" size={17} /> ייצוא גיבוי</button>
              <button className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy}><Icon name="copy" size={16} /> ייבוא קובץ</button>
              <input ref={fileRef} type="file" accept="application/json" onChange={importData} style={{ display: 'none' }} />
              <div className="grow" />
              <button className="btn btn-ghost" onClick={loadDemo} disabled={busy}><Icon name="spark" size={16} /> טען נתוני הדגמה</button>
              {supabaseEnabled ? (
                <button className="btn btn-ghost" onClick={() => setConfirmMigrate(true)} disabled={busy}>
                  <Icon name="cloud" size={17} /> ייבוא נתונים מקומיים ל-Supabase
                </button>
              ) : (
                <button className="btn btn-danger" onClick={() => setConfirmReset(true)}><Icon name="refresh" size={16} /> ניקוי כל הנתונים</button>
              )}
            </div>
          </div>
        </ScrollReveal>

        {/* Security note */}
        <ScrollReveal delay={0.12}>
          {supabaseEnabled ? (
            <div className="card panel" style={{ borderColor: 'rgba(212,255,63,0.25)' }}>
              <div className="row gap-2" style={{ marginBottom: 10 }}>
                <Icon name="cloud" size={18} style={{ color: 'var(--lime-deep)' }} />
                <div className="panel-title">מצב ענן · אבטחה</div>
              </div>
              <p className="muted" style={{ fontSize: '0.86rem', lineHeight: 1.7 }}>
                המערכת מחוברת ל-Supabase עם אימות משתמשים ו-Row Level Security — כל משתמש ניגש אך ורק לנתונים שלו.
                הנתונים מסונכרנים בין מכשירים ומגובים בענן. מומלץ לשמור גיבוי תקופתי (ייצוא JSON) ולהשתמש בסיסמה חזקה.
              </p>
            </div>
          ) : (
            <div className="card panel" style={{ borderColor: 'rgba(212,255,63,0.25)', background: 'color-mix(in srgb, var(--surface) 86%, #d4ff3f 14%)' }}>
              <div className="row gap-2" style={{ marginBottom: 10 }}>
                <Icon name="spark" size={18} style={{ color: 'var(--lime-deep)' }} />
                <div className="panel-title">מצב הדגמה · הערת אבטחה</div>
              </div>
              <p className="muted" style={{ fontSize: '0.86rem', lineHeight: 1.7 }}>
                המערכת פועלת במצב מקומי והנתונים נשמרים בדפדפן בלבד. כדי לעבור לאחסון אמיתי בענן עם התחברות,
                יש להגדיר משתני סביבה של Supabase (ראה .env.example) ולבנות מחדש. לפני נתונים אמיתיים נדרשים:
                אימות, הרשאות בצד שרת, גיבויים, ומשתני סביבה לסודות.
              </p>
            </div>
          )}
        </ScrollReveal>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={reset}
        title="ניקוי כל הנתונים"
        confirmLabel="נקה הכל"
        message="פעולה זו תמחק את כל הלקוחות, הפרויקטים, המשימות, ההצעות והתנועות (רעיונות הלידים יישמרו). אינה ניתנת לשחזור. להמשיך?"
      />

      <ConfirmDialog
        open={confirmMigrate}
        onClose={() => setConfirmMigrate(false)}
        onConfirm={runMigrate}
        title="ייבוא נתונים מקומיים לענן"
        confirmLabel="ייבוא לענן"
        danger={false}
        message="פעולה זו תקרא את הנתונים השמורים מקומית בדפדפן ותעלה אותם לחשבון שלך ב-Supabase. מומלץ להריץ פעם אחת בלבד כדי למנוע כפילויות. להמשיך?"
      />
    </div>
  );
}
