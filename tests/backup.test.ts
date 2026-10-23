import { describe, expect, it } from 'vitest';
import { BackupError, createBackup, parseBackup } from '../src/lib/backup';
import type { Habit } from '../src/lib/types';

const habit: Habit = {
  id: 'a',
  name: 'Water',
  icon: '💧',
  type: 'counter',
  target: 8,
  unit: 'glasses',
  start: '2026-10-01',
  schedule: [
    { from: '2026-10-01', days: [0, 1, 2, 3, 4, 5, 6] },
    { from: '2026-10-10', days: [0, 1, 2, 3, 4] },
  ],
  order: 0,
  createdAt: 1,
};
const entry = { id: 'a|2026-10-02', habitId: 'a', date: '2026-10-02', value: 5, target: 8 };

const weight = {
  settings: { id: 'settings' as const, start: 92.1, goal: 70, updatedAt: 5 },
  entries: [
    { id: 'w2', date: '2026-10-17', value: 86.4, recordedAt: 2 },
    { id: 'w1', date: '2026-10-10', value: 86.8, recordedAt: 1 },
  ],
};
const sortedWeight = { ...weight, entries: [weight.entries[1], weight.entries[0]] };
const burn = {
  settings: {
    id: 'settings' as const,
    goals: [{ from: '2026-10-18', goal: 1750 }],
    trainingDays: [1, 2, 3],
    updatedAt: 3,
  },
  entries: [
    { id: 'b2', date: '2026-10-20', kcal: 400, recordedAt: 2 },
    { id: 'b1', date: '2026-10-19', kcal: 350, recordedAt: 1 },
  ],
};
const sortedBurn = { ...burn, entries: [burn.entries[1], burn.entries[0]] };
const journey = {
  id: 'settings' as const,
  name: 'Cut',
  start: '2026-10-01',
  end: '2027-01-09',
  createdAt: 1,
  updatedAt: 2,
};

const text = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ ...createBackup([habit], [entry], weight, burn, journey), ...overrides });

describe('backup', () => {
  it('round-trips an export including weight data, sorted chronologically', () => {
    expect(parseBackup(text())).toEqual({
      habits: [habit],
      entries: [entry],
      weight: sortedWeight,
      burn: sortedBurn,
      journey,
    });
  });

  it('imports legacy habit-only (v1) backups without touching weight', () => {
    const legacy = JSON.stringify({
      format: 'habits-backup',
      version: 1,
      exportedAt: 'x',
      habits: [habit],
      entries: [entry],
    });
    expect(parseBackup(legacy)).toEqual({
      habits: [habit],
      entries: [entry],
      weight: undefined,
      burn: undefined,
      journey: undefined,
    });
  });

  it('imports v2 backups (habits + weight) without touching burn data', () => {
    const v2 = JSON.stringify({
      format: 'habits-backup',
      version: 2,
      exportedAt: 'x',
      habits: [habit],
      entries: [entry],
      weight,
    });
    const parsed = parseBackup(v2);
    expect(parsed.weight).toEqual(sortedWeight);
    expect(parsed.burn).toBeUndefined();
    expect(parsed.journey).toBeUndefined();
  });

  it('imports v3 backups without touching the journey', () => {
    const v3 = JSON.stringify({
      format: 'habits-backup',
      version: 3,
      exportedAt: 'x',
      habits: [habit],
      entries: [entry],
      weight,
      burn,
    });
    const parsed = parseBackup(v3);
    expect(parsed.burn).toEqual(sortedBurn);
    expect(parsed.journey).toBeUndefined();
  });

  it('a v4 backup without a journey clears it on import', () => {
    expect(parseBackup(text({ journey: null })).journey).toBeNull();
  });

  it('accepts a v2 backup made before weight was set up', () => {
    const t = text({ weight: { settings: null, entries: [] } });
    expect(parseBackup(t).weight).toEqual({ settings: null, entries: [] });
  });

  it.each([
    ['not json', '{oops', 'not valid JSON'],
    ['wrong format', JSON.stringify({ format: 'x' }), 'not a Habits backup'],
    ['newer version', text({ version: 99 }), 'newer version'],
    ['bad type', text({ habits: [{ ...habit, type: 'weird' }] }), 'unknown habit type'],
    ['bad weekday', text({ habits: [{ ...habit, schedule: [{ from: habit.start, days: [7] }] }] }), '0 to 6'],
    ['impossible date', text({ entries: [{ ...entry, date: '2026-02-30' }] }), 'date is invalid'],
    ['orphan record', text({ entries: [{ ...entry, habitId: 'zzz' }] }), 'unknown habit'],
    ['negative value', text({ entries: [{ ...entry, value: -1 }] }), 'non-negative'],
    ['duplicate habit', text({ habits: [habit, habit] }), 'duplicate habits'],
    [
      'weight out of range',
      text({ weight: { ...weight, entries: [{ ...weight.entries[0], value: 5 }] } }),
      'between',
    ],
    [
      'weight bad date',
      text({ weight: { ...weight, entries: [{ ...weight.entries[0], date: '2026-13-01' }] } }),
      'date is invalid',
    ],
    [
      'weight goal equals start',
      text({ weight: { ...weight, settings: { ...weight.settings, goal: 92.1 } } }),
      'differ',
    ],
    [
      'weight entries without settings',
      text({ weight: { settings: null, entries: weight.entries } }),
      'no starting',
    ],
    [
      'duplicate weight entry',
      text({ weight: { ...weight, entries: [weight.entries[0], weight.entries[0]] } }),
      'duplicate weight',
    ],
    ['malformed weight', text({ weight: 'x' }), 'Weight data'],
    [
      'fractional kcal',
      text({ burn: { ...burn, entries: [{ ...burn.entries[0], kcal: 12.5 }] } }),
      'whole number',
    ],
    [
      'negative kcal',
      text({ burn: { ...burn, entries: [{ ...burn.entries[0], kcal: -1 }] } }),
      'whole number',
    ],
    [
      'zero goal',
      text({ burn: { ...burn, settings: { ...burn.settings, goals: [{ from: '2026-10-18', goal: 0 }] } } }),
      'at least 1',
    ],
    [
      'bad training day',
      text({ burn: { ...burn, settings: { ...burn.settings, trainingDays: [9] } } }),
      '0 to 6',
    ],
    [
      'duplicate burn entry',
      text({ burn: { ...burn, entries: [burn.entries[0], burn.entries[0]] } }),
      'duplicate burn',
    ],
    ['malformed burn', text({ burn: 7 }), 'Calorie burn data'],
    ['journey end before start', text({ journey: { ...journey, end: '2026-09-01' } }), 'after its start'],
    ['journey bad date', text({ journey: { ...journey, start: '2026-02-31' } }), 'Journey dates'],
  ])('rejects %s', (_name, input, message) => {
    expect(() => parseBackup(input)).toThrow(BackupError);
    expect(() => parseBackup(input)).toThrow(message);
  });
});
