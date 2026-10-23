import { describe, expect, it } from 'vitest';
import {
  formatKcal,
  goalFor,
  parseGoal,
  parseKcal,
  progress,
  weekTotal,
  weeklyHistory,
  withGoal,
  type BurnEntry,
  type BurnSettings,
} from '../src/lib/burn';

let n = 0;
const e = (date: string, kcal: number): BurnEntry => ({ id: `b${++n}`, date, kcal, recordedAt: n });
const settings = (goals: BurnSettings['goals'], trainingDays = [1, 2, 3, 4, 5]): BurnSettings => ({
  id: 'settings',
  goals,
  trainingDays,
  updatedAt: 0,
});

// Week of Sun Oct 18 – Sat Oct 24, 2026.
const WEEK = '2026-10-18';

describe('weekly totals', () => {
  it('matches the spec example: 1,900 of 1,750 → +150 surplus', () => {
    const entries = [
      e('2026-10-19', 350),
      e('2026-10-20', 400),
      e('2026-10-21', 300),
      e('2026-10-22', 500),
      e('2026-10-23', 350),
    ];
    const p = progress(weekTotal(entries, WEEK), 1750);
    expect(p).toMatchObject({ total: 1900, remaining: 0, surplus: 150, reached: true });
    expect(p.ratio).toBeCloseTo(1900 / 1750, 6);
  });

  it('sums several sessions on the same day', () => {
    expect(weekTotal([e('2026-10-19', 200), e('2026-10-19', 150), e('2026-10-19', 0)], WEEK)).toBe(350);
  });

  it('progress from 0% to exactly 100%', () => {
    expect(progress(0, 1750)).toMatchObject({ ratio: 0, remaining: 1750, surplus: 0, reached: false });
    expect(progress(1350, 1750)).toMatchObject({ remaining: 400, reached: false });
    expect(Math.floor(progress(1350, 1750).ratio * 100)).toBe(77);
    expect(progress(1749, 1750).reached).toBe(false);
    expect(progress(1750, 1750)).toMatchObject({ ratio: 1, remaining: 0, surplus: 0, reached: true });
  });

  it('never caps the recorded total, even far above the goal', () => {
    expect(progress(5000, 1750)).toMatchObject({ total: 5000, surplus: 3250 });
  });

  it('uses Sunday–Saturday week boundaries', () => {
    const entries = [e('2026-10-17', 999), e('2026-10-18', 100), e('2026-10-24', 200), e('2026-10-25', 999)];
    expect(weekTotal(entries, WEEK)).toBe(300);
  });

  it('crosses month and year boundaries', () => {
    // Week of Sun Dec 27, 2026 – Sat Jan 2, 2027.
    expect(weekTotal([e('2026-12-31', 300), e('2027-01-02', 200), e('2027-01-03', 999)], '2026-12-27')).toBe(
      500,
    );
  });
});

describe('history', () => {
  it('lists the current week first (even empty) and keeps past weeks', () => {
    const s = settings([{ from: '2026-10-04', goal: 1500 }]);
    const h = weeklyHistory(
      s,
      [e('2026-10-05', 600), e('2026-10-12', 700), e('2026-10-13', 900)],
      '2026-10-25',
    );
    expect(h.map((w) => [w.week, w.total])).toEqual([
      ['2026-10-25', 0],
      ['2026-10-11', 1600],
      ['2026-10-04', 600],
    ]);
    expect(h[1].entries.map((x) => x.kcal)).toEqual([900, 700]); // newest first
  });

  it('past weeks keep the goal that applied to them', () => {
    let goals = withGoal(null, 1500, '2026-10-06');
    goals = withGoal(settings(goals), 1750, '2026-10-21');
    expect(goals).toEqual([
      { from: '2026-10-04', goal: 1500 },
      { from: '2026-10-18', goal: 1750 },
    ]);
    const s = settings(goals);
    expect(goalFor(s, '2026-10-04')).toBe(1500);
    expect(goalFor(s, '2026-10-11')).toBe(1500);
    expect(goalFor(s, WEEK)).toBe(1750);
    expect(goalFor(s, '2026-09-27')).toBe(1500); // backdated before setup
    // Editing again in the same week replaces this week's goal.
    expect(withGoal(s, 2000, '2026-10-24')).toEqual([
      { from: '2026-10-04', goal: 1500 },
      { from: '2026-10-18', goal: 2000 },
    ]);
    // Setting it back to last week's goal collapses the version.
    expect(withGoal(s, 1500, '2026-10-24')).toEqual([{ from: '2026-10-04', goal: 1500 }]);
  });
});

describe('manual input', () => {
  it('accepts any non-negative whole number', () => {
    expect(parseKcal('0')).toBe(0);
    expect(parseKcal('350')).toBe(350);
    expect(parseKcal(' 1,250 ')).toBe(1250);
    expect(parseKcal('')).toMatch(/Enter/);
    expect(parseKcal('-5')).toMatch(/whole number/);
    expect(parseKcal('12.5')).toMatch(/whole number/);
    expect(parseKcal('abc')).toMatch(/whole number/);
    expect(parseKcal('2000000')).toMatch(/or less/);
  });

  it('requires a weekly goal of at least 1', () => {
    expect(parseGoal('1750')).toBe(1750);
    expect(parseGoal('0')).toMatch(/at least 1/);
    expect(parseGoal('')).toBe('Enter your weekly goal.');
    expect(formatKcal(1750)).toBe('1,750');
  });
});
