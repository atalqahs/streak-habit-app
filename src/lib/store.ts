import { useCallback, useEffect, useMemo, useState } from 'react';
import * as db from './db';
import { msUntilNextDay, todayKey, type DayKey } from './dates';
import { computeStreak, type StreakInfo } from './streak';
import { entryId, type Entry, type Habit } from './types';
import { sortBurn, withGoal, type BurnEntry, type BurnSettings } from './burn';
import type { JourneySettings } from './journey';
import {
  withVersion,
  type ExtraFood,
  type FoodReplacement,
  type NutritionPlan,
  type PlanDraft,
  type SaveOptions,
} from './fatloss';
import { sortEntries, type WeightEntry, type WeightSettings } from './weight';

/** habitId → (date → entry) */
export type EntryIndex = Map<string, Map<DayKey, Entry>>;

function indexEntries(entries: Entry[]): EntryIndex {
  const index: EntryIndex = new Map();
  for (const entry of entries) {
    let byDate = index.get(entry.habitId);
    if (!byDate) index.set(entry.habitId, (byDate = new Map()));
    byDate.set(entry.date, entry);
  }
  return index;
}

const byOrder = (a: Habit, b: Habit) => a.order - b.order;

/** The current Asia/Kuwait day, updated at midnight and when the app returns to the foreground. */
export function useToday(): DayKey {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    let timer = 0;
    const refresh = () => {
      setToday(todayKey());
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, msUntilNextDay());
    };
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return today;
}

