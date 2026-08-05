import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, Globe, Key, LogOut, Moon, Shield, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { logoutAccount } from '../services/authApi';
import { getProfile, updateProfile, deleteAccount, getPreferences, updatePreferences, listIntegrations } from '../services/settingsApi';
import { setTheme } from '../lib/theme';
import { setReduceMotion } from '../lib/motion';
import { setTextSize } from '../lib/textSize';

const sections = [
  { id: 'profile', icon: User, label: 'Profile', description: 'Name, photo and email' },
  { id: 'notifications', icon: Bell, label: 'Notifications', description: 'Alerts and reminders' },
  { id: 'privacy', icon: Shield, label: 'Privacy & security', description: 'Data and sign-in' },
  { id: 'appearance', icon: Moon, label: 'Appearance', description: 'Theme and display' },
  { id: 'region', icon: Globe, label: 'Language & region', description: 'Language and formats' },
  { id: 'connections', icon: Key, label: 'Connections', description: 'Apps and API access' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
];

const REGIONS = [
  { value: 'IN', label: 'India' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'SG', label: 'Singapore' },
];

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC'];

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];

function Toggle({ checked, onChange, label }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn('relative w-12 h-7 shrink-0 rounded-full transition-colors', checked ? 'bg-secondary' : 'bg-surface-container-highest')}><span className={cn('absolute left-1 top-1 w-5 h-5 rounded-full bg-surface-card shadow-sm transition-transform', checked ? 'translate-x-5' : 'translate-x-0')} /></button>;
}

function PreferenceRow({ title, description, action, onClick, badge }) {
  const copy = <span className="min-w-0 flex-1"><span className="block text-sm leading-5 font-semibold text-on-surface">{title}</span>{description && <span className="block mt-0.5 text-xs leading-5 text-text-muted">{description}</span>}</span>;
  if (action) return <div className="settings-row w-full text-left">{copy}{action}</div>;
  if (badge) return <div className="settings-row w-full text-left">{copy}<span className="text-xs font-semibold text-text-muted bg-surface-container px-2.5 py-1 rounded-full shrink-0">{badge}</span></div>;
  return <button type="button" onClick={onClick} className="settings-row w-full text-left">{copy}<ChevronRight className="w-5 h-5 text-text-muted shrink-0" /></button>;
}

