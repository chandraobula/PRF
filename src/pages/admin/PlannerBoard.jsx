import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Check, ChevronLeft, ChevronRight, Clock, GripVertical, ListTodo, Loader2, Plus, Sparkles, Trash2, X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  createTask, deleteTask, listProjects, listTasks, updateTask,
  STATUSES, statusLabels, priorityStyles, priorityLabels, formatMinutes, formatClock, toDateInput, weekStartOf,
} from '../../services/plannerApi';

const primaryBtn = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm active:scale-[.98] transition-transform disabled:opacity-60';
const secondaryBtn = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-surface-container-low px-4 text-sm font-bold text-on-surface active:scale-[.98] transition-transform';
const fieldClass = 'w-full rounded-xl border border-border-subtle bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/40';

const groupOrder = [
  ['in_progress', 'In Progress'],
  ['planned', 'Planned'],
  ['blocked', 'Blocked'],
  ['done', 'Done'],
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Parse a YYYY-MM-DD as a local date so arithmetic never drifts a day across the UTC boundary.
function parseLocalDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dayLabel(date) {
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function estimateText(task) {
  if (task.estimateLabel) return task.estimateLabel;
  if (task.estimatedMinutes) return formatMinutes(task.estimatedMinutes);
  return null;
}

// Solid left-border hues per priority (match the shared priorityStyles tints).
const priorityBorder = {
  critical: 'border-l-red-500',
  high: 'border-l-amber-500',
  medium: 'border-l-sky-500',
  low: 'border-l-slate-400',
};

function minuteToTimeInput(minute) {
  const value = Number(minute);
  if (minute == null || !Number.isFinite(value)) return '';
  const h = Math.floor(value / 60) % 24;
  const m = value % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// scheduledMinute ascending, nulls last, then orderIndex.
function sortBlocks(a, b) {
  const aNull = a.scheduledMinute == null;
  const bNull = b.scheduledMinute == null;
  if (aNull !== bNull) return aNull ? 1 : -1;
  if (!aNull && a.scheduledMinute !== b.scheduledMinute) return a.scheduledMinute - b.scheduledMinute;
  return (a.orderIndex || 0) - (b.orderIndex || 0);
}

function PriorityBadge({ priority, className }) {
  if (!priorityLabels[priority]) return null;
  return (
    <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none', priorityStyles[priority], className)}>
      {priorityLabels[priority]}
    </span>
  );
}

function WeekBlock({ task, dragging, onDragStart, onDragEnd, onTimeChange }) {
  const done = task.status === 'done';
  const project = task.projectName || task.projectTag;
  const source = task.meetingTitle || task.deliverableTitle;
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      className={cn(
        'rounded-lg border border-border-subtle border-l-4 bg-surface-container-lowest p-2 space-y-1.5 cursor-grab active:cursor-grabbing',
        priorityBorder[task.priority] || 'border-l-border-subtle',
        dragging && 'opacity-50',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-on-surface-variant">
          <GripVertical className="w-3 h-3 text-text-muted shrink-0" aria-hidden="true" />
          {task.scheduledMinute != null ? formatClock(task.scheduledMinute) : 'Unscheduled'}
        </span>
        <PriorityBadge priority={task.priority} />
      </div>
      <Link
        to={`/admin/planner/tasks/${task.id}`}
        className={cn('block text-sm font-semibold text-on-surface hover:underline', done && 'line-through opacity-60')}
      >
        {task.title}
      </Link>
      <div className="flex items-center gap-1.5 flex-wrap">
        {project && (
          <span className="inline-flex items-center rounded-md bg-surface-container-low px-1.5 py-0.5 text-[10px] font-semibold text-on-surface-variant">
            {project}
          </span>
        )}
        <span className="text-[11px] text-text-muted">{formatMinutes(task.estimatedMinutes)}</span>
      </div>
      {source && <p className="text-[11px] text-text-muted truncate">{source}</p>}
      <div>
        <label htmlFor={`block-time-${task.id}`} className="sr-only">Block time for {task.title}</label>
        <input
          id={`block-time-${task.id}`}
          type="time"
          value={minuteToTimeInput(task.scheduledMinute)}
          onChange={(e) => onTimeChange(task, e.target.value)}
          className="w-full rounded-md border border-border-subtle bg-surface-card px-2 py-1 text-[11px] text-on-surface outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
    </div>
  );
}

export default function PlannerBoard() {
  const navigate = useNavigate();
  const [view, setView] = useState('today');
  const [date, setDate] = useState(toDateInput(new Date()));
  const [weekStart, setWeekStart] = useState(weekStartOf(new Date()));
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [totalEstimatedMinutes, setTotalEstimatedMinutes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [draggingId, setDraggingId] = useState('');
  const [dragOverDay, setDragOverDay] = useState('');

  const requestKeyRef = useRef('');
  const todayStr = toDateInput(new Date());

  const load = useCallback(async () => {
    const key = `${view}:${view === 'today' ? date : weekStart}:${projectId}`;
    requestKeyRef.current = key;
    setLoading(true);
    setError('');
    const params = projectId ? { projectId } : {};
    if (view === 'today') params.date = date;
    else params.week = weekStart;
    try {
      const data = await listTasks(params);
      if (requestKeyRef.current !== key) return; // ignore out-of-order response
      setTasks(data.tasks || []);
      setTotalEstimatedMinutes(data.totalEstimatedMinutes || 0);
    } catch (err) {
      if (requestKeyRef.current !== key) return;
      setError(err.message);
    } finally {
      if (requestKeyRef.current === key) setLoading(false);
    }
  }, [view, date, weekStart, projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const { projects: found } = await listProjects();
        setProjects(found || []);
      } catch {
        /* filter falls back to "All projects" */
      }
    })();
  }, []);

  const weekDays = useMemo(() => {
    const start = parseLocalDate(weekStart);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const shiftDate = (delta) => {
    const d = parseLocalDate(date);
    d.setDate(d.getDate() + delta);
    setDate(toDateInput(d));
  };

  const shiftWeek = (delta) => {
    const d = parseLocalDate(weekStart);
    d.setDate(d.getDate() + delta);
    setWeekStart(weekStartOf(d));
  };

  const changeStatus = async (task, status) => {
    const previous = tasks;
    setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      await updateTask(task.id, { status });
    } catch (err) {
      setTasks(previous);
      setError(err.message);
    }
  };

  const remove = async (task) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    const previous = tasks;
    setTasks((list) => list.filter((t) => t.id !== task.id));
    try {
      await deleteTask(task.id);
      load();
    } catch (err) {
      setTasks(previous);
      setError(err.message);
    }
  };

  const onBlockDragStart = (e, task) => {
    e.dataTransfer.setData('text/plain', String(task.id));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(task.id);
  };

  const onDayDragOver = (e, key) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDay !== key) setDragOverDay(key);
  };

  const onDayDragLeave = (e, key) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOverDay((current) => (current === key ? '' : current));
  };

  const onDayDrop = async (e, key) => {
    e.preventDefault();
    setDragOverDay('');
    setDraggingId('');
    const id = e.dataTransfer.getData('text/plain');
    const task = tasks.find((t) => String(t.id) === id);
    if (!task || task.planDate === key) return;
    const previous = tasks;
    setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, planDate: key } : t)));
    try {
      await updateTask(task.id, { planDate: key });
    } catch (err) {
      setTasks(previous);
      setError(err.message);
    }
  };

  const setBlockTime = async (task, value) => {
    const parts = value ? value.split(':').map(Number) : null;
    const scheduledMinute = parts ? parts[0] * 60 + parts[1] : null;
    const previous = tasks;
    setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, scheduledMinute } : t)));
    try {
      await updateTask(task.id, { scheduledMinute });
    } catch (err) {
      setTasks(previous);
      setError(err.message);
    }
  };

  return (
    <div className="space-y-5 max-w-container-max mx-auto pb-6">
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-on-surface tracking-tight mb-1">Dev Planner</h1>
            <p className="font-body text-on-surface-variant">Turn your standup notes into a planned, estimable day.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => navigate('/admin/planner/import')} className={primaryBtn}>
              <Sparkles className="w-4 h-4" /> Import notes
            </button>
            <button type="button" onClick={() => setModalOpen(true)} className={secondaryBtn}>
              <Plus className="w-4 h-4" /> Add task
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <StatCard icon={ListTodo} label="Tasks" value={tasks.length} />
          <StatCard icon={Clock} label="Estimated" value={formatMinutes(totalEstimatedMinutes)} color="bg-sky-500/10 text-sky-600" />
        </div>
      </section>

      {error && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

      <section className="app-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-surface-container-low rounded-xl p-1 inline-flex" role="group" aria-label="View">
            <button
              type="button"
              aria-pressed={view === 'today'}
              onClick={() => setView('today')}
              className={cn('px-4 py-2 rounded-lg text-sm font-bold transition-colors', view === 'today' ? 'bg-surface-card text-on-surface shadow-sm ring-1 ring-border-subtle' : 'text-on-surface-variant')}
            >
              Today
            </button>
            <button
              type="button"
              aria-pressed={view === 'week'}
              onClick={() => setView('week')}
              className={cn('px-4 py-2 rounded-lg text-sm font-bold transition-colors', view === 'week' ? 'bg-surface-card text-on-surface shadow-sm ring-1 ring-border-subtle' : 'text-on-surface-variant')}
            >
              Week
            </button>
          </div>

          {view === 'today' ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => shiftDate(-1)} className="icon-button" aria-label="Previous day"><ChevronLeft className="w-4 h-4" /></button>
              <label htmlFor="planner-date" className="sr-only">Date</label>
              <input id="planner-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(fieldClass, 'w-auto')} />
              <button type="button" onClick={() => shiftDate(1)} className="icon-button" aria-label="Next day"><ChevronRight className="w-4 h-4" /></button>
              <button type="button" onClick={() => setDate(todayStr)} className={secondaryBtn}>Today</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => shiftWeek(-7)} className="icon-button" aria-label="Previous week"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-bold text-on-surface px-1">{dayLabel(weekDays[0])} – {dayLabel(weekDays[6])}</span>
              <button type="button" onClick={() => shiftWeek(7)} className="icon-button" aria-label="Next week"><ChevronRight className="w-4 h-4" /></button>
              <button type="button" onClick={() => setWeekStart(weekStartOf(new Date()))} className={secondaryBtn}>This week</button>
            </div>
          )}

          <div className="sm:ml-auto">
            <label htmlFor="planner-project" className="sr-only">Project</label>
            <select id="planner-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={cn(fieldClass, 'w-auto')}>
              <option value="">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      </section>

      {loading ? (
        <LoadingSpinner />
      ) : tasks.length === 0 ? (
        <section className="app-card">
          <EmptyState
            icon={ListTodo}
            title="Nothing planned yet"
            description="Import your standup notes to generate a planned, estimable day."
            action={<button type="button" onClick={() => navigate('/admin/planner/import')} className={primaryBtn}><Sparkles className="w-4 h-4" /> Import notes</button>}
          />
        </section>
      ) : view === 'today' ? (
        <div className="space-y-4">
          {groupOrder.map(([status, label]) => {
            const items = tasks.filter((t) => t.status === status);
            if (items.length === 0) return null;
            return (
              <section key={status} className="app-card">
                <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center justify-between">
                  <h3 className="font-display font-bold text-on-surface">{label}</h3>
                  <span className="text-sm font-bold text-text-muted">{items.length}</span>
                </div>
                <ul className="divide-y divide-border-subtle">
                  {items.map((task) => (
                    <li key={task.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/admin/planner/tasks/${task.id}`}
                          className={cn('font-semibold text-on-surface hover:underline block truncate', task.status === 'done' && 'line-through opacity-60')}
                        >
                          {task.title}
                        </Link>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          <PriorityBadge priority={task.priority} />
                          {(task.projectName || task.projectTag) && (
                            <span className="inline-flex items-center rounded-lg bg-surface-container-low px-2 py-0.5 text-xs font-semibold text-on-surface-variant">
                              {task.projectName || task.projectTag}
                            </span>
                          )}
                          {estimateText(task) && <span className="text-xs text-text-muted">{estimateText(task)}</span>}
                        </div>
                      </div>
                      <label htmlFor={`status-${task.id}`} className="sr-only">Status for {task.title}</label>
                      <select
                        id={`status-${task.id}`}
                        value={task.status}
                        onChange={(e) => changeStatus(task, e.target.value)}
                        className="rounded-xl border border-border-subtle bg-surface-container-lowest px-2.5 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}
                      </select>
                      <button type="button" onClick={() => remove(task)} className="icon-button" aria-label={`Delete ${task.title}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="grid gap-3 grid-cols-1 md:grid-flow-col md:auto-cols-[minmax(13rem,1fr)] lg:grid-flow-row lg:grid-cols-7">
            {weekDays.map((day) => {
              const key = toDateInput(day);
              const dayTasks = tasks.filter((t) => t.planDate === key).sort(sortBlocks);
              const dayTotal = dayTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
              const isToday = key === todayStr;
              const capacityPct = Math.round((dayTotal / 480) * 100);
              return (
                <div
                  key={key}
                  onDragOver={(e) => onDayDragOver(e, key)}
                  onDragLeave={(e) => onDayDragLeave(e, key)}
                  onDrop={(e) => onDayDrop(e, key)}
                  className={cn(
                    'app-card p-3 space-y-2 transition-shadow',
                    isToday && 'ring-2 ring-primary',
                    dragOverDay === key && 'ring-2 ring-primary/40',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display font-bold text-on-surface text-sm leading-tight">{WEEKDAYS[day.getDay()]}</p>
                      <p className="text-xs text-text-muted">{day.getDate()} {MONTHS[day.getMonth()]}</p>
                    </div>
                    <span className="shrink-0 rounded-md bg-surface-container-low px-1.5 py-0.5 text-[11px] font-semibold text-text-muted">{formatMinutes(dayTotal)}</span>
                  </div>
                  <div className="h-1 rounded-full bg-surface-container-low overflow-hidden" aria-hidden="true">
                    <div className={cn('h-full rounded-full', capacityPct > 100 ? 'bg-error' : 'bg-primary/50')} style={{ width: `${Math.min(100, capacityPct)}%` }} />
                  </div>
                  <div className="space-y-2 min-h-[3rem]">
                    {dayTasks.length === 0 ? (
                      <p className="text-xs text-text-muted py-3 text-center">Nothing planned</p>
                    ) : dayTasks.map((t) => (
                      <WeekBlock
                        key={t.id}
                        task={t}
                        dragging={draggingId === t.id}
                        onDragStart={onBlockDragStart}
                        onDragEnd={() => setDraggingId('')}
                        onTimeChange={setBlockTime}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modalOpen && (
        <CreateTaskModal
          projects={projects}
          defaultProjectId={projectId}
          defaultDate={view === 'today' ? date : weekStart}
          onClose={() => setModalOpen(false)}
          onCreated={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateTaskModal({ projects, defaultProjectId, defaultDate, onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', description: '', projectId: defaultProjectId, planDate: defaultDate });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await createTask({
        title: form.title.trim(),
        description: form.description,
        planDate: form.planDate || null,
        projectId: form.projectId || null,
        acceptanceCriteria: [],
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Add task">
      <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-lg bg-surface-card rounded-t-[28px] sm:rounded-[24px] shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center justify-between">
          <h3 className="font-display font-bold text-on-surface">Add task</h3>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-4 sm:p-5 space-y-4">
          <div>
            <label htmlFor="task-title" className="block text-sm font-semibold text-on-surface mb-1.5">Title</label>
            <input id="task-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Wire up the settings API" autoFocus className={fieldClass} />
          </div>
          <div>
            <label htmlFor="task-desc" className="block text-sm font-semibold text-on-surface mb-1.5">Description</label>
            <textarea id="task-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Optional context…" className={cn(fieldClass, 'resize-none')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="task-project" className="block text-sm font-semibold text-on-surface mb-1.5">Project</label>
              <select id="task-project" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className={fieldClass}>
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="task-date" className="block text-sm font-semibold text-on-surface mb-1.5">Plan date</label>
              <input id="task-date" type="date" value={form.planDate} onChange={(e) => setForm({ ...form, planDate: e.target.value })} className={fieldClass} />
            </div>
          </div>
          {error && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className={cn(secondaryBtn, 'flex-1')}>Cancel</button>
            <button type="submit" disabled={saving} className={cn(primaryBtn, 'flex-1')}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Add task
            </button>
          </div>
        </form>
      </div>
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

function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface-container-low flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-text-muted" />
      </div>
      <p className="font-display font-bold text-on-surface">{title}</p>
      <p className="mt-1 text-sm text-text-muted max-w-xs">{description}</p>
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
