import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, formatWeekRange, weekDays, weekStart, type DayKey } from './lib/dates';
import { useHabitStore, useToday } from './lib/store';
import { isComplete, type Habit } from './lib/types';
import { DetailsSheet } from './components/DetailsSheet';
import { HabitFormSheet } from './components/HabitForm';
import { ProgressSheet } from './components/ProgressSheet';
import { ReorderSheet, SettingsSheet } from './components/SettingsSheet';
import { ConfirmProvider } from './components/Sheet';
import { WeekGrid } from './components/WeekGrid';
import { ReservedCard, WeightCard } from './components/WeightCard';
import { WeightSetupSheet, WeightSheet } from './components/WeightSheet';
import { ChevronLeft, ChevronRight, Plus, Settings } from './components/icons';

type SheetState =
  | { kind: 'add' }
  | { kind: 'edit'; id: string }
  | { kind: 'details'; id: string }
  | { kind: 'progress'; id: string; date: DayKey }
  | { kind: 'settings' }
  | { kind: 'reorder' }
  | { kind: 'weight' }
  | { kind: 'weight-setup' }
  | null;

export function App() {
  return (
    <ConfirmProvider>
      <Main />
    </ConfirmProvider>
  );
}

function Main() {
  const today = useToday();
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const notify = useCallback((text: string) => setToast({ id: Date.now(), text }), []);
  const store = useHabitStore(today, notify);
  const { habits, entries, streaks } = store;

  const currentWeek = weekStart(today);
  const [week, setWeek] = useState(currentWeek);
  const [direction, setDirection] = useState(0);
  const [sheet, setSheet] = useState<SheetState>(null);
  const closeSheet = useCallback(() => setSheet(null), []);

  // Follow the calendar into a new week if the user was looking at "this week".
  const lastCurrent = useRef(currentWeek);
  useEffect(() => {
    if (lastCurrent.current !== currentWeek) {
      setWeek((w) => (w === lastCurrent.current ? currentWeek : w));
      lastCurrent.current = currentWeek;
    }
  }, [currentWeek]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const earliest = useMemo(
    () => habits.reduce((min, h) => (h.start < min ? h.start : min), today),
    [habits, today],
  );
  const minWeek = weekStart(earliest);
  const canPrev = week > minWeek;
  const canNext = week < currentWeek;
  const goWeek = useCallback(
    (delta: number) => {
      setDirection(delta);
      setWeek((w) => {
        const next = addDays(w, delta * 7);
        if (next > currentWeek) return currentWeek;
        if (next < minWeek) return minWeek;
        return next;
      });
    },
    [currentWeek, minWeek],
  );

  // Read the latest state through a ref so the callback stays stable and
  // memoized rows only re-render when their own data changes.
  const latest = useRef({ entries, setValue: store.setValue, today });
  latest.current = { entries, setValue: store.setValue, today };
  const onCell = useCallback((habit: Habit, date: DayKey) => {
    const { entries, setValue, today } = latest.current;
    if (date > today || date < habit.start) return;
    if (habit.type === 'simple') {
      const done = isComplete(entries.get(habit.id)?.get(date));
      setValue(habit, date, done ? 0 : 1);
    } else {
      setSheet({ kind: 'progress', id: habit.id, date });
    }
  }, []);
  const openWeight = useCallback(() => setSheet({ kind: 'weight' }), []);
  const openWeightSetup = useCallback(() => setSheet({ kind: 'weight-setup' }), []);
  const onDetails = useCallback((habit: Habit) => setSheet({ kind: 'details', id: habit.id }), []);

  const days = useMemo(() => weekDays(week), [week]);
  const find = (id: string) => habits.find((h) => h.id === id);
  const sheetHabit = sheet && 'id' in sheet ? find(sheet.id) : undefined;

  return (
    <>
      <main className="app">
        <header className="top">
          <h1>Habits</h1>
          <div className="top-actions">
            <button
              type="button"
              className="icon-btn"
              aria-label="Settings"
              onClick={() => setSheet({ kind: 'settings' })}
            >
              <Settings />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Add habit"
              onClick={() => setSheet({ kind: 'add' })}
            >
              <Plus />
            </button>
          </div>
        </header>

        <nav className="week-nav" aria-label="Week">
          <p className="week-range" aria-live="polite">
            {formatWeekRange(week, today)}
          </p>
          {week !== currentWeek && (
            <button
              type="button"
              className="chip today-chip"
              onClick={() => {
                setDirection(1);
                setWeek(currentWeek);
              }}
            >
              This Week
            </button>
          )}
          <button
            type="button"
            className="icon-btn small"
            aria-label="Previous week"
            disabled={!canPrev}
            onClick={() => goWeek(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            className="icon-btn small"
            aria-label="Next week"
            disabled={!canNext}
            onClick={() => goWeek(1)}
          >
            <ChevronRight size={18} />
          </button>
        </nav>

        {store.ready && habits.length === 0 ? (
          <section className="empty">
            <div className="empty-dots" aria-hidden="true">
              <span className="d done" />
              <span className="d done" />
              <span className="d" />
              <span className="d done" />
            </div>
            <h2>Build your week</h2>
            <p>Add a habit, choose the days it repeats, and keep your streak alive.</p>
            <button type="button" className="btn primary" onClick={() => setSheet({ kind: 'add' })}>
              Add Your First Habit
            </button>
          </section>
        ) : (
          store.ready && (
            <WeekGrid
              habits={habits}
              entries={entries}
              streaks={streaks}
              days={days}
              today={today}
              direction={direction}
              canNext={canNext}
              canPrev={canPrev}
              onWeek={goWeek}
              onCell={onCell}
              onDetails={onDetails}
            />
          )
        )}

        {store.ready && (
          <div className="cards">
            <WeightCard weight={store.weight} onOpen={openWeight} onSetup={openWeightSetup} />
            {/* Reserved slots for future features — replace each with its real card. */}
            <ReservedCard />
            <ReservedCard />
          </div>
        )}
      </main>

      {sheet?.kind === 'add' && (
        <HabitFormSheet
          key="add"
          today={today}
          nextOrder={habits.length}
          onSave={store.saveHabit}
          onClose={closeSheet}
        />
      )}
      {sheet?.kind === 'edit' && sheetHabit && (
        <HabitFormSheet
          key={`edit-${sheetHabit.id}`}
          habit={sheetHabit}
          today={today}
          nextOrder={habits.length}
          onSave={store.saveHabit}
          onClose={closeSheet}
        />
      )}
      {sheet?.kind === 'details' && sheetHabit && (
        <DetailsSheet
          key={`details-${sheetHabit.id}`}
          habit={sheetHabit}
          streak={streaks.get(sheetHabit.id)!}
          today={today}
          onEdit={() => setSheet({ kind: 'edit', id: sheetHabit.id })}
          onDelete={() => store.removeHabit(sheetHabit.id)}
          onClose={closeSheet}
        />
      )}
      {sheet?.kind === 'progress' && sheetHabit && (
        <ProgressSheet
          key={`progress-${sheetHabit.id}-${sheet.date}`}
          habit={sheetHabit}
          date={sheet.date}
          today={today}
          entry={entries.get(sheetHabit.id)?.get(sheet.date)}
          onSave={(value) => store.setValue(sheetHabit, sheet.date, value)}
          onClose={closeSheet}
        />
      )}
      {sheet?.kind === 'settings' && (
        <SettingsSheet
          key="settings"
          habits={habits}
          getEntries={store.allEntries}
          weight={store.weight}
          onImport={store.replaceAll}
          onReorder={() => setSheet({ kind: 'reorder' })}
          notify={notify}
          onClose={closeSheet}
        />
      )}
      {sheet?.kind === 'weight-setup' && (
        <WeightSetupSheet key="weight-setup" onSave={store.setupWeight} onClose={closeSheet} />
      )}
      {sheet?.kind === 'weight' && (
        <WeightSheet
          key="weight"
          weight={store.weight}
          today={today}
          onSaveEntry={store.saveWeightEntry}
          onDeleteEntry={store.deleteWeightEntry}
          onSaveTargets={store.saveWeightSettings}
          onClose={closeSheet}
        />
      )}
      {sheet?.kind === 'reorder' && (
        <ReorderSheet key="reorder" habits={habits} onReorder={store.reorder} onClose={closeSheet} />
      )}

      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            {toast.text}
          </div>
        )}
      </div>
    </>
  );
}
