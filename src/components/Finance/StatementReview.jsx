import { useMemo, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, CheckCircle2, Loader2, Upload,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Modal } from './BudgetsPanel';
import { formatMoney, importFinanceTransactions } from '../../services/financeApi';

const MISC_INCOME = 'Miscellaneous income';

/**
 * Review screen for a scanned payment-app / bank statement.
 *
 * Every row stays a separate entry — who was paid, when, and how much — instead
 * of being rolled into one total. Credits are kept apart from debits and are
 * filed under "Miscellaneous income" so they never inflate salary or freelance
 * earnings, which is the number the user actually cares about.
 */
export default function StatementReview({
  transactions, currency, expenseCategories = [], onClose, onImported,
}) {
  const [rows, setRows] = useState(() => transactions.map((entry, index) => ({
    ...entry,
    key: `${entry.occurredOn}-${index}`,
    included: true,
  })));
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const selected = rows.filter((row) => row.included);

  const totals = useMemo(() => {
    const credits = selected.filter((row) => row.direction === 'credit');
    const debits = selected.filter((row) => row.direction === 'debit');
    return {
      creditMinor: credits.reduce((sum, row) => sum + row.amountMinor, 0),
      debitMinor: debits.reduce((sum, row) => sum + row.amountMinor, 0),
      creditCount: credits.length,
      debitCount: debits.length,
    };
  }, [selected]);

  const toggle = (key) => setRows((current) => current.map((row) => (
    row.key === key ? { ...row, included: !row.included } : row
  )));

  const setCategory = (key, category) => setRows((current) => current.map((row) => (
    row.key === key ? { ...row, category } : row
  )));

  const toggleAll = (included) => setRows((current) => current.map((row) => ({ ...row, included })));

  const runImport = async () => {
    setIsImporting(true);
    setError('');

    try {
      const response = await importFinanceTransactions({
        currency,
        skipDuplicates: true,
        transactions: selected.map((row) => ({
          occurredOn: row.occurredOn,
          merchant: row.description,
          amountMinor: row.amountMinor,
          type: row.direction === 'credit' ? 'income' : 'expense',
          category: row.category,
          notes: 'Imported from statement',
        })),
      });
      setResult(response);
      onImported?.();
    } catch (importError) {
      setError(importError.message || 'Could not import these transactions.');
    } finally {
      setIsImporting(false);
    }
  };

  if (result) {
    return (
      <Modal title="Statement imported" onClose={onClose} maxWidth="max-w-md">
        <div className="p-5 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-proactive/10 text-success-proactive">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h3 className="font-display text-xl font-bold text-on-surface">
            Added {result.imported} {result.imported === 1 ? 'transaction' : 'transactions'}
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            {result.skipped > 0 && <>{result.skipped} already existed and {result.skipped === 1 ? 'was' : 'were'} skipped. </>}
            {result.failed > 0 && <>{result.failed} could not be read. </>}
            Each payment is its own entry in your ledger.
          </p>
          <button type="button" onClick={onClose} className="mt-6 min-h-12 rounded-xl bg-primary px-6 text-sm font-bold text-white">
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`${transactions.length} transactions found`} onClose={onClose} maxWidth="max-w-3xl">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Money in and money out are summarised separately — never netted. */}
        <div className="grid grid-cols-2 gap-3 border-b border-border-subtle p-5">
          <div className="rounded-xl border border-border-subtle p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <ArrowUpRight className="h-3.5 w-3.5" /> Money out
            </div>
            <p className="mt-1 font-display text-lg font-bold tabular-nums text-on-surface">
              {formatMoney(totals.debitMinor, currency)}
            </p>
            <p className="text-[11px] text-text-muted">
              {totals.debitCount} {totals.debitCount === 1 ? 'payment' : 'payments'} → expenses
            </p>
          </div>
          <div className="rounded-xl border border-border-subtle p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              <ArrowDownLeft className="h-3.5 w-3.5" /> Money in
            </div>
            <p className="mt-1 font-display text-lg font-bold tabular-nums text-success-proactive">
              {formatMoney(totals.creditMinor, currency)}
            </p>
            <p className="text-[11px] text-text-muted">
              {totals.creditCount} {totals.creditCount === 1 ? 'credit' : 'credits'} → {MISC_INCOME}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <p className="text-[13px] text-text-muted">
            <strong className="text-on-surface">{selected.length}</strong> of {rows.length} selected
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

        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {rows.map((row) => {
            const isCredit = row.direction === 'credit';

            return (
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

                  {isCredit ? (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-success-proactive/10 px-2 py-0.5 text-[11px] font-semibold text-success-proactive">
                      <ArrowDownLeft className="h-3 w-3" /> {MISC_INCOME}
                    </span>
                  ) : (
                    <select
                      value={row.category}
                      onChange={(event) => setCategory(row.key, event.target.value)}
                      className="mt-1.5 min-h-9 w-full max-w-[200px] rounded-lg border border-outline-variant bg-surface-card px-2 text-[12px]"
                      aria-label={`Category for ${row.description}`}
                    >
                      {[...new Set([row.category, ...expenseCategories.map((c) => c.name)])]
                        .filter(Boolean)
                        .map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  )}
                </div>

                <p className={cn(
                  'shrink-0 text-[14px] font-bold tabular-nums',
                  isCredit ? 'text-success-proactive' : 'text-on-surface',
                )}
                >
                  {isCredit ? '+' : '−'}{formatMoney(row.amountMinor, currency)}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="space-y-3 border-t border-border-subtle p-5">
        {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}
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
            {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Add {selected.length} to ledger
          </button>
        </div>
      </footer>
    </Modal>
  );
}
