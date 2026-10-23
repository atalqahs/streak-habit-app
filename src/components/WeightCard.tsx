import { memo } from 'react';
import type { WeightData } from '../lib/db';
import { formatKg, round1, summarize } from '../lib/weight';
import { Plus } from './icons';

interface Props {
  weight: WeightData;
  onOpen: () => void;
  onSetup: () => void;
}

/** Weight Tracker card: everything at a glance; tapping opens the weight sheet. */
export const WeightCard = memo(function WeightCard({ weight, onOpen, onSetup }: Props) {
  const { settings, entries } = weight;

  if (!settings) {
    return (
      <section className="card weight-card weight-empty" aria-labelledby="weight-title">
        <h2 id="weight-title" className="card-title">
          Weight
        </h2>
        <p className="card-note">Track your weight toward a goal, with progress and milestones.</p>
        <button type="button" className="btn secondary block" onClick={onSetup}>
          Set Up Weight Tracker
        </button>
      </section>
    );
  }

  const s = summarize(settings, entries);
  const pct = Math.round(s.progress * 100);
  const bar = Math.min(Math.max(s.progress, 0), 1);
  const lostLabel = s.direction === 'lose' ? 'Total Lost' : 'Total Gained';
  const changeText =
    s.changeDirection === null
      ? entries.length === 1
        ? 'First entry'
        : 'No entries yet'
      : s.changeDirection === 'same'
        ? 'No change since last entry'
        : `${s.changeDirection === 'down' ? '↓' : '↑'} ${formatKg(Math.abs(s.change!))} since last entry`;

  return (
    <section className="card weight-card" aria-labelledby="weight-title">
      <div className="card-head">
        <h2 id="weight-title" className="card-title">
          Weight
        </h2>
        <button type="button" className="chip log-chip" onClick={onOpen}>
          <Plus size={14} />
          Log Weight
        </button>
      </div>

      <button
        type="button"
        className="weight-body"
        onClick={onOpen}
        aria-label={`Weight details: ${describe()}`}
      >
        <div className="weight-now">
          <span className="weight-value">
            {s.current === null ? '—' : round1(s.current).toFixed(1)}
            <span className="weight-unit"> kg</span>
          </span>
          <span className={`weight-change ${s.changeDirection ?? 'none'}`}>{changeText}</span>
        </div>

        <div className="weight-bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${bar})` }} />
        </div>
        <div className="weight-range">
          <span>
            Start <strong>{formatKg(settings.start)}</strong>
          </span>
          <span className="weight-pct">{s.current === null ? '' : `${Math.max(pct, 0)}%`}</span>
          <span>
            Goal <strong>{formatKg(settings.goal)}</strong>
          </span>
        </div>

        <dl className="weight-metrics">
          <div>
            <dt>{s.achieved < 0 ? (s.direction === 'lose' ? 'Above Start' : 'Below Start') : lostLabel}</dt>
            <dd>{s.current === null ? '—' : formatKg(Math.abs(s.achieved))}</dd>
          </div>
          <div>
            <dt>Remaining</dt>
            <dd>{s.current === null ? '—' : s.reached ? 'Goal reached' : formatKg(s.remaining)}</dd>
          </div>
          <div>
            <dt>Next Milestone</dt>
            <dd>{s.nextMilestone === null ? '—' : formatKg(s.nextMilestone)}</dd>
            {s.toMilestone !== null && <dd className="metric-sub">{formatKg(s.toMilestone)} to go</dd>}
          </div>
        </dl>
      </button>
    </section>
  );

  function describe() {
    if (s.current === null) return 'no entries yet';
    return `${formatKg(s.current)}, ${changeText}, ${Math.max(pct, 0)}% toward ${formatKg(settings!.goal)}`;
  }
});
