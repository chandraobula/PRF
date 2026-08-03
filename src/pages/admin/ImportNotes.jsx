import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, ArrowUpToLine, Ban, Check,
  ClipboardList, FileText, ListChecks, Loader2, Plus, Scissors, Sparkles,
  UploadCloud, Users, X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  commitMeeting, extractMeeting, formatMinutes, listProjects, PRIORITIES,
  priorityLabels, priorityStyles, toDateInput,
} from '../../services/plannerApi';

const MAX_FILE_BYTES = 2 * 1024 * 1024;

const inputClass = 'w-full rounded-xl border border-border-subtle bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/40';
const labelClass = 'mb-1.5 block text-sm font-semibold text-on-surface-variant';
const primaryBtn = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm active:scale-[.98] transition-transform disabled:opacity-60';
const secondaryBtn = 'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-surface-container-low px-4 text-sm font-bold text-on-surface active:scale-[.98] transition-transform disabled:opacity-60';
const chipBtn = 'min-h-9 inline-flex items-center gap-1.5 rounded-lg bg-surface-container-low px-3 text-xs font-bold text-on-surface-variant hover:text-on-surface disabled:opacity-40';

let seq = 0;
const nextId = () => `mom-${Date.now().toString(36)}-${(seq += 1)}`;

const normalizePriority = (value) => (PRIORITIES.includes(value) ? value : 'medium');
const asConfidence = (value) => (value == null || value === '' ? null : Number(value));

const confidencePercent = (value) => (value == null ? null : Math.round(Number(value) * 100));

const confidenceTone = (value) => {
  if (value == null) return '';
  if (value >= 0.8) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
  if (value >= 0.6) return 'bg-sky-500/15 text-sky-700 dark:text-sky-400';
  return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
};

const normalizeMeeting = (raw) => ({
  title: raw?.title || '',
  summary: raw?.summary || '',
  objectives: Array.isArray(raw?.objectives) ? raw.objectives.map(String) : [],
  participants: Array.isArray(raw?.participants)
    ? raw.participants.map((p) => ({ name: p?.name || '', role: p?.role || '' }))
    : [],
  confidence: asConfidence(raw?.confidence),
  rawText: raw?.rawText || '',
});

const normalizeTask = (raw) => ({
  id: nextId(),
  title: raw?.title || '',
  description: raw?.description || '',
  acceptanceCriteria: Array.isArray(raw?.acceptanceCriteria) ? raw.acceptanceCriteria.map(String) : [],
  category: raw?.category || '',
  priority: normalizePriority(raw?.priority),
  estimatedMinutes: Number(raw?.estimatedMinutes) || 0,
  estimateLabel: raw?.estimateLabel || '',
  confidence: asConfidence(raw?.confidence),
  sourceExcerpt: raw?.sourceExcerpt || '',
  approved: true,
});

const normalizeDeliverable = (raw) => ({
  id: nextId(),
  title: raw?.title || '',
  note: raw?.note || '',
  confidence: asConfidence(raw?.confidence),
  tasks: Array.isArray(raw?.tasks) ? raw.tasks.map(normalizeTask) : [],
});

const unionCriteria = (first, second) => {
  const seen = new Set();
  const result = [];
  [...first, ...second].forEach((entry) => {
    const value = String(entry);
    const key = value.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(value);
  });
  return result;
};

