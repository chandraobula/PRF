import { useEffect, useState, useRef, useCallback } from 'react';
import {
  BarChart3, FileAudio, Package, ListTodo, Repeat2, ListChecks,
  FileText, Clock, Gauge, ShieldCheck, TrendingUp, Loader2, Inbox,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  getAnalytics, formatMinutes, STATUSES, PRIORITIES,
  statusLabels, priorityLabels,
} from '../../services/plannerApi';

const RANGES = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'all', label: 'All Time' },
];

const statusBar = {
  planned: 'bg-slate-400',
  in_progress: 'bg-sky-500',
  done: 'bg-emerald-500',
  blocked: 'bg-red-500',
};

const priorityBar = {
  critical: 'bg-red-500',
  high: 'bg-amber-500',
  medium: 'bg-sky-500',
  low: 'bg-slate-400',
};

function pct(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function formatDay(date) {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
      {description && <p className="mt-1 text-sm text-text-muted max-w-xs">{description}</p>}
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

function Figure({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-surface-container-low p-4">
      <p className="text-2xl font-display font-bold text-on-surface tabular-nums">{value}</p>
      <p className="text-sm text-text-muted mt-0.5">{label}</p>
      {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function Meter({ label, value, fill = 'bg-primary' }) {
  const value_ = pct(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-on-surface-variant">{label}</span>
        <span className="text-sm font-bold text-on-surface tabular-nums">{value_}%</span>
      </div>
      <div className="h-2 rounded-full bg-surface-container-low overflow-hidden" role="img" aria-label={`${label}: ${value_}%`}>
        <div className={cn('h-full rounded-full', fill)} style={{ width: `${value_}%` }} />
      </div>
    </div>
  );
}

function DistributionCard({ title, data, order, labels, colors }) {
  const counts = data || {};
  const total = order.reduce((sum, key) => sum + (Number(counts[key]) || 0), 0);

  return (
    <section className="app-card p-4 sm:p-5">
      <h3 className="font-display font-bold text-on-surface mb-4">{title}</h3>
      {total === 0 ? (
        <p className="text-sm text-text-muted">No tasks to distribute yet.</p>
      ) : (
        <>
          <div className="flex items-stretch gap-0.5 h-3 rounded-full overflow-hidden bg-surface-container-low">
            {order.map((key) => {
              const count = Number(counts[key]) || 0;
              if (count === 0) return null;
              const share = Math.round((count / total) * 100);
              return (
                <div
                  key={key}
                  className={cn('h-full', colors[key])}
                  style={{ width: `${(count / total) * 100}%`, minWidth: '4px' }}
                  role="img"
                  aria-label={`${labels[key]}: ${count} (${share}%)`}
                  title={`${labels[key]}: ${count} (${share}%)`}
                />
              );
            })}
          </div>
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            {order.map((key) => {
              const count = Number(counts[key]) || 0;
              const share = total ? Math.round((count / total) * 100) : 0;
              return (
                <li key={key} className="flex items-center gap-2 text-sm">
                  <span className={cn('w-2.5 h-2.5 rounded-sm shrink-0', colors[key])} aria-hidden="true" />
                  <span className="text-on-surface-variant flex-1 truncate">{labels[key]}</span>
                  <span className="font-semibold text-on-surface tabular-nums">{count}</span>
                  <span className="text-text-muted tabular-nums w-10 text-right">{share}%</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function TasksChart({ series }) {
  const points = series || [];
  const max = points.reduce((m, d) => Math.max(m, Number(d.tasks) || 0), 0);
  const allZero = max === 0;
  const trackHeight = 160;
  const midIndex = Math.floor(points.length / 2);

  return (
    <section className="app-card p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-display font-bold text-on-surface">Tasks created over time</h3>
        <TrendingUp className="w-4 h-4 text-text-muted" aria-hidden="true" />
      </div>

      {points.length === 0 ? (
        <p className="text-sm text-text-muted">No tasks in this range.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="flex items-end gap-0.5 min-w-full" style={{ height: `${trackHeight}px` }}>
              {points.map((d) => {
                const tasks = Number(d.tasks) || 0;
                const height = allZero ? 3 : Math.max(3, Math.round((tasks / max) * trackHeight));
                const label = `${formatDay(d.date)}: ${tasks} ${tasks === 1 ? 'task' : 'tasks'}`;
                return (
                  <div key={d.date} className="flex-1 min-w-[6px] flex items-end">
                    <div
                      className="w-full bg-primary rounded-t"
                      style={{ height: `${height}px` }}
                      role="img"
                      aria-label={label}
                      title={label}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-2 flex justify-between text-xs text-text-muted">
            <span>{formatDay(points[0].date)}</span>
            {points.length > 2 && <span>{formatDay(points[midIndex].date)}</span>}
            <span>{formatDay(points[points.length - 1].date)}</span>
          </div>
          {allZero && <p className="mt-3 text-sm text-text-muted">No tasks in this range.</p>}
        </>
      )}
    </section>
  );
}

export default function Analytics() {
  const [range, setRange] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const fetchData = useCallback(async (nextRange) => {
    const id = requestId.current + 1;
    requestId.current = id;
    setLoading(true);
    setError('');
    try {
      const result = await getAnalytics({ range: nextRange });
      if (id !== requestId.current) return;
      setData(result);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err.message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(range); }, [range, fetchData]);

  const kpis = data?.kpis || {};
  const quality = data?.quality || {};
  const timeImpact = data?.timeImpact || {};
  const noData = data && !kpis.meetingsImported && !kpis.tasksTotal && !kpis.deliverablesExtracted;

  return (
    <div className="space-y-5 max-w-container-max mx-auto pb-6">
      <section className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-on-surface tracking-tight mb-1">Delivery Analytics</h1>
            <p className="font-body text-on-surface-variant">How your meetings-to-tasks pipeline is performing.</p>
          </div>
        </div>
        <div className="bg-surface-container-low rounded-xl p-1 inline-flex shrink-0" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={range === r.value}
              onClick={() => setRange(r.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-bold transition-colors',
                range === r.value
                  ? 'bg-surface-card text-on-surface shadow-sm ring-1 ring-border-subtle'
                  : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : noData ? (
        <section className="app-card">
          <EmptyState
            icon={Inbox}
            title="No analytics yet"
            description="Import meeting notes to start tracking your delivery efficiency."
          />
        </section>
      ) : data ? (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard icon={FileAudio} label="Meetings imported" value={kpis.meetingsImported ?? 0} color="bg-sky-500/10 text-sky-600" />
            <StatCard icon={Package} label="Deliverables extracted" value={kpis.deliverablesExtracted ?? 0} color="bg-violet-500/10 text-violet-600" />
            <StatCard icon={ListTodo} label="Tasks auto-generated" value={kpis.tasksGenerated ?? 0} />
            <StatCard icon={Repeat2} label="Prompt reuse" value={kpis.promptReuse ?? 0} color="bg-emerald-500/10 text-emerald-600" />
          </section>

          <section className="grid grid-cols-2 gap-3 sm:gap-4">
            <StatCard icon={ListChecks} label="Tasks total" value={kpis.tasksTotal ?? 0} color="bg-slate-500/10 text-slate-600" />
            <StatCard icon={FileText} label="Prompt templates" value={kpis.promptTemplates ?? 0} color="bg-amber-500/10 text-amber-600" />
          </section>

          <section className="app-card p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-text-muted" aria-hidden="true" />
              <h3 className="font-display font-bold text-on-surface">Time impact</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Figure
                label="Planning captured"
                value={formatMinutes(timeImpact.estimatedMinutes) !== '—'
                  ? formatMinutes(timeImpact.estimatedMinutes)
                  : `${timeImpact.estimatedHours || 0}h`}
                sub="Estimated effort planned"
              />
              <Figure label="Avg per task" value={formatMinutes(timeImpact.avgTaskMinutes)} sub="Mean estimate" />
              <Figure label="Total tasks" value={kpis.tasksTotal ?? 0} sub="Across this range" />
            </div>
          </section>

          <TasksChart series={data.timeseries} />

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <DistributionCard
              title="By status"
              data={data.tasksByStatus}
              order={STATUSES}
              labels={statusLabels}
              colors={statusBar}
            />
            <DistributionCard
              title="By priority"
              data={data.tasksByPriority}
              order={PRIORITIES}
              labels={priorityLabels}
              colors={priorityBar}
            />
          </section>

          <section className="app-card p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-text-muted" aria-hidden="true" />
              <h3 className="font-display font-bold text-on-surface">Quality</h3>
            </div>
            <div className="space-y-4">
              <Meter label="AI-generated task share" value={quality.aiTaskShare} />
              <Meter label="Validation confirmed" value={quality.validationConfirmedPct} fill="bg-emerald-500" />
              <Meter label="Completed" value={quality.donePct} fill="bg-emerald-500" />
            </div>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Figure label="Pending validation" value={quality.pendingValidation ?? 0} sub="Awaiting review" />
              <div className="rounded-xl bg-surface-container-low p-4 flex items-center gap-3">
                <Gauge className="w-5 h-5 text-text-muted shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-sm text-text-muted">Range</p>
                  <p className="text-sm font-bold text-on-surface">
                    {RANGES.find((r) => r.value === (data.range || range))?.label || range}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
