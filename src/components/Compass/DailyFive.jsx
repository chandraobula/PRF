import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';

const items = [
  { key: 'sleep', apiKey: 'sleep', label: '7.5h+ sleep' },
  { key: 'exercise', apiKey: 'exercise', label: 'Exercise' },
  { key: 'deepWork', apiKey: 'deep_work', label: 'Deep work' },
  { key: 'learnBuild', apiKey: 'learn_build', label: 'Learn / build' },
  { key: 'reflection', apiKey: 'reflection', label: '5-minute reflection' },
];

export default function DailyFive({ checks, completed, busyKey, onToggle }) {
  return (
    <section className="app-card p-5 sm:p-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div><h2 className="section-title">Daily Five</h2><p className="mt-1 text-xs text-text-muted">Only the signals that matter.</p></div>
        <span className="font-display text-2xl font-bold tabular-nums text-primary">{completed}/5</span>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const checked = Boolean(checks?.[item.key]);
          return (
            <button
              key={item.key}
              type="button"
              disabled={busyKey === item.apiKey}
              onClick={() => onToggle(item, !checked)}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left transition hover:bg-surface-container-lowest disabled:opacity-60"
            >
              <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition', checked ? 'border-primary bg-primary text-white' : 'border-border-subtle bg-surface-card text-transparent')}><Check className="h-4 w-4" /></span>
              <span className={cn('text-sm font-semibold', checked ? 'text-on-surface' : 'text-on-surface-variant')}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
