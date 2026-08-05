import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Settings, Sparkles, DollarSign, Car, Briefcase, BookOpen,
  Coffee, FileText, Link2, Search, Bell, MoreHorizontal, X, ChevronRight,
  CalendarDays, RefreshCw, CalendarClock, StickyNote, ShieldCheck, LogOut,
  ChevronDown, LayoutDashboard, ClipboardList, FileInput, Megaphone,
  Gauge, FolderKanban, Library, BarChart3,
} from 'lucide-react';
import { cn } from '../lib/utils';
import ThemeToggle from '../components/ThemeToggle';
import { getCurrentAccount, logoutAccount } from '../services/authApi';
import { notifyUnauthorized, isAdmin } from '../lib/session';

const navItems = [
  { icon: Home, label: 'Dashboard', path: '/dashboard' },
  { icon: Briefcase, label: 'Work Hub', path: '/work' },
  { icon: DollarSign, label: 'Finance Hub', path: '/finance' },
  { icon: Car, label: 'Car Hub', path: '/car' },
  { icon: BookOpen, label: 'Learning Hub', path: '/learning' },
  { icon: Coffee, label: 'Pantry', path: '/pantry' },
  { icon: CalendarDays, label: 'Meal Planner', path: '/meal-plan' },
  /* 
  { icon: RefreshCw, label: 'Subscriptions', path: '/subscriptions' },
  { icon: CalendarClock, label: 'Important Dates', path: '/dates' },
  { icon: StickyNote, label: 'Notes', path: '/notes' },
  { icon: FileText, label: 'Documents', path: '/documents' },
  { icon: Link2, label: 'Connected Services', path: '/services' },
  */
];

const mobileTabs = [
  { icon: Home, label: 'Today', path: '/dashboard' },
  { icon: Briefcase, label: 'Work', path: '/work' },
  { icon: Sparkles, label: 'Ask', path: '/ai-assistant', featured: true },
  { icon: DollarSign, label: 'Money', path: '/finance' },
];

// Admin-only destinations shown inside the collapsible Admin group in the sidebar.
const adminNavItems = [
  { icon: LayoutDashboard, label: 'Admin Dashboard', path: '/admin' },
  { icon: Gauge, label: 'AI WorkOS', path: '/admin/planner/dashboard' },
  { icon: FolderKanban, label: 'Projects', path: '/admin/planner/projects' },
  { icon: ClipboardList, label: 'Planner', path: '/admin/planner' },
  { icon: FileInput, label: 'Import Notes', path: '/admin/planner/import' },
  { icon: Library, label: 'Knowledge Base', path: '/admin/planner/knowledge' },
  { icon: BarChart3, label: 'Analytics', path: '/admin/planner/analytics' },
  { icon: Megaphone, label: 'Standup', path: '/admin/planner/standup' },
];

const pageNames = {
  '/dashboard': 'Today', '/finance': 'Money', '/car': 'My car', '/work': 'Work',
  '/learning': 'Learning', '/pantry': 'Pantry', '/meal-plan': 'Meal Planner',
  '/subscriptions': 'Subscriptions', '/dates': 'Important Dates', '/notes': 'Notes', '/documents': 'Documents',
  '/services': 'Services', '/ai-assistant': 'LifeOS AI', '/settings': 'Settings', '/admin': 'Admin Panel',
  '/admin/planner': 'Planner', '/admin/planner/import': 'Import Notes', '/admin/planner/standup': 'Standup',
  '/admin/planner/dashboard': 'AI WorkOS', '/admin/planner/projects': 'Projects',
  '/admin/planner/knowledge': 'Knowledge Base', '/admin/planner/analytics': 'Analytics',
};

// Longest-prefix match so /admin/planner/tasks/:id still resolves to a friendly title.
function resolvePageName(pathname) {
  if (pageNames[pathname]) {
    return pageNames[pathname];
  }
  if (pathname.endsWith('/workspace')) {
    return 'AI Workspace';
  }
  if (pathname.startsWith('/admin/planner/tasks/')) {
    return 'Task';
  }
  if (pathname.startsWith('/admin/planner/projects/')) {
    return 'Project';
  }
  return pageNames[pathname] || 'LifeOS';
}

