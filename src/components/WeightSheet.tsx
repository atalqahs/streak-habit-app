import { useId, useState } from 'react';
import { formatDay, isDayKey, type DayKey } from '../lib/dates';
import type { WeightData } from '../lib/db';
import { formatKg, parseKg, round1, type WeightEntry } from '../lib/weight';
import { Sheet, useConfirm, useSheetClose } from './Sheet';

/* ---------- Shared field ---------- */

interface KgFieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

function KgField({ id, label, value, error, placeholder, onChange }: KgFieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="value-input">
        <input
          id={id}
          className="input"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="value-unit">kg</span>
      </div>
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type Errors = Record<string, string | undefined>;

/** Validates start/goal pair; returns parsed values or field errors. */
type Targets = { ok: true; start: number; goal: number } | { ok: false; errors: Errors };

function parseTargets(start: string, goal: string): Targets {
  const s = parseKg(start);
  const g = parseKg(goal);
  const errors: Errors = {};
  if (typeof s === 'string') errors.start = s;
  if (typeof g === 'string') errors.goal = g;
  if (typeof s === 'number' && typeof g === 'number' && round1(s) === round1(g)) {
    errors.goal = 'Your goal must differ from your starting weight.';
  }
  if (errors.start || errors.goal) return { ok: false, errors };
  return { ok: true, start: s as number, goal: g as number };
}

const kgText = (n: number) => String(round1(n));

/* ---------- First-time setup ---------- */

interface SetupProps {
  onSave: (start: number, current: number, goal: number) => void;
  onClose: () => void;
}

export function WeightSetupSheet({ onSave, onClose }: SetupProps) {
  return (
    <Sheet title="Set Up Weight Tracker" onClose={onClose}>
      <Setup onSave={onSave} />
    </Sheet>
  );
}

function Setup({ onSave }: Pick<SetupProps, 'onSave'>) {
  const close = useSheetClose();
  const uid = useId();
  const [start, setStart] = useState('');
  const [current, setCurrent] = useState('');
  const [goal, setGoal] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const targets = parseTargets(start, goal);
    const c = parseKg(current);
    const next: Errors = targets.ok ? {} : { ...targets.errors };
    if (typeof c === 'string') next.current = c;
    setErrors(next);
    const first = ['start', 'current', 'goal'].find((k) => next[k]);
    if (first || !targets.ok || typeof c === 'string') {
      document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }
    onSave(targets.start, c, targets.goal);
    close();
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <KgField
        id={`${uid}-start`}
        label="Starting Weight"
        value={start}
        error={errors.start}
        onChange={setStart}
      />
      <KgField
        id={`${uid}-current`}
        label="Current Weight"
        value={current}
        error={errors.current}
        onChange={setCurrent}
      />
      <KgField id={`${uid}-goal`} label="Goal Weight" value={goal} error={errors.goal} onChange={setGoal} />
      <p className="helper">
        Your current weight is saved as today’s first entry. All weights are in kilograms.
      </p>
      <button type="submit" className="btn primary block">
        Save
      </button>
    </form>
  );
}

/* ---------- Log, history and targets ---------- */

interface SheetProps {
  weight: WeightData;
  today: DayKey;
  onSaveEntry: (entry: WeightEntry) => void;
  onDeleteEntry: (id: string) => void;
  onSaveTargets: (start: number, goal: number) => void;
  onClose: () => void;
}

export function WeightSheet(props: SheetProps) {
  return (
    <Sheet title="Weight" onClose={props.onClose}>
      <WeightLog {...props} />
    </Sheet>
  );
}

const RECENT = 10;

