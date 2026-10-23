import { useId, useState } from 'react';
import { formatDay, type DayKey } from '../lib/dates';
import type { Entry, Habit } from '../lib/types';
import { Minus, Plus } from './icons';
import { Sheet, useSheetClose } from './Sheet';

interface Props {
  habit: Habit;
  date: DayKey;
  today: DayKey;
  entry: Entry | undefined;
  onSave: (value: number) => void;
  onClose: () => void;
}

export function ProgressSheet(props: Props) {
  return (
    <Sheet title={props.habit.name} onClose={props.onClose}>
      <Progress {...props} />
    </Sheet>
  );
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

function Progress({ habit, date, today, entry, onSave }: Props) {
  const close = useSheetClose();
  const uid = useId();
  // Past days are measured against the goal they were recorded with.
  const target = entry && date < today ? entry.target : habit.target;
  const [count, setCount] = useState(entry?.value ?? 0);
  const [text, setText] = useState(entry ? fmt(entry.value) : '');
  const [error, setError] = useState('');
  const unit = habit.unit;
  const when = date === today ? 'Today' : formatDay(date, today);

  const save = (value: number) => {
    onSave(value);
    close();
  };

  if (habit.type === 'counter') {
    const pct = Math.min(count / target, 1);
    return (
      <div className="progress">
        <p className="progress-when">{when}</p>
        <p className="progress-value" aria-live="polite">
          <span className="big">{count}</span>
          <span className="of"> / {fmt(target)}</span>
          {unit && <span className="unit"> {unit}</span>}
        </p>
        <div className="bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${pct})` }} />
        </div>
        <div className="stepper">
          <button
            type="button"
            className="step-btn"
            aria-label="Decrease"
            disabled={count <= 0}
            onClick={() => setCount((c) => Math.max(0, c - 1))}
          >
            <Minus size={24} />
          </button>
          <button
            type="button"
            className="step-btn"
            aria-label="Increase"
            disabled={count >= 100_000}
            onClick={() => setCount((c) => c + 1)}
          >
            <Plus size={24} />
          </button>
        </div>
        <button type="button" className="btn primary block" onClick={() => save(count)}>
          Save
        </button>
      </div>
    );
  }

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const trimmed = text.trim().replace(',', '.');
    if (trimmed === '') return save(0);
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return setError('Enter a number of 0 or more.');
    if (n > 100_000) return setError('Enter a value of 100,000 or less.');
    save(Math.round(n * 100) / 100);
  };

  return (
    <form className="progress" onSubmit={submit} noValidate>
      <p className="progress-when">{when}</p>
      <div className="field">
        <label htmlFor={`${uid}-value`}>
          Goal: {fmt(target)}
          {unit ? ` ${unit}` : ''}
        </label>
        <div className="value-input">
          <input
            id={`${uid}-value`}
            className="input big-input"
            inputMode="decimal"
            enterKeyHint="done"
            value={text}
            placeholder="0"
            aria-invalid={!!error}
            aria-describedby={error ? `${uid}-error` : undefined}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
          />
          {unit && <span className="value-unit">{unit}</span>}
        </div>
        {error && (
          <p className="field-error" id={`${uid}-error`} role="alert">
            {error}
          </p>
        )}
        <p className="helper">Leave empty to clear this day.</p>
      </div>
      <button type="submit" className="btn primary block">
        Save
      </button>
    </form>
  );
}
