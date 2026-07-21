import { notifyUnauthorized } from '../lib/session';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export async function getMealPlan(from, to) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  return apiRequest(`/pantry/meal-plan${query ? `?${query}` : ''}`);
}

export async function addMealPlanEntry(payload) {
  return apiRequest('/pantry/meal-plan', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function generateMealPlan(payload) {
  return apiRequest('/pantry/meal-plan/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateMealPlanEntry(id, payload) {
  return apiRequest(`/pantry/meal-plan/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteMealPlanEntry(id) {
  return apiRequest(`/pantry/meal-plan/${encodeURIComponent(id)}`, {
    method: 'DELETE',
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
