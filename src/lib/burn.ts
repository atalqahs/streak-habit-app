import { weekStart, type DayKey } from './dates';

/** A weekly goal in effect from the week starting `from` (a Sunday) onward. */
export interface BurnGoalVersion {
  from: DayKey;
  goal: number;
}

/** Weekly calorie-burn configuration. Stored as a single record. */
export interface BurnSettings {
  id: 'settings';
  /** Ordered by `from`. Past weeks keep the goal they had. */
  goals: BurnGoalVersion[];
  /** Planned training weekdays (0 = Sunday). For reference only; logging is never restricted. */
  trainingDays: number[];
  updatedAt: number;
}

/** One manually entered workout burn. */
export interface BurnEntry {
  id: string;
  /** Day in Asia/Kuwait. */
  date: DayKey;
  /** Whole kilocalories, ≥ 0. */
  kcal: number;
  recordedAt: number;
}

export const MAX_KCAL = 1_000_000;

/** "1,750" */
export const formatKcal = (n: number) => Math.round(n).toLocaleString('en-US');

/** Accepts only a non-negative whole number typed by the user; returns kcal or an error message. */
export function parseKcal(text: string): number | string {
  const trimmed = text.trim().replace(/[,\s]/g, '');
  if (!trimmed) return 'Enter the calories you burned.';
  if (!/^\d+$/.test(trimmed)) return 'Enter a whole number of 0 or more.';
  const n = Number(trimmed);
  if (n > MAX_KCAL) return `Enter ${formatKcal(MAX_KCAL)} kcal or less.`;
  return n;
}

/** Validates a weekly goal: a whole number of at least 1. */
export function parseGoal(text: string): number | string {
  const n = parseKcal(text);
  if (typeof n === 'string') return n === 'Enter the calories you burned.' ? 'Enter your weekly goal.' : n;
  if (n < 1) return 'Your weekly goal must be at least 1 kcal.';
  return n;
}

/** The goal that applies to the week starting `week`. Weeks before the first version use the first goal. */
export function goalFor(settings: BurnSettings, week: DayKey): number {
  let goal = settings.goals[0]?.goal ?? 0;
  for (const v of settings.goals) {
    if (v.from <= week) goal = v.goal;
    else break;
  }
  return goal;
}

/**
 * Returns settings with a new weekly goal effective from the current week.
 * Earlier weeks keep their goal; editing again in the same week replaces it.
 */
export function withGoal(settings: BurnSettings | null, goal: number, today: DayKey): BurnGoalVersion[] {
  const week = weekStart(today);
  const kept = (settings?.goals ?? []).filter((v) => v.from < week);
  if (kept.length && kept[kept.length - 1].goal === goal) return kept;
  return [...kept, { from: week, goal }];
}

export function sortBurn(entries: BurnEntry[]): BurnEntry[] {
  return [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.recordedAt - b.recordedAt || a.id.localeCompare(b.id),
  );
}

export interface WeekBurn {
  week: DayKey;
  total: number;
  goal: number;
  /** Newest first. */
  entries: BurnEntry[];
}

/** Sum of all entries in the Sunday–Saturday week starting `week`. */
export function weekTotal(entries: BurnEntry[], week: DayKey): number {
  let total = 0;
  for (const e of entries) if (weekStart(e.date) === week) total += e.kcal;
  return total;
}

/** Every week that has entries, plus the current week, newest first. */
export function weeklyHistory(settings: BurnSettings, entries: BurnEntry[], today: DayKey): WeekBurn[] {
  const byWeek = new Map<DayKey, BurnEntry[]>([[weekStart(today), []]]);
  for (const e of sortBurn(entries)) {
    const w = weekStart(e.date);
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w)!.push(e);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([week, list]) => ({
      week,
      total: list.reduce((sum, e) => sum + e.kcal, 0),
      goal: goalFor(settings, week),
      entries: list.reverse(),
    }));
}

export interface BurnProgress {
  total: number;
  goal: number;
  /** Unclamped fraction of the goal. */
  ratio: number;
  remaining: number;
  surplus: number;
  reached: boolean;
}

export function progress(total: number, goal: number): BurnProgress {
  return {
    total,
    goal,
    ratio: goal > 0 ? total / goal : 0,
    remaining: Math.max(goal - total, 0),
    surplus: Math.max(total - goal, 0),
    reached: goal > 0 && total >= goal,
  };
}
