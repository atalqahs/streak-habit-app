import { describe, expect, it } from 'vitest';
import type { BurnEntry } from '../src/lib/burn';
import {
  ageOn,
  bmrMale,
  dayBalance,
  draftFromVersion,
  fatWeekDays,
  fatWeekStart,
  indexSources,
  makeReplacement,
  parseOptional,
  pastWeeks,
  planOn,
  resolveCustom,
  templateTotals,
  validateDraft,
  weekBalance,
  withVersion,
  type ExtraFood,
  type FoodReplacement,
  type NutritionPlan,
  type PlanDraft,
} from '../src/lib/fatloss';
import { FOODS, foodById, scale, sum, variantOf, type Per100 } from '../src/lib/foods';
import type { WeightEntry } from '../src/lib/weight';

/* ---------- helpers ---------- */

let n = 0;
const uid = () => `id${++n}`;
const item = (foodId: string, variantId: string, grams: number) => ({ id: uid(), foodId, variantId, grams });
const LOW = [
  item('chicken-thigh', 'cooked', 400),
  item('critical-whey-choc-30g', 'powder', 20),
  item('oats', 'dry', 50),
  item('peanut-butter', 'as-is', 16),
  item('white-rice', 'cooked', 300),
];
const HIGH = [
  item('chicken-thigh', 'cooked', 400),
  item('critical-whey-choc-30g', 'powder', 20),
  item('oats', 'dry', 70),
  item('peanut-butter', 'as-is', 16),
  item('white-rice', 'cooked', 420),
];
const all = (id: string) => [id, id, id, id, id, id, id];
const single = (items = LOW): PlanDraft => ({
  carbCycling: false,
  templates: [{ id: 'A', name: 'Daily', items }],
  days: all('A'),
});
// JS weekday order: Sun Mon Tue Wed Thu Fri Sat
const cycling = (days: string[], three = false): PlanDraft => ({
  carbCycling: true,
  templates: [
    { id: 'L', name: 'Low Carb', items: LOW },
    { id: 'H', name: 'High Carb', items: HIGH },
    ...(three ? [{ id: 'M', name: 'Medium Carb', items: LOW.slice(0, 3) }] : []),
  ],
  days,
});
const weightAt = (date: string, value: number, t = 0): WeightEntry => ({
  id: uid(),
  date,
  value,
  recordedAt: t || ++n,
});
const burn = (date: string, kcal: number): BurnEntry => ({ id: uid(), date, kcal, recordedAt: ++n });
const snack = (
  date: string,
  kcal: number,
  p: number | null = null,
  c: number | null = null,
  f: number | null = null,
): ExtraFood => ({
  id: uid(),
  date,
  name: 'Snack',
  kind: 'custom',
  kcal,
  kcalSource: 'label',
  protein: p,
  carbs: c,
  fat: f,
  recordedAt: ++n,
});
const r0 = (x: number) => Math.round(x);

// Week of Sat Oct 24 – Fri Oct 30, 2026. Today = Wed Oct 28.
const SAT = '2026-10-24';
const THU = '2026-10-29';
const TODAY = '2026-10-28';

/* ---------- food library ---------- */

