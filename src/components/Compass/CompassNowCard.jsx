import { Check, Compass, Play, RotateCcw, Sparkles } from 'lucide-react';

export default function CompassNowCard({
  nextStep,
  isClosed,
  resetRecommended,
  busy,
  onStart,
  onComplete,
  onReset,
  onReflect,
}) {
  if (isClosed) {
    return (
      <section className="relative overflow-hidden rounded-[24px] bg-primary p-6 text-white shadow-[0_16px_40px_rgba(15,23,42,0.14)] sm:p-7">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-teal-400/20 blur-2xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-white/65"><Compass className="h-4 w-4" /> Day closed</span>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight">You can let today go.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">Your reflection is saved. Rest is part of the system too.</p>
        </div>
      </section>
    );
  }

  if (!nextStep) return null;
  const isStarted = nextStep.state === 'started';
  const isReflection = nextStep.kind === 'reflection' || nextStep.virtual;

  return (
    <section className="relative overflow-hidden rounded-[24px] bg-primary p-6 text-white shadow-[0_16px_40px_rgba(15,23,42,0.14)] sm:p-7">
      <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full bg-blue-500/30 blur-2xl" />
      <div className="absolute bottom-[-80px] right-1/3 h-44 w-44 rounded-full bg-teal-400/20 blur-2xl" />
      <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-white/65">
            <Sparkles className="h-4 w-4" />
            <span>{isStarted ? 'In progress' : 'Next step'}</span>
            {nextStep.timeLabel && <span className="rounded-full bg-white/10 px-2.5 py-1 normal-case tracking-normal text-white/75">{nextStep.timeLabel}</span>}
          </div>
          <h2 className="mt-4 font-display text-[30px] font-bold leading-tight tracking-[-0.035em] sm:text-4xl">{nextStep.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">{nextStep.instruction || 'Take the next useful step.'}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {isReflection ? (
            <button type="button" disabled={busy} onClick={onReflect} className="min-h-12 rounded-xl bg-white px-5 text-sm font-bold text-primary transition hover:bg-white/90 disabled:opacity-60">Reflect</button>
          ) : isStarted ? (
            <button type="button" disabled={busy} onClick={() => onComplete(nextStep)} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-primary transition hover:bg-white/90 disabled:opacity-60"><Check className="h-4 w-4" /> Complete</button>
          ) : (
            <button type="button" disabled={busy} onClick={() => onStart(nextStep)} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-primary transition hover:bg-white/90 disabled:opacity-60"><Play className="h-4 w-4" /> Start</button>
          )}
          <button type="button" disabled={busy} onClick={onReset} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-60"><RotateCcw className="h-4 w-4" /> {resetRecommended ? 'Reset now' : 'I need a reset'}</button>
        </div>
      </div>
    </section>
  );
}