export function useHabitStore(today: DayKey, onError: (message: string) => void) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [entries, setEntries] = useState<EntryIndex>(new Map());
  const [weight, setWeight] = useState<db.WeightData>({ settings: null, entries: [] });
  const [burn, setBurn] = useState<db.BurnData>({ settings: null, entries: [] });
  const [journey, setJourney] = useState<JourneySettings | null>(null);
  const [nutrition, setNutrition] = useState<db.NutritionData>({ plan: null, extras: [], replacements: [] });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    db.loadAll()
      .then((data) => {
        setHabits(data.habits.sort(byOrder));
        setEntries(indexEntries(data.entries));
        setWeight({ settings: data.weight.settings, entries: sortEntries(data.weight.entries) });
        setBurn({ settings: data.burn.settings, entries: sortBurn(data.burn.entries) });
        setJourney(data.journey);
        setNutrition(data.nutrition);
      })
      .catch(() =>
        onError('Your saved habits could not be loaded. Storage may be unavailable in this browser mode.'),
      )
      .finally(() => setReady(true));
    db.requestPersistence();
  }, [onError]);

  const persist = useCallback(
    (work: Promise<void>) => work.catch(() => onError('Could not save. Please try again.')),
    [onError],
  );

  const saveHabit = useCallback(
    (habit: Habit) => {
      setHabits((list) => {
        const exists = list.some((h) => h.id === habit.id);
        return (exists ? list.map((h) => (h.id === habit.id ? habit : h)) : [...list, habit]).sort(byOrder);
      });
      void persist(db.putHabits([habit]));
    },
    [persist],
  );

  const reorder = useCallback(
    (ordered: Habit[]) => {
      const next = ordered.map((h, order) => ({ ...h, order }));
      setHabits(next);
      void persist(db.putHabits(next));
    },
    [persist],
  );

  const removeHabit = useCallback(
    (id: string) => {
      setHabits((list) => list.filter((h) => h.id !== id));
      setEntries((index) => {
        const next = new Map(index);
        next.delete(id);
        return next;
      });
      void persist(db.deleteHabit(id));
    },
    [persist],
  );

  /** Records a value for a day; 0 removes the record. Future days are rejected. */
  const setValue = useCallback(
    (habit: Habit, date: DayKey, value: number) => {
      if (date > today || date < habit.start) return;
      const id = entryId(habit.id, date);
      // Past days keep the goal they were recorded against; today follows the current goal.
      const previous = entries.get(habit.id)?.get(date);
      const target = habit.type === 'simple' ? 1 : previous && date < today ? previous.target : habit.target;
      const entry: Entry = { id, habitId: habit.id, date, value, target };
      setEntries((index) => {
        const next = new Map(index);
        const byDate = new Map(index.get(habit.id));
        if (value > 0) byDate.set(date, entry);
        else byDate.delete(date);
        next.set(habit.id, byDate);
        return next;
      });
      void persist(value > 0 ? db.putEntry(entry) : db.deleteEntry(id));
    },
    [entries, persist, today],
  );

  /** A section that is undefined (absent from an older backup) keeps the current data. */
  const replaceAll = useCallback(
    async (
      nextHabits: Habit[],
      nextEntries: Entry[],
      nextWeight?: db.WeightData,
      nextBurn?: db.BurnData,
      nextJourney?: JourneySettings | null,
      nextNutrition?: db.NutritionImport,
    ) => {
      await db.replaceAll(nextHabits, nextEntries, nextWeight, nextBurn, nextJourney, nextNutrition);
      setHabits([...nextHabits].sort(byOrder));
      setEntries(indexEntries(nextEntries));
      if (nextWeight) setWeight({ settings: nextWeight.settings, entries: sortEntries(nextWeight.entries) });
      if (nextBurn) setBurn({ settings: nextBurn.settings, entries: sortBurn(nextBurn.entries) });
      if (nextJourney !== undefined) setJourney(nextJourney);
      if (nextNutrition) {
        setNutrition((n) => ({
          plan: nextNutrition.plan,
          extras: nextNutrition.extras,
          replacements: nextNutrition.replacements ?? n.replacements,
        }));
      }
    },
    [],
  );

  /* ---------- Weight ---------- */

  const saveWeightSettings = useCallback(
    (start: number, goal: number) => {
      const settings: WeightSettings = { id: 'settings', start, goal, updatedAt: Date.now() };
      setWeight((w) => ({ ...w, settings }));
      void persist(db.putWeightSettings(settings));
    },
    [persist],
  );

  // New measurements get a recording time strictly after every existing one, so
  // several entries on the same day always keep the order they were logged in.
  const nextRecordedAt = (list: WeightEntry[]) =>
    list.reduce((max, e) => Math.max(max, e.recordedAt + 1), Date.now());

  /** First-time setup: settings and the first measurement are written together. */
  const setupWeight = useCallback(
    (start: number, current: number, goal: number) => {
      const settings: WeightSettings = { id: 'settings', start, goal, updatedAt: Date.now() };
      const entry: WeightEntry = {
        id: crypto.randomUUID(),
        date: today,
        value: current,
        recordedAt: nextRecordedAt(weight.entries),
      };
      setWeight((w) => ({ settings, entries: sortEntries([...w.entries, entry]) }));
      void persist(db.putWeight(settings, [entry]));
    },
    [persist, today, weight.entries],
  );

  /** Adds a measurement, or updates one when `id` matches an existing entry. Future dates are rejected. */
  const saveWeightEntry = useCallback(
    (input: WeightEntry) => {
      if (input.date > today) return;
      const isNew = !weight.entries.some((e) => e.id === input.id);
      const entry = isNew ? { ...input, recordedAt: nextRecordedAt(weight.entries) } : input;
      setWeight((w) => ({
        ...w,
        entries: sortEntries([...w.entries.filter((e) => e.id !== entry.id), entry]),
      }));
      void persist(db.putWeight(null, [entry]));
    },
    [persist, today, weight.entries],
  );

  const deleteWeightEntry = useCallback(
    (id: string) => {
      setWeight((w) => ({ ...w, entries: w.entries.filter((e) => e.id !== id) }));
      void persist(db.deleteWeightEntry(id));
    },
    [persist],
  );

  /* ---------- Nutrition & fat loss ---------- */

  /** Saves a validated weekly plan as a new dated version (see withVersion). */
  const saveNutritionPlan = useCallback(
    (draft: PlanDraft, options?: SaveOptions) => {
      const plan: NutritionPlan = withVersion(nutrition.plan, draft, today, options);
      setNutrition((n) => ({ ...n, plan }));
      void persist(db.putNutritionPlan(plan));
    },
    [nutrition.plan, persist, today],
  );

  /** Adds or updates an extra food for its date only. Future dates are rejected. */
  const saveExtraFood = useCallback(
    (input: ExtraFood) => {
      if (input.date > today || !Number.isFinite(input.kcal) || input.kcal < 0) return;
      const isNew = !nutrition.extras.some((e) => e.id === input.id);
      const recordedAt = nutrition.extras.reduce((m, e) => Math.max(m, e.recordedAt + 1), Date.now());
      const extra = isNew ? { ...input, recordedAt } : input;
      setNutrition((n) => ({ ...n, extras: [...n.extras.filter((e) => e.id !== extra.id), extra] }));
      void persist(db.putExtraFood(extra));
    },
    [nutrition.extras, persist, today],
  );

  /**
   * Saves a one-day replacement. One replacement per plan item per date: saving
   * again for the same item updates it rather than adding a second.
   */
  const saveReplacement = useCallback(
    (r: FoodReplacement) => {
      if (!Number.isFinite(r.replacement.grams) || r.replacement.grams <= 0) return;
      const clash = nutrition.replacements.find(
        (x) => x.id !== r.id && x.date === r.date && x.templateId === r.templateId && x.itemId === r.itemId,
      );
      const recordedAt = nutrition.replacements.reduce((m, x) => Math.max(m, x.recordedAt + 1), Date.now());
      const next = { ...r, id: clash?.id ?? r.id, recordedAt };
      setNutrition((n) => ({
        ...n,
        replacements: [...n.replacements.filter((x) => x.id !== next.id && x.id !== r.id), next],
      }));
      void persist(
        clash && clash.id !== r.id
          ? db.deleteFoodReplacement(r.id).then(() => db.putFoodReplacement(next))
          : db.putFoodReplacement(next),
      );
    },
    [nutrition.replacements, persist],
  );

  /** Reverts a replacement: the scheduled food counts again for that date. */
  const deleteReplacement = useCallback(
    (id: string) => {
      setNutrition((n) => ({ ...n, replacements: n.replacements.filter((x) => x.id !== id) }));
      void persist(db.deleteFoodReplacement(id));
    },
    [persist],
  );

  const deleteExtraFood = useCallback(
    (id: string) => {
      setNutrition((n) => ({ ...n, extras: n.extras.filter((e) => e.id !== id) }));
      void persist(db.deleteExtraFood(id));
    },
    [persist],
  );

  /* ---------- Journey ---------- */

  /** Creates a journey starting today (Asia/Kuwait), replacing any current one. */
  const startJourney = useCallback(
    (name: string, end: string) => {
      if (end <= today) return;
      const next: JourneySettings = {
        id: 'settings',
        name,
        start: today,
        end,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setJourney(next);
      void persist(db.putJourney(next));
    },
    [persist, today],
  );

  /** Updates name and end date; the start date is never changed here. */
  const updateJourney = useCallback(
    (name: string, end: string) => {
      if (!journey || end <= journey.start) return;
      const next: JourneySettings = { ...journey, name, end, updatedAt: Date.now() };
      setJourney(next);
      void persist(db.putJourney(next));
    },
    [journey, persist],
  );

  /* ---------- Calorie burn ---------- */

  /** Saves the weekly goal (effective from this week) and planned training days. */
  const saveBurnSettings = useCallback(
    (goal: number, trainingDays: number[]) => {
      const settings: BurnSettings = {
        id: 'settings',
        goals: withGoal(burn.settings, goal, today),
        trainingDays: [...new Set(trainingDays)].sort((a, b) => a - b),
        updatedAt: Date.now(),
      };
      setBurn((b) => ({ ...b, settings }));
      void persist(db.putBurnSettings(settings));
    },
    [burn.settings, persist, today],
  );

  /** Adds an entry, or updates one whose id already exists. Future dates are rejected. */
  const saveBurnEntry = useCallback(
    (input: BurnEntry) => {
      if (input.date > today || !Number.isInteger(input.kcal) || input.kcal < 0) return;
      const isNew = !burn.entries.some((e) => e.id === input.id);
      const recordedAt = burn.entries.reduce((max, e) => Math.max(max, e.recordedAt + 1), Date.now());
      const entry = isNew ? { ...input, recordedAt } : input;
      setBurn((b) => ({ ...b, entries: sortBurn([...b.entries.filter((e) => e.id !== entry.id), entry]) }));
      void persist(db.putBurnEntry(entry));
    },
    [burn.entries, persist, today],
  );

  const deleteBurnEntry = useCallback(
    (id: string) => {
      setBurn((b) => ({ ...b, entries: b.entries.filter((e) => e.id !== id) }));
      void persist(db.deleteBurnEntry(id));
    },
    [persist],
  );

  const streaks = useMemo(() => {
    const map = new Map<string, StreakInfo>();
    for (const habit of habits) map.set(habit.id, computeStreak(habit, entries.get(habit.id), today));
    return map;
  }, [habits, entries, today]);

  const allEntries = useCallback(() => [...entries.values()].flatMap((m) => [...m.values()]), [entries]);

  return {
    ready,
    habits,
    entries,
    streaks,
    saveHabit,
    reorder,
    removeHabit,
    setValue,
    replaceAll,
    allEntries,
    weight,
    saveWeightSettings,
    setupWeight,
    saveWeightEntry,
    deleteWeightEntry,
    burn,
    saveBurnSettings,
    saveBurnEntry,
    deleteBurnEntry,
    journey,
    startJourney,
    updateJourney,
    nutrition,
    saveNutritionPlan,
    saveExtraFood,
    deleteExtraFood,
    saveReplacement,
    deleteReplacement,
  };
}

export type HabitStore = ReturnType<typeof useHabitStore>;