describe('food library', () => {
  it('is preloaded with sourced, preparation-specific entries', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(15);
    for (const f of FOODS) for (const v of f.variants) expect(v.source.length).toBeGreaterThan(10);
    expect(variantOf('chicken-thigh', 'cooked')!.kcal).toBe(179);
    expect(variantOf('chicken-thigh', 'raw')!.kcal).toBe(121);
    expect(variantOf('white-rice', 'cooked')!.kcal).toBe(130);
    expect(variantOf('oats', 'dry')!.kcal).toBe(389);
  });

  it('uses the preparation chosen: 400 g cooked vs raw thigh', () => {
    expect(r0(scale(variantOf('chicken-thigh', 'cooked')!, 400).kcal)).toBe(716);
    expect(r0(scale(variantOf('chicken-thigh', 'raw')!, 400).kcal)).toBe(484);
  });

  it('20 g whey is 20 g of powder (14 g protein), not 20 g protein', () => {
    const w = scale(variantOf('critical-whey-choc-30g', 'powder')!, 20);
    expect(w.protein).toBeCloseTo(14.02, 2);
    expect(w.kcal).toBeCloseTo(73.6, 2);
  });

  it('shows no cooking selector for peanut butter, whey or oats', () => {
    for (const id of ['peanut-butter', 'critical-whey-choc-30g', 'oats'])
      expect(foodById(id)!.variants).toHaveLength(1);
    expect(foodById('chicken-breast')!.variants.map((v) => v.label)).toEqual(['Cooked', 'Raw']);
    expect(foodById('white-rice')!.variants.map((v) => v.label)).toEqual(['Cooked', 'Dry']);
  });

  it('different fish use their own values', () => {
    const fish = ['salmon-atlantic-farmed', 'tilapia', 'cod-atlantic', 'grouper', 'sea-bass'].map(
      (id) => variantOf(id, 'cooked')!.kcal,
    );
    expect(new Set(fish).size).toBe(fish.length);
  });

  it('reproduces the spec totals from the spec reference table (math check)', () => {
    const ref: Record<string, Per100> = {
      thigh: { kcal: 209, protein: 25.94, carbs: 0, fat: 10.88 },
      whey: { kcal: 368, protein: 70.1, carbs: 7.3, fat: 4.9 },
      oats: { kcal: 389, protein: 16.89, carbs: 66.27, fat: 6.9 },
      pb: { kcal: 588, protein: 25.09, carbs: 19.56, fat: 50.39 },
      rice: { kcal: 130, protein: 2.69, carbs: 28.17, fat: 0.28 },
    };
    const total = (g: number[]) =>
      sum(['thigh', 'whey', 'oats', 'pb', 'rice'].map((k, i) => scale(ref[k], g[i])));
    const low = total([400, 20, 50, 16, 300]);
    const high = total([400, 20, 70, 16, 420]);
    expect([r0(low.kcal), r0(low.protein), r0(low.carbs), r0(low.fat)]).toEqual([1588, 138, 122, 57]);
    expect([r0(high.kcal), r0(high.protein), r0(high.carbs), r0(high.fat)]).toEqual([1822, 145, 169, 59]);
  });

  it('verified-library totals for the example templates', () => {
    const plan = withVersion(null, cycling(['L', 'L', 'L', 'L', 'H', 'L', 'L']), TODAY);
    const [low, high] = plan.versions[0].templates.map(templateTotals);
    expect([r0(low.kcal), r0(low.protein), r0(low.carbs), r0(low.fat)]).toEqual([1470, 133, 123, 46]);
    expect([r0(high.kcal), r0(high.protein), r0(high.carbs), r0(high.fat)]).toEqual([1704, 140, 170, 48]);
  });
});

/* ---------- weekly plan ---------- */

