import { CheckCircle2, CheckSquare, Pause, ShieldCheck, TimerReset } from 'lucide-react';

export default function WorkHub() {
  return (
    <div className="space-y-8 max-w-container-max mx-auto">
      <section>
        <h1 className="font-display text-4xl font-bold text-on-surface tracking-tight mb-2">Work Hub</h1>
        <p className="font-body text-on-surface-variant text-lg">Focus block active. 42 minutes remaining.</p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
        <div className="work-focus-banner col-span-1 md:col-span-2 bg-primary rounded-[24px] p-5 sm:p-7 text-on-primary shadow-[0_16px_40px_rgba(15,23,42,.14)] relative overflow-hidden">
          <div className="absolute -top-24 -right-20 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 right-1/3 w-64 h-64 bg-teal-400/10 rounded-full blur-3xl" />
          <div className="relative z-10 grid sm:grid-cols-[1fr_auto] sm:items-end gap-7">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-5 text-white/65">
                <ShieldCheck className="w-4 h-4" />
                <p className="text-[11px] leading-4 font-bold tracking-[0.14em] uppercase">Focus session active</p>
              </div>
              <p className="text-[13px] leading-5 font-medium text-white/60 mb-1.5">Current task</p>
              <h2 className="font-display text-[26px] sm:text-[32px] leading-[1.15] font-bold tracking-[-0.035em] text-white max-w-[18ch]">Q3 roadmap planning</h2>
              <p className="mt-3 max-w-[48ch] text-[14px] leading-[1.55] font-normal text-white/65">Notifications are paused so you can finish the roadmap without interruptions.</p>
            </div>
            <div className="sm:text-right">
              <p className="font-display text-[44px] sm:text-[52px] leading-none font-bold tabular-nums tracking-[-0.055em] text-white">42:15</p>
              <p className="mt-2 text-[11px] leading-4 font-bold tracking-[0.12em] uppercase text-white/55">Minutes remaining</p>
              <div className="flex sm:justify-end gap-2 mt-5">
                <button className="min-h-11 px-4 inline-flex items-center gap-2 rounded-xl bg-surface-card text-primary text-[13px] leading-5 font-bold hover:bg-surface-card/90"><Pause className="w-4 h-4" /> Pause</button>
                <button className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/15" aria-label="Restart focus timer"><TimerReset className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface-card rounded-card border border-border-subtle p-6 flex flex-col justify-between">
          <h3 className="font-display font-bold text-[17px] leading-6 tracking-[-0.015em] text-on-surface">Today's progress</h3>
          <div className="space-y-4 my-4">
            <div className="flex justify-between items-end">
              <div>
                <p className="font-display text-[34px] leading-10 font-bold tracking-[-0.04em]">6/8</p>
                <p className="text-[13px] leading-5 font-medium text-text-muted">Tasks completed</p>
              </div>
              <div className="w-12 h-12 rounded-full border-4 border-success-proactive border-t-surface-container flex items-center justify-center transform -rotate-45">
                <CheckCircle2 className="w-5 h-5 text-success-proactive transform rotate-45" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface-card rounded-card border border-border-subtle p-6">
        <h3 className="font-bold text-lg text-on-surface mb-4">Upcoming Tasks</h3>
        <div className="space-y-3">
          {[
            { title: "Review PR #452 for authentication flow", time: "Today, 2:00 PM", priority: "High" },
            { title: "Draft engineering blog post", time: "Today, 4:00 PM", priority: "Medium" },
            { title: "Sync with design team on new UI components", time: "Tomorrow, 10:00 AM", priority: "Medium" }
          ].map((task, i) => (
            <div key={i} className="flex items-start space-x-3 p-3 hover:bg-surface-container-lowest rounded-lg transition-colors border border-transparent hover:border-border-subtle cursor-pointer">
              <CheckSquare className="w-5 h-5 text-text-muted mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-sm text-on-surface">{task.title}</p>
                <p className="text-xs text-text-muted">{task.time}</p>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${task.priority === 'High' ? 'bg-error/10 text-error' : 'bg-surface-container-high text-on-surface-variant'}`}>
                {task.priority}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
