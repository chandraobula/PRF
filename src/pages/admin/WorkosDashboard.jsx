import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles, ArrowUpRight, FolderKanban, FileAudio, Package, ClipboardCheck,
  ListTodo, CheckCircle2, Ban, Clock, CalendarDays, Inbox, Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  getDashboard,
  statusStyles, statusLabels, priorityStyles, priorityLabels, formatMinutes, formatClock,
} from '../../services/plannerApi';

const primaryBtn = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm active:scale-[.98] transition-transform disabled:opacity-60';
const secondaryBtn = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-surface-container-low px-4 text-sm font-bold text-on-surface active:scale-[.98] transition-transform';
const projectChip = 'inline-flex items-center rounded-lg bg-surface-container-low px-2 py-0.5 text-xs font-semibold text-on-surface-variant max-w-[12rem] truncate';

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

function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface-container-low flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-text-muted" />
      </div>
      <p className="font-display font-bold text-on-surface">{title}</p>
      {description && <p className="mt-1 text-sm text-text-muted max-w-xs">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
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

function PriorityBadge({ priority }) {
  if (!priorityLabels[priority]) return null;
  return (
    <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none', priorityStyles[priority])}>
      {priorityLabels[priority]}
    </span>
  );
}

function StatusBadge({ status }) {
  if (!statusLabels[status]) return null;
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold leading-none', statusStyles[status])}>
      {statusLabels[status]}
    </span>
  );
}

function Confidence({ value }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-1.5" title={`Confidence ${pct}%`}>
      <span className="h-1.5 w-12 rounded-full bg-surface-container-low overflow-hidden" aria-hidden="true">
        <span className="block h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-[11px] font-semibold text-text-muted tabular-nums">{pct}%</span>
    </span>
  );
}

function CountPill({ children }) {
  return (
    <span className="inline-flex items-center rounded-lg bg-surface-container-low px-2 py-0.5 text-xs font-bold text-text-muted">
      {children}
    </span>
  );
}

export default function WorkosDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const result = await getDashboard();
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const importAction = (
    <button type="button" onClick={() => navigate('/admin/planner/import')} className={primaryBtn}>
      <Sparkles className="w-4 h-4" /> Import notes
    </button>
  );

  const stats = data?.stats || {};
  const todayTasks = data?.todayTasks || [];
  const validationQueue = data?.validationQueue || [];
  const recentMeetings = data?.recentMeetings || [];

  return (
    <div className="space-y-5 max-w-container-max mx-auto pb-6">
      <section className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-on-surface tracking-tight mb-1">AI WorkOS</h1>
          <p className="font-body text-on-surface-variant">Your engineering command center — meetings in, planned work out.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={() => navigate('/admin/planner/import')} className={primaryBtn}>
            <Sparkles className="w-4 h-4" /> Import notes
          </button>
          <button type="button" onClick={() => navigate('/admin/planner')} className={secondaryBtn}>
            <ArrowUpRight className="w-4 h-4" /> Open planner
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : data ? (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard icon={FolderKanban} label="Projects" value={stats.projects ?? 0} />
            <StatCard icon={FileAudio} label="Meetings imported" value={stats.meetings ?? 0} color="bg-sky-500/10 text-sky-600" />
            <StatCard icon={Package} label="Deliverables" value={stats.deliverables ?? 0} color="bg-violet-500/10 text-violet-600" />
            <StatCard icon={ClipboardCheck} label="Pending validation" value={stats.pendingValidation ?? 0} color="bg-amber-500/10 text-amber-600" />
          </section>

          <section className="grid grid-cols-3 gap-3 sm:gap-4">
            <StatCard icon={ListTodo} label="Open tasks" value={stats.openTasks ?? 0} color="bg-slate-500/10 text-slate-600" />
            <StatCard icon={CheckCircle2} label="Done" value={stats.doneTasks ?? 0} color="bg-emerald-500/10 text-emerald-600" />
            <StatCard icon={Ban} label="Blocked" value={stats.blockedTasks ?? 0} color="bg-red-500/10 text-red-600" />
          </section>

          <section className="app-card overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-display font-bold text-on-surface">Today's tasks</h3>
                <CountPill>{todayTasks.length}</CountPill>
                <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" /> {formatMinutes(data.todayEstimatedMinutes)}
                </span>
              </div>
              <Link to="/admin/planner" className="text-sm font-bold text-primary hover:underline shrink-0">View board</Link>
            </div>
            {todayTasks.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Nothing planned for today"
                description="Import your meeting notes to generate a planned, estimable day."
                action={importAction}
              />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {todayTasks.map((task) => (
                  <li key={task.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                    <span className="w-20 shrink-0 text-xs font-bold text-on-surface-variant tabular-nums">
                      {task.scheduledMinute != null ? formatClock(task.scheduledMinute) : 'Unscheduled'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/admin/planner/tasks/${task.id}`}
                        className={cn('font-semibold text-on-surface hover:underline block truncate', task.status === 'done' && 'line-through opacity-60')}
                      >
                        {task.title}
                      </Link>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <PriorityBadge priority={task.priority} />
                        <StatusBadge status={task.status} />
                        {task.projectName && <span className={projectChip}>{task.projectName}</span>}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-text-muted tabular-nums">{formatMinutes(task.estimatedMinutes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="app-card overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center gap-2">
              <h3 className="font-display font-bold text-on-surface">Validation queue</h3>
              <CountPill>{validationQueue.length}</CountPill>
            </div>
            {validationQueue.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nothing waiting for review 🎉" />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {validationQueue.map((task) => (
                  <li key={task.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/admin/planner/tasks/${task.id}`}
                        className="font-semibold text-on-surface hover:underline block truncate"
                      >
                        {task.title}
                      </Link>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <PriorityBadge priority={task.priority} />
                        {task.projectName && <span className={projectChip}>{task.projectName}</span>}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Confidence value={task.confidence} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="app-card overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center gap-2">
              <h3 className="font-display font-bold text-on-surface">Recent imports</h3>
              <CountPill>{recentMeetings.length}</CountPill>
            </div>
            {recentMeetings.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No meetings imported yet"
                description="Turn a set of meeting notes into deliverables and tasks."
                action={importAction}
              />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {recentMeetings.map((meeting) => (
                  <li key={meeting.id} className="flex items-start gap-3 px-4 sm:px-5 py-3">
                    <div className="w-9 h-9 rounded-xl bg-surface-container-low flex items-center justify-center shrink-0 mt-0.5">
                      <FileAudio className="w-4 h-4 text-text-muted" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-on-surface truncate">{meeting.title}</p>
                      <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-text-muted">
                        {meeting.projectName && <span className={projectChip}>{meeting.projectName}</span>}
                        <span>{meeting.deliverableCount} deliverables · {meeting.taskCount} tasks</span>
                        <span>{new Date(meeting.meetingDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Confidence value={meeting.confidence} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
