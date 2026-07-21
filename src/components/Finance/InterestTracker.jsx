import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CreditCard, Loader2, Plus, Save, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  addFinanceLiability,
  deleteFinanceLiability,
  formatMoney,
  getFinanceLiabilities,
  recordFinanceLiabilityPayment,
  updateFinanceLiability,
} from '../../services/financeApi';

const emptyLoan = {
  name: '',
  provider: '',
  liabilityType: 'loan',
  originalAmount: '',
  paidAmount: '0',
  aprPercent: '',
  monthlyPayment: '',
  nextPaymentOn: '',
};

export default function InterestTracker({ currency = 'USD' }) {
  const [liabilities, setLiabilities] = useState([]);
  const [form, setForm] = useState(emptyLoan);
  const [editingId, setEditingId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const loadLiabilities = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const data = await getFinanceLiabilities(currency);
      setLiabilities(data.liabilities || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, [currency]);

  useEffect(() => {
    loadLiabilities();
  }, [loadLiabilities]);

  const totalDebtMinor = liabilities.reduce((sum, item) => sum + item.remainingAmountMinor, 0);
  const totalMonthlyMinor = liabilities.reduce((sum, item) => sum + item.monthlyPaymentMinor, 0);
  const weightedApr = liabilities.reduce((sum, item) => sum + (item.remainingAmountMinor * item.aprPercent), 0);
  const avgApr = totalDebtMinor > 0 ? weightedApr / totalDebtMinor : 0;

  const resetForm = () => {
    setForm(emptyLoan);
    setEditingId('');
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!form.name || !form.originalAmount) {
      setError('Loan name and original amount are required.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const payload = {
        ...form,
        currency,
        originalAmount: Number(form.originalAmount),
        paidAmount: Number(form.paidAmount || 0),
        monthlyPayment: Number(form.monthlyPayment || 0),
        aprPercent: Number(form.aprPercent || 0),
      };

      if (editingId) {
        await updateFinanceLiability(editingId, payload);
      } else {
        await addFinanceLiability(payload);
      }

      resetForm();
      setFormOpen(false);
      await loadLiabilities();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const openAdd = () => {
    resetForm();
    setError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    resetForm();
    setError('');
  };

  const editLoan = (loan) => {
    setEditingId(loan.id);
    setForm({
      name: loan.name || '',
      provider: loan.provider || '',
      liabilityType: loan.liabilityType || 'loan',
      originalAmount: String(loan.originalAmountMinor / 100),
      paidAmount: String(loan.paidAmountMinor / 100),
      aprPercent: String(loan.aprPercent || 0),
      monthlyPayment: String(loan.monthlyPaymentMinor / 100),
      nextPaymentOn: loan.nextPaymentOn || '',
    });
    setError('');
    setFormOpen(true);
  };

  const recordPayment = async (loan) => {
    await recordFinanceLiabilityPayment(loan.id, {
      amount: loan.monthlyPaymentMinor > 0 ? loan.monthlyPaymentMinor / 100 : Math.min(loan.remainingAmountMinor / 100, 100),
    });
    await loadLiabilities();
  };

  const archiveLoan = async (id) => {
    await deleteFinanceLiability(id);
    await loadLiabilities();
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        <SummaryCard label="Total remaining debt" value={formatMoney(totalDebtMinor, currency)} />
        <SummaryCard label="Monthly payments" value={formatMoney(totalMonthlyMinor, currency)} />
        <div className="p-6 bg-surface-card rounded-card border border-border-subtle shadow-sm">
          <p className="font-semibold text-sm text-on-surface-variant mb-2">Average APR</p>
          <div className="flex items-end space-x-2">
            <h2 className="font-display text-4xl font-bold text-on-surface">{avgApr.toFixed(1)}%</h2>
            {avgApr > 10 ? (
              <span className="flex items-center text-error text-sm font-bold pb-1"><TrendingUp className="w-4 h-4 mr-1" /> High</span>
            ) : (
              <span className="flex items-center text-success-proactive text-sm font-bold pb-1"><TrendingDown className="w-4 h-4 mr-1" /> Good</span>
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Your loans</h2>
          <p className="text-sm text-text-muted">Track payoff progress, interest, and next payment.</p>
        </div>
        <button type="button" onClick={openAdd} className="min-h-11 inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white active:scale-[.98] transition-transform">
          <Plus className="h-4 w-4" /> Add loan
        </button>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
        {liabilities.map((loan) => (
          <article key={loan.id} className="bg-surface-card rounded-card border border-border-subtle p-6 shadow-sm">
            <div className="flex justify-between items-start gap-4 mb-6">
              <div className="flex items-center space-x-4 min-w-0">
                <div className={cn('w-12 h-12 rounded-full flex items-center justify-center shrink-0', loan.aprPercent > 10 ? 'bg-error/10 text-error' : 'bg-secondary/10 text-secondary')}>
                  <CreditCard className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-lg text-on-surface truncate">{loan.name}</h3>
                  <p className="text-sm text-text-muted truncate">{loan.provider || 'No provider'} - {loan.liabilityType}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={cn('font-bold text-lg', loan.aprPercent > 10 ? 'text-error' : 'text-on-surface')}>{loan.aprPercent}% APR</p>
                {loan.aprPercent > 10 && <p className="text-xs text-error flex items-center justify-end font-medium mt-1"><AlertCircle className="w-3 h-3 mr-1" /> High interest</p>}
              </div>
            </div>

            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-on-surface-variant">Paid: {formatMoney(loan.paidAmountMinor, loan.currency)}</span>
                <span className="font-semibold text-on-surface">Left: {formatMoney(loan.remainingAmountMinor, loan.currency)}</span>
              </div>
              <div className="h-3 bg-surface-container rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-secondary transition-all duration-700" style={{ width: `${loan.progressPercent}%` }} />
              </div>
              <div className="flex justify-between text-xs text-text-muted">
                <span>0</span>
                <span>{formatMoney(loan.originalAmountMinor, loan.currency)}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-border-subtle flex flex-wrap justify-between items-center gap-3">
              <div>
                <p className="text-xs text-text-muted mb-1">Monthly payment</p>
                <p className="font-semibold text-on-surface">{formatMoney(loan.monthlyPaymentMinor, loan.currency)}</p>
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-2 rounded-lg bg-surface-container text-sm font-semibold" onClick={() => editLoan(loan)}>Edit</button>
                <button className="px-3 py-2 rounded-lg bg-secondary text-white text-sm font-semibold" onClick={() => recordPayment(loan)}>Record payment</button>
                <button className="w-10 h-10 rounded-lg hover:bg-error/10 hover:text-error flex items-center justify-center" onClick={() => archiveLoan(loan.id)} aria-label={`Archive ${loan.name}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      {!isLoading && liabilities.length === 0 && (
        <div className="app-card p-8 text-center text-sm text-text-muted">No loans yet. Tap “Add loan” to track your first one.</div>
      )}
      {isLoading && <div className="app-card p-8 text-center text-sm text-text-muted">Loading loans...</div>}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={editingId ? 'Edit loan' : 'Add loan'}>
          <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={closeForm} aria-label="Close" />
          <section className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface-card shadow-2xl sm:rounded-[24px]">
            <header className="flex items-center justify-between gap-4 border-b border-border-subtle p-5">
              <h2 className="section-title">{editingId ? 'Edit loan' : 'Add loan'}</h2>
              <button type="button" onClick={closeForm} className="icon-button bg-surface-container-low" aria-label="Close"><X className="h-5 w-5" /></button>
            </header>
            <form className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5" onSubmit={submit}>
              <label className="settings-field"><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Car loan" autoFocus /></label>
              <label className="settings-field"><span>Provider</span><input value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })} placeholder="Bank or lender" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="settings-field"><span>Original amount</span><input type="number" inputMode="decimal" step="0.01" min="0" value={form.originalAmount} onChange={(event) => setForm({ ...form, originalAmount: event.target.value })} /></label>
                <label className="settings-field"><span>Paid so far</span><input type="number" inputMode="decimal" step="0.01" min="0" value={form.paidAmount} onChange={(event) => setForm({ ...form, paidAmount: event.target.value })} /></label>
                <label className="settings-field"><span>APR %</span><input type="number" inputMode="decimal" step="0.01" min="0" value={form.aprPercent} onChange={(event) => setForm({ ...form, aprPercent: event.target.value })} /></label>
                <label className="settings-field"><span>Monthly payment</span><input type="number" inputMode="decimal" step="0.01" min="0" value={form.monthlyPayment} onChange={(event) => setForm({ ...form, monthlyPayment: event.target.value })} /></label>
              </div>
              <label className="settings-field"><span>Next payment</span><input type="date" value={form.nextPaymentOn} onChange={(event) => setForm({ ...form, nextPaymentOn: event.target.value })} /></label>
              {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={closeForm} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
                <button type="submit" disabled={isSaving} className="min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-60">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {editingId ? 'Save' : 'Add loan'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="p-6 bg-surface-card rounded-card border border-border-subtle shadow-sm">
      <p className="font-semibold text-sm text-on-surface-variant mb-2">{label}</p>
      <h2 className="font-display text-4xl font-bold text-on-surface">{value}</h2>
    </div>
  );
}
