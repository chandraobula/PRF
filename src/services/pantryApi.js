import { notifyUnauthorized } from '../lib/session';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export async function getPantrySummary() {
  return apiRequest('/pantry/summary');
}

export async function addPantryItem(payload) {
  return apiRequest('/pantry/items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function addPantryItemsBulk(items) {
  return apiRequest('/pantry/items/bulk', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export async function scanPantryImage(payload) {
  return apiRequest('/pantry/scan', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updatePantryItem(id, payload) {
  return apiRequest(`/pantry/items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function consumePantryItem(id, amount = 1) {
  return apiRequest(`/pantry/items/${encodeURIComponent(id)}/consume`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export async function deletePantryItem(id) {
  return apiRequest(`/pantry/items/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function addShoppingItem(payload) {
  return apiRequest('/pantry/shopping', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateShoppingItem(id, payload) {
  return apiRequest(`/pantry/shopping/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function generatePantryRecipes() {
  return apiRequest('/pantry/recipes', {
    method: 'POST',
    body: JSON.stringify({}),
  });
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
