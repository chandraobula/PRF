import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Loader2, Plus, ShoppingCart, Sparkles, Trash2, Undo2, Wand2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { addMealPlanEntry, deleteMealPlanEntry, generateMealPlan, getMealPlan, updateMealPlanEntry } from '../services/mealPlanApi';
import { addShoppingItem, getPantrySummary } from '../services/pantryApi';

const SLOTS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
];

const STATUS_STYLES = {
  planned: 'bg-surface-container text-on-surface',
  cooked: 'bg-success-proactive/10 text-success-proactive',
  skipped: 'bg-surface-container text-text-muted line-through',
  leftover: 'bg-ai-electric-blue/10 text-ai-electric-blue',
};

const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const rangeFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

const toISO = (date) => {
  const local = new Date(date);
  local.setHours(0, 0, 0, 0);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
};

const startOfWeek = (date) => {
  const local = new Date(date);
  local.setHours(0, 0, 0, 0);
  const offset = (local.getDay() + 6) % 7; // Monday-based
  local.setDate(local.getDate() - offset);
  return local;
};

const addDays = (date, amount) => {
  const local = new Date(date);
  local.setDate(local.getDate() + amount);
  return local;
};

const emptyForm = {
  planDate: '',
  mealSlot: 'dinner',
  title: '',
  recipeId: '',
  servings: '1',
  notes: '',
  status: 'planned',
};

