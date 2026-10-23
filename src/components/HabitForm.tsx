import { useId, useRef, useState } from 'react';
import { WEEKDAY_LETTERS, WEEKDAY_NAMES, type DayKey } from '../lib/dates';
import { withSchedule } from '../lib/streak';
import type { Habit, HabitType } from '../lib/types';
import { Sheet, useConfirm, useSheetClose } from './Sheet';

const ICONS = [
  '🏋️',
  '🏃',
  '📚',
  '💊',
  '💧',
  '🥗',
  '🧘',
  '😴',
  '🦷',
  '🪒',
  '🚶',
  '🧠',
  '✍️',
  '🎸',
  '🧹',
  '🌿',
  '☀️',
  '🍎',
  '🚴',
  '🏊',
  '📵',
  '🙏',
  '💰',
  '⭐',
];

const TYPES: { value: HabitType; label: string; hint: string }[] = [
  { value: 'simple', label: 'Check', hint: 'One tap marks the day complete.' },
  { value: 'counter', label: 'Counter', hint: 'Count up to a daily target, like 8 glasses of water.' },
  { value: 'numeric', label: 'Value', hint: 'Enter a measured amount, like 7.5 hours of sleep.' },
];

const PRESETS: { label: string; days: number[] }[] = [
  { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Sun – Thu', days: [0, 1, 2, 3, 4] },
  { label: 'Mon – Fri', days: [1, 2, 3, 4, 5] },
];

/** Keeps only the last typed character, including multi-codepoint emoji. */
function lastGrapheme(text: string): string {
  if (!text) return '';
  if (typeof Intl.Segmenter === 'function') {
    const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)];
    return parts[parts.length - 1].segment;
  }
  return [...text].slice(-1).join('');
}

interface Props {
  habit?: Habit;
  today: DayKey;
  nextOrder: number;
  onSave: (habit: Habit) => void;
  onClose: () => void;
}

export function HabitFormSheet(props: Props) {
  const confirm = useConfirm();
  const dirty = useRef(false);
  return (
    <Sheet
      title={props.habit ? 'Edit Habit' : 'New Habit'}
      onClose={props.onClose}
      onBeforeDismiss={async () =>
        dirty.current &&
        !(await confirm({
          title: 'Discard changes?',
          message: 'Your changes to this habit will not be saved.',
          confirmLabel: 'Discard',
          destructive: true,
        }))
      }
    >
      <HabitForm {...props} onDirty={() => (dirty.current = true)} />
    </Sheet>
  );
}