export default function ImportNotes() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [step, setStep] = useState(1);
  const [source, setSource] = useState('paste');
  const [notes, setNotes] = useState('');
  const [fileName, setFileName] = useState('');
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [planDate, setPlanDate] = useState(() => toDateInput(new Date()));
  const [meetingDate, setMeetingDate] = useState(() => toDateInput(new Date()));
  const [meeting, setMeeting] = useState(null);
  const [deliverables, setDeliverables] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await listProjects();
        if (active) setProjects(data?.projects || []);
      } catch (loadError) {
        if (active) setError(loadError.message);
      }
    })();
    return () => { active = false; };
  }, []);

  const keptTasks = useMemo(
    () => deliverables.reduce((sum, d) => sum + d.tasks.filter((t) => t.approved).length, 0),
    [deliverables],
  );

  const totalMinutes = useMemo(
    () => deliverables.reduce(
      (sum, d) => sum + d.tasks.filter((t) => t.approved).reduce((s, t) => s + (Number(t.estimatedMinutes) || 0), 0),
      0,
    ),
    [deliverables],
  );

  const onPickFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError('That file is too large (max 2 MB). Choose a smaller .txt or .md file.');
      return;
    }
    setError('');
    try {
      const text = await file.text();
      setNotes(text);
      setFileName(file.name);
    } catch {
      setError('Could not read that file.');
    }
  };

  const clearFile = () => {
    setFileName('');
    setNotes('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const extract = async () => {
    if (!notes.trim()) return;
    setExtracting(true);
    setError('');
    try {
      const data = await extractMeeting(notes);
      setMeeting(normalizeMeeting(data?.meeting));
      setDeliverables((data?.deliverables || []).map(normalizeDeliverable));
      setStep(2);
    } catch (extractError) {
      setError(extractError.message);
    } finally {
      setExtracting(false);
    }
  };

  const backToNotes = () => { setStep(1); setError(''); };

  const patchMeetingTitle = (title) => setMeeting((prev) => (prev ? { ...prev, title } : prev));

  const patchTask = (deliverableId, taskId, patch) => {
    setDeliverables((prev) => prev.map((d) => (
      d.id === deliverableId
        ? { ...d, tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) }
        : d
    )));
  };

  const toggleApprove = (deliverableId, taskId) => {
    setDeliverables((prev) => prev.map((d) => (
      d.id === deliverableId
        ? { ...d, tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, approved: !t.approved } : t)) }
        : d
    )));
  };

  const setAllApproved = (deliverableId, approved) => {
    setDeliverables((prev) => prev.map((d) => (
      d.id === deliverableId ? { ...d, tasks: d.tasks.map((t) => ({ ...t, approved })) } : d
    )));
  };

  const splitTask = (deliverableId, taskId) => {
    setDeliverables((prev) => prev.map((d) => {
      if (d.id !== deliverableId) return d;
      const index = d.tasks.findIndex((t) => t.id === taskId);
      if (index < 0) return d;
      const original = d.tasks[index];
      const total = Number(original.estimatedMinutes) || 0;
      const firstHalf = Math.floor(total / 2);
      const part2 = {
        ...original,
        id: nextId(),
        title: `${original.title} (part 2)`,
        estimatedMinutes: total - firstHalf,
        acceptanceCriteria: [...original.acceptanceCriteria],
        approved: true,
      };
      const tasks = [...d.tasks];
      tasks[index] = { ...original, estimatedMinutes: firstHalf };
      tasks.splice(index + 1, 0, part2);
      return { ...d, tasks };
    }));
  };

  const mergeUp = (deliverableId, taskId) => {
    setDeliverables((prev) => prev.map((d) => {
      if (d.id !== deliverableId) return d;
      const index = d.tasks.findIndex((t) => t.id === taskId);
      if (index <= 0) return d;
      const target = d.tasks[index - 1];
      const current = d.tasks[index];
      const merged = {
        ...target,
        description: [target.description, current.description].filter(Boolean).join('\n\n'),
        acceptanceCriteria: unionCriteria(target.acceptanceCriteria, current.acceptanceCriteria),
        estimatedMinutes: (Number(target.estimatedMinutes) || 0) + (Number(current.estimatedMinutes) || 0),
      };
      const tasks = [...d.tasks];
      tasks[index - 1] = merged;
      tasks.splice(index, 1);
      return { ...d, tasks };
    }));
  };

  const moveTask = (deliverableId, taskId, delta) => {
    setDeliverables((prev) => prev.map((d) => {
      if (d.id !== deliverableId) return d;
      const index = d.tasks.findIndex((t) => t.id === taskId);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= d.tasks.length) return d;
      const tasks = [...d.tasks];
      [tasks[index], tasks[target]] = [tasks[target], tasks[index]];
      return { ...d, tasks };
    }));
  };

  const commit = async () => {
    const payloadDeliverables = deliverables
      .map((d) => ({
        title: d.title,
        note: d.note,
        confidence: d.confidence,
        tasks: d.tasks.filter((t) => t.approved).map((t) => ({
          title: t.title,
          description: t.description,
          acceptanceCriteria: t.acceptanceCriteria,
          category: t.category,
          priority: t.priority,
          estimatedMinutes: Number(t.estimatedMinutes) || 0,
          estimateLabel: t.estimateLabel,
          confidence: t.confidence,
          sourceExcerpt: t.sourceExcerpt,
        })),
      }))
      .filter((d) => d.tasks.length > 0);
    if (payloadDeliverables.length === 0) return;
    setImporting(true);
    setError('');
    try {
      await commitMeeting({
        planDate,
        projectId: projectId || null,
        meetingDate: meetingDate || null,
        meeting,
        deliverables: payloadDeliverables,
      });
      navigate(`/admin/planner?date=${planDate}`);
    } catch (commitError) {
      setError(commitError.message);
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5 max-w-container-max mx-auto pb-6">
      <section className="space-y-3">
        <Link to="/admin/planner" className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface">
          <ArrowLeft className="w-4 h-4" /> Back to planner
        </Link>
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-on-surface tracking-tight mb-1">Import meeting notes</h1>
          <p className="font-body text-on-surface-variant">Turn a meeting summary (MOM) into reviewable deliverables and an estimated plan.</p>
        </div>
      </section>

      {error && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

      {step === 1 && (
        <>
          <section className="app-card">
            <div className="p-4 sm:p-5 border-b border-border-subtle">
              <h3 className="font-display font-bold text-on-surface">Your notes</h3>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-container-low p-1" role="group" aria-label="Notes source">
                {[['paste', 'Paste'], ['upload', 'Upload file']].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={source === value}
                    onClick={() => setSource(value)}
                    className={cn(
                      'min-h-10 rounded-lg text-sm font-bold transition-colors',
                      source === value ? 'bg-surface-card shadow-sm text-on-surface' : 'text-on-surface-variant',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {source === 'paste' ? (
                <div>
                  <label htmlFor="notes-textarea" className="sr-only">Notes</label>
                  <textarea
                    id="notes-textarea"
                    rows={12}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Paste your meeting minutes, decisions, and action items here…"
                    className={cn(inputClass, 'resize-y')}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <label htmlFor="notes-file" className="sr-only">Upload notes file</label>
                  <input
                    ref={fileInputRef}
                    id="notes-file"
                    type="file"
                    accept=".txt,.md,text/plain,text/markdown"
                    onChange={onPickFile}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-border-subtle bg-surface-container-lowest px-4 text-sm font-bold text-on-surface-variant hover:text-on-surface"
                  >
                    <UploadCloud className="w-4 h-4" /> Choose a .txt or .md file
                  </button>
                  {fileName && (
                    <div className="flex items-center gap-3 rounded-xl bg-surface-container-lowest px-3 py-2.5">
                      <FileText className="w-4 h-4 text-text-muted shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{fileName}</span>
                      <span className="shrink-0 text-xs text-text-muted">{notes.length} chars</span>
                      <button type="button" onClick={clearFile} className="icon-button text-error" aria-label="Clear file">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="app-card">
            <div className="p-4 sm:p-5 border-b border-border-subtle">
              <h3 className="font-display font-bold text-on-surface">Plan settings</h3>
            </div>
            <div className="p-4 sm:p-5 grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="default-project" className={labelClass}>Default project</label>
                <select id="default-project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className={inputClass}>
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="meeting-date" className={labelClass}>Meeting date</label>
                <input id="meeting-date" type="date" value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} className={inputClass} />
              </div>
              <div>
                <label htmlFor="plan-date" className={labelClass}>Plan date</label>
                <input id="plan-date" type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} className={inputClass} />
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <button type="button" onClick={extract} disabled={extracting || !notes.trim()} className={primaryBtn}>
              {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {extracting ? 'Extracting…' : 'Extract deliverables'}
            </button>
          </div>
        </>
      )}

      {step === 2 && meeting && (
        <>
          <section className="app-card">
            <div className="p-4 sm:p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-display font-bold text-on-surface">Review &amp; import</h3>
                <p className="text-sm text-text-muted">
                  {keptTasks} task{keptTasks === 1 ? '' : 's'} kept · {formatMinutes(totalMinutes)} estimated · edits stay local until you import.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={backToNotes} className={secondaryBtn}>
                  <ArrowLeft className="w-4 h-4" /> Back to notes
                </button>
                <button type="button" onClick={commit} disabled={importing || keptTasks === 0} className={primaryBtn}>
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {importing ? 'Importing…' : 'Import to planner'}
                </button>
              </div>
            </div>
          </section>

          <MeetingSummary meeting={meeting} onTitleChange={patchMeetingTitle} />

          {deliverables.length === 0 ? (
            <section className="app-card">
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-surface-container-low flex items-center justify-center mb-4">
                  <ClipboardList className="w-7 h-7 text-text-muted" />
                </div>
                <p className="font-display font-bold text-on-surface">No deliverables found</p>
                <p className="mt-1 text-sm text-text-muted max-w-xs">Nothing actionable was extracted from these notes. Head back and try different notes.</p>
                <button type="button" onClick={backToNotes} className={cn(secondaryBtn, 'mt-5')}>
                  <ArrowLeft className="w-4 h-4" /> Back to notes
                </button>
              </div>
            </section>
          ) : (
            <>
              <div className="space-y-4">
                {deliverables.map((deliverable) => (
                  <DeliverableSection
                    key={deliverable.id}
                    deliverable={deliverable}
                    onPatchTask={patchTask}
                    onToggleApprove={toggleApprove}
                    onSetAll={setAllApproved}
                    onSplit={splitTask}
                    onMergeUp={mergeUp}
                    onMove={moveTask}
                  />
                ))}
              </div>

              <section className="app-card">
                <div className="p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-on-surface-variant">
                    <span className="font-bold text-on-surface">{keptTasks}</span> task{keptTasks === 1 ? '' : 's'} across{' '}
                    {deliverables.filter((d) => d.tasks.some((t) => t.approved)).length} deliverable(s) ·{' '}
                    <span className="font-bold text-on-surface">{formatMinutes(totalMinutes)}</span> total.
                  </p>
                  <button type="button" onClick={commit} disabled={importing || keptTasks === 0} className={primaryBtn}>
                    {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {importing ? 'Importing…' : 'Import to planner'}
                  </button>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ConfidenceBadge({ value }) {
  const pct = confidencePercent(value);
  if (pct == null) return null;
  return (
    <span
      className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-bold', confidenceTone(value))}
      title={`AI confidence ${pct}%`}
    >
      {pct}%
    </span>
  );
}

function MeetingSummary({ meeting, onTitleChange }) {
  return (
    <section className="app-card">
      <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center justify-between gap-3">
        <h3 className="font-display font-bold text-on-surface">Meeting summary</h3>
        <ConfidenceBadge value={meeting.confidence} />
      </div>
      <div className="p-4 sm:p-5 space-y-4">
        <div>
          <label htmlFor="meeting-title" className={labelClass}>Meeting title</label>
          <input
            id="meeting-title"
            value={meeting.title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Meeting title"
            className={inputClass}
          />
        </div>

        {meeting.summary && (
          <p className="text-sm leading-relaxed text-on-surface-variant whitespace-pre-wrap">{meeting.summary}</p>
        )}

        {meeting.objectives.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant">
              <ListChecks className="w-4 h-4" /> Objectives
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-on-surface-variant">
              {meeting.objectives.map((objective, index) => (
                <li key={`objective-${index}`}>{objective}</li>
              ))}
            </ul>
          </div>
        )}

        {meeting.participants.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant">
              <Users className="w-4 h-4" /> Participants
            </div>
            <div className="flex flex-wrap gap-2">
              {meeting.participants.map((participant, index) => (
                <span key={`participant-${index}`} className="rounded-full bg-surface-container-low px-3 py-1 text-xs font-semibold text-on-surface-variant">
                  {participant.name}{participant.role ? ` · ${participant.role}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function DeliverableSection({ deliverable, onPatchTask, onToggleApprove, onSetAll, onSplit, onMergeUp, onMove }) {
  const kept = deliverable.tasks.filter((t) => t.approved).length;
  const total = deliverable.tasks.length;

  return (
    <section className="app-card">
      <div className="p-4 sm:p-5 border-b border-border-subtle space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display font-bold text-on-surface">{deliverable.title || 'Untitled deliverable'}</h3>
          <ConfidenceBadge value={deliverable.confidence} />
        </div>
        {deliverable.note && (
          <blockquote className="border-l-2 border-border-subtle pl-3 text-sm italic text-text-muted">{deliverable.note}</blockquote>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-on-surface-variant">{kept}/{total} kept</span>
          <button type="button" onClick={() => onSetAll(deliverable.id, true)} disabled={kept === total} className={chipBtn}>
            <Check className="w-3.5 h-3.5" /> Include all
          </button>
          <button type="button" onClick={() => onSetAll(deliverable.id, false)} disabled={kept === 0} className={chipBtn}>
            <Ban className="w-3.5 h-3.5" /> Exclude all
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {deliverable.tasks.map((task, index) => (
          <TaskDraftCard
            key={task.id}
            deliverableId={deliverable.id}
            task={task}
            index={index}
            total={total}
            onPatch={onPatchTask}
            onToggleApprove={onToggleApprove}
            onSplit={onSplit}
            onMergeUp={onMergeUp}
            onMove={onMove}
          />
        ))}
        {total === 0 && <p className="text-sm text-text-muted">No tasks in this deliverable.</p>}
      </div>
    </section>
  );
}

function TaskDraftCard({ deliverableId, task, index, total, onPatch, onToggleApprove, onSplit, onMergeUp, onMove }) {
  const patch = (value) => onPatch(deliverableId, task.id, value);
  const needsReview = task.confidence != null && task.confidence < 0.6;

  return (
    <div className={cn('rounded-xl border border-border-subtle p-4 space-y-3', !task.approved && 'opacity-60')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', priorityStyles[task.priority])}>{priorityLabels[task.priority]}</span>
          <ConfidenceBadge value={task.confidence} />
          {needsReview && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3" /> Needs review
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => onMove(deliverableId, task.id, -1)} disabled={index === 0} className="icon-button disabled:opacity-40" aria-label="Move task up"><ArrowUp className="w-4 h-4" /></button>
          <button type="button" onClick={() => onMove(deliverableId, task.id, 1)} disabled={index === total - 1} className="icon-button disabled:opacity-40" aria-label="Move task down"><ArrowDown className="w-4 h-4" /></button>
          <button
            type="button"
            onClick={() => onToggleApprove(deliverableId, task.id)}
            aria-pressed={task.approved}
            className={cn(
              'min-h-9 inline-flex items-center gap-1.5 rounded-lg px-3 text-sm font-bold transition-colors',
              task.approved ? 'bg-primary/10 text-primary' : 'bg-surface-container-low text-on-surface-variant',
            )}
          >
            {task.approved ? <Check className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
            {task.approved ? 'Approved' : 'Ignored'}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor={`task-title-${task.id}`} className={labelClass}>Title</label>
        <input id={`task-title-${task.id}`} value={task.title} onChange={(event) => patch({ title: event.target.value })} placeholder="Task title" className={inputClass} />
      </div>

      <div>
        <label htmlFor={`task-desc-${task.id}`} className={labelClass}>Description</label>
        <textarea id={`task-desc-${task.id}`} rows={3} value={task.description} onChange={(event) => patch({ description: event.target.value })} placeholder="What needs to happen?" className={cn(inputClass, 'resize-y')} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`task-category-${task.id}`} className={labelClass}>Category</label>
          <input id={`task-category-${task.id}`} value={task.category} onChange={(event) => patch({ category: event.target.value })} placeholder="e.g. backend" className={inputClass} />
        </div>
        <div>
          <label htmlFor={`task-priority-${task.id}`} className={labelClass}>Priority</label>
          <select id={`task-priority-${task.id}`} value={task.priority} onChange={(event) => patch({ priority: event.target.value })} className={inputClass}>
            {PRIORITIES.map((value) => (
              <option key={value} value={value}>{priorityLabels[value]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`task-min-${task.id}`} className={labelClass}>Estimate (min)</label>
          <input id={`task-min-${task.id}`} type="number" min="0" inputMode="numeric" value={task.estimatedMinutes} onChange={(event) => patch({ estimatedMinutes: event.target.value === '' ? 0 : Number(event.target.value) })} className={inputClass} />
        </div>
        <div>
          <label htmlFor={`task-label-${task.id}`} className={labelClass}>Estimate label</label>
          <input id={`task-label-${task.id}`} value={task.estimateLabel} onChange={(event) => patch({ estimateLabel: event.target.value })} placeholder="e.g. Half a day" className={inputClass} />
        </div>
      </div>

      {task.sourceExcerpt && (
        <blockquote className="border-l-2 border-border-subtle pl-3 text-sm italic text-text-muted">{task.sourceExcerpt}</blockquote>
      )}

      <CriteriaEditor taskId={task.id} criteria={task.acceptanceCriteria} onChange={(criteria) => patch({ acceptanceCriteria: criteria })} />

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={() => onSplit(deliverableId, task.id)} className={secondaryBtn}><Scissors className="w-4 h-4" /> Split</button>
        <button type="button" onClick={() => onMergeUp(deliverableId, task.id)} disabled={index === 0} className={secondaryBtn}><ArrowUpToLine className="w-4 h-4" /> Merge up</button>
      </div>
    </div>
  );
}

function CriteriaEditor({ taskId, criteria, onChange }) {
  const update = (position, value) => onChange(criteria.map((item, idx) => (idx === position ? value : item)));
  const remove = (position) => onChange(criteria.filter((_, idx) => idx !== position));
  const add = () => onChange([...criteria, '']);

  return (
    <div>
      <span className={labelClass}>Acceptance criteria</span>
      <div className="space-y-2">
        {criteria.map((item, position) => (
          <div key={`${taskId}-ac-${position}`} className="flex items-center gap-2">
            <input
              value={item}
              onChange={(event) => update(position, event.target.value)}
              placeholder={`Criterion ${position + 1}`}
              aria-label={`Acceptance criterion ${position + 1}`}
              className={inputClass}
            />
            <button type="button" onClick={() => remove(position)} className="icon-button text-error shrink-0" aria-label={`Remove criterion ${position + 1}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        {criteria.length === 0 && <p className="text-sm text-text-muted">No acceptance criteria yet.</p>}
      </div>
      <button type="button" onClick={add} className={cn(secondaryBtn, 'mt-2')}><Plus className="w-4 h-4" /> Add criterion</button>
    </div>
  );
}