export default function MealPlanner() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [planResult, setPlanResult] = useState(null);
  const [addingShopping, setAddingShopping] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState(['breakfast', 'lunch', 'dinner']);
  const [view, setView] = useState('week');
  const [selectedDay, setSelectedDay] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const rangeFrom = toISO(days[0]);
  const rangeTo = toISO(days[6]);
  const todayISO = toISO(new Date());

  const loadPlan = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const data = await getMealPlan(rangeFrom, rangeTo);
      setEntries(data.entries || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    getPantrySummary()
      .then((summary) => setRecipes(summary.recipes || []))
      .catch(() => setRecipes([]));
  }, []);

  const entriesByCell = useMemo(() => {
    const map = new Map();
    for (const entry of entries) {
      const key = `${entry.planDate}|${entry.mealSlot}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
    return map;
  }, [entries]);

  const openAdd = (planDate, mealSlot) => {
    setEditingId('');
    setForm({ ...emptyForm, planDate, mealSlot });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (entry) => {
    setEditingId(entry.id);
    setForm({
      planDate: entry.planDate,
      mealSlot: entry.mealSlot,
      title: entry.recipeId ? '' : (entry.customTitle || entry.title || ''),
      recipeId: entry.recipeId || '',
      servings: String(entry.servings ?? 1),
      notes: entry.notes || '',
      status: entry.status || 'planned',
    });
    setError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId('');
    setForm(emptyForm);
  };

  const submitEntry = async (event) => {
    event.preventDefault();
    const selectedRecipe = recipes.find((recipe) => recipe.id === form.recipeId);

    if (!form.recipeId && !form.title.trim()) {
      setError('Add a meal title or pick a recipe.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const payload = {
        planDate: form.planDate,
        mealSlot: form.mealSlot,
        recipeId: form.recipeId || null,
        customTitle: form.recipeId ? (selectedRecipe?.title || '') : form.title.trim(),
        servings: Number(form.servings || 1),
        notes: form.notes.trim(),
        status: form.status,
      };

      if (editingId) {
        await updateMealPlanEntry(editingId, payload);
      } else {
        await addMealPlanEntry(payload);
      }

      closeModal();
      await loadPlan();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const setStatus = async (entry, status) => {
    setError('');
    try {
      await updateMealPlanEntry(entry.id, { status });
      await loadPlan();
    } catch (statusError) {
      setError(statusError.message);
    }
  };

  const removeEntry = async (id) => {
    setError('');
    try {
      await deleteMealPlanEntry(id);
      await loadPlan();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const toggleSlot = (slot) => {
    setSelectedSlots((prev) => (prev.includes(slot) ? prev.filter((item) => item !== slot) : [...prev, slot]));
  };

  const goToDay = (date) => {
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    setSelectedDay(day);
    const nextWeekStart = startOfWeek(day);
    if (toISO(nextWeekStart) !== toISO(weekStart)) {
      setWeekStart(nextWeekStart);
    }
  };

  const goPrev = () => (view === 'day' ? goToDay(addDays(selectedDay, -1)) : setWeekStart(addDays(weekStart, -7)));
  const goNext = () => (view === 'day' ? goToDay(addDays(selectedDay, 1)) : setWeekStart(addDays(weekStart, 7)));
  const goToday = () => (view === 'day' ? goToDay(new Date()) : setWeekStart(startOfWeek(new Date())));

  const generatePlan = async () => {
    if (selectedSlots.length === 0) {
      setGenError('Pick at least one meal to plan.');
      return;
    }

    setGenerating(true);
    setGenError('');
    setPlanResult(null);

    try {
      const result = await generateMealPlan({ from: rangeFrom, to: rangeTo, slots: selectedSlots, replace: true });
      setPlanResult(result);
      await loadPlan();
    } catch (generateError) {
      setGenError(generateError.message);
    } finally {
      setGenerating(false);
    }
  };

  const addMissingToShopping = async () => {
    const missing = planResult?.missingItems || [];
    if (missing.length === 0) return;

    setAddingShopping(true);
    try {
      for (const name of missing) {
        await addShoppingItem({ name, quantity: 1, unit: 'item', category: 'Groceries', source: 'recipe' });
      }
      setPlanResult((prev) => (prev ? { ...prev, missingItems: [] } : prev));
    } catch (shoppingError) {
      setGenError(shoppingError.message);
    } finally {
      setAddingShopping(false);
    }
  };

  return (
    <div className="space-y-6 max-w-container-max mx-auto pb-12">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold text-on-surface tracking-tight mb-2">Meal planner</h1>
          <p className="font-body text-on-surface-variant text-lg">
            Plan meals across the week. Assign recipes or quick entries per slot.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-border-subtle bg-surface-container-low p-1" role="tablist" aria-label="Meal planner view">
            {['day', 'week'].map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={view === mode}
                onClick={() => setView(mode)}
                className={cn('min-h-9 rounded-lg px-4 text-sm font-bold capitalize', view === mode ? 'bg-surface-card text-on-surface shadow-sm' : 'text-on-surface-variant')}
              >
                {mode}
              </button>
            ))}
          </div>
          <button type="button" onClick={goPrev} className="icon-button bg-surface-card border border-border-subtle" aria-label={view === 'day' ? 'Previous day' : 'Previous week'}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={goToday} className="min-h-11 px-4 rounded-xl border border-border-subtle bg-surface-card text-sm font-bold">
            {view === 'day' ? 'Today' : 'This week'}
          </button>
          <button type="button" onClick={goNext} className="icon-button bg-surface-card border border-border-subtle" aria-label={view === 'day' ? 'Next day' : 'Next week'}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </section>

      <div className="flex items-center gap-2 text-sm font-semibold text-text-muted">
        <CalendarDays className="h-4 w-4" />
        {view === 'day'
          ? new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(selectedDay)
          : `${rangeFormatter.format(days[0])} - ${rangeFormatter.format(days[6])}`}
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      </div>

      <section className="rounded-[20px] border border-ai-electric-blue/30 bg-ai-electric-blue/5 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ai-electric-blue/15 text-ai-electric-blue"><Sparkles className="h-6 w-6" /></span>
            <div>
              <h2 className="font-display text-lg font-bold text-on-surface">Plan my week with AI</h2>
              <p className="text-sm text-text-muted">Auto-fill this week from your pantry, using soon-to-expire items first.</p>
            </div>
          </div>
          <button type="button" onClick={generatePlan} disabled={generating} className="min-h-12 shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-ai-electric-blue px-5 text-sm font-bold text-white shadow-sm active:scale-[.98] transition-transform disabled:opacity-60">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {generating ? 'Planning your week...' : 'Plan my week'}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-text-muted">Plan:</span>
          {SLOTS.map((slot) => {
            const active = selectedSlots.includes(slot.key);
            return (
              <button key={slot.key} type="button" onClick={() => toggleSlot(slot.key)} className={cn('min-h-9 rounded-full border px-3 text-xs font-bold transition-colors', active ? 'border-ai-electric-blue bg-ai-electric-blue text-white' : 'border-border-subtle bg-surface-card text-text-muted')}>
                {slot.label}
              </button>
            );
          })}
        </div>
        {genError && <p className="mt-3 rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{genError}</p>}
      </section>

      {planResult && (
        <div className="rounded-[20px] border border-success-proactive/30 bg-success-proactive/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-on-surface">Planned {planResult.created} meal{planResult.created === 1 ? '' : 's'} for this week.</p>
              {planResult.missingItems?.length > 0
                ? <p className="mt-0.5 text-sm text-text-muted">{planResult.missingItems.length} to buy: {planResult.missingItems.slice(0, 6).join(', ')}{planResult.missingItems.length > 6 ? '…' : ''}</p>
                : <p className="mt-0.5 text-sm text-text-muted">Everything is in your pantry. Nice.</p>}
            </div>
            {planResult.missingItems?.length > 0 && (
              <button type="button" onClick={addMissingToShopping} disabled={addingShopping} className="min-h-11 shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-60">
                {addingShopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                Add {planResult.missingItems.length} to shopping list
              </button>
            )}
          </div>
        </div>
      )}

      {error && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

      {view === 'day' && (
        <section className="app-card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-display text-xl font-bold text-on-surface">
                {toISO(selectedDay) === todayISO ? 'Today' : dayFormatter.format(selectedDay)}
              </p>
              <p className="text-sm text-text-muted">{rangeFormatter.format(selectedDay)}</p>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={goPrev} className="icon-button bg-surface-container-low" aria-label="Previous day"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={goNext} className="icon-button bg-surface-container-low" aria-label="Next day"><ChevronRight className="h-5 w-5" /></button>
            </div>
          </div>
          <div className="space-y-3">
            {SLOTS.map((slot) => {
              const dayISO = toISO(selectedDay);
              const cellEntries = entriesByCell.get(`${dayISO}|${slot.key}`) || [];
              return (
                <div key={slot.key} className="rounded-xl border border-border-subtle p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-text-muted">{slot.label}</p>
                    <button type="button" onClick={() => openAdd(dayISO, slot.key)} className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-surface-container-low hover:text-on-surface" aria-label={`Add ${slot.label}`}><Plus className="h-4 w-4" /></button>
                  </div>
                  {cellEntries.length === 0 ? (
                    <button type="button" onClick={() => openAdd(dayISO, slot.key)} className="w-full rounded-lg border border-dashed border-border-subtle py-2.5 text-sm text-text-muted hover:border-secondary hover:text-secondary">Add {slot.label.toLowerCase()}</button>
                  ) : (
                    <div className="space-y-2">
                      {cellEntries.map((entry) => (
                        <div key={entry.id} className={cn('rounded-xl px-3 py-2.5', STATUS_STYLES[entry.status] || STATUS_STYLES.planned)}>
                          <div className="flex items-start justify-between gap-2">
                            <button type="button" onClick={() => openEdit(entry)} className="min-w-0 flex-1 text-left">
                              <p className="font-bold leading-tight">{entry.title}</p>
                              <p className="text-xs opacity-70">{entry.servings} serving{entry.servings === 1 ? '' : 's'}{entry.notes ? ` · ${entry.notes}` : ''}</p>
                            </button>
                            <div className="flex shrink-0 items-center gap-0.5">
                              {entry.status === 'cooked'
                                ? <button type="button" onClick={() => setStatus(entry, 'planned')} className="rounded p-1.5 hover:bg-black/10" aria-label="Mark planned"><Undo2 className="h-4 w-4" /></button>
                                : <button type="button" onClick={() => setStatus(entry, 'cooked')} className="rounded p-1.5 hover:bg-black/10" aria-label="Mark cooked"><Check className="h-4 w-4" /></button>}
                              <button type="button" onClick={() => removeEntry(entry.id)} className="rounded p-1.5 hover:bg-black/10" aria-label={`Delete ${entry.title}`}><Trash2 className="h-4 w-4" /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {view === 'week' && (
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {days.map((day) => {
          const dateISO = toISO(day);
          const isToday = dateISO === todayISO;
          return (
            <div key={dateISO} className={cn('app-card p-3 flex flex-col gap-3', isToday && 'ring-2 ring-secondary')}>
              <div className="flex items-baseline justify-between">
                <p className="font-bold text-on-surface">{dayFormatter.format(day)}</p>
                <p className={cn('text-xs font-semibold', isToday ? 'text-secondary' : 'text-text-muted')}>{rangeFormatter.format(day)}</p>
              </div>
              <div className="space-y-3">
                {SLOTS.map((slot) => {
                  const cellEntries = entriesByCell.get(`${dateISO}|${slot.key}`) || [];
                  return (
                    <div key={slot.key}>
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{slot.label}</p>
                        <button type="button" onClick={() => openAdd(dateISO, slot.key)} className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-surface-container-low hover:text-on-surface" aria-label={`Add ${slot.label} on ${dateISO}`}>
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-1 space-y-1">
                        {cellEntries.map((entry) => (
                          <div key={entry.id} className={cn('group rounded-lg px-2 py-1.5 text-sm', STATUS_STYLES[entry.status] || STATUS_STYLES.planned)}>
                            <button type="button" onClick={() => openEdit(entry)} className="block w-full text-left font-semibold leading-tight truncate">
                              {entry.title}
                            </button>
                            <div className="mt-1 flex items-center justify-between gap-1">
                              <span className="text-[11px] opacity-70">{entry.servings} serving{entry.servings === 1 ? '' : 's'}</span>
                              <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                {entry.status === 'cooked' ? (
                                  <button type="button" onClick={() => setStatus(entry, 'planned')} className="rounded p-1 hover:bg-black/5" aria-label="Mark planned"><Undo2 className="h-3.5 w-3.5" /></button>
                                ) : (
                                  <button type="button" onClick={() => setStatus(entry, 'cooked')} className="rounded p-1 hover:bg-black/5" aria-label="Mark cooked"><Check className="h-3.5 w-3.5" /></button>
                                )}
                                <button type="button" onClick={() => removeEntry(entry.id)} className="rounded p-1 hover:bg-black/5" aria-label={`Delete ${entry.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {cellEntries.length === 0 && (
                          <button type="button" onClick={() => openAdd(dateISO, slot.key)} className="w-full rounded-lg border border-dashed border-border-subtle py-1.5 text-xs text-text-muted hover:border-secondary hover:text-secondary">
                            Add
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={editingId ? 'Edit meal' : 'Add meal'}>
          <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={closeModal} aria-label="Close" />
          <section className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface-card shadow-2xl sm:rounded-[24px]">
            <header className="flex items-center justify-between gap-4 border-b border-border-subtle p-5">
              <h2 className="section-title">{editingId ? 'Edit meal' : 'Add meal'}</h2>
              <button type="button" onClick={closeModal} className="icon-button bg-surface-container-low" aria-label="Close"><X className="h-5 w-5" /></button>
            </header>
            <form className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" onSubmit={submitEntry}>
              <div className="grid grid-cols-2 gap-3">
                <label className="settings-field"><span>Date</span><input type="date" value={form.planDate} onChange={(event) => setForm({ ...form, planDate: event.target.value })} required /></label>
                <label className="settings-field">
                  <span>Slot</span>
                  <select className="w-full min-h-12 px-3.5 rounded-xl border border-outline-variant bg-surface-card text-[15px]" value={form.mealSlot} onChange={(event) => setForm({ ...form, mealSlot: event.target.value })}>
                    {SLOTS.map((slot) => <option key={slot.key} value={slot.key}>{slot.label}</option>)}
                  </select>
                </label>
              </div>

              {recipes.length > 0 && (
                <label className="settings-field">
                  <span>Use a saved recipe (optional)</span>
                  <select className="w-full min-h-12 px-3.5 rounded-xl border border-outline-variant bg-surface-card text-[15px]" value={form.recipeId} onChange={(event) => setForm({ ...form, recipeId: event.target.value })}>
                    <option value="">Custom meal</option>
                    {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.title}</option>)}
                  </select>
                </label>
              )}

              {!form.recipeId && (
                <label className="settings-field"><span>Meal</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Veggie stir-fry" /></label>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="settings-field"><span>Servings</span><input type="number" step="0.5" min="0" value={form.servings} onChange={(event) => setForm({ ...form, servings: event.target.value })} /></label>
                <label className="settings-field">
                  <span>Status</span>
                  <select className="w-full min-h-12 px-3.5 rounded-xl border border-outline-variant bg-surface-card text-[15px]" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                    <option value="planned">Planned</option>
                    <option value="cooked">Cooked</option>
                    <option value="leftover">Leftover</option>
                    <option value="skipped">Skipped</option>
                  </select>
                </label>
              </div>

              <label className="settings-field"><span>Notes</span><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Optional" /></label>

              {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={closeModal} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
                <button type="submit" disabled={isSaving} className="min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white disabled:opacity-60">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {editingId ? 'Save meal' : 'Add meal'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
