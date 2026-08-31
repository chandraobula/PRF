import { describe, expect, it } from 'vitest';

import { HttpError } from './errors.js';
import {
  moneyFromPayload,
  normalizeAmount,
  normalizeCurrency,
  normalizeMoney,
  requiredMoneyFromPayload,
  toMinor,
} from './money.js';

/**
 * These tests pin the behaviour that exists today, including the places where
 * it is inconsistent. Where a test documents something arguably wrong it says
 * so, so that changing it is a deliberate decision rather than an accident.
 */

describe('normalizeCurrency', () => {
  it('upper-cases and trims a supported currency', () => {
    expect(normalizeCurrency('  usd  ')).toBe('USD');
    expect(normalizeCurrency('inr')).toBe('INR');
  });

  it('defaults to INR when the currency is missing', () => {
    expect(normalizeCurrency(undefined)).toBe('INR');
    expect(normalizeCurrency(null)).toBe('INR');
    expect(normalizeCurrency('')).toBe('INR');
  });

  it('rejects a currency outside the supported pair with a 400', () => {
    expect(() => normalizeCurrency('EUR')).toThrow(HttpError);
    expect(() => normalizeCurrency('EUR')).toThrow('Currency must be USD or INR.');

    try {
      normalizeCurrency('EUR');
    } catch (error) {
      expect(error.status).toBe(400);
    }
  });

  // detectRegion() can return GB, AE or SG, and the region -> currency path
  // feeds this function. Those three regions have no supported currency, so
  // this rejection is reachable from ordinary onboarding, not just bad input.
  it.each(['GBP', 'AED', 'SGD'])('rejects %s, which region detection can imply', (currency) => {
    expect(() => normalizeCurrency(currency)).toThrow('Currency must be USD or INR.');
  });
});

