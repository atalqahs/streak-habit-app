import type { Entry, Habit } from './types';
import type { BurnEntry, BurnSettings } from './burn';
import type { ExtraFood, FoodReplacement, NutritionPlan } from './fatloss';
import type { JourneySettings } from './journey';
import type { WeightEntry, WeightSettings } from './weight';

/** Minimal promise wrapper around IndexedDB — no third-party library. */

const DB_NAME = 'habits';
/**
 * Schema history — upgrades only ever add stores, never clear or rewrite data.
 *   v1: habits, entries
 *   v2: + weightSettings, weightEntries
 *   v3: + burnSettings, burnEntries
 *   v4: + journey
 *   v5: + nutritionPlan, extraFoods
 *   v6: + foodReplacements
 */
const DB_VERSION = 6;
const HABITS = 'habits';
const ENTRIES = 'entries';
const WEIGHT_SETTINGS = 'weightSettings';
const WEIGHT_ENTRIES = 'weightEntries';
const BURN_SETTINGS = 'burnSettings';
const BURN_ENTRIES = 'burnEntries';
const JOURNEY = 'journey';
const NUTRITION_PLAN = 'nutritionPlan';
const EXTRA_FOODS = 'extraFoods';
const FOOD_REPLACEMENTS = 'foodReplacements';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HABITS)) db.createObjectStore(HABITS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(ENTRIES)) {
        db.createObjectStore(ENTRIES, { keyPath: 'id' }).createIndex('habitId', 'habitId');
      }
      if (!db.objectStoreNames.contains(WEIGHT_SETTINGS))
        db.createObjectStore(WEIGHT_SETTINGS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(WEIGHT_ENTRIES)) {
        db.createObjectStore(WEIGHT_ENTRIES, { keyPath: 'id' }).createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains(BURN_SETTINGS))
        db.createObjectStore(BURN_SETTINGS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(BURN_ENTRIES)) {
        db.createObjectStore(BURN_ENTRIES, { keyPath: 'id' }).createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains(JOURNEY)) db.createObjectStore(JOURNEY, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(NUTRITION_PLAN))
        db.createObjectStore(NUTRITION_PLAN, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(EXTRA_FOODS)) {
        db.createObjectStore(EXTRA_FOODS, { keyPath: 'id' }).createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains(FOOD_REPLACEMENTS)) {
        db.createObjectStore(FOOD_REPLACEMENTS, { keyPath: 'id' }).createIndex('date', 'date');
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgraded the schema: drop this connection so it can proceed.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

async function run(
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => void,
): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    work(tx);
  });
}

function getAll<T>(store: string): Promise<T[]> {
  return open().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        const request = db.transaction(store, 'readonly').objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      }),
  );
}

export interface WeightData {
  settings: WeightSettings | null;
  entries: WeightEntry[];
}

export interface BurnData {
  settings: BurnSettings | null;
  entries: BurnEntry[];
}

export async function loadAll(): Promise<{
  habits: Habit[];
  entries: Entry[];
  weight: WeightData;
  burn: BurnData;
  journey: JourneySettings | null;
  nutrition: NutritionData;
}> {
  const [habits, entries, settings, weightEntries, burnSettings, burnEntries, journey] = await Promise.all([
    getAll<Habit>(HABITS),
    getAll<Entry>(ENTRIES),
    getAll<WeightSettings>(WEIGHT_SETTINGS),
    getAll<WeightEntry>(WEIGHT_ENTRIES),
    getAll<BurnSettings>(BURN_SETTINGS),
    getAll<BurnEntry>(BURN_ENTRIES),
    getAll<JourneySettings>(JOURNEY),
  ]);
  const [plans, extras, replacements] = await Promise.all([
    getAll<NutritionPlan>(NUTRITION_PLAN),
    getAll<ExtraFood>(EXTRA_FOODS),
    getAll<FoodReplacement>(FOOD_REPLACEMENTS),
  ]);
  return {
    habits,
    entries,
    weight: { settings: settings[0] ?? null, entries: weightEntries },
    burn: { settings: burnSettings[0] ?? null, entries: burnEntries },
    journey: journey[0] ?? null,
    nutrition: { plan: plans[0] ?? null, extras, replacements },
  };
}

export interface NutritionData {
  plan: NutritionPlan | null;
  extras: ExtraFood[];
  /** One-day food replacements, kept apart from the plan and extra foods. */
  replacements: FoodReplacement[];
}

/** Nutrition section of an import; `replacements` is absent in backups made before v6. */
export type NutritionImport = Omit<NutritionData, 'replacements'> & { replacements?: FoodReplacement[] };

export function putFoodReplacement(r: FoodReplacement): Promise<void> {
  return run([FOOD_REPLACEMENTS], 'readwrite', (tx) => tx.objectStore(FOOD_REPLACEMENTS).put(r));
}

export function deleteFoodReplacement(id: string): Promise<void> {
  return run([FOOD_REPLACEMENTS], 'readwrite', (tx) => tx.objectStore(FOOD_REPLACEMENTS).delete(id));
}

export function putNutritionPlan(plan: NutritionPlan): Promise<void> {
  return run([NUTRITION_PLAN], 'readwrite', (tx) => tx.objectStore(NUTRITION_PLAN).put(plan));
}

export function putExtraFood(extra: ExtraFood): Promise<void> {
  return run([EXTRA_FOODS], 'readwrite', (tx) => tx.objectStore(EXTRA_FOODS).put(extra));
}

