import { useMemo, useState } from 'react';
import {
  AlertCircle, CheckCircle2, Loader2, ShoppingCart, Trash2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Modal } from './BudgetsPanel';
import { formatMoney, addFinanceReceipt, addFinanceTransaction } from '../../services/financeApi';

export default function ReceiptItemsReview({
  items, currency, expenseCategories = [], merchant, billTotalMinor = 0, onClose, onImported,
}) {
  const [rows, setRows] = useState(() => items.map((entry, index) => ({
    ...entry,
    key: `${index}`,
    // Kept as text while editing so typing "12.50" doesn't lose the decimal
    // point on the keystroke where the value is still incomplete.
    amountText: String((entry.amountMinor || 0) / 100),
    // Everything the scan managed to price starts included, so the figures add
    // up to the bill. A line it couldn't price (0.00) starts out excluded.
    included: entry.amountMinor !== 0,
  })));
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const selected = rows.filter((row) => row.included);
  const totalMinor = useMemo(() => selected.reduce((sum, row) => sum + row.amountMinor, 0), [selected]);
  const lineSumMinor = useMemo(() => rows.reduce((sum, row) => sum + row.amountMinor, 0), [rows]);
  // Where the picked lines land against the bill's own printed total, so it is
  // obvious what is being left out (or that the scan misread a line).
  const excludedMinor = billTotalMinor > 0 ? billTotalMinor - totalMinor : lineSumMinor - totalMinor;
  // If *every* line together still doesn't match the printed total, the scan
  // itself is off — a line was missed, misread or duplicated. Worth flagging,
  // because a fallback model can be less accurate than the primary one.
  const scanGapMinor = billTotalMinor > 0 ? lineSumMinor - billTotalMinor : 0;
  const scanLooksOff = billTotalMinor > 0 && Math.abs(scanGapMinor) > Math.max(100, Math.round(billTotalMinor * 0.01));

  const toggle = (key) => setRows((current) => current.map((row) => (
    row.key === key ? { ...row, included: !row.included } : row
  )));

  const setCategory = (key, category) => setRows((current) => current.map((row) => (
    row.key === key ? { ...row, category } : row
  )));

  const setAmount = (key, value) => setRows((current) => current.map((row) => {
    if (row.key !== key) return row;
    const parsed = Number(value);
    return {
      ...row,
      amountText: value,
      amountMinor: value.trim() && Number.isFinite(parsed) ? Math.round(parsed * 100) : 0,
    };
  }));

  const toggleAll = (included) => setRows((current) => current.map((row) => ({ ...row, included })));

  const remove = (key) => setRows((current) => current.filter((row) => row.key !== key));

  const runImport = async () => {
    setIsImporting(true);
    setError('');

    const failures = [];
    let imported = 0;

    // One at a time so a line the API rejects is named precisely, and the rest
    // still get added instead of the whole batch failing opaquely.
    for (const row of selected) {
      const store = row.merchant || merchant || 'Receipt';
      const shared = {
        occurredOn: row.occurredOn,
        // The line itself is the description shown in the ledger; the store is
        // kept as the payee so a bill doesn't become 14 identical-looking rows.
        merchant: row.description,
        payee: store,
        category: row.category,
        currency,
        notes: `From ${store} bill`,
        tags: ['receipt-item'],
      };

      try {
        if (row.amountMinor < 0) {
          // A discount or savings line is money coming back, not money spent.
          await addFinanceTransaction({
            ...shared,
            type: 'refund',
            amount: Math.abs(row.amountMinor) / 100,
            source: 'receipt',
          });
        } else {
          await addFinanceReceipt({ ...shared, amount: row.amountMinor / 100, paymentMethod: 'card' });
        }
        imported += 1;
      } catch (importError) {
        failures.push(`${row.description}: ${importError.message}`);
      }
    }

    setIsImporting(false);

    if (imported === 0) {
      setError(failures[0] || 'Could not add these lines.');
      return;
    }

    setResult({ imported, failures });
  };

  // Refreshing the parent remounts this panel, which would rip the confirmation
  // (and any list of lines that failed) off the screen before it could be read.
  // So the reload waits until the dialog is actually being dismissed.
  const dismiss = () => {
    if (result?.imported) {
      onImported?.();
    }
    onClose();
  };

  if (result) {
    return (
      <Modal title="Added to your expenses" onClose={dismiss} maxWidth="max-w-md">
        <div className="p-5 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-proactive/10 text-success-proactive">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h3 className="font-display text-xl font-bold text-on-surface">
            Added {result.imported} {result.imported === 1 ? 'line' : 'lines'}
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            Each one is now its own expense. You can edit or delete any of them anytime.
          </p>
          {result.failures?.length > 0 && (
            <div className="mt-4 rounded-xl border border-warning-maintenance/30 bg-warning-maintenance/10 p-3 text-left text-[13px] leading-5 text-on-surface">
              <p className="font-bold">{result.failures.length} could not be added:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-text-muted">
                {result.failures.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>
          )}
          <button type="button" onClick={dismiss} className="mt-6 min-h-12 rounded-xl bg-primary px-6 text-sm font-bold text-white">
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={merchant ? `${merchant} — ${items.length} lines` : `${items.length} lines found`}
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border-subtle p-5">
          <div className="flex items-start gap-3 rounded-xl border border-border-subtle p-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShoppingCart className="h-4 w-4" />
            </span>
            <div>
              <p className="font-semibold text-on-surface">Choose what counts as an expense</p>
              <p className="mt-0.5 text-sm text-text-muted">
                Every line from the bill is listed below. Untick anything you don't want recorded, fix an
                amount the scan misread, and each remaining line is added as its own expense.
              </p>
            </div>
          </div>
        </div>

        <div className="border-b border-border-subtle px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] text-text-muted">
              <strong className="text-on-surface">{selected.length}</strong> of {rows.length} lines selected
            </p>
            <div className="flex gap-1">
              <button type="button" onClick={() => toggleAll(true)} className="min-h-9 rounded-lg px-2.5 text-[12px] font-semibold text-text-muted hover:bg-surface-container-low hover:text-on-surface">
                Select all
              </button>
              <button type="button" onClick={() => toggleAll(false)} className="min-h-9 rounded-lg px-2.5 text-[12px] font-semibold text-text-muted hover:bg-surface-container-low hover:text-on-surface">
                Clear
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3 rounded-xl bg-surface-container-lowest px-3.5 py-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Adding</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-on-surface">{formatMoney(totalMinor, currency)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Not included</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-text-muted">{formatMoney(excludedMinor, currency)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                {billTotalMinor > 0 ? 'Bill total' : 'All lines'}
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-on-surface">
                {formatMoney(billTotalMinor > 0 ? billTotalMinor : lineSumMinor, currency)}
              </p>
            </div>
          </div>
        </div>

        {scanLooksOff && (
          <div className="flex items-start gap-2.5 border-b border-border-subtle bg-warning-maintenance/10 px-5 py-3 text-[13px] leading-5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-maintenance" />
            <span className="text-on-surface">
              These lines add up to <strong>{formatMoney(lineSumMinor, currency)}</strong>, but the bill says{' '}
              <strong>{formatMoney(billTotalMinor, currency)}</strong>. The scan may have missed or misread a
              line — worth checking the amounts below before adding them.
            </span>
          </div>
        )}

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
                {/* Editable, because a misread price should be fixable here
                    rather than forcing the line to be deleted and re-added. */}
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={row.amountText}
                  onChange={(event) => setAmount(row.key, event.target.value)}
                  className="min-h-9 w-28 rounded-lg border border-outline-variant bg-surface-card px-2 text-right text-[14px] font-bold tabular-nums text-on-surface"
                  aria-label={`Amount for ${row.description}`}
                />
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
            Add {selected.length} line{selected.length === 1 ? '' : 's'}
          </button>
        </div>
      </footer>
    </Modal>
  );
}
