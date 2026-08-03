import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Check, ChevronDown, ClipboardCheck, Copy, FileText, Loader2, Merge,
  Pencil, Plus, RefreshCw, ShieldCheck, Sparkles, Split, ThumbsDown, ThumbsUp,
  Trash2, X, XCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  getTask, updateTask, deleteTask, generatePrompt, setPromptUsed,
  generateEstimate, generateComprehension, updateComprehension, listProjects,
  listTasks, setDependencies, validateTask,
  STATUSES, statusStyles, statusLabels, PRIORITIES, priorityStyles, priorityLabels,
  formatMinutes, formatClock,
} from '../../services/plannerApi';

const primaryBtn = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm active:scale-[.98] transition-transform disabled:opacity-60';
const secondaryBtn = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-surface-container-low px-4 text-sm font-bold text-on-surface active:scale-[.98] transition-transform disabled:opacity-60';
const fieldClass = 'w-full rounded-xl border border-border-subtle bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/40';
const chipClass = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold';

const validationLabels = {
  pending: 'Pending review', confirmed: 'Confirmed', edited: 'Edited',
  rejected: 'Rejected', merged: 'Merged', split: 'Split',
};

const validationStyles = {
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  confirmed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  edited: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  rejected: 'bg-red-500/15 text-red-700 dark:text-red-400',
  merged: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
  split: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
};

const emptySplit = { title: '', description: '', estimatedMinutes: '' };

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

const fmtDate = (value) => (value ? new Date(value).toLocaleString() : '—');