function HabitForm({ habit, today, nextOrder, onSave, onDirty }: Props & { onDirty: () => void }) {
  const close = useSheetClose();
  const uid = useId();
  const current = habit?.schedule[habit.schedule.length - 1];
  const [name, setName] = useState(habit?.name ?? '');
  const [icon, setIcon] = useState(habit?.icon ?? ICONS[0]);
  const [type, setType] = useState<HabitType>(habit?.type ?? 'simple');
  const [days, setDays] = useState<number[]>(current?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [target, setTarget] = useState(habit && habit.type !== 'simple' ? String(habit.target) : '');
  const [unit, setUnit] = useState(habit?.unit ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customIcon, setCustomIcon] = useState(!!habit && !ICONS.includes(habit.icon));

  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      onDirty();
      set(v);
    };

  const toggleDay = (d: number) =>
    change(setDays)(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Enter a name for this habit.';
    if (days.length === 0) e.days = 'Choose at least one day.';
    if (!icon.trim()) e.icon = 'Choose an icon.';
    if (type !== 'simple') {
      const n = Number(target);
      if (!target.trim() || !Number.isFinite(n) || n <= 0) e.target = 'Enter a target greater than 0.';
      else if (type === 'counter' && !Number.isInteger(n))
        e.target = 'A counter target must be a whole number.';
      else if (n > 100_000) e.target = 'Enter a target of 100,000 or less.';
    }
    return e;
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      const first = Object.keys(e)[0];
      document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }
    const base: Habit = habit ?? {
      id: crypto.randomUUID(),
      name: '',
      icon: '',
      type,
      target: 1,
      unit: '',
      start: today,
      schedule: [{ from: today, days }],
      order: nextOrder,
      createdAt: Date.now(),
    };
    const next: Habit = withSchedule(
      {
        ...base,
        name: name.trim(),
        icon: icon.trim(),
        type,
        target: type === 'simple' ? 1 : Number(target),
        unit: type === 'simple' ? '' : unit.trim(),
      },
      days,
      today,
    );
    onSave(next);
    close();
  };

  const err = (key: string) =>
    errors[key] ? (
      <p className="field-error" id={`${uid}-${key}-error`} role="alert">
        {errors[key]}
      </p>
    ) : null;
  const described = (key: string) => (errors[key] ? `${uid}-${key}-error` : undefined);

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${uid}-name`}>Name</label>
        <input
          id={`${uid}-name`}
          className="input"
          value={name}
          maxLength={40}
          placeholder="e.g. Gym"
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={!!errors.name}
          aria-describedby={described('name')}
          onChange={(e) => change(setName)(e.target.value)}
        />
        {err('name')}
      </div>

      <fieldset className="field">
        <legend>Icon</legend>
        <div className="icon-grid" id={`${uid}-icon`} tabIndex={-1}>
          {ICONS.map((i) => (
            <button
              key={i}
              type="button"
              className={`icon-choice${!customIcon && icon === i ? ' selected' : ''}`}
              aria-pressed={!customIcon && icon === i}
              aria-label={`Icon ${i}`}
              onClick={() => {
                setCustomIcon(false);
                change(setIcon)(i);
              }}
            >
              {i}
            </button>
          ))}
        </div>
        <label className="custom-icon">
          <span>Or type any emoji</span>
          <input
            className="input compact"
            value={customIcon ? icon : ''}
            placeholder="🙂"
            aria-label="Custom emoji"
            onChange={(e) => {
              const v = lastGrapheme(e.target.value.trim());
              setCustomIcon(!!v);
              change(setIcon)(v || ICONS[0]);
            }}
          />
        </label>
        {err('icon')}
      </fieldset>

      <fieldset className="field">
        <legend>Type</legend>
        <div className="segmented" role="radiogroup" aria-label="Habit type">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={type === t.value}
              className={type === t.value ? 'selected' : ''}
              onClick={() => change(setType)(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="helper">{TYPES.find((t) => t.value === type)!.hint}</p>
      </fieldset>

      {type !== 'simple' && (
        <div className="field-row">
          <div className="field">
            <label htmlFor={`${uid}-target`}>Daily target</label>
            <input
              id={`${uid}-target`}
              className="input"
              inputMode={type === 'counter' ? 'numeric' : 'decimal'}
              value={target}
              placeholder={type === 'counter' ? '8' : '7.5'}
              aria-invalid={!!errors.target}
              aria-describedby={described('target')}
              onChange={(e) => change(setTarget)(e.target.value.replace(',', '.'))}
            />
          </div>
          <div className="field">
            <label htmlFor={`${uid}-unit`}>Unit</label>
            <input
              id={`${uid}-unit`}
              className="input"
              value={unit}
              maxLength={16}
              placeholder={type === 'counter' ? 'glasses' : 'hours'}
              autoComplete="off"
              onChange={(e) => change(setUnit)(e.target.value)}
            />
          </div>
          {err('target')}
        </div>
      )}

      <fieldset className="field">
        <legend>Repeat on</legend>
        <div className="day-picker" id={`${uid}-days`} tabIndex={-1} aria-describedby={described('days')}>
          {WEEKDAY_LETTERS.map((letter, d) => (
            <button
              key={d}
              type="button"
              className={days.includes(d) ? 'selected' : ''}
              aria-pressed={days.includes(d)}
              aria-label={WEEKDAY_NAMES[d]}
              onClick={() => toggleDay(d)}
            >
              {letter}
            </button>
          ))}
        </div>
        <div className="presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`chip${days.join() === p.days.join() ? ' selected' : ''}`}
              onClick={() => change(setDays)(p.days)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {err('days')}
        {habit && <p className="helper">Schedule changes apply from today. Past days keep their schedule.</p>}
      </fieldset>

      <button type="submit" className="btn primary block">
        {habit ? 'Save Changes' : 'Add Habit'}
      </button>
    </form>
  );
}
