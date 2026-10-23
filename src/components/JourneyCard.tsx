import { memo, useId, useState } from 'react';
import { addDays, formatDate, type DayKey } from '../lib/dates';
import {
  DEFAULT_JOURNEY_NAME,
  endDateError,
  journeyProgress,
  plural,
  type JourneySettings,
} from '../lib/journey';
import { Check, Settings } from './icons';
import { Sheet, useConfirm, useSheetClose } from './Sheet';

/* ---------- Card ---------- */

interface CardProps {
  journey: JourneySettings | null;
  today: DayKey;
  onSetup: () => void;
  onSettings: () => void;
}

/** Automatic countdown: everything is derived from the start date, end date and today. */
export const JourneyCard = memo(function JourneyCard({ journey, today, onSetup, onSettings }: CardProps) {
  if (!journey) {
    return (
      <section className="card journey-card weight-empty" aria-labelledby="journey-title">
        <h2 id="journey-title" className="card-title">
          {DEFAULT_JOURNEY_NAME}
        </h2>
        <p className="card-note">
          Choose an end date once. The countdown then runs automatically, day by day.
        </p>
        <button type="button" className="btn secondary block" onClick={onSetup}>
          Set Up Journey
        </button>
      </section>
    );
  }

  const p = journeyProgress(journey, today);
  const caption = `Day ${p.elapsed} of ${p.total} · ${p.percent}% Complete`;

  return (
    <section className={`card journey-card${p.complete ? ' complete' : ''}`} aria-labelledby="journey-title">
      <div className="card-head">
        <h2 id="journey-title" className="card-title">
          {journey.name}
        </h2>
        <button type="button" className="icon-btn small" aria-label="Journey settings" onClick={onSettings}>
          <Settings size={18} />
        </button>
      </div>

      <div className="journey-body" role="group" aria-label={`${journey.name}: ${caption}`}>
        {p.complete ? (
          <div className="journey-now">
            <span className="journey-done">
              <Check size={22} />
              Journey Complete
            </span>
          </div>
        ) : (
          <div className="journey-now">
            <span className="journey-days" key={p.remaining}>
              {p.remaining}
            </span>
            <span className="journey-label">{p.remaining === 1 ? 'Day Remaining' : 'Days Remaining'}</span>
            <span className="journey-side">
              {p.elapsed} {p.elapsed === 1 ? 'Day' : 'Days'} Elapsed
            </span>
          </div>
        )}

        <div className="journey-bar" aria-hidden="true">
          <span className="journey-fill" style={{ transform: `scaleX(${p.ratio})` }} />
          {p.milestoneDays.slice(0, 3).map((d, i) => (
            <span
              key={i}
              className={`journey-tick${p.elapsed >= d ? ' reached' : ''}`}
              style={{ left: `${(i + 1) * 25}%` }}
            />
          ))}
        </div>
        <p className="journey-caption">{caption}</p>

        <div className="journey-foot">
          {p.complete ? (
            <p className="journey-next">
              <span className="journey-next-label">Journey</span>
              <span>
                {formatDate(journey.start)} – {formatDate(journey.end)}
              </span>
            </p>
          ) : p.reachedToday ? (
            <p className="journey-next reached">
              <span className="journey-next-label">Milestone Reached</span>
              <span>
                <Check size={13} /> {p.reachedToday}
              </span>
            </p>
          ) : (
            p.next && (
              <p className="journey-next">
                <span className="journey-next-label">Next Milestone</span>
                <span>
                  {p.next.label} — {plural(p.next.daysToGo, 'day')} to go
                </span>
              </p>
            )
          )}
          <p className="journey-message">{p.message}</p>
        </div>
      </div>
    </section>
  );
});

/* ---------- Setup ---------- */

interface SetupProps {
  today: DayKey;
  onSave: (name: string, end: DayKey) => void;
  onClose: () => void;
}

export function JourneySetupSheet(props: SetupProps) {
  return (
    <Sheet title="Set Up Journey" onClose={props.onClose}>
      <JourneyForm today={props.today} start={props.today} onSave={props.onSave} />
    </Sheet>
  );
}

/* ---------- Settings ---------- */

interface SettingsProps {
  journey: JourneySettings;
  today: DayKey;
  onSave: (name: string, end: DayKey) => void;
  onStartNew: () => void;
  onClose: () => void;
}

export function JourneySettingsSheet(props: SettingsProps) {
  return (
    <Sheet title="Journey Settings" onClose={props.onClose}>
      <JourneyForm
        today={props.today}
        start={props.journey.start}
        journey={props.journey}
        onSave={props.onSave}
        onStartNew={props.onStartNew}
      />
    </Sheet>
  );
}

interface FormProps {
  today: DayKey;
  start: DayKey;
  journey?: JourneySettings;
  onSave: (name: string, end: DayKey) => void;
  onStartNew?: () => void;
}

function JourneyForm({ today, start, journey, onSave, onStartNew }: FormProps) {
  const uid = useId();
  const close = useSheetClose();
  const confirm = useConfirm();
  const [name, setName] = useState(journey?.name === DEFAULT_JOURNEY_NAME ? '' : (journey?.name ?? ''));
  const [end, setEnd] = useState(journey?.end ?? '');
  const [error, setError] = useState('');

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = endDateError(end, start);
    if (e) {
      setError(e);
      document.getElementById(`${uid}-end`)?.focus();
      return;
    }
    onSave(name.trim() || DEFAULT_JOURNEY_NAME, end);
    close();
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${uid}-name`}>Journey Name</label>
        <input
          id={`${uid}-name`}
          className="input"
          value={name}
          maxLength={40}
          placeholder={DEFAULT_JOURNEY_NAME}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => setName(e.target.value)}
        />
        <p className="helper">Optional.</p>
      </div>

      <div className="field">
        <span className="field-label" id={`${uid}-start`}>
          Start Date
        </span>
        <p className="readonly-value" aria-labelledby={`${uid}-start`}>
          {start === today ? `Today · ${formatDate(start)}` : formatDate(start)}
        </p>
        <p className="helper">
          {journey ? 'Set when the journey began. It can’t be changed.' : 'Set automatically to today.'}
        </p>
      </div>

      <div className="field">
        <label htmlFor={`${uid}-end`}>Target End Date</label>
        <input
          id={`${uid}-end`}
          className="input date-input"
          type="date"
          min={addDays(start, 1)}
          value={end}
          aria-invalid={!!error}
          aria-describedby={error ? `${uid}-end-error` : undefined}
          onChange={(e) => {
            setEnd(e.target.value);
            setError('');
          }}
        />
        {error && (
          <p className="field-error" id={`${uid}-end-error`} role="alert">
            {error}
          </p>
        )}
      </div>

      <button type="submit" className="btn primary block">
        {journey ? 'Save Changes' : 'Start Journey'}
      </button>

      {onStartNew && (
        <button
          type="button"
          className="btn danger-text block"
          onClick={async () => {
            const ok = await confirm({
              title: 'Start a new journey?',
              message:
                'The new journey starts today. Your current journey is replaced when you save the new one.',
              confirmLabel: 'Continue',
              destructive: true,
            });
            if (ok) onStartNew();
          }}
        >
          Start New Journey
        </button>
      )}
    </form>
  );
}
