import { addDays, diffDays, weekday, type DayKey } from './dates';
import { isComplete, type Entry, type Habit, type ScheduleVersion } from './types';

/** The schedule version in effect on `date`, or null before the habit starts. */
export function scheduleOn(habit: Habit, date: DayKey): ScheduleVersion | null {
  if (date < habit.start) return null;
  let found: ScheduleVersion | null = null;
  for (const version of habit.schedule) {
    if (version.from <= date) found = version;
    else break;
  }
  return found;
}

export function isScheduled(habit: Habit, date: DayKey): boolean {
  const version = scheduleOn(habit, date);
  return !!version && version.days.includes(weekday(date));
}

/**
 * Returns a habit with new scheduled weekdays effective from `today`.
 * Earlier days keep the schedule they had, so past streaks never change.
 */
export function withSchedule(habit: Habit, days: number[], today: DayKey): Habit {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const current = habit.schedule[habit.schedule.length - 1];
  if (current && current.days.join() === sorted.join()) return habit;
  const kept = habit.schedule.filter((v) => v.from < today);
  const from = today < habit.start ? habit.start : today;
  const schedule = [...kept, { from, days: sorted }];
  return { ...habit, schedule };
}

export type StreakStatus = 'none' | 'active' | 'at-risk' | 'broken';

export interface StreakInfo {
  current: number;
  best: number;
  total: number;
  status: StreakStatus;
  /** Streak value that was lost on the most recent break (status "broken"). */
  lost: number;
  todayScheduled: boolean;
  todayDone: boolean;
  /** Next scheduled day on or after today that still needs completing. */
  nextDue: DayKey | null;
}

/**
 * Derives the streak from stored history and the schedule in effect each day.
 *
 * - Each completed scheduled day adds 1.
 * - Unscheduled days are skipped (a completion there counts toward the total only).
 * - One missed scheduled day puts the streak at risk; the next scheduled day
 *   must be completed to keep it. A second consecutive miss resets it to 0.
 * - Today is never counted as missed until its Asia/Kuwait day has ended.
 */
export function computeStreak(
  habit: Habit,
  entries: ReadonlyMap<DayKey, Entry> | undefined,
  today: DayKey,
): StreakInfo {
  let current = 0;
  let best = 0;
  let total = 0;
  let misses = 0;
  let lost = 0;
  let todayScheduled = false;
  let todayDone = false;

  for (let day = habit.start; day <= today; day = addDays(day, 1)) {
    const done = isComplete(entries?.get(day));
    if (done) total++;
    const scheduled = isScheduled(habit, day);
    if (day === today) {
      todayScheduled = scheduled;
      todayDone = done;
    }
    if (!scheduled) continue;
    if (done) {
      current++;
      misses = 0;
      lost = 0;
      if (current > best) best = current;
    } else if (day !== today) {
      misses++;
      if (misses === 2 && current > 0) {
        lost = current;
        current = 0;
      }
    }
  }

  // Completions recorded before the start date (possible via import) still count.
  if (entries) {
    for (const entry of entries.values()) {
      if (entry.date < habit.start && isComplete(entry)) total++;
    }
  }

  let status: StreakStatus = 'none';
  if (current > 0) status = misses === 1 ? 'at-risk' : 'active';
  else if (lost > 0) status = 'broken';

  let nextDue: DayKey | null = null;
  if (todayScheduled && !todayDone) nextDue = today;
  else {
    for (let i = 1; i <= 7; i++) {
      const day = addDays(today, i);
      if (isScheduled(habit, day)) {
        nextDue = day;
        break;
      }
    }
  }

  return { current, best, total, status, lost, todayScheduled, todayDone, nextDue };
}

/** Human-readable explanation of the streak state, used in the details sheet. */
export function describeStreak(info: StreakInfo, today: DayKey, dayName: (d: DayKey) => string): string {
  const when = (d: DayKey | null) =>
    !d
      ? 'on its next scheduled day'
      : d === today
        ? 'today'
        : diffDays(d, today) === 1
          ? 'tomorrow'
          : `on ${dayName(d)}`;
  switch (info.status) {
    case 'at-risk':
      return `At risk — one scheduled day was missed. Complete it ${when(info.nextDue)} to keep your streak.`;
    case 'active':
      if (info.todayDone) return 'On track — completed today.';
      if (info.todayScheduled) return `On track — complete it today to reach ${info.current + 1}.`;
      return `On track — next scheduled ${when(info.nextDue)}.`;
    case 'broken':
      return `Your ${info.lost}-day streak ended after two missed scheduled days. Complete it ${when(info.nextDue)} to start again.`;
    default:
      return `No active streak yet. Complete it ${when(info.nextDue)} to start one.`;
  }
}
