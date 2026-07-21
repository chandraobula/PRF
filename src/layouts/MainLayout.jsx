import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Settings, Sparkles, DollarSign, Car, Briefcase, BookOpen,
  Coffee, FileText, Link2, Search, Bell, MoreHorizontal, X, ChevronRight,
  CalendarDays, RefreshCw, CalendarClock, StickyNote,
} from 'lucide-react';
import { cn } from '../lib/utils';
import ThemeToggle from '../components/ThemeToggle';
import ContextBar from '../components/ContextBar';
import { getCurrentAccount } from '../services/authApi';
import { notifyUnauthorized } from '../lib/session';

const navItems = [
  { icon: Home, label: 'Dashboard', path: '/dashboard' },
  { icon: Briefcase, label: 'Work Hub', path: '/work' },
  { icon: DollarSign, label: 'Finance Hub', path: '/finance' },
  { icon: Car, label: 'Car Hub', path: '/car' },
  { icon: BookOpen, label: 'Learning Hub', path: '/learning' },
  { icon: Coffee, label: 'Pantry', path: '/pantry' },
  { icon: CalendarDays, label: 'Meal Planner', path: '/meal-plan' },
  { icon: RefreshCw, label: 'Subscriptions', path: '/subscriptions' },
  { icon: CalendarClock, label: 'Important Dates', path: '/dates' },
  { icon: StickyNote, label: 'Notes', path: '/notes' },
  { icon: FileText, label: 'Documents', path: '/documents' },
  { icon: Link2, label: 'Connected Services', path: '/services' },
];

const mobileTabs = [
  { icon: Home, label: 'Today', path: '/dashboard' },
  { icon: Briefcase, label: 'Work', path: '/work' },
  { icon: Sparkles, label: 'Ask', path: '/ai-assistant', featured: true },
  { icon: DollarSign, label: 'Money', path: '/finance' },
];

const pageNames = {
  '/dashboard': 'Today', '/finance': 'Money', '/car': 'My car', '/work': 'Work',
  '/learning': 'Learning', '/pantry': 'Pantry', '/meal-plan': 'Meal Planner',
  '/subscriptions': 'Subscriptions', '/dates': 'Important Dates', '/notes': 'Notes', '/documents': 'Documents',
  '/services': 'Services', '/ai-assistant': 'LifeOS AI', '/settings': 'Settings',
};

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const pageName = pageNames[location.pathname] || 'LifeOS';

  useEffect(() => setMoreOpen(false), [location.pathname]);

  // Keep the session warm while the app is open, and log out if it has expired.
  useEffect(() => {
    const ping = async () => {
      const result = await getCurrentAccount();
      if (result && result.authenticated === false) {
        notifyUnauthorized();
      }
    };
    const timer = setInterval(ping, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="app-shell flex h-dvh bg-background overflow-hidden">
      <aside className="hidden lg:flex w-[272px] shrink-0 bg-surface-card border-r border-border-subtle flex-col">
        <div className="h-20 px-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-[14px] bg-primary text-white flex items-center justify-center shadow-sm"><Sparkles className="w-5 h-5" /></div>
          <div><p className="font-display font-bold text-xl leading-none">LifeOS</p><p className="text-[11px] text-text-muted mt-1">Your day, simplified</p></div>
        </div>
        <nav className="flex-1 px-3 py-4 overflow-y-auto" aria-label="Main navigation">
          <p className="px-3 mb-2 text-[11px] font-bold tracking-[0.12em] uppercase text-text-muted">Your spaces</p>
          <div className="space-y-1">
            {navItems.map(({ icon: Icon, label, path }) => {
              const active = location.pathname === path;
              return <Link key={path} to={path} className={cn('min-h-12 flex items-center gap-3 px-3 rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary', active ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-low')} aria-current={active ? 'page' : undefined}><Icon className="w-5 h-5" /><span>{label}</span></Link>;
            })}
          </div>
        </nav>
        <div className="p-3 border-t border-border-subtle">
          <Link to="/settings" className="min-h-12 flex items-center gap-3 px-3 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low">
            <div className="w-9 h-9 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-bold text-xs">JD</div>
            <div className="flex-1 min-w-0"><p className="text-on-surface truncate">John Doe</p><p className="text-xs font-normal text-text-muted">View profile</p></div><Settings className="w-4 h-4" />
          </Link>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="mobile-app-bar lg:h-20 lg:px-8 lg:border-b lg:border-border-subtle lg:bg-surface-card/90 lg:backdrop-blur-xl flex items-center justify-between shrink-0">
          <div className="min-w-0"><ContextBar /><h1 className="font-display text-[22px] lg:text-xl font-bold tracking-tight">{pageName}</h1></div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => navigate('/documents')} className="icon-button" aria-label="Search"><Search className="w-5 h-5" /></button>
            <ThemeToggle />
            <button type="button" className="icon-button relative" aria-label="Notifications"><Bell className="w-5 h-5" /><span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-secondary ring-2 ring-surface-card" /></button>
            <button type="button" onClick={() => navigate('/ai-assistant')} className="hidden lg:flex min-h-11 items-center gap-2 px-4 ml-1 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90"><Sparkles className="w-4 h-4" /> Ask LifeOS</button>
          </div>
        </header>
        <div className="app-content flex-1 overflow-y-auto overscroll-contain"><Outlet /></div>
      </main>

      <nav className="mobile-bottom-nav lg:hidden" aria-label="Primary navigation">
        {mobileTabs.map(({ icon: Icon, label, path, featured }) => {
          const active = location.pathname === path;
          return <Link key={path} to={path} className={cn('bottom-nav-item', featured && 'bottom-nav-featured', active && 'is-active')} aria-current={active ? 'page' : undefined}><span className="bottom-nav-icon"><Icon className="w-5 h-5" /></span><span>{label}</span></Link>;
        })}
        <button type="button" onClick={() => setMoreOpen(true)} className={cn('bottom-nav-item', moreOpen && 'is-active')} aria-expanded={moreOpen}><span className="bottom-nav-icon"><MoreHorizontal className="w-5 h-5" /></span><span>More</span></button>
      </nav>

      {moreOpen && <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More destinations">
        <button className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={() => setMoreOpen(false)} aria-label="Close menu" />
        <section className="more-sheet absolute inset-x-0 bottom-0 bg-surface-card rounded-t-[28px] shadow-2xl">
          <div className="w-10 h-1 rounded-full bg-surface-container-highest mx-auto mt-2" />
          <div className="flex items-center justify-between px-5 pt-4 pb-3"><div><h2 className="font-display text-xl font-bold">More</h2><p className="text-sm text-text-muted">Everything else in your LifeOS</p></div><button className="icon-button bg-surface-container-low" onClick={() => setMoreOpen(false)} aria-label="Close menu"><X className="w-5 h-5" /></button></div>
          <div className="px-3 pb-2">
            {navItems.slice(3).map(({ icon: Icon, label, path }) => <Link key={path} to={path} className="flex items-center min-h-14 px-3 rounded-xl hover:bg-surface-container-low active:bg-surface-container"><span className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center mr-3"><Icon className="w-5 h-5" /></span><span className="font-semibold flex-1">{label}</span><ChevronRight className="w-5 h-5 text-text-muted" /></Link>)}
            <Link to="/settings" className="flex items-center min-h-14 px-3 rounded-xl hover:bg-surface-container-low"><span className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center mr-3"><Settings className="w-5 h-5" /></span><span className="font-semibold flex-1">Settings</span><ChevronRight className="w-5 h-5 text-text-muted" /></Link>
          </div>
        </section>
      </div>}
    </div>
  );
}
