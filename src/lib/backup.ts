import { isDayKey } from './dates';
import { MAX_KCAL, sortBurn, type BurnEntry, type BurnGoalVersion, type BurnSettings } from './burn';
import type { BurnData, WeightData } from './db';
import { entryId, type Entry, type Habit, type HabitType, type ScheduleVersion } from './types';
import { MAX_KG, MIN_KG, sortEntries, type WeightEntry, type WeightSettings } from './weight';

export const BACKUP_FORMAT = 'habits-backup';
/** v1: habits + entries. v2: adds `weight`. v3: adds `burn` (weekly goal + entries). */
export const BACKUP_VERSION = 3;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  habits: Habit[];
  entries: Entry[];
  weight: WeightData;
  burn: BurnData;
}

export interface ParsedBackup {
  habits: Habit[];
  entries: Entry[];
  /** Undefined for habit-only (v1) backups: existing weight data should be kept. */
  weight?: WeightData;
  /** Undefined for backups made before v3: existing burn data should be kept. */
  burn?: BurnData;
}

export function createBackup(habits: Habit[], entries: Entry[], weight: WeightData, burn: BurnData): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    habits,
    entries,
    weight: { settings: weight.settings, entries: sortEntries(weight.entries) },
    burn: { settings: burn.settings, entries: sortBurn(burn.entries) },
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

const isKg = (v: unknown): v is number => isNum(v) && v >= MIN_KG && v <= MAX_KG;

function parseWeight(raw: unknown): WeightData {
  if (!isObj(raw) || !Array.isArray(raw.entries)) fail('Weight data in this backup is invalid.');
  let settings: WeightSettings | null = null;
  if (raw.settings !== null && raw.settings !== undefined) {
    const s = raw.settings;
    if (!isObj(s) || !isKg(s.start) || !isKg(s.goal)) {
      fail(`Weight settings: start and goal must be between ${MIN_KG} and ${MAX_KG} kg.`);
    }
    if (s.start === s.goal) fail('Weight settings: goal must differ from the starting weight.');
    settings = {
      id: 'settings',
      start: s.start,
      goal: s.goal,
      updatedAt: isNum(s.updatedAt) ? s.updatedAt : 0,
    };
  }
  const entries = raw.entries.map((e, i): WeightEntry => {
    const where = `Weight entry ${i + 1}`;
    if (!isObj(e)) fail(`${where} is not an object.`);
    if (!isStr(e.id) || !e.id) fail(`${where}: id is missing.`);
    if (!isDayKey(e.date)) fail(`${where}: date is invalid.`);
    if (!isKg(e.value)) fail(`${where}: weight must be between ${MIN_KG} and ${MAX_KG} kg.`);
    return { id: e.id, date: e.date, value: e.value, recordedAt: isNum(e.recordedAt) ? e.recordedAt : 0 };
  });
  if (new Set(entries.map((e) => e.id)).size !== entries.length)
    fail('This backup contains duplicate weight entries.');
  if (!settings && entries.length) fail('Weight entries in this backup have no starting or goal weight.');
  return { settings, entries: sortEntries(entries) };
}

const isWholeKcal = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_KCAL;

function parseBurn(raw: unknown): BurnData {
  if (!isObj(raw) || !Array.isArray(raw.entries)) fail('Calorie burn data in this backup is invalid.');
  let settings: BurnSettings | null = null;
  if (raw.settings !== null && raw.settings !== undefined) {
    const s = raw.settings;
    if (!isObj(s) || !Array.isArray(s.goals) || s.goals.length === 0 || !Array.isArray(s.trainingDays)) {
      fail('Burn goal settings in this backup are invalid.');
    }
    const goals = s.goals.map((g, i): BurnGoalVersion => {
      if (!isObj(g) || !isDayKey(g.from) || !isWholeKcal(g.goal) || g.goal < 1) {
        fail(`Burn goal ${i + 1}: the weekly goal must be a whole number of at least 1 kcal.`);
      }
      return { from: g.from, goal: g.goal };
    });
    for (let i = 1; i < goals.length; i++) {
      if (goals[i].from <= goals[i - 1].from) fail('Burn goals must be in increasing date order.');
    }
    const days = s.trainingDays as unknown[];
    if (!days.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)) {
      fail('Training days must be numbers from 0 to 6.');
    }
    settings = {
      id: 'settings',
      goals,
      trainingDays: [...new Set(days as number[])].sort((a, b) => a - b),
      updatedAt: isNum(s.updatedAt) ? s.updatedAt : 0,
    };
  }
  const entries = raw.entries.map((e, i): BurnEntry => {
    const where = `Burn entry ${i + 1}`;
    if (!isObj(e)) fail(`${where} is not an object.`);
    if (!isStr(e.id) || !e.id) fail(`${where}: id is missing.`);
    if (!isDayKey(e.date)) fail(`${where}: date is invalid.`);
    if (!isWholeKcal(e.kcal)) fail(`${where}: calories must be a whole number of 0 or more.`);
    return { id: e.id, date: e.date, kcal: e.kcal, recordedAt: isNum(e.recordedAt) ? e.recordedAt : 0 };
  });
  if (new Set(entries.map((e) => e.id)).size !== entries.length)
    fail('This backup contains duplicate burn entries.');
  return { settings, entries: sortBurn(entries) };
}

/** Parses and fully validates a backup file. Throws BackupError with a readable message. */
export function parseBackup(text: string): ParsedBackup {
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
  const weight = data.version >= 2 && data.weight !== undefined ? parseWeight(data.weight) : undefined;
  const burn = data.version >= 3 && data.burn !== undefined ? parseBurn(data.burn) : undefined;
  return { habits, entries, weight, burn };
}
