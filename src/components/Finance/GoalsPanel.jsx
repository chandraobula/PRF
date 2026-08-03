import { useState } from 'react';
import {
  CheckCircle2, Edit2, Flag, Loader2, Minus, Plus, Target, Trash2, TriangleAlert,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ConfirmDialog, MiniStat, Modal } from './BudgetsPanel';
import {
  addFinanceGoal, contributeToFinanceGoal, deleteFinanceGoal, formatMoney,
  formatMoneyCompact, updateFinanceGoal,
} from '../../services/financeApi';

const GOAL_TYPES = [
  { value: 'emergency_fund', label: 'Emergency fund' },
  { value: 'vacation', label: 'Vacation' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'house', label: 'House' },
  { value: 'education', label: 'Education' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'gadget', label: 'Gadget' },
  { value: 'custom', label: 'Something else' },
];

const emptyGoal = () => ({
  name: '',
  goalType: 'custom',
  targetAmount: '',
  savedAmount: '',
  targetDate: '',
  priority: 3,
});

export default function GoalsPanel({ goals, habits = [], currency, onChanged }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyGoal);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [contributing, setContributing] = useState(null);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyGoal());
    setError('');
    setEditorOpen(true);
  };

  const openEdit = (goal) => {
    setEditing(goal);
    setForm({
      name: goal.name,
      goalType: goal.goalType,
      targetAmount: String(goal.targetAmountMinor / 100),
      savedAmount: String(goal.savedAmountMinor / 100),
      targetDate: goal.targetDate || '',
      priority: goal.priority,
    });
    setError('');
    setEditorOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) return setError('Give this goal a name.');
    if (!Number(form.targetAmount)) return setError('Set a target amount greater than zero.');
    if (Number(form.savedAmount || 0) > Number(form.targetAmount)) {
      return setError('Saved so far cannot exceed the target.');
    }

    setIsSaving(true);
    setError('');

    const payload = {
      name: form.name.trim(),
      goalType: form.goalType,
      targetAmount: Number(form.targetAmount),
      savedAmount: Number(form.savedAmount || 0),
      targetDate: form.targetDate || undefined,
      priority: Number(form.priority),
      currency,
    };

    try {
      if (editing) await updateFinanceGoal(editing.id, payload);
      else await addFinanceGoal(payload);
      setEditorOpen(false);
      await onChanged?.();
    } catch (saveError) {
      setError(saveError.message || 'Could not save this goal.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteFinanceGoal(pendingDelete.id);
      setPendingDelete(null);
      await onChanged?.();
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete this goal.');
      setPendingDelete(null);
    }
  };

  const totalTarget = goals.reduce((sum, goal) => sum + goal.targetAmountMinor, 0);
  const totalSaved = goals.reduce((sum, goal) => sum + goal.savedAmountMinor, 0);
  const totalMonthly = goals.reduce((sum, goal) => sum + (goal.requiredMonthlyMinor || 0), 0);

  return (
    <div className="grid gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 lg:grid-cols-[1fr_360px]">
      <section className="app-card p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="section-title">Goals</h2>
            <p className="text-sm text-text-muted">
              {goals.length > 0
                ? <>{formatMoney(totalSaved, currency)} saved of {formatMoney(totalTarget, currency)}</>
                : 'Save toward the things you are actually planning for'}
            </p>
          </div>
          <button type="button" onClick={openCreate} className="min-h-11 shrink-0 inline-flex items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:opacity-90">
            <Plus className="h-4 w-4" /> New goal
          </button>
        </div>

        {totalMonthly > 0 && (
          <div className="mb-5 rounded-xl border border-border-subtle bg-surface-container-lowest p-3.5">
            <p className="text-[13px] leading-5 text-on-surface-variant">
              To hit every dated goal on time you need to set aside{' '}
              <strong className="text-on-surface">{formatMoney(totalMonthly, currency)}</strong> a month.
            </p>
          </div>
        )}

        {goals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-subtle p-6 text-center">
            <p className="text-sm font-semibold text-on-surface">No goals yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
              Add a target amount and a date, and we'll work out what you need to put aside each month.
            </p>
            <button type="button" onClick={openCreate} className="mt-4 min-h-11 inline-flex items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white">
              <Plus className="h-4 w-4" /> Create your first goal
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                currency={currency}
                onEdit={() => openEdit(goal)}
                onDelete={() => setPendingDelete(goal)}
                onContribute={() => setContributing(goal)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="app-card h-fit p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
            <Flag className="h-5 w-5" />
          </span>
          <div>
            <h2 className="section-title">Habits</h2>
            <p className="text-sm text-text-muted">Streaks that keep finance calm</p>
          </div>
        </div>
        <div className="space-y-3">
          {habits.length === 0 && <p className="text-sm text-text-muted">No habits tracked yet.</p>}
          {habits.map((habit) => (
            <div key={habit.id} className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{habit.name}</p>
                <p className="text-xs text-text-muted">{habit.cadence} · best {habit.bestStreak}</p>
              </div>
              <span className="shrink-0 rounded-full bg-success-proactive/10 px-2.5 py-1 text-xs font-bold text-success-proactive">
                {habit.currentStreak} streak
              </span>
            </div>
          ))}
        </div>
      </section>

      {editorOpen && (
        <GoalEditor
          form={form}
          setForm={setForm}
          currency={currency}
          isSaving={isSaving}
          error={error}
          isEditing={Boolean(editing)}
          onSubmit={save}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {contributing && (
        <ContributeDialog
          goal={contributing}
          currency={currency}
          onClose={() => setContributing(null)}
          onDone={async () => { setContributing(null); await onChanged?.(); }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete "${pendingDelete.name}"?`}
          body="This removes the goal and its saved progress. Your transactions are not affected."
          confirmLabel="Delete goal"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function GoalCard({ goal, currency, onEdit, onDelete, onContribute }) {
  return (
    <article className={cn('rounded-xl border p-4', goal.isComplete ? 'border-success-proactive/40 bg-success-proactive/5' : 'border-border-subtle')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 truncate font-bold text-on-surface">
            {goal.isComplete && <CheckCircle2 className="h-4 w-4 shrink-0 text-success-proactive" />}
            {goal.name}
          </h3>
          <p className="text-sm text-text-muted">
            Target {formatMoney(goal.targetAmountMinor, goal.currency || currency)}
            {goal.targetDate ? ` by ${goal.targetDate}` : ' · no date set'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={cn(
            'rounded-full px-2.5 py-1 text-xs font-bold',
            goal.isComplete ? 'bg-success-proactive/10 text-success-proactive' : 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
          )}
          >
            {goal.progressPercent}%
          </span>
          <button type="button" onClick={onEdit} className="icon-button h-9 w-9" aria-label={`Edit ${goal.name}`}>
            <Edit2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={onDelete} className="icon-button h-9 w-9 hover:text-error" aria-label={`Delete ${goal.name}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface-container">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${goal.progressPercent}%`,
            backgroundColor: goal.isComplete ? 'rgb(var(--color-success-proactive, 34 197 94))' : 'var(--viz-income)',
          }}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <MiniStat label="Saved" value={formatMoneyCompact(goal.savedAmountMinor, currency)} />
        <MiniStat label="To go" value={formatMoneyCompact(goal.remainingMinor, currency)} />
        <MiniStat
          label="Per month"
          value={goal.requiredMonthlyMinor ? formatMoneyCompact(goal.requiredMonthlyMinor, currency) : '—'}
        />
      </div>

      {goal.isOverdue && !goal.isComplete && (
        <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-5 text-error">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The target date has passed with {formatMoney(goal.remainingMinor, currency)} still to go.
        </p>
      )}

      {!goal.isComplete && !goal.isOverdue && goal.monthsRemaining !== null && (
        <p className="mt-3 text-[12px] leading-5 text-text-muted">
          {goal.monthsRemaining} {goal.monthsRemaining === 1 ? 'month' : 'months'} left ·{' '}
          <strong className="text-on-surface">{formatMoney(goal.requiredMonthlyMinor || 0, currency)}</strong> a month gets you there.
        </p>
      )}

      {goal.isComplete && (
        <p className="mt-3 text-[12px] font-semibold leading-5 text-success-proactive">Goal reached — nice work.</p>
      )}

      <button
        type="button"
        onClick={onContribute}
        className="mt-4 min-h-11 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface-card text-sm font-bold hover:bg-surface-container-low"
      >
        <Plus className="h-4 w-4" /> Add money
      </button>
    </article>
  );
}

function ContributeDialog({ goal, currency, onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState('deposit');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const numeric = Number(amount || 0);
  const projectedSaved = direction === 'deposit'
    ? Math.min(goal.targetAmountMinor, goal.savedAmountMinor + numeric * 100)
    : Math.max(0, goal.savedAmountMinor - numeric * 100);
  const projectedPercent = goal.targetAmountMinor > 0
    ? Math.round((projectedSaved / goal.targetAmountMinor) * 1000) / 10
    : 0;

  const submit = async (event) => {
    event.preventDefault();
    if (!numeric) return setError('Enter an amount.');

    setIsSaving(true);
    setError('');
    try {
      await contributeToFinanceGoal(goal.id, { amount: numeric, direction });
      await onDone();
    } catch (saveError) {
      setError(saveError.message || 'Could not update this goal.');
      setIsSaving(false);
    }
  };

  return (
    <Modal title={goal.name} onClose={onClose} maxWidth="max-w-sm">
      <form className="space-y-4 p-5" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-container-low p-1">
          <button type="button" onClick={() => setDirection('deposit')} className={cn('min-h-10 inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold', direction === 'deposit' ? 'bg-surface-card text-on-surface shadow-sm' : 'text-on-surface-variant')}>
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
          <button type="button" onClick={() => setDirection('withdraw')} className={cn('min-h-10 inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold', direction === 'withdraw' ? 'bg-surface-card text-on-surface shadow-sm' : 'text-on-surface-variant')}>
            <Minus className="h-3.5 w-3.5" /> Take out
          </button>
        </div>

        <label className="settings-field">
          <span>Amount ({currency})</span>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
        </label>

        <div className="rounded-xl bg-surface-container-lowest p-3 text-[13px] leading-5">
          <div className="flex justify-between">
            <span className="text-text-muted">Saved now</span>
            <span className="font-semibold tabular-nums">{formatMoney(goal.savedAmountMinor, currency)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-text-muted">After this</span>
            <span className="font-bold tabular-nums text-on-surface">
              {formatMoney(projectedSaved, currency)} ({projectedPercent}%)
            </span>
          </div>
        </div>

        {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
          <button type="submit" disabled={isSaving} className="min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white disabled:opacity-60">
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm
          </button>
        </div>
      </form>
    </Modal>
  );
}

function GoalEditor({ form, setForm, currency, isSaving, error, isEditing, onSubmit, onClose }) {
  return (
    <Modal title={isEditing ? 'Edit goal' : 'New goal'} onClose={onClose}>
      <form className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" onSubmit={onSubmit}>
        <label className="settings-field">
          <span>Name</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Emergency fund" autoFocus />
        </label>

        <label className="settings-field">
          <span>Type</span>
          <select
            className="w-full min-h-12 rounded-xl border border-outline-variant bg-surface-card px-3.5 text-[15px]"
            value={form.goalType}
            onChange={(e) => setForm({ ...form, goalType: e.target.value })}
          >
            {GOAL_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="settings-field">
            <span>Target ({currency})</span>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} placeholder="0.00" />
          </label>
          <label className="settings-field">
            <span>Saved so far</span>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={form.savedAmount} onChange={(e) => setForm({ ...form, savedAmount: e.target.value })} placeholder="0.00" />
          </label>
        </div>

        <label className="settings-field">
          <span>Target date</span>
          <input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
          <small>Optional, but it's what makes the monthly figure possible.</small>
        </label>

        <label className="settings-field">
          <span>Priority</span>
          <select
            className="w-full min-h-12 rounded-xl border border-outline-variant bg-surface-card px-3.5 text-[15px]"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
          >
            <option value={1}>1 — Highest</option>
            <option value={2}>2 — High</option>
            <option value={3}>3 — Normal</option>
            <option value={4}>4 — Low</option>
            <option value={5}>5 — Someday</option>
          </select>
        </label>

        {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
          <button type="submit" disabled={isSaving} className="min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white disabled:opacity-60">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
            {isEditing ? 'Save changes' : 'Create goal'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
