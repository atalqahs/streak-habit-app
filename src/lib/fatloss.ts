import type { BurnEntry } from './burn';
import { addDays, weekday, type DayKey } from './dates';
import { foodById, LIBRARY_VERSION, scale, sum, variantOf, type Per100 } from './foods';
import { sortEntries, type WeightEntry } from './weight';

/* ---------- Fixed personal profile & calculation constants ---------- */

export interface Profile {
  sex: 'male';
  heightCm: number;
  birthDate: DayKey;
  /** Sedentary multiplier applied to BMR (lifestyle outside exercise). */
  activityFactor: number;
  /** Energy equivalent of 1 kg of body fat. */
  kcalPerKgFat: number;
}

export const PROFILE: Profile = {
  sex: 'male',
  heightCm: 175,
  birthDate: '1997-05-30',
  activityFactor: 1.2,
  kcalPerKgFat: 7700,
};

/** Whole years of age on `date`, from the birth date (calendar arithmetic). */
export function ageOn(birthDate: DayKey, date: DayKey): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Mifflin–St Jeor, male: 10·kg + 6.25·cm − 5·age + 5. */
export const bmrMale = (kg: number, cm: number, age: number) => 10 * kg + 6.25 * cm - 5 * age + 5;

/* ---------- Saturday–Friday tracking week (Asia/Kuwait day keys) ---------- */

/** JS weekday numbers in display order: Saturday first, Friday last. */
export const SAT_FIRST = [6, 0, 1, 2, 3, 4, 5] as const;
export const DAY_NAMES: Record<number, string> = {
  6: 'Saturday',
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
};

export const fatWeekStart = (key: DayKey): DayKey => addDays(key, -((weekday(key) + 1) % 7));
export const fatWeekDays = (start: DayKey): DayKey[] =>
  Array.from({ length: 7 }, (_, i) => addDays(start, i));

/* ---------- Nutrition plan ---------- */

export interface PlanItem {
  id: string;
  foodId: string;
  variantId: string;
  grams: number;
  /** Values per 100 g captured when the plan was saved (protects history from library updates). */
  snapshot: Per100 & { name: string; variant: string };
}

export interface DietTemplate {
  id: string;
  name: string;
  items: PlanItem[];
}

export interface PlanVersion {
  /** Effective from this day onward, until the next version. */
  from: DayKey;
  libraryVersion: number;
  carbCycling: boolean;
  templates: DietTemplate[];
  /** Template id per JS weekday (index 0 = Sunday … 6 = Saturday). */
  days: string[];
  savedAt: number;
}

export interface NutritionPlan {
  id: 'plan';
  profile: Profile;
  versions: PlanVersion[];
}

export const MAX_TEMPLATES = 3;

export function templateTotals(t: Pick<DietTemplate, 'items'>): Per100 {
  return sum(t.items.map((i) => scale(i.snapshot, i.grams)));
}

export function planOn(plan: NutritionPlan | null, date: DayKey): PlanVersion | null {
  if (!plan) return null;
  let found: PlanVersion | null = null;
  for (const version of plan.versions) {
    if (version.from <= date) found = version;
    else break;
  }
  return found;
}

export interface PlanDraft {
  carbCycling: boolean;
  templates: {
    id: string;
    name: string;
    items: { id: string; foodId: string; variantId: string; grams: number }[];
  }[];
  /** Template id or null per JS weekday. */
  days: (string | null)[];
}

export interface PlanIssues {
  /** Weekdays (JS numbers) without a template, in Saturday-first order. */
  missingDays: number[];
  messages: string[];
}

/**
 * Validates a draft. Every weekday must have exactly one template (the data shape
 * makes a double assignment impossible; imports are checked separately); a
 * template may be used on any number of days.
 */
export function validateDraft(draft: PlanDraft): PlanIssues {
  const messages: string[] = [];
  const ids = new Set(draft.templates.map((t) => t.id));
  const count = draft.templates.length;
  if (draft.carbCycling ? count < 2 || count > MAX_TEMPLATES : count !== 1) {
    messages.push(draft.carbCycling ? 'Carb Cycling uses two or three templates.' : 'Use one template.');
  }
  draft.templates.forEach((t) => {
    const label = t.name.trim() || 'A template';
    if (!t.name.trim()) messages.push('Give every template a name.');
    if (t.items.length === 0) messages.push(`${label} has no foods yet.`);
    t.items.forEach((i) => {
      if (!variantOf(i.foodId, i.variantId)) messages.push(`${label} has an unknown food.`);
      if (!Number.isFinite(i.grams) || i.grams <= 0)
        messages.push(`Enter grams greater than 0 for every food in ${label}.`);
      else if (i.grams > 5000) messages.push(`Enter 5,000 g or less for each food in ${label}.`);
    });
  });
  const missingDays = SAT_FIRST.filter((d) => !draft.days[d] || !ids.has(draft.days[d]!));
  return { missingDays, messages: [...new Set(messages)] };
}

