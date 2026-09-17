export const COMPASS_BLOCK_KINDS = new Set([
  'wake', 'exercise', 'prepare', 'deep_work', 'reset', 'recovery',
  'learning', 'reflection', 'wind_down', 'custom',
]);

export const COMPASS_EVENT_STATUSES = new Set(['started', 'completed', 'released']);
export const COMPASS_CHECK_KEYS = new Set(['sleep', 'exercise', 'deep_work', 'learn_build', 'reflection']);

export const DEFAULT_COMPASS_BLOCKS = [
  { kind: 'wake', title: 'Wake & move', instruction: 'Water, daylight, and prepare for exercise.', startMinute: 340, durationMinutes: 20, daysMask: 127 },
  { kind: 'exercise', title: 'Exercise', instruction: 'Move without turning every session into maximum intensity.', startMinute: 360, durationMinutes: 60, daysMask: 127 },
  { kind: 'prepare', title: 'Prepare', instruction: 'Choose one important task and remove distractions.', startMinute: 525, durationMinutes: 15, daysMask: 127 },
  { kind: 'deep_work', title: 'Deep work', instruction: 'Stay with one difficult task.', startMinute: 540, durationMinutes: 90, daysMask: 127 },
  { kind: 'reset', title: 'Lunch / reset', instruction: 'Eat, walk, and clear mental residue.', startMinute: 750, durationMinutes: 30, daysMask: 127 },
  { kind: 'learning', title: 'Learn / build', instruction: 'Continue the current Focus Theme.', startMinute: 1080, durationMinutes: 90, daysMask: 127 },
  { kind: 'reflection', title: 'Close the day', instruction: 'Capture, learn, and choose tomorrow’s one important thing.', startMinute: 1260, durationMinutes: 30, daysMask: 127 },
  { kind: 'wind_down', title: 'Wind down', instruction: 'Lower stimulation and protect sleep.', startMinute: 1290, durationMinutes: 45, daysMask: 127 },
];

const CHECK_PROPERTY = {
  sleep: 'sleep',
  exercise: 'exercise',
  deep_work: 'deepWork',
  learn_build: 'learnBuild',
  reflection: 'reflection',
};

const KIND_CHECK = {
  exercise: 'exercise',
  deep_work: 'deep_work',
  learning: 'learn_build',
  reflection: 'reflection',
};

export function localTimeParts(value = new Date(), timeZone = 'UTC') {
  const date = value instanceof Date ? value : new Date(value);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function weekdayIndex(localDate) {
  const day = new Date(`${localDate}T00:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

export function isBlockScheduled(block, localDate) {
  return (Number(block.daysMask) & (1 << weekdayIndex(localDate))) !== 0;
}

export function formatCompassClock(minute) {
  const value = Math.max(0, Math.min(1439, Number(minute) || 0));
  const hour = Math.floor(value / 60);
  const minutes = value % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function compassCheckForKind(kind) {
  return KIND_CHECK[kind] || null;
}

export function buildCompassToday({
  date,
  nowMinute,
  plan,
  blocks = [],
  events = [],
  day = null,
  checks = [],
  focusTheme = null,
}) {
  if (!plan) {
    return {
      configured: false,
      date,
      day: null,
      blocks: [],
      checks: emptyChecks(),
      nextStep: null,
      resetRecommended: false,
      focusTheme: null,
      recommendedBlocks: DEFAULT_COMPASS_BLOCKS,
    };
  }

  const eventByBlock = new Map(events.map((event) => [event.blockId, event]));
  const scheduled = blocks
    .filter((block) => block.isEnabled !== false && isBlockScheduled(block, date))
    .sort((left, right) => left.startMinute - right.startMinute || left.sortOrder - right.sortOrder)
    .map((block) => {
      const event = eventByBlock.get(block.id) || null;
      const endMinute = Math.min(1440, block.startMinute + block.durationMinutes);
      const graceMinutes = block.graceMinutes ?? plan.defaultGraceMinutes ?? 20;
      let state = event?.status || 'planned';

      if (!event) {
        if (nowMinute < block.startMinute) state = 'upcoming';
        else if (nowMinute <= endMinute + graceMinutes) state = 'current';
        else state = 'missed';
      }

      return {
        ...block,
        endMinute,
        state,
        event,
        timeLabel: `${formatCompassClock(block.startMinute)}–${formatCompassClock(endMinute)}`,
      };
    });

  const isClosed = Boolean(day?.closedAt);
  const nextBlock = !isClosed
    ? scheduled.find((block) => block.state === 'started')
      || scheduled.find((block) => block.state === 'current')
      || scheduled.find((block) => block.state === 'upcoming')
    : null;
  const nextStep = isClosed
    ? null
    : nextBlock || {
      id: 'close-day',
      kind: 'reflection',
      title: 'Close the day',
      instruction: 'Capture what is on your mind and choose tomorrow’s one important thing.',
      state: 'current',
      virtual: true,
    };
  const checkState = emptyChecks();
  for (const check of checks) {
    const property = CHECK_PROPERTY[check.key];
    if (property) checkState[property] = true;
  }

  return {
    configured: true,
    date,
    plan,
    day: day || {
      importantThing: '',
      captureText: '',
      learnText: '',
      tomorrowText: '',
      resetCount: 0,
      closedAt: null,
    },
    blocks: scheduled,
    checks: checkState,
    completedChecks: Object.values(checkState).filter(Boolean).length,
    totalChecks: 5,
    nextStep,
    resetRecommended: !isClosed && scheduled.some((block) => block.state === 'missed'),
    focusTheme,
  };
}

function emptyChecks() {
  return {
    sleep: false,
    exercise: false,
    deepWork: false,
    learnBuild: false,
    reflection: false,
  };
}
