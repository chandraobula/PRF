import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, Check, Loader2, Plus, Radar, RefreshCw, Trash2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { formatMoney } from '../services/financeApi';
import {
  addSubscription,
  deleteSubscription,
  detectSubscriptions,
  getSubscriptions,
  updateSubscription,
} from '../services/subscriptionsApi';

const emptySub = { name: '', provider: '', category: 'Streaming', amount: '', currency: 'USD', cadence: 'monthly', nextRenewalOn: '', notes: '' };
const CADENCES = ['weekly', 'monthly', 'quarterly', 'yearly'];
const cadenceLabel = { weekly: '/wk', monthly: '/mo', quarterly: '/qtr', yearly: '/yr', custom: '' };

export default function Subscriptions() {
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptySub);
  const [isSaving, setIsSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [candidates, setCandidates] = useState(null);

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      setSummary(await getSubscriptions());
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditingId(''); setForm(emptySub); setError(''); setFormOpen(true); };

  const openEdit = (sub) => {
    setEditingId(sub.id);
    setForm({
      name: sub.name || '', provider: sub.provider || '', category: sub.category || 'Other',
      amount: String(sub.amountMinor / 100), currency: sub.currency || 'USD', cadence: sub.cadence || 'monthly',
      nextRenewalOn: sub.nextRenewalOn || '', notes: sub.notes || '',
    });
    setError('');
    setFormOpen(true);
  };

  const closeForm = () => { setFormOpen(false); setEditingId(''); setForm(emptySub); };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name) { setError('Name is required.'); return; }
    setIsSaving(true);
    setError('');
    try {
      const payload = { ...form, amount: Number(form.amount || 0), nextRenewalOn: form.nextRenewalOn || null };
      if (editingId) await updateSubscription(editingId, payload); else await addSubscription(payload);
      closeForm();
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (id) => { await deleteSubscription(id); await load(); };

  const runDetect = async () => {
    setDetecting(true);
    setError('');
    try {
      const { candidates: found } = await detectSubscriptions();
      setCandidates(found || []);
    } catch (detectError) {
      setError(detectError.message);
    } finally {
      setDetecting(false);
    }
  };

  const addCandidate = async (candidate) => {
    await addSubscription({
      name: candidate.merchant, category: 'Detected', amount: candidate.amountMinor / 100,
      previousAmount: candidate.previousAmountMinor != null ? candidate.previousAmountMinor / 100 : undefined,
      currency: candidate.currency, cadence: candidate.cadence, nextRenewalOn: candidate.nextRenewalOn,
      merchantKey: candidate.merchantKey,
    });
    setCandidates((prev) => prev.filter((item) => item.merchantKey !== candidate.merchantKey));
    await load();
  };

  const subscriptions = summary?.subscriptions || [];
  const upcoming = summary?.upcoming || [];
  const priceHikes = summary?.priceHikes || [];

  return (
    <div className="space-y-5 max-w-container-max mx-auto pb-6">
      <section className="space-y-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-on-surface tracking-tight mb-1">Subscriptions</h1>
          <p className="font-body text-on-surface-variant">Track recurring charges and catch price hikes before they cost you.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={runDetect} disabled={detecting} className="flex-1 min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-ai-electric-blue px-4 text-sm font-bold text-white shadow-sm active:scale-[.98] transition-transform disabled:opacity-60">
            {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
            {detecting ? 'Scanning…' : 'Scan my spending'}
          </button>
          <button type="button" onClick={openAdd} className="flex-1 min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm active:scale-[.98] transition-transform">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </section>

      {error && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

      <section className="grid grid-cols-3 gap-3">
        <StatCard label="Monthly" value={summary ? formatMoney(summary.monthlyEstimateMinor, 'USD') : '—'} />
        <StatCard label="Yearly" value={summary ? formatMoney(summary.yearlyEstimateMinor, 'USD') : '—'} />
        <StatCard label="Active" value={summary ? String(summary.activeCount) : '—'} />
      </section>

      {priceHikes.length > 0 && (
        <section className="rounded-[20px] border border-error/30 bg-error/5 p-4">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4 text-error" /><h2 className="font-bold text-on-surface">Price increases</h2></div>
          <div className="space-y-1.5">
            {priceHikes.map((sub) => (
              <p key={sub.id} className="text-sm text-on-surface-variant"><span className="font-semibold text-on-surface">{sub.name}</span> went up {formatMoney(sub.increaseMinor, sub.currency)} to {formatMoney(sub.amountMinor, sub.currency)}{cadenceLabel[sub.cadence]}.</p>
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="app-card p-5">
          <div className="flex items-center gap-2 mb-3"><CalendarClock className="h-5 w-5 text-text-muted" /><h2 className="section-title">Renewing soon</h2></div>
          <div className="space-y-2">
            {upcoming.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-3">
                <div className="min-w-0"><p className="font-semibold truncate">{sub.name}</p><p className="text-xs text-text-muted">{sub.nextRenewalOn}</p></div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">{formatMoney(sub.amountMinor, sub.currency)}{cadenceLabel[sub.cadence]}</p>
                  <p className={cn('text-xs font-bold', sub.daysUntil <= 3 ? 'text-error' : 'text-warning-maintenance')}>{sub.daysUntil === 0 ? 'Today' : `in ${sub.daysUntil}d`}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="app-card overflow-hidden">
        <div className="p-4 border-b border-border-subtle"><h2 className="section-title">All subscriptions</h2></div>
        <ul className="divide-y divide-border-subtle">
          {subscriptions.map((sub) => (
            <li key={sub.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-on-surface truncate">{sub.name}</p>
                <p className="text-xs text-text-muted truncate">{sub.category}{sub.nextRenewalOn ? ` · renews ${sub.nextRenewalOn}` : ''}{sub.status !== 'active' ? ` · ${sub.status}` : ''}</p>
              </div>
              <p className="text-sm font-bold tabular-nums shrink-0">{formatMoney(sub.amountMinor, sub.currency)}<span className="text-text-muted">{cadenceLabel[sub.cadence]}</span></p>
              <button type="button" onClick={() => openEdit(sub)} className="hidden sm:flex h-9 px-3 items-center rounded-lg bg-surface-container text-sm font-bold">Edit</button>
              <button type="button" onClick={() => remove(sub.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-error/10 hover:text-error" aria-label={`Delete ${sub.name}`}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
          {!isLoading && subscriptions.length === 0 && <li className="p-8 text-center text-sm text-text-muted">No subscriptions yet. Scan your spending or add one.</li>}
          {isLoading && <li className="p-8 text-center text-sm text-text-muted">Loading…</li>}
        </ul>
      </section>

      {candidates && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Detected subscriptions">
          <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setCandidates(null)} aria-label="Close" />
          <section className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface-card shadow-2xl sm:rounded-[24px]">
            <header className="flex items-center justify-between gap-4 border-b border-border-subtle p-5">
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ai-electric-blue/10 text-ai-electric-blue"><Radar className="h-5 w-5" /></span><div><h2 className="section-title">Detected recurring charges</h2><p className="text-sm text-text-muted">{candidates.length} found in your transactions.</p></div></div>
              <button type="button" onClick={() => setCandidates(null)} className="icon-button bg-surface-container-low" aria-label="Close"><X className="h-5 w-5" /></button>
            </header>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
              {candidates.map((candidate) => (
                <div key={candidate.merchantKey} className="flex items-center gap-3 rounded-xl border border-border-subtle p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{candidate.merchant}</p>
                    <p className="text-xs text-text-muted">{formatMoney(candidate.amountMinor, candidate.currency)}{cadenceLabel[candidate.cadence]} · seen {candidate.occurrences}×{candidate.increaseMinor > 0 ? ` · ↑ ${formatMoney(candidate.increaseMinor, candidate.currency)}` : ''}</p>
                  </div>
                  <button type="button" onClick={() => addCandidate(candidate)} className="min-h-10 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-bold text-white"><Check className="h-4 w-4" /> Track</button>
                </div>
              ))}
              {candidates.length === 0 && <p className="py-6 text-center text-sm text-text-muted">No new recurring charges found. Add some expenses first, then scan again.</p>}
            </div>
            <footer className="border-t border-border-subtle p-4"><button type="button" onClick={() => setCandidates(null)} className="min-h-11 w-full rounded-xl border border-border-subtle text-sm font-bold">Done</button></footer>
          </section>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={editingId ? 'Edit subscription' : 'Add subscription'}>
          <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={closeForm} aria-label="Close" />
          <section className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface-card shadow-2xl sm:rounded-[24px]">
            <header className="flex items-center justify-between gap-4 border-b border-border-subtle p-5"><h2 className="section-title">{editingId ? 'Edit subscription' : 'Add subscription'}</h2><button type="button" onClick={closeForm} className="icon-button bg-surface-container-low" aria-label="Close"><X className="h-5 w-5" /></button></header>
            <form className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" onSubmit={submit}>
              <label className="settings-field"><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Netflix" autoFocus /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="settings-field"><span>Amount</span><input type="number" inputMode="decimal" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="15.99" /></label>
                <label className="settings-field"><span>Billing</span>
                  <select className="w-full min-h-12 px-3.5 rounded-xl border border-outline-variant bg-surface-card text-[15px]" value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })}>
                    {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="settings-field"><span>Category</span><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Streaming" /></label>
                <label className="settings-field"><span>Next renewal</span><input type="date" value={form.nextRenewalOn} onChange={(e) => setForm({ ...form, nextRenewalOn: e.target.value })} /></label>
              </div>
              <label className="settings-field"><span>Notes</span><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></label>
              {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={closeForm} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
                <button type="submit" disabled={isSaving} className="min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white disabled:opacity-60">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{editingId ? 'Save' : 'Add'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="app-card p-4 text-center">
      <p className="text-xs font-semibold text-text-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-bold text-on-surface">{value}</p>
    </div>
  );
}
