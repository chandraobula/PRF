import { apiRequest } from './http';

// --- Profile ---
export function getProfile() {
  return apiRequest('/profile');
}

export function updateProfile(payload) {
  return apiRequest('/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteAccount() {
  return apiRequest('/profile', { method: 'DELETE' });
}

// --- Preferences (notifications, appearance, language & region) ---
export function getPreferences() {
  return apiRequest('/preferences');
}

export function updatePreferences(payload) {
  return apiRequest('/preferences', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// --- Integrations ---
export function listIntegrations() {
  return apiRequest('/integrations');
}

export function updateIntegration(service, status) {
  return apiRequest(`/integrations/${encodeURIComponent(service)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
