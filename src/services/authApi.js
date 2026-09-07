const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const ACCOUNT_CACHE_MS = 30_000;

let currentAccountCache = null;
let currentAccountPromise = null;

export async function registerAccount({ displayName, email, password }) {
  const result = await authRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ displayName, email, password }),
  });
  cacheCurrentAccount(result);
  return result;
}

export async function loginAccount({ email, password }) {
  const result = await authRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  cacheCurrentAccount(result);
  return result;
}

export async function getCurrentAccount() {
  if (currentAccountCache && Date.now() - currentAccountCache.cachedAt < ACCOUNT_CACHE_MS) {
    return currentAccountCache.value;
  }

  if (currentAccountPromise) return currentAccountPromise;

  currentAccountPromise = authRequest('/auth/me')
    .then((result) => {
      cacheCurrentAccount(result);
      return result;
    })
    .catch(() => ({ authenticated: false }))
    .finally(() => {
      currentAccountPromise = null;
    });

  try {
    return await currentAccountPromise;
  } catch {
    return { authenticated: false };
  }
}

export async function logoutAccount() {
  currentAccountCache = null;
  currentAccountPromise = null;
  return authRequest('/auth/logout', { method: 'POST' });
}

function cacheCurrentAccount(value) {
  currentAccountCache = { value, cachedAt: Date.now() };
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
