import { apiRequest } from './http';

export function getImportantDates() {
  return apiRequest('/dates');
}

export function addImportantDate(payload) {
  return apiRequest('/dates', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateImportantDate(id, payload) {
  return apiRequest(`/dates/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteImportantDate(id) {
  return apiRequest(`/dates/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
