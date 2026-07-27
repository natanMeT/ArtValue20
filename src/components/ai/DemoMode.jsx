// ===================================================================
// Demo Mode — a guided, in-app walkthrough of the whole Art Value platform
// (CRM + creative studio + ג'יק), with LIVE assistant examples. Built for showing
// the system to a new user or client: it explains each area in plain Hebrew and
// lets them fire real ג'יק commands (propose→confirm→execute) from inside the tour.
//
// Availability: in LOCAL/demo mode it auto-opens once per browser (localStorage);
// in authenticated cloud mode it is MANUAL-ONLY (see shouldAutoOpenDemo below).
// In both modes it opens on the global `artvalue:demo:open` event (the Dashboard
// "מצב הדגמה" button dispatches it). Driving ג'יק is done via the `jake:ask` /
// `jake:open` window events the Assistant listens to.
// ===================================================================
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Icon from '../ui/Icon.jsx';
import { isSupabaseConfigured } from '../../lib/supabase.js';

const SEEN_KEY = 'artvalue_demo_seen_v1';

// Pure: may this tour open itself on a first visit? In authenticated cloud mode
// the S0E guided business onboarding is the ONLY automatic first-run flow — on a
// fresh browser both would otherwise open at once over each other — so the legacy
// tour is manual-only there and its seen key is never consulted or written
// implicitly. Local/demo keeps the original once-per-browser behavior exactly.
export function shouldAutoOpenDemo({ cloudMode, seen } = {}) {
  if (cloudMode) return false;
  return !seen;
}

// Each step: what it explains, where to look, and (optionally) live ג'יק examples.
const STEPS = [
  {
    icon: 'spark',
    title: 'ברוכים הבאים ל-Art Value',
    body: 'זו מערכת ההפעלה של הסטודיו — שלוש מערכות בבית אחד:\n• CRM מלא (לקוחות, לידים, פייפליין, פרויקטים, הצעות מחיר, פיננסים, מלאי).\n• סטודיו תמונות (תיאור בעברית → תמונה עסקית, בענן).\n• ג׳יק — עוזר חכם שמבין עברית ומבצע פעולות אמיתיות.\n\nהסיור קצר — נעבור על הכל ביחד.',
  },
  {
    icon: 'dashboard',
    title: 'לוח הבקרה',
    body: 'מסך הבית מציג את התמונה המלאה: הכנסות החודש, עסקאות פעילות, אחוז המרה, ולידים חדשים — בזמן אמת. למטה: סיכום פיננסי של 12 חודשים, פילוח לקוחות, ומה דורש תשומת לב היום.',
    to: '/',
    look: 'צפה בלוח הבקרה',
  },
  {
    icon: 'users',
    title: 'לקוחות · לידים · פייפליין',
    body: 'כאן מנהלים את כל מערכת היחסים: כל לקוח עם סטטוס, שווי, פעולה הבאה ושלב בפייפליין. דף ההפניות (Outreach) אוסף לידים פוטנציאליים, וג׳יק יכול לחקור ולהוסיף לידים חדשים.',
    to: '/clients',
    look: 'צפה בלקוחות',
  },
  {
    icon: 'briefcase',
    title: 'פרויקטים · משימות',
    body: 'כל עסקה שנסגרת הופכת לפרויקט עם משימות, קבצים, קישורים ותקשורת. המשימות מתחברות ללוח הבקרה כדי שתמיד תדע מה פתוח, מה באיחור, ומה להיום.',
    to: '/projects',
    look: 'צפה בפרויקטים',
  },
  {
    icon: 'wallet',
    title: 'הצעות מחיר · פיננסים',
    body: 'בונים הצעת מחיר עם חישוב מע״מ אוטומטי ומספור, מסמנים תשלום, ורואים הכנסות/הוצאות/רווח — הכל מתעדכן אוטומטית. ג׳יק יכול לבנות הצעת מחיר שלמה בפקודה אחת.',
    to: '/finance',
    look: 'צפה בפיננסים',
  },
  {
    icon: 'image',
    title: 'סטודיו התמונות',
    body: 'כותבים תיאור בעברית ומקבלים תמונה עסקית — לוגו, מוצר, באנר או תמונת נושא. היצירה רצה בענן המאובטח של החשבון שלך, ואפשר לשמור לגלריה, לערוך פוסטר או להרכיב מוקאפ.',
    to: '/studio',
    look: 'צפה בסטודיו',
  },
  {
    icon: 'robot',
    title: 'ג׳יק — העוזר החכם',
    body: 'דבר עם ג׳יק בעברית רגילה. הוא עונה על שאלות מנתוני אמת, מנסח לך מכתבים והודעות, ומבצע פעולות — אבל כל פעולה מוצגת לך ככרטיס לאישור לפני שהיא קורית. כלום לא משתנה בלי האישור שלך.\n\nנסה אותו עכשיו:',
    tries: [
      'מה חשוב היום?',
      'הוסף לקוח דנה לוי, ליד, שווי 5000 ₪',
      'נסח הודעת וואטסאפ קצרה ללקוח שמזמינה לפגישת אפיון',
    ],
  },
  {
    icon: 'check',
    title: 'מוכן להתחיל 🚀',
    body: 'זהו — ראית את הכל. אפשר לפתוח את הסיור שוב בכל רגע מכפתור "מצב הדגמה" בלוח הבקרה. ג׳יק תמיד זמין בפינה השמאלית-תחתונה. בהצלחה!',
  },
];

