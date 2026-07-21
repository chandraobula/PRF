import { useEffect, useState } from 'react';
import {
  BadgeCheck, Cake, Car, Check, FileText, HeartPulse, Loader2, Plane, Plus, Repeat,
  ShieldCheck, Trash2, X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { addImportantDate, deleteImportantDate, getImportantDates, updateImportantDate } from '../services/datesApi';

const CATEGORIES = ['passport', 'license', 'visa', 'warranty', 'insurance', 'registration', 'birthday', 'anniversary', 'subscription', 'tax', 'medical', 'other'];
const emptyDate = { title: '', category: 'other', person: '', dueOn: '', recurs: 'none', reminderDaysBefore: '14', notes: '' };

const categoryIcon = (category) => ({
  passport: Plane, visa: Plane, license: BadgeCheck, warranty: ShieldCheck, insurance: ShieldCheck,
  registration: Car, birthday: Cake, anniversary: Cake, tax: FileText, medical: HeartPulse,
}[category] || FileText);

const toneFor = (days) => {
  if (days == null) return 'text-text-muted';
  if (days < 0) return 'text-error';
  if (days <= 14) return 'text-error';
  if (days <= 30) return 'text-warning-maintenance';
  return 'text-on-surface';
};

const countdown = (days) => {
  if (days == null) return '';
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return 'Today';
  return `in ${days}d`;
};

export default function ImportantDates() {
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyDate);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      setSummary(await getImportantDates());
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditingId(''); setForm(emptyDate); setError(''); setFormOpen(true); };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      title: item.title || '', category: item.category || 'other', person: item.person || '',
      dueOn: item.dueOn || '', recurs: item.recurs || 'none',
      reminderDaysBefore: String(item.reminderDaysBefore ?? 14), notes: item.notes || '',
    });
    setError('');
    setFormOpen(true);
  };

  const closeForm = () => { setFormOpen(false); setEditingId(''); setForm(emptyDate); };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title || !form.dueOn) { setError('Title and date are required.'); return; }
    setIsSaving(true);
    setError('');
    try {
      const payload = { ...form, reminderDaysBefore: Number(form.reminderDaysBefore || 14) };
      if (editingId) await updateImportantDate(editingId, payload); else await addImportantDate(payload);
      closeForm();
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (id) => { await deleteImportantDate(id); await load(); };

  const dates = summary?.dates || [];
  const overdue = summary?.overdue || [];
  const upcoming = summary?.upcoming || [];

  const Row = ({ item }) => {
    const Icon = categoryIcon(item.category);
    return (
      <li className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container text-text-muted"><Icon className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-on-surface truncate">{item.title}{item.person ? ` · ${item.person}` : ''}</p>
          <p className="text-xs text-text-muted truncate capitalize">{item.category}{item.recurs !== 'none' ? ` · ${item.recurs}` : ''} · {item.nextOn}</p>
        </div>
        <p className={cn('text-sm font-bold shrink-0', toneFor(item.daysUntil))}>{countdown(item.daysUntil)}</p>
        <button type="button" onClick={() => openEdit(item)} className="hidden sm:flex h-9 px-3 items-center rounded-lg bg-surface-container text-sm font-bold">Edit</button>
        <button type="button" onClick={() => remove(item.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-error/10 hover:text-error" aria-label={`Delete ${item.title}`}><Trash2 className="h-4 w-4" /></button>
      </li>
    );
  };

  return (
    <div className="space-y-5 max-w-container-max mx-auto pb-6">
      <section className="space-y-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-on-surface tracking-tight mb-1">Important dates</h1>
          <p className="font-body text-on-surface-variant">Passports, licenses, warranties, insurance, birthdays — never miss a renewal.</p>
        </div>
        <button type="button" onClick={openAdd} className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm active:scale-[.98] transition-transform"><Plus className="h-4 w-4" /> Add a date</button>
      </section>

      {error && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

      {overdue.length > 0 && (
        <section className="app-card overflow-hidden border-error/30">
          <div className="p-4 border-b border-border-subtle bg-error/5"><h2 className="section-title text-error">Overdue</h2></div>
          <ul className="divide-y divide-border-subtle">{overdue.map((item) => <Row key={item.id} item={item} />)}</ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="app-card overflow-hidden">
          <div className="p-4 border-b border-border-subtle"><h2 className="section-title">Coming up (next 60 days)</h2></div>
          <ul className="divide-y divide-border-subtle">{upcoming.map((item) => <Row key={item.id} item={item} />)}</ul>
        </section>
      )}

      <section className="app-card overflow-hidden">
        <div className="p-4 border-b border-border-subtle"><h2 className="section-title">All dates</h2></div>
        <ul className="divide-y divide-border-subtle">
          {dates.map((item) => <Row key={item.id} item={item} />)}
          {!isLoading && dates.length === 0 && <li className="p-8 text-center text-sm text-text-muted">Nothing tracked yet. Add your passport, license, or a birthday.</li>}
          {isLoading && <li className="p-8 text-center text-sm text-text-muted">Loading…</li>}
        </ul>
      </section>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={editingId ? 'Edit date' : 'Add date'}>
          <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={closeForm} aria-label="Close" />
          <section className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface-card shadow-2xl sm:rounded-[24px]">
            <header className="flex items-center justify-between gap-4 border-b border-border-subtle p-5"><h2 className="section-title">{editingId ? 'Edit date' : 'Add a date'}</h2><button type="button" onClick={closeForm} className="icon-button bg-surface-container-low" aria-label="Close"><X className="h-5 w-5" /></button></header>
            <form className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" onSubmit={submit}>
              <label className="settings-field"><span>Title</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Passport renewal" autoFocus /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="settings-field"><span>Category</span>
                  <select className="w-full min-h-12 px-3.5 rounded-xl border border-outline-variant bg-surface-card text-[15px] capitalize" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="settings-field"><span>Date</span><input type="date" value={form.dueOn} onChange={(e) => setForm({ ...form, dueOn: e.target.value })} /></label>
                <label className="settings-field"><span>Repeats</span>
                  <select className="w-full min-h-12 px-3.5 rounded-xl border border-outline-variant bg-surface-card text-[15px]" value={form.recurs} onChange={(e) => setForm({ ...form, recurs: e.target.value })}>
                    <option value="none">One time</option><option value="annual">Every year</option><option value="monthly">Every month</option>
                  </select>
                </label>
                <label className="settings-field"><span>Remind me (days before)</span><input type="number" inputMode="numeric" min="0" value={form.reminderDaysBefore} onChange={(e) => setForm({ ...form, reminderDaysBefore: e.target.value })} /></label>
              </div>
              <label className="settings-field"><span>Person (optional)</span><input value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })} placeholder="For birthdays" /></label>
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
