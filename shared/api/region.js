export const DETECTABLE_REGIONS = new Set(['IN', 'US', 'GB', 'AE', 'SG']);

export const TIMEZONE_REGIONS = {
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
  'Asia/Dubai': 'AE',
  'Asia/Singapore': 'SG',
  'Europe/London': 'GB',
};

// Country the browser signals point at, preferring the locale's explicit region
// subtag ('en-US') and falling back to the timezone when the locale has none.
export function detectRegion(timezone, locale) {
  const fromLocale = String(locale || '').split(/[-_]/)[1];

  if (fromLocale && DETECTABLE_REGIONS.has(fromLocale.toUpperCase())) {
    return fromLocale.toUpperCase();
  }

  if (TIMEZONE_REGIONS[timezone]) {
    return TIMEZONE_REGIONS[timezone];
  }

  return timezone && timezone.startsWith('America/') ? 'US' : null;
}
