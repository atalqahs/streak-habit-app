import { isDayKey } from './dates';
import { MAX_KCAL, sortBurn, type BurnEntry, type BurnGoalVersion, type BurnSettings } from './burn';
import type { BurnData, NutritionData, NutritionImport, WeightData } from './db';
import {
  MAX_TEMPLATES,
  PROFILE,
  type DietTemplate,
  type ExtraFood,
  type FoodReplacement,
  type NutritionPlan,
  type PlanVersion,
} from './fatloss';
import type { JourneySettings } from './journey';
import { entryId, type Entry, type Habit, type HabitType, type ScheduleVersion } from './types';
import { MAX_KG, MIN_KG, sortEntries, type WeightEntry, type WeightSettings } from './weight';

export const BACKUP_FORMAT = 'habits-backup';
/**
 * v1: habits + entries. v2: + `weight`. v3: + `burn`. v4: + `journey`. v5: + `nutrition`.
 * v6: + `nutrition.replacements` (one-day food replacements).
 */
export const BACKUP_VERSION = 6;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  habits: Habit[];
  entries: Entry[];
  weight: WeightData;
  burn: BurnData;
  journey: JourneySettings | null;
  nutrition: NutritionData;
}

export interface ParsedBackup {
  habits: Habit[];
  entries: Entry[];
  /** Undefined for habit-only (v1) backups: existing weight data should be kept. */
  weight?: WeightData;
  /** Undefined for backups made before v3: existing burn data should be kept. */
  burn?: BurnData;
  /** Undefined for backups made before v4: the existing journey should be kept. */
  journey?: JourneySettings | null;
  /** Undefined for backups made before v5: existing nutrition data should be kept. */
  nutrition?: NutritionImport;
}

export function createBackup(
  habits: Habit[],
  entries: Entry[],
  weight: WeightData,
  burn: BurnData,
  journey: JourneySettings | null,
  nutrition: NutritionData,
): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    habits,
    entries,
    weight: { settings: weight.settings, entries: sortEntries(weight.entries) },
    burn: { settings: burn.settings, entries: sortBurn(burn.entries) },
    journey,
    nutrition,
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

function parseJourney(raw: unknown): JourneySettings | null {
  if (raw === null) return null;
  if (!isObj(raw) || !isDayKey(raw.start) || !isDayKey(raw.end))
    fail('Journey dates in this backup are invalid.');
  if (raw.end <= raw.start) fail('Journey end date must be after its start date.');
  const name = isStr(raw.name) && raw.name.trim() ? raw.name.trim().slice(0, 40) : 'My Journey';
  return {
    id: 'settings',
    name,
    start: raw.start,
    end: raw.end,
    createdAt: isNum(raw.createdAt) ? raw.createdAt : 0,
    updatedAt: isNum(raw.updatedAt) ? raw.updatedAt : 0,
  };
}

const isNonNeg = (v: unknown): v is number => isNum(v) && v >= 0;

function parsePlan(raw: unknown): NutritionPlan | null {
  if (raw === null) return null;
  if (!isObj(raw) || !Array.isArray(raw.versions) || raw.versions.length === 0)
    fail('Nutrition plan in this backup is invalid.');
  const versions = raw.versions.map((v, vi): PlanVersion => {
    const where = `Nutrition plan version ${vi + 1}`;
    if (!isObj(v) || !isDayKey(v.from) || !Array.isArray(v.templates) || !Array.isArray(v.days))
      fail(`${where} is invalid.`);
    const cycling = v.carbCycling === true;
    const count = v.templates.length;
    if (cycling ? count < 2 || count > MAX_TEMPLATES : count !== 1)
      fail(`${where}: wrong number of templates.`);
    const templates = v.templates.map((t, ti): DietTemplate => {
      if (
        !isObj(t) ||
        !isStr(t.id) ||
        !t.id ||
        !isStr(t.name) ||
        !Array.isArray(t.items) ||
        t.items.length === 0
      ) {
        fail(`${where}, template ${ti + 1} is invalid.`);
      }
      return {
        id: t.id,
        name: t.name.slice(0, 30),
        items: t.items.map((it) => {
          const s = isObj(it) ? it.snapshot : null;
          if (
            !isObj(it) ||
            !isStr(it.id) ||
            !isStr(it.foodId) ||
            !isStr(it.variantId) ||
            !isNum(it.grams) ||
            it.grams <= 0 ||
            it.grams > 5000 ||
            !isObj(s) ||
            !isStr(s.name) ||
            !isStr(s.variant) ||
            !isNonNeg(s.kcal) ||
            !isNonNeg(s.protein) ||
            !isNonNeg(s.carbs) ||
            !isNonNeg(s.fat)
          ) {
            fail(`${where}: a food item is invalid.`);
          }
          return {
            id: it.id,
            foodId: it.foodId,
            variantId: it.variantId,
            grams: it.grams,
            snapshot: {
              name: s.name,
              variant: s.variant,
              kcal: s.kcal,
              protein: s.protein,
              carbs: s.carbs,
              fat: s.fat,
            },
          };
        }),
      };
    });
    const ids = new Set(templates.map((t) => t.id));
    if (ids.size !== templates.length) fail(`${where}: duplicate templates.`);
    // Exactly one template per weekday: a 7-slot array of known template ids.
    if (v.days.length !== 7 || !v.days.every((d) => isStr(d) && ids.has(d))) {
      fail(`${where}: every weekday must be assigned exactly one template.`);
    }
    return {
      from: v.from,
      libraryVersion: isNum(v.libraryVersion) ? v.libraryVersion : 1,
      carbCycling: cycling,
      templates,
      days: v.days as string[],
      savedAt: isNum(v.savedAt) ? v.savedAt : 0,
    };
  });
  for (let i = 1; i < versions.length; i++) {
    if (versions[i].from <= versions[i - 1].from)
      fail('Nutrition plan versions must be in increasing date order.');
  }
  const p = isObj(raw.profile) ? raw.profile : {};
  const profile =
    p.sex === 'male' &&
    isNum(p.heightCm) &&
    isDayKey(p.birthDate) &&
    isNum(p.activityFactor) &&
    isNum(p.kcalPerKgFat)
      ? {
          sex: 'male' as const,
          heightCm: p.heightCm,
          birthDate: p.birthDate,
          activityFactor: p.activityFactor,
          kcalPerKgFat: p.kcalPerKgFat,
        }
      : PROFILE;
  return { id: 'plan', profile, versions };
}

