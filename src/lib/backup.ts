import { isDayKey } from './dates';
import { entryId, type Entry, type Habit, type HabitType, type ScheduleVersion } from './types';

export const BACKUP_FORMAT = 'habits-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  habits: Habit[];
  entries: Entry[];
}

export function createBackup(habits: Habit[], entries: Entry[]): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    habits,
    entries,
  };
}

export class BackupError extends Error {}

const TYPES: HabitType[] = ['simple', 'counter', 'numeric'];
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function fail(message: string): never {
  throw new BackupError(message);
}

function parseSchedule(raw: unknown, where: string): ScheduleVersion[] {
  if (!Array.isArray(raw) || raw.length === 0) fail(`${where}: schedule is missing.`);
  const versions = raw.map((v, i) => {
    if (!isObj(v) || !isDayKey(v.from) || !Array.isArray(v.days))
      fail(`${where}: schedule entry ${i + 1} is invalid.`);
    const days = v.days as unknown[];
    if (!days.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)) {
      fail(`${where}: schedule weekdays must be numbers from 0 to 6.`);
    }
    return { from: v.from, days: [...new Set(days as number[])].sort((a, b) => a - b) };
  });
  for (let i = 1; i < versions.length; i++) {
    if (versions[i].from <= versions[i - 1].from)
      fail(`${where}: schedule dates must be in increasing order.`);
  }
  return versions;
}

function parseHabit(raw: unknown, index: number): Habit {
  const where = `Habit ${index + 1}`;
  if (!isObj(raw)) fail(`${where} is not an object.`);
  const { id, name, icon, type, target, unit, start, order, createdAt } = raw;
  if (!isStr(id) || !id) fail(`${where}: id is missing.`);
  if (!isStr(name) || !name.trim()) fail(`${where}: name is missing.`);
  if (!isStr(icon)) fail(`${where}: icon is invalid.`);
  if (!TYPES.includes(type as HabitType)) fail(`${where}: unknown habit type.`);
  if (!isNum(target) || target <= 0) fail(`${where}: target must be a positive number.`);
  if (!isDayKey(start)) fail(`${where}: start date is invalid.`);
  const schedule = parseSchedule(raw.schedule, where);
  if (schedule[0].from !== start) fail(`${where}: schedule must begin on the start date.`);
  return {
    id,
    name: name.trim().slice(0, 60),
    icon: icon.slice(0, 16),
    type: type as HabitType,
    target: type === 'simple' ? 1 : target,
    unit: isStr(unit) ? unit.slice(0, 24) : '',
    start,
    schedule,
    order: isNum(order) ? order : index,
    createdAt: isNum(createdAt) ? createdAt : Date.now(),
  };
}

function parseEntry(raw: unknown, index: number, habitIds: Set<string>): Entry {
  const where = `Record ${index + 1}`;
  if (!isObj(raw)) fail(`${where} is not an object.`);
  const { habitId, date, value, target } = raw;
  if (!isStr(habitId) || !habitIds.has(habitId)) fail(`${where} refers to an unknown habit.`);
  if (!isDayKey(date)) fail(`${where}: date is invalid.`);
  if (!isNum(value) || value < 0) fail(`${where}: value must be a non-negative number.`);
  if (!isNum(target) || target <= 0) fail(`${where}: target must be a positive number.`);
  return { id: entryId(habitId, date), habitId, date, value, target };
}

/** Parses and fully validates a backup file. Throws BackupError with a readable message. */
export function parseBackup(text: string): { habits: Habit[]; entries: Entry[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    fail('This file is not valid JSON.');
  }
  if (!isObj(data) || data.format !== BACKUP_FORMAT) fail('This file is not a Habits backup.');
  if (!isNum(data.version) || data.version > BACKUP_VERSION) {
    fail('This backup was made by a newer version of Habits.');
  }
  if (!Array.isArray(data.habits) || !Array.isArray(data.entries)) fail('This backup is incomplete.');

  const habits = data.habits.map(parseHabit);
  const ids = new Set(habits.map((h) => h.id));
  if (ids.size !== habits.length) fail('This backup contains duplicate habits.');
  const entries = data.entries.map((e, i) => parseEntry(e, i, ids));
  if (new Set(entries.map((e) => e.id)).size !== entries.length)
    fail('This backup contains duplicate records.');

  habits.sort((a, b) => a.order - b.order).forEach((h, i) => (h.order = i));
  return { habits, entries };
}
