import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../../store/store.jsx';
import Icon from '../ui/Icon.jsx';

const TITLES = {
  '/': { title: 'דאשבורד', sub: 'סקירה כללית של העסק' },
  '/clients': { title: 'לקוחות', sub: 'ניהול קשרי לקוחות' },
  '/intake': { title: 'ליד חדש', sub: 'קליטת לקוח פוטנציאלי' },
  '/outreach': { title: 'מחקר לידים', sub: 'רעיונות ללידים ופניות קרות' },
  '/projects': { title: 'פרויקטים', sub: 'ניהול עבודות, סטטוסים, קבצים ומשימות לפי לקוח' },
  '/tasks': { title: 'משימות', sub: 'ניהול עבודה יומית לפי לקוחות ופרויקטים' },
  '/pipeline': { title: 'פייפליין', sub: 'ניהול מכירות והתקדמות לקוחות' },
  '/assets': { title: 'קבצים וקישורים', sub: 'כל הנכסים הדיגיטליים של כל הלקוחות' },
  '/templates': { title: 'תבניות', sub: 'תבניות מוכנות לפתיחת פרויקטים ומשימות' },
  '/quotes': { title: 'הצעות מחיר', sub: 'בנייה ומעקב הצעות' },
  '/diagnose': { title: 'אבחון AI', sub: 'ניתוח לקוח ואסטרטגיית מכירה' },
  '/studio': { title: 'מחולל תמונות', sub: 'יצירת גרפיקה עם Nano Banana' },
  '/finance': { title: 'פיננסים', sub: 'הכנסות, הוצאות ורווחיות' },
  '/settings': { title: 'הגדרות', sub: 'העדפות וניהול נתונים' },
};

const MOTIVATIONS = [
  'עבודה מעולה על העסקה האחרונה! 🎯',
  'אתה 12% מעל היעד החודש!',
  'משוב מלקוח: "חרגת מהציפיות"',
  'דחוף קדימה בפייפליין — אתה כמעט שם!',
  'הצלחה היא סדרה של ניצחונות קטנים.',
];

export default function Topbar({ onMenu }) {
  const { theme, toggleTheme, supabaseEnabled, signOut, toast } = useStore();
  const { pathname } = useLocation();
  const meta = TITLES[pathname] || (pathname.startsWith('/projects/') ? { title: 'תיק פרויקט', sub: 'ניהול עבודה, משימות וקבצים' } : TITLES['/']);

  const [motiv, setMotiv] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setMotiv((m) => (m + 1) % MOTIVATIONS.length), 6000);
    return () => clearInterval(id);
  }, []);

  const handleLogout = async () => { await signOut(); toast('התנתקת מהמערכת'); };

  return (
    <header className="topbar">
      <div className="row gap-3">
        <button className="btn btn-ghost btn-icon menu-btn" onClick={onMenu} aria-label="תפריט">
          <Icon name="menu" size={20} />
        </button>
        <div>
          <h1 className="topbar-title">{meta.title}</h1>
          <p className="topbar-sub muted">{meta.sub}</p>
        </div>
      </div>

      <div className="row gap-3">
        <div className="motiv-banner topbar-motiv">
          <span key={motiv} className="motiv-text banner-enter">{MOTIVATIONS[motiv]}</span>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={toggleTheme} aria-label="החלפת מצב תצוגה">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
        {supabaseEnabled && (
          <button className="btn btn-ghost btn-icon" onClick={handleLogout} aria-label="התנתקות" title="התנתקות">
            <Icon name="logout" size={18} />
          </button>
        )}
        <div className="topbar-user">
          <div className="topbar-user-text">
            <p className="u-name">נתן תורג׳מן</p>
            <p className="u-role">מנהל מערכת</p>
          </div>
          <div className="avatar avatar-glow" title="נתן תורג'מן"><span>נ</span></div>
        </div>
      </div>
    </header>
  );
}