// The Admin group is active when the path is /admin or any /admin/* sub-route.
function isAdminSubItemActive(item, pathname) {
  if (item.path === '/admin') {
    return pathname === '/admin';
  }
  if (item.path === '/admin/planner') {
    return pathname === '/admin/planner' || pathname.startsWith('/admin/planner/tasks');
  }
  if (item.path === '/admin/planner/projects') {
    return pathname.startsWith('/admin/planner/projects');
  }
  return pathname === item.path;
}

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [adminOpen, setAdminOpen] = useState(location.pathname.startsWith('/admin'));
  const pageName = resolvePageName(location.pathname);

  useEffect(() => setMoreOpen(false), [location.pathname]);

  // Keep the Admin group expanded whenever the user is somewhere under /admin.
  useEffect(() => {
    if (location.pathname.startsWith('/admin')) {
      setAdminOpen(true);
    }
  }, [location.pathname]);

  // Keep the session warm while the app is open, and log out if it has expired.
  useEffect(() => {
    const ping = async () => {
      const result = await getCurrentAccount();
      if (result && result.authenticated === false) {
        notifyUnauthorized();
      } else if (result && result.user) {
        setCurrentUser(result.user);
      }
    };
    ping(); // Run once on mount to load user role immediately
    const timer = setInterval(ping, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    try {
      await logoutAccount();
      navigate('/auth');
    } catch {
      // ignore
    }
  };

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
            {isAdmin(currentUser) && (
              <div>
                <button
                  type="button"
                  onClick={() => setAdminOpen((open) => !open)}
                  aria-expanded={adminOpen}
                  className={cn('w-full min-h-12 flex items-center gap-3 px-3 rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary', location.pathname.startsWith('/admin') ? 'text-on-surface' : 'text-on-surface-variant hover:bg-surface-container-low')}
                >
                  <ShieldCheck className="w-5 h-5" />
                  <span className="flex-1 text-left">Admin</span>
                  <ChevronDown className={cn('w-4 h-4 transition-transform', adminOpen && 'rotate-180')} />
                </button>
                {adminOpen && (
                  <div className="mt-1 ml-3 pl-3 border-l border-border-subtle space-y-1">
                    {adminNavItems.map(({ icon: Icon, label, path }) => {
                      const active = isAdminSubItemActive({ path }, location.pathname);
                      return (
                        <Link
                          key={path}
                          to={path}
                          className={cn('min-h-11 flex items-center gap-3 px-3 rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary', active ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-low')}
                          aria-current={active ? 'page' : undefined}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </nav>
        <div className="p-3 border-t border-border-subtle flex items-center gap-1">
          <Link to="/settings" className="min-h-12 flex-1 flex items-center gap-3 px-3 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low">
            <div className="w-9 h-9 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-bold text-xs uppercase">
              {currentUser?.displayName?.[0] || currentUser?.email?.[0] || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-on-surface truncate">{currentUser?.displayName || 'User'}</p>
              <p className="text-xs font-normal text-text-muted">Settings</p>
            </div>
          </Link>
          <button 
            type="button" 
            className="w-10 h-10 flex shrink-0 items-center justify-center rounded-xl text-text-muted hover:text-error hover:bg-error/10 transition-colors" 
            onClick={handleLogout}
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="mobile-app-bar lg:h-20 lg:px-8 lg:border-b lg:border-border-subtle lg:bg-surface-card/90 lg:backdrop-blur-xl flex items-center justify-between shrink-0">
          <div className="min-w-0"><h1 className="font-display text-[22px] lg:text-xl font-bold tracking-tight">{pageName}</h1></div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => navigate('/documents')} className="icon-button" aria-label="Search"><Search className="w-5 h-5" /></button>
            <ThemeToggle />
            <button type="button" onClick={() => navigate('/finance')} className="icon-button" aria-label="Notifications"><Bell className="w-5 h-5" /></button>
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
          <div className="shrink-0">
            <div className="w-10 h-1 rounded-full bg-surface-container-highest mx-auto mt-2" />
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <div><h2 className="font-display text-xl font-bold">More</h2><p className="text-sm text-text-muted">Everything else in your LifeOS</p></div>
              <button className="icon-button bg-surface-container-low" onClick={() => setMoreOpen(false)} aria-label="Close menu"><X className="w-5 h-5" /></button>
            </div>
          </div>

          {/* Scrolls independently of the page so long menus (admins see 8 extra
              destinations) stay reachable on short screens. */}
          <div className="more-sheet-body px-3 pb-2">
            <p className="more-sheet-label">Your spaces</p>
            {navItems.slice(3).map(({ icon: Icon, label, path }) => <Link key={path} to={path} className="more-sheet-item"><span className="more-sheet-icon"><Icon className="w-5 h-5" /></span><span className="font-semibold flex-1">{label}</span><ChevronRight className="w-5 h-5 text-text-muted" /></Link>)}

            {isAdmin(currentUser) && (
              <>
                <p className="more-sheet-label">Admin</p>
                {adminNavItems.map(({ icon: Icon, label, path }) => <Link key={path} to={path} className="more-sheet-item"><span className="more-sheet-icon bg-primary/10 text-primary"><Icon className="w-5 h-5" /></span><span className="font-semibold flex-1">{label}</span><ChevronRight className="w-5 h-5 text-text-muted" /></Link>)}
              </>
            )}

            <p className="more-sheet-label">Account</p>
            <Link to="/settings" className="more-sheet-item"><span className="more-sheet-icon"><Settings className="w-5 h-5" /></span><span className="font-semibold flex-1">Settings</span><ChevronRight className="w-5 h-5 text-text-muted" /></Link>
            <button type="button" onClick={handleLogout} className="more-sheet-item w-full text-error hover:bg-error/10"><span className="more-sheet-icon bg-error/10 text-error"><LogOut className="w-5 h-5" /></span><span className="font-semibold flex-1 text-left">Log out</span></button>
          </div>
        </section>
      </div>}
    </div>
  );
}