describe('weekly plan validation', () => {
  const ok = (d: PlanDraft) => {
    const v = validateDraft(d);
    return v.missingDays.length === 0 && v.messages.length === 0;
  };
  it('accepts valid distributions', () => {
    expect(ok(single())).toBe(true); // one template, all 7 days
    expect(ok(cycling(['L', 'H', 'L', 'L', 'H', 'L', 'L']))).toBe(true); // five Low, two High
    expect(ok(cycling(['L', 'H', 'L', 'L', 'H', 'M', 'L'], true))).toBe(true); // three templates
    expect(ok(cycling(['L', 'L', 'H', 'L', 'L', 'H', 'L']))).toBe(true); // Low-Low-High repeating
    expect(ok(cycling(all('L')))).toBe(true); // one template on all days, others unused
  });

  it('rejects an incomplete week and names the missing day', () => {
    const d = single();
    d.days[5] = null; // Friday
    const v = validateDraft(d);
    expect(v.missingDays).toEqual([5]);
    const six = cycling(['L', 'H', 'L', 'L', 'H', 'L', 'L']);
    six.days[6] = null; // Saturday
    expect(validateDraft(six).missingDays).toEqual([6]);
  });

  it('enforces template counts and contents', () => {
    expect(validateDraft({ ...single(), carbCycling: true }).messages.join()).toMatch(/two or three/);
    const four = cycling(all('L'), true);
    four.templates.push({ id: 'X', name: 'X', items: LOW });
    expect(validateDraft(four).messages.join()).toMatch(/two or three/);
    expect(validateDraft(single([])).messages.join()).toMatch(/no foods/);
    expect(validateDraft(single([item('oats', 'dry', 0)])).messages.join()).toMatch(/greater than 0/);
  });

  it('confirmed first plan from Saturday; edits from today; same-day edit replaces', () => {
    let plan = withVersion(null, single(), TODAY, { sinceWeekStart: true });
    expect(plan.versions.map((v) => v.from)).toEqual([SAT]);
    plan = withVersion(plan, single(HIGH), TODAY);
    expect(plan.versions.map((v) => v.from)).toEqual([SAT, TODAY]);
    plan = withVersion(plan, single(LOW), TODAY);
    expect(plan.versions.map((v) => v.from)).toEqual([SAT, TODAY]);
    expect(templateTotals(planOn(plan, TODAY)!.templates[0]).kcal).toBeCloseTo(1469.78, 2);
    // Earlier days keep the first version.
    expect(planOn(plan, '2026-10-27')!.from).toBe(SAT);
    // Once a plan exists, the Saturday option is ignored: edits never backdate.
    plan = withVersion(plan, single(HIGH), '2026-10-29', { sinceWeekStart: true });
    expect(plan.versions.map((v) => v.from)).toEqual([SAT, TODAY, '2026-10-29']);
  });

  // Regression: the first plan was silently backdated to the previous Saturday.
  it('first plan starts on the day it is created unless adherence is confirmed', () => {
    const plan = withVersion(null, single(), TODAY);
    expect(plan.versions.map((v) => v.from)).toEqual([TODAY]);
    const ix = indexSources({ plan, weights: [weightAt('2026-10-01', 86.4)], burns: [], extras: [] });
    const w = weekBalance(ix, SAT, TODAY);
    // Sat–Tue are not estimated (no confirmed plan); only today counts.
    expect(w.days.slice(0, 4).map((d) => d.status)).toEqual([
      'unavailable',
      'unavailable',
      'unavailable',
      'unavailable',
    ]);
    expect(w.days.slice(0, 4).every((d) => d.reason === 'no-plan' && d.deficit === 0)).toBe(true);
    expect(w.counted).toBe(1);
    expect(w.netDeficit).toBeCloseTo(w.days[4].deficit, 9);
    // Explicit confirmation counts Saturday onward.
    const confirmed = withVersion(null, single(), TODAY, { sinceWeekStart: true });
    const wc = weekBalance(
      indexSources({ plan: confirmed, weights: [weightAt('2026-10-01', 86.4)], burns: [], extras: [] }),
      SAT,
      TODAY,
    );
    expect(wc.counted).toBe(5);
    // On a Saturday both choices are the same day.
    expect(withVersion(null, single(), SAT, { sinceWeekStart: true }).versions[0].from).toBe(SAT);
    // Weekly repetition is unaffected: next week's days all use the plan.
    expect(dayBalance(ix, '2026-11-01', '2026-11-06').templateName).toBe('Daily');
  });

  // Regression: today's figure is a whole-day projection, kept apart from completed days.
  it('separates completed days from today’s projected, provisional contribution', () => {
    const plan = withVersion(null, single(), TODAY, { sinceWeekStart: true });
    const ix = indexSources({
      plan,
      weights: [weightAt('2026-10-01', 86.4)],
      burns: [burn(TODAY, 300)],
      extras: [snack(TODAY, 120)],
    });
    const w = weekBalance(ix, SAT, TODAY);
    const todayDay = w.days[4];
    expect(todayDay.status).toBe('today');
    expect(w.completed.days).toBe(4);
    expect(w.completed.deficit).toBeCloseTo(
      w.days.slice(0, 4).reduce((s, d) => s + d.deficit, 0),
      9,
    );
    expect(w.todayProjected!.deficit).toBeCloseTo(todayDay.deficit, 9);
    // Projection = full day's sedentary expenditure + logged exercise − full planned intake − logged extras.
    expect(w.todayProjected!.deficit).toBeCloseTo(2181.3 + 300 - 1469.78 - 120, 6);
    expect(w.netDeficit).toBeCloseTo(w.completed.deficit + w.todayProjected!.deficit, 9);
    expect(w.fatGrams).toBeCloseTo(w.completed.fatGrams + w.todayProjected!.fatGrams, 9);
    // Future days are excluded from every part.
    expect(w.days.slice(5).every((d) => d.status === 'future' && d.deficit === 0)).toBe(true);
    // Still responsive: more exercise today raises only the projection.
    const more = weekBalance(
      indexSources({
        plan,
        weights: [weightAt('2026-10-01', 86.4)],
        burns: [burn(TODAY, 500)],
        extras: [snack(TODAY, 120)],
      }),
      SAT,
      TODAY,
    );
    expect(more.completed.deficit).toBeCloseTo(w.completed.deficit, 9);
    expect(more.todayProjected!.deficit - w.todayProjected!.deficit).toBeCloseTo(200, 9);
    // A completed past week has no projection.
    expect(weekBalance(ix, SAT, '2026-11-02').todayProjected).toBeNull();
  });

  it('repeats automatically every week until changed', () => {
    const plan = withVersion(null, cycling(['L', 'L', 'H', 'L', 'L', 'H', 'L']), TODAY, {
      sinceWeekStart: true,
    });
    const ix = indexSources({ plan, weights: [weightAt('2026-10-01', 86.4)], burns: [], extras: [] });
    expect(dayBalance(ix, '2026-11-02', '2026-11-30').templateName).toBe('Low Carb'); // Monday next week
    expect(dayBalance(ix, '2026-11-03', '2026-11-30').templateName).toBe('High Carb'); // Tuesday next week
    expect(dayBalance(ix, '2026-11-27', '2026-11-30').templateName).toBe('High Carb'); // Friday, a month later
    expect(dayBalance(ix, '2026-11-21', '2026-11-30').templateName).toBe('Low Carb'); // Saturday
  });

  it('snapshots values so library updates never rewrite history', () => {
    const plan = withVersion(null, single(), TODAY);
    expect(plan.versions[0].templates[0].items[0].snapshot).toMatchObject({ kcal: 179, variant: 'Cooked' });
    expect(plan.versions[0].libraryVersion).toBe(1);
  });
});

