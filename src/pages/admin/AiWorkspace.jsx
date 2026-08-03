import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, ClipboardCheck, Copy, ExternalLink, FileCode, FileText,
  FolderKanban, Link2, ListChecks, Loader2, Package, RefreshCw, Terminal,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  getTaskWorkspace, generatePrompt, setPromptUsed,
  statusStyles, statusLabels, priorityStyles, priorityLabels, formatMinutes,
} from '../../services/plannerApi';

const primaryBtn = 'min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm active:scale-[.98] transition-transform disabled:opacity-60';
const secondaryBtn = 'min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-surface-container-low px-4 text-sm font-bold text-on-surface active:scale-[.98] transition-transform disabled:opacity-60';
const chipClass = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold';

const panels = [
  { id: 'prompt', label: 'Execution Prompt', icon: Terminal },
  { id: 'context', label: 'Context', icon: FileText },
  { id: 'references', label: 'References', icon: Link2 },
];

const contextSections = [
  { key: 'projectContext', label: 'Project context' },
  { key: 'meetingContext', label: 'Meeting context' },
  { key: 'deliverableContext', label: 'Deliverable context' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'expectedOutput', label: 'Expected output' },
];

const isUrl = (value) => /^https?:\/\//.test(String(value || ''));

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-7 h-7 text-primary animate-spin" />
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface-container-low flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-text-muted" />
      </div>
      <p className="font-display font-bold text-on-surface">{title}</p>
      <p className="mt-1 text-sm text-text-muted max-w-xs">{description}</p>
    </div>
  );
}

function Trace({ icon: Icon, label, value, to }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
        {value ? (
          to ? (
            <Link to={to} className="text-sm font-semibold text-primary hover:underline break-words">{value}</Link>
          ) : (
            <p className="text-sm font-semibold text-on-surface break-words">{value}</p>
          )
        ) : (
          <p className="text-sm text-text-muted">—</p>
        )}
      </div>
    </div>
  );
}

