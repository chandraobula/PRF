import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Apple, Camera, Check, ChevronDown, Coffee, Loader2, Minus, Package, Plus, Receipt,
  Search, ShoppingCart, Sparkles, Trash2, X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  addPantryItem,
  addPantryItemsBulk,
  addShoppingItem,
  consumePantryItem,
  deletePantryItem,
  generatePantryRecipes,
  getPantrySummary,
  scanPantryImage,
  updatePantryItem,
  updateShoppingItem,
} from '../services/pantryApi';
import { addFinanceReceipt } from '../services/financeApi';

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Could not read the file.'));
  reader.readAsDataURL(file);
});

const emptyItem = {
  name: '',
  category: 'Produce',
  quantity: '1',
  unit: 'item',
  location: '',
  lowStockThreshold: '1',
  expiresOn: '',
  notes: '',
};

const CATEGORY_ORDER = ['Produce', 'Dairy', 'Meat & Seafood', 'Bakery', 'Beverages', 'Frozen', 'Pantry', 'Snacks', 'Household', 'Miscellaneous'];

const categoryIcon = (category = '') => {
  const value = category.toLowerCase();
  if (value.includes('produce') || value.includes('fruit') || value.includes('veg')) return Apple;
  if (value.includes('beverage') || value.includes('drink')) return Coffee;
  return Package;
};

const emptyList = [];

