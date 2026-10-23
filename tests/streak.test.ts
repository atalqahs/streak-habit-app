import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatWeekRange,
  isDayKey,
  msUntilNextDay,
  todayKey,
  weekStart,
  weekday,
} from '../src/lib/dates';
import { computeStreak, isScheduled, withSchedule } from '../src/lib/streak';
import { entryId, type Entry, type Habit } from '../src/lib/types';

const ALL = [0, 1, 2, 3, 4, 5, 6];

function habit(start: string, days = ALL, extra: Partial<Habit> = {}): Habit {
  return {
    id: 'h',
    name: 'Gym',
    icon: '🏋️',
    type: 'simple',
    target: 1,
    unit: '',
    start,
    schedule: [{ from: start, days }],
    order: 0,
    createdAt: 0,
    ...extra,
  };
}

function log(dates: string[], value = 1, target = 1): Map<string, Entry> {
  return new Map(dates.map((date) => [date, { id: entryId('h', date), habitId: 'h', date, value, target }]));
}

// 2026-10-18 is a Sunday.
const SUN = '2026-10-18';
const MON = '2026-10-19';
const TUE = '2026-10-20';
const WED = '2026-10-21';
const THU = '2026-10-22';
const FRI = '2026-10-23';

describe('dates', () => {
  it('uses Asia/Kuwait (UTC+3) day boundaries', () => {
    expect(todayKey(new Date('2026-10-22T20:59:59Z'))).toBe('2026-10-22');
    expect(todayKey(new Date('2026-10-22T21:00:00Z'))).toBe('2026-10-23');
  });

  it('computes time until the next Kuwait midnight', () => {
    const ms = msUntilNextDay(new Date('2026-10-22T20:00:00Z'));
    expect(Math.round(ms / 60000)).toBe(60);
  });

  it('weeks start on Sunday', () => {
    expect(weekday(SUN)).toBe(0);
    expect(weekStart(FRI)).toBe(SUN);
    expect(weekStart(SUN)).toBe(SUN);
  });

  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(weekStart('2027-01-01')).toBe('2026-12-27');
  });

  it('formats week ranges', () => {
    expect(formatWeekRange(SUN, FRI)).toBe('Oct 18 – 24');
    expect(formatWeekRange('2026-09-27', FRI)).toBe('Sep 27 – Oct 3');
    expect(formatWeekRange('2026-12-27', FRI)).toBe('Dec 27, 2026 – Jan 2, 2027');
    expect(formatWeekRange('2025-10-19', FRI)).toBe('Oct 19 – 25, 2025');
  });

  it('validates day keys', () => {
    expect(isDayKey('2026-02-29')).toBe(false);
    expect(isDayKey('2028-02-29')).toBe(true);
    expect(isDayKey('2026-1-01')).toBe(false);
  });
});

