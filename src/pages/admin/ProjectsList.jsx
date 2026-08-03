import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Check, FolderKanban, Loader2, Plus, X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  createProject, listProjects, PROJECT_STATUSES, projectStatusStyles,
} from '../../services/plannerApi';

const primaryBtn = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm active:scale-[.98] transition-transform disabled:opacity-60';
const secondaryBtn = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-surface-container-low px-4 text-sm font-bold text-on-surface active:scale-[.98] transition-transform';
const fieldClass = 'w-full rounded-xl border border-border-subtle bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/40';

const filters = [
  ['all', 'All'],
  ['active', 'Active'],
  ['paused', 'Paused'],
  ['archived', 'Archived'],
];

function capitalize(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function ProjectCard({ project }) {
  const status = project.status || 'active';
  const stack = Array.isArray(project.techStack) ? project.techStack : [];
  const pending = project.pendingValidation || 0;
  const stats = [
    ['Meetings', project.meetingCount || 0, false],
    ['Open tasks', project.openTaskCount || 0, false],
    ['Deliverables', project.deliverableCount || 0, false],
    ['Pending review', pending, pending > 0],
  ];

  return (
    <Link
      to={`/admin/planner/projects/${project.id}`}
      className="app-card p-4 sm:p-5 flex flex-col gap-3 border border-border-subtle hover:border-primary transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display font-bold text-on-surface truncate">{project.name}</h3>
            {project.code && (
              <span className="inline-flex items-center rounded-md bg-surface-container-low px-1.5 py-0.5 text-[11px] font-bold font-mono text-on-surface-variant">
                {project.code}
              </span>
            )}
          </div>
        </div>
        <span className={cn('shrink-0 inline-flex items-center rounded-lg px-2 py-1 text-xs font-bold', projectStatusStyles[status])}>
          {capitalize(status)}
        </span>
      </div>

      {project.description && (
        <p className="text-sm text-on-surface-variant line-clamp-2">{project.description}</p>
      )}

      {stack.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {stack.slice(0, 4).map((tech) => (
            <span key={tech} className="inline-flex items-center rounded-md bg-surface-container-low px-1.5 py-0.5 text-[11px] font-semibold text-on-surface-variant">
              {tech}
            </span>
          ))}
          {stack.length > 4 && (
            <span className="text-[11px] font-semibold text-text-muted">+{stack.length - 4}</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mt-auto pt-1">
        {stats.map(([label, value, highlight]) => (
          <div key={label} className="rounded-xl bg-surface-container-lowest px-3 py-2">
            <p className={cn('text-lg font-display font-bold', highlight ? 'text-amber-600 dark:text-amber-400' : 'text-on-surface')}>{value}</p>
            <p className="text-xs text-text-muted">{label}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-text-muted pt-1 border-t border-border-subtle">
        Last meeting {project.lastMeetingDate ? new Date(project.lastMeetingDate).toLocaleDateString() : '—'}
      </p>
    </Link>
  );
}

export default function ProjectsList() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listProjects();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = filter === 'all' ? projects : projects.filter((p) => p.status === filter);

  return (
    <div className="space-y-5 max-w-container-max mx-auto pb-6">
      <section className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-on-surface tracking-tight mb-1">Projects</h1>
          <p className="font-body text-on-surface-variant">Engineering initiatives, their meetings and delivery status.</p>
        </div>
        <button type="button" onClick={() => setModalOpen(true)} className={cn(primaryBtn, 'shrink-0')}>
          <Plus className="w-4 h-4" /> New project
        </button>
      </section>

      {error && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {filters.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              'px-3.5 py-2 rounded-xl text-sm font-bold transition-colors',
              filter === value ? 'bg-primary text-white shadow-sm' : 'bg-surface-container-low text-on-surface-variant',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : visible.length === 0 ? (
        <section className="app-card">
          <EmptyState
            icon={FolderKanban}
            title={filter === 'all' ? 'No projects yet' : 'No matching projects'}
            description={filter === 'all' ? 'Create a project to track its meetings, tasks and deliverables.' : 'Try a different status filter.'}
            action={<button type="button" onClick={() => setModalOpen(true)} className={primaryBtn}><Plus className="w-4 h-4" /> New project</button>}
          />
        </section>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project) => <ProjectCard key={project.id} project={project} />)}
        </div>
      )}

      {modalOpen && <CreateProjectModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}

function CreateProjectModal({ onClose }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', code: '', status: 'active', description: '', repoUrl: '',
    techStack: '', architecture: '', codingStandards: '', folderStructure: '',
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
      const { project } = await createProject({
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
      onClose();
      navigate(`/admin/planner/projects/${project.id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="New project">
      <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative w-full sm:max-w-lg bg-surface-card rounded-t-[28px] sm:rounded-[24px] shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center justify-between">
          <h3 className="font-display font-bold text-on-surface">New project</h3>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="project-name" className="block text-sm font-semibold text-on-surface mb-1.5">Name</label>
              <input id="project-name" value={form.name} onChange={update('name')} placeholder="Payments Platform" autoFocus className={fieldClass} />
            </div>
            <div>
              <label htmlFor="project-code" className="block text-sm font-semibold text-on-surface mb-1.5">Code</label>
              <input id="project-code" value={form.code} onChange={update('code')} placeholder="PAY" className={fieldClass} />
            </div>
            <div>
              <label htmlFor="project-status" className="block text-sm font-semibold text-on-surface mb-1.5">Status</label>
              <select id="project-status" value={form.status} onChange={update('status')} className={fieldClass}>
                {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{capitalize(s)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="project-description" className="block text-sm font-semibold text-on-surface mb-1.5">Description</label>
            <textarea id="project-description" value={form.description} onChange={update('description')} rows={2} placeholder="What is this project about?" className={cn(fieldClass, 'resize-none')} />
          </div>

          <div>
            <label htmlFor="project-repo" className="block text-sm font-semibold text-on-surface mb-1.5">Repository URL</label>
            <input id="project-repo" value={form.repoUrl} onChange={update('repoUrl')} placeholder="https://github.com/org/repo" className={fieldClass} />
          </div>

          <div>
            <label htmlFor="project-stack" className="block text-sm font-semibold text-on-surface mb-1.5">Tech stack</label>
            <input id="project-stack" value={form.techStack} onChange={update('techStack')} placeholder="React, Go, D1" className={fieldClass} />
            <p className="mt-1 text-xs text-text-muted">Comma-separated, e.g. React, Go, D1</p>
          </div>

          <div>
            <label htmlFor="project-architecture" className="block text-sm font-semibold text-on-surface mb-1.5">Architecture</label>
            <textarea id="project-architecture" value={form.architecture} onChange={update('architecture')} rows={2} placeholder="High-level architecture notes…" className={cn(fieldClass, 'resize-none')} />
          </div>

          <div>
            <label htmlFor="project-standards" className="block text-sm font-semibold text-on-surface mb-1.5">Coding standards</label>
            <textarea id="project-standards" value={form.codingStandards} onChange={update('codingStandards')} rows={2} placeholder="Conventions, linting, review rules…" className={cn(fieldClass, 'resize-none')} />
          </div>

          <div>
            <label htmlFor="project-folders" className="block text-sm font-semibold text-on-surface mb-1.5">Folder structure</label>
            <textarea id="project-folders" value={form.folderStructure} onChange={update('folderStructure')} rows={2} placeholder="src/, tests/, docs/…" className={cn(fieldClass, 'resize-none')} />
          </div>

          {error && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className={cn(secondaryBtn, 'flex-1')}>Cancel</button>
            <button type="submit" disabled={saving} className={cn(primaryBtn, 'flex-1')}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Create
            </button>
          </div>
        </form>
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
