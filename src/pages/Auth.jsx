import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, LockKeyhole, Sparkles, UserPlus } from 'lucide-react';
import { cn } from '../lib/utils';
import { loginAccount, registerAccount } from '../services/authApi';

const initialForm = {
  displayName: '',
  email: '',
  password: '',
};

export default function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      if (mode === 'register') {
        await registerAccount(form);
      } else {
        await loginAccount(form);
      }

      navigate('/dashboard');
    } catch (authError) {
      setError(authError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background grid lg:grid-cols-[1fr_480px]">
      <section className="hidden lg:flex bg-primary text-white p-10 flex-col justify-between">
        <Link to="/" className="inline-flex items-center gap-3 w-fit">
          <span className="w-10 h-10 rounded-[14px] bg-surface-card text-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </span>
          <span className="font-display text-xl font-bold">LifeOS</span>
        </Link>
        <div className="max-w-xl">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-white/55">Personal finance OS</p>
          <h1 className="mt-4 font-display text-5xl font-bold tracking-tight leading-tight">Your money, habits, and decisions in one calm place.</h1>
          <p className="mt-5 text-base leading-7 text-white/65">Public login is ready for hosted accounts. Private Cloudflare Access can be enabled later for family, team, or personal-only deployments.</p>
        </div>
        <p className="text-sm text-white/50">Receipt metadata only is active for this phase.</p>
      </section>

      <section className="min-h-screen flex items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <span className="w-10 h-10 rounded-[14px] bg-primary text-white flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </span>
            <span className="font-display text-xl font-bold">LifeOS</span>
          </div>

          <div className="app-card p-5 sm:p-6">
            <div className="mb-6">
              <div className="w-12 h-12 rounded-2xl bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center mb-4">
                {mode === 'login' ? <LockKeyhole className="w-6 h-6" /> : <UserPlus className="w-6 h-6" />}
              </div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-on-surface">
                {mode === 'login' ? 'Sign in' : 'Create account'}
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                {mode === 'login'
                  ? 'Use your LifeOS account to open your workspace.'
                  : 'Start with email and password. You can add private access later.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-container-low p-1 mb-5">
              {[
                { id: 'login', label: 'Sign in' },
                { id: 'register', label: 'Create' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setMode(item.id);
                    setError('');
                  }}
                  className={cn(
                    'min-h-10 rounded-lg text-sm font-bold',
                    mode === item.id ? 'bg-surface-card shadow-sm text-on-surface' : 'text-on-surface-variant',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <form className="space-y-4" onSubmit={submit}>
              {mode === 'register' && (
                <label className="settings-field">
                  <span>Name</span>
                  <input
                    type="text"
                    autoComplete="name"
                    value={form.displayName}
                    onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                    placeholder="Your name"
                  />
                </label>
              )}

              <label className="settings-field">
                <span>Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="you@example.com"
                />
              </label>

              <label className="settings-field">
                <span>Password</span>
                <input
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder="At least 8 characters"
                />
              </label>

              {error && (
                <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>
          </div>

        </div>
      </section>
    </main>
  );
}
