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

/** Today is unfinished, so its figure is a projection for the whole day — never "so far". */
export const projectedText = (deficit: number) =>
  deficit >= 0
    ? `Today’s Projected Deficit: ${kcal(deficit)}`
    : `Today’s Projected Surplus: ${kcal(-deficit)}`;

const plusG = (n: number) => (Math.round(n) > 0 ? `+${signedG(n)}` : signedG(n));

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
        )}, ${balanceText(week.netDeficit)} over ${week.counted} of 7 days${
          week.todayProjected
            ? `, including today’s provisional projection of ${plusG(week.todayProjected.fatGrams)} g`
            : ''
        }. Show details`}
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
        {week.todayProjected && (
          <p className="fat-split">
            {signedG(week.completed.fatGrams)} g completed days · {plusG(week.todayProjected.fatGrams)} g
            today
            <span className="fat-provisional"> (projected, provisional)</span>
          </p>
        )}

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
              : `${todayDay.templateName} · ${projectedText(todayDay.deficit)}`}
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
  /** Opens the one-day Replace Food sheet, optionally at a date/plan item. */
  onReplace: (date?: DayKey, itemId?: string) => void;
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

function Details({ week, ix, today, currentWeight, onEditExtra, onReplace }: DetailsProps) {
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
      <dl className="info-list">
        <div>
          <dt>Completed days ({week.completed.days})</dt>
          <dd>
            {signedG(week.completed.fatGrams)} g · {balanceText(week.completed.deficit)}
          </dd>
        </div>
        <div>
          <dt>Today (projected, provisional)</dt>
          <dd>
            {week.todayProjected
              ? `${plusG(week.todayProjected.fatGrams)} g · ${balanceText(week.todayProjected.deficit)}`
              : 'Not estimated'}
          </dd>
        </div>
        <div>
          <dt>Week total</dt>
          <dd>{signedG(week.fatGrams)} g</dd>
        </div>
      </dl>
      <p className="helper">
        {formatWeekRange(week.start, today)} · Saturday–Friday, Kuwait time. Resets every Saturday. Future
        days are never counted. Today’s figure is a projection for the whole day and becomes final after
        midnight.
      </p>

      <button type="button" className="btn secondary block" onClick={() => onReplace()}>
        Replace Food — Today Only
      </button>

      <h3 className="group-title">Today · {DAY_NAMES[dow(today)]} · Projected (provisional)</h3>
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
            <dt>Scheduled food</dt>
            <dd>
              {kcal(t.plannedKcal)}
              {t.scheduled.some((s) => s.replacement) && (
                <span className="muted"> (scheduled {kcal(t.originalPlannedKcal)})</span>
              )}
            </dd>
          </div>
          {t.scheduled
            .filter((s) => s.replacement)
            .map((s) => (
              <div key={s.item.id}>
                <dt>Replaced today</dt>
                <dd>
                  {s.item.snapshot.name} → {s.replacement!.replacement.snapshot.name} ·{' '}
                  {Math.round(s.replacement!.replacement.grams)} g
                </dd>
              </div>
            ))}
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
            <dt>{t.deficit >= 0 ? 'Today’s Projected Deficit' : 'Today’s Projected Surplus'}</dt>
            <dd className={t.deficit < 0 ? 'surplus-text' : ''}>{kcal(Math.abs(t.deficit))}</dd>
          </div>
          <div>
            <dt>Projected fat equivalent</dt>
            <dd>{plusG(t.fatGrams)} g</dd>
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
          const row = (
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
          // Completed days and today's projection are shown as separate groups.
          if (d.date !== today) return row;
          return [
            week.completed.days > 0 && (
              <div key="completed-total" className="fat-row subtotal" role="row">
                <span role="cell">Completed</span>
                <span role="cell" />
                <span role="cell" />
                <span role="cell" className={week.completed.deficit < 0 ? 'surplus-text' : ''}>
                  {`${week.completed.deficit < 0 ? '−' : ''}${Math.abs(Math.round(week.completed.deficit)).toLocaleString('en-US')}`}
                </span>
                <span role="cell">{signedG(week.completed.fatGrams)} g</span>
              </div>
            ),
            <div key="today-label" className="fat-row group-label" role="row">
              <span role="cell">Today — projected, provisional</span>
            </div>,
            row,
          ];
        })}
      </div>
      <p className="helper">
        kcal. * Today: a projection for the whole day, final after midnight. – No exercise logged in Burn Goal
        (counted as 0).
      </p>

      <h3 className="group-title">Macros This Week</h3>
      <p className="fat-macros">
        <MacroLine m={week.macros} />
        <span className="muted">
          {' '}
          · {week.counted} day{week.counted === 1 ? '' : 's'} counted
        </span>
      </p>

      <h3 className="group-title">Food Replacements This Week</h3>
      {week.days.every(
        (d) => !d.scheduled.some((s) => s.replacement) && d.orphanedReplacements.length === 0,
      ) ? (
        <p className="helper">None. Use “Replace Food” to swap a scheduled food for one day only.</p>
      ) : (
        <ul className="weight-history group">
          {week.days.flatMap((d) => [
            ...d.scheduled
              .filter((s) => s.replacement)
              .map((s) => (
                <li key={s.replacement!.id}>
                  <button
                    type="button"
                    className="history-row"
                    onClick={() => onReplace(d.date, s.item.id)}
                    aria-label={`Edit replacement on ${SHORT[dow(d.date)]}`}
                  >
                    <span className="history-date">
                      {SHORT[dow(d.date)]} · {s.item.snapshot.name} →{' '}
                      {s.replacement!.replacement.snapshot.name}
                    </span>
                    <span className="history-delta">
                      {s.effective.kcal - s.original.kcal >= 0 ? '+' : '−'}
                      {Math.abs(Math.round(s.effective.kcal - s.original.kcal))}
                    </span>
                    <span className="history-value">{kcal(s.effective.kcal)}</span>
                  </button>
                </li>
              )),
            ...d.orphanedReplacements.map((r) => (
              <li key={r.id}>
                <button type="button" className="history-row" onClick={() => onReplace(d.date)}>
                  <span className="history-date">
                    {SHORT[dow(d.date)]} · {r.original.snapshot.name} → {r.replacement.snapshot.name}
                  </span>
                  <span className="history-value surplus-text">Not applied</span>
                </button>
              </li>
            )),
          ])}
        </ul>
      )}

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
