const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export async function registerAccount({ displayName, email, password }) {
  return authRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ displayName, email, password }),
  });
}

export async function loginAccount({ email, password }) {
  return authRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getCurrentAccount() {
  try {
    return await authRequest('/auth/me');
  } catch {
    return { authenticated: false };
  }
}

export async function logoutAccount() {
  return authRequest('/auth/logout', { method: 'POST' });
}

async function authRequest(path, options = {}) {
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
    throw new Error(body.error || 'Account request failed.');
  }

  return body;
}