const macro = (v: unknown, where: string): number | null => {
  if (v === null || v === undefined) return null;
  if (!isNonNeg(v)) fail(`${where}: macros must be 0 or more, or unknown.`);
  return v;
};

const snap = (v: unknown, where: string) => {
  if (
    !isObj(v) ||
    !isStr(v.name) ||
    !isStr(v.variant) ||
    !isNonNeg(v.kcal) ||
    !isNonNeg(v.protein) ||
    !isNonNeg(v.carbs) ||
    !isNonNeg(v.fat)
  ) {
    fail(`${where}: nutrition values are invalid.`);
  }
  return { name: v.name, variant: v.variant, kcal: v.kcal, protein: v.protein, carbs: v.carbs, fat: v.fat };
};

const part = (v: unknown, where: string) => {
  if (
    !isObj(v) ||
    !isStr(v.foodId) ||
    !isStr(v.variantId) ||
    !isNum(v.grams) ||
    v.grams <= 0 ||
    v.grams > 5000
  ) {
    fail(`${where}: food or grams are invalid.`);
  }
  return { foodId: v.foodId, variantId: v.variantId, grams: v.grams, snapshot: snap(v.snapshot, where) };
};

function parseReplacements(raw: unknown[]): FoodReplacement[] {
  const list = raw.map((r, i): FoodReplacement => {
    const where = `Food replacement ${i + 1}`;
    if (!isObj(r) || !isStr(r.id) || !r.id || !isDayKey(r.date) || !isStr(r.templateId) || !isStr(r.itemId)) {
      fail(`${where} is invalid.`);
    }
    return {
      id: r.id,
      date: r.date,
      templateId: r.templateId,
      itemId: r.itemId,
      planFrom: isDayKey(r.planFrom) ? r.planFrom : r.date,
      original: part(r.original, where),
      replacement: part(r.replacement, where),
      recordedAt: isNum(r.recordedAt) ? r.recordedAt : 0,
    };
  });
  if (new Set(list.map((r) => r.id)).size !== list.length)
    fail('This backup contains duplicate food replacements.');
  const keys = list.map((r) => `${r.date}|${r.templateId}|${r.itemId}`);
  if (new Set(keys).size !== keys.length) fail('This backup replaces the same food twice on one day.');
  return list;
}

function parseNutrition(raw: unknown, version: number): NutritionImport {
  if (!isObj(raw) || !Array.isArray(raw.extras)) fail('Nutrition data in this backup is invalid.');
  const plan = parsePlan(raw.plan ?? null);
  const extras = raw.extras.map((e, i): ExtraFood => {
    const where = `Extra food ${i + 1}`;
    if (!isObj(e) || !isStr(e.id) || !e.id || !isDayKey(e.date)) fail(`${where} is invalid.`);
    if (!isNonNeg(e.kcal)) fail(`${where}: calories must be 0 or more.`);
    const kind = e.kind === 'library' ? 'library' : 'custom';
    const source = e.kcalSource === 'library' || e.kcalSource === 'macros' ? e.kcalSource : 'label';
    return {
      id: e.id,
      date: e.date,
      name: isStr(e.name) ? e.name.slice(0, 60) : '',
      kind,
      ...(kind === 'library' && isStr(e.foodId) && isStr(e.variantId) && isNum(e.grams)
        ? { foodId: e.foodId, variantId: e.variantId, grams: e.grams }
        : {}),
      kcal: e.kcal,
      kcalSource: source,
      protein: macro(e.protein, where),
      carbs: macro(e.carbs, where),
      fat: macro(e.fat, where),
      recordedAt: isNum(e.recordedAt) ? e.recordedAt : 0,
    };
  });
  if (new Set(extras.map((e) => e.id)).size !== extras.length)
    fail('This backup contains duplicate extra foods.');
  const replacements =
    version >= 6 && Array.isArray(raw.replacements) ? parseReplacements(raw.replacements) : undefined;
  return { plan, extras, ...(replacements ? { replacements } : {}) };
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
  const journey = data.version >= 4 && data.journey !== undefined ? parseJourney(data.journey) : undefined;
  const nutrition =
    data.version >= 5 && data.nutrition !== undefined
      ? parseNutrition(data.nutrition, data.version)
      : undefined;
  return { habits, entries, weight, burn, journey, nutrition };
}
