import { notifyUnauthorized } from '../lib/session';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export async function getCarSummary() {
  return apiRequest('/car/summary');
}

export async function addVehicle(payload) {
  return apiRequest('/car/vehicles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateVehicle(id, payload) {
  return apiRequest(`/car/vehicles/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteVehicle(id) {
  return apiRequest(`/car/vehicles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function addMaintenanceItem(vehicleId, payload) {
  return apiRequest(`/car/vehicles/${encodeURIComponent(vehicleId)}/maintenance`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateMaintenanceItem(id, payload) {
  return apiRequest(`/car/maintenance/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
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