/* ---------- custom snacks ---------- */

describe('custom snack energy', () => {
  it('A: macros only → 4-4-9 = 250 kcal', () => {
    expect(resolveCustom(null, 10, 30, 10)).toMatchObject({ kcal: 250, kcalSource: 'macros' });
  });
  it('B: calories only → accepted, macros stay unknown', () => {
    expect(resolveCustom(250, null, null, null)).toMatchObject({
      kcal: 250,
      kcalSource: 'label',
      macroKcal: null,
    });
  });
  it('C: label calories win over a differing 4-4-9 estimate, never added', () => {
    const r = resolveCustom(240, 10, 30, 10);
    expect(r).toMatchObject({ kcal: 240, kcalSource: 'label', macroKcal: 250, mismatch: false });
    expect(resolveCustom(180, 10, 30, 10).mismatch).toBe(true);
  });
  it('does not invent totals from partial macros; zero is not unknown', () => {
    expect(resolveCustom(null, 10, null, 5).kcal).toBeNull();
    expect(resolveCustom(null, 0, 0, 0)).toMatchObject({ kcal: 0, kcalSource: 'macros' });
  });
  it('parses decimals, rejects negatives and junk', () => {
    expect(parseOptional('')).toEqual({ value: null });
    expect(parseOptional('12,5')).toEqual({ value: 12.5 });
    expect(parseOptional('0')).toEqual({ value: 0 });
    expect(parseOptional('-1').error).toBeTruthy();
    expect(parseOptional('abc').error).toBeTruthy();
    expect(parseOptional('NaN').error).toBeTruthy();
  });
});

