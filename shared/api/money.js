import { HttpError } from './errors.js';

/**
 * Money is stored in minor units (paise / cents) as integers throughout the
 * API. These helpers are the only sanctioned way to cross the major/minor
 * boundary.
 */

const SUPPORTED_CURRENCIES = ['USD', 'INR'];

export function normalizeCurrency(currency) {
  const normalized = String(currency || 'INR').trim().toUpperCase();

  if (!SUPPORTED_CURRENCIES.includes(normalized)) {
    throw new HttpError(400, 'Currency must be USD or INR.');
  }

  return normalized;
}

/**
 * Lenient major -> minor conversion used by the AI scan parsers, where the
 * model routinely emits junk and a bad row should be dropped rather than
 * rejecting the whole document. Returns 0 (a falsy sentinel the callers filter
 * on) instead of throwing.
 */
export function toMinor(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  return Math.round(numeric * 100);
}

/**
 * Strict conversion used on user-submitted payloads, where a bad amount is a
 * client error and must surface as a 400 rather than being silently coerced.
 */
export function normalizeAmount(value, alreadyMinor) {
  if (value === undefined || value === null || value === '') {
    throw new HttpError(400, 'Amount is required.');
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new HttpError(400, 'Amount must be a positive number.');
  }

  return alreadyMinor ? Math.round(numeric) : Math.round(numeric * 100);
}

export function normalizeMoney(amountMinor, amount) {
  if (amountMinor !== undefined && amountMinor !== null && amountMinor !== '') {
    return normalizeAmount(amountMinor, true);
  }

  return normalizeAmount(amount, false);
}

export function moneyFromPayload(payload, minorKeys, amountKeys) {
  for (const key of minorKeys) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
      return normalizeAmount(payload[key], true);
    }
  }

  for (const key of amountKeys) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
      return normalizeAmount(payload[key], false);
    }
  }

  return undefined;
}

export function requiredMoneyFromPayload(payload, minorKeys, amountKeys, message) {
  const value = moneyFromPayload(payload, minorKeys, amountKeys);

  if (value === undefined) {
    throw new HttpError(400, message || 'Amount is required.');
  }

  return value;
}
