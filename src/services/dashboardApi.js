import { apiRequest } from './http';

export function getDashboard(currency = 'INR', date) {
  const params = new URLSearchParams({ currency });
  if (date) params.set('date', date);
  return apiRequest(`/dashboard?${params.toString()}`);
}
