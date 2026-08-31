export const STICKY_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'];
export const STICKY_FONTS = ['hand', 'print', 'clean'];
export const STICKY_MAX_BODY = 8000;

// Sticky note bodies are rich text, so they are stored as HTML. Only these tags
// survive, and every attribute is dropped — see sanitizeStickyHtml.
export const STICKY_ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'mark',
  'br', 'div', 'p', 'ul', 'ol', 'li',
]);

/**
 * Allowlist sanitiser for sticky-note HTML.
 *
 * Rather than trying to scrub dangerous attributes, every tag is re-emitted from
 * scratch with no attributes at all — so there is nowhere for `onerror`,
 * `href="javascript:"` or a style expression to live. Disallowed tags are
 * dropped but their text content is kept.
 */
export function sanitizeStickyHtml(value) {
  let html = String(value == null ? '' : value).slice(0, STICKY_MAX_BODY);

  // Elements whose *content* must go too, not just their tags.
  html = html.replace(/<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '');
  html = html.replace(/<(script|style|iframe|object|embed|noscript|template)\b[^>]*>/gi, '');

  // Comments can hide conditional markup.
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g, (match, rawTag) => {
    const tag = rawTag.toLowerCase();
    if (!STICKY_ALLOWED_TAGS.has(tag)) return '';
    if (match.startsWith('</')) return `</${tag}>`;
    return tag === 'br' ? '<br>' : `<${tag}>`;
  });

  // Anything left that looks like a stray angle bracket is literal text.
  html = html.replace(/<(?![/a-zA-Z])/g, '&lt;');

  return html.slice(0, STICKY_MAX_BODY);
}

export function normalizeStickyColor(value) {
  const text = String(value || '').toLowerCase();
  return STICKY_COLORS.includes(text) ? text : 'yellow';
}

export function normalizeStickyFont(value) {
  const text = String(value || '').toLowerCase();
  return STICKY_FONTS.includes(text) ? text : 'hand';
}

export function normalizeStickyRotation(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  // Clamp the tilt so a note can never end up unreadable.
  return Math.max(-4, Math.min(4, Math.round(numeric * 100) / 100));
}