function WeightLog({ weight, today, onSaveEntry, onDeleteEntry, onSaveTargets }: SheetProps) {
  const uid = useId();
  const confirm = useConfirm();
  const [value, setValue] = useState('');
  const [date, setDate] = useState(today);
  const [errors, setErrors] = useState<Errors>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [start, setStart] = useState(weight.settings ? kgText(weight.settings.start) : '');
  const [goal, setGoal] = useState(weight.settings ? kgText(weight.settings.goal) : '');
  const [targetErrors, setTargetErrors] = useState<Errors>({});
  const [saved, setSaved] = useState('');

  const newestFirst = [...weight.entries].reverse();
  const visible = showAll ? newestFirst : newestFirst.slice(0, RECENT);
  // Change from the chronologically previous entry, for the history list.
  const previousOf = new Map(weight.entries.map((e, i) => [e.id, weight.entries[i - 1]]));

  const dateError = (d: string) =>
    !isDayKey(d) ? 'Choose a valid date.' : d > today ? 'You can’t log a weight in the future.' : undefined;

  const add = (ev: React.FormEvent) => {
    ev.preventDefault();
    const kg = parseKg(value);
    const next: Errors = { value: typeof kg === 'string' ? kg : undefined, date: dateError(date) };
    setErrors(next);
    if (next.value || next.date) return;
    onSaveEntry({ id: crypto.randomUUID(), date, value: kg as number, recordedAt: Date.now() });
    setValue('');
    setDate(today);
    setSaved(`Logged ${formatKg(kg as number)}`);
  };

  const saveTargets = (ev: React.FormEvent) => {
    ev.preventDefault();
    const t = parseTargets(start, goal);
    if (!t.ok) return setTargetErrors(t.errors);
    setTargetErrors({});
    onSaveTargets(t.start, t.goal);
    setSaved('Start and goal updated');
  };

  return (
    <div className="weight-sheet">
      <form className="form" onSubmit={add} noValidate>
        <div className="field-row">
          <KgField
            id={`${uid}-value`}
            label="New Weight"
            value={value}
            placeholder={weight.entries.length ? kgText(weight.entries[weight.entries.length - 1].value) : ''}
            error={errors.value}
            onChange={(v) => {
              setValue(v);
              setSaved('');
            }}
          />
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
        </div>
        <button type="submit" className="btn primary block">
          Log Weight
        </button>
        <p className="helper" role="status">
          {saved}
        </p>
      </form>

      <h3 className="group-title">History</h3>
      {newestFirst.length === 0 ? (
        <p className="helper">No entries yet.</p>
      ) : (
        <ul className="weight-history group">
          {visible.map((entry) =>
            editing === entry.id ? (
              <EditRow
                key={entry.id}
                entry={entry}
                today={today}
                onCancel={() => setEditing(null)}
                onSave={(e) => {
                  onSaveEntry(e);
                  setEditing(null);
                  setSaved('Entry updated');
                }}
                onDelete={async () => {
                  const ok = await confirm({
                    title: 'Delete this entry?',
                    message: `${formatKg(entry.value)} on ${formatDay(entry.date, today)} will be removed.`,
                    confirmLabel: 'Delete',
                    destructive: true,
                  });
                  if (ok) {
                    onDeleteEntry(entry.id);
                    setEditing(null);
                    setSaved('Entry deleted');
                  }
                }}
                dateError={dateError}
              />
            ) : (
              <li key={entry.id}>
                <button
                  type="button"
                  className="history-row"
                  aria-label={`${formatKg(entry.value)} on ${formatDay(entry.date, today)}. Edit`}
                  onClick={() => setEditing(entry.id)}
                >
                  <span className="history-date">{formatDay(entry.date, today)}</span>
                  <HistoryDelta entry={entry} previous={previousOf.get(entry.id)} />
                  <span className="history-value">{formatKg(entry.value)}</span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {newestFirst.length > RECENT && (
        <button type="button" className="chip show-all" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show Recent' : `Show All (${newestFirst.length})`}
        </button>
      )}

      <h3 className="group-title">Start & Goal</h3>
      <form className="form" onSubmit={saveTargets} noValidate>
        <div className="field-row">
          <KgField
            id={`${uid}-start`}
            label="Starting"
            value={start}
            error={targetErrors.start}
            onChange={setStart}
          />
          <KgField
            id={`${uid}-goal`}
            label="Goal"
            value={goal}
            error={targetErrors.goal}
            onChange={setGoal}
          />
        </div>
        <button type="submit" className="btn secondary block">
          Save Start & Goal
        </button>
      </form>
    </div>
  );
}

function HistoryDelta({ entry, previous }: { entry: WeightEntry; previous?: WeightEntry }) {
  if (!previous) return <span className="history-delta none" />;
  const d = round1(entry.value - previous.value);
  if (d === 0) return <span className="history-delta same">±0.0</span>;
  return (
    <span className={`history-delta ${d < 0 ? 'down' : 'up'}`}>
      {d < 0 ? '↓' : '↑'} {Math.abs(d).toFixed(1)}
    </span>
  );
}

interface EditRowProps {
  entry: WeightEntry;
  today: DayKey;
  onSave: (entry: WeightEntry) => void;
  onCancel: () => void;
  onDelete: () => void;
  dateError: (d: string) => string | undefined;
}

function EditRow({ entry, today, onSave, onCancel, onDelete, dateError }: EditRowProps) {
  const uid = useId();
  const [value, setValue] = useState(kgText(entry.value));
  const [date, setDate] = useState(entry.date);
  const [errors, setErrors] = useState<Errors>({});

  const save = (ev: React.FormEvent) => {
    ev.preventDefault();
    const kg = parseKg(value);
    const next: Errors = { value: typeof kg === 'string' ? kg : undefined, date: dateError(date) };
    setErrors(next);
    if (next.value || next.date) return;
    onSave({ ...entry, value: kg as number, date });
  };

  return (
    <li className="history-edit">
      <form className="form" onSubmit={save} noValidate>
        <div className="field-row">
          <KgField id={`${uid}-v`} label="Weight" value={value} error={errors.value} onChange={setValue} />
          <div className="field">
            <label htmlFor={`${uid}-d`}>Date</label>
            <input
              id={`${uid}-d`}
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
        </div>
        <div className="edit-actions">
          <button type="button" className="btn danger-text" onClick={onDelete}>
            Delete
          </button>
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Save
          </button>
        </div>
      </form>
    </li>
  );
}
