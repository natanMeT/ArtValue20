import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from './store/store.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import Topbar from './components/layout/Topbar.jsx';
import Toaster from './components/ui/Toaster.jsx';
import Loader from './components/ui/Loader.jsx';
import Background from './components/layout/Background.jsx';
import Assistant from './components/ai/Assistant.jsx';
import DemoMode from './components/ai/DemoMode.jsx';
import { OnboardingOwner } from './components/onboarding/OnboardingWizard.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import Intake from './pages/Intake.jsx';
import Outreach from './pages/Outreach.jsx';
import Projects from './pages/Projects.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import Tasks from './pages/Tasks.jsx';
import Pipeline from './pages/Pipeline.jsx';
import Assets from './pages/Assets.jsx';
import Templates from './pages/Templates.jsx';
import Quotes from './pages/Quotes.jsx';
import Diagnose from './pages/Diagnose.jsx';
import ImageStudio from './pages/ImageStudio.jsx';
import AdStudio from './pages/AdStudio.jsx';
import Finance from './pages/Finance.jsx';
import Inventory from './pages/Inventory.jsx';
import Activity from './pages/Activity.jsx';
import Settings from './pages/Settings.jsx';
import QuotePrint from './pages/QuotePrint.jsx';
import BetaUnavailable from './components/ui/BetaUnavailable.jsx';
import { isSupabaseConfigured } from './lib/supabase.js';

// Growth OS — business-growth center (scaffold)
import Growth from './pages/growth/Growth.jsx';
import GrowthLeads from './pages/growth/GrowthLeads.jsx';
import GrowthCalendar from './pages/growth/GrowthCalendar.jsx';
import GrowthContentAds from './pages/growth/GrowthContentAds.jsx';
import Calls from './pages/growth/Calls.jsx';

// S0D containment: centralized route gate for the entire Growth OS. In
// authenticated cloud beta, direct navigation to ANY Growth route renders the
// truthful BetaUnavailable state instead of the page — its datasets + Ask-Jake
// prompt seeds are ArtValue-specific and not yet account-aware (deferred:
// "Account-aware Growth & Creative Context"). Local/demo renders the full
// Growth experience unchanged. Outreach is NOT part of Growth and stays LIVE.
function GrowthBetaGate({ title, sub, children }) {
  if (isSupabaseConfigured) return <BetaUnavailable title={title} sub={sub} />;
  return children;
}

function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // Interactive 3D tilt — large glass panels follow the cursor (Obsidian style)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    let active = null;
    const reset = (el) => { el.style.transform = ''; };
    const onMove = (e) => {
      const card = e.target.closest?.('.card.panel');
      if (active && active !== card) { reset(active); active = null; }
      if (!card || card.closest('.modal-overlay')) return;
      active = card;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      const MAX = 5; // degrees
      card.style.transform = `perspective(1100px) rotateX(${(-py * MAX).toFixed(2)}deg) rotateY(${(px * MAX).toFixed(2)}deg) translateY(-4px)`;
    };
    const onLeave = () => { if (active) { reset(active); active = null; } };
    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseleave', onLeave); };
  }, []);

  return (
    <div className="app-shell">
      <Background />
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="main-col">
        <Topbar onMenu={() => setNavOpen(true)} />
        <main className="content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              style={{ willChange: 'opacity' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <Assistant />
      <DemoMode />
      {/* S0E: guided business onboarding — global, cloud-only owner. Auto-opens
          once for an unconfigured/incomplete account after authoritative
          hydration; also opened by the Dashboard banner / Settings. */}
      <OnboardingOwner />
    </div>
  );
}

function MainRoutes() {
  return (
    <Routes>
      {/* Standalone clean printable quote — no app chrome */}
      <Route path="/quote/:id/print" element={<QuotePrint />} />

      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/intake" element={<Intake />} />
        <Route path="/outreach" element={<Outreach />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/quotes" element={<Quotes />} />
        <Route path="/diagnose" element={<Diagnose />} />
        <Route path="/studio" element={<ImageStudio />} />
        <Route path="/adstudio" element={<AdStudio />} />
        {/* R4.1 — retired local-engine studios. Legacy links land on Image Studio. */}
        <Route path="/workflow" element={<Navigate to="/studio" replace />} />
        <Route path="/fooocus" element={<Navigate to="/studio" replace />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/activity" element={<Activity />} />

        {/* Growth OS — business-growth center (S0D: beta-contained via GrowthBetaGate) */}
        <Route path="/growth" element={<GrowthBetaGate title="Growth OS" sub="מרכז הצמיחה העסקית — לידים, תכנון פעולה ושיחות"><Growth /></GrowthBetaGate>} />
        <Route path="/growth/leads" element={<GrowthBetaGate title="מיפוי לידים" sub="קטגוריות לידים ותוכנית פעולה"><GrowthLeads /></GrowthBetaGate>} />
        <Route path="/growth/calendar" element={<GrowthBetaGate title="לוח פעולה" sub="תוכנית פעולה חודשית"><GrowthCalendar /></GrowthBetaGate>} />
        <Route path="/growth/content" element={<GrowthBetaGate title="ספריית פרסום" sub="מאגר תבניות, פרומפטים ורעיונות פרסום"><GrowthContentAds /></GrowthBetaGate>} />
        <Route path="/calls" element={<GrowthBetaGate title="שיחות ופולואפים" sub="הכנה לשיחות מכירה"><Calls /></GrowthBetaGate>} />

        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  const { supabaseEnabled, authReady, session, loading } = useStore();

  let content;
  if (supabaseEnabled && !authReady) {
    content = <Loader label="מאתחל…" />;
  } else if (supabaseEnabled && !session) {
    content = <Login />;
  } else if (supabaseEnabled && loading) {
    content = <Loader label="טוען נתונים מהענן…" />;
  } else {
    content = <MainRoutes />;
  }

  return (
    <>
      {content}
      <Toaster />
    </>
  );
}
