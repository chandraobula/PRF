const STORAGE_KEY = 'lifeos-reduce-motion';

export function getStoredReduceMotion() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function applyReduceMotion(enabled) {
  document.documentElement.setAttribute('data-reduce-motion', enabled ? 'true' : 'false');
}

export function setReduceMotion(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Storage may be unavailable; still apply for the session.
  }
  applyReduceMotion(enabled);
}

export function initReduceMotion() {
  applyReduceMotion(getStoredReduceMotion());
}
