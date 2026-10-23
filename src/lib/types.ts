import type { DayKey } from './dates';

/**
 * simple  – one tap marks the day done.
 * counter – increment toward an integer target (e.g. 8 glasses).
 * numeric – enter a measured value toward a target (e.g. 7.5 of 8 hours).
 */
export type HabitType = 'simple' | 'counter' | 'numeric';

/** Weekdays a habit is scheduled on, effective from `from` onward. */
export interface ScheduleVersion {
  from: DayKey;
  /** Sorted weekday numbers, 0 = Sunday … 6 = Saturday. */
  days: number[];
}

export interface Habit {
  id: string;
  name: string;
  icon: string;
  type: HabitType;
  /** 1 for simple habits. */
  target: number;
  unit: string;
  /** First day the habit is tracked. */
  start: DayKey;
  /** Ordered by `from`, first entry's `from` equals `start`. Never rewritten retroactively. */
  schedule: ScheduleVersion[];
  order: number;
  createdAt: number;
}

/**
 * One recorded day. The target is snapshotted when the value is saved so
 * that later goal edits never change whether a past day counted.
 */
export interface Entry {
  /** `${habitId}|${date}` */
  id: string;
  habitId: string;
  date: DayKey;
  value: number;
  target: number;
}

export const entryId = (habitId: string, date: DayKey) => `${habitId}|${date}`;

export const isComplete = (entry: Entry | undefined): boolean =>
  !!entry && entry.value >= entry.target && entry.value > 0;
