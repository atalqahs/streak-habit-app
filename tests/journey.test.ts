import { describe, expect, it } from 'vitest';
import { addDays, todayKey } from '../src/lib/dates';
import { endDateError, journeyProgress } from '../src/lib/journey';

const START = '2026-10-23';
const j = (end: string, start = START) => ({ start, end });

describe('journey countdown', () => {
  it('matches the spec example: day 37 of 100', () => {
    const end = addDays(START, 100);
    const p = journeyProgress(j(end), addDays(START, 37));
    expect(p).toMatchObject({ total: 100, elapsed: 37, remaining: 63, percent: 37, complete: false });
    expect(p.ratio).toBeCloseTo(0.37, 10);
    expect(p.next).toEqual({ label: 'Halfway There', daysToGo: 13 });
    expect(p.message).toBe('Momentum is building.');
  });

  it('start day: 0 elapsed, full duration remaining', () => {
    const p = journeyProgress(j(addDays(START, 100)), START);
    expect(p).toMatchObject({ elapsed: 0, remaining: 100, percent: 0, reachedToday: null });
    expect(p.next).toEqual({ label: 'Quarter Way', daysToGo: 25 });
    expect(p.message).toBe('The journey has begun.');
  });

  it('clamps before the start and after the end', () => {
    const end = addDays(START, 10);
    expect(journeyProgress(j(end), addDays(START, -5))).toMatchObject({
      elapsed: 0,
      remaining: 10,
      percent: 0,
    });
    const done = journeyProgress(j(end), addDays(START, 400));
    expect(done).toMatchObject({ elapsed: 10, remaining: 0, percent: 100, complete: true, next: null });
    expect(done.message).toBe('Journey complete.');
  });

  it('completes exactly on the end date, never shows 100% before', () => {
    const end = addDays(START, 1000);
    expect(journeyProgress(j(end), addDays(START, 999)).percent).toBe(99);
    expect(journeyProgress(j(end), end)).toMatchObject({ percent: 100, remaining: 0, complete: true });
  });

  it('reaches all four milestones automatically with the right messages', () => {
    const end = addDays(START, 100);
    const at = (d: number) => journeyProgress(j(end), addDays(START, d));
    expect(at(24)).toMatchObject({ reachedToday: null, message: 'The journey has begun.' });
    expect(at(25)).toMatchObject({ reachedToday: 'Quarter Way', message: 'Momentum is building.' });
    expect(at(50)).toMatchObject({ reachedToday: 'Halfway There', message: 'Halfway there.' });
    expect(at(75)).toMatchObject({ reachedToday: 'Final Stretch', message: 'The final stretch.' });
    expect(at(76)).toMatchObject({ reachedToday: null, next: { label: 'Journey Complete', daysToGo: 24 } });
    expect(at(100)).toMatchObject({ reachedToday: 'Journey Complete', complete: true });
  });

  it('milestones scale with odd durations', () => {
    const p = journeyProgress(j(addDays(START, 30)), START);
    expect(p.milestoneDays).toEqual([8, 15, 23, 30]);
    // 2-day journey: halfway on day 1, the furthest milestone is named.
    expect(journeyProgress(j(addDays(START, 2)), addDays(START, 1)).reachedToday).toBe('Halfway There');
  });

  it('uses calendar days across month, year and leap-day boundaries', () => {
    expect(journeyProgress(j('2027-01-10', '2026-12-25'), '2027-01-01')).toMatchObject({
      total: 16,
      elapsed: 7,
      remaining: 9,
    });
    expect(journeyProgress(j('2028-03-01', '2028-02-01'), '2028-02-29')).toMatchObject({
      total: 29,
      elapsed: 28,
      remaining: 1,
    });
    expect(journeyProgress(j('2027-03-01', '2027-02-01'), '2027-02-28')).toMatchObject({
      total: 28,
      elapsed: 27,
      remaining: 1,
    });
    // Year-long journey including a leap day.
    expect(journeyProgress(j('2029-01-01', '2028-01-01'), '2028-12-31')).toMatchObject({
      total: 366,
      remaining: 1,
    });
  });

  it('advances exactly at Kuwait midnight (UTC+3)', () => {
    const end = addDays(START, 100);
    const before = journeyProgress(j(end), todayKey(new Date('2026-10-23T20:59:59Z')));
    const after = journeyProgress(j(end), todayKey(new Date('2026-10-23T21:00:00Z')));
    expect([before.elapsed, before.remaining]).toEqual([0, 100]);
    expect([after.elapsed, after.remaining]).toEqual([1, 99]);
  });

  it('validates the end date', () => {
    expect(endDateError('', START)).toMatch(/Choose/);
    expect(endDateError('2026-02-30', START)).toMatch(/valid/);
    expect(endDateError(START, START)).toMatch(/after/);
    expect(endDateError('2026-10-01', START)).toMatch(/after/);
    expect(endDateError('2026-10-24', START)).toBeNull();
  });
});
