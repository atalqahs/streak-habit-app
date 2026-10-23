import { describe, expect, it } from 'vitest';
import {
  formatKg,
  nextMilestone,
  parseKg,
  sortEntries,
  summarize,
  type WeightEntry,
  type WeightSettings,
} from '../src/lib/weight';

const settings = (start: number, goal: number): WeightSettings => ({
  id: 'settings',
  start,
  goal,
  updatedAt: 0,
});
let n = 0;
const e = (date: string, value: number, recordedAt = ++n): WeightEntry => ({
  id: `w${n}`,
  date,
  value,
  recordedAt,
});

describe('weight summary', () => {
  it('matches the spec example: 92.1 → 86.4 toward 70.0', () => {
    const s = summarize(settings(92.1, 70), [e('2026-10-10', 86.8), e('2026-10-17', 86.4)]);
    expect(s.current).toBe(86.4);
    expect(s.change).toBe(-0.4);
    expect(s.changeDirection).toBe('down');
    expect(Math.round(s.progress * 100)).toBe(26);
    expect(s.achieved).toBeCloseTo(5.7, 5);
    expect(s.remaining).toBeCloseTo(16.4, 5);
    expect(s.nextMilestone).toBe(85);
    expect(s.toMilestone).toBeCloseTo(1.4, 5);
  });

  it('compares only the two most recent measurements, whatever the gap', () => {
    const s = summarize(settings(92, 70), [e('2026-01-01', 90), e('2026-03-01', 88), e('2026-10-01', 88.6)]);
    expect(s.change).toBe(0.6);
    expect(s.changeDirection).toBe('up');
  });

  it('reports no change for equal values', () => {
    const s = summarize(settings(92, 70), [e('2026-10-01', 88), e('2026-10-08', 88)]);
    expect(s).toMatchObject({ change: 0, changeDirection: 'same' });
  });

  it('handles a single entry and no entries', () => {
    expect(summarize(settings(92, 70), [e('2026-10-01', 90)])).toMatchObject({ current: 90, change: null });
    const empty = summarize(settings(92, 70), []);
    expect(empty).toMatchObject({ current: null, change: null, nextMilestone: null, progress: 0 });
  });

  it('orders same-day entries by time recorded; the later one is current', () => {
    const a = e('2026-10-17', 87, 100);
    const b = e('2026-10-17', 86.5, 200);
    const s = summarize(settings(92, 70), [b, a]);
    expect(s.current).toBe(86.5);
    expect(s.change).toBe(-0.5);
    expect(sortEntries([b, a]).map((x) => x.id)).toEqual([a.id, b.id]);
  });

  it('uses the measurement date, not entry order, for chronology', () => {
    const late = e('2026-10-20', 85);
    const backfilled = e('2026-10-01', 90); // recorded later, dated earlier
    expect(summarize(settings(92, 70), [late, backfilled]).current).toBe(85);
  });

  it('clamps nothing in the data: progress can exceed 100% or go negative', () => {
    expect(summarize(settings(92, 70), [e('2026-10-01', 68)])).toMatchObject({ reached: true, remaining: 0 });
    expect(summarize(settings(92, 70), [e('2026-10-01', 68)]).progress).toBeGreaterThan(1);
    const above = summarize(settings(92, 70), [e('2026-10-01', 93)]);
    expect(above.progress).toBeLessThan(0);
    expect(above.achieved).toBeCloseTo(-1, 5);
  });

  it('supports weight-gain goals', () => {
    const s = summarize(settings(60, 70), [e('2026-10-01', 62.5)]);
    expect(s).toMatchObject({ direction: 'gain', nextMilestone: 65 });
    expect(s.progress).toBeCloseTo(0.25, 5);
  });
});

describe('milestones', () => {
  it('steps down the 5 kg grid and ends on the goal', () => {
    expect(nextMilestone(92.1, 70, 'lose')).toBe(90);
    expect(nextMilestone(86.4, 70, 'lose')).toBe(85);
    expect(nextMilestone(85, 70, 'lose')).toBe(80); // reached 85 → next is 80
    expect(nextMilestone(84.9, 70, 'lose')).toBe(80);
    expect(nextMilestone(72, 70, 'lose')).toBe(70);
    expect(nextMilestone(74, 71, 'lose')).toBe(71); // goal off the grid
    expect(nextMilestone(70, 70, 'lose')).toBeNull();
    expect(nextMilestone(66, 70, 'gain')).toBe(70);
    expect(nextMilestone(65, 72, 'gain')).toBe(70);
  });
});

describe('input', () => {
  it('parses and validates kilograms', () => {
    expect(parseKg('86.4')).toBe(86.4);
    expect(parseKg(' 86,4 ')).toBe(86.4);
    expect(parseKg('')).toBe('Enter a weight.');
    expect(parseKg('abc')).toMatch(/number/);
    expect(parseKg('-5')).toMatch(/between/);
    expect(parseKg('900')).toMatch(/between/);
    expect(formatKg(85)).toBe('85.0 kg');
  });
});
