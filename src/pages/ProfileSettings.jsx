import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, Globe, Key, LogOut, Moon, Shield, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { logoutAccount } from '../services/authApi';

const sections = [
  { id: 'profile', icon: User, label: 'Profile', description: 'Name, photo and email' },
  { id: 'notifications', icon: Bell, label: 'Notifications', description: 'Alerts and reminders' },
  { id: 'privacy', icon: Shield, label: 'Privacy & security', description: 'Data and sign-in' },
  { id: 'appearance', icon: Moon, label: 'Appearance', description: 'Theme and display' },
  { id: 'region', icon: Globe, label: 'Language & region', description: 'Language and formats' },
  { id: 'connections', icon: Key, label: 'Connections', description: 'Apps and API access' },
];

function Toggle({ checked, onChange, label }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn('relative w-12 h-7 shrink-0 rounded-full transition-colors', checked ? 'bg-secondary' : 'bg-surface-container-highest')}><span className={cn('absolute left-1 top-1 w-5 h-5 rounded-full bg-surface-card shadow-sm transition-transform', checked ? 'translate-x-5' : 'translate-x-0')} /></button>;
}

function PreferenceRow({ title, description, action, onClick }) {
  const copy = <span className="min-w-0 flex-1"><span className="block text-sm leading-5 font-semibold text-on-surface">{title}</span>{description && <span className="block mt-0.5 text-xs leading-5 text-text-muted">{description}</span>}</span>;
  if (action) return <div className="settings-row w-full text-left">{copy}{action}</div>;
  return <button type="button" onClick={onClick} className="settings-row w-full text-left">{copy}<ChevronRight className="w-5 h-5 text-text-muted shrink-0" /></button>;
}

