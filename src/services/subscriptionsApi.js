import { apiRequest } from './http';

export function getSubscriptions() {
  return apiRequest('/subscriptions');
}

export function addSubscription(payload) {
  return apiRequest('/subscriptions', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateSubscription(id, payload) {
  return apiRequest(`/subscriptions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteSubscription(id) {
  return apiRequest(`/subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function detectSubscriptions() {
  return apiRequest('/subscriptions/detect', { method: 'POST', body: JSON.stringify({}) });
}
