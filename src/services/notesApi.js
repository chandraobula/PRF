import { apiRequest } from './http';

export function getNotes() {
  return apiRequest('/notes');
}

export function addNote(payload) {
  return apiRequest('/notes', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateNote(id, payload) {
  return apiRequest(`/notes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteNote(id) {
  return apiRequest(`/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function resurfaceNotes() {
  return apiRequest('/notes/resurface');
}
