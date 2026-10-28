import { memo, useState } from 'react';
import { formatDate, formatWeekRange, type DayKey } from '../lib/dates';
import {
  DAY_NAMES,
  PROFILE,
  ageOn,
  pastWeeks,
  type DayBalance,
  type ExtraFood,
  type Indexed,
  type Macros,
  type WeekBalance,
} from '../lib/fatloss';
import { Plus, Settings } from './icons';
import { Sheet } from './Sheet';

const LETTERS: Record<number, string> = { 6: 'S', 0: 'S', 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F' };
const SHORT: Record<number, string> = {
  6: 'Sat',
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
};
const dow = (d: DayKey) => new Date(`${d}T00:00:00Z`).getUTCDay();

export const kcal = (n: number) => `${Math.round(n).toLocaleString('en-US')} kcal`;
export const grams = (n: number) => `${Math.round(n).toLocaleString('en-US')} g`;
const signedG = (n: number) => {
  const r = Math.round(n);
  return r > 0 ? `${r}` : r < 0 ? `−${Math.abs(r)}` : '0';
};

/** "1,234 kcal deficit" / "321 kcal surplus" */
export const balanceText = (deficit: number) =>
  deficit >= 0 ? `${kcal(deficit)} deficit` : `${kcal(-deficit)} surplus`;

/* ---------- Card ---------- */

interface CardProps {
  hasPlan: boolean;
  week: WeekBalance;
  today: DayKey;
  onSetup: () => void;
  onExtra: () => void;
  onDetails: () => void;
}

export const FatLossCard = memo(function FatLossCard({
  hasPlan,
  week,
  today,
  onSetup,
  onExtra,
  onDetails,
}: CardProps) {
  if (!hasPlan) {
    return (
      <section className="card fat-card weight-empty" aria-labelledby="fat-title">
        <h2 id="fat-title" className="card-title">
          Weekly Fat Loss
        </h2>
        <p className="card-note">
          Set up your weekly meals once. Your weight, Burn Goal workouts and any extra food then turn into an
          estimated fat-loss equivalent for each Saturday–Friday week.
        </p>
        <button type="button" className="btn secondary block" onClick={onSetup}>
          Set Up Nutrition Plan
        </button>
      </section>
    );
  }

  const surplus = week.fatGrams < 0;
  const todayDay = week.days.find((d) => d.date === today);
  const missingWeight = week.days.some((d) => d.reason === 'no-weight');
  const scaleMax = Math.max(60, ...week.days.map((d) => Math.abs(d.fatGrams)));

  return (
    <section className={`card fat-card${surplus ? ' surplus' : ''}`} aria-labelledby="fat-title">
      <div className="card-head">
        <h2 id="fat-title" className="card-title">
          Weekly Fat Loss
        </h2>
        <div className="card-actions">
          <button type="button" className="chip log-chip" onClick={onExtra}>
            <Plus size={14} />
            Extra Food
          </button>
          <button
            type="button"
            className="icon-btn small"
            aria-label="Nutrition plan settings"
            onClick={onSetup}
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      <button
        type="button"
        className="fat-body"
        onClick={onDetails}
        aria-label={`${surplus ? 'Theoretical surplus equivalent' : 'Weekly estimated fat loss'}: ${grams(
          Math.abs(week.fatGrams),
        )}, ${balanceText(week.netDeficit)} over ${week.counted} of 7 days. Show details`}
      >
        <p className="fat-eyebrow">
          {surplus ? 'Theoretical Surplus Equivalent' : 'Weekly Estimated Fat Loss'}
        </p>
        <div className="fat-now">
          <span className="fat-value" key={Math.round(week.fatGrams)}>
            {surplus ? '+' : ''}
            {Math.round(Math.abs(week.fatGrams)).toLocaleString('en-US')}
          </span>
          <span className="fat-unit"> g</span>
          <span className="fat-side">{week.elapsed} of 7 days</span>
        </div>
        <p className="fat-sub">Estimated · {balanceText(week.netDeficit)} this week</p>

        <div className="fat-days" aria-hidden="true">
          {week.days.map((d) => (
            <DayBar key={d.date} day={d} max={scaleMax} />
          ))}
        </div>

        {todayDay && (
          <p className="fat-today">
            <span className="fat-today-label">Today</span>
            {todayDay.status === 'unavailable'
              ? todayDay.reason === 'no-weight'
                ? 'Log a weight in the Weight card to estimate.'
                : 'No plan for today.'
              : `${todayDay.templateName} · ${balanceText(todayDay.deficit)} so far`}
          </p>
        )}
        {missingWeight && todayDay?.reason !== 'no-weight' && (
          <p className="fat-note">Some days have no weight yet — log one in the Weight card.</p>
        )}
      </button>
      <p className="fat-disclaimer">
        Theoretical estimate from energy balance — not a measurement of body fat.
      </p>
    </section>
  );
});

function DayBar({ day, max }: { day: DayBalance; max: number }) {
  const counted = day.status === 'complete' || day.status === 'today';
  const g = day.fatGrams;
  const h = counted ? Math.min(Math.abs(g) / max, 1) : 0;
  return (
    <div className={`fat-day ${day.status}${g < 0 ? ' neg' : ''}`}>
      <div className="fat-bar-area">
        <span className="fat-bar up" style={{ transform: `scaleY(${g > 0 ? h : 0})` }} />
        <span className="fat-baseline" />
        <span className="fat-bar down" style={{ transform: `scaleY(${g < 0 ? h : 0})` }} />
      </div>
      <span className="fat-day-letter">{LETTERS[dow(day.date)]}</span>
      <span className="fat-day-value">{counted ? signedG(g) : day.status === 'future' ? '' : '—'}</span>
    </div>
  );
}

/* ---------- Details sheet ---------- */

interface DetailsProps {
  week: WeekBalance;
  ix: Indexed;
  today: DayKey;
  currentWeight: number | null;
  onEditExtra: (extra: ExtraFood) => void;
  onClose: () => void;
}

export function FatLossDetailsSheet(props: DetailsProps) {
  return (
    <Sheet title="Weekly Fat Loss" onClose={props.onClose}>
      <Details {...props} />
    </Sheet>
  );
}

function MacroLine({ m }: { m: Macros }) {
  return (
    <span>
      P {grams(m.protein)} · C {grams(m.carbs)} · F {grams(m.fat)}
      {m.unknown > 0 && (
        <span className="muted">
          {' '}
          + unknown from {m.unknown} extra food{m.unknown === 1 ? '' : 's'}
        </span>
      )}
    </span>
  );
}

function Details({ week, ix, today, currentWeight, onEditExtra }: DetailsProps) {
  const [allWeeks, setAllWeeks] = useState(false);
  const t = week.days.find((d) => d.date === today)!;
  const profile = ix.plan?.profile ?? PROFILE;
  const past = pastWeeks(ix, today);
  const shownWeeks = allWeeks ? past : past.slice(0, 6);
  const extras = week.days.flatMap((d) => d.extras);
  const surplus = week.fatGrams < 0;

  return (
    <div className="fat-sheet">
      <div className="stats">
        <div className="stat">
          <span className={`stat-value${surplus ? ' surplus-text' : ''}`}>
            {surplus ? '+' : ''}
            {grams(Math.abs(week.fatGrams))}
          </span>
          <span className="stat-label">{surplus ? 'Surplus equiv.' : 'Est. fat loss'}</span>
        </div>
        <div className="stat">
          <span className="stat-value small">{Math.round(week.netDeficit).toLocaleString('en-US')}</span>
          <span className="stat-label">Net kcal {week.netDeficit >= 0 ? 'deficit' : 'balance'}</span>
        </div>
        <div className="stat">
          <span className="stat-value">{week.elapsed}/7</span>
          <span className="stat-label">Days elapsed</span>
        </div>
      </div>
      <p className="helper">
        {formatWeekRange(week.start, today)} · Saturday–Friday, Kuwait time. Resets every Saturday. Only days
        up to today count; today is provisional until midnight.
      </p>

      <h3 className="group-title">Today · {DAY_NAMES[dow(today)]} (provisional)</h3>
      {t.status === 'unavailable' ? (
        <p className="helper">
          {t.reason === 'no-weight'
            ? 'Log a weight in the Weight card to estimate today.'
            : 'No plan applies today.'}
        </p>
      ) : (
        <dl className="info-list">
          <div>
            <dt>Template</dt>
            <dd>{t.templateName}</dd>
          </div>
          <div>
            <dt>Planned food</dt>
            <dd>{kcal(t.plannedKcal)}</dd>
          </div>
          <div>
            <dt>Extra food</dt>
            <dd>{t.extraKcal > 0 ? `+${kcal(t.extraKcal)}` : 'None'}</dd>
          </div>
          <div>
            <dt>Exercise (Burn Goal)</dt>
            <dd>{t.exerciseLogged ? kcal(t.exerciseKcal) : 'None logged yet'}</dd>
          </div>
          <div>
            <dt>Sedentary expenditure</dt>
            <dd>{kcal(t.sedentary)}</dd>
          </div>
          <div>
            <dt>Estimated total expenditure</dt>
            <dd>{kcal(t.tdee)}</dd>
          </div>
          <div>
            <dt>Balance</dt>
            <dd className={t.deficit < 0 ? 'surplus-text' : ''}>{balanceText(t.deficit)}</dd>
          </div>
          <div>
            <dt>Fat equivalent</dt>
            <dd>{signedG(t.fatGrams)} g</dd>
          </div>
          <div>
            <dt>Macros</dt>
            <dd>
              <MacroLine m={t.macros} />
            </dd>
          </div>
        </dl>
      )}

      <h3 className="group-title">This Week by Day</h3>
      <div className="fat-table" role="table" aria-label="This week by day">
        <div className="fat-row head" role="row">
          <span role="columnheader">Day</span>
          <span role="columnheader">Intake</span>
          <span role="columnheader">Exercise</span>
          <span role="columnheader">Balance</span>
          <span role="columnheader">Fat</span>
        </div>
        {week.days.map((d) => {
          const counted = d.status === 'complete' || d.status === 'today';
          return (
            <div key={d.date} className={`fat-row ${d.status}`} role="row">
              <span role="cell">
                {SHORT[dow(d.date)]}
                {d.status === 'today' ? '*' : ''}
              </span>
              <span role="cell">{counted ? Math.round(d.intakeKcal).toLocaleString('en-US') : '—'}</span>
              <span role="cell">
                {counted
                  ? d.exerciseLogged
                    ? Math.round(d.exerciseKcal).toLocaleString('en-US')
                    : '–'
                  : '—'}
              </span>
              <span role="cell" className={counted && d.deficit < 0 ? 'surplus-text' : ''}>
                {counted
                  ? `${d.deficit < 0 ? '−' : ''}${Math.abs(Math.round(d.deficit)).toLocaleString('en-US')}`
                  : '—'}
              </span>
              <span role="cell">
                {counted
                  ? `${signedG(d.fatGrams)} g`
                  : d.status === 'future'
                    ? 'Upcoming'
                    : d.reason === 'no-weight'
                      ? 'No weight'
                      : 'No plan'}
              </span>
            </div>
          );
        })}
      </div>
      <p className="helper">kcal. * Today, provisional. – No exercise logged in Burn Goal (counted as 0).</p>

      <h3 className="group-title">Macros This Week</h3>
      <p className="fat-macros">
        <MacroLine m={week.macros} />
        <span className="muted">
          {' '}
          · {week.counted} day{week.counted === 1 ? '' : 's'} counted
        </span>
      </p>

      <h3 className="group-title">Extra Food This Week</h3>
      {extras.length === 0 ? (
        <p className="helper">None. Use “+ Extra Food” for anything outside your plan.</p>
      ) : (
        <ul className="weight-history group">
          {extras.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="history-row"
                onClick={() => onEditExtra(e)}
                aria-label={`Edit ${e.name}`}
              >
                <span className="history-date">
                  {SHORT[dow(e.date)]} · {e.name}
                </span>
                <span className="history-delta">{e.kcalSource === 'macros' ? '4-4-9' : ''}</span>
                <span className="history-value">{kcal(e.kcal)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <>
          <h3 className="group-title">Previous Weeks</h3>
          <ul className="weight-history group">
            {shownWeeks.map((w) => (
              <li key={w.start} className="history-row static">
                <span className="history-date">{formatWeekRange(w.start, today)}</span>
                <span className="history-delta">{balanceText(w.netDeficit)}</span>
                <span className={`history-value${w.fatGrams < 0 ? ' surplus-text' : ''}`}>
                  {w.fatGrams < 0 ? '+' : ''}
                  {grams(Math.abs(w.fatGrams))}
                </span>
              </li>
            ))}
          </ul>
          {past.length > 6 && (
            <button type="button" className="chip show-all" onClick={() => setAllWeeks((v) => !v)}>
              {allWeeks ? 'Show Recent' : `Show All (${past.length})`}
            </button>
          )}
          <p className="helper">Each week is separate — totals are never combined across weeks.</p>
        </>
      )}

      <h3 className="group-title">How It’s Estimated</h3>
      <dl className="info-list">
        <div>
          <dt>Profile</dt>
          <dd>
            Male · {profile.heightCm} cm · age {ageOn(profile.birthDate, today)}
          </dd>
        </div>
        <div>
          <dt>Born</dt>
          <dd>{formatDate(profile.birthDate)}</dd>
        </div>
        <div>
          <dt>Weight</dt>
          <dd>
            {currentWeight === null ? 'From Weight card' : `${currentWeight.toFixed(1)} kg (Weight card)`}
          </dd>
        </div>
        <div>
          <dt>Resting (BMR)</dt>
          <dd>Mifflin–St Jeor</dd>
        </div>
        <div>
          <dt>Daily life</dt>
          <dd>Sedentary · BMR × {profile.activityFactor}</dd>
        </div>
        <div>
          <dt>Exercise</dt>
          <dd>Burn Goal entries</dd>
        </div>
        <div>
          <dt>Fat equivalent</dt>
          <dd>{profile.kcalPerKgFat.toLocaleString('en-US')} kcal per kg</dd>
        </div>
      </dl>
      <p className="helper">
        Each day uses the weight logged on or before it and the plan that was in effect. This is a theoretical
        energy-balance figure, not a measurement of fat loss, and it can’t detect metabolic adaptation.
      </p>
    </div>
  );
}
