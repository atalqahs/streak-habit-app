import { useCallback, useEffect, useMemo, useState } from 'react';
import * as db from './db';
import { msUntilNextDay, todayKey, type DayKey } from './dates';
import { computeStreak, type StreakInfo } from './streak';
import { entryId, type Entry, type Habit } from './types';

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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    db.loadAll()
      .then((data) => {
        setHabits(data.habits.sort(byOrder));
        setEntries(indexEntries(data.entries));
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

  const replaceAll = useCallback(async (nextHabits: Habit[], nextEntries: Entry[]) => {
    await db.replaceAll(nextHabits, nextEntries);
    setHabits([...nextHabits].sort(byOrder));
    setEntries(indexEntries(nextEntries));
  }, []);

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
  };
}

export type HabitStore = ReturnType<typeof useHabitStore>;
