import { Check, Circle, Clock3, Minus, Play } from 'lucide-react';
import { cn } from '../../lib/utils';

const stateMeta = {
  completed: { icon: Check, label: 'Done', style: 'bg-success-proactive text-white' },
  released: { icon: Minus, label: 'Released', style: 'bg-surface-container-high text-text-muted' },
  started: { icon: Play, label: 'In progress', style: 'bg-secondary text-white' },
  current: { icon: Clock3, label: 'Now', style: 'bg-secondary text-white' },
  missed: { icon: Minus, label: 'Ready to release', style: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  upcoming: { icon: Circle, label: 'Upcoming', style: 'bg-surface-container-high text-text-muted' },
  planned: { icon: Circle, label: 'Planned', style: 'bg-surface-container-high text-text-muted' },
};

export default function DayTimeline({ blocks, busy, onStart, onComplete }) {
  return (
    <section className="app-card p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div><h2 className="section-title">Today’s rhythm</h2><p className="mt-1 text-xs text-text-muted">Guidance, not task debt.</p></div>
      </div>
      <div className="space-y-1">
        {blocks.map((block) => {
          const meta = stateMeta[block.state] || stateMeta.planned;
          const Icon = meta.icon;
          const actionable = block.state === 'current' || block.state === 'started';
          return (
            <div key={block.id} className={cn('group flex items-center gap-3 rounded-xl px-2 py-3 transition', actionable && 'bg-secondary/5')}>
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', meta.style)} title={meta.label}><Icon className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2">
                  <p className={cn('truncate text-sm font-bold', block.state === 'released' && 'text-text-muted line-through')}>{block.title}</p>
                  <span className="text-[11px] font-semibold text-text-muted">{block.timeLabel}</span>
                </div>
                {block.instruction && <p className="mt-0.5 truncate text-xs text-text-muted">{block.instruction}</p>}
              </div>
              {block.state === 'current' && <button type="button" disabled={busy} onClick={() => onStart(block)} className="rounded-lg px-3 py-2 text-xs font-bold text-secondary hover:bg-secondary/10 disabled:opacity-50">Start</button>}
              {block.state === 'started' && <button type="button" disabled={busy} onClick={() => onComplete(block)} className="rounded-lg px-3 py-2 text-xs font-bold text-success-proactive hover:bg-success-proactive/10 disabled:opacity-50">Done</button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
