import { diffDays, isDayKey, type DayKey } from './dates';

/** The current journey. Only the name and end date are user-controlled. */
export interface JourneySettings {
  id: 'settings';
  name: string;
  /** Set automatically to the Asia/Kuwait day the journey was created. */
  start: DayKey;
  end: DayKey;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_JOURNEY_NAME = 'My Journey';

export const MILESTONES = [
  { at: 0.25, label: 'Quarter Way' },
  { at: 0.5, label: 'Halfway There' },
  { at: 0.75, label: 'Final Stretch' },
  { at: 1, label: 'Journey Complete' },
] as const;

export interface JourneyProgress {
  total: number;
  /** Clamped to 0…total. */
  elapsed: number;
  /** Clamped to 0…total. */
  remaining: number;
  /** 0…1 */
  ratio: number;
  /** Whole percent, floored so 100% only appears on the end date. */
  percent: number;
  complete: boolean;
  /** Calendar day each milestone is reached on (days after start). */
  milestoneDays: number[];
  next: { label: string; daysToGo: number } | null;
  /** Milestone reached exactly today, for a one-day celebration. */
  reachedToday: string | null;
  message: string;
}

const MESSAGES = [
  'The journey has begun.',
  'Momentum is building.',
  'Halfway there.',
  'The final stretch.',
  'Journey complete.',
];

/**
 * Pure calendar-day arithmetic on Kuwait day keys (never milliseconds / 24h),
 * so it is exact across months, years, leap days and long gaps between opens.
 */
export function journeyProgress(
  journey: Pick<JourneySettings, 'start' | 'end'>,
  today: DayKey,
): JourneyProgress {
  const total = Math.max(diffDays(journey.end, journey.start), 1);
  const elapsed = Math.min(Math.max(diffDays(today, journey.start), 0), total);
  const remaining = total - elapsed;
  const ratio = elapsed / total;
  const complete = elapsed >= total;
  const milestoneDays = MILESTONES.map((m) => Math.ceil(total * m.at - 1e-9));
  const reached = milestoneDays.filter((d) => elapsed >= d).length;
  const nextIndex = milestoneDays.findIndex((d) => elapsed < d);
  // On very short journeys several milestones share a day; name the furthest one.
  let todayIndex = -1;
  milestoneDays.forEach((d, i) => {
    if (d === elapsed && elapsed > 0) todayIndex = i;
  });

  return {
    total,
    elapsed,
    remaining,
    ratio,
    percent: complete ? 100 : Math.min(Math.floor(ratio * 100), 99),
    complete,
    milestoneDays,
    next:
      nextIndex === -1
        ? null
        : { label: MILESTONES[nextIndex].label, daysToGo: milestoneDays[nextIndex] - elapsed },
    reachedToday: todayIndex === -1 ? null : MILESTONES[todayIndex].label,
    message: MESSAGES[reached],
  };
}

/** Validates an end date against a start date; returns an error message or null. */
export function endDateError(end: string, start: DayKey): string | null {
  if (!end) return 'Choose a target end date.';
  if (!isDayKey(end)) return 'Choose a valid date.';
  if (end <= start) return 'The end date must be after the start date.';
  return null;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
