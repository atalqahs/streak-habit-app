import { useId, useMemo, useState } from 'react';
import { formatDay, isDayKey, type DayKey } from '../lib/dates';
import {
  makeReplacement,
  parseOptional,
  scheduledItems,
  templateOn,
  type FoodReplacement,
  type NutritionPlan,
  type ScheduledItem,
} from '../lib/fatloss';
import { foodById, scale, sum, variantOf, type Per100 } from '../lib/foods';
import { FoodPicker } from './NutritionPlanSheet';
import { Sheet, useConfirm } from './Sheet';

interface Props {
  plan: NutritionPlan | null;
  replacements: FoodReplacement[];
  today: DayKey;
  initialDate?: DayKey;
  initialItemId?: string;
  onSave: (r: FoodReplacement) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function ReplaceFoodSheet(props: Props) {
  return (
    <Sheet title="Replace Food" onClose={props.onClose}>
      <ReplaceFood {...props} />
    </Sheet>
  );
}

const r0 = (n: number) => Math.round(n).toLocaleString('en-US');
const label = (name: string, variant: string, grams: number, multi: boolean) =>
  `${name}${multi ? ` (${variant.toLowerCase()})` : ''} · ${r0(grams)} g`;
const isMulti = (foodId: string) => (foodById(foodId)?.variants.length ?? 0) > 1;

function ReplaceFood({ plan, replacements, today, initialDate, initialItemId, onSave, onDelete }: Props) {
  const uid = useId();
  const confirm = useConfirm();
  const [date, setDate] = useState(initialDate ?? today);
  const [selected, setSelected] = useState<string | null>(initialItemId ?? null);
  const [notice, setNotice] = useState('');

  const valid = isDayKey(date);
  const { version, template } = valid ? templateOn(plan, date) : { version: null, template: null };
  const dayRepl = useMemo(() => replacements.filter((r) => r.date === date), [replacements, date]);
  const schedule = template ? scheduledItems(template, dayRepl) : { items: [], orphaned: dayRepl };
  const before = sum(schedule.items.map((i) => i.original));
  const after = sum(schedule.items.map((i) => i.effective));
  const current = schedule.items.find((i) => i.item.id === selected) ?? null;

  return (
    <div className="replace-sheet">
      <div className="field">
        <label htmlFor={`${uid}-date`}>Date</label>
        <input
          id={`${uid}-date`}
          className="input date-input"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setSelected(null);
            setNotice('');
          }}
        />
        <p className="helper">
          Only this date changes. Your weekly plan, other days and future weeks stay the same.
        </p>
      </div>

