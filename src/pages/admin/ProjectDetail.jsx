import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, Check, ChevronDown, ClipboardCheck, Copy,
  ExternalLink, FileText, LayoutGrid, Library, Loader2, Package, Pencil,
  Plus, Trash2, Upload, X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  getProject, updateProject, createPromptTemplate, updatePromptTemplate,
  deletePromptTemplate, listPromptTemplates,
  statusStyles, statusLabels, priorityStyles, priorityLabels, formatMinutes,
  PROJECT_STATUSES, projectStatusStyles,
} from '../../services/plannerApi';

const primaryBtn = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm active:scale-[.98] transition-transform disabled:opacity-60';
const secondaryBtn = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-surface-container-low px-4 text-sm font-bold text-on-surface active:scale-[.98] transition-transform disabled:opacity-60';
const dangerBtn = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-error/10 px-4 text-sm font-bold text-error hover:bg-error/15 disabled:opacity-60';
const fieldClass = 'w-full rounded-xl border border-border-subtle bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/40';
const chipClass = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold';
const surfaceChip = 'inline-flex items-center gap-1.5 rounded-lg bg-surface-container-low px-2.5 py-1 text-xs font-semibold text-on-surface-variant';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'meetings', label: 'Meetings', icon: CalendarDays },
  { id: 'deliverables', label: 'Deliverables', icon: Package },
  { id: 'prompts', label: 'Prompt Library', icon: Library },
];

const TASK_ORDER = ['in_progress', 'blocked', 'planned', 'done'];

function capitalize(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const pctOf = (value) => (value == null ? null : Math.round(value * 100));
const statusChip = (status) => cn(chipClass, statusStyles[status] || 'bg-surface-container-low text-on-surface-variant');
const statusText = (status) => statusLabels[status] || capitalize(status);
const fmtDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-7 h-7 text-primary animate-spin" />
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

function Section({ title, action, children }) {
  return (
    <section className="app-card">
      <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-border-subtle">
        <h3 className="font-display font-bold text-on-surface">{title}</h3>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className="app-card p-4">
      <p className={cn('text-2xl font-display font-bold', highlight ? 'text-amber-600 dark:text-amber-400' : 'text-on-surface')}>{value}</p>
      <p className="text-sm text-text-muted mt-0.5">{label}</p>
    </div>
  );
}

function Tabs({ active, onChange }) {
  return (
    <nav className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0" aria-label="Project sections">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-current={active === id ? 'page' : undefined}
          className={cn(
            'min-h-10 px-4 rounded-xl text-sm font-bold whitespace-nowrap inline-flex items-center gap-2 transition-colors shrink-0',
            active === id ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-low',
          )}
        >
          <Icon className="w-4 h-4" /> {label}
        </button>
      ))}
    </nav>
  );
}

