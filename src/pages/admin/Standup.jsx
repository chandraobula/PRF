import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, Copy, ListTodo, Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { getStandup, statusStyles, statusLabels, formatMinutes, toDateInput } from '../../services/plannerApi';

const primaryBtn = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm active:scale-[.98] transition-transform disabled:opacity-60';
const secondaryBtn = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-surface-container-low px-4 text-sm font-bold text-on-surface active:scale-[.98] transition-transform';
const fieldClass = 'w-full rounded-xl border border-border-subtle bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/40';

const empty = { completed: [], doing: [], blockers: [] };

function estimateText(task) {
  if (task.estimateLabel) return task.estimateLabel;
  if (task.estimatedMinutes) return formatMinutes(task.estimatedMinutes);
  return null;
}

function buildDigest(data) {
  const line = (t) => {
    const tag = t.projectName || t.projectTag;
    return `- ${t.title}${tag ? ` (${tag})` : ''}`;
  };
  const section = (title, items) => `*${title}*\n${items.length ? items.map(line).join('\n') : '- none'}`;
  return [
    section('Completed', data.completed || []),
    section('Doing today', data.doing || []),
    section('Blockers', data.blockers || []),
  ].join('\n');
}

export default function Standup() {
  const [date, setDate] = useState(toDateInput(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await getStandup({ date });
        if (active) setData(res);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [date]);

  const digest = useMemo(() => buildDigest(data || empty), [data]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(digest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  };

  const view = data || empty;
  const columns = [
    { key: 'completed', title: 'Completed', items: view.completed, icon: CheckCircle2, emptyTitle: 'Nothing completed', emptyDesc: 'Finish a task to see it here.' },
    { key: 'doing', title: 'Doing today', items: view.doing, icon: ListTodo, emptyTitle: 'Nothing planned', emptyDesc: 'Plan a task for today.' },
    { key: 'blockers', title: 'Blockers', items: view.blockers, icon: AlertTriangle, emptyTitle: 'No blockers 🎉', emptyDesc: "You're clear to ship." },
  ];

  return (
    <div className="space-y-5 max-w-container-max mx-auto pb-6">
      <section className="space-y-4">
        <div>
          <Link to="/admin/planner" className="inline-flex items-center gap-1.5 text-sm font-bold text-on-surface-variant hover:text-on-surface mb-2">
            <ArrowLeft className="w-4 h-4" /> Dev Planner
          </Link>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-on-surface tracking-tight mb-1">Standup</h1>
          <p className="font-body text-on-surface-variant">Your update, compiled from today's tasks.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="standup-date" className="sr-only">Date</label>
          <input id="standup-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(fieldClass, 'w-auto')} />
          <button type="button" onClick={() => setDate(toDateInput(new Date()))} className={secondaryBtn}>Today</button>
          <button type="button" onClick={copy} className={cn(primaryBtn, 'sm:ml-auto')}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy for Slack'}
          </button>
        </div>
      </section>

      {error && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <section className="grid grid-cols-3 gap-3">
            <StatCard icon={CheckCircle2} label="Completed" value={view.completed.length} color="bg-emerald-500/10 text-emerald-600" />
            <StatCard icon={ListTodo} label="Doing" value={view.doing.length} color="bg-sky-500/10 text-sky-600" />
            <StatCard icon={AlertTriangle} label="Blockers" value={view.blockers.length} color="bg-red-500/10 text-red-600" />
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            {columns.map((col) => (
              <section key={col.key} className="app-card">
                <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center justify-between">
                  <h3 className="font-display font-bold text-on-surface">{col.title}</h3>
                  <span className="text-sm font-bold text-text-muted">{col.items.length}</span>
                </div>
                {col.items.length === 0 ? (
                  <EmptyState icon={col.icon} title={col.emptyTitle} description={col.emptyDesc} />
                ) : (
                  <ul className="divide-y divide-border-subtle">
                    {col.items.map((t) => (
                      <li key={t.id} className="px-4 sm:px-5 py-3">
                        <Link to={`/admin/planner/tasks/${t.id}`} className="font-semibold text-on-surface hover:underline block truncate">{t.title}</Link>
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          {(t.projectName || t.projectTag) && (
                            <span className="inline-flex items-center rounded-lg bg-surface-container-low px-2 py-0.5 text-xs font-semibold text-on-surface-variant">
                              {t.projectName || t.projectTag}
                            </span>
                          )}
                          <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold', statusStyles[t.status])}>{statusLabels[t.status]}</span>
                          {estimateText(t) && <span className="text-xs text-text-muted">{estimateText(t)}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <section className="app-card">
            <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center justify-between gap-3">
              <h3 className="font-display font-bold text-on-surface">Slack preview</h3>
              <button type="button" onClick={copy} className={secondaryBtn}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="p-4 sm:p-5">
              <pre className="whitespace-pre-wrap text-sm text-on-surface font-mono bg-surface-container-lowest rounded-xl border border-border-subtle p-4">{digest}</pre>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color = 'bg-primary/10 text-primary' }) {
  return (
    <div className="app-card p-4 sm:p-5 flex items-start gap-4">
      <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center shrink-0', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-display font-bold text-on-surface">{value}</p>
        <p className="text-sm text-text-muted mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface-container-low flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-text-muted" />
      </div>
      <p className="font-display font-bold text-on-surface">{title}</p>
      <p className="mt-1 text-sm text-text-muted max-w-xs">{description}</p>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-7 h-7 text-primary animate-spin" />
    </div>
  );
}
