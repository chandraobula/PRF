import { useState } from 'react';
import {
  Banknote, Building2, CreditCard, Edit2, Landmark, Loader2, Plus, TrendingUp, Trash2, Wallet2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ConfirmDialog, Modal } from './BudgetsPanel';
import {
  addFinanceAccount, deleteFinanceAccount, formatMoney, updateFinanceAccount,
} from '../../services/financeApi';

const ACCOUNT_TYPES = [
  { value: 'bank', label: 'Bank account', icon: Landmark },
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'wallet', label: 'Wallet', icon: Wallet2 },
  { value: 'investment', label: 'Investment (SIP, stocks, insurance...)', icon: TrendingUp },
  { value: 'other', label: 'Other', icon: Building2 },
];

const CURRENCIES = ['INR', 'USD'];

const emptyAccount = (currency = 'INR') => ({
  name: '',
  type: 'bank',
  currency,
  openingBalance: '',
  institution: '',
  lastFour: '',
});

export default function AccountsPanel({ accounts, currency, onChanged }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(() => emptyAccount(currency));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [valuingAccount, setValuingAccount] = useState(null);

  const totalAssets = accounts.reduce((sum, account) => sum + account.currentBalanceMinor, 0);
  const investmentTotal = accounts
    .filter((account) => account.type === 'investment')
    .reduce((sum, account) => sum + account.currentBalanceMinor, 0);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyAccount(currency));
    setError('');
    setEditorOpen(true);
  };

  const openEdit = (account) => {
    setEditing(account);
    setForm({
      name: account.name,
      type: account.type,
      currency: account.currency,
      openingBalance: '',
      institution: account.institution || '',
      lastFour: account.lastFour || '',
    });
    setError('');
    setEditorOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) return setError('Give this account a name.');

    setIsSaving(true);
    setError('');

    try {
      if (editing) {
        await updateFinanceAccount(editing.id, {
          name: form.name.trim(),
          type: form.type,
          institution: form.institution.trim() || null,
          lastFour: form.lastFour.trim() || null,
        });
      } else {
        await addFinanceAccount({
          name: form.name.trim(),
          type: form.type,
          currency: form.currency,
          openingBalance: Number(form.openingBalance || 0),
          institution: form.institution.trim() || null,
          lastFour: form.lastFour.trim() || null,
        });
      }
      setEditorOpen(false);
      onChanged?.();
    } catch (saveError) {
      setError(saveError.message || 'Could not save this account.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteFinanceAccount(pendingDelete.id);
      setPendingDelete(null);
      onChanged?.();
    } catch (deleteError) {
      setError(deleteError.message || 'Could not remove this account.');
      setPendingDelete(null);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="app-card p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="section-title">Accounts</h2>
            <p className="text-sm text-text-muted">
              {accounts.length > 0
                ? <>{formatMoney(totalAssets, currency)} across {accounts.length} account{accounts.length === 1 ? '' : 's'}{investmentTotal > 0 ? ` · ${formatMoney(investmentTotal, currency)} invested` : ''}</>
                : 'Add your bank, cash, wallet and investment accounts to track everything you own.'}
            </p>
          </div>
          <button type="button" onClick={openCreate} className="min-h-11 shrink-0 inline-flex items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:opacity-90">
            <Plus className="h-4 w-4" /> New account
          </button>
        </div>

        {error && <p className="mb-4 rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}

        {accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-subtle p-6 text-center">
            <p className="text-sm font-semibold text-on-surface">No accounts yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
              Money kept as cash, in a bank, or invested in an SIP, stocks, or insurance all belong here —
              not in a transaction category.
            </p>
            <button type="button" onClick={openCreate} className="mt-4 min-h-11 inline-flex items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white">
              <Plus className="h-4 w-4" /> Add your first account
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onEdit={() => openEdit(account)}
                onDelete={() => setPendingDelete(account)}
                onUpdateValue={account.type === 'investment' ? () => setValuingAccount(account) : undefined}
              />
            ))}
          </div>
        )}
      </section>

      {editorOpen && (
        <AccountEditor
          form={form}
          setForm={setForm}
          isSaving={isSaving}
          error={error}
          isEditing={Boolean(editing)}
          onSubmit={save}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {valuingAccount && (
        <UpdateValueDialog
          account={valuingAccount}
          onClose={() => setValuingAccount(null)}
          onDone={() => { setValuingAccount(null); onChanged?.(); }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Remove "${pendingDelete.name}"?`}
          body="This archives the account. Its past transactions stay in your ledger, but it stops counting toward balances and net worth."
          confirmLabel="Remove account"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function AccountCard({ account, onEdit, onDelete, onUpdateValue }) {
  const meta = ACCOUNT_TYPES.find((type) => type.value === account.type) || ACCOUNT_TYPES[0];
  const Icon = meta.icon;

  return (
    <article className="rounded-xl border border-border-subtle p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            account.type === 'investment' ? 'bg-ai-electric-blue/10 text-ai-electric-blue' : 'bg-secondary/10 text-secondary',
          )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-bold text-on-surface">{account.name}</h3>
            <p className="truncate text-xs text-text-muted">
              {meta.label}{account.institution ? ` · ${account.institution}` : ''}{account.lastFour ? ` ···${account.lastFour}` : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onEdit} className="icon-button h-9 w-9" aria-label={`Edit ${account.name}`}>
            <Edit2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={onDelete} className="icon-button h-9 w-9 hover:text-error" aria-label={`Remove ${account.name}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="mt-4 font-display text-xl font-bold tabular-nums text-on-surface">
        {formatMoney(account.currentBalanceMinor, account.currency)}
      </p>

      {onUpdateValue && (
        <button
          type="button"
          onClick={onUpdateValue}
          className="mt-3 min-h-10 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface-card text-sm font-bold hover:bg-surface-container-low"
        >
          <TrendingUp className="h-4 w-4" /> Update current value
        </button>
      )}
    </article>
  );
}

function UpdateValueDialog({ account, onClose, onDone }) {
  const [value, setValue] = useState(String(account.currentBalanceMinor / 100));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (value === '' || Number.isNaN(Number(value))) return setError('Enter the current value.');

    setIsSaving(true);
    setError('');
    try {
      await updateFinanceAccount(account.id, { currentBalance: Number(value) });
      await onDone();
    } catch (saveError) {
      setError(saveError.message || 'Could not update this account.');
      setIsSaving(false);
    }
  };

  return (
    <Modal title={`Update ${account.name}`} onClose={onClose} maxWidth="max-w-sm">
      <form className="space-y-4 p-5" onSubmit={submit}>
        <p className="text-sm leading-6 text-text-muted">
          There's no live price feed here — tell us what this account is worth today and we'll use that for net worth
          until you update it again.
        </p>
        <label className="settings-field">
          <span>Current value ({account.currency})</span>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </label>
        {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
          <button type="submit" disabled={isSaving} className="min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white disabled:opacity-60">
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AccountEditor({ form, setForm, isSaving, error, isEditing, onSubmit, onClose }) {
  return (
    <Modal title={isEditing ? 'Edit account' : 'New account'} onClose={onClose}>
      <form className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" onSubmit={onSubmit}>
        <label className="settings-field">
          <span>Name</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="HDFC Savings, Zerodha, LIC Policy..." autoFocus />
        </label>

        <label className="settings-field">
          <span>Type</span>
          <select
            className="w-full min-h-12 rounded-xl border border-outline-variant bg-surface-card px-3.5 text-[15px]"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {ACCOUNT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>

        {!isEditing && (
          <div className="grid grid-cols-2 gap-3">
            <label className="settings-field">
              <span>Currency</span>
              <select
                className="w-full min-h-12 rounded-xl border border-outline-variant bg-surface-card px-3.5 text-[15px]"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </label>
            <label className="settings-field">
              <span>Starting balance</span>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} placeholder="0.00" />
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="settings-field"><span>Institution</span><input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} placeholder="Optional" /></label>
          <label className="settings-field"><span>Last 4 digits</span><input value={form.lastFour} onChange={(e) => setForm({ ...form, lastFour: e.target.value })} placeholder="Optional" maxLength={4} /></label>
        </div>

        {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-sm font-semibold text-error">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="min-h-12 flex-1 rounded-xl border border-border-subtle text-sm font-bold">Cancel</button>
          <button type="submit" disabled={isSaving} className="min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white disabled:opacity-60">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {isEditing ? 'Save changes' : 'Create account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