export default function Pantry() {
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState(emptyItem);
  const [shoppingForm, setShoppingForm] = useState({ name: '', quantity: '1', unit: 'item', category: 'Groceries' });
  const [editingId, setEditingId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanItems, setScanItems] = useState(null);
  const [scanReceipt, setScanReceipt] = useState(null);
  const [logExpense, setLogExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ merchant: '', amount: '', category: 'Food', date: '', currency: 'USD' });
  const [savingScan, setSavingScan] = useState(false);
  const scanInputRef = useRef(null);

  const loadPantry = async () => {
    setIsLoading(true);
    setError('');

    try {
      setSummary(await getPantrySummary());
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPantry();
  }, []);

  const items = summary?.items || emptyList;
  const shoppingItems = summary?.shoppingItems || emptyList;
  const recipes = summary?.recipes || emptyList;

  const filteredItems = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return items;
    return items.filter((item) => [item.name, item.category, item.location, item.notes]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search)));
  }, [items, query]);

  const groupedItems = useMemo(() => {
    const groups = new Map();
    for (const item of filteredItems) {
      const key = item.category || 'Miscellaneous';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [filteredItems]);

  const categoryTabs = useMemo(() => {
    const counts = new Map();
    for (const item of items) {
      const key = item.category || 'Miscellaneous';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const ordered = Array.from(counts.entries()).sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
    return [['All', items.length], ...ordered];
  }, [items]);

  const visibleGroups = activeCategory === 'All'
    ? groupedItems
    : groupedItems.filter(([category]) => category === activeCategory);

  const openAdd = () => {
    setEditingId('');
    setForm(emptyItem);
    setError('');
    setFormOpen(true);
  };

  const editItem = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name || '',
      category: item.category || 'Produce',
      quantity: String(item.quantity ?? 0),
      unit: item.unit || 'item',
      location: item.location || '',
      lowStockThreshold: String(item.lowStockThreshold ?? 1),
      expiresOn: item.expiresOn || '',
      notes: item.notes || '',
    });
    setError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId('');
    setForm(emptyItem);
  };

  const submitItem = async (event) => {
    event.preventDefault();
    if (!form.name) {
      setError('Item name is required.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const payload = {
        ...form,
        quantity: Number(form.quantity || 0),
        lowStockThreshold: Number(form.lowStockThreshold || 0),
        expiresOn: form.expiresOn || null,
      };

      if (editingId) {
        await updatePantryItem(editingId, payload);
      } else {
        await addPantryItem(payload);
      }

      closeForm();
      await loadPantry();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const adjust = async (item, delta) => {
    if (delta < 0) {
      await consumePantryItem(item.id, 1);
    } else {
      await updatePantryItem(item.id, { quantity: Number(item.quantity || 0) + 1 });
    }
    await loadPantry();
  };

  const removeItem = async (id) => {
    await deletePantryItem(id);
    await loadPantry();
  };

  const toggleCategory = (category) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });
  };

  const submitShopping = async (event) => {
    event.preventDefault();
    if (!shoppingForm.name) return;
    await addShoppingItem({ ...shoppingForm, quantity: Number(shoppingForm.quantity || 1) });
    setShoppingForm({ name: '', quantity: '1', unit: 'item', category: 'Groceries' });
    await loadPantry();
  };

  const generateRecipes = async () => {
    await generatePantryRecipes();
    await loadPantry();
  };

  const onScanFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const isSupported = file.type.startsWith('image/') || file.type === 'application/pdf';
    if (!isSupported) {
      setScanError('Unsupported file. Choose an image (JPG, PNG, HEIC) or a PDF.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setScanError('That file is too large (max 15MB). Try a smaller photo or PDF.');
      return;
    }

    setScanError('');
    setScanning(true);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const { items: found, receipt } = await scanPantryImage({ image: dataUrl, mimeType: file.type });

      if ((!found || found.length === 0) && !receipt) {
        setScanError('Nothing was detected in that file. Try a clearer, well-lit photo.');
        return;
      }

      setScanItems((found || []).map((item) => ({
        name: item.name || '',
        category: item.category || 'Miscellaneous',
        quantity: String(item.quantity ?? 1),
        unit: item.unit || 'item',
      })));

      setScanReceipt(receipt || null);
      if (receipt && receipt.totalMinor > 0) {
        setLogExpense(true);
        setExpenseForm({
          merchant: receipt.merchant || '',
          amount: String(receipt.totalMinor / 100),
          category: receipt.category || 'Food',
          date: receipt.date || new Date().toISOString().slice(0, 10),
          currency: receipt.currency || 'USD',
        });
      } else {
        setLogExpense(false);
      }
    } catch (scanFailure) {
      setScanError(scanFailure.message);
    } finally {
      setScanning(false);
    }
  };

  const updateScanRow = (index, patch) => {
    setScanItems((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  const removeScanRow = (index) => {
    setScanItems((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  };

  const closeScanReview = () => {
    setScanItems(null);
    setScanReceipt(null);
    setLogExpense(false);
    setScanError('');
  };

  const saveScannedItems = async () => {
    const valid = (scanItems || []).filter((item) => item.name.trim());
    if (valid.length === 0 && !(logExpense && Number(expenseForm.amount) > 0)) {
      setScanError('Add at least one item or an expense before saving.');
      return;
    }

    setSavingScan(true);
    setScanError('');

    try {
      if (valid.length > 0) {
        await addPantryItemsBulk(valid.map((item) => ({
          name: item.name.trim(),
          category: item.category.trim() || 'Miscellaneous',
          quantity: Number(item.quantity || 1),
          unit: item.unit.trim() || 'item',
        })));
      }

      if (logExpense && Number(expenseForm.amount) > 0) {
        await addFinanceReceipt({
          merchant: expenseForm.merchant || 'Groceries',
          amount: Number(expenseForm.amount),
          currency: expenseForm.currency || 'USD',
          category: expenseForm.category || 'Food',
          occurredOn: expenseForm.date || new Date().toISOString().slice(0, 10),
          paymentMethod: 'card',
          notes: 'Logged from Pantry scan',
          tags: ['receipt', 'pantry-scan'],
        });
      }

      closeScanReview();
      await loadPantry();
    } catch (saveFailure) {
      setScanError(saveFailure.message);
    } finally {
      setSavingScan(false);
    }
  };

  const openShopping = shoppingItems.filter((item) => item.status === 'open');

  return (
    <div className="space-y-5 max-w-container-max mx-auto pb-6">
      <section className="space-y-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-on-surface tracking-tight mb-1">Pantry</h1>
          <p className="font-body text-on-surface-variant">
            {summary ? `${summary.itemCount} items · ${summary.lowStockCount} low · ${summary.expiringCount} expiring` : 'Loading pantry.'}
          </p>
        </div>

        <div className="flex gap-2">
          <input ref={scanInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onScanFile} />
          <button type="button" onClick={() => scanInputRef.current?.click()} disabled={scanning} className="flex-1 min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-ai-electric-blue px-4 text-sm font-bold text-white shadow-sm active:scale-[.98] transition-transform disabled:opacity-60">
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {scanning ? 'Scanning...' : 'Scan with AI'}
          </button>
          <button type="button" onClick={openAdd} className="flex-1 min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm active:scale-[.98] transition-transform">
            <Plus className="h-4 w-4" /> Add item
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input className="w-full min-h-12 rounded-xl border border-outline-variant bg-surface-card pl-10 pr-3 text-[15px]" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pantry" />
        </div>

        {categoryTabs.length > 1 && (
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Pantry categories">
            {categoryTabs.map(([category, count]) => {
              const active = activeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveCategory(category)}
                  className={cn(
                    'min-h-9 shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 text-sm font-bold transition-colors',
                    active ? 'border-primary bg-primary text-white' : 'border-border-subtle bg-surface-card text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  {category}
                  <span className={cn('rounded-full px-1.5 text-[11px] font-bold', active ? 'bg-white/20 text-white' : 'bg-surface-container text-text-muted')}>{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {scanError && !scanItems && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{scanError}</div>}
      {error && !formOpen && <div className="rounded-xl bg-error/10 px-4 py-3 text-sm font-semibold text-error">{error}</div>}

      <section className="space-y-4">
        {visibleGroups.map(([category, categoryItems]) => {
          const Icon = categoryIcon(category);
          const isCollapsed = collapsed.has(category);
          return (
            <div key={category} className="app-card overflow-hidden">
              <button type="button" onClick={() => toggleCategory(category)} className="w-full flex items-center gap-3 px-4 py-3 active:bg-surface-container-low">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-container text-text-muted"><Icon className="h-5 w-5" /></span>
                <span className="flex-1 text-left font-bold text-on-surface">{category}</span>
                <span className="rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-bold text-text-muted">{categoryItems.length}</span>
                <ChevronDown className={cn('h-5 w-5 text-text-muted transition-transform', isCollapsed && '-rotate-90')} />
              </button>
              {!isCollapsed && (
                <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                  {categoryItems.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-on-surface truncate">{item.name}</p>
                          {item.isLowStock && <span className="shrink-0 rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-bold text-error">LOW</span>}
                        </div>
                        <p className="text-xs text-text-muted truncate">
                          {item.location || 'No location'}{item.expiresOn ? ` · exp ${item.expiresOn}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 rounded-xl bg-surface-container-lowest p-1">
                        <button type="button" onClick={() => adjust(item, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-card active:scale-95" aria-label={`Use one ${item.name}`}><Minus className="h-4 w-4" /></button>
                        <span className={cn('min-w-14 text-center text-sm font-bold tabular-nums', item.isLowStock ? 'text-error' : 'text-on-surface')}>{item.quantity} {item.unit}</span>
                        <button type="button" onClick={() => adjust(item, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-card active:scale-95" aria-label={`Add one ${item.name}`}><Plus className="h-4 w-4" /></button>
                      </div>
                      <button type="button" onClick={() => editItem(item)} className="hidden sm:flex h-9 px-3 items-center rounded-lg bg-surface-container text-sm font-bold" >Edit</button>
                      <button type="button" onClick={() => removeItem(item.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-error/10 hover:text-error" aria-label={`Delete ${item.name}`}><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {!isLoading && filteredItems.length === 0 && <div className="app-card p-8 text-center text-sm text-text-muted">No pantry items yet. Scan a receipt or add your first item.</div>}
        {isLoading && <div className="app-card p-8 text-center text-sm text-text-muted">Loading pantry...</div>}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="app-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-ai-electric-blue" />
              <h2 className="section-title">Recipe ideas</h2>
            </div>
            <button onClick={generateRecipes} className="min-h-10 px-4 rounded-xl bg-secondary text-white text-sm font-bold">Generate</button>
          </div>
          <div className="grid gap-3">
            {recipes.map((recipe) => (
              <article key={recipe.id} className="rounded-xl bg-surface-container-lowest border border-border-subtle p-4">
                <h4 className="font-bold">{recipe.title}</h4>
                <p className="mt-1 text-sm text-text-muted">{recipe.description}</p>
                <p className="mt-2 text-xs font-semibold text-on-surface">{recipe.ingredients.map((item) => item.name).join(', ') || 'Add inventory first'}</p>
              </article>
            ))}
            {recipes.length === 0 && <p className="text-sm text-text-muted">No recipes yet.</p>}
          </div>
        </div>

        <div className="app-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-text-muted" />
            <h2 className="section-title">Shopping list</h2>
          </div>
          <form className="grid grid-cols-[1fr_80px] gap-2 mb-4" onSubmit={submitShopping}>
            <input className="min-h-11 px-3 rounded-xl border border-outline-variant" value={shoppingForm.name} onChange={(event) => setShoppingForm({ ...shoppingForm, name: event.target.value })} placeholder="Add shopping item" />
            <button className="min-h-11 rounded-xl bg-primary text-white text-sm font-bold">Add</button>
          </form>
          <div className="space-y-2">
            {openShopping.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl bg-surface-container-lowest p-3">
                <ShoppingCart className="w-5 h-5 text-text-muted" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{item.name}</p>
                  <p className="text-xs text-text-muted">{item.quantity} {item.unit} · {item.source}</p>
                </div>
                <button className="w-10 h-10 rounded-lg hover:bg-success-proactive/10 hover:text-success-proactive flex items-center justify-center" onClick={() => updateShoppingItem(item.id, { status: 'purchased' }).then(loadPantry)} aria-label={`Mark ${item.name} purchased`}>
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ))}
            {openShopping.length === 0 && <p className="text-sm text-text-muted">Shopping list is empty.</p>}
          </div>
        </div>
      </section>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={editingId ? 'Edit item' : 'Add item'}>
          <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={closeForm} aria-label="Close" />
          <section className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface-card shadow-2xl sm:rounded-[24px]">
            <header className="flex items-center justify-between gap-4 border-b border-border-subtle p-5">
              <h2 className="section-title">{editingId ? 'Edit item' : 'Add item'}</h2>
              <button type="button" onClick={closeForm} className="icon-button bg-surface-container-low" aria-label="Close"><X className="h-5 w-5" /></button>
            </header>
            <form className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" onSubmit={submitItem}>
              <label className="settings-field"><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Coffee beans" autoFocus /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="settings-field"><span>Category</span><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label>
                <label className="settings-field"><span>Location</span><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Shelf, fridge" /></label>
                <label className="settings-field"><span>Quantity</span><input type="number" inputMode="decimal" step="0.1" min="0" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label>
                <label className="settings-field"><span>Unit</span><input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></label>
                <label className="settings-field"><span>Low stock at</span><input type="number" inputMode="decimal" step="0.1" min="0" value={form.lowStockThreshold} onChange={(event) => setForm({ ...form, lowStockThreshold: event.target.value })} /></label>
                <label className="settings-field"><span>Expires</span><input type="date" value={form.expiresOn} onChange={(event) => setForm({ ...form, expiresOn: event.target.value })} /></label>
              </div>
              <label className="settings-field"><span>Notes</span><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Optional" /></label>
              {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={closeForm} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
                <button disabled={isSaving} className="min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-60">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {editingId ? 'Save' : 'Add item'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {scanItems && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Review scanned items">
          <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={closeScanReview} aria-label="Close review" />
          <section className="relative z-10 flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-[28px] bg-surface-card shadow-2xl sm:rounded-[24px]">
            <header className="flex items-start justify-between gap-4 border-b border-border-subtle p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ai-electric-blue/10 text-ai-electric-blue"><Camera className="h-5 w-5" /></span>
                <div>
                  <h2 className="section-title">Review scan</h2>
                  <p className="text-sm text-text-muted">{scanItems.length} item{scanItems.length === 1 ? '' : 's'} found. Edit, then save.</p>
                </div>
              </div>
              <button type="button" onClick={closeScanReview} className="icon-button bg-surface-container-low" aria-label="Close review"><X className="h-5 w-5" /></button>
            </header>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
              {scanReceipt && scanReceipt.totalMinor > 0 && (
                <div className="mb-3 rounded-xl border border-border-subtle bg-surface-container-lowest p-4">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={logExpense} onChange={(event) => setLogExpense(event.target.checked)} className="h-5 w-5 rounded" />
                    <span className="flex items-center gap-2 font-bold text-on-surface"><Receipt className="h-4 w-4 text-text-muted" /> Also log this as an expense</span>
                  </label>
                  {logExpense && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <input className="min-h-11 rounded-lg border border-outline-variant px-3 text-sm" value={expenseForm.merchant} onChange={(event) => setExpenseForm({ ...expenseForm, merchant: event.target.value })} placeholder="Merchant" />
                      <input type="number" inputMode="decimal" step="0.01" className="min-h-11 rounded-lg border border-outline-variant px-3 text-sm" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} placeholder="Amount" />
                      <input className="min-h-11 rounded-lg border border-outline-variant px-3 text-sm" value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })} placeholder="Category" />
                      <input type="date" className="min-h-11 rounded-lg border border-outline-variant px-3 text-sm" value={expenseForm.date} onChange={(event) => setExpenseForm({ ...expenseForm, date: event.target.value })} />
                    </div>
                  )}
                </div>
              )}

              <div className="hidden grid-cols-[1fr_130px_64px_80px_36px] gap-2 px-1 text-[11px] font-bold uppercase tracking-wide text-text-muted sm:grid">
                <span>Name</span><span>Category</span><span>Qty</span><span>Unit</span><span />
              </div>
              {scanItems.map((item, index) => (
                <div key={index} className="grid grid-cols-2 gap-2 rounded-xl border border-border-subtle p-3 sm:grid-cols-[1fr_130px_64px_80px_36px] sm:items-center sm:border-0 sm:p-1">
                  <input className="col-span-2 min-h-11 rounded-lg border border-outline-variant px-3 text-sm sm:col-span-1" value={item.name} onChange={(event) => updateScanRow(index, { name: event.target.value })} placeholder="Item name" />
                  <input className="min-h-11 rounded-lg border border-outline-variant px-3 text-sm" value={item.category} onChange={(event) => updateScanRow(index, { category: event.target.value })} placeholder="Category" />
                  <input type="number" inputMode="decimal" step="0.1" min="0" className="min-h-11 rounded-lg border border-outline-variant px-3 text-sm" value={item.quantity} onChange={(event) => updateScanRow(index, { quantity: event.target.value })} />
                  <input className="min-h-11 rounded-lg border border-outline-variant px-3 text-sm" value={item.unit} onChange={(event) => updateScanRow(index, { unit: event.target.value })} placeholder="unit" />
                  <button type="button" onClick={() => removeScanRow(index)} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-error/10 hover:text-error" aria-label={`Remove ${item.name || 'item'}`}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {scanItems.length === 0 && <p className="py-4 text-center text-sm text-text-muted">No grocery items — you can still log the expense above.</p>}
            </div>

            {scanError && <p className="mx-5 rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{scanError}</p>}

            <footer className="flex gap-2 border-t border-border-subtle p-5">
              <button type="button" onClick={closeScanReview} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
              <button type="button" onClick={saveScannedItems} disabled={savingScan} className="min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white disabled:opacity-60">
                {savingScan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