export default function DemoMode() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  // Auto-open once per browser (local/demo only — see shouldAutoOpenDemo), and on
  // the global open event (Dashboard button) in BOTH modes. The listener is
  // registered unconditionally and outside the try, so the manual opener stays
  // available in cloud mode and survives a throwing localStorage.
  useEffect(() => {
    try {
      if (shouldAutoOpenDemo({ cloudMode: isSupabaseConfigured, seen: !!localStorage.getItem(SEEN_KEY) })) { setStep(0); setOpen(true); }
    } catch { /* ignore */ }
    const onOpen = () => { setStep(0); setOpen(true); };
    window.addEventListener('artvalue:demo:open', onOpen);
    return () => window.removeEventListener('artvalue:demo:open', onOpen);
  }, []);

  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ } };
  const close = () => { markSeen(); setOpen(false); };
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  const runExample = (q) => {
    markSeen();
    setOpen(false); // step aside so the user watches ג'יק work
    window.dispatchEvent(new CustomEvent('jake:ask', { detail: q }));
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="demo-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <motion.div
            className="demo-card card"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
          >
            <button className="demo-x" onClick={close} aria-label="סגירה"><Icon name="x" size={18} /></button>

            <div className="demo-progress">
              {STEPS.map((_, i) => <span key={i} className={`demo-dot ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`} />)}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.26 }}
              >
                <div className="demo-icon"><Icon name={s.icon} size={26} /></div>
                <div className="demo-step-n">שלב {step + 1} מתוך {STEPS.length}</div>
                <h2 className="demo-title">{s.title}</h2>
                <p className="demo-body">{s.body}</p>

                {s.look && (
                  <button className="btn btn-ghost demo-look" onClick={() => navigate(s.to)}>
                    <Icon name="arrow" size={16} /> {s.look}
                  </button>
                )}

                {s.tries && (
                  <div className="demo-tries">
                    {s.tries.map((q) => (
                      <button key={q} className="demo-try" onClick={() => runExample(q)}>
                        <Icon name="send" size={14} /> {q}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="demo-nav">
              <button className="btn btn-ghost btn-sm" onClick={close}>דלג</button>
              <div className="row gap-2">
                {step > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setStep((x) => x - 1)}>הקודם</button>}
                {last
                  ? <button className="btn btn-primary btn-sm" onClick={close}>סיום</button>
                  : <button className="btn btn-primary btn-sm" onClick={() => setStep((x) => x + 1)}>הבא <Icon name="arrow" size={15} /></button>}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