export default function ProfileSettings() {
  const [active, setActive] = useState('profile');
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const [prefsError, setPrefsError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getProfile(), getPreferences()])
      .then(([profileRes, prefsRes]) => {
        if (cancelled) return;
        const [first, ...rest] = (profileRes.profile.displayName || '').trim().split(/\s+/).filter(Boolean);
        setFirstName(first || '');
        setLastName(rest.join(' '));
        setEmail(profileRes.profile.email || '');
        setPrefs(prefsRes.preferences);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message || 'Could not load your settings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logoutAccount();
      navigate('/auth');
    } catch {
      // ignore
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('This permanently deletes your account and all LifeOS data. This cannot be undone. Continue?')) {
      return;
    }
    try {
      await deleteAccount();
      navigate('/auth');
    } catch (error) {
      setProfileMessage({ type: 'error', text: error.message || 'Could not delete account.' });
    }
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const displayName = [firstName, lastName].filter(Boolean).join(' ').trim();
      const result = await updateProfile({ displayName, email });
      setEmail(result.profile.email);
      setProfileMessage({ type: 'success', text: 'Saved.' });
    } catch (error) {
      setProfileMessage({ type: 'error', text: error.message || 'Could not save changes.' });
    } finally {
      setProfileSaving(false);
      setTimeout(() => setProfileMessage(null), 3000);
    }
  };

  const persistPrefs = async (partial) => {
    setPrefs((prev) => ({ ...prev, ...partial }));
    setPrefsError(null);
    try {
      const result = await updatePreferences(partial);
      setPrefs(result.preferences);
    } catch (error) {
      setPrefsError(error.message || 'Could not save that change.');
      getPreferences().then((res) => setPrefs(res.preferences)).catch(() => {});
    }
  };

  const handleThemeChange = (value) => {
    setTheme(value);
    persistPrefs({ theme: value });
  };

  const handleReduceMotionChange = (value) => {
    setReduceMotion(value);
    persistPrefs({ reduceMotion: value });
  };

  const handleTextSizeChange = (value) => {
    setTextSize(value);
    persistPrefs({ textSize: value });
  };

  const handleExportData = async () => {
    try {
      const [profileRes, prefsRes, integrationsRes] = await Promise.all([getProfile(), getPreferences(), listIntegrations()]);
      const payload = {
        exportedAt: new Date().toISOString(),
        profile: profileRes.profile,
        preferences: prefsRes.preferences,
        integrations: integrationsRes.integrations,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'lifeos-data-export.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setProfileMessage({ type: 'error', text: 'Could not export your data.' });
    }
  };

  const current = sections.find((section) => section.id === active);
  const initials = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || (email[0] || 'U').toUpperCase();

  if (loading) {
    return <div className="settings-page max-w-[1120px] mx-auto pb-12 py-20 text-center text-text-muted">Loading settings…</div>;
  }

  if (loadError) {
    return <div className="settings-page max-w-[1120px] mx-auto pb-12 py-20 text-center text-error">{loadError}</div>;
  }

  const content = {
    profile: <>
      <section className="settings-card">
        <div className="settings-card-header"><h2>Profile information</h2><p>How your identity appears across LifeOS.</p></div>
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-4 sm:gap-5 pb-6 border-b border-border-subtle">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-display font-bold text-xl sm:text-2xl shrink-0">{initials}</div>
            <p className="text-sm text-text-muted">Profile photo uploads aren't supported yet.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-6">
            <label className="settings-field"><span>First name</span><input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></label>
            <label className="settings-field"><span>Last name</span><input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} /></label>
            <label className="settings-field sm:col-span-2"><span>Email address</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /><small>Used for account recovery and important updates.</small></label>
          </div>
          <div className="mt-6 pt-5 border-t border-border-subtle flex flex-col sm:flex-row items-center justify-end gap-3">
            {profileMessage && <span className={cn('text-sm font-medium', profileMessage.type === 'error' ? 'text-error' : 'text-success-proactive')}>{profileMessage.text}</span>}
            <button type="button" onClick={saveProfile} disabled={profileSaving} className="min-h-11 w-full sm:w-auto px-5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-60">{profileSaving ? 'Saving…' : 'Save changes'}</button>
          </div>
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
      <section className="settings-card border-error/20"><div className="settings-card-header"><h2 className="text-error">Delete account</h2><p>Permanently remove your account and all LifeOS data.</p></div><div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"><p className="max-w-xl text-sm leading-6 text-text-muted">This cannot be undone. Export anything you want to keep before continuing.</p><button type="button" onClick={handleDeleteAccount} className="min-h-11 px-4 inline-flex items-center justify-center gap-2 rounded-xl bg-error/10 text-error text-sm font-bold hover:bg-error/15"><LogOut className="w-4 h-4" /> Delete account</button></div></section>
    </>,
    notifications: <section className="settings-card">
      <div className="settings-card-header"><h2>Notification preferences</h2><p>Choose what deserves your attention.</p></div>
      {prefsError && <p className="px-4 sm:px-6 pt-4 text-sm text-error">{prefsError}</p>}
      <div className="divide-y divide-border-subtle">
        <PreferenceRow title="Daily briefing" description="A concise plan each morning at 8:00 AM." action={<Toggle label="Daily briefing" checked={prefs.notifyDailyBriefing} onChange={(value) => persistPrefs({ notifyDailyBriefing: value })} />} />
        <PreferenceRow title="Bills and renewals" description="Remind me three days before a payment is due." action={<Toggle label="Bills and renewals" checked={prefs.notifyBills} onChange={(value) => persistPrefs({ notifyBills: value })} />} />
        <PreferenceRow title="Focus session updates" description="Notify me when a focus block starts or ends." action={<Toggle label="Focus session updates" checked={prefs.notifyFocusSessions} onChange={(value) => persistPrefs({ notifyFocusSessions: value })} />} />
      </div>
    </section>,
    privacy: <section className="settings-card"><div className="settings-card-header"><h2>Privacy & security</h2><p>Control your data and protect your account.</p></div><div className="divide-y divide-border-subtle"><PreferenceRow title="Password" description="Change your account password" badge="Coming soon" /><PreferenceRow title="Two-step verification" description="Add an extra layer of account security" badge="Coming soon" /><PreferenceRow title="Data permissions" description="Choose what LifeOS AI can access" badge="Coming soon" /><PreferenceRow title="Export my data" description="Download a copy of your information" onClick={handleExportData} /></div></section>,
    appearance: <section className="settings-card">
      <div className="settings-card-header"><h2>Appearance</h2><p>Make LifeOS comfortable for you.</p></div>
      {prefsError && <p className="px-4 sm:px-6 pt-4 text-sm text-error">{prefsError}</p>}
      <div className="divide-y divide-border-subtle">
        <PreferenceRow title="Theme" description="Light, dark, or match your system" action={
          <select value={prefs.theme} onChange={(e) => handleThemeChange(e.target.value)} className="settings-select">
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        } />
        <PreferenceRow title="Text size" description="Default reading size" action={
          <select value={prefs.textSize} onChange={(e) => handleTextSizeChange(e.target.value)} className="settings-select">
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        } />
        <PreferenceRow title="Reduce motion" description="Minimize interface animations" action={<Toggle label="Reduce motion" checked={prefs.reduceMotion} onChange={handleReduceMotionChange} />} />
      </div>
    </section>,
    region: <section className="settings-card">
      <div className="settings-card-header"><h2>Language & region</h2><p>Set how dates, times and currency appear.</p></div>
      {prefsError && <p className="px-4 sm:px-6 pt-4 text-sm text-error">{prefsError}</p>}
      <div className="divide-y divide-border-subtle">
        <PreferenceRow title="Language" action={
          <select value={prefs.language} onChange={(e) => persistPrefs({ language: e.target.value })} className="settings-select">
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        } />
        <PreferenceRow title="Region" action={
          <select value={prefs.region} onChange={(e) => persistPrefs({ region: e.target.value })} className="settings-select">
            {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        } />
        <PreferenceRow title="Time zone" action={
          <select value={prefs.timezone} onChange={(e) => persistPrefs({ timezone: e.target.value })} className="settings-select">
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        } />
        <PreferenceRow title="Currency" action={
          <select value={prefs.currency} onChange={(e) => persistPrefs({ currency: e.target.value })} className="settings-select">
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        } />
      </div>
    </section>,
    connections: <section className="settings-card"><div className="settings-card-header"><h2>Connections</h2><p>Manage linked services and developer access.</p></div><div className="divide-y divide-border-subtle"><PreferenceRow title="Connected services" description="Calendar, email and productivity apps" onClick={() => navigate('/services')} /><PreferenceRow title="API keys" description="Create and revoke developer keys" badge="Coming soon" /></div></section>,
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