/* ---------- energy balance ---------- */

describe('energy balance', () => {
  // Confirmed since Saturday so these scenarios cover the whole week.
  const plan: NutritionPlan = withVersion(null, single(), TODAY, { sinceWeekStart: true });
  const weights = [weightAt('2026-10-01', 86.4)];

  it('uses Mifflin–St Jeor × 1.2 plus recorded exercise, with age from the birth date', () => {
    expect(ageOn('1997-05-30', TODAY)).toBe(29);
    expect(ageOn('1997-05-30', '2027-05-29')).toBe(29);
    expect(ageOn('1997-05-30', '2027-05-30')).toBe(30);
    const ix = indexSources({ plan, weights, burns: [burn(TODAY, 350)], extras: [] });
    const d = dayBalance(ix, TODAY, TODAY);
    expect(d.bmr).toBeCloseTo(bmrMale(86.4, 175, 29), 6);
    expect(d.bmr).toBeCloseTo(1817.75, 6);
    expect(d.sedentary).toBeCloseTo(2181.3, 6);
    expect(d.tdee).toBeCloseTo(2531.3, 6);
    expect(d.deficit).toBeCloseTo(2531.3 - 1469.78, 2);
    expect(d.fatGrams).toBeCloseTo(((2531.3 - 1469.78) / 7700) * 1000, 4);
    expect(d.status).toBe('today');
  });

  it('D/E/F: a Thursday snack lowers that day by exactly its calories, only that day', () => {
    const today = '2026-10-30'; // Friday, so Thursday is complete
    const base = indexSources({ plan, weights, burns: [], extras: [] });
    const s = snack(THU, 250);
    const withSnack = indexSources({ plan, weights, burns: [], extras: [s] });
    const b = dayBalance(base, THU, today);
    const w = dayBalance(withSnack, THU, today);
    expect(w.intakeKcal - b.intakeKcal).toBeCloseTo(250, 9);
    expect(b.deficit - w.deficit).toBeCloseTo(250, 9);
    const wb = weekBalance(base, SAT, today);
    const ws = weekBalance(withSnack, SAT, today);
    expect(wb.netDeficit - ws.netDeficit).toBeCloseTo(250, 9);
    expect(wb.fatGrams - ws.fatGrams).toBeCloseTo(250 / 7.7, 9);
    // E: removing it restores the totals; the template is unchanged.
    expect(
      weekBalance(indexSources({ plan, weights, burns: [], extras: [] }), SAT, today).netDeficit,
    ).toBeCloseTo(wb.netDeficit, 9);
    expect(templateTotals(plan.versions[0].templates[0]).kcal).toBeCloseTo(1469.78, 2);
    // F: next Thursday has no snack.
    expect(dayBalance(withSnack, '2026-11-05', '2026-11-06').extraKcal).toBe(0);
  });

  it('reads Burn Goal records: explicit 0, edits and deletions', () => {
    const at = (burns: BurnEntry[]) =>
      dayBalance(indexSources({ plan, weights, burns, extras: [] }), '2026-10-25', TODAY);
    expect(at([])).toMatchObject({ exerciseKcal: 0, exerciseLogged: false });
    expect(at([burn('2026-10-25', 0)])).toMatchObject({ exerciseKcal: 0, exerciseLogged: true });
    const d170 = at([burn('2026-10-25', 170)]);
    const d350 = at([burn('2026-10-25', 350)]);
    expect(d350.deficit - d170.deficit).toBeCloseTo(180, 9);
    expect(at([burn('2026-10-25', 170), burn('2026-10-25', 100)]).exerciseKcal).toBe(270); // summed, once each
  });

  it('Saturday–Friday week: future excluded, today provisional, surpluses offset', () => {
    expect(fatWeekStart(TODAY)).toBe(SAT);
    expect(fatWeekStart(SAT)).toBe(SAT);
    expect(fatWeekStart('2026-10-30')).toBe(SAT); // Friday
    expect(fatWeekStart('2026-10-31')).toBe('2026-10-31'); // next Saturday starts a new week
    expect(fatWeekDays(SAT).at(-1)).toBe('2026-10-30');
    const ix = indexSources({ plan, weights, burns: [], extras: [snack('2026-10-25', 3000)] });
    const w = weekBalance(ix, SAT, TODAY);
    expect(w.days.map((d) => d.status)).toEqual([
      'complete',
      'complete',
      'complete',
      'complete',
      'today',
      'future',
      'future',
    ]);
    expect(w.counted).toBe(5);
    expect(w.elapsed).toBe(5);
    const sumCounted = w.days.slice(0, 5).reduce((s, d) => s + d.deficit, 0);
    expect(w.netDeficit).toBeCloseTo(sumCounted, 9);
    expect(w.days[1].deficit).toBeLessThan(0); // Sunday surplus
    expect(w.days[5].deficit).toBe(0);
  });

  it('a net-surplus week is negative, never shown as fat loss', () => {
    const ix = indexSources({ plan, weights, burns: [], extras: [snack(SAT, 9000)] });
    expect(weekBalance(ix, SAT, TODAY).fatGrams).toBeLessThan(0);
  });

  it('a new Saturday starts from zero; previous weeks stay separate', () => {
    const ix = indexSources({ plan, weights, burns: [], extras: [] });
    const sat = weekBalance(ix, fatWeekStart('2026-10-31'), '2026-10-31');
    expect(sat.counted).toBe(1);
    expect(sat.netDeficit).toBeCloseTo(sat.days[0].deficit, 9);
    const past = pastWeeks(ix, '2026-11-13'); // Friday
    expect(past.map((w) => w.start)).toEqual(['2026-10-31', SAT]);
    expect(pastWeeks(ix, '2026-11-14').map((w) => w.start)).toEqual(['2026-11-07', '2026-10-31', SAT]);
  });

  it('historical days keep their own weight; new weights apply going forward', () => {
    const ix = indexSources({
      plan,
      weights: [weightAt('2026-10-01', 90), weightAt(TODAY, 86)],
      burns: [],
      extras: [],
    });
    expect(dayBalance(ix, '2026-10-27', TODAY).weightKg).toBe(90);
    expect(dayBalance(ix, TODAY, TODAY).weightKg).toBe(86);
    // Before the first weigh-in the first logged weight is used.
    expect(
      dayBalance(indexSources({ plan, weights: [weightAt(TODAY, 86)], burns: [], extras: [] }), SAT, TODAY)
        .weightKg,
    ).toBe(86);
  });

  it('days without a plan or a weight are excluded, not guessed', () => {
    const none = indexSources({ plan, weights: [], burns: [], extras: [] });
    expect(dayBalance(none, TODAY, TODAY)).toMatchObject({
      status: 'unavailable',
      reason: 'no-weight',
      deficit: 0,
    });
    const before = indexSources({ plan, weights, burns: [], extras: [] });
    expect(dayBalance(before, '2026-10-20', TODAY)).toMatchObject({
      status: 'unavailable',
      reason: 'no-plan',
    });
  });

  it('macros include known snack macros and count unknowns', () => {
    const ix = indexSources({
      plan,
      weights,
      burns: [],
      extras: [snack(TODAY, 250, 10, 30, 10), snack(TODAY, 100)],
    });
    const d = dayBalance(ix, TODAY, TODAY);
    expect(d.macros.protein).toBeCloseTo(templateTotals(plan.versions[0].templates[0]).protein + 10, 9);
    expect(d.macros.unknown).toBe(1);
  });
});

