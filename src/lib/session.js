// Centralised handling for expired/invalid sessions.
// Any API helper calls notifyUnauthorized() on a 401 so the app auto-logs-out.

let redirecting = false;
const SAFE_PATHS = new Set(['/', '/auth', '/onboarding', '/splash']);

export function notifyUnauthorized() {
  if (redirecting || typeof window === 'undefined') {
    return;
  }

  const path = window.location.pathname;
  if (SAFE_PATHS.has(path)) {
    return;
  }

  redirecting = true;
  try {
    sessionStorage.setItem('lifeos-return-to', path);
  } catch {
    // Storage may be unavailable; ignore.
  }
  window.location.assign('/auth?expired=1');
}

export function isAdmin(user) {
  return user?.role === 'owner' || user?.role === 'admin';
}

export function isOwner(user) {
  return user?.role === 'owner';
}
