// ---------------------------------------------------------------------------
// CSV parsing helpers for bank / card statement imports.
//
// Statement exports are wildly inconsistent between banks, so these are
// deliberately forgiving: quoted fields, European decimals, parenthesised
// negatives, "DR"/"CR" markers and several date orders all have to survive.
// ---------------------------------------------------------------------------

/** RFC-4180-ish parser: handles quoted fields, escaped quotes and CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);

  return rows.map((entry) => entry.map((value) => value.trim()));
}

/**
 * Normalise a statement amount.
 * Returns `{ magnitude, isNegative }` or null when the cell isn't a number.
 */
export function parseAmount(raw) {
  if (raw === undefined || raw === null) return null;

  let value = String(raw).trim();
  if (!value) return null;

  const isParenthesised = /^\(.*\)$/.test(value);
  const hasDebitMarker = /\b(dr|debit)\b/i.test(value);
  const hasCreditMarker = /\b(cr|credit)\b/i.test(value);

  value = value.replace(/[()]/g, '').replace(/\b(dr|cr|debit|credit)\b/gi, '');
  value = value.replace(/[^\d.,-]/g, '');
  if (!value || !/\d/.test(value)) return null;

  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');

  if (lastComma > lastDot) {
    // European style: 1.234,56
    value = value.replace(/\./g, '').replace(',', '.');
  } else {
    value = value.replace(/,/g, '');
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  return {
    magnitude: Math.abs(parsed),
    isNegative: parsed < 0 || isParenthesised || (hasDebitMarker && !hasCreditMarker),
  };
}

/** Accepts ISO, D/M/Y and M/D/Y, plus "12 Mar 2026" style statement dates. */
export function parseDate(raw) {
  if (!raw) return null;
  const value = String(raw).trim();

  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const slash = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (slash) {
    let [, first, second, year] = slash;
    if (year.length === 2) year = `20${year}`;
    // Ambiguous D/M vs M/D: a value above 12 in the first slot settles it,
    // otherwise assume day-first, which covers most non-US statements.
    const dayFirst = Number(first) > 12 || Number(second) <= 12;
    const day = dayFirst ? first : second;
    const month = dayFirst ? second : first;
    if (Number(month) > 12 || Number(day) > 31 || Number(month) < 1 || Number(day) < 1) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Textual forms ("12 Mar 2026") parse as local midnight, so read the date back
  // in local components — toISOString() would shift the day in any non-UTC zone.
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return null;
}
