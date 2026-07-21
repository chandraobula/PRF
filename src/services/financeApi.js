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
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amountMinor / 100);
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