/* ---------- one-day food replacement ---------- */

describe('one-day food replacement', () => {
  // Low on Sun, Mon, Wed, Thu, Sat; High on Tue, Fri (JS weekday order Sun…Sat).
  const days = ['L', 'L', 'H', 'L', 'L', 'H', 'L'];
  const plan = withVersion(null, cycling(days), TODAY, { sinceWeekStart: true });
  const low = plan.versions[0].templates.find((t) => t.id === 'L')!;
  const chicken = low.items[0];
  const rice = low.items[4];
  const weights = [weightAt('2026-10-01', 86.4)];
  const FRI = '2026-10-30';
  const NEXT_THU = '2026-11-05';
  const beef = (grams = 400, date = THU, item = chicken, id?: string) =>
    makeReplacement(
      {
        id,
        date,
        planFrom: SAT,
        templateId: 'L',
        item,
        foodId: 'beef-sirloin-0',
        variantId: 'cooked',
        grams,
      },
      ++n,
    );
  const ix = (replacements: FoodReplacement[], extras: ExtraFood[] = [], p = plan) =>
    indexSources({ plan: p, weights, burns: [], extras, replacements });
  const base = dayBalance(ix([]), THU, FRI);

  it('1–2: Thursday swaps chicken for beef — original removed, beef counted once', () => {
    const d = dayBalance(ix([beef()]), THU, FRI);
    expect(base.plannedKcal).toBeCloseTo(1469.78, 2);
    expect(d.plannedKcal).toBeCloseTo(1469.78 - 716 + 732, 6);
    expect(d.macros.protein).toBeCloseTo(base.macros.protein - 99.04 + 122.2, 6);
    expect(d.macros.fat).toBeCloseTo(base.macros.fat - 32.6 + 23.16, 6);
    expect(d.originalPlannedKcal).toBeCloseTo(base.plannedKcal, 9);
    expect(d.scheduled.filter((s) => s.replacement).map((s) => s.item.id)).toEqual([chicken.id]);
    // The template itself is untouched.
    expect(templateTotals(low).kcal).toBeCloseTo(1469.78, 2);
  });

  it('3–5: Friday, next Thursday and other days on the same template are unchanged', () => {
    const r = ix([beef()]);
    expect(dayBalance(r, FRI, FRI).plannedKcal).toBeCloseTo(dayBalance(ix([]), FRI, FRI).plannedKcal, 9);
    expect(dayBalance(r, FRI, FRI).templateName).toBe('High Carb');
    expect(dayBalance(r, NEXT_THU, '2026-11-06').plannedKcal).toBeCloseTo(1469.78, 2);
    for (const d of ['2026-10-25', '2026-10-26', '2026-10-28', '2026-10-24']) {
      expect(dayBalance(r, d, FRI).templateName).toBe('Low Carb');
      expect(dayBalance(r, d, FRI).plannedKcal).toBeCloseTo(1469.78, 2);
    }
  });

  it('6: reverting restores the original food and energy balance', () => {
    expect(dayBalance(ix([]), THU, FRI).deficit).toBeCloseTo(base.deficit, 9);
    expect(dayBalance(ix([beef()]), THU, FRI).deficit).not.toBeCloseTo(base.deficit, 3);
  });

  it('7: editing grams updates calories and macros', () => {
    const d = dayBalance(ix([beef(300)]), THU, FRI);
    expect(d.plannedKcal).toBeCloseTo(1469.78 - 716 + 549, 6);
    expect(d.macros.protein).toBeCloseTo(base.macros.protein - 99.04 + 91.65, 6);
  });

  it('8: several distinct replacements on one day', () => {
    const potatoes = makeReplacement(
      {
        date: THU,
        planFrom: SAT,
        templateId: 'L',
        item: rice,
        foodId: 'potatoes',
        variantId: 'boiled',
        grams: 400,
      },
      ++n,
    );
    const d = dayBalance(ix([beef(), potatoes]), THU, FRI);
    expect(d.plannedKcal).toBeCloseTo(1469.78 - 716 + 732 - 390 + 348, 6);
    expect(d.scheduled.filter((s) => s.replacement)).toHaveLength(2);
  });

  it('identifies the exact item when an ingredient repeats in a template', () => {
    const twin = withVersion(
      null,
      {
        carbCycling: false,
        templates: [
          {
            id: 'A',
            name: 'Daily',
            items: [item('chicken-thigh', 'cooked', 200), item('chicken-thigh', 'cooked', 200)],
          },
        ],
        days: all('A'),
      },
      TODAY,
      { sinceWeekStart: true },
    );
    const [first] = twin.versions[0].templates[0].items;
    const r = makeReplacement(
      {
        date: THU,
        planFrom: SAT,
        templateId: 'A',
        item: first,
        foodId: 'beef-sirloin-0',
        variantId: 'cooked',
        grams: 200,
      },
      ++n,
    );
    const d = dayBalance(
      indexSources({ plan: twin, weights, burns: [], extras: [], replacements: [r] }),
      THU,
      FRI,
    );
    expect(d.scheduled.map((s) => !!s.replacement)).toEqual([true, false]);
    expect(d.plannedKcal).toBeCloseTo(358 + 366, 6);
  });

  it('9: a replacement and an extra snack coexist without double counting', () => {
    const d = dayBalance(ix([beef()], [snack(THU, 250)]), THU, FRI);
    expect(d.intakeKcal).toBeCloseTo(1469.78 - 716 + 732 + 250, 6);
    expect(d.extraKcal).toBe(250);
    expect(base.deficit - d.deficit).toBeCloseTo(16 + 250, 6);
  });

  it('10: historical replacements keep their plan version and snapshots', () => {
    // Plan edited on Mon Nov 2 (chicken grams 400 → 350, same item id).
    const draft = draftFromVersion(plan.versions[0]);
    draft.templates[0].items[0].grams = 350;
    const edited = withVersion(plan, draft, '2026-11-02');
    const r = beef();
    // Thursday Oct 29 still uses version 1 and its replacement applies.
    expect(dayBalance(ix([r], [], edited), THU, '2026-11-06').plannedKcal).toBeCloseTo(
      1469.78 - 716 + 732,
      6,
    );
    // A replacement saved against the old item does not silently apply to the changed item.
    const stale = beef(400, NEXT_THU);
    const after = dayBalance(ix([stale], [], edited), NEXT_THU, '2026-11-06');
    expect(after.scheduled.some((s) => s.replacement)).toBe(false);
    expect(after.orphanedReplacements.map((x) => x.id)).toEqual([stale.id]);
    expect(after.plannedKcal).toBeCloseTo(1469.78 - 716 + 626.5, 6);
    // Stored replacement values are used even if the library later changes.
    const changed = {
      ...r,
      replacement: { ...r.replacement, snapshot: { ...r.replacement.snapshot, kcal: 200 } },
    };
    expect(dayBalance(ix([changed]), THU, FRI).plannedKcal).toBeCloseTo(1469.78 - 716 + 800, 6);
  });

  it('11: updates the daily deficit and weekly fat equivalent', () => {
    const w0 = weekBalance(ix([]), SAT, FRI);
    const w1 = weekBalance(ix([beef()]), SAT, FRI);
    expect(w0.netDeficit - w1.netDeficit).toBeCloseTo(16, 6);
    expect(w0.fatGrams - w1.fatGrams).toBeCloseTo((16 / 7700) * 1000, 6);
    // Today stays a provisional projection, separate from completed days.
    const highChicken = plan.versions[0].templates[1].items[0];
    const friBeef = makeReplacement(
      {
        date: FRI,
        planFrom: SAT,
        templateId: 'H',
        item: highChicken,
        foodId: 'beef-sirloin-0',
        variantId: 'cooked',
        grams: 400,
      },
      ++n,
    );
    const wt = weekBalance(ix([friBeef]), SAT, FRI);
    expect(wt.completed.deficit).toBeCloseTo(w0.completed.deficit, 9);
    expect(wt.todayProjected!.deficit).not.toBeCloseTo(w0.todayProjected!.deficit, 3);
    // A future replacement is not counted until its day.
    const future = weekBalance(ix([beef(400, NEXT_THU)]), fatWeekStart(NEXT_THU), '2026-11-03');
    expect(future.days.find((d) => d.date === NEXT_THU)!.deficit).toBe(0);
  });
});
