import { useMemo, useState } from 'react';
import {
  AlertCircle, CheckCircle2, Loader2, ShoppingCart, Trash2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Modal } from './BudgetsPanel';
import { formatMoney, addFinanceReceipt } from '../../services/financeApi';

export default function ReceiptItemsReview({
  items, currency, expenseCategories = [], merchant, onClose, onImported,
}) {
  const [rows, setRows] = useState(() => items.map((entry, index) => ({
    ...entry,
    key: `${index}`,
    included: true,
  })));
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const selected = rows.filter((row) => row.included);
  const totalMinor = useMemo(() => selected.reduce((sum, row) => sum + row.amountMinor, 0), [selected]);

  const toggle = (key) => setRows((current) => current.map((row) => (
    row.key === key ? { ...row, included: !row.included } : row
  )));

  const setCategory = (key, category) => setRows((current) => current.map((row) => (
    row.key === key ? { ...row, category } : row
  )));

  const toggleAll = (included) => setRows((current) => current.map((row) => ({ ...row, included })));

  const remove = (key) => setRows((current) => current.filter((row) => row.key !== key));

  const runImport = async () => {
    setIsImporting(true);
    setError('');

    try {
      const promises = selected.map((row) => addFinanceReceipt({
        occurredOn: row.occurredOn,
        merchant: row.merchant || merchant || 'Receipt',
        amount: row.amountMinor / 100,
        category: row.category,
        currency,
        paymentMethod: 'card',
        notes: row.description,
        tags: ['receipt-item'],
      }));

      await Promise.all(promises);
      setResult({ imported: selected.length });
      onImported?.();
    } catch (importError) {
      setError(importError.message || 'Could not add these items.');
    } finally {
      setIsImporting(false);
    }
  };

  if (result) {
    return (
      <Modal title="Items added" onClose={onClose} maxWidth="max-w-md">
        <div className="p-5 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-proactive/10 text-success-proactive">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h3 className="font-display text-xl font-bold text-on-surface">
            Added {result.imported} {result.imported === 1 ? 'item' : 'items'}
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            Each item is now its own entry. You can edit or delete any of them anytime.
          </p>
          <button type="button" onClick={onClose} className="mt-6 min-h-12 rounded-xl bg-primary px-6 text-sm font-bold text-white">
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`${items.length} items found`} onClose={onClose} maxWidth="max-w-3xl">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border-subtle p-5">
          <div className="flex items-start gap-3 rounded-xl border border-border-subtle p-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShoppingCart className="h-4 w-4" />
            </span>
            <div>
              <p className="font-semibold text-on-surface">Each item becomes its own entry</p>
              <p className="mt-0.5 text-sm text-text-muted">
                You can edit, delete, or categorize them individually after adding.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3">
          <div>
            <p className="text-[13px] text-text-muted">
              <strong className="text-on-surface">{selected.length}</strong> of {rows.length} selected
            </p>
            <p className="text-sm font-bold text-on-surface">{formatMoney(totalMinor, currency)}</p>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={() => toggleAll(true)} className="min-h-9 rounded-lg px-2.5 text-[12px] font-semibold text-text-muted hover:bg-surface-container-low hover:text-on-surface">
              Select all
            </button>
            <button type="button" onClick={() => toggleAll(false)} className="min-h-9 rounded-lg px-2.5 text-[12px] font-semibold text-text-muted hover:bg-surface-container-low hover:text-on-surface">
              Clear
            </button>
          </div>
        </div>

        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {rows.map((row) => (
            <li key={row.key} className={cn('flex items-start gap-3 px-5 py-3', !row.included && 'opacity-45')}>
              <input
                type="checkbox"
                checked={row.included}
                onChange={() => toggle(row.key)}
                className="mt-1 h-4 w-4 shrink-0 accent-primary"
                aria-label={`Include ${row.description}`}
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-on-surface">{row.description}</p>
                <p className="text-[12px] text-text-muted">{row.occurredOn}</p>

                <select
                  value={row.category || ''}
                  onChange={(event) => setCategory(row.key, event.target.value)}
                  className="mt-1.5 min-h-9 w-full max-w-[200px] rounded-lg border border-outline-variant bg-surface-card px-2 text-[12px]"
                  aria-label={`Category for ${row.description}`}
                >
                  <option value="">Select category</option>
                  {expenseCategories
                    .map((c) => c.name)
                    .map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <p className="text-[14px] font-bold tabular-nums text-on-surface">
                  {formatMoney(row.amountMinor, currency)}
                </p>
                <button
                  type="button"
                  onClick={() => remove(row.key)}
                  className="icon-button hover:text-error"
                  aria-label={`Remove ${row.description}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {rows.length === 0 && (
          <div className="p-8 text-center text-sm text-text-muted">
            All items removed. Close this dialog to cancel.
          </div>
        )}
      </div>

      <footer className="space-y-3 border-t border-border-subtle p-5">
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-error/25 bg-error/5 px-3.5 py-3 text-[13px] leading-5 text-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">
            Cancel
          </button>
          <button
            type="button"
            onClick={runImport}
            disabled={isImporting || selected.length === 0}
            className="min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white disabled:opacity-50"
          >
            {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            Add {selected.length} item{selected.length === 1 ? '' : 's'}
          </button>
        </div>
      </footer>
    </Modal>
  );
}