describe('streaks', () => {
  it('first completion starts a streak at 1', () => {
    const s = computeStreak(habit(SUN), log([SUN]), SUN);
    expect(s).toMatchObject({ current: 1, best: 1, total: 1, status: 'active', todayDone: true });
  });

  it('consecutive scheduled completions increase the streak', () => {
    const s = computeStreak(habit(SUN), log([SUN, MON, TUE]), TUE);
    expect(s.current).toBe(3);
  });

  it('today is not missed until its day ends', () => {
    const s = computeStreak(habit(SUN), log([SUN, MON]), TUE);
    expect(s).toMatchObject({
      current: 2,
      status: 'active',
      todayScheduled: true,
      todayDone: false,
      nextDue: TUE,
    });
  });

  it('unscheduled days neither increase nor break the streak', () => {
    const h = habit(SUN, [0, 2]); // Sun, Tue
    const s = computeStreak(h, log([SUN, TUE]), WED);
    expect(s).toMatchObject({ current: 2, status: 'active' });
    // A completion on a rest day counts toward the total only.
    const r = computeStreak(h, log([SUN, MON, TUE]), WED);
    expect(r).toMatchObject({ current: 2, total: 3 });
  });

  it('one missed scheduled day shows the at-risk warning', () => {
    const s = computeStreak(habit(SUN), log([SUN]), TUE);
    expect(s).toMatchObject({ current: 1, status: 'at-risk', nextDue: TUE });
  });

  it('the spec example: Sun ✓, Mon ✗, Tue rest, Wed ✓, Thu ✓', () => {
    const h = habit(SUN, [0, 1, 3, 4]);
    const history = log([SUN, WED, THU]);
    expect(computeStreak(h, history, MON)).toMatchObject({ current: 1, status: 'active' });
    expect(computeStreak(h, history, TUE)).toMatchObject({ current: 1, status: 'at-risk' });
    expect(computeStreak(h, history, WED)).toMatchObject({ current: 2, status: 'active' });
    expect(computeStreak(h, history, THU)).toMatchObject({ current: 3, status: 'active' });
    // Still at risk on Wednesday before it is completed.
    expect(computeStreak(h, log([SUN]), WED)).toMatchObject({ current: 1, status: 'at-risk', nextDue: WED });
  });

  it('two consecutive missed scheduled days reset the streak', () => {
    const h = habit(SUN, [0, 1, 3, 4]);
    const s = computeStreak(h, log([SUN]), THU);
    expect(s).toMatchObject({ current: 0, best: 1, status: 'broken', lost: 1 });
  });

  it('rest days between misses do not save a streak', () => {
    const h = habit(SUN, [0, 1, 3]); // Sun, Mon, Wed
    const s = computeStreak(h, log([SUN]), THU); // Mon missed, Tue rest, Wed missed
    expect(s.current).toBe(0);
  });

  it('recovery after one miss continues the streak', () => {
    const s = computeStreak(habit(SUN), log([SUN, MON, WED, THU]), FRI);
    expect(s).toMatchObject({ current: 4, status: 'active' });
  });

  it('preserves the best streak after a reset and restarts at 1', () => {
    const s = computeStreak(habit(SUN), log([SUN, MON, TUE, FRI]), FRI);
    expect(s).toMatchObject({ current: 1, best: 3, total: 4, status: 'active' });
  });

  it('continues across month and year boundaries', () => {
    const start = '2026-12-29';
    const days = Array.from({ length: 6 }, (_, i) => addDays(start, i)); // Dec 29 – Jan 3
    const s = computeStreak(habit(start), log(days), '2027-01-03');
    expect(s.current).toBe(6);
  });

  it('counter habits only complete when the snapshotted target is reached', () => {
    const h = habit(SUN, ALL, { type: 'counter', target: 8 });
    expect(computeStreak(h, log([SUN], 5, 8), SUN).current).toBe(0);
    expect(computeStreak(h, log([SUN], 8, 8), SUN).current).toBe(1);
    // Raising the goal later does not undo a day that met its goal at the time.
    expect(computeStreak({ ...h, target: 10 }, log([SUN], 8, 8), SUN).current).toBe(1);
  });

  it('schedule changes apply from today and never rewrite the past', () => {
    // Sun–Sat, completed Sun; Mon & Tue missed would normally break it…
    let h = habit(SUN);
    // …but on Monday the user switches to Sun/Wed/Thu only.
    h = withSchedule(h, [0, 3, 4], MON);
    expect(h.schedule).toEqual([
      { from: SUN, days: ALL },
      { from: MON, days: [0, 3, 4] },
    ]);
    expect(isScheduled(h, SUN)).toBe(true);
    expect(isScheduled(h, MON)).toBe(false);
    expect(computeStreak(h, log([SUN, WED]), WED)).toMatchObject({ current: 2, status: 'active' });

    // Editing again on the same day replaces that day's version.
    const again = withSchedule(h, [3], MON);
    expect(again.schedule).toEqual([
      { from: SUN, days: ALL },
      { from: MON, days: [3] },
    ]);
    // A no-op edit keeps the habit untouched.
    expect(withSchedule(h, [4, 3, 0], WED)).toBe(h);
  });

  it('days before the start date are not tracked', () => {
    const s = computeStreak(habit(WED), log([WED]), FRI); // Thu missed, Fri pending
    expect(s).toMatchObject({ current: 1, status: 'at-risk' });
  });
});
