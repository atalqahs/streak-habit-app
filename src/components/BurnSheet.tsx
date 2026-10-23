import { useId, useRef, useState } from 'react';
import { formatKcal, goalFor, parseGoal, parseKcal, weeklyHistory, type BurnEntry } from '../lib/burn';
import {
  WEEKDAY_LETTERS,
  WEEKDAY_NAMES,
  formatDay,
  formatWeekRange,
  isDayKey,
  weekStart,
  type DayKey,
} from '../lib/dates';
import type { BurnData } from '../lib/db';
import { Check } from './icons';
import { Sheet, useConfirm, useSheetClose } from './Sheet';

const PRESET_DAYS: { label: string; days: number[] }[] = [
  { label: 'Every Day', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Sun–Thu', days: [0, 1, 2, 3, 4] },
  { label: 'Mon–Fri', days: [1, 2, 3, 4, 5] },
];

/** Digits only: iPhone shows the numeric keypad for this combination. */
const numericProps = {
  inputMode: 'numeric',
  pattern: '[0-9]*',
  autoComplete: 'off',
  enterKeyHint: 'done',
} as const;

/* ---------- Log & history ---------- */

interface LogProps {
  burn: BurnData;
  today: DayKey;
  onSave: (entry: BurnEntry) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function BurnLogSheet(props: LogProps) {
  return (
    <Sheet title="Log Burn" onClose={props.onClose} focusField>
      <BurnLog {...props} />
    </Sheet>
  );
}

const WEEKS_SHOWN = 4;

function BurnLog({ burn, today, onSave, onDelete }: LogProps) {
  const uid = useId();
  const close = useSheetClose();
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const saving = useRef(false);
  const [editing, setEditing] = useState<BurnEntry | null>(null);
  const [kcal, setKcal] = useState('');
  const [date, setDate] = useState(today);
  const [errors, setErrors] = useState<{ kcal?: string; date?: string }>({});
  const [allWeeks, setAllWeeks] = useState(false);
  const [notice, setNotice] = useState('');

  const history = burn.settings ? weeklyHistory(burn.settings, burn.entries, today) : [];
  const weeks = allWeeks ? history : history.slice(0, WEEKS_SHOWN);

  const reset = () => {
    setEditing(null);
    setKcal('');
    setDate(today);
    setErrors({});
  };

  const startEdit = (entry: BurnEntry) => {
    setEditing(entry);
    setKcal(String(entry.kcal));
    setDate(entry.date);
    setErrors({});
    setNotice('');
    formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    inputRef.current?.focus({ preventScroll: true });
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (saving.current) return; // ignore a double tap
    const value = parseKcal(kcal);
    const next = {
      kcal: typeof value === 'string' ? value : undefined,
      date: !isDayKey(date)
        ? 'Choose a valid date.'
        : date > today
          ? 'You can’t log calories in the future.'
          : undefined,
    };
    setErrors(next);
    if (next.kcal || next.date || typeof value === 'string') return;
    saving.current = true;
    if (editing) {
      onSave({ ...editing, kcal: value, date });
      reset();
      setNotice('Entry updated');
      saving.current = false;
    } else {
      onSave({ id: crypto.randomUUID(), date, kcal: value, recordedAt: Date.now() });
      close();
    }
  };

  const remove = async (entry: BurnEntry) => {
    const ok = await confirm({
      title: 'Delete this entry?',
      message: `${formatKcal(entry.kcal)} kcal on ${formatDay(entry.date, today)} will be removed from that week’s total.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    onDelete(entry.id);
    if (editing?.id === entry.id) reset();
    setNotice('Entry deleted');
  };

  return (
    <div className="burn-sheet">
      <form ref={formRef} className="form" onSubmit={submit} noValidate>
        {editing && <p className="editing-note">Editing {formatDay(editing.date, today)}</p>}
        <div className="field">
          <label htmlFor={`${uid}-kcal`}>Calories Burned (kcal)</label>
          <input
            ref={inputRef}
            id={`${uid}-kcal`}
            className="input big-input"
            data-autofocus
            {...numericProps}
            value={kcal}
            aria-invalid={!!errors.kcal}
            aria-describedby={errors.kcal ? `${uid}-kcal-error` : undefined}
            onChange={(e) => {
              setKcal(e.target.value);
              setErrors((x) => ({ ...x, kcal: undefined }));
              setNotice('');
            }}
          />
          {errors.kcal && (
            <p className="field-error" id={`${uid}-kcal-error`} role="alert">
              {errors.kcal}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor={`${uid}-date`}>Date</label>
          <input
            id={`${uid}-date`}
            className="input date-input"
            type="date"
            max={today}
            value={date}
            aria-invalid={!!errors.date}
            onChange={(e) => setDate(e.target.value)}
          />
          {errors.date && (
            <p className="field-error" role="alert">
              {errors.date}
            </p>
          )}
        </div>
        {editing ? (
          <div className="edit-actions">
            <button type="button" className="btn danger-text" onClick={() => void remove(editing)}>
              Delete
            </button>
            <button type="button" className="btn secondary" onClick={reset}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={!kcal.trim()}>
              Save
            </button>
          </div>
        ) : (
          <button type="submit" className="btn primary block" disabled={!kcal.trim()}>
            Save
          </button>
        )}
        <p className="helper" role="status">
          {notice}
        </p>
      </form>

      <h3 className="group-title">History</h3>
      {weeks.map((w) => {
        const reached = w.goal > 0 && w.total >= w.goal;
        const surplus = w.total - w.goal;
        return (
          <section key={w.week} className="burn-week" aria-label={formatWeekRange(w.week, today)}>
            <div className="burn-week-head">
              <span className="burn-week-range">
                {w.week === weekStart(today) ? 'This Week' : formatWeekRange(w.week, today)}
              </span>
              <span className={`burn-week-total${reached ? ' reached' : ''}`}>
                {reached && <Check size={13} />}
                {formatKcal(w.total)} / {formatKcal(w.goal)} kcal
                {surplus > 0 && <span className="burn-week-surplus"> +{formatKcal(surplus)}</span>}
              </span>
            </div>
            {w.entries.length === 0 ? (
              <p className="helper burn-week-empty">No calories logged yet.</p>
            ) : (
              <ul className="weight-history group">
                {w.entries.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={`history-row burn-row${editing?.id === e.id ? ' active' : ''}`}
                      aria-label={`${formatKcal(e.kcal)} kcal on ${formatDay(e.date, today)}. Edit`}
                      onClick={() => startEdit(e)}
                    >
                      <span className="history-date">{formatDay(e.date, today)}</span>
                      <span className="history-value">{formatKcal(e.kcal)} kcal</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {history.length > WEEKS_SHOWN && (
        <button type="button" className="chip show-all" onClick={() => setAllWeeks((v) => !v)}>
          {allWeeks ? 'Show Recent Weeks' : `Show All Weeks (${history.length})`}
        </button>
      )}
    </div>
  );
}

/* ---------- Goal & training days ---------- */

interface SettingsProps {
  burn: BurnData;
  today: DayKey;
  onSave: (goal: number, trainingDays: number[]) => void;
  onClose: () => void;
}

export function BurnSettingsSheet(props: SettingsProps) {
  return (
    <Sheet title="Burn Goal" onClose={props.onClose}>
      <BurnSettingsForm {...props} />
    </Sheet>
  );
}

function BurnSettingsForm({ burn, today, onSave }: SettingsProps) {
  const uid = useId();
  const close = useSheetClose();
  const current = burn.settings ? goalFor(burn.settings, weekStart(today)) : null;
  const [goal, setGoal] = useState(current === null ? '' : String(current));
  const [days, setDays] = useState<number[]>(burn.settings?.trainingDays ?? []);
  const [error, setError] = useState('');

  const toggle = (d: number) =>
    setDays((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort((a, b) => a - b)));

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const value = parseGoal(goal);
    if (typeof value === 'string') {
      setError(value);
      document.getElementById(`${uid}-goal`)?.focus();
      return;
    }
    onSave(value, days);
    close();
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${uid}-goal`}>Weekly Calorie Burn Goal (kcal)</label>
        <input
          id={`${uid}-goal`}
          className="input big-input"
          {...numericProps}
          value={goal}
          aria-invalid={!!error}
          aria-describedby={error ? `${uid}-goal-error` : `${uid}-goal-help`}
          onChange={(e) => {
            setGoal(e.target.value);
            setError('');
          }}
        />
        {error ? (
          <p className="field-error" id={`${uid}-goal-error`} role="alert">
            {error}
          </p>
        ) : (
          <p className="helper" id={`${uid}-goal-help`}>
            {burn.settings
              ? 'Changes apply from this week. Past weeks keep their goal.'
              : 'Sunday – Saturday, Kuwait time.'}
          </p>
        )}
      </div>

      <fieldset className="field">
        <legend>Training Days</legend>
        <div className="day-picker">
          {WEEKDAY_LETTERS.map((letter, d) => (
            <button
              key={d}
              type="button"
              className={days.includes(d) ? 'selected' : ''}
              aria-pressed={days.includes(d)}
              aria-label={WEEKDAY_NAMES[d]}
              onClick={() => toggle(d)}
            >
              {letter}
            </button>
          ))}
        </div>
        <div className="presets">
          {PRESET_DAYS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`chip${days.join() === p.days.join() ? ' selected' : ''}`}
              onClick={() => setDays(p.days)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="helper">
          For planning only. You can log calories on any day, and your weekly goal never changes on its own.
        </p>
      </fieldset>

      <button type="submit" className="btn primary block">
        Save
      </button>
    </form>
  );
}
