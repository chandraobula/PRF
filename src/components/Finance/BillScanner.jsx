import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Edit2, FileText, Loader2, Plus, Save, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';
import {
  addFinanceReceipt,
  deleteFinanceReceipt,
  formatMoney,
  getFinanceReceipts,
  scanFinanceDocument,
  updateFinanceReceipt,
} from '../../services/financeApi';

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Could not read the file.'));
  reader.readAsDataURL(file);
});

const emptyBill = {
  occurredOn: new Date().toISOString().slice(0, 10),
  merchant: '',
  amount: '',
  category: 'Food',
  paymentMethod: 'card',
  notes: '',
  fileName: '',
  mimeType: '',
  sizeBytes: null,
};

export default function BillScanner({ currency = 'USD', expenseCategories = [] }) {
  const [bills, setBills] = useState([]);
  const [form, setForm] = useState(emptyBill);
  const [editingId, setEditingId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const fileInputRef = useRef(null);
  const scanInputRef = useRef(null);

  const loadBills = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const data = await getFinanceReceipts(currency);
      setBills(data.receipts || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoading(false);
    }
  }, [currency]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const resetForm = () => {
    setEditingId('');
    setForm({
      ...emptyBill,
      occurredOn: new Date().toISOString().slice(0, 10),
      category: expenseCategories[0]?.name || 'Food',
    });
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setForm({
      ...form,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      notes: form.notes || 'Receipt metadata captured',
    });
  };

  const onScanFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    const isSupported = file.type.startsWith('image/') || file.type === 'application/pdf';

    if (!isSupported) {
      setError('Unsupported file. Choose an image (JPG, PNG, HEIC) or a PDF.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError('That file is too large (max 15MB). Try a smaller photo or PDF.');
      return;
    }

    setError('');
    setScanNote('');
    setScanning(true);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const { receipt, items } = await scanFinanceDocument({ image: dataUrl, mimeType: file.type });

      if (!receipt || (!receipt.merchant && !receipt.totalMinor)) {
        setError('No bill total was detected. You can still enter it manually below.');
        return;
      }

      const matchedCategory = expenseCategories.find(
        (category) => category.name.toLowerCase() === String(receipt.category || '').toLowerCase(),
      );
      const lineSummary = (receipt.lineItems || []).map((line) => line.description).filter(Boolean).slice(0, 4).join(', ');

      setEditingId('');
      setForm({
        occurredOn: receipt.date || new Date().toISOString().slice(0, 10),
        merchant: receipt.merchant || '',
        amount: receipt.totalMinor ? String(receipt.totalMinor / 100) : '',
        category: matchedCategory?.name || receipt.category || expenseCategories[0]?.name || 'Food',
        paymentMethod: 'card',
        notes: lineSummary || 'Scanned with AI',
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      setScanNote(`AI read this ${file.type === 'application/pdf' ? 'PDF' : 'image'}${items?.length ? ` and found ${items.length} line item${items.length === 1 ? '' : 's'}` : ''}. Review and save.`);
      setFormOpen(true);
    } catch (scanError) {
      setError(scanError.message);
    } finally {
      setScanning(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!form.merchant || !form.amount) {
      setError('Merchant and amount are required.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      if (editingId) {
        await updateFinanceReceipt(editingId, {
          occurredOn: form.occurredOn,
          merchant: form.merchant,
          amount: Number(form.amount),
          currency,
          category: form.category,
          paymentMethod: form.paymentMethod,
          notes: form.notes,
        });
      } else {
        await addFinanceReceipt({
          ...form,
          amount: Number(form.amount),
          currency,
          tags: ['receipt'],
        });
      }

      resetForm();
      setFormOpen(false);
      await loadBills();
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

  const editBill = (bill) => {
    setEditingId(bill.id);
    setForm({
      occurredOn: bill.occurredOn,
      merchant: bill.merchant || '',
      amount: String((bill.amountMinor || 0) / 100),
      category: bill.categoryName || 'Food',
      paymentMethod: bill.paymentMethod || 'card',
      notes: bill.notes || '',
      fileName: bill.receiptFileName || '',
      mimeType: '',
      sizeBytes: null,
    });
    setError('');
    setFormOpen(true);
  };

  const removeBill = async (id) => {
    setError('');
    await deleteFinanceReceipt(id);
    await loadBills();
  };

  const totalMinor = bills.reduce((sum, bill) => sum + bill.amountMinor, 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="bg-surface-card rounded-[20px] border border-border-subtle p-4 sm:p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-[18px] leading-6 font-bold tracking-tight text-on-surface flex items-center">
              <Camera className="w-5 h-5 mr-2 text-text-muted" /> Bills and receipts
            </h2>
            <p className="text-sm leading-5 text-text-muted">Receipt metadata and expense records are saved through the API.</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-text-muted">Total tracked</p>
            <p className="font-display text-lg font-bold">{formatMoney(totalMinor, currency)}</p>
          </div>
        </div>

        <input ref={scanInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onScanFile} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => scanInputRef.current?.click()}
            disabled={scanning}
            className="flex-1 min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-ai-electric-blue px-4 text-sm font-bold text-white shadow-sm active:scale-[.99] transition-transform disabled:opacity-60"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {scanning ? 'Reading your bill...' : 'Scan a bill or invoice with AI'}
          </button>
          <button
            type="button"
            onClick={openAdd}
            className="min-h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface-container-low px-4 text-sm font-bold text-on-surface hover:bg-surface-container active:scale-[.99] transition-transform"
          >
            <Plus className="h-4 w-4" /> Add manually
          </button>
        </div>
        {scanNote && <p className="mt-3 rounded-xl bg-ai-electric-blue/10 px-3 py-2 text-sm font-semibold text-ai-electric-blue">{scanNote}</p>}
        {error && !formOpen && <p className="mt-3 rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}
      </section>

      <section className="bg-surface-card rounded-card border border-border-subtle shadow-sm overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant text-sm border-b border-border-subtle">
                <th className="p-4 font-semibold">Date</th>
                <th className="p-4 font-semibold">Merchant</th>
                <th className="p-4 font-semibold">Category</th>
                <th className="p-4 font-semibold">File</th>
                <th className="p-4 font-semibold text-right">Amount</th>
                <th className="p-4 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {bills.map((bill) => (
                <tr key={bill.id} className="hover:bg-surface-container-lowest transition-colors">
                  <td className="p-4 text-sm">{bill.occurredOn}</td>
                  <td className="p-4 text-sm font-semibold">{bill.merchant}</td>
                  <td className="p-4 text-sm">{bill.categoryName || 'Uncategorized'}</td>
                  <td className="p-4 text-sm text-text-muted">{bill.receiptFileName || 'Metadata only'}</td>
                  <td className="p-4 text-sm font-bold text-right">{formatMoney(bill.amountMinor, bill.currency || currency)}</td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-2">
                      <button className="icon-button" onClick={() => editBill(bill)} aria-label={`Edit ${bill.merchant}`}>
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button className="icon-button hover:text-error" onClick={() => removeBill(bill.id)} aria-label={`Delete ${bill.merchant}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-border-subtle">
          {bills.map((bill) => (
            <article key={bill.id} className="p-4 flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-text-muted" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{bill.merchant}</p>
                    <p className="text-xs text-text-muted">{bill.occurredOn} - {bill.categoryName || 'Uncategorized'}</p>
                  </div>
                  <p className="font-bold">{formatMoney(bill.amountMinor, bill.currency || currency)}</p>
                </div>
                <div className="mt-3 flex justify-end gap-1">
                  <button className="icon-button" onClick={() => editBill(bill)} aria-label={`Edit ${bill.merchant}`}><Edit2 className="w-4 h-4" /></button>
                  <button className="icon-button hover:text-error" onClick={() => removeBill(bill.id)} aria-label={`Delete ${bill.merchant}`}><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </article>
          ))}
        </div>

        {!isLoading && bills.length === 0 && (
          <div className="p-8 text-center text-sm text-text-muted">No bills yet. Add your first receipt or bill above.</div>
        )}
        {isLoading && (
          <div className="p-8 text-center text-sm text-text-muted">Loading bills...</div>
        )}
      </section>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={editingId ? 'Edit bill' : 'Add bill'}>
          <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => { setFormOpen(false); resetForm(); }} aria-label="Close" />
          <section className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-surface-card shadow-2xl sm:rounded-[24px]">
            <header className="flex items-center justify-between gap-4 border-b border-border-subtle p-5">
              <h2 className="section-title">{editingId ? 'Edit bill' : 'Add bill'}</h2>
              <button type="button" onClick={() => { setFormOpen(false); resetForm(); }} className="icon-button bg-surface-container-low" aria-label="Close"><X className="h-5 w-5" /></button>
            </header>
            <form className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" onSubmit={submit}>
              <label className="settings-field"><span>Merchant</span><input value={form.merchant} onChange={(event) => setForm({ ...form, merchant: event.target.value })} placeholder="Costco" autoFocus /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="settings-field"><span>Amount</span><input type="number" inputMode="decimal" step="0.01" min="0" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0.00" /></label>
                <label className="settings-field"><span>Date</span><input type="date" value={form.occurredOn} onChange={(event) => setForm({ ...form, occurredOn: event.target.value })} /></label>
              </div>
              <label className="settings-field">
                <span>Category</span>
                <select className="w-full min-h-12 px-3.5 rounded-xl border border-outline-variant bg-surface-card text-[15px]" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                  {(expenseCategories.length ? expenseCategories : [{ name: 'Food' }]).map((category) => (
                    <option key={category.id || category.name} value={category.name}>{category.name}</option>
                  ))}
                </select>
              </label>
              <input ref={fileInputRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFile} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface-container-low px-4 text-sm font-bold text-on-surface hover:bg-surface-container">
                <UploadCloud className="h-4 w-4" />
                {form.fileName ? `Attached: ${form.fileName}` : 'Attach file (optional)'}
              </button>
              {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setFormOpen(false); resetForm(); }} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
                <button type="submit" disabled={isSaving} className="min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-60">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editingId ? 'Save' : 'Add bill'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
