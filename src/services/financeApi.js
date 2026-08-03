import { notifyUnauthorized } from '../lib/session';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export async function getFinanceDashboard(currency = 'USD', asOf) {
  const params = new URLSearchParams({ currency });
  if (asOf) params.set('asOf', asOf);
  const data = await apiRequest(`/finance/summary?${params.toString()}`);
  return { ...data, isLive: true };
}

export async function getFinanceTransactions({ currency = 'USD', startDate, endDate, limit = 500 } = {}) {
  const params = new URLSearchParams({ currency, limit: String(limit) });
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const data = await apiRequest(`/finance/transactions?${params.toString()}`);
  return data.transactions || [];
}

export async function addFinanceTransaction(payload) {
  const response = await apiRequest('/finance/transactions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return { transaction: response.transaction, isLive: true };
}

export async function updateFinanceTransaction(id, payload) {
  const response = await apiRequest(`/finance/transactions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return { transaction: response.transaction, isLive: true };
}

export async function deleteFinanceTransaction(id) {
  return apiRequest(`/finance/transactions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function getFinanceReceipts(currency = 'USD') {
  return apiRequest(`/finance/receipts?currency=${encodeURIComponent(currency)}`);
}

export async function scanFinanceDocument(payload) {
  return apiRequest('/finance/scan', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function addFinanceReceipt(payload) {
  return apiRequest('/finance/receipts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateFinanceReceipt(id, payload) {
  return apiRequest(`/finance/receipts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteFinanceReceipt(id) {
  return apiRequest(`/finance/receipts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function getFinanceLiabilities(currency = 'USD') {
  return apiRequest(`/finance/liabilities?currency=${encodeURIComponent(currency)}`);
}

export async function addFinanceLiability(payload) {
  return apiRequest('/finance/liabilities', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateFinanceLiability(id, payload) {
  return apiRequest(`/finance/liabilities/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteFinanceLiability(id) {
  return apiRequest(`/finance/liabilities/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function recordFinanceLiabilityPayment(id, payload) {
  return apiRequest(`/finance/liabilities/${encodeURIComponent(id)}/payment`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// -- Budgets -----------------------------------------------------------------

export async function addFinanceBudget(payload) {
  const response = await apiRequest('/finance/budgets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.budget;
}

export async function updateFinanceBudget(id, payload) {
  const response = await apiRequest(`/finance/budgets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return response.budget;
}

export async function deleteFinanceBudget(id) {
  return apiRequest(`/finance/budgets/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// -- Goals -------------------------------------------------------------------

export async function addFinanceGoal(payload) {
  const response = await apiRequest('/finance/goals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.goal;
}

export async function updateFinanceGoal(id, payload) {
  const response = await apiRequest(`/finance/goals/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return response.goal;
}

export async function deleteFinanceGoal(id) {
  return apiRequest(`/finance/goals/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** direction: 'deposit' (default) or 'withdraw'. */
export async function contributeToFinanceGoal(id, { amount, direction = 'deposit' }) {
  const response = await apiRequest(`/finance/goals/${encodeURIComponent(id)}/contribute`, {
    method: 'POST',
    body: JSON.stringify({ amount, direction }),
  });
  return response.goal;
}

export async function getFinanceAnalytics(currency = 'USD', asOf) {
  const params = new URLSearchParams({ currency });
  if (asOf) params.set('asOf', asOf);
  return apiRequest(`/finance/analytics?${params.toString()}`);
}

export async function importFinanceTransactions({ transactions, currency = 'USD', skipDuplicates = true }) {
  return apiRequest('/finance/import', {
    method: 'POST',
    body: JSON.stringify({ transactions, currency, skipDuplicates }),
  });
}

export function financeExportUrl(currency = 'USD') {
  return `${API_BASE_URL}/finance/export.csv?currency=${encodeURIComponent(currency)}`;
}

export function formatMoney(amountMinor = 0, currency = 'USD') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

export function formatMoneyCompact(amountMinor = 0, currency = 'USD') {
  const amount = amountMinor / 100;

  // Compact notation only earns its keep above a thousand. Below that it just
  // adds a stray decimal ("$329.9"), so show the plain rounded figure instead.
  if (Math.abs(amount) < 1000) {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    if (response.status === 401) {
      notifyUnauthorized();
    }
    throw new Error(body.error || body.message || `Request failed with ${response.status}`);
  }

  return body;
}
