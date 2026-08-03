import { notifyUnauthorized } from '../lib/session';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export async function getStickyNotes(board = 'work') {
  const data = await apiRequest(`/sticky-notes?board=${encodeURIComponent(board)}`);
  return data.notes || [];
}

export async function createStickyNote(payload) {
  const data = await apiRequest('/sticky-notes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.note;
}

export async function updateStickyNote(id, payload) {
  const data = await apiRequest(`/sticky-notes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data.note;
}

export async function deleteStickyNote(id) {
  return apiRequest(`/sticky-notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function reorderStickyNotes(order) {
  return apiRequest('/sticky-notes/reorder', {
    method: 'POST',
    body: JSON.stringify({ order }),
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