export default function ProfileSettings() {
  const [active, setActive] = useState('profile');
  const [notifications, setNotifications] = useState({ daily: true, bills: true, focus: false });
  const current = sections.find(section => section.id === active);
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logoutAccount();
      navigate('/auth');
    } catch {
      // ignore
    }
  };

  const content = {
    profile: <>
      <section className="settings-card">
        <div className="settings-card-header"><h2>Profile information</h2><p>How your identity appears across LifeOS.</p></div>
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-4 sm:gap-5 pb-6 border-b border-border-subtle">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-display font-bold text-xl sm:text-2xl shrink-0">JD</div>
            <div><button className="min-h-10 px-4 bg-surface-card border border-border-subtle rounded-xl text-sm font-semibold hover:bg-surface-container-low">Change photo</button><p className="mt-1.5 text-xs leading-5 text-text-muted">JPG or PNG, up to 1 MB.</p></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-6">
            <label className="settings-field"><span>First name</span><input type="text" defaultValue="John" /></label>
            <label className="settings-field"><span>Last name</span><input type="text" defaultValue="Doe" /></label>
            <label className="settings-field sm:col-span-2"><span>Email address</span><input type="email" defaultValue="john.doe@example.com" /><small>Used for account recovery and important updates.</small></label>
          </div>
          <div className="mt-6 pt-5 border-t border-border-subtle flex justify-end"><button className="min-h-11 w-full sm:w-auto px-5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90">Save changes</button></div>
        </div>
      </section>
      <section className="settings-card">
        <div className="settings-card-header">
          <h2>Sign out</h2>
          <p>Sign out of your LifeOS account on this device.</p>
        </div>
        <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="max-w-xl text-sm leading-6 text-text-muted">You will need to sign back in to access your data.</p>
          <button type="button" onClick={handleLogout} className="min-h-11 px-4 inline-flex items-center justify-center gap-2 rounded-xl bg-surface-container-low text-on-surface text-sm font-bold hover:bg-surface-container-highest">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </section>
      <section className="settings-card border-error/20"><div className="settings-card-header"><h2 className="text-error">Delete account</h2><p>Permanently remove your account and all LifeOS data.</p></div><div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"><p className="max-w-xl text-sm leading-6 text-text-muted">This cannot be undone. Export anything you want to keep before continuing.</p><button className="min-h-11 px-4 inline-flex items-center justify-center gap-2 rounded-xl bg-error/10 text-error text-sm font-bold hover:bg-error/15"><LogOut className="w-4 h-4" /> Delete account</button></div></section>
    </>,
    notifications: <section className="settings-card"><div className="settings-card-header"><h2>Notification preferences</h2><p>Choose what deserves your attention.</p></div><div className="divide-y divide-border-subtle"><PreferenceRow title="Daily briefing" description="A concise plan each morning at 8:00 AM." action={<Toggle label="Daily briefing" checked={notifications.daily} onChange={value => setNotifications({ ...notifications, daily: value })} />} /><PreferenceRow title="Bills and renewals" description="Remind me three days before a payment is due." action={<Toggle label="Bills and renewals" checked={notifications.bills} onChange={value => setNotifications({ ...notifications, bills: value })} />} /><PreferenceRow title="Focus session updates" description="Notify me when a focus block starts or ends." action={<Toggle label="Focus session updates" checked={notifications.focus} onChange={value => setNotifications({ ...notifications, focus: value })} />} /></div></section>,
    privacy: <section className="settings-card"><div className="settings-card-header"><h2>Privacy & security</h2><p>Control your data and protect your account.</p></div><div className="divide-y divide-border-subtle"><PreferenceRow title="Password" description="Last changed three months ago" /><PreferenceRow title="Two-step verification" description="Add an extra layer of account security" /><PreferenceRow title="Data permissions" description="Choose what LifeOS AI can access" /><PreferenceRow title="Export my data" description="Download a copy of your information" /></div></section>,
    appearance: <section className="settings-card"><div className="settings-card-header"><h2>Appearance</h2><p>Make LifeOS comfortable for you.</p></div><div className="divide-y divide-border-subtle"><PreferenceRow title="Theme" description="Use system setting" action={<span className="text-sm font-semibold text-text-muted">System</span>} /><PreferenceRow title="Text size" description="Default reading size" action={<span className="text-sm font-semibold text-text-muted">Medium</span>} /><PreferenceRow title="Reduce motion" description="Minimize interface animations" action={<Toggle label="Reduce motion" checked={false} onChange={() => {}} />} /></div></section>,
    region: <section className="settings-card"><div className="settings-card-header"><h2>Language & region</h2><p>Set how dates, times and currency appear.</p></div><div className="divide-y divide-border-subtle"><PreferenceRow title="Language" action={<span className="text-sm font-semibold text-text-muted">English</span>} /><PreferenceRow title="Region" action={<span className="text-sm font-semibold text-text-muted">India</span>} /><PreferenceRow title="Time zone" action={<span className="text-sm font-semibold text-text-muted">Kolkata</span>} /><PreferenceRow title="Currency" action={<span className="text-sm font-semibold text-text-muted">INR (₹)</span>} /></div></section>,
    connections: <section className="settings-card"><div className="settings-card-header"><h2>Connections</h2><p>Manage linked services and developer access.</p></div><div className="divide-y divide-border-subtle"><PreferenceRow title="Connected services" description="Calendar, email and productivity apps" /><PreferenceRow title="API keys" description="Create and revoke developer keys" /></div></section>,
  };

  return (
    <div className="settings-page max-w-[1120px] mx-auto pb-12">
      <section className="mb-5 lg:mb-7"><h1 className="font-display text-4xl font-bold text-on-surface tracking-tight mb-2">Settings</h1><p className="font-body text-on-surface-variant text-lg">Manage your account and preferences.</p></section>
      <div className="grid lg:grid-cols-[260px_1fr] gap-5 lg:gap-8 items-start">
        <aside className="lg:sticky lg:top-0 min-w-0">
          <nav className="settings-nav flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0" aria-label="Settings sections">
            {sections.map(({ id, icon: Icon, label, description }) => <button key={id} onClick={() => setActive(id)} aria-current={active === id ? 'page' : undefined} className={cn('settings-nav-item', active === id && 'is-active')}><Icon className="w-5 h-5 shrink-0" /><span className="min-w-0 text-left"><span className="block text-sm font-semibold whitespace-nowrap lg:whitespace-normal">{label}</span><span className="hidden lg:block text-xs font-normal mt-0.5 opacity-65">{description}</span></span></button>)}
          </nav>
        </aside>
        <main className="min-w-0 space-y-5"><div className="lg:hidden mb-1"><h2 className="font-display text-xl font-bold">{current.label}</h2><p className="text-sm text-text-muted">{current.description}</p></div>{content[active]}</main>
      </div>
    </div>
  );
}
