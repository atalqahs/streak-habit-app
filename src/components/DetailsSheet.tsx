import { WEEKDAY_NAMES, WEEKDAY_SHORT, formatDate, weekday, type DayKey } from '../lib/dates';
import { describeStreak, type StreakInfo } from '../lib/streak';
import type { Habit } from '../lib/types';
import { Flame, Hourglass } from './icons';
import { Sheet, useConfirm, useSheetClose } from './Sheet';

interface Props {
  habit: Habit;
  streak: StreakInfo;
  today: DayKey;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function DetailsSheet(props: Props) {
  return (
    <Sheet title={`${props.habit.icon} ${props.habit.name}`} onClose={props.onClose}>
      <Details {...props} />
    </Sheet>
  );
}

function scheduleText(days: number[]): string {
  if (days.length === 7) return 'Every day';
  if (days.join() === '0,1,2,3,4') return 'Sunday – Thursday';
  if (days.join() === '1,2,3,4,5') return 'Monday – Friday';
  return days.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

const STATUS_LABEL = {
  none: 'Not started',
  active: 'Active',
  'at-risk': 'At risk',
  broken: 'Ended',
} as const;

function Details({ habit, streak, today, onEdit, onDelete }: Props) {
  const close = useSheetClose();
  const confirm = useConfirm();
  const days = habit.schedule[habit.schedule.length - 1].days;
  const goal =
    habit.type === 'simple'
      ? 'Complete once'
      : `${habit.target}${habit.unit ? ` ${habit.unit}` : ''} per day`;

  return (
    <div className="details">
      <div className="stats">
        <div className="stat">
          <span className="stat-value">
            <Flame size={20} />
            {streak.current}
            {streak.status === 'at-risk' && <Hourglass size={18} />}
          </span>
          <span className="stat-label">Current Streak</span>
        </div>
        <div className="stat">
          <span className="stat-value">{streak.best}</span>
          <span className="stat-label">Best Streak</span>
        </div>
        <div className="stat">
          <span className="stat-value">{streak.total}</span>
          <span className="stat-label">Completions</span>
        </div>
      </div>

      <div className={`status-card ${streak.status}`}>
        <span className="status-pill">{STATUS_LABEL[streak.status]}</span>
        <p>{describeStreak(streak, today, (d) => WEEKDAY_NAMES[weekday(d)])}</p>
      </div>

      <dl className="info-list">
        <div>
          <dt>Schedule</dt>
          <dd>{scheduleText(days)}</dd>
        </div>
        <div>
          <dt>Goal</dt>
          <dd>{goal}</dd>
        </div>
        <div>
          <dt>Tracking since</dt>
          <dd>{formatDate(habit.start)}</dd>
        </div>
      </dl>

      <div className="details-actions">
        <button type="button" className="btn secondary block" onClick={onEdit}>
          Edit Habit
        </button>
        <button
          type="button"
          className="btn danger-text block"
          onClick={async () => {
            const ok = await confirm({
              title: `Delete “${habit.name}”?`,
              message: 'This permanently removes the habit and its entire history. This cannot be undone.',
              confirmLabel: 'Delete',
              destructive: true,
            });
            if (ok) {
              onDelete();
              close();
            }
          }}
        >
          Delete Habit
        </button>
      </div>
    </div>
  );
}