export default function AiWorkspace() {
  const { taskId } = useParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [panel, setPanel] = useState('prompt');
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const fresh = await getTaskWorkspace(taskId);
      setData(fresh);
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  const flashCopied = (key) => {
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const copyPrompt = async () => {
    if (!data?.executionPrompt) return;
    setError('');
    let clipped = true;
    try { await navigator.clipboard.writeText(data.executionPrompt); } catch { clipped = false; }
    try {
      await setPromptUsed(taskId, data.executionPrompt);
      setData((prev) => (prev ? { ...prev, promptUsed: data.executionPrompt } : prev));
    } catch (err) {
      setError(err.message);
      return;
    }
    if (clipped) flashCopied('prompt');
    else setError('Prompt recorded, but writing to the clipboard was blocked.');
  };

  const copyMarkdown = async () => {
    if (!data?.executionPrompt) return;
    setError('');
    const markdown = '```text\n' + data.executionPrompt + '\n```';
    try {
      await navigator.clipboard.writeText(markdown);
      flashCopied('markdown');
    } catch {
      setError('Writing to the clipboard was blocked.');
    }
  };

  const copySection = async (key, text) => {
    if (!text) return;
    setError('');
    try {
      await navigator.clipboard.writeText(text);
      flashCopied(key);
    } catch {
      setError('Writing to the clipboard was blocked.');
    }
  };

  const regenerate = async () => {
    setBusy('regen');
    setError('');
    try {
      await generatePrompt(taskId);
      const fresh = await getTaskWorkspace(taskId);
      setData(fresh);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const backLink = (
    <Link
      to={`/admin/planner/tasks/${taskId}`}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface"
    >
      <ArrowLeft className="w-4 h-4" /> Back to task
    </Link>
  );

  if (loading) {
    return (
      <div className="space-y-5 max-w-container-max mx-auto pb-6">
        {backLink}
        <Spinner />
      </div>
    );
  }

  if (!data || !data.task) {
    return (
      <div className="space-y-5 max-w-container-max mx-auto pb-6">
        {backLink}
        {error ? (
          <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>
        ) : (
          <EmptyState icon={FileText} title="Task not found" description="This task may have been deleted." />
        )}
      </div>
    );
  }

  const { task, project, meeting, deliverable } = data;
  const brief = data.brief || {};
  const references = brief.references || [];
  const criteria = task.acceptanceCriteria || [];
  const executionPrompt = data.executionPrompt || '';
  const promptUsed = data.promptUsed || '';
  const tokens = Number(data.tokenEstimate) || 0;
  const projectName = task.projectName || project?.name || '';
  const meetingTitle = task.meetingTitle || meeting?.title || '';
  const deliverableTitle = task.deliverableTitle || deliverable?.title || '';
  const projectTo = task.projectId ? `/admin/planner/projects/${task.projectId}` : null;

  return (
    <div className="space-y-5 max-w-container-max mx-auto pb-6">
      {backLink}

      <section>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">AI Workspace</h1>
        <p className="mt-1 text-on-surface-variant">
          Assemble the execution context and hand it to your coding agent — WorkOS does not write the code.
        </p>
      </section>

      {error && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <section className="app-card p-4 sm:p-5 space-y-3">
            <h2 className="font-display text-lg font-bold text-on-surface break-words">{task.title}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(chipClass, statusStyles[task.status])}>{statusLabels[task.status]}</span>
              {task.priority && (
                <span className={cn(chipClass, priorityStyles[task.priority])}>{priorityLabels[task.priority]}</span>
              )}
              <span className={cn(chipClass, 'bg-surface-container-low text-on-surface-variant')}>
                {formatMinutes(task.estimatedMinutes)}
              </span>
            </div>
          </section>

          <section className="app-card">
            <div className="p-4 sm:p-5 border-b border-border-subtle">
              <h3 className="font-display font-bold text-on-surface">Traceability</h3>
            </div>
            <div className="p-4 sm:p-5 space-y-3">
              <Trace icon={FolderKanban} label="Project" value={projectName} to={projectName ? projectTo : null} />
              <Trace icon={FileText} label="Meeting" value={meetingTitle} />
              <Trace icon={Package} label="Deliverable" value={deliverableTitle} />
            </div>
          </section>

          <section className="app-card">
            <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-on-surface-variant" />
              <h3 className="font-display font-bold text-on-surface">Acceptance criteria</h3>
            </div>
            <div className="p-4 sm:p-5">
              {criteria.length === 0 ? (
                <p className="text-sm text-text-muted">No acceptance criteria.</p>
              ) : (
                <ul className="space-y-2">
                  {criteria.map((item, index) => (
                    <li key={index} className="flex items-start gap-2.5 text-sm text-on-surface">
                      <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-border-subtle bg-surface-container-lowest" aria-hidden="true" />
                      <span className="break-words">{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="app-card p-2">
            <div className="flex flex-col gap-1" role="group" aria-label="Workspace panels">
              {panels.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPanel(id)}
                  aria-current={panel === id ? 'page' : undefined}
                  className={cn(
                    'min-h-11 w-full inline-flex items-center gap-2 rounded-xl px-3 text-sm font-bold transition-colors',
                    panel === id ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-low',
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-4 lg:col-span-3">
          {panel === 'prompt' && (
            <section className="app-card">
              <div className="p-4 sm:p-5 border-b border-border-subtle flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-on-surface">Execution prompt</h3>
                  <p className="mt-0.5 text-xs text-text-muted">~{tokens.toLocaleString()} tokens</p>
                </div>
              </div>
              <div className="p-4 sm:p-5 space-y-3">
                {executionPrompt ? (
                  <>
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs text-on-surface-variant bg-surface-container-lowest border border-border-subtle rounded-xl p-4 max-h-[32rem] overflow-y-auto">
                      {executionPrompt}
                    </pre>
                    {promptUsed && promptUsed !== executionPrompt && (
                      <p className="text-xs text-text-muted">A custom version was last copied.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={copyPrompt} className={primaryBtn}>
                        {copied === 'prompt' ? <ClipboardCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied === 'prompt' ? 'Copied' : 'Copy prompt'}
                      </button>
                      <button type="button" onClick={copyMarkdown} className={secondaryBtn}>
                        {copied === 'markdown' ? <ClipboardCheck className="w-4 h-4" /> : <FileCode className="w-4 h-4" />}
                        {copied === 'markdown' ? 'Copied' : 'Copy as Markdown'}
                      </button>
                      <button type="button" onClick={regenerate} disabled={busy === 'regen'} className={secondaryBtn}>
                        {busy === 'regen' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Regenerate
                      </button>
                    </div>
                    <p className="text-xs text-text-muted">Paste this into your coding agent.</p>
                  </>
                ) : (
                  <div className="space-y-4">
                    <EmptyState icon={Terminal} title="No execution prompt yet" description="Generate an execution prompt from this task's context." />
                    <div className="flex justify-center">
                      <button type="button" onClick={regenerate} disabled={busy === 'regen'} className={primaryBtn}>
                        {busy === 'regen' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Generate prompt
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {panel === 'context' && (
            <div className="space-y-4">
              {contextSections.map(({ key, label }) => {
                const value = brief[key] || '';
                return (
                  <section key={key} className="app-card">
                    <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center justify-between gap-3">
                      <h3 className="font-display font-bold text-on-surface">{label}</h3>
                      <button
                        type="button"
                        onClick={() => copySection(key, value)}
                        disabled={!value}
                        className="icon-button shrink-0 disabled:opacity-40"
                        aria-label={`Copy ${label}`}
                      >
                        {copied === key ? <ClipboardCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="p-4 sm:p-5">
                      {value ? (
                        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-on-surface-variant">{value}</div>
                      ) : (
                        <p className="text-sm text-text-muted">Not provided.</p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {panel === 'references' && (
            <section className="app-card">
              <div className="p-4 sm:p-5 border-b border-border-subtle">
                <h3 className="font-display font-bold text-on-surface">References</h3>
              </div>
              <div className="p-4 sm:p-5">
                {references.length === 0 ? (
                  <EmptyState icon={Link2} title="No references" description="Supporting links and notes will appear here." />
                ) : (
                  <ul className="space-y-2">
                    {references.map((ref, index) => (
                      <li key={index} className="rounded-xl border border-border-subtle bg-surface-container-lowest p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{ref.label}</p>
                        {isUrl(ref.value) ? (
                          <a
                            href={ref.value}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline break-all"
                          >
                            {ref.value}
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          </a>
                        ) : (
                          <p className="mt-0.5 text-sm text-on-surface break-words">{ref.value}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
