import { normalizeCurrency, toMinor } from './money.js';
import { parseJson, today } from './normalize.js';

// Category vocabularies. These are both the allowlist the parsers snap model
// output onto and the list handed to the model in its prompt, so they must stay
// in sync with the seeded expense categories in the router.
export const PANTRY_SCAN_CATEGORIES = [
  'Produce',
  'Dairy',
  'Meat & Seafood',
  'Bakery',
  'Beverages',
  'Frozen',
  'Pantry',
  'Snacks',
  'Household',
  'Miscellaneous',
];

export const EXPENSE_SCAN_CATEGORIES = [
  'Food',
  'Shopping',
  'Travel',
  'Fuel',
  'Health',
  'Entertainment',
  'Education',
  'Utilities',
  'Rent',
  'Family',
  'Pets',
  'Taxes',
  'Charity',
  'Personal Care',
  'Miscellaneous',
];

// Credits picked up from imported statements land here so they never inflate
// the salary/freelance figures the user actually earns.
export const MISC_INCOME_CATEGORY = 'Miscellaneous income';

export const SUMMARY_LINE_PATTERN = /^(sub[\s-]?total|total|grand[\s-]?total|gross(\s+(amount|total))?|net(\s+(payable|amount|total))?|amount\s+(due|payable)|balance(\s+due)?|items?\s+count|no\.?\s+of\s+items)\b[\s:.]*$/i;

/**
 * Models are asked for raw JSON but frequently wrap it in a markdown fence.
 * Returns null rather than throwing — a malformed response is a failed scan,
 * not a server error.
 */
export function parseModelJson(rawText) {
  const text = String(rawText || '').trim();

  if (!text) {
    return null;
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : text;
  const parsed = parseJson(candidate, null);

  return parsed && typeof parsed === 'object' ? parsed : null;
}

export function normalizeScanCategory(value) {
  const text = String(value || '').trim();
  const match = PANTRY_SCAN_CATEGORIES.find((category) => category.toLowerCase() === text.toLowerCase());
  return match || 'Miscellaneous';
}

export function normalizeScanExpenseCategory(value) {
  const text = String(value || '').trim();
  const match = EXPENSE_SCAN_CATEGORIES.find((category) => category.toLowerCase() === text.toLowerCase());
  return match || 'Miscellaneous';
}

export function normalizeScanDate(value) {
  const text = String(value || '').trim().slice(0, 10);

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  return today();
}

export function normalizeStatementDate(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (!match) return null;

  const iso = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);

  return Number.isNaN(date.getTime()) ? null : iso;
}

export function sanitizeScanQuantity(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 1;
  }

  return Math.round(numeric * 100) / 100;
}

export function normalizeScanTransactions(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;

      const amountMinor = toMinor(entry.amount);
      const description = String(entry.description || '').trim().slice(0, 160);
      const occurredOn = normalizeStatementDate(entry.date);

      if (!amountMinor || amountMinor <= 0 || !occurredOn) return null;

      const isCredit = String(entry.direction || '').toLowerCase().startsWith('cr');

      return {
        occurredOn,
        description: description || (isCredit ? 'Received' : 'Payment'),
        direction: isCredit ? 'credit' : 'debit',
        amountMinor,
        category: isCredit ? MISC_INCOME_CATEGORY : normalizeScanExpenseCategory(entry.category),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1))
    .slice(0, 500);
}

export function normalizeScanReceipt(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const totalMinor = toMinor(raw.total);
  const merchant = String(raw.merchant || '').trim().slice(0, 160);

  if (!merchant && totalMinor <= 0) {
    return null;
  }

  // Every printed line is kept, including zero-amount and negative (discount)
  // lines — the user decides what counts, so nothing is silently dropped here.
  // Summary rows are the one exception: they total the other lines, so letting
  // one through would double-count the bill. Some models list them despite
  // being told not to, so they are filtered here as well.
  const lineItems = (Array.isArray(raw.lineItems) ? raw.lineItems : [])
    .filter((line) => line && String(line.description || '').trim())
    .filter((line) => !SUMMARY_LINE_PATTERN.test(String(line.description).trim()))
    .slice(0, 200)
    .map((line) => {
      const amount = Number(line.amount);
      const magnitudeMinor = toMinor(Math.abs(Number.isFinite(amount) ? amount : 0));

      return {
        description: String(line.description).trim().slice(0, 160),
        quantity: sanitizeScanQuantity(line.quantity),
        amountMinor: Number.isFinite(amount) && amount < 0 ? -magnitudeMinor : magnitudeMinor,
        category: normalizeScanExpenseCategory(line.category || raw.category),
      };
    });

  return {
    merchant,
    totalMinor,
    currency: normalizeCurrency(raw.currency || 'INR'),
    date: normalizeScanDate(raw.date),
    category: normalizeScanExpenseCategory(raw.category),
    lineItems,
  };
}
