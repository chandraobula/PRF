import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { importFinanceTransactions } from '../../services/financeApi';
import { parseAmount, parseCsv, parseDate } from '../../lib/csv';

// ---------------------------------------------------------------------------
// Bank / card statement CSV import.
//
// Parsing happens client-side so the user can map columns and preview the
// result before anything is written. Statements vary wildly between banks, so
// the mapping is explicit — we guess from the headers and let the user correct.
// ---------------------------------------------------------------------------

const FIELDS = [
  { key: 'date', label: 'Date', required: true, hints: ['date', 'transaction date', 'posted', 'posting date', 'value date'] },
  { key: 'description', label: 'Description', required: true, hints: ['description', 'merchant', 'payee', 'details', 'narration', 'particulars', 'name'] },
  { key: 'amount', label: 'Amount', required: true, hints: ['amount', 'value', 'transaction amount'] },
  { key: 'debit', label: 'Debit / withdrawal', required: false, hints: ['debit', 'withdrawal', 'money out', 'paid out', 'expense'] },
  { key: 'credit', label: 'Credit / deposit', required: false, hints: ['credit', 'deposit', 'money in', 'paid in', 'income'] },
  { key: 'category', label: 'Category', required: false, hints: ['category', 'type', 'classification'] },
];

function guessMapping(headers) {
  const mapping = {};
  const used = new Set();

  for (const field of FIELDS) {
    const index = headers.findIndex((header, i) => {
      if (used.has(i)) return false;
      const normalized = header.toLowerCase().trim();
      return field.hints.some((hint) => normalized === hint || normalized.includes(hint));
    });

    if (index >= 0) {
      mapping[field.key] = index;
      used.add(index);
    }
  }

  return mapping;
}