describe('toMinor', () => {
  it('converts major units to minor units', () => {
    expect(toMinor(10)).toBe(1000);
    expect(toMinor(10.5)).toBe(1050);
    expect(toMinor(0.01)).toBe(1);
  });

  it('coerces numeric strings', () => {
    expect(toMinor('25.99')).toBe(2599);
  });

  it('returns the 0 sentinel rather than throwing on unusable input', () => {
    expect(toMinor(undefined)).toBe(0);
    expect(toMinor(null)).toBe(0);
    expect(toMinor('')).toBe(0);
    expect(toMinor('not a number')).toBe(0);
    expect(toMinor(Number.NaN)).toBe(0);
    expect(toMinor(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('treats zero and negative amounts as unusable', () => {
    expect(toMinor(0)).toBe(0);
    expect(toMinor(-5)).toBe(0);
  });

  // Math.round(value * 100) inherits binary floating point error. 1.005 * 100
  // is 100.49999999999999, so the half-paisa rounds down and a unit is lost.
  // Pinned as a known limitation of the current implementation.
  it('loses a minor unit on amounts that float-multiply just below .5', () => {
    expect(toMinor(1.005)).toBe(100);
    expect(toMinor(1.015)).toBe(101);
  });

  it('rounds ordinary two-decimal amounts correctly despite float error', () => {
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor(0.29)).toBe(29);
    expect(toMinor(1234.56)).toBe(123456);
  });
});

describe('normalizeAmount', () => {
  it('converts major units when alreadyMinor is false', () => {
    expect(normalizeAmount(10, false)).toBe(1000);
    expect(normalizeAmount('19.99', false)).toBe(1999);
  });

  it('rounds to a whole minor unit when alreadyMinor is true', () => {
    expect(normalizeAmount(1000, true)).toBe(1000);
    expect(normalizeAmount(10.6, true)).toBe(11);
  });

  it('accepts zero as a valid amount', () => {
    expect(normalizeAmount(0, false)).toBe(0);
  });

  it('rejects a missing amount with a 400', () => {
    for (const value of [undefined, null, '']) {
      expect(() => normalizeAmount(value, false)).toThrow('Amount is required.');
    }
  });

  it('rejects a negative or unparseable amount with a 400', () => {
    expect(() => normalizeAmount(-1, false)).toThrow('Amount must be a positive number.');
    expect(() => normalizeAmount('abc', false)).toThrow('Amount must be a positive number.');
    expect(() => normalizeAmount(Number.POSITIVE_INFINITY, false)).toThrow('Amount must be a positive number.');
  });
});

/**
 * The two converters above do the same job and disagree on every invalid input.
 * toMinor swallows it as 0; normalizeAmount raises a 400. Both are reachable
 * from user-facing paths -- toMinor via the AI scan importers, normalizeAmount
 * via ordinary form submission -- so the same bad receipt line can either
 * vanish silently or produce an error depending on which route it arrives by.
 */
describe('toMinor vs normalizeAmount (known divergence)', () => {
  it.each([
    ['a negative amount', -5],
    ['an unparseable string', 'abc'],
    ['NaN', Number.NaN],
  ])('disagrees on %s: toMinor returns 0, normalizeAmount throws', (_label, value) => {
    expect(toMinor(value)).toBe(0);
    expect(() => normalizeAmount(value, false)).toThrow(HttpError);
  });

  it('also disagrees on zero, where toMinor is falsy but normalizeAmount succeeds', () => {
    expect(toMinor(0)).toBe(0);
    expect(normalizeAmount(0, false)).toBe(0);
  });

  it('agrees on well-formed positive amounts', () => {
    for (const value of [1, 10.5, 19.99, 1234.56]) {
      expect(toMinor(value)).toBe(normalizeAmount(value, false));
    }
  });
});

describe('normalizeMoney', () => {
  it('prefers the minor-unit value when one is supplied', () => {
    expect(normalizeMoney(1500, 99)).toBe(1500);
  });

  it('falls back to the major-unit value when the minor value is absent', () => {
    expect(normalizeMoney(undefined, 10)).toBe(1000);
    expect(normalizeMoney(null, 10)).toBe(1000);
    expect(normalizeMoney('', 10)).toBe(1000);
  });

  // 0 is a real minor-unit value, so it must win over the major-unit argument
  // rather than being treated as absent.
  it('treats an explicit zero minor value as present', () => {
    expect(normalizeMoney(0, 10)).toBe(0);
  });

  it('throws when neither value is supplied', () => {
    expect(() => normalizeMoney(undefined, undefined)).toThrow('Amount is required.');
  });
});

describe('moneyFromPayload', () => {
  it('returns the first present minor key in order', () => {
    const payload = { balanceMinor: 500, amountMinor: 900 };
    expect(moneyFromPayload(payload, ['amountMinor', 'balanceMinor'], [])).toBe(900);
    expect(moneyFromPayload(payload, ['balanceMinor', 'amountMinor'], [])).toBe(500);
  });

  it('falls back to the major-unit keys when no minor key is present', () => {
    expect(moneyFromPayload({ amount: 12.5 }, ['amountMinor'], ['amount'])).toBe(1250);
  });

  it('skips keys that are absent, null or empty', () => {
    const payload = { amountMinor: '', balanceMinor: null, amount: 7 };
    expect(moneyFromPayload(payload, ['amountMinor', 'balanceMinor'], ['amount'])).toBe(700);
  });

  it('returns undefined when the payload carries no money at all', () => {
    expect(moneyFromPayload({ note: 'hi' }, ['amountMinor'], ['amount'])).toBeUndefined();
  });

  it('propagates the 400 when a present key holds an invalid amount', () => {
    expect(() => moneyFromPayload({ amount: -3 }, ['amountMinor'], ['amount']))
      .toThrow('Amount must be a positive number.');
  });
});

describe('requiredMoneyFromPayload', () => {
  it('returns the amount when the payload supplies one', () => {
    expect(requiredMoneyFromPayload({ amount: 4 }, ['amountMinor'], ['amount'])).toBe(400);
  });

  it('throws the caller-supplied message when nothing is present', () => {
    expect(() => requiredMoneyFromPayload({}, ['amountMinor'], ['amount'], 'Budget limit is required.'))
      .toThrow('Budget limit is required.');
  });

  it('falls back to a default message when the caller supplies none', () => {
    expect(() => requiredMoneyFromPayload({}, ['amountMinor'], ['amount']))
      .toThrow('Amount is required.');
  });
});