export const isDraftValid = (issues: PlanIssues) =>
  issues.missingDays.length === 0 && issues.messages.length === 0;

/** Builds a stored plan version from a valid draft, snapshotting library values. */
export function versionFromDraft(draft: PlanDraft, from: DayKey): PlanVersion {
  return {
    from,
    libraryVersion: LIBRARY_VERSION,
    carbCycling: draft.carbCycling,
    templates: draft.templates.map((t) => ({
      id: t.id,
      name: t.name.trim(),
      items: t.items.map((i) => {
        const variant = variantOf(i.foodId, i.variantId)!;
        return {
          id: i.id,
          foodId: i.foodId,
          variantId: i.variantId,
          grams: i.grams,
          snapshot: {
            name: foodById(i.foodId)?.name ?? i.foodId,
            variant: variant.label,
            kcal: variant.kcal,
            protein: variant.protein,
            carbs: variant.carbs,
            fat: variant.fat,
          },
        };
      }),
    })),
    days: draft.days.map((d) => d!),
    savedAt: Date.now(),
  };
}

export interface SaveOptions {
  /**
   * First plan only: the user confirmed they have followed it since this week's
   * Saturday. Without this confirmation no earlier day is ever assumed.
   */
  sinceWeekStart?: boolean;
}

/**
 * Adds a version to the plan. Every version applies from today by default — no
 * past adherence is assumed. Only a first plan may start on the current week's
 * Saturday, and only when the user confirms it (`sinceWeekStart`). An edit on the
 * same day replaces that day's version; completed weeks are never rewritten.
 */
export function withVersion(
  plan: NutritionPlan | null,
  draft: PlanDraft,
  today: DayKey,
  options: SaveOptions = {},
): NutritionPlan {
  const isFirst = !plan || plan.versions.length === 0;
  const from = isFirst && options.sinceWeekStart ? fatWeekStart(today) : today;
  const kept = (plan?.versions ?? []).filter((v) => v.from < from);
  return {
    id: 'plan',
    profile: plan?.profile ?? PROFILE,
    versions: [...kept, versionFromDraft(draft, from)],
  };
}

export function draftFromVersion(v: PlanVersion): PlanDraft {
  return {
    carbCycling: v.carbCycling,
    templates: v.templates.map((t) => ({
      id: t.id,
      name: t.name,
      items: t.items.map((i) => ({ id: i.id, foodId: i.foodId, variantId: i.variantId, grams: i.grams })),
    })),
    days: [...v.days],
  };
}

/* ---------- Extra (exceptional) food ---------- */

export interface ExtraFood {
  id: string;
  date: DayKey;
  name: string;
  kind: 'library' | 'custom';
  foodId?: string;
  variantId?: string;
  grams?: number;
  /** Always known: label value, library value, or calculated from all three macros. */
  kcal: number;
  kcalSource: 'library' | 'label' | 'macros';
  /** null = unknown (not entered), which is different from an entered 0. */
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  recordedAt: number;
}

export const atwater = (p: number, c: number, f: number) => p * 4 + c * 4 + f * 9;

export type NumberField = { value: number | null; error?: string };

/** Blank → unknown (null). Otherwise a finite, non-negative number; decimals allowed. */
export function parseOptional(text: string, max = 100_000): NumberField {
  const t = text.trim().replace(',', '.');
  if (t === '') return { value: null };
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return { value: null, error: 'Enter a number of 0 or more.' };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return { value: null, error: 'Enter a number of 0 or more.' };
  if (n > max) return { value: null, error: `Enter ${max.toLocaleString('en-US')} or less.` };
  return { value: n };
}

export interface CustomSnackResult {
  kcal: number | null;
  kcalSource: 'label' | 'macros' | null;
  /** 4-4-9 estimate when all three macros are known. */
  macroKcal: number | null;
  /** True when label calories and the 4-4-9 estimate differ noticeably. */
  mismatch: boolean;
  error?: string;
}

