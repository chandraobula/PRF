import { apiRequest } from './http';

// --- Dashboard ---
export function getAdminDashboard() {
  return apiRequest('/admin/dashboard');
}

// --- Users ---
export function listAdminUsers(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.role) query.set('role', params.role);
  if (params.sort) query.set('sort', params.sort);
  if (params.order) query.set('order', params.order);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiRequest(`/admin/users${qs ? `?${qs}` : ''}`);
}

export function getAdminUser(userId) {
  return apiRequest(`/admin/users/${encodeURIComponent(userId)}`);
}

export function updateAdminUser(userId, payload) {
  return apiRequest(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteAdminUser(userId) {
  return apiRequest(`/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

// --- Audit Log ---
export function listAuditLog(params = {}) {
  const query = new URLSearchParams();
  if (params.action) query.set('action', params.action);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiRequest(`/admin/audit-log${qs ? `?${qs}` : ''}`);
}

// --- Config ---
export function getAdminConfig() {
  return apiRequest('/admin/config');
}

export function updateAdminConfig(payload) {
  return apiRequest('/admin/config', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// --- Announcements ---
export function listAdminAnnouncements() {
  return apiRequest('/admin/announcements');
}

export function createAnnouncement(payload) {
  return apiRequest('/admin/announcements', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAnnouncement(id, payload) {
  return apiRequest(`/admin/announcements/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteAnnouncement(id) {
  return apiRequest(`/admin/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
