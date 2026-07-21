const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export async function getContext() {
  const response = await fetch(`${API_BASE_URL}/meta/context`, { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Could not load context.');
  }
  return response.json();
}
