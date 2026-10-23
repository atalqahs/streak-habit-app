import type { Entry, Habit } from './types';
import type { WeightEntry, WeightSettings } from './weight';

/** Minimal promise wrapper around IndexedDB — no third-party library. */

const DB_NAME = 'habits';
/**
 * Schema history — upgrades only ever add stores, never clear or rewrite data.
 *   v1: habits, entries
 *   v2: + weightSettings, weightEntries
 */
const DB_VERSION = 2;
const HABITS = 'habits';
const ENTRIES = 'entries';
const WEIGHT_SETTINGS = 'weightSettings';
const WEIGHT_ENTRIES = 'weightEntries';

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

export async function loadAll(): Promise<{ habits: Habit[]; entries: Entry[]; weight: WeightData }> {
  const [habits, entries, settings, weightEntries] = await Promise.all([
    getAll<Habit>(HABITS),
    getAll<Entry>(ENTRIES),
    getAll<WeightSettings>(WEIGHT_SETTINGS),
    getAll<WeightEntry>(WEIGHT_ENTRIES),
  ]);
  return { habits, entries, weight: { settings: settings[0] ?? null, entries: weightEntries } };
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
 * When `weight` is undefined (a habit-only backup), weight data is left untouched.
 */
export function replaceAll(habits: Habit[], entries: Entry[], weight?: WeightData): Promise<void> {
  const stores = weight ? [HABITS, ENTRIES, WEIGHT_SETTINGS, WEIGHT_ENTRIES] : [HABITS, ENTRIES];
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
  });
}

/** Asks the browser to keep this origin's data from automatic eviction. */
export function requestPersistence(): void {
  navigator.storage?.persist?.().catch(() => {});
}
