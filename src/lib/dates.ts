/**
 * Calendar-day helpers. Every habit day is identified by a `DayKey`
 * ("YYYY-MM-DD") in the Asia/Kuwait timezone. Arithmetic is done on UTC
 * midnights so it is immune to the device's own timezone and DST.
 */

export type DayKey = string;

export const TIME_ZONE = 'Asia/Kuwait';
export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The current habit day in Asia/Kuwait. */
export function todayKey(now: Date = new Date()): DayKey {
  const parts = partsFormatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Milliseconds until the next Asia/Kuwait midnight. */
export function msUntilNextDay(now: Date = new Date()): number {
  const next = toUtc(addDays(todayKey(now), 1));
  // Kuwait is UTC+3 all year (no DST), so local midnight is 21:00 UTC the day before.
  const boundary = next - 3 * 3_600_000;
  return Math.max(1_000, boundary - now.getTime() + 250);
}

export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== 'string' || !KEY_RE.test(value)) return false;
  return fromUtc(toUtc(value)) === value;
}

function toUtc(key: DayKey): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): DayKey {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(key: DayKey, days: number): DayKey {
  return fromUtc(toUtc(key) + days * DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(key: DayKey): number {
  return new Date(toUtc(key)).getUTCDay();
}

/** Sunday that starts the week containing `key`. */
export function weekStart(key: DayKey): DayKey {
  return addDays(key, -weekday(key));
}

export function weekDays(start: DayKey): DayKey[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((toUtc(a) - toUtc(b)) / DAY_MS);
}

function parts(key: DayKey) {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

/** "Oct 18 – 24", "Sep 28 – Oct 4", "Dec 28, 2025 – Jan 3, 2026". */
export function formatWeekRange(start: DayKey, today: DayKey): string {
  const a = parts(start);
  const b = parts(addDays(start, 6));
  const thisYear = parts(today).y;
  if (a.y !== b.y) {
    return `${MONTHS[a.m - 1]} ${a.d}, ${a.y} – ${MONTHS[b.m - 1]} ${b.d}, ${b.y}`;
  }
  const year = a.y !== thisYear ? `, ${a.y}` : '';
  if (a.m === b.m) return `${MONTHS[a.m - 1]} ${a.d} – ${b.d}${year}`;
  return `${MONTHS[a.m - 1]} ${a.d} – ${MONTHS[b.m - 1]} ${b.d}${year}`;
}

/** "Thursday, Oct 23" (with year when it differs from today's). */
export function formatDay(key: DayKey, today: DayKey): string {
  const { y, m, d } = parts(key);
  const year = y !== parts(today).y ? `, ${y}` : '';
  return `${WEEKDAY_NAMES[weekday(key)]}, ${MONTHS[m - 1]} ${d}${year}`;
}

/** "Oct 23, 2026". */
export function formatDate(key: DayKey): string {
  const { y, m, d } = parts(key);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