function TaskRow({ task, showDeliverable = true }) {
  return (
    <Link
      to={`/admin/planner/tasks/${task.id}`}
      className="block rounded-xl px-3 py-2.5 hover:bg-surface-container-low transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">{task.title}</span>
        <span className="shrink-0 text-xs text-text-muted">{formatMinutes(task.estimatedMinutes)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {task.priority && <span className={cn(chipClass, priorityStyles[task.priority])}>{priorityLabels[task.priority]}</span>}
        {task.status && <span className={statusChip(task.status)}>{statusText(task.status)}</span>}
        {showDeliverable && task.deliverableTitle && (
          <span className={surfaceChip}>{task.deliverableTitle}</span>
        )}
      </div>
    </Link>
  );
}

function DeliverableRow({ deliverable, tasks }) {
  const [open, setOpen] = useState(false);
  const own = tasks.filter((t) => t.deliverableId === deliverable.id);
  const pct = pctOf(deliverable.confidence);
  const count = deliverable.taskCount ?? own.length;

  return (
    <section className="app-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-start gap-3 p-4 sm:p-5 text-left"
      >
        <ChevronDown className={cn('w-5 h-5 mt-0.5 shrink-0 text-text-muted transition-transform', open && 'rotate-180')} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display font-bold text-on-surface">{deliverable.title}</h3>
            {deliverable.status && <span className={statusChip(deliverable.status)}>{statusText(deliverable.status)}</span>}
          </div>
          {deliverable.note && <p className={cn('mt-1 text-sm text-text-muted', !open && 'line-clamp-2')}>{deliverable.note}</p>}
        </div>
        <div className="shrink-0 text-right">
          {pct != null && <p className="text-xs font-semibold text-on-surface">{pct}%</p>}
          <p className="text-xs text-text-muted">{count} task{count === 1 ? '' : 's'}</p>
        </div>
      </button>
      {open && (
        <div className="border-t border-border-subtle px-4 sm:px-5 pb-4 pt-3">
          {own.length === 0 ? (
            <p className="text-sm text-text-muted">No tasks linked to this deliverable yet.</p>
          ) : (
            <div className="space-y-0.5">
              {own.map((task) => <TaskRow key={task.id} task={task} showDeliverable={false} />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PromptCard({ template, onCopy, onEdit, onDelete }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const copy = async () => {
    setError('');
    try {
      const clipped = await onCopy(template);
      if (clipped) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        setError('Usage recorded, but writing to the clipboard was blocked.');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="app-card p-4 sm:p-5 flex flex-col gap-3 border border-border-subtle">
      <div className="min-w-0">
        <h3 className="font-display font-bold text-on-surface truncate">{template.name}</h3>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          {template.category && <span className={surfaceChip}>{template.category}</span>}
          <span className="text-xs text-text-muted">{template.usageCount || 0} use{template.usageCount === 1 ? '' : 's'}</span>
        </div>
      </div>

      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-on-surface-variant max-h-40 overflow-y-auto bg-surface-container-lowest border border-border-subtle rounded-xl p-3">
        {template.body}
      </pre>

      {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-xs font-semibold text-error">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={primaryBtn}>
          {copied ? <ClipboardCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" onClick={() => onEdit(template)} className={secondaryBtn}>
          <Pencil className="w-4 h-4" /> Edit
        </button>
        <button type="button" onClick={() => onDelete(template)} className={dangerBtn} aria-label={`Delete template ${template.name}`}>
          <Trash2 className="w-4 h-4" /> Delete
        </button>
      </div>
    </div>
  );
}

function ProjectFormModal({ project, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: project.name || '',
    code: project.code || '',
    status: project.status || 'active',
    description: project.description || '',
    repoUrl: project.repoUrl || '',
    techStack: Array.isArray(project.techStack) ? project.techStack.join(', ') : (project.techStack || ''),
    architecture: project.architecture || '',
    codingStandards: project.codingStandards || '',
    folderStructure: project.folderStructure || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await updateProject(project.id, {
        name: form.name.trim(),
        code: form.code.trim(),
        status: form.status,
        description: form.description,
        repoUrl: form.repoUrl.trim(),
        techStack: form.techStack,
        architecture: form.architecture,
        codingStandards: form.codingStandards,
        folderStructure: form.folderStructure,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Edit project">
      <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-lg bg-surface-card rounded-t-[28px] sm:rounded-[24px] shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center justify-between">
          <h3 className="font-display font-bold text-on-surface">Edit project</h3>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="edit-name" className="block text-sm font-semibold text-on-surface mb-1.5">Name</label>
              <input id="edit-name" value={form.name} onChange={update('name')} placeholder="Payments Platform" autoFocus className={fieldClass} />
            </div>
            <div>
              <label htmlFor="edit-code" className="block text-sm font-semibold text-on-surface mb-1.5">Code</label>
              <input id="edit-code" value={form.code} onChange={update('code')} placeholder="PAY" className={fieldClass} />
            </div>
            <div>
              <label htmlFor="edit-status" className="block text-sm font-semibold text-on-surface mb-1.5">Status</label>
              <select id="edit-status" value={form.status} onChange={update('status')} className={fieldClass}>
                {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{capitalize(s)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="edit-description" className="block text-sm font-semibold text-on-surface mb-1.5">Description</label>
            <textarea id="edit-description" value={form.description} onChange={update('description')} rows={2} placeholder="What is this project about?" className={cn(fieldClass, 'resize-none')} />
          </div>

          <div>
            <label htmlFor="edit-repo" className="block text-sm font-semibold text-on-surface mb-1.5">Repository URL</label>
            <input id="edit-repo" value={form.repoUrl} onChange={update('repoUrl')} placeholder="https://github.com/org/repo" className={fieldClass} />
          </div>

          <div>
            <label htmlFor="edit-stack" className="block text-sm font-semibold text-on-surface mb-1.5">Tech stack</label>
            <input id="edit-stack" value={form.techStack} onChange={update('techStack')} placeholder="React, Go, D1" className={fieldClass} />
            <p className="mt-1 text-xs text-text-muted">Comma-separated, e.g. React, Go, D1</p>
          </div>

          <div>
            <label htmlFor="edit-architecture" className="block text-sm font-semibold text-on-surface mb-1.5">Architecture</label>
            <textarea id="edit-architecture" value={form.architecture} onChange={update('architecture')} rows={2} placeholder="High-level architecture notes…" className={cn(fieldClass, 'resize-none')} />
          </div>

          <div>
            <label htmlFor="edit-standards" className="block text-sm font-semibold text-on-surface mb-1.5">Coding standards</label>
            <textarea id="edit-standards" value={form.codingStandards} onChange={update('codingStandards')} rows={2} placeholder="Conventions, linting, review rules…" className={cn(fieldClass, 'resize-none')} />
          </div>

          <div>
            <label htmlFor="edit-folders" className="block text-sm font-semibold text-on-surface mb-1.5">Folder structure</label>
            <textarea id="edit-folders" value={form.folderStructure} onChange={update('folderStructure')} rows={2} placeholder="src/, tests/, docs/…" className={cn(fieldClass, 'resize-none')} />
          </div>

          {error && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className={cn(secondaryBtn, 'flex-1')}>Cancel</button>
            <button type="submit" disabled={saving} className={cn(primaryBtn, 'flex-1')}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PromptModal({ template, projectId, onClose, onSaved }) {
  const editing = Boolean(template);
  const [form, setForm] = useState({
    name: template?.name || '',
    category: template?.category || '',
    body: template?.body || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (!form.body.trim()) { setError('Body is required.'); return; }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await updatePromptTemplate(template.id, {
          name: form.name.trim(),
          category: form.category.trim(),
          body: form.body,
        });
      } else {
        await createPromptTemplate({
          projectId,
          name: form.name.trim(),
          category: form.category.trim(),
          body: form.body,
        });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={editing ? 'Edit template' : 'New template'}>
      <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-lg bg-surface-card rounded-t-[28px] sm:rounded-[24px] shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center justify-between">
          <h3 className="font-display font-bold text-on-surface">{editing ? 'Edit template' : 'New template'}</h3>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-4 sm:p-5 space-y-4">
          <div>
            <label htmlFor="tpl-name" className="block text-sm font-semibold text-on-surface mb-1.5">Name</label>
            <input id="tpl-name" value={form.name} onChange={update('name')} placeholder="Bug fix prompt" autoFocus className={fieldClass} />
          </div>
          <div>
            <label htmlFor="tpl-category" className="block text-sm font-semibold text-on-surface mb-1.5">Category</label>
            <input id="tpl-category" value={form.category} onChange={update('category')} placeholder="e.g. Refactor" className={fieldClass} />
          </div>
          <div>
            <label htmlFor="tpl-body" className="block text-sm font-semibold text-on-surface mb-1.5">Body</label>
            <textarea id="tpl-body" value={form.body} onChange={update('body')} rows={8} placeholder="Prompt text…" className={cn(fieldClass, 'font-mono text-xs min-h-40')} />
          </div>

          {error && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className={cn(secondaryBtn, 'flex-1')}>Cancel</button>
            <button type="submit" disabled={saving} className={cn(primaryBtn, 'flex-1')}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {editing ? 'Save changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProjectContext({ project, onEdit }) {
  const [open, setOpen] = useState(false);
  const stack = Array.isArray(project.techStack) ? project.techStack : [];
  const hasContext = Boolean(
    project.architecture || stack.length || project.repoUrl || project.codingStandards || project.folderStructure,
  );

  return (
    <section className="app-card">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left"
      >
        <span className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-text-muted" />
          <span className="font-display font-bold text-on-surface">Project context</span>
        </span>
        <ChevronDown className={cn('w-5 h-5 text-text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-border-subtle px-4 sm:px-5 pb-5 pt-4 space-y-5">
          <p className="text-xs text-text-muted">This context is available to task prompts.</p>

          {!hasContext ? (
            <p className="text-sm text-text-muted">
              No context yet.{' '}
              <button type="button" onClick={onEdit} className="font-semibold text-primary hover:underline">Edit project</button>{' '}
              to add architecture, tech stack and standards.
            </p>
          ) : (
            <div className="space-y-5">
              {project.architecture && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">Architecture</p>
                  <p className="whitespace-pre-wrap text-sm text-on-surface-variant">{project.architecture}</p>
                </div>
              )}

              {stack.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Tech stack</p>
                  <div className="flex flex-wrap gap-1.5">
                    {stack.map((tech) => <span key={tech} className={surfaceChip}>{tech}</span>)}
                  </div>
                </div>
              )}

              {project.repoUrl && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">Repository</p>
                  <a
                    href={project.repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline break-all"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" /> {project.repoUrl}
                  </a>
                </div>
              )}

              {project.codingStandards && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">Coding standards</p>
                  <p className="whitespace-pre-wrap text-sm text-on-surface-variant">{project.codingStandards}</p>
                </div>
              )}

              {project.folderStructure && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">Folder structure</p>
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs text-on-surface-variant bg-surface-container-lowest border border-border-subtle rounded-xl p-3 max-h-60 overflow-y-auto">
                    {project.folderStructure}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function OverviewTab({ objectives, tasks }) {
  const grouped = TASK_ORDER
    .map((status) => ({ status, items: tasks.filter((t) => t.status === status) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="space-y-4">
      <Section title="Objectives">
        {objectives.length === 0 ? (
          <p className="text-sm text-text-muted">No objectives captured yet.</p>
        ) : (
          <ul className="space-y-2 list-disc pl-5">
            {objectives.map((objective, index) => (
              <li key={index} className="text-sm text-on-surface">{objective}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Active tasks">
        {tasks.length === 0 ? (
          <p className="text-sm text-text-muted">No tasks yet. Import meeting notes to generate tasks.</p>
        ) : (
          <div className="space-y-5">
            {grouped.map((group) => (
              <div key={group.status} className="space-y-1">
                <div className="flex items-center gap-2 px-1">
                  <span className={statusChip(group.status)}>{statusText(group.status)}</span>
                  <span className="text-xs text-text-muted">{group.items.length}</span>
                </div>
                <div className="space-y-0.5">
                  {group.items.map((task) => <TaskRow key={task.id} task={task} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function MeetingsTab({ meetings }) {
  if (meetings.length === 0) {
    return (
      <section className="app-card">
        <EmptyState icon={CalendarDays} title="No meetings yet" description="Import meeting notes to capture summaries, deliverables and tasks." />
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {meetings.map((meeting) => {
        const pct = pctOf(meeting.confidence);
        const participants = Array.isArray(meeting.participants) ? meeting.participants : [];
        return (
          <section key={meeting.id} className="app-card p-4 sm:p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display font-bold text-on-surface">{meeting.title}</h3>
                <p className="text-xs text-text-muted mt-0.5">{fmtDate(meeting.meetingDate)}</p>
              </div>
              {pct != null && <span className={cn(surfaceChip, 'shrink-0')}>{pct}% confidence</span>}
            </div>

            {meeting.summary && <p className="text-sm text-on-surface-variant line-clamp-3">{meeting.summary}</p>}

            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span>{meeting.deliverableCount || 0} deliverables</span>
              <span aria-hidden="true">·</span>
              <span>{meeting.taskCount || 0} tasks</span>
            </div>

            {participants.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {participants.map((person, index) => (
                  <span key={index} className={surfaceChip}>
                    {person.name}{person.role ? ` · ${person.role}` : ''}
                  </span>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function DeliverablesTab({ deliverables, tasks }) {
  if (deliverables.length === 0) {
    return (
      <section className="app-card">
        <EmptyState icon={Package} title="No deliverables yet" description="Deliverables are extracted from meeting notes on import." />
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {deliverables.map((deliverable) => (
        <DeliverableRow key={deliverable.id} deliverable={deliverable} tasks={tasks} />
      ))}
    </div>
  );
}

function PromptsTab({ templates, error, onNew, onCopy, onEdit, onDelete }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-bold text-on-surface">Prompt library</h3>
          <p className="text-sm text-text-muted">Reusable prompts scoped to this project.</p>
        </div>
        <button type="button" onClick={onNew} className={cn(primaryBtn, 'shrink-0')}>
          <Plus className="w-4 h-4" /> New template
        </button>
      </div>

      {error && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

      {templates.length === 0 ? (
        <section className="app-card">
          <EmptyState
            icon={Library}
            title="No templates yet"
            description="Save reusable prompts so your team can share a consistent style."
            action={<button type="button" onClick={onNew} className={primaryBtn}><Plus className="w-4 h-4" /> New template</button>}
          />
        </section>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((template) => (
            <PromptCard
              key={template.id}
              template={template}
              onCopy={onCopy}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [promptModal, setPromptModal] = useState(null);
  const [tplError, setTplError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getProject(projectId);
      setData(result);
      setTemplates(result.promptTemplates || []);
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const refreshTemplates = async () => {
    setTplError('');
    try {
      const result = await listPromptTemplates({ projectId });
      setTemplates(result.templates || []);
    } catch (err) {
      setTplError(err.message);
    }
  };

  const handleCopy = async (template) => {
    let clipped = true;
    try {
      await navigator.clipboard.writeText(template.body || '');
    } catch {
      clipped = false;
    }
    const nextCount = (template.usageCount || 0) + 1;
    const { template: updated } = await updatePromptTemplate(template.id, { incrementUsage: true, usageCount: nextCount });
    setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    return clipped;
  };

  const handleDeleteTemplate = async (template) => {
    if (!window.confirm(`Delete template "${template.name}"? This cannot be undone.`)) return;
    setTplError('');
    try {
      await deletePromptTemplate(template.id);
      await refreshTemplates();
    } catch (err) {
      setTplError(err.message);
    }
  };

  const onTemplateSaved = async () => {
    setPromptModal(null);
    await refreshTemplates();
  };

  const onProjectSaved = async () => {
    setEditOpen(false);
    await load();
  };

  const backLink = (
    <Link to="/admin/planner/projects" className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface">
      <ArrowLeft className="w-4 h-4" /> Back to projects
    </Link>
  );

  if (loading) {
    return (
      <div className="space-y-5 max-w-container-max mx-auto pb-6">
        {backLink}
        <LoadingSpinner />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-5 max-w-container-max mx-auto pb-6">
        {backLink}
        {error ? (
          <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="font-display font-bold text-on-surface">Project not found</p>
            <p className="mt-1 text-sm text-text-muted">This project may have been deleted.</p>
          </div>
        )}
      </div>
    );
  }

  const { project, meetings = [], deliverables = [], tasks = [], objectives = [] } = data;
  const status = project.status || 'active';

  return (
    <div className="space-y-5 max-w-container-max mx-auto pb-6">
      {backLink}

      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">{project.name}</h1>
            {project.code && (
              <span className="inline-flex items-center rounded-md bg-surface-container-low px-1.5 py-0.5 text-[11px] font-bold font-mono text-on-surface-variant">
                {project.code}
              </span>
            )}
            <span className={cn('inline-flex items-center rounded-lg px-2 py-1 text-xs font-bold', projectStatusStyles[status])}>
              {capitalize(status)}
            </span>
          </div>
          {project.description && <p className="font-body text-on-surface-variant max-w-2xl">{project.description}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={() => navigate('/admin/planner/import')} className={secondaryBtn}>
            <Upload className="w-4 h-4" /> Import notes
          </button>
          <button type="button" onClick={() => setEditOpen(true)} className={primaryBtn}>
            <Pencil className="w-4 h-4" /> Edit project
          </button>
        </div>
      </section>

      {error && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="Meetings" value={project.meetingCount || 0} />
        <Stat label="Deliverables" value={project.deliverableCount || 0} />
        <Stat label="Tasks" value={project.taskCount || 0} />
        <Stat label="Pending review" value={project.pendingValidation || 0} highlight={(project.pendingValidation || 0) > 0} />
      </div>

      <ProjectContext project={project} onEdit={() => setEditOpen(true)} />

      <Tabs active={tab} onChange={setTab} />

      {tab === 'overview' && <OverviewTab objectives={objectives} tasks={tasks} />}
      {tab === 'meetings' && <MeetingsTab meetings={meetings} />}
      {tab === 'deliverables' && <DeliverablesTab deliverables={deliverables} tasks={tasks} />}
      {tab === 'prompts' && (
        <PromptsTab
          templates={templates}
          error={tplError}
          onNew={() => setPromptModal({ template: null })}
          onCopy={handleCopy}
          onEdit={(template) => setPromptModal({ template })}
          onDelete={handleDeleteTemplate}
        />
      )}

      {editOpen && (
        <ProjectFormModal project={project} onClose={() => setEditOpen(false)} onSaved={onProjectSaved} />
      )}

      {promptModal && (
        <PromptModal
          template={promptModal.template}
          projectId={projectId}
          onClose={() => setPromptModal(null)}
          onSaved={onTemplateSaved}
        />
      )}
    </div>
  );
}