export default function ImportTransactions({ currency, onClose, onImported }) {
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;

    setError('');
    setResult(null);

    try {
      const text = await file.text();
      const parsed = parseCsv(text);

      if (parsed.length < 2) {
        setError('That file has no data rows.');
        return;
      }

      const [headerRow, ...dataRows] = parsed;
      setFileName(file.name);
      setHeaders(headerRow);
      setRows(dataRows);
      setMapping(guessMapping(headerRow));
    } catch {
      setError('Could not read that file. Make sure it is a plain CSV export.');
    }
  };

  // Turn mapped columns into transactions, keeping row numbers for error reporting.
  const prepared = useMemo(() => {
    if (!rows.length) return { valid: [], invalid: [] };

    const valid = [];
    const invalid = [];
    const hasSplitColumns = mapping.debit !== undefined || mapping.credit !== undefined;

    rows.forEach((row, index) => {
      const lineNumber = index + 2;
      const occurredOn = parseDate(row[mapping.date]);
      const merchant = (row[mapping.description] || '').trim();

      let amount = null;
      let type = 'expense';

      if (hasSplitColumns) {
        const debit = mapping.debit !== undefined ? parseAmount(row[mapping.debit]) : null;
        const credit = mapping.credit !== undefined ? parseAmount(row[mapping.credit]) : null;

        if (credit && credit.magnitude > 0) {
          amount = credit.magnitude;
          type = 'income';
        } else if (debit && debit.magnitude > 0) {
          amount = debit.magnitude;
          type = 'expense';
        }
      } else {
        const parsedAmount = parseAmount(row[mapping.amount]);
        if (parsedAmount && parsedAmount.magnitude > 0) {
          amount = parsedAmount.magnitude;
          // A negative amount in a single-column statement means money out.
          type = parsedAmount.isNegative ? 'expense' : 'income';
        }
      }

      if (!occurredOn) {
        invalid.push({ line: lineNumber, reason: 'Unrecognised date' });
        return;
      }
      if (!amount) {
        invalid.push({ line: lineNumber, reason: 'Missing or zero amount' });
        return;
      }

      valid.push({
        occurredOn,
        merchant: merchant || 'Imported transaction',
        amount,
        type,
        category: mapping.category !== undefined ? (row[mapping.category] || '').trim() || null : null,
      });
    });

    return { valid, invalid };
  }, [rows, mapping]);

  const missingRequired = FIELDS.filter((field) => {
    if (!field.required) return false;
    // Amount is satisfied by either a single column or a debit/credit pair.
    if (field.key === 'amount') {
      return mapping.amount === undefined && mapping.debit === undefined && mapping.credit === undefined;
    }
    return mapping[field.key] === undefined;
  });

  const runImport = async () => {
    setIsImporting(true);
    setError('');

    try {
      const response = await importFinanceTransactions({
        transactions: prepared.valid,
        currency,
        skipDuplicates,
      });
      setResult(response);
      onImported?.();
    } catch (importError) {
      setError(importError.message || 'Import failed.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Import transactions">
      <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />

      <section className="relative z-10 flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-[28px] bg-surface-card shadow-2xl sm:rounded-[24px]">
        <header className="flex items-center justify-between gap-4 border-b border-border-subtle p-5">
          <div>
            <h2 className="section-title">Import transactions</h2>
            <p className="mt-0.5 text-sm text-text-muted">Upload a CSV export from your bank or card</p>
          </div>
          <button type="button" onClick={onClose} className="icon-button bg-surface-container-low" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {result ? (
            <ImportSummary result={result} onClose={onClose} />
          ) : (
            <>
              <div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(event) => handleFile(event.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-subtle px-4 py-8 transition-colors hover:border-primary/40 hover:bg-surface-container-lowest"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container-low text-primary">
                    {fileName ? <FileSpreadsheet className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
                  </span>
                  <span className="text-sm font-bold text-on-surface">
                    {fileName || 'Choose a CSV file'}
                  </span>
                  <span className="text-xs text-text-muted">
                    {fileName ? `${rows.length} rows found — tap to pick another` : 'Most banks offer "Export as CSV" in statements'}
                  </span>
                </button>
              </div>

              {headers.length > 0 && (
                <>
                  <div>
                    <h3 className="mb-1 text-[13px] font-bold text-on-surface">Match your columns</h3>
                    <p className="mb-3 text-xs leading-5 text-text-muted">
                      We guessed from the header row. Use <strong>Amount</strong> for a single signed column, or map
                      <strong> Debit</strong> and <strong>Credit</strong> if your bank splits them.
                    </p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {FIELDS.map((field) => (
                        <label key={field.key} className="settings-field">
                          <span>
                            {field.label}
                            {field.required && <span className="ml-1 text-error">*</span>}
                          </span>
                          <select
                            className="w-full min-h-12 rounded-xl border border-outline-variant bg-surface-card px-3.5 text-[15px]"
                            value={mapping[field.key] ?? ''}
                            onChange={(event) => setMapping((current) => {
                              const next = { ...current };
                              if (event.target.value === '') delete next[field.key];
                              else next[field.key] = Number(event.target.value);
                              return next;
                            })}
                          >
                            <option value="">Not in this file</option>
                            {headers.map((header, index) => (
                              <option key={`${header}-${index}`} value={index}>
                                {header || `Column ${index + 1}`}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>

                  {missingRequired.length > 0 ? (
                    <Notice tone="warning">
                      Map {missingRequired.map((field) => field.label).join(', ')} to continue.
                    </Notice>
                  ) : (
                    <PreviewTable rows={prepared.valid} invalid={prepared.invalid} currency={currency} />
                  )}

                  <label className="flex items-start gap-3 rounded-xl border border-border-subtle p-3">
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={(event) => setSkipDuplicates(event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                    />
                    <span className="text-[13px] leading-5">
                      <span className="font-semibold text-on-surface">Skip duplicates</span>
                      <span className="block text-text-muted">
                        Ignore rows that match an existing transaction on date, amount and description. Leave this on when
                        re-importing an overlapping statement.
                      </span>
                    </span>
                  </label>
                </>
              )}

              {error && <Notice tone="error">{error}</Notice>}
            </>
          )}
        </div>

        {!result && (
          <footer className="flex gap-2 border-t border-border-subtle p-5">
            <button type="button" onClick={onClose} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">
              Cancel
            </button>
            <button
              type="button"
              onClick={runImport}
              disabled={isImporting || !prepared.valid.length || missingRequired.length > 0}
              className="min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white disabled:opacity-50"
            >
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import {prepared.valid.length || ''}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

function PreviewTable({ rows, invalid, currency }) {
  if (!rows.length) {
    return <Notice tone="warning">No usable rows with the current mapping — check the Date and Amount columns.</Notice>;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold text-on-surface">Preview</h3>
        <p className="text-xs text-text-muted">
          {rows.length} ready
          {invalid.length > 0 && <> · <span className="text-error">{invalid.length} will be skipped</span></>}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-subtle">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-surface-container-low text-on-surface-variant">
              <th className="p-2.5 text-left font-semibold">Date</th>
              <th className="p-2.5 text-left font-semibold">Description</th>
              <th className="p-2.5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.slice(0, 5).map((row, index) => (
              <tr key={index}>
                <td className="p-2.5 whitespace-nowrap tabular-nums text-text-muted">{row.occurredOn}</td>
                <td className="p-2.5 max-w-[220px] truncate font-medium text-on-surface">{row.merchant}</td>
                <td className={cn('p-2.5 text-right font-bold tabular-nums', row.type === 'income' ? 'text-success-proactive' : 'text-on-surface')}>
                  {row.type === 'income' ? '+' : '−'}
                  {new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(row.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 5 && (
        <p className="mt-2 text-xs text-text-muted">Showing the first 5 of {rows.length} rows.</p>
      )}

      {invalid.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-text-muted">
            Why {invalid.length} {invalid.length === 1 ? 'row was' : 'rows were'} skipped
          </summary>
          <ul className="mt-1.5 space-y-0.5 text-xs text-text-muted">
            {invalid.slice(0, 8).map((row) => (
              <li key={row.line}>Line {row.line}: {row.reason}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ImportSummary({ result, onClose }) {
  return (
    <div className="py-4 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-proactive/10 text-success-proactive">
        <CheckCircle2 className="h-7 w-7" />
      </div>
      <h3 className="font-display text-xl font-bold text-on-surface">
        Imported {result.imported} {result.imported === 1 ? 'transaction' : 'transactions'}
      </h3>
      <p className="mt-1 text-sm text-text-muted">
        {result.skipped > 0 && <>{result.skipped} duplicate{result.skipped === 1 ? '' : 's'} skipped. </>}
        {result.failed > 0 && <>{result.failed} row{result.failed === 1 ? '' : 's'} could not be read.</>}
        {!result.skipped && !result.failed && 'Your balances and analytics are up to date.'}
      </p>

      {result.errors?.length > 0 && (
        <ul className="mx-auto mt-4 max-w-sm space-y-1 rounded-xl border border-border-subtle p-3 text-left text-xs text-text-muted">
          {result.errors.slice(0, 8).map((row) => (
            <li key={row.row}>Line {row.row}: {row.message}</li>
          ))}
        </ul>
      )}

      <button type="button" onClick={onClose} className="mt-6 min-h-12 rounded-xl bg-primary px-6 text-sm font-bold text-white">
        Done
      </button>
    </div>
  );
}

function Notice({ tone, children }) {
  return (
    <div className={cn(
      'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-5',
      tone === 'error' ? 'border-error/25 bg-error/5 text-error' : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300',
    )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