export function deleteExtraFood(id: string): Promise<void> {
  return run([EXTRA_FOODS], 'readwrite', (tx) => tx.objectStore(EXTRA_FOODS).delete(id));
}

export function putJourney(journey: JourneySettings): Promise<void> {
  return run([JOURNEY], 'readwrite', (tx) => tx.objectStore(JOURNEY).put(journey));
}

export function putBurnSettings(settings: BurnSettings): Promise<void> {
  return run([BURN_SETTINGS], 'readwrite', (tx) => tx.objectStore(BURN_SETTINGS).put(settings));
}

export function putBurnEntry(entry: BurnEntry): Promise<void> {
  return run([BURN_ENTRIES], 'readwrite', (tx) => tx.objectStore(BURN_ENTRIES).put(entry));
}

export function deleteBurnEntry(id: string): Promise<void> {
  return run([BURN_ENTRIES], 'readwrite', (tx) => tx.objectStore(BURN_ENTRIES).delete(id));
}

export function putWeightSettings(settings: WeightSettings): Promise<void> {
  return run([WEIGHT_SETTINGS], 'readwrite', (tx) => tx.objectStore(WEIGHT_SETTINGS).put(settings));
}

/** Saves settings and any number of measurements atomically (used by first-time setup). */
export function putWeight(settings: WeightSettings | null, entries: WeightEntry[]): Promise<void> {
  return run([WEIGHT_SETTINGS, WEIGHT_ENTRIES], 'readwrite', (tx) => {
    if (settings) tx.objectStore(WEIGHT_SETTINGS).put(settings);
    for (const entry of entries) tx.objectStore(WEIGHT_ENTRIES).put(entry);
  });
}

export function deleteWeightEntry(id: string): Promise<void> {
  return run([WEIGHT_ENTRIES], 'readwrite', (tx) => tx.objectStore(WEIGHT_ENTRIES).delete(id));
}

export function putHabits(habits: Habit[]): Promise<void> {
  return run([HABITS], 'readwrite', (tx) => {
    const store = tx.objectStore(HABITS);
    for (const habit of habits) store.put(habit);
  });
}

export function putEntry(entry: Entry): Promise<void> {
  return run([ENTRIES], 'readwrite', (tx) => tx.objectStore(ENTRIES).put(entry));
}

export function deleteEntry(id: string): Promise<void> {
  return run([ENTRIES], 'readwrite', (tx) => tx.objectStore(ENTRIES).delete(id));
}

/** Deletes a habit and all of its entries atomically. */
export function deleteHabit(id: string): Promise<void> {
  return run([HABITS, ENTRIES], 'readwrite', (tx) => {
    tx.objectStore(HABITS).delete(id);
    const index = tx.objectStore(ENTRIES).index('habitId');
    index.openKeyCursor(IDBKeyRange.only(id)).onsuccess = function () {
      const cursor = this.result;
      if (!cursor) return;
      tx.objectStore(ENTRIES).delete(cursor.primaryKey);
      cursor.continue();
    };
  });
}

/**
 * Replaces every record in one transaction — either all of it lands or none.
 * A section that is undefined (absent from an older backup) is left untouched.
 */
export function replaceAll(
  habits: Habit[],
  entries: Entry[],
  weight?: WeightData,
  burn?: BurnData,
  /** null clears the journey; undefined leaves it untouched. */
  journey?: JourneySettings | null,
  nutrition?: NutritionImport,
): Promise<void> {
  const stores = [HABITS, ENTRIES];
  if (nutrition) stores.push(NUTRITION_PLAN, EXTRA_FOODS);
  if (nutrition?.replacements) stores.push(FOOD_REPLACEMENTS);
  if (journey !== undefined) stores.push(JOURNEY);
  if (weight) stores.push(WEIGHT_SETTINGS, WEIGHT_ENTRIES);
  if (burn) stores.push(BURN_SETTINGS, BURN_ENTRIES);
  return run(stores, 'readwrite', (tx) => {
    const h = tx.objectStore(HABITS);
    const e = tx.objectStore(ENTRIES);
    h.clear();
    e.clear();
    for (const habit of habits) h.put(habit);
    for (const entry of entries) e.put(entry);
    if (weight) {
      const ws = tx.objectStore(WEIGHT_SETTINGS);
      const we = tx.objectStore(WEIGHT_ENTRIES);
      ws.clear();
      we.clear();
      if (weight.settings) ws.put(weight.settings);
      for (const entry of weight.entries) we.put(entry);
    }
    if (burn) {
      const bs = tx.objectStore(BURN_SETTINGS);
      const be = tx.objectStore(BURN_ENTRIES);
      bs.clear();
      be.clear();
      if (burn.settings) bs.put(burn.settings);
      for (const entry of burn.entries) be.put(entry);
    }
    if (journey !== undefined) {
      const js = tx.objectStore(JOURNEY);
      js.clear();
      if (journey) js.put(journey);
    }
    if (nutrition) {
      const np = tx.objectStore(NUTRITION_PLAN);
      const ef = tx.objectStore(EXTRA_FOODS);
      np.clear();
      ef.clear();
      if (nutrition.plan) np.put(nutrition.plan);
      for (const extra of nutrition.extras) ef.put(extra);
      // Older backups have no replacements section: existing replacements are kept.
      if (nutrition.replacements) {
        const fr = tx.objectStore(FOOD_REPLACEMENTS);
        fr.clear();
        for (const r of nutrition.replacements) fr.put(r);
      }
    }
  });
}

/** Asks the browser to keep this origin's data from automatic eviction. */
export function requestPersistence(): void {
  navigator.storage?.persist?.().catch(() => {});
}