/**
 * Resolves a custom snack's energy:
 *  - calories entered → the label value is authoritative (never overwritten or added to);
 *  - calories blank + all three macros → 4-4-9;
 *  - calories blank + any macro unknown → no total is invented.
 */
export function resolveCustom(
  kcal: number | null,
  p: number | null,
  c: number | null,
  f: number | null,
): CustomSnackResult {
  const allMacros = p !== null && c !== null && f !== null;
  const macroKcal = allMacros ? atwater(p, c, f) : null;
  if (kcal !== null) {
    const mismatch = macroKcal !== null && Math.abs(macroKcal - kcal) > Math.max(20, kcal * 0.1);
    return { kcal, kcalSource: 'label', macroKcal, mismatch };
  }
  if (macroKcal !== null) return { kcal: macroKcal, kcalSource: 'macros', macroKcal, mismatch: false };
  return {
    kcal: null,
    kcalSource: null,
    macroKcal: null,
    mismatch: false,
    error: 'Enter the calories, or all three macros to calculate them.',
  };
}

/* ---------- Energy balance ---------- */

export interface Macros {
  protein: number;
  carbs: number;
  fat: number;
  /** Extra foods on the day(s) with at least one unknown macro. */
  unknown: number;
}

export type DayStatus = 'complete' | 'today' | 'future' | 'unavailable';

export interface DayBalance {
  date: DayKey;
  status: DayStatus;
  /** Why a past/today day cannot be estimated. */
  reason?: 'no-plan' | 'no-weight';
  templateName: string | null;
  plannedKcal: number;
  extraKcal: number;
  extras: ExtraFood[];
  intakeKcal: number;
  exerciseKcal: number;
  /** Whether any Burn Goal entry exists for the date (an explicit 0 counts). */
  exerciseLogged: boolean;
  weightKg: number | null;
  age: number;
  bmr: number;
  sedentary: number;
  tdee: number;
  /** Positive = estimated deficit, negative = surplus. */
  deficit: number;
  fatGrams: number;
  macros: Macros;
}

/** Weight in effect on `date`: the latest entry on/before it, else the first entry ever logged. */
export function weightOn(sorted: WeightEntry[], date: DayKey): number | null {
  if (!sorted.length) return null;
  let found: WeightEntry | null = null;
  for (const e of sorted) {
    if (e.date <= date) found = e;
    else break;
  }
  return (found ?? sorted[0]).value;
}

export interface Sources {
  plan: NutritionPlan | null;
  weights: WeightEntry[];
  burns: BurnEntry[];
  extras: ExtraFood[];
}

/** Pre-indexes records by date so a week can be computed cheaply. */
export function indexSources(s: Sources) {
  const burnByDate = new Map<DayKey, number>();
  for (const b of s.burns) burnByDate.set(b.date, (burnByDate.get(b.date) ?? 0) + b.kcal);
  const extrasByDate = new Map<DayKey, ExtraFood[]>();
  for (const e of [...s.extras].sort((a, b) => a.recordedAt - b.recordedAt)) {
    if (!extrasByDate.has(e.date)) extrasByDate.set(e.date, []);
    extrasByDate.get(e.date)!.push(e);
  }
  return { plan: s.plan, weights: sortEntries(s.weights), burnByDate, extrasByDate };
}

export type Indexed = ReturnType<typeof indexSources>;

