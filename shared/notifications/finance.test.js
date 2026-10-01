import { describe, expect, it } from 'vitest';
import {
  buildFinanceDigest,
  isInsideWindow,
  localClock,
  minuteToTime,
  timeToMinute,
} from './finance.js';

describe('finance notification scheduling', () => {
  it('uses the user timezone when choosing an evening window', () => {
    const clock = localClock(new Date('2026-09-25T14:45:00Z'), 'Asia/Kolkata');
    expect(clock).toMatchObject({ date: '2026-09-25', minute: 20 * 60 + 15 });
    expect(isInsideWindow(clock.minute, 20 * 60, 22 * 60)).toBe(true);
  });

  it('supports normal and overnight windows', () => {
    expect(isInsideWindow(18 * 60, 17 * 60, 19 * 60)).toBe(true);
    expect(isInsideWindow(23 * 60, 22 * 60, 60)).toBe(true);
    expect(isInsideWindow(12 * 60, 17 * 60, 19 * 60)).toBe(false);
  });

  it('normalizes time fields', () => {
    expect(timeToMinute('17:30')).toBe(1050);
    expect(minuteToTime(1050)).toBe('17:30');
  });

  it('prioritizes due bills and deep-links to their destination', () => {
    const digest = buildFinanceDigest({
      localDate: '2026-09-25',
      signals: {
        weekday: 'Fri',
        hasFinanceActivity: true,
        expenseCountToday: 0,
        dueSubscriptions: [{ name: 'Internet', daysUntil: 2 }],
      },
    });
    expect(digest.title).toBe('A gentle bill check-in');
    expect(digest.targetUrl).toBe('/subscriptions');
    expect(digest.body).toContain('due soon');
  });

  it('does not nudge an unused finance account', () => {
    expect(buildFinanceDigest({
      localDate: '2026-09-25',
      signals: { weekday: 'Fri', hasFinanceActivity: false, expenseCountToday: 0 },
    })).toBeNull();
  });
});
