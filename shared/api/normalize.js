import { HttpError } from './errors.js';

// ---------------------------------------------------------------------------
// Generic coercion
// ---------------------------------------------------------------------------

export function requiredText(value, message) {
  const text = String(value || '').trim();

  if (!text) {
    throw new HttpError(400, message);
  }

  return text;
}

export function normalizeEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new HttpError(400, 'Enter a valid email address.');
  }

  return normalized;
}

export function normalizeQuantity(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new HttpError(400, 'Quantity must be a positive number.');
  }

  return numeric;
}

export function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeMerchantKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Dates and routing
// ---------------------------------------------------------------------------

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeDate(value) {
  if (!value) {
    throw new HttpError(400, 'Date is required.');
  }

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'Date must be a valid YYYY-MM-DD value.');
  }

  return date.toISOString().slice(0, 10);
}

export function normalizeRoute(pathname) {
  return pathname
    .replace(/^\/api\/?/, '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export function normalizeEnum(value, allowed, message) {
  const normalized = String(value || '').trim().toLowerCase();

  if (!allowed.includes(normalized)) {
    throw new HttpError(400, message);
  }

  return normalized;
}

export function validateEnum(value, allowed, label) {
  if (!allowed.has(value)) {
    throw new HttpError(400, `Invalid ${label}.`);
  }
  return value;
}

export function normalizeTransactionType(type) {
  const normalized = String(type || '').toLowerCase();
  const allowed = new Set(['income', 'expense', 'transfer', 'refund']);

  if (!allowed.has(normalized)) {
    throw new HttpError(400, 'Transaction type must be income, expense, transfer, or refund.');
  }

  return normalized;
}

export function normalizeLiabilityType(type) {
  const normalized = String(type || '').toLowerCase();
  const allowed = new Set(['loan', 'credit_card', 'emi', 'mortgage', 'other']);

  if (!allowed.has(normalized)) {
    throw new HttpError(400, 'Loan type must be loan, credit_card, emi, mortgage, or other.');
  }

  return normalized;
}

export function normalizePantryStatus(status) {
  return normalizeEnum(status, ['active', 'used', 'expired', 'deleted'], 'Invalid pantry status.');
}

export function normalizeShoppingStatus(status) {
  return normalizeEnum(status, ['open', 'purchased', 'dismissed', 'deleted'], 'Invalid shopping status.');
}

export function normalizeShoppingSource(source) {
  return normalizeEnum(source, ['manual', 'low_stock', 'recipe', 'system'], 'Invalid shopping source.');
}

export function normalizeVehicleStatus(status) {
  return normalizeEnum(status, ['parked', 'driving', 'charging', 'service', 'inactive', 'deleted'], 'Invalid vehicle status.');
}

export function normalizeMaintenanceStatus(status) {
  return normalizeEnum(status, ['open', 'scheduled', 'done', 'dismissed', 'deleted'], 'Invalid maintenance status.');
}

export function normalizePriority(priority) {
  return normalizeEnum(priority, ['low', 'normal', 'high'], 'Invalid priority.');
}

export function normalizeMealSlot(value) {
  return normalizeEnum(value, ['breakfast', 'lunch', 'dinner', 'snack'], 'Invalid meal slot.');
}

export function normalizeMealStatus(value) {
  return normalizeEnum(value, ['planned', 'cooked', 'skipped', 'leftover'], 'Invalid meal status.');
}
