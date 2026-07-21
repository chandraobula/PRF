import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  FileBarChart2,
  Flag,
  LayoutDashboard,
  Lightbulb,
  ListFilter,
  Loader2,
  PieChart,
  Plus,
  ReceiptText,
  Search,
  Target,
  WalletCards,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import BillScanner from '../components/Finance/BillScanner';
import InterestTracker from '../components/Finance/InterestTracker';
import {
  addFinanceTransaction,
  financeExportUrl,
  formatMoney,
  formatMoneyCompact,
  getFinanceDashboard,
  getFinanceTransactions,
} from '../services/financeApi';

const emptyForm = {
  type: 'expense',
  occurredOn: new Date().toISOString().slice(0, 10),
  merchant: '',
  amount: '',
  categoryId: '',
  paymentMethod: 'card',
  notes: '',
};

const MONTH_LABEL = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

const shiftMonth = (iso, delta) => {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(1);
  date.setMonth(date.getMonth() + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
};

export default function FinanceHub() {
  const [activeTab, setActiveTab] = useState('overview');
  const [finance, setFinance] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [apiError, setApiError] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [ledgerRows, setLedgerRows] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const loadFinance = useCallback(async () => {
    setIsLoading(true);
    setApiError('');

    try {
      const data = await getFinanceDashboard(selectedCurrency, asOf);
      setFinance(data);
    } catch (error) {
      setFinance(null);
      setApiError(error.message || 'Finance API is not available.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedCurrency, asOf]);

  useEffect(() => {
    loadFinance();
  }, [loadFinance]);

  // Build the ledger (running-balance table) for the selected month.
  useEffect(() => {
    if (activeTab !== 'transactions' || !finance?.summary) {
      return undefined;
    }

    let active = true;
    const run = async () => {
      setLedgerLoading(true);
      try {
        const tx = await getFinanceTransactions({
          currency: finance.summary.currency,
          startDate: finance.summary.monthStart,
          endDate: finance.summary.monthEnd,
          limit: 500,
        });
        // API returns newest-first. Balance after the newest row equals the current balance;
        // walk backwards removing each transaction's effect to get the balance after each older row.
        let balance = finance.summary.balanceMinor || 0;
        const rows = tx.map((transaction) => {
          const row = { ...transaction, balanceAfterMinor: balance };
          const effect = (transaction.type === 'income' || transaction.type === 'refund')
            ? transaction.amountMinor
            : -transaction.amountMinor;
          balance -= effect;
          return row;
        });
        if (active) setLedgerRows(rows);
      } catch {
        if (active) setLedgerRows([]);
      } finally {
        if (active) setLedgerLoading(false);
      }
    };
    run();
    return () => { active = false; };
  }, [activeTab, finance?.summary?.currency, finance?.summary?.monthStart, finance?.summary?.monthEnd, finance?.summary?.balanceMinor]);

  const currency = finance?.summary?.currency || selectedCurrency;
  const enabledCurrencies = finance?.profile?.enabledCurrencies || ['USD', 'INR'];
  const categories = finance?.categories || [];
  const categoriesForForm = categories.filter((category) => (
    form.type === 'income'
      ? category.type === 'income'
      : category.type === 'expense'
  ));
  // Ordered by how often each section is used day-to-day (most used first).
  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transactions', icon: ReceiptText },
    { id: 'scanner', label: 'Bills', icon: Camera },
    { id: 'budgets', label: 'Budgets', icon: PieChart },
    { id: 'goals', label: 'Goals', icon: Target },
    { id: 'liabilities', label: 'Loans', icon: CircleDollarSign },
    { id: 'reports', label: 'Reports', icon: FileBarChart2 },
  ];

  // The month navigator + income/expense summary only make sense for month-scoped views.
  const showPeriodStrip = activeTab === 'overview' || activeTab === 'transactions';

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.amount || !form.merchant) {
      return;
    }

    const category = categories.find((item) => item.id === form.categoryId);

    setIsSaving(true);
    setApiError('');

    try {
      await addFinanceTransaction({
        ...form,
        amount: Number(form.amount),
        currency,
        category: category?.name,
        source: 'manual',
      });
      setForm({
        ...emptyForm,
        occurredOn: new Date().toISOString().slice(0, 10),
        categoryId: '',
        type: form.type,
      });
      setQuickAddOpen(false);
      await loadFinance();
    } catch (error) {
      setApiError(error.message || 'Could not save transaction.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderContent = () => {
    if (isLoading || !finance) {
      if (apiError) {
        return <ApiErrorState message={apiError} />;
      }

      return <LoadingState />;
    }

    switch (activeTab) {
      case 'transactions':
        return (
          <LedgerPanel
            currency={currency}
            rows={ledgerRows}
            loading={ledgerLoading}
            query={query}
            setQuery={setQuery}
          />
        );
      case 'budgets':
        return <BudgetsPanel budgets={finance.budgets || []} currency={currency} />;
      case 'goals':
        return <GoalsPanel goals={finance.goals || []} habits={finance.habits || []} currency={currency} />;
      case 'reports':
        return <ReportsPanel finance={finance} currency={currency} />;
      case 'scanner':
        return (
          <BillScanner
            currency={currency}
            expenseCategories={categories.filter((category) => category.type === 'expense')}
          />
        );
      case 'liabilities':
        return <InterestTracker currency={currency} />;
      default:
        return <OverviewPanel finance={finance} currency={currency} />;
    }
  };

  return (
    <div className="finance-page space-y-5 max-w-container-max mx-auto pb-24 lg:pb-12">
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">Finance Hub</h1>
            <p className="hidden sm:block font-body text-on-surface-variant">Cash flow, goals, budgets, and coaching.</p>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-border-subtle bg-surface-container-low p-1">
            {enabledCurrencies.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSelectedCurrency(item)}
                className={cn(
                  'min-h-9 min-w-14 rounded-lg px-3 text-sm font-bold',
                  selectedCurrency === item ? 'bg-surface-card text-on-surface shadow-sm' : 'text-on-surface-variant',
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="finance-tabs -mx-4 px-4 sm:mx-0 sm:px-0 flex gap-1 overflow-x-auto border-b border-border-subtle" role="tablist" aria-label="Finance sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`finance-panel-${tab.id}`}
              className={cn(
                'relative min-h-11 shrink-0 flex items-center gap-1.5 px-3 pb-2.5 pt-1 text-sm font-semibold transition-colors',
                activeTab === tab.id ? 'text-on-surface' : 'text-text-muted hover:text-on-surface',
              )}
            >
              <tab.icon className={cn('w-4 h-4 shrink-0', activeTab === tab.id ? 'text-secondary' : 'text-text-muted')} />
              <span>{tab.label}</span>
              {activeTab === tab.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-secondary" />}
            </button>
          ))}
        </div>

        {showPeriodStrip && (
          <div className="app-card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-subtle">
              <button type="button" onClick={() => setAsOf((prev) => shiftMonth(prev, -1))} className="icon-button" aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></button>
              <p className="font-display text-base font-bold text-on-surface">{MONTH_LABEL.format(new Date(`${asOf}T00:00:00`))}</p>
              <button type="button" onClick={() => setAsOf((prev) => shiftMonth(prev, 1))} className="icon-button" aria-label="Next month"><ChevronRight className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border-subtle">
              <SummaryStat label="Income" value={formatMoney(finance?.summary?.incomeMinor || 0, currency)} tone="text-secondary" />
              <SummaryStat label="Expenses" value={formatMoney(finance?.summary?.expenseMinor || 0, currency)} tone="text-error" />
              <SummaryStat label="Net" value={formatMoney(finance?.summary?.netCashflowMinor || 0, currency)} tone={(finance?.summary?.netCashflowMinor || 0) < 0 ? 'text-error' : 'text-on-surface'} />
            </div>
          </div>
        )}
      </section>

      <div className="min-h-[500px]" id={`finance-panel-${activeTab}`} role="tabpanel">
        {apiError && finance && (
          <div className="mb-4 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm font-semibold text-error">
            {apiError}
          </div>
        )}
        {renderContent()}
      </div>

      <button
        type="button"
        onClick={() => setQuickAddOpen(true)}
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-white shadow-[0_10px_30px_rgba(0,88,190,0.4)] active:scale-95 transition-transform lg:bottom-8 lg:right-8"
        aria-label="Add transaction"
      >
        <Plus className="h-6 w-6" />
      </button>

      {quickAddOpen && (
        <QuickAddModal
          form={form}
          categoriesForForm={categoriesForForm}
          isSaving={isSaving}
          onFormChange={setForm}
          onSubmit={handleSubmit}
          onClose={() => setQuickAddOpen(false)}
        />
      )}
    </div>
  );
}

function SummaryStat({ label, value, tone }) {
  return (
    <div className="px-3 py-3 text-center">
      <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{label}</p>
      <p className={cn('mt-1 font-display text-base sm:text-lg font-bold tabular-nums', tone)}>{value}</p>
    </div>
  );
}

function QuickAddModal({ form, categoriesForForm, isSaving, onFormChange, onSubmit, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Add transaction">
      <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <section className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface-card shadow-2xl sm:rounded-[24px]">
        <header className="flex items-center justify-between gap-4 border-b border-border-subtle p-5">
          <h2 className="section-title">Add transaction</h2>
          <button type="button" onClick={onClose} className="icon-button bg-surface-container-low" aria-label="Close"><X className="h-5 w-5" /></button>
        </header>
        <form className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" onSubmit={onSubmit}>
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-container-low p-1">
            {['expense', 'income', 'refund'].map((type) => (
              <button key={type} type="button" onClick={() => onFormChange({ ...form, type, categoryId: '' })} className={cn('min-h-10 rounded-lg text-xs font-bold capitalize', form.type === type ? 'bg-surface-card shadow-sm text-on-surface' : 'text-on-surface-variant')}>{type}</button>
            ))}
          </div>
          <label className="settings-field"><span>Merchant or source</span><input value={form.merchant} onChange={(event) => onFormChange({ ...form, merchant: event.target.value })} placeholder="Whole Foods, salary" autoFocus /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="settings-field"><span>Amount</span><input inputMode="decimal" min="0" step="0.01" type="number" value={form.amount} onChange={(event) => onFormChange({ ...form, amount: event.target.value })} placeholder="0.00" /></label>
            <label className="settings-field"><span>Date</span><input type="date" value={form.occurredOn} onChange={(event) => onFormChange({ ...form, occurredOn: event.target.value })} /></label>
          </div>
          <label className="settings-field">
            <span>Category</span>
            <select className="w-full min-h-12 px-3.5 rounded-xl border border-outline-variant bg-surface-card text-[15px]" value={form.categoryId} onChange={(event) => onFormChange({ ...form, categoryId: event.target.value })}>
              <option value="">Uncategorized</option>
              {categoriesForForm.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="settings-field"><span>Notes</span><input value={form.notes} onChange={(event) => onFormChange({ ...form, notes: event.target.value })} placeholder="Optional" /></label>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
            <button type="submit" disabled={isSaving} className="min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-60">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Save
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ApiErrorState({ message }) {
  const shouldSignIn = message.toLowerCase().includes('sign in') || message.toLowerCase().includes('authentication');

  return (
    <div className="min-h-[420px] app-card flex items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-error/10 text-error flex items-center justify-center">
          <ReceiptText className="w-6 h-6" />
        </div>
        <h2 className="font-display text-2xl font-bold text-on-surface">Finance API is not connected</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">{message}</p>
        {shouldSignIn && (
          <Link to="/auth" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white">
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}

function OverviewPanel({ finance, currency }) {
  const { summary } = finance;
  const primaryInsight = finance.insights?.[0];
  const topGoal = finance.goals?.[0];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="grid grid-cols-1 gap-gutter md:grid-cols-4">
        <MetricCard
          icon={WalletCards}
          label="Total balance"
          value={formatMoney(summary.balanceMinor, currency)}
          caption={`${summary.savingsRate}% savings rate`}
          tone="blue"
        />
        <MetricCard
          icon={ArrowUpRight}
          label="Monthly income"
          value={formatMoney(summary.incomeMinor, currency)}
          caption={`${formatMoneyCompact(summary.previousIncomeMinor, currency)} last month`}
          tone="green"
        />
        <MetricCard
          icon={ReceiptText}
          label="Monthly spend"
          value={formatMoney(summary.expenseMinor, currency)}
          caption={`${summary.transactionCount} tracked items`}
          tone="amber"
        />
        <MetricCard
          icon={PieChart}
          label="Budget used"
          value={`${summary.budgetUsagePercent}%`}
          caption={`${formatMoney(summary.netCashflowMinor, currency)} net cash flow`}
          tone="violet"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="app-card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="section-title">Spending trend</h2>
              <p className="text-sm text-text-muted">Top categories this month</p>
            </div>
            <ListFilter className="h-5 w-5 text-text-muted" />
          </div>
          <div className="space-y-4">
            {(finance.categorySpend || []).map((category) => (
              <ProgressRow
                key={category.id}
                label={category.name}
                value={formatMoney(category.amountMinor, currency)}
                percent={(category.amountMinor / Math.max(summary.expenseMinor, 1)) * 100}
                color={category.color}
              />
            ))}
          </div>
        </div>

        <div className="ai-card p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-10 h-10 rounded-xl bg-surface-card shadow-sm flex items-center justify-center text-violet-500 dark:text-violet-300">
              <Lightbulb className="w-5 h-5" />
            </span>
            <div>
              <p className="font-bold">{primaryInsight?.title || 'Finance coach'}</p>
              <p className="text-xs text-text-muted">Decision support</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-on-surface-variant">{primaryInsight?.body}</p>
          {topGoal && (
            <div className="mt-5 pt-4 border-t border-violet-200/70">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">{topGoal.name}</span>
                <span className="font-bold">{topGoal.progressPercent}%</span>
              </div>
              <ProgressBar percent={topGoal.progressPercent} className="mt-2 bg-violet-600" />
              <p className="mt-3 text-xs leading-5 text-text-muted">{topGoal.recommendation}</p>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <BudgetsPanel budgets={(finance.budgets || []).slice(0, 3)} currency={currency} compact />
        <RecentTransactions transactions={(finance.recentTransactions || []).slice(0, 5)} currency={currency} />
      </section>
    </div>
  );
}

function LedgerPanel({ currency, rows, loading, query, setQuery }) {
  const search = query.trim().toLowerCase();
  const filtered = search
    ? rows.filter((row) => [row.merchant, row.payee, row.categoryName, row.notes, ...(row.tags || [])]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(search)))
    : rows;
  const isCredit = (type) => type === 'income' || type === 'refund';

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="app-card overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-border-subtle">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="section-title">Ledger</h2>
              <p className="text-sm text-text-muted">Every transaction with a running balance. Tap + to add.</p>
            </div>
            <a
              className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface-card px-4 text-sm font-bold hover:bg-surface-container-low"
              href={financeExportUrl(currency)}
            >
              <Download className="h-4 w-4" />
              CSV
            </a>
          </div>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              className="w-full min-h-12 rounded-xl border border-outline-variant bg-surface-card pl-10 pr-3 text-[15px]"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search ledger"
            />
          </div>
        </div>

        {/* Desktop: bank-style ledger table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant border-b border-border-subtle">
                <th className="p-3 pl-6 text-left font-semibold">Date</th>
                <th className="p-3 text-left font-semibold">Description</th>
                <th className="p-3 text-left font-semibold">Category</th>
                <th className="p-3 text-right font-semibold">Money in</th>
                <th className="p-3 text-right font-semibold">Money out</th>
                <th className="p-3 pr-6 text-right font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-surface-container-lowest">
                  <td className="p-3 pl-6 whitespace-nowrap tabular-nums text-text-muted">{row.occurredOn}</td>
                  <td className="p-3 font-semibold text-on-surface">{row.merchant || row.payee || 'Transaction'}</td>
                  <td className="p-3 text-text-muted">{row.categoryName || 'Uncategorized'}</td>
                  <td className="p-3 text-right tabular-nums font-semibold text-success-proactive">{isCredit(row.type) ? formatMoney(row.amountMinor, row.currency || currency) : ''}</td>
                  <td className="p-3 text-right tabular-nums font-semibold text-error">{isCredit(row.type) ? '' : formatMoney(row.amountMinor, row.currency || currency)}</td>
                  <td className="p-3 pr-6 text-right tabular-nums font-bold text-on-surface">{formatMoney(row.balanceAfterMinor, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: ledger rows */}
        <div className="md:hidden divide-y divide-border-subtle">
          {filtered.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-on-surface truncate">{row.merchant || row.payee || 'Transaction'}</p>
                <p className="text-xs text-text-muted">{row.occurredOn} · {row.categoryName || 'Uncategorized'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={cn('text-sm font-bold tabular-nums', isCredit(row.type) ? 'text-success-proactive' : 'text-error')}>
                  {isCredit(row.type) ? '+' : '-'}{formatMoney(row.amountMinor, row.currency || currency)}
                </p>
                <p className="text-xs text-text-muted tabular-nums">Bal {formatMoney(row.balanceAfterMinor, currency)}</p>
              </div>
            </div>
          ))}
        </div>

        {loading && <div className="p-8 text-center text-sm text-text-muted">Loading ledger...</div>}
        {!loading && filtered.length === 0 && <div className="p-8 text-center text-sm text-text-muted">No transactions this month. Tap + to add one.</div>}
      </section>
    </div>
  );
}

function BudgetsPanel({ budgets, currency, compact = false }) {
  return (
    <section className={cn('app-card p-5 sm:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500', compact ? '' : 'space-y-5')}>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="section-title">Budgets</h2>
          <p className="text-sm text-text-muted">Monthly, flexible, and carry-forward limits</p>
        </div>
        <PieChart className="h-5 w-5 text-text-muted" />
      </div>
      <div className={cn('grid gap-4', compact ? 'grid-cols-1' : 'lg:grid-cols-2')}>
        {budgets.map((budget) => (
          <article key={budget.id} className="rounded-xl border border-border-subtle p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bold text-on-surface">{budget.name}</h3>
                <p className="text-sm text-text-muted">{budget.categoryName} - {budget.period}</p>
              </div>
              <span className={cn(
                'rounded-full px-2.5 py-1 text-xs font-bold',
                budget.usagePercent >= budget.alertThresholdPercent
                  ? 'bg-error/10 text-error'
                  : 'bg-success-proactive/10 text-success-proactive',
              )}
              >
                {budget.usagePercent}%
              </span>
            </div>
            <ProgressBar percent={budget.usagePercent} className="mt-4" color={budget.categoryColor} />
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <MiniStat label="Spent" value={formatMoneyCompact(budget.spentMinor, currency)} />
              <MiniStat label="Left" value={formatMoneyCompact(budget.remainingMinor, currency)} />
              <MiniStat label="Limit" value={formatMoneyCompact(budget.limitMinor, currency)} />
            </div>
            {budget.isFlexible && (
              <p className="mt-3 text-xs leading-5 text-text-muted">Flexible budget with {formatMoneyCompact(budget.carryForwardMinor, currency)} carry-forward.</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function GoalsPanel({ goals, habits, currency }) {
  return (
    <div className="grid gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 lg:grid-cols-[1fr_360px]">
      <section className="app-card p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="section-title">Goals</h2>
            <p className="text-sm text-text-muted">Target dates, progress, and coaching nudges</p>
          </div>
          <Target className="h-5 w-5 text-text-muted" />
        </div>
        <div className="space-y-4">
          {goals.map((goal) => (
            <article key={goal.id} className="rounded-xl border border-border-subtle p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-bold text-on-surface">{goal.name}</h3>
                  <p className="text-sm text-text-muted">Target {formatMoney(goal.targetAmountMinor, goal.currency || currency)} by {goal.targetDate || 'no date'}</p>
                </div>
                <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-600 dark:text-blue-300">{goal.progressPercent}%</span>
              </div>
              <ProgressBar percent={goal.progressPercent} className="mt-4 bg-secondary" />
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-on-surface">
                  {formatMoney(goal.savedAmountMinor, goal.currency || currency)} saved
                </p>
                <p className="text-sm text-text-muted">{goal.recommendation}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="app-card p-5 sm:p-6 h-fit">
        <div className="mb-5 flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
            <Flag className="w-5 h-5" />
          </span>
          <div>
            <h2 className="section-title">Habits</h2>
            <p className="text-sm text-text-muted">Streaks that keep finance calm</p>
          </div>
        </div>
        <div className="space-y-3">
          {habits.map((habit) => (
            <div key={habit.id} className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-3">
              <div>
                <p className="text-sm font-bold">{habit.name}</p>
                <p className="text-xs text-text-muted">{habit.cadence} - best {habit.bestStreak}</p>
              </div>
              <span className="rounded-full bg-success-proactive/10 px-2.5 py-1 text-xs font-bold text-success-proactive">
                {habit.currentStreak} streak
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReportsPanel({ finance, currency }) {
  const { summary } = finance;
  const notifications = finance.notifications || [];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          icon={CalendarDays}
          label="Monthly cash flow"
          value={formatMoney(summary.netCashflowMinor, currency)}
          caption={`${summary.monthStart} to ${summary.monthEnd}`}
          tone="green"
        />
        <MetricCard
          icon={ReceiptText}
          label="Expenses"
          value={formatMoney(summary.expenseMinor, currency)}
          caption={`${summary.transactionCount} total records`}
          tone="amber"
        />
        <MetricCard
          icon={Target}
          label="Savings rate"
          value={`${summary.savingsRate}%`}
          caption="Income minus expenses"
          tone="blue"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="app-card p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="section-title">Report exports</h2>
              <p className="text-sm text-text-muted">Monthly summaries, category reports, budget reports, and savings reports</p>
            </div>
            <a
              className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white"
              href={financeExportUrl(currency)}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </div>
          <div className="space-y-4">
            {(finance.categorySpend || []).map((category) => (
              <ProgressRow
                key={category.id}
                label={category.name}
                value={formatMoney(category.amountMinor, currency)}
                percent={(category.amountMinor / Math.max(summary.expenseMinor, 1)) * 100}
                color={category.color}
              />
            ))}
          </div>
        </div>

        <div className="app-card p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300 flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </span>
            <div>
              <h2 className="section-title">Reminders</h2>
              <p className="text-sm text-text-muted">Budget, review, and recurring alerts</p>
            </div>
          </div>
          <div className="space-y-3">
            {notifications.map((notification) => (
              <article key={notification.id} className="rounded-xl bg-surface-container-lowest p-3">
                <p className="text-sm font-bold">{notification.title}</p>
                <p className="mt-1 text-xs leading-5 text-text-muted">{notification.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function RecentTransactions({ transactions, currency, roomy = false }) {
  return (
    <div className={cn(roomy ? 'divide-y divide-border-subtle' : 'space-y-3')}>
      {transactions.map((transaction) => (
        <article key={transaction.id} className={cn(
          'flex items-center gap-3',
          roomy ? 'px-5 py-4 sm:px-6' : 'rounded-xl border border-border-subtle p-3',
        )}
        >
          <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center shrink-0">
            <ReceiptText className="w-5 h-5 text-text-muted" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-on-surface truncate">{transaction.merchant || transaction.payee || 'Transaction'}</p>
            <p className="text-xs text-text-muted truncate">{transaction.occurredOn} - {transaction.categoryName || 'Uncategorized'}</p>
          </div>
          <div className="text-right">
            <p className={cn(
              'text-sm font-bold',
              transaction.type === 'income' || transaction.type === 'refund'
                ? 'text-success-proactive'
                : 'text-on-surface',
            )}
            >
              {transaction.type === 'income' || transaction.type === 'refund' ? '+' : '-'}
              {formatMoney(transaction.amountMinor, transaction.currency || currency)}
            </p>
            <p className="text-xs capitalize text-text-muted">{transaction.source || 'manual'}</p>
          </div>
        </article>
      ))}
      {transactions.length === 0 && (
        <div className="p-6 text-center text-sm text-text-muted">No transactions match this search.</div>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, caption, tone }) {
  const toneClasses = {
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
    green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
  };

  return (
    <article className="metric-card">
      <div className={cn('metric-icon', toneClasses[tone] || toneClasses.blue)}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-caption text-text-muted">{caption}</p>
    </article>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-on-surface">{value}</p>
    </div>
  );
}

function ProgressRow({ label, value, percent, color }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className="font-semibold text-on-surface">{label}</span>
        <span className="font-bold text-on-surface">{value}</span>
      </div>
      <ProgressBar percent={percent} color={color} />
    </div>
  );
}

function ProgressBar({ percent, color, className }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-surface-container">
      <div
        className={cn('h-full rounded-full transition-all duration-700', className)}
        style={{
          width: `${Math.min(100, Math.max(0, percent))}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="min-h-[420px] app-card flex items-center justify-center">
      <div className="flex items-center gap-3 text-text-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm font-semibold">Loading finance workspace</span>
      </div>
    </div>
  );
}
