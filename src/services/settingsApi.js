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

// Reports the browser's timezone/locale so the server can pick a default
// currency on first login. Ignored server-side once the user has chosen one.
export function detectPreferences({ timezone, locale }) {
  return apiRequest('/preferences/detect', {
    method: 'POST',
    body: JSON.stringify({ timezone, locale }),
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