      {!template ? (
        <p className="helper">{valid ? 'No nutrition plan applies on this date.' : 'Choose a valid date.'}</p>
      ) : (
        <>
          <div className="replace-day-head">
            <span className="replace-template">
              {template.name} · {formatDay(date, today)}
            </span>
            <span className="replace-day-kcal">
              {Math.round(after.kcal) !== Math.round(before.kcal) || dayRepl.length ? (
                <>
                  <s>{r0(before.kcal)}</s> → {r0(after.kcal)} kcal
                </>
              ) : (
                `${r0(before.kcal)} kcal`
              )}
            </span>
          </div>
          <p className="helper">Scheduled foods — tap one to replace it for this date.</p>
          <ul className="replace-list group">
            {schedule.items.map((s) => (
              <li key={s.item.id}>
                <button
                  type="button"
                  className={`replace-row${s.replacement ? ' replaced' : ''}${selected === s.item.id ? ' active' : ''}`}
                  aria-label={`${s.item.snapshot.name}${s.replacement ? `, replaced by ${s.replacement.replacement.snapshot.name}` : ''}. ${s.replacement ? 'Edit replacement' : 'Replace'}`}
                  onClick={() => {
                    setSelected(s.item.id);
                    setNotice('');
                  }}
                >
                  <span className="replace-original">
                    {label(
                      s.item.snapshot.name,
                      s.item.snapshot.variant,
                      s.item.grams,
                      isMulti(s.item.foodId),
                    )}
                  </span>
                  <span className="replace-kcal">{r0(s.original.kcal)} kcal</span>
                  {s.replacement && (
                    <span className="replace-new">
                      <span className="replace-badge">Replaced</span>
                      {label(
                        s.replacement.replacement.snapshot.name,
                        s.replacement.replacement.snapshot.variant,
                        s.replacement.replacement.grams,
                        isMulti(s.replacement.replacement.foodId),
                      )}
                      <span className="replace-kcal">{r0(s.effective.kcal)} kcal</span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {current && version && (
            <Editor
              key={`${date}-${current.item.id}-${current.replacement?.id ?? 'new'}`}
              scheduled={current}
              onCancel={() => setSelected(null)}
              onSave={(foodId, variantId, grams) => {
                onSave(
                  makeReplacement({
                    id: current.replacement?.id,
                    date,
                    planFrom: version.from,
                    templateId: template.id,
                    item: current.item,
                    foodId,
                    variantId,
                    grams,
                  }),
                );
                setSelected(null);
                setNotice(`Replacement saved for ${formatDay(date, today)}.`);
              }}
              onRevert={
                current.replacement
                  ? async () => {
                      const ok = await confirm({
                        title: 'Revert to the scheduled food?',
                        message: `${current.item.snapshot.name} will count again on ${formatDay(date, today)}.`,
                        confirmLabel: 'Revert',
                        destructive: true,
                      });
                      if (!ok) return;
                      onDelete(current.replacement!.id);
                      setSelected(null);
                      setNotice('Replacement reverted.');
                    }
                  : undefined
              }
            />
          )}
        </>
      )}

      {schedule.orphaned.length > 0 && (
        <div className="orphan-box" role="status">
          <p>
            {schedule.orphaned.length === 1 ? 'One replacement' : `${schedule.orphaned.length} replacements`}{' '}
            on this date no longer match the plan for this day, so{' '}
            {schedule.orphaned.length === 1 ? 'it is' : 'they are'} not counted.
          </p>
          {schedule.orphaned.map((r) => (
            <div key={r.id} className="orphan-row">
              <span>
                {r.original.snapshot.name} → {r.replacement.snapshot.name} · {r0(r.replacement.grams)} g
              </span>
              <button type="button" className="chip" onClick={() => onDelete(r.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="helper" role="status">
        {notice}
      </p>
    </div>
  );
}

/* ---------- Replacement editor with before/after comparison ---------- */

interface EditorProps {
  scheduled: ScheduledItem;
  onSave: (foodId: string, variantId: string, grams: number) => void;
  onCancel: () => void;
  onRevert?: () => void;
}

function Editor({ scheduled, onSave, onCancel, onRevert }: EditorProps) {
  const uid = useId();
  const { item, replacement } = scheduled;
  const [foodId, setFoodId] = useState(replacement?.replacement.foodId ?? item.foodId);
  const [variantId, setVariantId] = useState(replacement?.replacement.variantId ?? item.variantId);
  const [gramsText, setGramsText] = useState(String(replacement?.replacement.grams ?? item.grams));

  const g = parseOptional(gramsText, 5000);
  const v = variantOf(foodId, variantId);
  const next: Per100 | null = v && g.value !== null && g.value > 0 ? scale(v, g.value) : null;
  const orig = scheduled.original;
  const sameAsScheduled = foodId === item.foodId && variantId === item.variantId && g.value === item.grams;
  const unchanged =
    !!replacement &&
    foodId === replacement.replacement.foodId &&
    variantId === replacement.replacement.variantId &&
    g.value === replacement.replacement.grams;
  const canSave = !!next && !g.error && !sameAsScheduled && !unchanged;

  const row = (name: string, a: number, b: number | null, unit: string) => (
    <div className="compare-row" role="row">
      <span role="rowheader">{name}</span>
      <span role="cell">
        {r0(a)}
        {unit}
      </span>
      <span role="cell">{b === null ? '—' : `${r0(b)}${unit}`}</span>
      <span role="cell" className={b !== null && Math.round(b - a) !== 0 ? 'compare-diff' : 'muted'}>
        {b === null ? '' : `${b - a >= 0 ? '+' : '−'}${r0(Math.abs(b - a))}${unit}`}
      </span>
    </div>
  );

  return (
    <form
      className="form replace-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(foodId, variantId, g.value!);
      }}
      noValidate
    >
      <p className="editing-note">
        Replace {item.snapshot.name}
        {isMulti(item.foodId) ? ` (${item.snapshot.variant.toLowerCase()})` : ''} · {r0(item.grams)} g
      </p>
      <div className="field">
        <label htmlFor={`${uid}-food`}>Replacement Food</label>
        <FoodPicker
          id={`${uid}-food`}
          foodId={foodId}
          variantId={variantId}
          onChange={(f, vId) => {
            setFoodId(f);
            setVariantId(vId);
          }}
        />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-g`}>Quantity</label>
        <div className="value-input">
          <input
            id={`${uid}-g`}
            className="input"
            inputMode="decimal"
            enterKeyHint="done"
            value={gramsText}
            aria-invalid={!!g.error || !next}
            onChange={(e) => setGramsText(e.target.value)}
          />
          <span className="value-unit">g</span>
        </div>
        {(g.error || (gramsText.trim() !== '' && !next)) && (
          <p className="field-error">{g.error ?? 'Enter grams greater than 0.'}</p>
        )}
      </div>

      <div className="compare" role="table" aria-label="Before and after">
        <div className="compare-row head" role="row">
          <span role="columnheader" />
          <span role="columnheader">Scheduled</span>
          <span role="columnheader">Replacement</span>
          <span role="columnheader">Change</span>
        </div>
        {row('Calories', orig.kcal, next?.kcal ?? null, '')}
        {row('Protein', orig.protein, next?.protein ?? null, ' g')}
        {row('Carbs', orig.carbs, next?.carbs ?? null, ' g')}
        {row('Fat', orig.fat, next?.fat ?? null, ' g')}
      </div>
      {sameAsScheduled && <p className="helper">This is the same as the scheduled food.</p>}
      <p className="helper">
        Values from the built-in library. The scheduled food is not counted while replaced.
      </p>

      <div className={`edit-actions${onRevert ? '' : ' two'}`}>
        {onRevert && (
          <button type="button" className="btn danger-text" onClick={onRevert}>
            Revert
          </button>
        )}
        <button type="button" className="btn secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={!canSave}>
          {replacement ? 'Save' : 'Save Replacement'}
        </button>
      </div>
    </form>
  );
}
