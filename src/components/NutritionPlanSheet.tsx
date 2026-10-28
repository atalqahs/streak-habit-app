import { useId, useMemo, useRef, useState } from 'react';
import { formatDay, type DayKey } from '../lib/dates';
import {
  DAY_NAMES,
  MAX_TEMPLATES,
  SAT_FIRST,
  ageOn,
  draftFromVersion,
  fatWeekStart,
  isDraftValid,
  parseOptional,
  planOn,
  validateDraft,
  type NutritionPlan,
  type PlanDraft,
  type SaveOptions,
} from '../lib/fatloss';
import { CATEGORIES, FOODS, foodById, scale, sum, variantOf, type Per100 } from '../lib/foods';
import { Close, Plus } from './icons';
import { Sheet, useConfirm, useSheetClose } from './Sheet';

const LETTERS: Record<number, string> = { 6: 'S', 0: 'S', 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F' };

export const macroText = (t: Per100) =>
  `${Math.round(t.kcal).toLocaleString('en-US')} kcal · P ${Math.round(t.protein)} g · C ${Math.round(t.carbs)} g · F ${Math.round(t.fat)} g`;

/* ---------- Shared food picker ---------- */

interface PickerProps {
  id: string;
  foodId: string;
  variantId: string;
  onChange: (foodId: string, variantId: string) => void;
}

/** Native grouped select (fast iOS wheel) plus a preparation selector only when it applies. */
export function FoodPicker({ id, foodId, variantId, onChange }: PickerProps) {
  const food = foodById(foodId);
  return (
    <>
      <select
        id={id}
        className="input select"
        value={foodId}
        onChange={(e) => onChange(e.target.value, foodById(e.target.value)!.variants[0].id)}
      >
        {CATEGORIES.map((c) => (
          <optgroup key={c} label={c}>
            {FOODS.filter((f) => f.category === c).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {food && food.variants.length > 1 && (
        <div className="segmented prep" role="radiogroup" aria-label="Preparation">
          {food.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={variantId === v.id}
              className={variantId === v.id ? 'selected' : ''}
              onClick={() => onChange(foodId, v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- Plan editor ---------- */

interface UiItem {
  id: string;
  foodId: string;
  variantId: string;
  gramsText: string;
}
interface UiTemplate {
  id: string;
  name: string;
  items: UiItem[];
}
interface UiDraft {
  carbCycling: boolean;
  templates: UiTemplate[];
  days: (string | null)[];
}

const newId = () => crypto.randomUUID();
const DEFAULT_NAMES = ['Low Carb', 'High Carb', 'Medium Carb'];

function toDraft(ui: UiDraft): PlanDraft {
  return {
    carbCycling: ui.carbCycling,
    templates: ui.templates.map((t) => ({
      id: t.id,
      name: t.name,
      items: t.items.map((i) => {
        const g = parseOptional(i.gramsText, 5000);
        return { id: i.id, foodId: i.foodId, variantId: i.variantId, grams: g.value ?? Number.NaN };
      }),
    })),
    days: ui.days,
  };
}

function itemTotals(items: UiItem[]): Per100 {
  return sum(
    items.map((i) => {
      const v = variantOf(i.foodId, i.variantId);
      const g = parseOptional(i.gramsText, 5000).value;
      return v && g !== null ? scale(v, g) : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    }),
  );
}

interface Props {
  plan: NutritionPlan | null;
  today: DayKey;
  onSave: (draft: PlanDraft, options?: SaveOptions) => void;
  onClose: () => void;
}

export function NutritionPlanSheet(props: Props) {
  const confirm = useConfirm();
  const dirty = useRef(false);
  return (
    <Sheet
      title="Nutrition Plan"
      onClose={props.onClose}
      onBeforeDismiss={async () =>
        dirty.current &&
        !(await confirm({
          title: 'Discard changes?',
          message: 'Your changes to the nutrition plan will not be saved.',
          confirmLabel: 'Discard',
          destructive: true,
        }))
      }
    >
      <PlanEditor {...props} onDirty={() => (dirty.current = true)} />
    </Sheet>
  );
}

function PlanEditor({ plan, today, onSave, onDirty }: Props & { onDirty: () => void }) {
  const uid = useId();
  const close = useSheetClose();
  const confirm = useConfirm();
  const current = planOn(plan, today) ?? plan?.versions[plan.versions.length - 1] ?? null;

  // First plan only: start today unless the user confirms they followed it since Saturday.
  const [sinceSaturday, setSinceSaturday] = useState(false);
  const [ui, setUi] = useState<UiDraft>(() => {
    if (current) {
      const d = draftFromVersion(current);
      return {
        carbCycling: d.carbCycling,
        templates: d.templates.map((t) => ({
          ...t,
          items: t.items.map((i) => ({ ...i, gramsText: String(i.grams) })),
        })),
        days: d.days,
      };
    }
    return {
      carbCycling: false,
      templates: [{ id: newId(), name: 'Daily Plan', items: [] }],
      days: Array(7).fill(null),
    };
  });

  const update = (fn: (d: UiDraft) => UiDraft) => {
    onDirty();
    setUi(fn);
  };
  const setTemplate = (tid: string, fn: (t: UiTemplate) => UiTemplate) =>
    update((d) => ({ ...d, templates: d.templates.map((t) => (t.id === tid ? fn(t) : t)) }));

  const issues = useMemo(() => validateDraft(toDraft(ui)), [ui]);
  const valid = isDraftValid(issues);

  const toggleCycling = async () => {
    if (!ui.carbCycling) {
      update((d) => {
        const first = d.templates[0];
        const renamed = first.name === 'Daily Plan' ? { ...first, name: DEFAULT_NAMES[0] } : first;
        const copy: UiTemplate = {
          id: newId(),
          name: DEFAULT_NAMES[1],
          items: first.items.map((i) => ({ ...i, id: newId() })),
        };
        return { ...d, carbCycling: true, templates: [renamed, copy] };
      });
      return;
    }
    const keep = ui.templates[0];
    const ok = await confirm({
      title: 'Turn off Carb Cycling?',
      message: `Only “${keep.name}” is kept and it applies to all seven days. Other templates are removed from the plan.`,
      confirmLabel: 'Turn Off',
      destructive: true,
    });
    if (ok) update(() => ({ carbCycling: false, templates: [keep], days: Array(7).fill(keep.id) }));
  };

  const addTemplate = () =>
    update((d) => ({
      ...d,
      templates: [
        ...d.templates,
        {
          id: newId(),
          name:
            DEFAULT_NAMES.find((n) => !d.templates.some((t) => t.name === n)) ??
            `Template ${d.templates.length + 1}`,
          items: d.templates[0].items.map((i) => ({ ...i, id: newId() })),
        },
      ],
    }));

  const removeTemplate = async (t: UiTemplate) => {
    const ok = await confirm({
      title: `Remove “${t.name}”?`,
      message: 'Days that used it become unassigned until you choose another template.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (ok)
      update((d) => ({
        ...d,
        templates: d.templates.filter((x) => x.id !== t.id),
        days: d.days.map((x) => (x === t.id ? null : x)),
      }));
  };

  const setDay = (day: number, tid: string | null) =>
    update((d) => ({ ...d, days: d.days.map((x, i) => (i === day ? tid : x)) }));

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!valid) return;
    onSave(toDraft(ui), { sinceWeekStart: !plan && sinceSaturday });
    close();
  };

  const firstFrom = fatWeekStart(today);
  const canBackdate = !plan && firstFrom < today;
  const single = ui.templates[0];

  return (
    <form className="form plan-form" onSubmit={submit} noValidate>
      <div className="toggle-row">
        <div>
          <p className="toggle-title">Carb Cycling</p>
          <p className="helper">Use two or three templates and choose which days each one applies to.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={ui.carbCycling}
          aria-label="Carb Cycling"
          className={`switch${ui.carbCycling ? ' on' : ''}`}
          onClick={() => void toggleCycling()}
        >
          <span />
        </button>
      </div>

      {ui.templates.map((t, ti) => {
        const totals = itemTotals(t.items);
        return (
          <section key={t.id} className="template-card" aria-label={t.name || `Template ${ti + 1}`}>
            <div className="template-head">
              <input
                className="input template-name"
                value={t.name}
                maxLength={30}
                aria-label="Template name"
                placeholder="Template name"
                onChange={(e) => setTemplate(t.id, (x) => ({ ...x, name: e.target.value }))}
              />
              {ui.carbCycling && ui.templates.length > 2 && (
                <button
                  type="button"
                  className="icon-btn small"
                  aria-label={`Remove ${t.name}`}
                  onClick={() => void removeTemplate(t)}
                >
                  <Close />
                </button>
              )}
            </div>

            {t.items.map((i, ii) => {
              const v = variantOf(i.foodId, i.variantId);
              const g = parseOptional(i.gramsText, 5000);
              const itemKcal = v && g.value !== null ? scale(v, g.value).kcal : null;
              const fid = `${uid}-${t.id}-${i.id}`;
              return (
                <div key={i.id} className="plan-item">
                  <label className="sr-only" htmlFor={fid}>
                    Food {ii + 1}
                  </label>
                  <FoodPicker
                    id={fid}
                    foodId={i.foodId}
                    variantId={i.variantId}
                    onChange={(foodId, variantId) =>
                      setTemplate(t.id, (x) => ({
                        ...x,
                        items: x.items.map((y) => (y.id === i.id ? { ...y, foodId, variantId } : y)),
                      }))
                    }
                  />
                  <div className="plan-item-row">
                    <div className="value-input grams">
                      <input
                        className="input"
                        inputMode="decimal"
                        enterKeyHint="done"
                        aria-label={`Grams of ${foodById(i.foodId)?.name}`}
                        placeholder="0"
                        value={i.gramsText}
                        aria-invalid={!!g.error || (i.gramsText !== '' && !(g.value! > 0))}
                        onChange={(e) =>
                          setTemplate(t.id, (x) => ({
                            ...x,
                            items: x.items.map((y) =>
                              y.id === i.id ? { ...y, gramsText: e.target.value } : y,
                            ),
                          }))
                        }
                      />
                      <span className="value-unit">g</span>
                    </div>
                    <span className="plan-item-kcal">
                      {itemKcal === null ? '—' : `${Math.round(itemKcal).toLocaleString('en-US')} kcal`}
                    </span>
                    <button
                      type="button"
                      className="icon-btn small"
                      aria-label={`Remove ${foodById(i.foodId)?.name}`}
                      onClick={() =>
                        setTemplate(t.id, (x) => ({ ...x, items: x.items.filter((y) => y.id !== i.id) }))
                      }
                    >
                      <Close />
                    </button>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              className="chip add-food"
              onClick={() =>
                setTemplate(t.id, (x) => ({
                  ...x,
                  items: [
                    ...x.items,
                    { id: newId(), foodId: FOODS[0].id, variantId: FOODS[0].variants[0].id, gramsText: '' },
                  ],
                }))
              }
            >
              <Plus size={14} /> Add Food
            </button>
            <p className="template-total" aria-live="polite">
              {macroText(totals)}
            </p>
          </section>
        );
      })}

      {ui.carbCycling && ui.templates.length < MAX_TEMPLATES && (
        <button type="button" className="btn secondary block" onClick={addTemplate}>
          Add Template
        </button>
      )}

      <fieldset className="field">
        <legend>
          {ui.carbCycling
            ? 'Which days of the week should each template apply to?'
            : 'Which days of the week should this dietary template apply to?'}
        </legend>
        {ui.carbCycling ? (
          <div className="assign-list">
            {SAT_FIRST.map((d) => (
              <div key={d} className={`assign-row${ui.days[d] ? '' : ' missing'}`}>
                <span className="assign-day">{DAY_NAMES[d]}</span>
                <div className="segmented assign" role="radiogroup" aria-label={`${DAY_NAMES[d]} template`}>
                  {ui.templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={ui.days[d] === t.id}
                      className={ui.days[d] === t.id ? 'selected' : ''}
                      onClick={() => setDay(d, t.id)}
                    >
                      {t.name || '—'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="day-picker">
              {SAT_FIRST.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={ui.days[d] === single.id ? 'selected' : ''}
                  aria-pressed={ui.days[d] === single.id}
                  aria-label={DAY_NAMES[d]}
                  onClick={() => setDay(d, ui.days[d] === single.id ? null : single.id)}
                >
                  {LETTERS[d]}
                </button>
              ))}
            </div>
            <div className="presets">
              <button
                type="button"
                className={`chip${ui.days.every((x) => x === single.id) ? ' selected' : ''}`}
                onClick={() => update((d) => ({ ...d, days: Array(7).fill(single.id) }))}
              >
                Select All Days
              </button>
            </div>
          </>
        )}
        {issues.missingDays.length > 0 && (
          <p className="field-error" role="status">
            Not assigned: {issues.missingDays.map((d) => DAY_NAMES[d]).join(', ')}. Every day from Saturday to
            Friday needs exactly one template.
          </p>
        )}
      </fieldset>

      {issues.messages.length > 0 && (
        <ul className="issue-list" role="status">
          {issues.messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      {canBackdate && (
        <fieldset className="field">
          <legend>Plan Starts</legend>
          <div className="segmented" role="radiogroup" aria-label="Plan starts">
            <button
              type="button"
              role="radio"
              aria-checked={!sinceSaturday}
              className={!sinceSaturday ? 'selected' : ''}
              onClick={() => setSinceSaturday(false)}
            >
              Today
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={sinceSaturday}
              className={sinceSaturday ? 'selected' : ''}
              onClick={() => setSinceSaturday(true)}
            >
              Since Saturday
            </button>
          </div>
          <p className="helper">
            {sinceSaturday
              ? `Counts from ${formatDay(firstFrom, today)}. Choose this only if you have followed this exact plan every day since then.`
              : `Counts from today, ${formatDay(today, today)}. Earlier days this week are not estimated.`}
          </p>
        </fieldset>
      )}

      <p className="helper">
        {plan
          ? `Changes apply from today (${formatDay(today, today)}). Earlier days keep the plan they used.`
          : `${canBackdate ? 'After that it' : `Starts today, ${formatDay(today, today)}, and`} repeats every Saturday–Friday week until you change it.`}
      </p>

      <button type="submit" className="btn primary block" disabled={!valid}>
        Save Weekly Plan
      </button>

      <dl className="info-list profile-list">
        <div>
          <dt>Profile</dt>
          <dd>Male · 175 cm · age {ageOn('1997-05-30', today)}</dd>
        </div>
        <div>
          <dt>Lifestyle</dt>
          <dd>Sedentary outside exercise (BMR × 1.2)</dd>
        </div>
        <div>
          <dt>Weight & exercise</dt>
          <dd>From Weight and Burn Goal</dd>
        </div>
      </dl>
      <p className="helper">
        Nutrition values come from the built-in library (USDA FoodData Central; whey from its label). Each
        saved plan keeps the values it was built with.
      </p>
    </form>
  );
}
