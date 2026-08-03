import { useState } from 'react';
import {
  AlertTriangle, Edit2, Loader2, PieChart, Plus, Trash2, TrendingUp, X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  addFinanceBudget, deleteFinanceBudget, formatMoney, formatMoneyCompact, updateFinanceBudget,
} from '../../services/financeApi';

const PERIODS = ['weekly', 'monthly', 'yearly', 'custom'];

function monthRange(asOf = new Date()) {
  const start = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  const end = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0);
  const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { start: iso(start), end: iso(end) };
}

/** Period presets drive the dates so the user isn't hand-typing ranges. */
function rangeForPeriod(period, from = new Date()) {
  if (period === 'weekly') {
    const day = from.getDay();
    const monday = new Date(from);
    monday.setDate(from.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { start: iso(monday), end: iso(sunday) };
  }
  if (period === 'yearly') {
    return { start: `${from.getFullYear()}-01-01`, end: `${from.getFullYear()}-12-31` };
  }
  return monthRange(from);
}

const emptyBudget = () => {
  const { start, end } = monthRange();
  return {
    name: '',
    categoryId: '',
    period: 'monthly',
    periodStart: start,
    periodEnd: end,
    limit: '',
    carryForward: '',
    alertThresholdPercent: 80,
    isFlexible: false,
  };
};

export default function BudgetsPanel({
  budgets, currency, categories = [], onChanged, compact = false,
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyBudget);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  const expenseCategories = categories.filter((category) => category.type === 'expense');

  const openCreate = () => {
    setEditing(null);
    setForm(emptyBudget());
    setError('');
    setEditorOpen(true);
  };

  const openEdit = (budget) => {
    setEditing(budget);
    setForm({
      name: budget.name,
      categoryId: budget.categoryId || '',
      period: budget.period,
      periodStart: budget.periodStart,
      periodEnd: budget.periodEnd,
      limit: String(budget.limitMinor / 100),
      carryForward: budget.carryForwardMinor ? String(budget.carryForwardMinor / 100) : '',
      alertThresholdPercent: budget.alertThresholdPercent,
      isFlexible: budget.isFlexible,
    });
    setError('');
    setEditorOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) return setError('Give this budget a name.');
    if (!Number(form.limit)) return setError('Set a spending limit greater than zero.');
    if (form.periodEnd < form.periodStart) return setError('The end date must come after the start date.');

    setIsSaving(true);
    setError('');

    const payload = {
      name: form.name.trim(),
      categoryId: form.categoryId || null,
      period: form.period,
      periodStart: form.periodStart,
      periodEnd: form.periodEnd,
      limit: Number(form.limit),
      carryForward: Number(form.carryForward || 0),
      alertThresholdPercent: Number(form.alertThresholdPercent) || 80,
      isFlexible: form.isFlexible,
      currency,
    };

    try {
      if (editing) await updateFinanceBudget(editing.id, payload);
      else await addFinanceBudget(payload);
      setEditorOpen(false);
      await onChanged?.();
    } catch (saveError) {
      setError(saveError.message || 'Could not save this budget.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteFinanceBudget(pendingDelete.id);
      setPendingDelete(null);
      await onChanged?.();
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete this budget.');
      setPendingDelete(null);
    }
  };

  const totalLimit = budgets.reduce((sum, budget) => sum + budget.effectiveLimitMinor, 0);
  const totalSpent = budgets.reduce((sum, budget) => sum + budget.spentMinor, 0);

  return (
    <section className={cn('app-card p-5 sm:p-6', !compact && 'animate-in fade-in slide-in-from-bottom-4 duration-500')}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="section-title">Budgets</h2>
          <p className="text-sm text-text-muted">
            {budgets.length > 0
              ? <>{formatMoney(totalSpent, currency)} of {formatMoney(totalLimit, currency)} used</>
              : 'Set limits per category and track them as you spend'}
          </p>
        </div>
        {compact ? (
          <PieChart className="h-5 w-5 shrink-0 text-text-muted" />
        ) : (
          <button type="button" onClick={openCreate} className="min-h-11 shrink-0 inline-flex items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:opacity-90">
            <Plus className="h-4 w-4" /> New budget
          </button>
        )}
      </div>

      {budgets.length === 0 ? (
        <EmptyBudgets compact={compact} onCreate={openCreate} />
      ) : (
        <div className={cn('grid gap-4', compact ? 'grid-cols-1' : 'lg:grid-cols-2')}>
          {budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              currency={currency}
              compact={compact}
              onEdit={() => openEdit(budget)}
              onDelete={() => setPendingDelete(budget)}
            />
          ))}
        </div>
      )}

      {editorOpen && (
        <BudgetEditor
          form={form}
          setForm={setForm}
          categories={expenseCategories}
          currency={currency}
          isSaving={isSaving}
          error={error}
          isEditing={Boolean(editing)}
          onSubmit={save}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete "${pendingDelete.name}"?`}
          body="The budget is removed, but none of your transactions are touched."
          confirmLabel="Delete budget"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </section>
  );
}

function BudgetCard({ budget, currency, compact, onEdit, onDelete }) {
  const isOver = budget.remainingMinor < 0;
  const trackPercent = Math.min(100, budget.usagePercent);
  // Where an even spend rate would put them today — the honest reference point.
  const pacePercent = Math.min(100, Math.round((budget.elapsedDays / budget.totalDays) * 100));

  const statusStyles = {
    over: 'bg-error/10 text-error',
    warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    projected_over: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    on_track: 'bg-success-proactive/10 text-success-proactive',
  };

  return (
    <article className="rounded-xl border border-border-subtle p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-bold text-on-surface">{budget.name}</h3>
          <p className="truncate text-sm text-text-muted">
            {budget.categoryName} · {budget.period}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', statusStyles[budget.status])}>
            {budget.usagePercent}%
          </span>
          {!compact && (
            <>
              <button type="button" onClick={onEdit} className="icon-button h-9 w-9" aria-label={`Edit ${budget.name}`}>
                <Edit2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={onDelete} className="icon-button h-9 w-9 hover:text-error" aria-label={`Delete ${budget.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-surface-container">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${trackPercent}%`,
            backgroundColor: isOver ? 'var(--viz-up)' : (budget.categoryColor || 'var(--viz-income)'),
          }}
        />
        {/* Pace marker: how far through the period they are. */}
        {budget.totalDays > 1 && (
          <div
            className="absolute inset-y-0 w-0.5 bg-on-surface/40"
            style={{ left: `${pacePercent}%` }}
            title={`Even pace: day ${budget.elapsedDays} of ${budget.totalDays}`}
          />
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <MiniStat label="Spent" value={formatMoneyCompact(budget.spentMinor, currency)} />
        <MiniStat
          label={isOver ? 'Over by' : 'Left'}
          value={formatMoneyCompact(Math.abs(budget.remainingMinor), currency)}
          tone={isOver ? 'text-error' : undefined}
        />
        <MiniStat label="Limit" value={formatMoneyCompact(budget.effectiveLimitMinor, currency)} />
      </div>

      {!compact && (
        <div className="mt-3 space-y-1.5 border-t border-border-subtle pt-3 text-[12px] leading-5">
          {budget.daysRemaining > 0 && budget.remainingMinor > 0 && (
            <p className="text-text-muted">
              <span className="font-semibold text-on-surface">{formatMoney(budget.dailyAllowanceMinor, currency)}/day</span>
              {' '}for the remaining {budget.daysRemaining} {budget.daysRemaining === 1 ? 'day' : 'days'}
            </p>
          )}
          {budget.status === 'projected_over' && budget.projectedSpendMinor !== null && (
            <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
              <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              On pace for {formatMoney(budget.projectedSpendMinor, currency)} — {formatMoney(budget.projectedSpendMinor - budget.effectiveLimitMinor, currency)} over.
            </p>
          )}
          {isOver && (
            <p className="flex items-start gap-1.5 text-error">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Over budget by {formatMoney(budget.overspentMinor, currency)}.
            </p>
          )}
          {budget.carryForwardMinor > 0 && (
            <p className="text-text-muted">
              Includes {formatMoneyCompact(budget.carryForwardMinor, currency)} carried forward.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function BudgetEditor({ form, setForm, categories, currency, isSaving, error, isEditing, onSubmit, onClose }) {
  const setPeriod = (period) => {
    if (period === 'custom') return setForm({ ...form, period });
    const { start, end } = rangeForPeriod(period);
    setForm({ ...form, period, periodStart: start, periodEnd: end });
  };

  return (
    <Modal title={isEditing ? 'Edit budget' : 'New budget'} onClose={onClose}>
      <form className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" onSubmit={onSubmit}>
        <label className="settings-field">
          <span>Name</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Groceries" autoFocus />
        </label>

        <label className="settings-field">
          <span>Category</span>
          <select
            className="w-full min-h-12 rounded-xl border border-outline-variant bg-surface-card px-3.5 text-[15px]"
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          >
            <option value="">All expense categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <small>Leave on "All" for a total spending cap.</small>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="settings-field">
            <span>Limit ({currency})</span>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value })} placeholder="0.00" />
          </label>
          <label className="settings-field">
            <span>Carried forward</span>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={form.carryForward} onChange={(e) => setForm({ ...form, carryForward: e.target.value })} placeholder="0.00" />
            <small>Unspent budget rolled in from last period.</small>
          </label>
        </div>

        <div>
          <span className="mb-2 block text-[13px] font-semibold text-on-surface">Period</span>
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-container-low p-1">
            {PERIODS.map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setPeriod(period)}
                className={cn(
                  'min-h-10 rounded-lg text-xs font-bold capitalize',
                  form.period === period ? 'bg-surface-card text-on-surface shadow-sm' : 'text-on-surface-variant',
                )}
              >
                {period}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="settings-field">
            <span>Starts</span>
            <input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
          </label>
          <label className="settings-field">
            <span>Ends</span>
            <input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
          </label>
        </div>

        <label className="settings-field">
          <span>Alert me at {form.alertThresholdPercent}% of the limit</span>
          <input
            type="range"
            min="50"
            max="100"
            step="5"
            value={form.alertThresholdPercent}
            onChange={(e) => setForm({ ...form, alertThresholdPercent: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-border-subtle p-3">
          <input
            type="checkbox"
            checked={form.isFlexible}
            onChange={(e) => setForm({ ...form, isFlexible: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span className="text-[13px] leading-5">
            <span className="font-semibold text-on-surface">Flexible budget</span>
            <span className="block text-text-muted">Anything unspent can roll into the next period.</span>
          </span>
        </label>

        {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
          <button type="submit" disabled={isSaving} className="min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white disabled:opacity-60">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {isEditing ? 'Save changes' : 'Create budget'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EmptyBudgets({ compact, onCreate }) {
  return (
    <div className="rounded-xl border border-dashed border-border-subtle p-6 text-center">
      <p className="text-sm font-semibold text-on-surface">No budgets yet</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
        A budget caps what you spend in a category over a period, and warns you before you blow through it.
      </p>
      {!compact && (
        <button type="button" onClick={onCreate} className="mt-4 min-h-11 inline-flex items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white">
          <Plus className="h-4 w-4" /> Create your first budget
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

export function MiniStat({ label, value, tone }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-text-muted">{label}</p>
      <p className={cn('mt-0.5 text-sm font-bold tabular-nums text-on-surface', tone)}>{value}</p>
    </div>
  );
}

export function Modal({ title, children, onClose, maxWidth = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <section className={cn('relative z-10 flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-surface-card shadow-2xl sm:rounded-[24px]', maxWidth)}>
        <header className="flex items-center justify-between gap-4 border-b border-border-subtle p-5">
          <h2 className="section-title">{title}</h2>
          <button type="button" onClick={onClose} className="icon-button bg-surface-container-low" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, onCancel, onConfirm }) {
  return (
    <Modal title={title} onClose={onCancel} maxWidth="max-w-sm">
      <div className="p-5">
        <p className="text-sm leading-6 text-on-surface-variant">{body}</p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onCancel} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
          <button type="button" onClick={onConfirm} className="min-h-12 flex-1 rounded-xl bg-error text-sm font-bold text-white">{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}
