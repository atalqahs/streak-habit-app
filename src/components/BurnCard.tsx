import { memo, useEffect, useRef, useState } from 'react';
import { goalFor, formatKcal, progress, weekTotal } from '../lib/burn';
import { WEEKDAY_LETTERS, WEEKDAY_NAMES, weekDays, weekStart, type DayKey } from '../lib/dates';
import type { BurnData } from '../lib/db';
import { Check, Plus, Settings } from './icons';

interface Props {
  burn: BurnData;
  today: DayKey;
  onLog: () => void;
  onSettings: () => void;
}

/** Weekly calorie-burn meter for the current Sunday–Saturday week (Asia/Kuwait). */
export const BurnCard = memo(function BurnCard({ burn, today, onLog, onSettings }: Props) {
  const { settings, entries } = burn;
  const week = weekStart(today);
  const total = weekTotal(entries, week);
  const goal = settings ? goalFor(settings, week) : 0;
  const p = progress(total, goal);

  // Celebrate once when the goal is crossed during this session (not on load).
  const wasReached = useRef<boolean | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (wasReached.current === false && p.reached) {
      setCelebrate(true);
      const t = window.setTimeout(() => setCelebrate(false), 1200);
      wasReached.current = true;
      return () => window.clearTimeout(t);
    }
    wasReached.current = p.reached;
  }, [p.reached]);

  if (!settings) {
    return (
      <section className="card burn-card weight-empty" aria-labelledby="burn-title">
        <h2 id="burn-title" className="card-title">
          Burn Goal
        </h2>
        <p className="card-note">Set a weekly calorie burn goal, then log the calories from each workout.</p>
        <button type="button" className="btn secondary block" onClick={onSettings}>
          Set Weekly Goal
        </button>
      </section>
    );
  }

  const loggedDays = new Set(
    entries.filter((e) => weekStart(e.date) === week && e.kcal > 0).map((e) => e.date),
  );
  const pct = Math.floor(p.ratio * 100);
  const status = p.reached
    ? p.surplus > 0
      ? `Goal reached · +${formatKcal(p.surplus)} kcal above goal`
      : 'Goal reached'
    : `${formatKcal(p.remaining)} kcal remaining`;

  return (
    <section className={`card burn-card${p.reached ? ' reached' : ''}`} aria-labelledby="burn-title">
      <div className="card-head">
        <h2 id="burn-title" className="card-title">
          Burn Goal
        </h2>
        <div className="card-actions">
          <button type="button" className="chip log-chip" onClick={onLog}>
            <Plus size={14} />
            Log Burn
          </button>
          <button
            type="button"
            className="icon-btn small"
            aria-label="Burn Goal settings"
            onClick={onSettings}
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      <button
        type="button"
        className="burn-body"
        onClick={onLog}
        aria-label={`This week: ${formatKcal(total)} of ${formatKcal(goal)} kcal, ${pct}%. ${status}. Log burn`}
      >
        <div className="burn-now">
          <span className="burn-total" key={total}>
            {formatKcal(total)}
          </span>
          <span className="burn-goal"> / {formatKcal(goal)} kcal</span>
          <span className="burn-pct">{pct}%</span>
        </div>

        <div className={`burn-meter${celebrate ? ' celebrate' : ''}`} aria-hidden="true">
          <div className="burn-bar">
            <span style={{ transform: `scaleX(${Math.min(p.ratio, 1)})` }} />
          </div>
          {p.surplus > 0 && (
            <div className="burn-overflow">
              <span style={{ transform: `scaleX(${Math.min(p.surplus / goal, 1)})` }} />
            </div>
          )}
        </div>

        <p className={`burn-status${p.reached ? ' reached' : ''}`}>
          {p.reached && <Check size={14} />}
          {status}
        </p>

        <div className="burn-days" aria-hidden="true">
          {weekDays(week).map((day, i) => (
            <span
              key={day}
              title={WEEKDAY_NAMES[i]}
              className={`burn-day${settings.trainingDays.includes(i) ? ' training' : ''}${
                day === today ? ' today' : ''
              }${loggedDays.has(day) ? ' logged' : ''}`}
            >
              {WEEKDAY_LETTERS[i]}
            </span>
          ))}
        </div>
      </button>
    </section>
  );
});
