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

const text = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ ...createBackup([habit], [entry]), ...overrides });

describe('backup', () => {
  it('round-trips an export', () => {
    expect(parseBackup(text())).toEqual({ habits: [habit], entries: [entry] });
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
  ])('rejects %s', (_name, input, message) => {
    expect(() => parseBackup(input)).toThrow(BackupError);
    expect(() => parseBackup(input)).toThrow(message);
  });
});