export default function TaskDetail() {
  const { taskId } = useParams();
  const navigate = useNavigate();

  const [task, setTask] = useState(null);
  const [meeting, setMeeting] = useState(null);
  const [deliverable, setDeliverable] = useState(null);
  const [deps, setDeps] = useState([]);
  const [dependents, setDependents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [criteriaDraft, setCriteriaDraft] = useState([]);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [comprehensionInput, setComprehensionInput] = useState('');
  const [showComprehensionPaste, setShowComprehensionPaste] = useState(false);
  const [annotationDraft, setAnnotationDraft] = useState('');
  const [answerDraft, setAnswerDraft] = useState('');
  const [estimateDraft, setEstimateDraft] = useState('');
  const [actualDraft, setActualDraft] = useState('');
  const [rawTextOpen, setRawTextOpen] = useState(false);

  const [depModalOpen, setDepModalOpen] = useState(false);
  const [depOptions, setDepOptions] = useState([]);
  const [depChecked, setDepChecked] = useState([]);
  const [depLoading, setDepLoading] = useState(false);
  const [depSaving, setDepSaving] = useState(false);
  const [depError, setDepError] = useState('');

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeOptions, setMergeOptions] = useState([]);
  const [mergeTarget, setMergeTarget] = useState('');
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeSaving, setMergeSaving] = useState(false);
  const [mergeError, setMergeError] = useState('');

  const [splitOpen, setSplitOpen] = useState(false);
  const [splitRows, setSplitRows] = useState([{ ...emptySplit }, { ...emptySplit }]);
  const [splitSaving, setSplitSaving] = useState(false);
  const [splitError, setSplitError] = useState('');

  const seed = (t) => {
    setDescDraft(t.description || '');
    setCriteriaDraft(t.acceptanceCriteria || []);
    setCategoryDraft(t.category || '');
    setAnnotationDraft(t.userAnnotation || '');
    setAnswerDraft(t.userAnswer || '');
    setEstimateDraft(t.estimatedMinutes == null ? '' : String(t.estimatedMinutes));
    setActualDraft(t.actualMinutes == null ? '' : String(t.actualMinutes));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getTask(taskId);
      setTask(data.task);
      setMeeting(data.meeting || null);
      setDeliverable(data.deliverable || null);
      setDeps(data.dependencies || []);
      setDependents(data.dependents || []);
      seed(data.task);
    } catch (err) {
      setError(err.message);
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const data = await listProjects();
        setProjects(data.projects || []);
      } catch {
        setProjects([]);
      }
    })();
  }, []);

  const run = async (fn) => {
    setError('');
    try {
      const data = await fn();
      if (data && data.task) setTask(data.task);
      return data;
    } catch (err) {
      setError(err.message);
      return undefined;
    }
  };

  const runBusy = async (key, fn) => {
    setBusy(key);
    setError('');
    try {
      const data = await fn();
      if (data && data.task) setTask(data.task);
      return data;
    } catch (err) {
      setError(err.message);
      return undefined;
    } finally {
      setBusy('');
    }
  };

  const startEditTitle = () => { setTitleDraft(task.title); setEditingTitle(true); };
  const cancelTitle = () => { setTitleDraft(task.title); setEditingTitle(false); };
  const saveTitle = async () => {
    const next = titleDraft.trim();
    if (!next || next === task.title) { setTitleDraft(task.title); setEditingTitle(false); return; }
    try {
      const data = await updateTask(task.id, { title: next });
      setTask(data.task);
      setEditingTitle(false);
    } catch (err) {
      setError(err.message);
    }
  };
  const onTitleKey = (event) => {
    if (event.key === 'Enter') { event.preventDefault(); saveTitle(); }
    else if (event.key === 'Escape') { event.preventDefault(); cancelTitle(); }
  };

  const saveDescription = () => run(() => updateTask(task.id, { description: descDraft }));

  const setCriterion = (index, value) =>
    setCriteriaDraft((prev) => prev.map((item, i) => (i === index ? value : item)));
  const removeCriterion = (index) =>
    setCriteriaDraft((prev) => prev.filter((_, i) => i !== index));
  const addCriterion = () => setCriteriaDraft((prev) => [...prev, '']);
  const saveCriteria = async () => {
    const cleaned = criteriaDraft.map((item) => item.trim()).filter(Boolean);
    try {
      const data = await updateTask(task.id, { acceptanceCriteria: cleaned });
      setTask(data.task);
      setCriteriaDraft(data.task.acceptanceCriteria || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const saveCategory = () => {
    const next = categoryDraft.trim();
    if (next === (task.category || '')) return;
    run(async () => {
      const data = await updateTask(task.id, { category: next });
      setCategoryDraft(data.task.category || '');
      return data;
    });
  };

  const doGeneratePrompt = async () => {
    setEditingPrompt(false);
    await runBusy('prompt', () => generatePrompt(task.id));
  };
  const toggleEditPrompt = () => {
    if (editingPrompt) { setEditingPrompt(false); return; }
    setPromptDraft(task.generatedPrompt || '');
    setEditingPrompt(true);
  };
  const copyPrompt = async () => {
    const text = editingPrompt ? promptDraft : (task.generatedPrompt || '');
    if (!text) return;
    setError('');
    let clipped = true;
    try { await navigator.clipboard.writeText(text); } catch { clipped = false; }
    try {
      const data = await setPromptUsed(task.id, text);
      setTask(data.task);
    } catch (err) {
      setError(err.message);
      return;
    }
    if (clipped) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setError('Prompt recorded, but writing to the clipboard was blocked.');
    }
  };

  const doGenerateComprehension = async () => {
    const data = await runBusy('comprehension', () => generateComprehension(task.id, comprehensionInput));
    if (data && data.task) setShowComprehensionPaste(false);
  };
  const startRegenerateComprehension = () => {
    setComprehensionInput(task.comprehensionInput || '');
    setShowComprehensionPaste(true);
  };
  const setFeedback = (value) => {
    const next = task.summaryFeedback === value ? null : value;
    run(() => updateComprehension(task.id, { summaryFeedback: next }));
  };
  const saveAnnotation = () => run(() => updateComprehension(task.id, { userAnnotation: annotationDraft }));
  const saveAnswer = () => run(() => updateComprehension(task.id, { userAnswer: answerDraft }));

  const saveEstimate = () => {
    const raw = estimateDraft.trim();
    const value = raw === '' ? null : Number(raw);
    if (value !== null && (Number.isNaN(value) || value < 0)) { setError('Estimate must be zero or more.'); return; }
    if (value === (task.estimatedMinutes ?? null)) return;
    run(async () => {
      const data = await updateTask(task.id, { estimatedMinutes: value });
      setEstimateDraft(data.task.estimatedMinutes == null ? '' : String(data.task.estimatedMinutes));
      return data;
    });
  };
  const saveActual = () => {
    const raw = actualDraft.trim();
    const value = raw === '' ? null : Number(raw);
    if (value !== null && (Number.isNaN(value) || value < 0)) { setError('Actual minutes must be zero or more.'); return; }
    if (value === (task.actualMinutes ?? null)) return;
    run(async () => {
      const data = await updateTask(task.id, { actualMinutes: value });
      setActualDraft(data.task.actualMinutes == null ? '' : String(data.task.actualMinutes));
      return data;
    });
  };
  const reestimate = () => runBusy('estimate', async () => {
    const data = await generateEstimate(task.id);
    setEstimateDraft(data.task.estimatedMinutes == null ? '' : String(data.task.estimatedMinutes));
    return data;
  });

  const confirmValidation = () => runBusy('validate', () => validateTask(task.id, { action: 'confirm' }));
  const rejectValidation = async () => {
    if (!window.confirm('Reject this task? It will be flagged as an incorrect interpretation.')) return;
    await runBusy('validate', () => validateTask(task.id, { action: 'reject' }));
  };

  const fetchOtherTasks = async () => {
    const data = await listTasks({ projectId: task.projectId });
    return (data.tasks || []).filter((t) => t.id !== task.id);
  };

  const openDepModal = async () => {
    setDepModalOpen(true);
    setDepError('');
    setDepChecked(deps.map((d) => d.dependsOnTaskId));
    setDepLoading(true);
    try {
      setDepOptions(await fetchOtherTasks());
    } catch (err) {
      setDepError(err.message);
    } finally {
      setDepLoading(false);
    }
  };
  const closeDepModal = () => { setDepModalOpen(false); setDepError(''); };
  const toggleDep = (id) =>
    setDepChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const saveDeps = async () => {
    setDepSaving(true);
    setDepError('');
    try {
      const res = await setDependencies(task.id, depChecked);
      setDeps(res.dependencies || []);
      setDepModalOpen(false);
    } catch (err) {
      setDepError(err.message);
    } finally {
      setDepSaving(false);
    }
  };

  const openMerge = async () => {
    setMergeOpen(true);
    setMergeError('');
    setMergeTarget('');
    setMergeLoading(true);
    try {
      setMergeOptions(await fetchOtherTasks());
    } catch (err) {
      setMergeError(err.message);
    } finally {
      setMergeLoading(false);
    }
  };
  const closeMerge = () => { setMergeOpen(false); setMergeError(''); };
  const doMerge = async () => {
    if (!mergeTarget) { setMergeError('Select a task to merge into.'); return; }
    setMergeSaving(true);
    setMergeError('');
    try {
      await validateTask(task.id, { action: 'merge', mergeWithTaskId: mergeTarget });
      setMergeOpen(false);
      navigate(`/admin/planner/tasks/${mergeTarget}`);
    } catch (err) {
      setMergeError(err.message);
    } finally {
      setMergeSaving(false);
    }
  };

  const openSplit = () => {
    setSplitRows([{ ...emptySplit }, { ...emptySplit }]);
    setSplitError('');
    setSplitOpen(true);
  };
  const closeSplit = () => { setSplitOpen(false); setSplitError(''); };
  const setSplitField = (index, field, value) =>
    setSplitRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  const addSplitRow = () => setSplitRows((prev) => [...prev, { ...emptySplit }]);
  const removeSplitRow = (index) =>
    setSplitRows((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));
  const doSplit = async () => {
    const cleaned = splitRows
      .map((row) => {
        const minutes = row.estimatedMinutes.trim() === '' ? null : Number(row.estimatedMinutes);
        return {
          title: row.title.trim(),
          description: row.description.trim(),
          estimatedMinutes: Number.isNaN(minutes) ? null : minutes,
        };
      })
      .filter((row) => row.title);
    if (cleaned.length < 2) { setSplitError('Add at least two sub-tasks with titles.'); return; }
    setSplitSaving(true);
    setSplitError('');
    try {
      await validateTask(task.id, { action: 'split', splits: cleaned });
      setSplitOpen(false);
      navigate('/admin/planner');
    } catch (err) {
      setSplitError(err.message);
    } finally {
      setSplitSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this task permanently? This cannot be undone.')) return;
    setBusy('delete');
    setError('');
    try {
      await deleteTask(task.id);
      navigate('/admin/planner');
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  };

  const backLink = (
    <Link to="/admin/planner" className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface">
      <ArrowLeft className="w-4 h-4" /> Back to planner
    </Link>
  );

  if (loading) {
    return (
      <div className="space-y-5 max-w-container-max mx-auto pb-6">
        {backLink}
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 text-primary animate-spin" />
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="space-y-5 max-w-container-max mx-auto pb-6">
        {backLink}
        {error ? (
          <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="font-display font-bold text-on-surface">Task not found</p>
            <p className="mt-1 text-sm text-text-muted">This task may have been deleted.</p>
          </div>
        )}
      </div>
    );
  }

  const planDateValue = task.planDate ? String(task.planDate).slice(0, 10) : '';
  const projectMissing = task.projectId && !projects.some((p) => p.id === task.projectId);
  const showPaste = !task.comprehensionSummary || showComprehensionPaste;
  const confidencePct = task.confidence == null ? null : Math.round(task.confidence * 100);

  return (
    <div className="space-y-5 max-w-container-max mx-auto pb-6">
      {backLink}

      <section className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <>
                <label htmlFor="task-title" className="sr-only">Task title</label>
                <input
                  id="task-title"
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={onTitleKey}
                  className={cn(fieldClass, 'font-display text-2xl sm:text-3xl font-bold mb-1')}
                />
              </>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                <h1 className="font-display text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">{task.title}</h1>
                <button type="button" onClick={startEditTitle} className="icon-button shrink-0" aria-label="Edit title">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )}
            <p className="font-body text-on-surface-variant">AI Dev Planner · {task.projectName || 'No project'}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(chipClass, statusStyles[task.status])}>{statusLabels[task.status]}</span>
          {task.priority && (
            <span className={cn(chipClass, priorityStyles[task.priority])}>{priorityLabels[task.priority]}</span>
          )}
          {task.validationStatus && (
            <span className={cn(chipClass, validationStyles[task.validationStatus])}>{validationLabels[task.validationStatus]}</span>
          )}
          <span className={cn(chipClass, 'bg-surface-container-low text-on-surface-variant')}>{task.source === 'ai' ? 'AI' : 'Manual'}</span>
          {task.estimateLabel && (
            <span className={cn(chipClass, 'bg-surface-container-low text-on-surface-variant')}>{task.estimateLabel}</span>
          )}
          {(task.projectName || task.projectTag) && (
            <span className={cn(chipClass, 'bg-surface-container-low text-on-surface-variant')}>
              {task.projectName || task.projectTag}{task.projectName && task.projectTag ? ` · ${task.projectTag}` : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/admin/planner/tasks/${task.id}/workspace`}
            className="min-h-11 inline-flex items-center gap-2 rounded-xl bg-surface-container-low px-4 text-sm font-bold text-on-surface active:scale-[.98] transition-transform"
          >
            <Sparkles className="w-4 h-4" /> AI Workspace
          </Link>
          <label htmlFor="task-status" className="text-sm font-semibold text-on-surface-variant">Status</label>
          <select
            id="task-status"
            value={task.status}
            onChange={(e) => run(() => updateTask(task.id, { status: e.target.value }))}
            className={cn(fieldClass, 'w-auto')}
          >
            {STATUSES.map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}
          </select>
        </div>
      </section>

      {error && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Source">
            {meeting ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-low text-primary">
                    <FileText className="w-5 h-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-on-surface truncate">{meeting.title}</p>
                    <p className="text-xs text-text-muted">{fmtDate(meeting.meetingDate)}</p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-on-surface">AI Confidence</span>
                    <span className="text-on-surface-variant">{confidencePct == null ? '—' : `${confidencePct}%`}</span>
                  </div>
                  <div
                    className="h-2 rounded-full bg-surface-container-low overflow-hidden"
                    role="progressbar"
                    aria-label="AI confidence"
                    aria-valuenow={confidencePct ?? 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="h-full rounded-full bg-primary" style={{ width: `${confidencePct ?? 0}%` }} />
                  </div>
                </div>

                {deliverable && (
                  <p className="text-sm text-on-surface-variant">
                    Deliverable · <span className="font-semibold text-on-surface">{deliverable.title}</span>
                  </p>
                )}

                {task.sourceExcerpt && (
                  <blockquote className="border-l-2 border-primary/40 pl-3 italic text-sm text-on-surface-variant">
                    {task.sourceExcerpt}
                  </blockquote>
                )}

                {meeting.rawText && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setRawTextOpen((open) => !open)}
                      aria-expanded={rawTextOpen}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface"
                    >
                      <ChevronDown className={cn('w-4 h-4 transition-transform', rawTextOpen && 'rotate-180')} />
                      {rawTextOpen ? 'Hide full transcript' : 'Show full transcript'}
                    </button>
                    {rawTextOpen && (
                      <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-on-surface-variant bg-surface-container-lowest border border-border-subtle rounded-xl p-4 max-h-80 overflow-y-auto">
                        {meeting.rawText}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-text-muted">Manually created — no source meeting.</p>
            )}
          </Section>

          <Section title="AI validation">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-text-muted">Current status</span>
                <span className={cn(chipClass, validationStyles[task.validationStatus])}>{validationLabels[task.validationStatus]}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={confirmValidation} disabled={busy === 'validate'} className={primaryBtn}>
                  {busy === 'validate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  AI Correctly Interpreted
                </button>
                <button type="button" onClick={rejectValidation} disabled={busy === 'validate'} className={secondaryBtn}>
                  <XCircle className="w-4 h-4" /> Reject
                </button>
                <button type="button" onClick={openMerge} className={secondaryBtn}>
                  <Merge className="w-4 h-4" /> Merge
                </button>
                <button type="button" onClick={openSplit} className={secondaryBtn}>
                  <Split className="w-4 h-4" /> Split
                </button>
              </div>
            </div>
          </Section>

          <Section title="Description">
            <div className="space-y-3">
              <label htmlFor="task-description" className="sr-only">Description</label>
              <textarea
                id="task-description"
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                placeholder="Describe the task…"
                className={cn(fieldClass, 'min-h-32')}
              />
              <div className="flex justify-end">
                <button type="button" onClick={saveDescription} className={secondaryBtn}>
                  <Check className="w-4 h-4" /> Save
                </button>
              </div>
            </div>
          </Section>

          <Section title="Acceptance criteria">
            <div className="space-y-3">
              {criteriaDraft.length === 0 && <p className="text-sm text-text-muted">No acceptance criteria yet.</p>}
              {criteriaDraft.map((criterion, index) => (
                <div key={index} className="flex items-center gap-2">
                  <label htmlFor={`criterion-${index}`} className="sr-only">Criterion {index + 1}</label>
                  <input
                    id={`criterion-${index}`}
                    value={criterion}
                    onChange={(e) => setCriterion(index, e.target.value)}
                    placeholder="Acceptance criterion"
                    className={fieldClass}
                  />
                  <button type="button" onClick={() => removeCriterion(index)} className="icon-button shrink-0" aria-label={`Remove criterion ${index + 1}`}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={addCriterion} className={secondaryBtn}>
                  <Plus className="w-4 h-4" /> Add criterion
                </button>
                <button type="button" onClick={saveCriteria} className={secondaryBtn}>
                  <Check className="w-4 h-4" /> Save
                </button>
              </div>
            </div>
          </Section>

          <Section title="Prompt">
            {!task.generatedPrompt ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-surface-container-low flex items-center justify-center mb-4">
                  <Sparkles className="w-7 h-7 text-text-muted" />
                </div>
                <p className="font-display font-bold text-on-surface">No prompt yet</p>
                <p className="mt-1 mb-4 text-sm text-text-muted max-w-xs">Generate an implementation prompt from this task's details.</p>
                <button type="button" onClick={doGeneratePrompt} disabled={busy === 'prompt'} className={primaryBtn}>
                  {busy === 'prompt' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {busy === 'prompt' ? 'Generating…' : 'Generate prompt'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {editingPrompt ? (
                  <>
                    <label htmlFor="prompt-edit" className="sr-only">Edit prompt</label>
                    <textarea
                      id="prompt-edit"
                      value={promptDraft}
                      onChange={(e) => setPromptDraft(e.target.value)}
                      className={cn(fieldClass, 'min-h-64 font-mono text-xs')}
                    />
                  </>
                ) : (
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs text-on-surface-variant bg-surface-container-lowest border border-border-subtle rounded-xl p-4 max-h-[28rem] overflow-y-auto">
                    {task.generatedPrompt}
                  </pre>
                )}
                {task.promptUsed && task.promptUsed !== task.generatedPrompt && (
                  <p className="text-xs text-text-muted">A custom version was last copied.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={toggleEditPrompt} className={secondaryBtn}>
                    <Pencil className="w-4 h-4" /> {editingPrompt ? 'Done' : 'Edit'}
                  </button>
                  <button type="button" onClick={copyPrompt} className={primaryBtn}>
                    {copied ? <ClipboardCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button type="button" onClick={doGeneratePrompt} disabled={busy === 'prompt'} className={secondaryBtn}>
                    {busy === 'prompt' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Regenerate
                  </button>
                </div>
              </div>
            )}
          </Section>

          <Section
            title="Comprehension"
            action={task.comprehensionSummary && !showComprehensionPaste ? (
              <button type="button" onClick={startRegenerateComprehension} className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface">
                <RefreshCw className="w-4 h-4" /> Regenerate
              </button>
            ) : null}
          >
            {showPaste ? (
              <div className="space-y-3">
                <label htmlFor="comprehension-input" className="block text-sm font-semibold text-on-surface">
                  Paste the AI-generated code / diff, or a short description of what changed
                </label>
                <textarea
                  id="comprehension-input"
                  value={comprehensionInput}
                  onChange={(e) => setComprehensionInput(e.target.value)}
                  placeholder="diff --git a/… or a short summary of the change"
                  className={cn(fieldClass, 'min-h-40 font-mono text-xs')}
                />
                <div className="flex gap-2">
                  <button type="button" onClick={doGenerateComprehension} disabled={busy === 'comprehension' || !comprehensionInput.trim()} className={primaryBtn}>
                    {busy === 'comprehension' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {busy === 'comprehension' ? 'Generating…' : 'Generate summary'}
                  </button>
                  {task.comprehensionSummary && (
                    <button type="button" onClick={() => setShowComprehensionPaste(false)} className={secondaryBtn}>Cancel</button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-border-subtle bg-surface-container-low p-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface">{task.comprehensionSummary}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-on-surface-variant">Was this helpful?</span>
                  <button
                    type="button"
                    onClick={() => setFeedback('up')}
                    className={cn('icon-button', task.summaryFeedback === 'up' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400')}
                    aria-label="Mark summary helpful"
                    aria-pressed={task.summaryFeedback === 'up'}
                  >
                    <ThumbsUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedback('down')}
                    className={cn('icon-button', task.summaryFeedback === 'down' && 'bg-red-500/15 text-red-700 dark:text-red-400')}
                    aria-label="Mark summary not helpful"
                    aria-pressed={task.summaryFeedback === 'down'}
                  >
                    <ThumbsDown className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  <label htmlFor="annotation" className="block text-sm font-semibold text-on-surface">Your notes</label>
                  <textarea
                    id="annotation"
                    value={annotationDraft}
                    onChange={(e) => setAnnotationDraft(e.target.value)}
                    placeholder="Add your own notes on this change…"
                    className={cn(fieldClass, 'min-h-24')}
                  />
                  <div className="flex justify-end">
                    <button type="button" onClick={saveAnnotation} className={secondaryBtn}>
                      <Check className="w-4 h-4" /> Save
                    </button>
                  </div>
                </div>

                {task.comprehensionQuestion && (
                  <div className="space-y-2 rounded-xl border border-border-subtle bg-surface-container-lowest p-4">
                    <p className="text-sm font-semibold text-on-surface">Reflection</p>
                    <p className="text-sm text-on-surface-variant">{task.comprehensionQuestion}</p>
                    <label htmlFor="answer" className="block text-xs font-semibold text-text-muted">Your answer (optional)</label>
                    <textarea
                      id="answer"
                      value={answerDraft}
                      onChange={(e) => setAnswerDraft(e.target.value)}
                      placeholder="Optional — jot down your thoughts."
                      className={cn(fieldClass, 'min-h-24')}
                    />
                    <div className="flex justify-end">
                      <button type="button" onClick={saveAnswer} className={secondaryBtn}>
                        <Check className="w-4 h-4" /> Save answer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-4 lg:col-span-1">
          <Section title="Details">
            <div className="space-y-4">
              <div>
                <label htmlFor="plan-date" className="block text-sm font-semibold text-on-surface mb-1.5">Plan date</label>
                <input
                  id="plan-date"
                  type="date"
                  value={planDateValue}
                  onChange={(e) => run(() => updateTask(task.id, { planDate: e.target.value }))}
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor="project" className="block text-sm font-semibold text-on-surface mb-1.5">Project</label>
                <select
                  id="project"
                  value={task.projectId || ''}
                  onChange={(e) => run(() => updateTask(task.id, { projectId: e.target.value }))}
                  className={fieldClass}
                >
                  {projectMissing && <option value={task.projectId}>{task.projectName || task.projectId}</option>}
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="priority" className="block text-sm font-semibold text-on-surface mb-1.5">Priority</label>
                <select
                  id="priority"
                  value={task.priority || 'medium'}
                  onChange={(e) => run(() => updateTask(task.id, { priority: e.target.value }))}
                  className={fieldClass}
                >
                  {PRIORITIES.map((p) => <option key={p} value={p}>{priorityLabels[p]}</option>)}
                </select>
              </div>

              <div>
                <label htmlFor="category" className="block text-sm font-semibold text-on-surface mb-1.5">Category (optional)</label>
                <input
                  id="category"
                  value={categoryDraft}
                  onChange={(e) => setCategoryDraft(e.target.value)}
                  onBlur={saveCategory}
                  placeholder="e.g. Backend"
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor="estimate-min" className="block text-sm font-semibold text-on-surface mb-1.5">Estimate (minutes)</label>
                <div className="flex items-center gap-2">
                  <input
                    id="estimate-min"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={estimateDraft}
                    onChange={(e) => setEstimateDraft(e.target.value)}
                    onBlur={saveEstimate}
                    className={fieldClass}
                  />
                  <button type="button" onClick={reestimate} disabled={busy === 'estimate'} className={cn(secondaryBtn, 'shrink-0')} aria-label="Re-estimate with AI">
                    {busy === 'estimate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} AI
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-text-muted">
                  {task.estimateLabel || '—'} · {formatMinutes(task.estimatedMinutes)} · {task.estimateSource === 'ai' ? 'AI estimate' : 'Manual estimate'}
                </p>
              </div>

              <div>
                <label htmlFor="actual-min" className="block text-sm font-semibold text-on-surface mb-1.5">Actual minutes (optional)</label>
                <input
                  id="actual-min"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={actualDraft}
                  onChange={(e) => setActualDraft(e.target.value)}
                  onBlur={saveActual}
                  className={fieldClass}
                />
              </div>
            </div>
          </Section>

          <Section
            title="Dependencies"
            action={(
              <button type="button" onClick={openDepModal} className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface">
                <Pencil className="w-4 h-4" /> Edit dependencies
              </button>
            )}
          >
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Blocked by</p>
                {deps.length === 0 ? (
                  <p className="text-sm text-text-muted">Nothing is blocking this task.</p>
                ) : (
                  <div className="space-y-1">
                    {deps.map((dep) => (
                      <Link
                        key={dep.id}
                        to={`/admin/planner/tasks/${dep.dependsOnTaskId}`}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-container-low"
                      >
                        <span className="min-w-0 truncate text-sm text-on-surface">{dep.title}</span>
                        <span className={cn(chipClass, 'shrink-0', statusStyles[dep.status])}>{statusLabels[dep.status]}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">Blocks</p>
                {dependents.length === 0 ? (
                  <p className="text-sm text-text-muted">This task blocks nothing.</p>
                ) : (
                  <div className="space-y-1">
                    {dependents.map((dep) => (
                      <Link
                        key={dep.id}
                        to={`/admin/planner/tasks/${dep.taskId}`}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-container-low"
                      >
                        <span className="min-w-0 truncate text-sm text-on-surface">{dep.title}</span>
                        <span className={cn(chipClass, 'shrink-0', statusStyles[dep.status])}>{statusLabels[dep.status]}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Section>

          <Section title="Meta">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-text-muted">Created</span>
                <span className="text-right font-semibold text-on-surface">{fmtDate(task.createdAt)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-text-muted">Updated</span>
                <span className="text-right font-semibold text-on-surface">{fmtDate(task.updatedAt)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-text-muted">Completed</span>
                <span className="text-right font-semibold text-on-surface">{task.completedAt ? fmtDate(task.completedAt) : '—'}</span>
              </div>
              {task.scheduledMinute != null && (
                <div className="flex justify-between gap-3">
                  <span className="text-text-muted">Scheduled</span>
                  <span className="text-right font-semibold text-on-surface">{formatClock(task.scheduledMinute)}</span>
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-border-subtle">
              <button
                type="button"
                onClick={remove}
                disabled={busy === 'delete'}
                className="w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-error/10 text-sm font-bold text-error hover:bg-error/15 disabled:opacity-60"
              >
                <Trash2 className="w-4 h-4" /> Delete task
              </button>
            </div>
          </Section>
        </div>
      </div>

      {depModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Edit dependencies">
          <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={closeDepModal} aria-label="Close" />
          <section className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface-card shadow-2xl sm:rounded-[24px]">
            <header className="flex items-center justify-between gap-4 border-b border-border-subtle p-5">
              <div>
                <h2 className="section-title">Blocked by</h2>
                <p className="text-sm text-text-muted">Pick the tasks that must finish before this one.</p>
              </div>
              <button type="button" onClick={closeDepModal} className="icon-button bg-surface-container-low" aria-label="Close"><X className="h-5 w-5" /></button>
            </header>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
              {depLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : depOptions.length === 0 ? (
                <p className="py-6 text-center text-sm text-text-muted">No other tasks in this project.</p>
              ) : (
                depOptions.map((opt) => (
                  <label key={opt.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border-subtle p-3">
                    <input
                      type="checkbox"
                      checked={depChecked.includes(opt.id)}
                      onChange={() => toggleDep(opt.id)}
                      className="h-4 w-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{opt.title}</span>
                    <span className={cn(chipClass, 'shrink-0', statusStyles[opt.status])}>{statusLabels[opt.status]}</span>
                  </label>
                ))
              )}
              {depError && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{depError}</p>}
            </div>
            <footer className="flex gap-2 border-t border-border-subtle p-4">
              <button type="button" onClick={closeDepModal} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
              <button type="button" onClick={saveDeps} disabled={depSaving || depLoading} className={cn(primaryBtn, 'flex-1')}>
                {depSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
              </button>
            </footer>
          </section>
        </div>
      )}

      {mergeOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Merge task">
          <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={closeMerge} aria-label="Close" />
          <section className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface-card shadow-2xl sm:rounded-[24px]">
            <header className="flex items-center justify-between gap-4 border-b border-border-subtle p-5">
              <div>
                <h2 className="section-title">Merge task</h2>
                <p className="text-sm text-text-muted">Fold this task into another. You'll be taken to the target.</p>
              </div>
              <button type="button" onClick={closeMerge} className="icon-button bg-surface-container-low" aria-label="Close"><X className="h-5 w-5" /></button>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              <label htmlFor="merge-target" className="block text-sm font-semibold text-on-surface">Merge into</label>
              {mergeLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : (
                <select
                  id="merge-target"
                  value={mergeTarget}
                  onChange={(e) => setMergeTarget(e.target.value)}
                  className={fieldClass}
                >
                  <option value="" disabled>Select a task…</option>
                  {mergeOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.title}</option>)}
                </select>
              )}
              {mergeError && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{mergeError}</p>}
            </div>
            <footer className="flex gap-2 border-t border-border-subtle p-4">
              <button type="button" onClick={closeMerge} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
              <button type="button" onClick={doMerge} disabled={mergeSaving || mergeLoading} className={cn(primaryBtn, 'flex-1')}>
                {mergeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />} Merge
              </button>
            </footer>
          </section>
        </div>
      )}

      {splitOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Split task">
          <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={closeSplit} aria-label="Close" />
          <section className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface-card shadow-2xl sm:rounded-[24px]">
            <header className="flex items-center justify-between gap-4 border-b border-border-subtle p-5">
              <div>
                <h2 className="section-title">Split task</h2>
                <p className="text-sm text-text-muted">Break this into two or more sub-tasks.</p>
              </div>
              <button type="button" onClick={closeSplit} className="icon-button bg-surface-container-low" aria-label="Close"><X className="h-5 w-5" /></button>
            </header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              {splitRows.map((row, index) => (
                <div key={index} className="space-y-2 rounded-xl border border-border-subtle p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Sub-task {index + 1}</p>
                    {splitRows.length > 2 && (
                      <button type="button" onClick={() => removeSplitRow(index)} className="icon-button" aria-label={`Remove sub-task ${index + 1}`}>
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <label htmlFor={`split-title-${index}`} className="sr-only">Sub-task {index + 1} title</label>
                  <input
                    id={`split-title-${index}`}
                    value={row.title}
                    onChange={(e) => setSplitField(index, 'title', e.target.value)}
                    placeholder="Title"
                    className={fieldClass}
                  />
                  <label htmlFor={`split-desc-${index}`} className="sr-only">Sub-task {index + 1} description</label>
                  <textarea
                    id={`split-desc-${index}`}
                    value={row.description}
                    onChange={(e) => setSplitField(index, 'description', e.target.value)}
                    placeholder="Description (optional)"
                    className={cn(fieldClass, 'min-h-20')}
                  />
                  <label htmlFor={`split-min-${index}`} className="sr-only">Sub-task {index + 1} estimate in minutes</label>
                  <input
                    id={`split-min-${index}`}
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={row.estimatedMinutes}
                    onChange={(e) => setSplitField(index, 'estimatedMinutes', e.target.value)}
                    placeholder="Estimate (minutes)"
                    className={fieldClass}
                  />
                </div>
              ))}
              <button type="button" onClick={addSplitRow} className={secondaryBtn}>
                <Plus className="w-4 h-4" /> Add sub-task
              </button>
              {splitError && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{splitError}</p>}
            </div>
            <footer className="flex gap-2 border-t border-border-subtle p-4">
              <button type="button" onClick={closeSplit} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
              <button type="button" onClick={doSplit} disabled={splitSaving} className={cn(primaryBtn, 'flex-1')}>
                {splitSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Split className="h-4 w-4" />} Split
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
