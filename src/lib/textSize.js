const STORAGE_KEY = 'lifeos-text-size';
const VALID = new Set(['small', 'medium', 'large']);

export function getStoredTextSize() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return VALID.has(value) ? value : 'medium';
  } catch {
    return 'medium';
  }
}

export function applyTextSize(size) {
  document.documentElement.setAttribute('data-text-size', VALID.has(size) ? size : 'medium');
}

export function setTextSize(size) {
  try {
    localStorage.setItem(STORAGE_KEY, size);
  } catch {
    // Storage may be unavailable; still apply for the session.
  }
  applyTextSize(size);
}

export function initTextSize() {
  applyTextSize(getStoredTextSize());
}
