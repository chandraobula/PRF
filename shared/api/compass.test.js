import { describe, expect, it } from 'vitest';
import {
  buildCompassToday,
  formatCompassClock,
  localTimeParts,
  weekdayIndex,
} from './compass.js';

const plan = { id: 'plan-1', defaultGraceMinutes: 20 };
const blocks = [
  { id: 'morning', title: 'Deep work', kind: 'deep_work', startMinute: 540, durationMinutes: 60, daysMask: 127, sortOrder: 0, isEnabled: true },
  { id: 'learn', title: 'Learn', kind: 'learning', startMinute: 1080, durationMinutes: 60, daysMask: 127, sortOrder: 1, isEnabled: true },
];

describe('Daily Compass domain', () => {
  it('uses the current block as the single next step', () => {
    const result = buildCompassToday({ date: '2026-09-16', nowMinute: 570, plan, blocks });
    expect(result.nextStep.id).toBe('morning');
    expect(result.blocks[0].state).toBe('current');
    expect(result.resetRecommended).toBe(false);
  });

  it('advances after a block is completed', () => {
    const result = buildCompassToday({
      date: '2026-09-16',
      nowMinute: 600,
      plan,
      blocks,
      events: [{ blockId: 'morning', status: 'completed' }],
    });
    expect(result.nextStep.id).toBe('learn');
    expect(result.blocks[0].state).toBe('completed');
  });

  it('recommends a reset without turning released blocks into failures', () => {
    const before = buildCompassToday({ date: '2026-09-16', nowMinute: 800, plan, blocks });
    expect(before.resetRecommended).toBe(true);
    expect(before.blocks[0].state).toBe('missed');

    const after = buildCompassToday({
      date: '2026-09-16',
      nowMinute: 800,
      plan,
      blocks,
      events: [{ blockId: 'morning', status: 'released' }],
    });
    expect(after.resetRecommended).toBe(false);
    expect(after.nextStep.id).toBe('learn');
  });

  it('uses a reflection fallback after the final block', () => {
    const result = buildCompassToday({
      date: '2026-09-16',
      nowMinute: 1439,
      plan,
      blocks,
      events: blocks.map((block) => ({ blockId: block.id, status: 'released' })),
    });
    expect(result.nextStep.id).toBe('close-day');
  });

  it('calculates local dates and Monday-first weekdays', () => {
    expect(localTimeParts('2026-09-15T19:00:00.000Z', 'Asia/Kolkata')).toEqual({ date: '2026-09-16', minute: 30 });
    expect(weekdayIndex('2026-09-14')).toBe(0);
    expect(formatCompassClock(1260)).toBe('9:00 PM');
  });
});
