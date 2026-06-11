import { useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/store.jsx';
import Icon from '../components/ui/Icon.jsx';

export default function Login() {
  const { signIn, toast } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setErr('יש למלא אימייל וסיסמה'); return; }
    setBusy(true);
    setErr('');
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) {
      setErr('האימייל או הסיסמה שגויים');
    } else {
      toast('התחברת בהצלחה');
    }
  };

  return (
    <div className="login-screen">
      <motion.div
        className="login-card card"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="login-brand">
          <div className="brand-mark" style={{ width: 52, height: 52, borderRadius: 16 }}>
            <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true">
              <path d="M20 44 L32 18 L44 44" fill="none" stroke="var(--on-lime)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="25" y1="37" x2="39" y2="37" stroke="var(--on-lime)" strokeWidth="5.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="brand-name" style={{ fontSize: '1.3rem' }}>Art Value</div>
            <div className="brand-sub">מערכת ניהול עסקית</div>
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: 6 }}>התחברות</h1>
          <p className="muted" style={{ fontSize: '0.9rem' }}>הזן את פרטי ההתחברות שלך כדי להמשיך</p>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field">
            <label>אימייל</label>
            <input
              className="input" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@email.com" dir="ltr" style={{ textAlign: 'right' }}
              autoComplete="username" autoFocus
            />
          </div>
          <div className="field">
            <label>סיסמה</label>
            <input
              className="input" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" dir="ltr" style={{ textAlign: 'right' }}
              autoComplete="current-password"
            />
          </div>

          {err && (
            <div className="login-error">
              <Icon name="x" size={15} strokeWidth={2.4} /> {err}
            </div>
          )}

          <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={busy ? { opacity: 0.7 } : undefined}>
            {busy ? 'מתחבר…' : <>התחברות <Icon name="arrow" size={18} /></>}
          </button>
        </form>

        <p className="dim" style={{ fontSize: '0.76rem', marginTop: 20, textAlign: 'center', lineHeight: 1.6 }}>
          הגישה מאובטחת דרך Supabase Auth · נתונים מוצפנים בענן
        </p>
      </motion.div>
    </div>
  );
}
