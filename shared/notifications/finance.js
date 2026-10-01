export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  windowStartMinute: 20 * 60,
  windowEndMinute: 22 * 60,
  maxDailyReminders: 1,
  inAppEnabled: true,
  pushEnabled: false,
  emailEnabled: false,
  expenseReminders: true,
  billReminders: true,
  budgetAlerts: true,
  friendlyReminders: true,
});

export const NOTIFICATION_WINDOWS = Object.freeze({
  evening: { start: 17 * 60, end: 19 * 60 },
  night: { start: 20 * 60, end: 22 * 60 },
});

export function timeToMinute(value, fallback = DEFAULT_NOTIFICATION_PREFERENCES.windowStartMinute) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return fallback;
  return hour * 60 + minute;
}

export function minuteToTime(value) {
  const minute = Math.max(0, Math.min(1439, Number(value) || 0));
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function localClock(date, timezone) {
  const safeDate = date instanceof Date ? date : new Date(date);
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: validTimezone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const parts = Object.fromEntries(format.formatToParts(safeDate).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: parts.weekday,
  };
}

export function isInsideWindow(minute, start, end) {
  if (start === end) return false;
  if (end > start) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

export function daysBetweenDates(from, to) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Number.POSITIVE_INFINITY;
  return Math.round((end - start) / 86_400_000);
}

export function buildFinanceDigest({ localDate, preferences = {}, signals = {} }) {
  const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...preferences };
  const items = [];
  const dueBills = [...(signals.dueSubscriptions || []), ...(signals.duePayments || [])];

  if (prefs.billReminders && dueBills.length) {
    const overdue = dueBills.filter((item) => Number(item.daysUntil) < 0).length;
    items.push({
      type: 'bills',
      text: overdue
        ? `${overdue} payment${overdue === 1 ? ' is' : 's are'} overdue`
        : `${dueBills.length} payment${dueBills.length === 1 ? ' is' : 's are'} due soon`,
      targetUrl: signals.dueSubscriptions?.length ? '/subscriptions' : '/finance?tab=liabilities',
    });
  }

  if (prefs.budgetAlerts && signals.budgetAlerts?.length) {
    const highest = Math.max(...signals.budgetAlerts.map((item) => Number(item.percent || 0)));
    items.push({
      type: 'budgets',
      text: `${signals.budgetAlerts.length} budget${signals.budgetAlerts.length === 1 ? ' needs' : 's need'} attention${highest >= 100 ? ' now' : ''}`,
      targetUrl: '/finance?tab=budgets',
    });
  }

  if (Number(signals.pendingTransactions || 0) > 0) {
    const count = Number(signals.pendingTransactions);
    items.push({
      type: 'transactions',
      text: `${count} transaction${count === 1 ? ' is' : 's are'} waiting for review`,
      targetUrl: '/finance?tab=transactions',
    });
  }

  if (
    prefs.expenseReminders
    && signals.hasFinanceActivity
    && Number(signals.expenseCountToday || 0) === 0
    && items.length < 2
  ) {
    items.push({
      type: 'expense_check_in',
      text: 'Any expenses from today still need adding?',
      targetUrl: '/finance?tab=transactions&action=add-expense',
    });
  }

  if (!items.length && prefs.friendlyReminders && signals.hasFinanceActivity && ['Wed', 'Sun'].includes(signals.weekday)) {
    items.push({
      type: 'friendly_check_in',
      text: 'A two-minute money check can keep the week clear.',
      targetUrl: '/finance?tab=overview',
    });
  }

  if (!items.length) return null;

  const primary = items[0];
  const extra = items.length > 1 ? ` ${items.slice(1).map((item) => item.text).join(' ')}` : '';
  return {
    kind: 'finance_digest',
    localDate,
    title: primary.type === 'bills' ? 'A gentle bill check-in' : 'Evening money check-in',
    body: `${primary.text}${extra}`.slice(0, 280),
    targetUrl: primary.targetUrl,
    items,
  };
}

function validTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
    return timezone || 'UTC';
  } catch {
    return 'UTC';
  }
}
