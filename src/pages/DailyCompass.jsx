import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, CalendarDays, CheckCircle2, Compass, Loader2, RotateCcw,
  Settings2, Target, X,
} from 'lucide-react';
import CompassNowCard from '../components/Compass/CompassNowCard';
import DailyFive from '../components/Compass/DailyFive';
import DayTimeline from '../components/Compass/DayTimeline';
import {
  closeCompassDay,
  getCompassToday,
  getCompassWeek,
  minuteToTimeInput,
  resetCompassDay,
  saveCompassPlan,
  setCompassBlock,
  setCompassCheck,
  timeInputToMinute,
  updateCompassDay,
} from '../services/compassApi';

const CHECK_PROPERTY = {
  sleep: 'sleep',
  exercise: 'exercise',
  deep_work: 'deepWork',
  learn_build: 'learnBuild',
  reflection: 'reflection',
};

const KIND_CHECK = {
  exercise: 'exercise',
  deep_work: 'deepWork',
  learning: 'learnBuild',
  reflection: 'reflection',
};

export default function DailyCompass() {
  const [compass, setCompass] = useState(null);
  const [week, setWeek] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyCheck, setBusyCheck] = useState('');
  const [error, setError] = useState('');
  const [editingRhythm, setEditingRhythm] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [importantThing, setImportantThing] = useState('');

  const weekStart = useMemo(() => mondayOf(compass?.date || localDate()), [compass?.date]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getCompassToday();
      setCompass(result);
      setImportantThing(result.day?.importantThing || '');
    } catch (loadError) {
      setError(loadError.message || 'Daily Compass is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWeek = useCallback(async (start) => {
    try {
      setWeek(await getCompassWeek(start));
    } catch {
      // Today remains fully usable when the secondary history view fails.
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (compass?.configured) loadWeek(weekStart); }, [compass?.configured, loadWeek, weekStart]);

  const savePlan = async (payload) => {
    setBusy(true);
    setError('');
    try {
      const result = await saveCompassPlan(payload);
      setCompass(result);
      setImportantThing(result.day?.importantThing || '');
      setEditingRhythm(false);
    } catch (saveError) {
      setError(saveError.message || 'Could not save this rhythm.');
    } finally {
      setBusy(false);
    }
  };

  const saveImportantThing = async () => {
    if (!compass?.date) return;
    setBusy(true);
    try {
      const result = await updateCompassDay(compass.date, { importantThing });
      setCompass((current) => ({ ...current, day: result.day }));
    } catch (saveError) {
      setError(saveError.message || 'Could not save today’s priority.');
    } finally {
      setBusy(false);
    }
  };

  const toggleCheck = async (item, completed) => {
    const previous = compass;
    const property = CHECK_PROPERTY[item.apiKey];
    setBusyCheck(item.apiKey);
    setCompass((current) => ({
      ...current,
      checks: { ...current.checks, [property]: completed },
      completedChecks: Math.max(0, Math.min(5, current.completedChecks + (completed ? 1 : -1))),
    }));
    try {
      await setCompassCheck(compass.date, item.apiKey, completed);
      loadWeek(weekStart);
    } catch (toggleError) {
      setCompass(previous);
      setError(toggleError.message || 'Could not update this check-in.');
    } finally {
      setBusyCheck('');
    }
  };

  const updateBlock = async (block, status) => {
    setBusy(true);
    setError('');
    const previous = compass;
    const checkProperty = status === 'completed' ? KIND_CHECK[block.kind] : null;
    setCompass((current) => ({
      ...current,
      blocks: current.blocks.map((item) => item.id === block.id ? { ...item, state: status } : item),
      checks: checkProperty ? { ...current.checks, [checkProperty]: true } : current.checks,
      completedChecks: checkProperty && !current.checks[checkProperty]
        ? current.completedChecks + 1
        : current.completedChecks,
      nextStep: status === 'started' ? { ...block, state: 'started' } : current.nextStep,
    }));
    try {
      const refreshed = await setCompassBlock(compass.date, block.id, status);
      setCompass(refreshed);
      loadWeek(weekStart);
    } catch (updateError) {
      setCompass(previous);
      setError(updateError.message || 'Could not update this block.');
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await resetCompassDay(compass.date);
      setCompass(result);
      setResetOpen(false);
      loadWeek(weekStart);
    } catch (resetError) {
      setError(resetError.message || 'Could not reset the day.');
    } finally {
      setBusy(false);
    }
  };

  const saveReflection = async (payload) => {
    setBusy(true);
    setError('');
    try {
      const result = await closeCompassDay(compass.date, payload);
      setCompass(result);
      setReflectionOpen(false);
      loadWeek(weekStart);
    } catch (closeError) {
      setError(closeError.message || 'Could not close the day.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[55vh] items-center justify-center gap-2 text-sm text-text-muted"><Loader2 className="h-5 w-5 animate-spin" /> Orienting your day…</div>;
  }

  if (!compass) {
    return <ErrorState message={error} onRetry={load} />;
  }

  if (!compass.configured || editingRhythm) {
    return (
      <RhythmSetup
        initialBlocks={compass.configured ? compass.blocks : compass.recommendedBlocks}
        initialTheme={compass.focusTheme}
        isEditing={compass.configured}
        busy={busy}
        error={error}
        onCancel={() => setEditingRhythm(false)}
        onSave={savePlan}
      />
    );
  }

  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short' })
    .format(new Date(`${compass.date}T12:00:00`));

  return (
    <div className="mx-auto max-w-container-max space-y-5 pb-24 lg:pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-bold text-secondary"><Compass className="h-4 w-4" /> Daily Compass</div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-on-surface sm:text-4xl">Know what matters now.</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{dateLabel} · Miss → notice → reset → continue.</p>
        </div>
        <button type="button" onClick={() => setEditingRhythm(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface-card px-4 text-sm font-bold text-on-surface hover:bg-surface-container-low"><Settings2 className="h-4 w-4" /> Edit rhythm</button>
      </header>

      {error && <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

      <CompassNowCard
        nextStep={compass.nextStep}
        isClosed={Boolean(compass.day?.closedAt)}
        resetRecommended={compass.resetRecommended}
        busy={busy}
        onStart={(block) => updateBlock(block, 'started')}
        onComplete={(block) => updateBlock(block, 'completed')}
        onReset={() => setResetOpen(true)}
        onReflect={() => setReflectionOpen(true)}
      />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <DayTimeline
          blocks={compass.blocks}
          busy={busy}
          onStart={(block) => updateBlock(block, 'started')}
          onComplete={(block) => updateBlock(block, 'completed')}
        />
        <div className="space-y-4">
          <DailyFive checks={compass.checks} completed={compass.completedChecks} busyKey={busyCheck} onToggle={toggleCheck} />
          <section className="app-card p-5">
            <div className="mb-3 flex items-center gap-2"><Target className="h-4 w-4 text-secondary" /><h2 className="text-sm font-bold">One important thing</h2></div>
            <textarea value={importantThing} onChange={(event) => setImportantThing(event.target.value)} rows={3} maxLength={300} placeholder="What deserves your best attention today?" className="w-full resize-none rounded-xl border border-border-subtle bg-surface-container-lowest p-3 text-sm outline-none focus:ring-2 focus:ring-secondary/40" />
            <button type="button" disabled={busy || importantThing === (compass.day?.importantThing || '')} onClick={saveImportantThing} className="mt-3 min-h-10 w-full rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-45">Save priority</button>
          </section>
          <section className="app-card p-5">
            <div className="mb-2 flex items-center gap-2"><BookOpen className="h-4 w-4 text-secondary" /><h2 className="text-sm font-bold">Focus Theme</h2></div>
            {compass.focusTheme ? (
              <><p className="font-display text-xl font-bold">{compass.focusTheme.title}</p>{compass.focusTheme.description && <p className="mt-1 text-sm leading-6 text-text-muted">{compass.focusTheme.description}</p>}</>
            ) : <p className="text-sm text-text-muted">Choose one learning or building direction when you edit your rhythm.</p>}
          </section>
        </div>
      </section>

      {week && <WeekStrip week={week} />}

      {resetOpen && <ResetDialog nextStep={compass.nextStep} busy={busy} onClose={() => setResetOpen(false)} onConfirm={confirmReset} />}
      {reflectionOpen && <ReflectionDialog initial={compass.day} busy={busy} onClose={() => setReflectionOpen(false)} onSave={saveReflection} />}
    </div>
  );
}

function RhythmSetup({ initialBlocks, initialTheme, isEditing, busy, error, onCancel, onSave }) {
  const [blocks, setBlocks] = useState(() => (initialBlocks || []).map(cleanBlock));
  const [theme, setTheme] = useState(initialTheme?.title || '');
  const [description, setDescription] = useState(initialTheme?.description || '');

  const changeTime = (index, time) => {
    setBlocks((current) => current.map((block, blockIndex) => blockIndex === index
      ? { ...block, startMinute: timeInputToMinute(time) }
      : block));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-20">
      <header>
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-secondary"><Compass className="h-4 w-4" /> Daily Compass</div>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{isEditing ? 'Tune your daily rhythm.' : 'Build a day you can return to.'}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">Start simple. These times are guidance, and Reset makes the plan usable even when the day changes.</p>
      </header>
      {error && <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}
      <section className="app-card p-5 sm:p-6">
        <h2 className="section-title">Daily rhythm</h2>
        <div className="mt-4 divide-y divide-border-subtle">
          {blocks.map((block, index) => (
            <div key={`${block.kind}-${index}`} className="grid gap-3 py-3 sm:grid-cols-[130px_1fr] sm:items-center">
              <input type="time" value={minuteToTimeInput(block.startMinute)} onChange={(event) => changeTime(index, event.target.value)} className="min-h-11 rounded-xl border border-border-subtle bg-surface-container-lowest px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-secondary/40" />
              <div><p className="text-sm font-bold">{block.title}</p><p className="mt-0.5 text-xs text-text-muted">{block.instruction}</p></div>
            </div>
          ))}
        </div>
      </section>
      <section className="app-card p-5 sm:p-6">
        <h2 className="section-title">Focus Theme</h2>
        <p className="mt-1 text-sm text-text-muted">One learning or building direction for the next 4–6 weeks.</p>
        <input value={theme} onChange={(event) => setTheme(event.target.value)} maxLength={120} placeholder="e.g. PostgreSQL performance" className="mt-4 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-container-lowest px-3 text-sm outline-none focus:ring-2 focus:ring-secondary/40" />
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={1000} placeholder="What will you understand or build?" className="mt-3 w-full resize-none rounded-xl border border-border-subtle bg-surface-container-lowest p-3 text-sm outline-none focus:ring-2 focus:ring-secondary/40" />
      </section>
      <div className="flex flex-wrap justify-end gap-2">
        {isEditing && <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-xl border border-border-subtle bg-surface-card px-5 text-sm font-bold">Cancel</button>}
        <button type="button" disabled={busy} onClick={() => onSave({ name: 'My daily rhythm', blocks, focusTheme: theme.trim() ? { title: theme, description } : null })} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{isEditing ? 'Save rhythm' : 'Use this rhythm'}</button>
      </div>
    </div>
  );
}

function ResetDialog({ nextStep, busy, onClose, onConfirm }) {
  return (
    <Modal title="Reset today" onClose={onClose}>
      <div className="space-y-4 p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/10 text-secondary"><RotateCcw className="h-6 w-6" /></div>
        <div><p className="font-display text-2xl font-bold">The day is still usable.</p><p className="mt-2 text-sm leading-6 text-text-muted">Release the blocks that have passed. Completed work and your Daily Five stay exactly as they are.</p></div>
        {nextStep && <div className="rounded-xl bg-surface-container-lowest p-4"><p className="text-xs font-bold uppercase tracking-wide text-text-muted">Continue with</p><p className="mt-1 font-bold">{nextStep.title}</p></div>}
        <button type="button" disabled={busy} onClick={onConfirm} className="min-h-12 w-full rounded-xl bg-primary text-sm font-bold text-white disabled:opacity-60">Continue from here</button>
      </div>
    </Modal>
  );
}

function ReflectionDialog({ initial, busy, onClose, onSave }) {
  const [captureText, setCaptureText] = useState(initial?.captureText || '');
  const [learnText, setLearnText] = useState(initial?.learnText || '');
  const [tomorrowText, setTomorrowText] = useState(initial?.tomorrowText || '');
  return (
    <Modal title="Close the day" onClose={onClose}>
      <form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); onSave({ captureText, learnText, tomorrowText }); }}>
        <ReflectionField label="Capture" hint="What is still occupying your mind?" value={captureText} onChange={setCaptureText} />
        <ReflectionField label="Learn" hint="What did you understand today?" value={learnText} onChange={setLearnText} />
        <ReflectionField label="Tomorrow" hint="What is the single most important thing tomorrow?" value={tomorrowText} onChange={setTomorrowText} />
        <button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save and close today</button>
      </form>
    </Modal>
  );
}

function ReflectionField({ label, hint, value, onChange }) {
  return <label className="block"><span className="text-sm font-bold">{label}</span><span className="ml-2 text-xs text-text-muted">{hint}</span><textarea rows={3} maxLength={2000} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full resize-none rounded-xl border border-border-subtle bg-surface-container-lowest p-3 text-sm outline-none focus:ring-2 focus:ring-secondary/40" /></label>;
}

function WeekStrip({ week }) {
  return (
    <section className="app-card p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2"><CalendarDays className="h-4 w-4 text-secondary" /><h2 className="section-title">This week</h2></div>
      <div className="grid grid-cols-7 gap-2">
        {week.days.map((entry) => {
          const date = new Date(`${entry.date}T12:00:00`);
          return <div key={entry.date} className="rounded-xl bg-surface-container-lowest p-2 text-center"><p className="text-[10px] font-bold uppercase text-text-muted">{date.toLocaleDateString(undefined, { weekday: 'short' })}</p><p className="mt-1 font-display text-lg font-bold">{entry.completedChecks}/5</p>{entry.day?.closedAt ? <CheckCircle2 className="mx-auto mt-1 h-4 w-4 text-success-proactive" /> : <span className="mx-auto mt-2 block h-2 w-2 rounded-full bg-surface-container-highest" />}</div>;
        })}
      </div>
    </section>
  );
}

function Modal({ title, onClose, children }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"><button type="button" aria-label="Close" className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} /><section role="dialog" aria-modal="true" aria-label={title} className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-[28px] bg-surface-card shadow-2xl sm:max-w-lg sm:rounded-[24px]"><header className="sticky top-0 z-10 flex items-center justify-between border-b border-border-subtle bg-surface-card px-5 py-4"><h2 className="font-display text-xl font-bold">{title}</h2><button type="button" onClick={onClose} className="icon-button"><X className="h-5 w-5" /></button></header>{children}</section></div>;
}

function ErrorState({ message, onRetry }) {
  return <div className="mx-auto mt-16 max-w-md rounded-2xl border border-error/20 bg-surface-card p-6 text-center"><p className="font-bold text-error">{message}</p><button type="button" onClick={onRetry} className="mt-4 min-h-11 rounded-xl bg-primary px-5 text-sm font-bold text-white">Try again</button></div>;
}

function cleanBlock(block) {
  return {
    id: block.id || null,
    kind: block.kind,
    title: block.title,
    instruction: block.instruction || '',
    daysMask: block.daysMask ?? 127,
    startMinute: Number(block.startMinute || 0),
    durationMinutes: Number(block.durationMinutes || 30),
    graceMinutes: block.graceMinutes,
  };
}

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function mondayOf(value) {
  const date = new Date(`${value}T12:00:00`);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
