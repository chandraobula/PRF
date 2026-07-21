import { Link } from 'react-router-dom';
import {
  ArrowRight, Battery, Car, Check, ChevronRight, Clock3,
  CloudSun, CreditCard, Plus, Sparkles, Target, WalletCards,
} from 'lucide-react';

const quickActions = [
  { label: 'Add task', icon: Plus, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-300', path: '/work' },
  { label: 'Log expense', icon: WalletCards, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300', path: '/finance' },
  { label: 'My car', icon: Car, color: 'bg-violet-500/10 text-violet-600 dark:text-violet-300', path: '/car' },
  { label: 'Ask LifeOS', icon: Sparkles, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-300', path: '/ai-assistant' },
];

const agenda = [
  { time: '10:30', period: 'AM', title: 'Product sync', meta: 'Design team · 45 min', color: 'bg-blue-600' },
  { time: '1:00', period: 'PM', title: 'Deep work', meta: 'Q3 roadmap · 60 min', color: 'bg-violet-600' },
  { time: '3:00', period: 'PM', title: 'Weekly review', meta: 'With LifeOS AI · 20 min', color: 'bg-emerald-600' },
];

export default function Dashboard() {
  return (
    <div className="dashboard max-w-[1180px] mx-auto space-y-6 lg:space-y-8">
      <section className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-secondary mb-1">Good morning, John</p>
          <h2 className="font-display text-[30px] sm:text-4xl font-bold tracking-[-0.04em] text-on-surface leading-tight">Here’s your day.</h2>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-sm text-text-muted"><CloudSun className="w-5 h-5 text-amber-500" /><span><strong className="text-on-surface">22°C</strong> · Bengaluru</span></div>
      </section>

      <section className="focus-card relative overflow-hidden rounded-[24px] bg-primary text-white p-5 sm:p-7 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
        <div className="absolute -right-16 -top-20 w-56 h-56 rounded-full bg-blue-500/30 blur-2xl" />
        <div className="absolute right-16 -bottom-28 w-52 h-52 rounded-full bg-teal-400/20 blur-2xl" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <span className="inline-flex items-center gap-2 text-xs font-bold tracking-wide uppercase text-white/70"><Target className="w-4 h-4" /> Today’s focus</span>
            <span className="px-2.5 py-1 rounded-full bg-white/10 text-xs font-semibold">2 of 3 done</span>
          </div>
          <div className="sm:flex sm:items-end sm:justify-between sm:gap-8">
            <div>
              <p className="text-[13px] text-white/65 mb-1">Up next · 10:30 AM</p>
              <h3 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Product sync with Design</h3>
              <p className="text-sm text-white/65 mt-2">Starts in 45 minutes · Zoom</p>
            </div>
            <Link to="/work" className="mt-5 sm:mt-0 min-h-12 inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-surface-card text-primary text-sm font-bold hover:bg-surface-card/90 active:scale-[.98] transition-all">View my day <ArrowRight className="w-4 h-4" /></Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="quick-actions-title">
        <div className="flex items-center justify-between mb-3"><h3 id="quick-actions-title" className="section-title">Quick actions</h3></div>
        <div className="grid grid-cols-4 gap-2 sm:gap-4">
          {quickActions.map(({ label, icon: Icon, color, path }) => <Link key={label} to={path} className="quick-action group min-w-0"><span className={`quick-action-icon ${color}`}><Icon className="w-5 h-5" /></span><span className="text-xs sm:text-sm font-semibold text-on-surface text-center leading-tight">{label}</span></Link>)}
        </div>
      </section>

      <section aria-labelledby="overview-title">
        <div className="flex items-center justify-between mb-3"><h3 id="overview-title" className="section-title">At a glance</h3><button className="text-sm font-semibold text-secondary min-h-11 px-1">See all</button></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <article className="metric-card"><div className="metric-icon bg-blue-500/10 text-blue-600 dark:text-blue-300"><Target className="w-5 h-5" /></div><p className="metric-label">Daily focus</p><p className="metric-value">78%</p><p className="metric-caption text-success-proactive">↑ 4% this week</p></article>
          <article className="metric-card"><div className="metric-icon bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"><Battery className="w-5 h-5" /></div><p className="metric-label">Energy</p><p className="metric-value">Good</p><p className="metric-caption">Based on sleep</p></article>
          <article className="metric-card hidden lg:block"><div className="metric-icon bg-violet-500/10 text-violet-600 dark:text-violet-300"><CreditCard className="w-5 h-5" /></div><p className="metric-label">Spent today</p><p className="metric-value">₹1,240</p><p className="metric-caption">₹760 left in budget</p></article>
          <article className="metric-card hidden lg:block"><div className="metric-icon bg-amber-500/10 text-amber-600 dark:text-amber-300"><Clock3 className="w-5 h-5" /></div><p className="metric-label">Focus time</p><p className="metric-value">2h 15m</p><p className="metric-caption">1 block remaining</p></article>
        </div>
      </section>

      <section className="grid lg:grid-cols-[1.1fr_.9fr] gap-4 sm:gap-6">
        <div className="app-card p-4 sm:p-6">
          <div className="flex items-center justify-between mb-1"><h3 className="section-title">Today’s schedule</h3><Link to="/work" className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-surface-container-low" aria-label="Open full schedule"><ChevronRight className="w-5 h-5" /></Link></div>
          <div className="divide-y divide-border-subtle">
            {agenda.map((item, index) => <div key={item.title} className="flex items-center gap-3 py-3.5">
              <div className="w-12 shrink-0 text-center"><p className="text-sm font-bold leading-none">{item.time}</p><p className="text-[10px] font-semibold text-text-muted mt-1">{item.period}</p></div>
              <span className={`w-1 h-10 rounded-full ${item.color}`} />
              <div className="flex-1 min-w-0"><p className="font-semibold text-sm truncate">{item.title}</p><p className="text-xs text-text-muted mt-0.5 truncate">{item.meta}</p></div>
              {index === 0 ? <span className="text-[11px] font-bold text-secondary bg-blue-500/10 rounded-full px-2 py-1">Next</span> : <ChevronRight className="w-4 h-4 text-text-muted" />}
            </div>)}
          </div>
        </div>

        <div className="ai-card p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-4"><span className="w-10 h-10 rounded-xl bg-surface-card shadow-sm flex items-center justify-center text-violet-500 dark:text-violet-300"><Sparkles className="w-5 h-5" /></span><div><p className="font-bold">A helpful heads-up</p><p className="text-xs text-text-muted">From LifeOS AI</p></div></div>
          <p className="text-sm leading-relaxed text-on-surface-variant">You have three subscriptions renewing next week for <strong className="text-on-surface">₹3,850</strong>. One hasn’t been used in 60 days.</p>
          <div className="mt-5 flex gap-2"><Link to="/finance" className="min-h-11 px-4 inline-flex items-center justify-center rounded-xl bg-primary text-white text-sm font-bold">Review subscriptions</Link><button className="min-h-11 px-4 rounded-xl text-sm font-semibold hover:bg-white/60">Not now</button></div>
        </div>
      </section>

      <button className="w-full min-h-14 app-card px-4 flex items-center gap-3 text-left hover:bg-surface-container-lowest">
        <span className="w-9 h-9 rounded-full bg-success-proactive/10 text-success-proactive flex items-center justify-center"><Check className="w-5 h-5" /></span>
        <span className="flex-1"><span className="block text-sm font-bold">You’re on track today</span><span className="block text-xs text-text-muted">All important areas look good</span></span><ChevronRight className="w-5 h-5 text-text-muted" />
      </button>
    </div>
  );
}