export function dayBalance(ix: Indexed, date: DayKey, today: DayKey): DayBalance {
  const profile = ix.plan?.profile ?? PROFILE;
  const version = planOn(ix.plan, date);
  const template = version
    ? (version.templates.find((t) => t.id === version.days[weekday(date)]) ?? null)
    : null;
  const planned = template ? templateTotals(template) : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const extras = ix.extrasByDate.get(date) ?? [];
  const extraKcal = extras.reduce((s, e) => s + e.kcal, 0);
  const macros: Macros = { protein: planned.protein, carbs: planned.carbs, fat: planned.fat, unknown: 0 };
  for (const e of extras) {
    if (e.protein === null || e.carbs === null || e.fat === null) macros.unknown++;
    macros.protein += e.protein ?? 0;
    macros.carbs += e.carbs ?? 0;
    macros.fat += e.fat ?? 0;
  }
  const exerciseLogged = ix.burnByDate.has(date);
  const exerciseKcal = ix.burnByDate.get(date) ?? 0;
  const weightKg = weightOn(ix.weights, date);
  const age = ageOn(profile.birthDate, date);
  const bmr = weightKg === null ? 0 : bmrMale(weightKg, profile.heightCm, age);
  const sedentary = bmr * profile.activityFactor;
  const tdee = sedentary + exerciseKcal;
  const intakeKcal = planned.kcal + extraKcal;

  let status: DayStatus = date > today ? 'future' : date === today ? 'today' : 'complete';
  let reason: DayBalance['reason'];
  if (status !== 'future' && !template) {
    status = 'unavailable';
    reason = 'no-plan';
  } else if (status !== 'future' && weightKg === null) {
    status = 'unavailable';
    reason = 'no-weight';
  }
  const counted = status === 'complete' || status === 'today';
  const deficit = counted ? tdee - intakeKcal : 0;

  return {
    date,
    status,
    reason,
    templateName: template?.name ?? null,
    plannedKcal: planned.kcal,
    extraKcal,
    extras,
    intakeKcal,
    exerciseKcal,
    exerciseLogged,
    weightKg,
    age,
    bmr,
    sedentary,
    tdee,
    deficit,
    fatGrams: (deficit / profile.kcalPerKgFat) * 1000,
    macros,
  };
}

export interface WeekBalance {
  start: DayKey;
  days: DayBalance[];
  /** Days that count: completed days plus today (provisional), with a plan and a weight. */
  counted: number;
  /** Days of the week up to and including today. */
  elapsed: number;
  /** Weekly total = completed days + today's projection. */
  netDeficit: number;
  fatGrams: number;
  /** Finished days only — final for those days. */
  completed: { days: number; deficit: number; fatGrams: number };
  /**
   * Today's projection: the whole day's planned intake and estimated expenditure
   * (plus anything logged so far). Provisional until Kuwait midnight; null when
   * today is outside this week or cannot be estimated.
   */
  todayProjected: { deficit: number; fatGrams: number } | null;
  macros: Macros;
}

/** Sums only elapsed, estimable days of the Saturday–Friday week. Future days are never included. */
export function weekBalance(ix: Indexed, start: DayKey, today: DayKey): WeekBalance {
  const days = fatWeekDays(start).map((d) => dayBalance(ix, d, today));
  const counted = days.filter((d) => d.status === 'complete' || d.status === 'today');
  const netDeficit = counted.reduce((s, d) => s + d.deficit, 0);
  const macros = counted.reduce<Macros>(
    (m, d) => ({
      protein: m.protein + d.macros.protein,
      carbs: m.carbs + d.macros.carbs,
      fat: m.fat + d.macros.fat,
      unknown: m.unknown + d.macros.unknown,
    }),
    { protein: 0, carbs: 0, fat: 0, unknown: 0 },
  );
  const perKg = (ix.plan?.profile ?? PROFILE).kcalPerKgFat;
  const toGrams = (kcal: number) => (kcal / perKg) * 1000;
  const done = counted.filter((d) => d.status === 'complete');
  const completedDeficit = done.reduce((s, d) => s + d.deficit, 0);
  const todayDay = counted.find((d) => d.status === 'today');
  return {
    start,
    days,
    counted: counted.length,
    elapsed: days.filter((d) => d.date <= today).length,
    netDeficit,
    fatGrams: toGrams(netDeficit),
    completed: { days: done.length, deficit: completedDeficit, fatGrams: toGrams(completedDeficit) },
    todayProjected: todayDay ? { deficit: todayDay.deficit, fatGrams: toGrams(todayDay.deficit) } : null,
    macros,
  };
}

/** Completed weeks since the plan began, newest first. Each week stands alone — never summed. */
export function pastWeeks(ix: Indexed, today: DayKey, limit = 52): WeekBalance[] {
  const first = ix.plan?.versions[0]?.from;
  if (!first) return [];
  const out: WeekBalance[] = [];
  for (
    let w = addDays(fatWeekStart(today), -7);
    w >= fatWeekStart(first) && out.length < limit;
    w = addDays(w, -7)
  ) {
    out.push(weekBalance(ix, w, today));
  }
  return out;
}

/* ---------- Import validation ---------- */

export function isPlanDayArray(days: unknown, templateIds: Set<string>): days is string[] {
  return (
    Array.isArray(days) && days.length === 7 && days.every((d) => typeof d === 'string' && templateIds.has(d))
  );
}
