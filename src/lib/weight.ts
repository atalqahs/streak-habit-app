import type { DayKey } from './dates';

/** Starting and goal weight, in kilograms. Stored as a single record. */
export interface WeightSettings {
  id: 'settings';
  start: number;
  goal: number;
  updatedAt: number;
}

/** One recorded measurement, in kilograms. */
export interface WeightEntry {
  /** Stable identifier (UUID). */
  id: string;
  /** Measurement day in Asia/Kuwait. */
  date: DayKey;
  value: number;
  /** When it was recorded (ms). Orders several measurements on the same day. */
  recordedAt: number;
}

export const MIN_KG = 20;
export const MAX_KG = 400;
const MILESTONE_STEP = 5;
const EPSILON = 0.05;

/** Chronological order: by day, then by time recorded, then id for a stable tie-break. */
export function sortEntries(entries: WeightEntry[]): WeightEntry[] {
  return [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.recordedAt - b.recordedAt || a.id.localeCompare(b.id),
  );
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** "86.4 kg" */
export const formatKg = (n: number) => `${round1(n).toFixed(1)} kg`;

/** Parses user input ("86,4" or "86.4") into kilograms, or returns an error message. */
export function parseKg(text: string): number | string {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return 'Enter a weight.';
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return 'Enter a number, like 86.4.';
  if (n < MIN_KG || n > MAX_KG) return `Enter a weight between ${MIN_KG} and ${MAX_KG} kg.`;
  return Math.round(n * 100) / 100;
}

export type ChangeDirection = 'down' | 'up' | 'same';

export interface WeightSummary {
  current: number | null;
  /** Latest minus previous measurement; null with fewer than two measurements. */
  change: number | null;
  changeDirection: ChangeDirection | null;
  direction: 'lose' | 'gain';
  /** Unclamped progress from start toward goal, 0–1 is the normal range. */
  progress: number;
  /** Progress made toward the goal in kg (negative when moving away from it). */
  achieved: number;
  remaining: number;
  reached: boolean;
  nextMilestone: number | null;
  toMilestone: number | null;
}

/**
 * Next milestone on the 5 kg grid between the current weight and the goal.
 * The goal itself is the final milestone; null once it is reached.
 */
export function nextMilestone(current: number, goal: number, direction: 'lose' | 'gain'): number | null {
  if (direction === 'lose') {
    if (current <= goal) return null;
    const step = Math.ceil(round1(current) / MILESTONE_STEP - 1) * MILESTONE_STEP;
    return step > goal ? step : goal;
  }
  if (current >= goal) return null;
  const step = Math.floor(round1(current) / MILESTONE_STEP + 1) * MILESTONE_STEP;
  return step < goal ? step : goal;
}

/** Every value shown on the Weight card, derived only from persisted data. */
export function summarize(settings: WeightSettings, entries: WeightEntry[]): WeightSummary {
  const sorted = sortEntries(entries);
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const direction = settings.goal < settings.start ? 'lose' : 'gain';
  const current = latest ? latest.value : null;

  let change: number | null = null;
  let changeDirection: ChangeDirection | null = null;
  if (latest && previous) {
    change = round1(latest.value - previous.value);
    changeDirection = Math.abs(change) < EPSILON ? 'same' : change < 0 ? 'down' : 'up';
    if (changeDirection === 'same') change = 0;
  }

  const span = settings.goal - settings.start;
  const value = current ?? settings.start;
  const achieved = direction === 'lose' ? settings.start - value : value - settings.start;
  const progress = span === 0 ? 0 : (value - settings.start) / span || 0; // avoid -0
  const reached =
    current !== null && (direction === 'lose' ? value <= settings.goal : value >= settings.goal);
  const remaining = reached ? 0 : Math.abs(settings.goal - value);
  const milestone = current === null ? null : nextMilestone(current, settings.goal, direction);

  return {
    current,
    change,
    changeDirection,
    direction,
    progress,
    achieved,
    remaining,
    reached,
    nextMilestone: milestone,
    toMilestone: milestone === null || current === null ? null : Math.abs(current - milestone),
  };
}
