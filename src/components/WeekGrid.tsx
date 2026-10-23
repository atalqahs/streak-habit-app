import { memo, useRef } from 'react';
import { WEEKDAY_LETTERS, formatDay, type DayKey } from '../lib/dates';
import type { EntryIndex } from '../lib/store';
import { isScheduled, type StreakInfo } from '../lib/streak';
import { isComplete, type Entry, type Habit } from '../lib/types';
import { Check, Flame, Hourglass } from './icons';

interface Props {
  habits: Habit[];
  entries: EntryIndex;
  streaks: Map<string, StreakInfo>;
  days: DayKey[];
  today: DayKey;
  /** -1 = arrived from the previous week, 1 = from the next week, 0 = initial. */
  direction: number;
  canNext: boolean;
  canPrev: boolean;
  onWeek: (delta: number) => void;
  onCell: (habit: Habit, date: DayKey) => void;
  onDetails: (habit: Habit) => void;
}

const SWIPE_START = 12;
const SWIPE_COMMIT = 56;

export function WeekGrid(props: Props) {
  const { habits, entries, streaks, days, today, direction, canNext, canPrev, onWeek, onCell, onDetails } =
    props;
  const bodyRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    x: number;
    y: number;
    dx: number;
    active: boolean;
    id: number;
  } | null>(null);
  const suppressClick = useRef(false);

  // Horizontal swipe to change week. A movement threshold plus a
  // horizontal-dominance check keeps vertical scrolling and taps reliable,
  // and a swipe never toggles the cell it started on.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      dx: 0,
      active: false,
      id: e.pointerId,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.active) {
      if (Math.abs(dy) > SWIPE_START && Math.abs(dy) > Math.abs(dx)) {
        gesture.current = null;
        return;
      }
      if (Math.abs(dx) < SWIPE_START || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      g.active = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    const blocked = (dx < 0 && !canNext) || (dx > 0 && !canPrev);
    g.dx = dx;
    const shift = blocked ? dx / 6 : dx / 2.5;
    bodyRef.current!.style.transition = 'none';
    bodyRef.current!.style.transform = `translateX(${shift}px)`;
    bodyRef.current!.style.opacity = String(1 - Math.min(Math.abs(shift) / 240, 0.35));
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== e.pointerId || !g.active) return;
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 0);
    const body = bodyRef.current!;
    body.style.transition = '';
    body.style.transform = '';
    body.style.opacity = '';
    if (g.dx <= -SWIPE_COMMIT && canNext) onWeek(1);
    else if (g.dx >= SWIPE_COMMIT && canPrev) onWeek(-1);
  };

  return (
    <div
      className="grid-card"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
    >
      <div ref={bodyRef} className="grid-body" key={days[0]} data-dir={direction}>
        <div className="grid-row grid-header" aria-hidden="true">
          <span />
          {days.map((day, i) => (
            <span key={day} className={`day-head${day === today ? ' today' : ''}`}>
              <span className="day-letter">{WEEKDAY_LETTERS[i]}</span>
              <span className="day-num">{Number(day.slice(8))}</span>
            </span>
          ))}
        </div>
        <div role="list" aria-label="Habits this week">
          {habits.map((habit) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              byDate={entries.get(habit.id)}
              streak={streaks.get(habit.id)!}
              days={days}
              today={today}
              onCell={onCell}
              onDetails={onDetails}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  habit: Habit;
  byDate: Map<DayKey, Entry> | undefined;
  streak: StreakInfo;
  days: DayKey[];
  today: DayKey;
  onCell: (habit: Habit, date: DayKey) => void;
  onDetails: (habit: Habit) => void;
}

/** Memoized so a tap on one habit re-renders only that row. */
const HabitRow = memo(function HabitRow({ habit, byDate, streak, days, today, onCell, onDetails }: RowProps) {
  const atRisk = streak.status === 'at-risk';
  const streakLabel = `${streak.current} day streak${atRisk ? ', at risk' : ''}`;
  return (
    <div className="grid-row habit-row" role="listitem">
      <div className="habit-name-cell">
        <div className="habit-label">
          <button type="button" className="habit-name-btn" onClick={() => onDetails(habit)}>
            <span className="habit-icon" aria-hidden="true">
              {habit.icon}
            </span>
            <span className="habit-name">{habit.name}</span>
          </button>
          <button
            type="button"
            className={`streak${streak.current === 0 ? ' zero' : ''}`}
            aria-label={`${habit.name}: ${streakLabel}. Show details`}
            onClick={() => onDetails(habit)}
          >
            <Flame />
            <span className="streak-num">{streak.current}</span>
            {atRisk && <Hourglass />}
          </button>
        </div>
      </div>
      {days.map((day) => (
        <DayCell key={day} habit={habit} day={day} today={today} entry={byDate?.get(day)} onCell={onCell} />
      ))}
    </div>
  );
});

interface CellProps {
  habit: Habit;
  day: DayKey;
  today: DayKey;
  entry: Entry | undefined;
  onCell: (habit: Habit, date: DayKey) => void;
}

function DayCell({ habit, day, today, entry, onCell }: CellProps) {
  const future = day > today;
  const beforeStart = day < habit.start;
  const scheduled = isScheduled(habit, day);
  const done = isComplete(entry);
  const progress = !done && entry && habit.type !== 'simple' ? Math.min(entry.value / entry.target, 1) : 0;
  const disabled = future || beforeStart;

  let state = 'open';
  if (done) state = 'done';
  else if (beforeStart) state = 'inactive';
  else if (!scheduled) state = 'rest';
  else if (future) state = 'inactive';

  const dayLabel = formatDay(day, today);
  let status = done ? 'completed' : scheduled ? (day < today ? 'missed' : 'not completed') : 'rest day';
  if (future) status = 'upcoming';
  if (beforeStart) status = 'not tracked yet';
  if (progress > 0 && entry)
    status = `${entry.value} of ${entry.target}${habit.unit ? ` ${habit.unit}` : ''}`;

  return (
    <button
      type="button"
      className={`cell ${state}${day === today ? ' is-today' : ''}`}
      disabled={disabled}
      aria-label={`${habit.name}, ${dayLabel}: ${status}`}
      aria-pressed={habit.type === 'simple' && !disabled ? done : undefined}
      onClick={() => onCell(habit, day)}
    >
      <span className="dot">
        {progress > 0 && (
          <svg className="ring" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="16" pathLength="100" strokeDasharray={`${progress * 100} 100`} />
          </svg>
        )}
        {done && <Check size={16} className="check" />}
      </span>
    </button>
  );
}
