import { useId, useRef, useState } from 'react';
import { formatDay, isDayKey, type DayKey } from '../lib/dates';
import { parseOptional, resolveCustom, type ExtraFood } from '../lib/fatloss';
import { FOODS, foodById, scale, variantOf } from '../lib/foods';
import { FoodPicker, macroText } from './NutritionPlanSheet';
import { Sheet, useConfirm, useSheetClose } from './Sheet';

interface Props {
  extras: ExtraFood[];
  today: DayKey;
  /** Open with this entry loaded for editing. */
  initial?: ExtraFood | null;
  onSave: (extra: ExtraFood) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function ExtraFoodSheet(props: Props) {
  return (
    <Sheet title="Extra Food" onClose={props.onClose}>
      <ExtraForm {...props} />
    </Sheet>
  );
}

const text = (n: number | null | undefined) =>
  n === null || n === undefined ? '' : String(Math.round(n * 100) / 100);

function ExtraForm({ extras, today, initial, onSave, onDelete }: Props) {
  const uid = useId();
  const close = useSheetClose();
  const confirm = useConfirm();
  const saving = useRef(false);
  const [editing, setEditing] = useState<ExtraFood | null>(initial ?? null);
  const [date, setDate] = useState(initial?.date ?? today);
  const [mode, setMode] = useState<'library' | 'custom'>(initial?.kind ?? 'library');
  const [foodId, setFoodId] = useState(initial?.foodId ?? FOODS[0].id);
  const [variantId, setVariantId] = useState(initial?.variantId ?? FOODS[0].variants[0].id);
  const [gramsText, setGramsText] = useState(text(initial?.grams));
  const [name, setName] = useState(initial?.kind === 'custom' ? initial.name : '');
  const [kcalText, setKcalText] = useState(
    initial?.kind === 'custom' && initial.kcalSource === 'label' ? text(initial.kcal) : '',
  );
  const [pText, setP] = useState(initial?.kind === 'custom' ? text(initial.protein) : '');
  const [cText, setC] = useState(initial?.kind === 'custom' ? text(initial.carbs) : '');
  const [fText, setF] = useState(initial?.kind === 'custom' ? text(initial.fat) : '');
  const [notice, setNotice] = useState('');

  const load = (e: ExtraFood | null) => {
    setEditing(e);
    setNotice('');
    setDate(e?.date ?? today);
    setMode(e?.kind ?? 'library');
    setFoodId(e?.foodId ?? FOODS[0].id);
    setVariantId(e?.variantId ?? FOODS[0].variants[0].id);
    setGramsText(text(e?.grams));
    setName(e?.kind === 'custom' ? e.name : '');
    setKcalText(e?.kind === 'custom' && e.kcalSource === 'label' ? text(e.kcal) : '');
    setP(e?.kind === 'custom' ? text(e.protein) : '');
    setC(e?.kind === 'custom' ? text(e.carbs) : '');
    setF(e?.kind === 'custom' ? text(e.fat) : '');
  };

  const dateError = !isDayKey(date)
    ? 'Choose a valid date.'
    : date > today
      ? 'You can’t log food in the future.'
      : '';

  // Library method
  const g = parseOptional(gramsText, 5000);
  const variant = variantOf(foodId, variantId);
  const libTotals = variant && g.value !== null && g.value > 0 ? scale(variant, g.value) : null;

  // Custom method
  const kc = parseOptional(kcalText);
  const p = parseOptional(pText, 1000);
  const c = parseOptional(cText, 1000);
  const f = parseOptional(fText, 1000);
  const fieldError = kc.error || p.error || c.error || f.error;
  const custom = resolveCustom(kc.value, p.value, c.value, f.value);

  const canSave =
    !dateError && (mode === 'library' ? !!libTotals && !g.error : !fieldError && custom.kcal !== null);

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!canSave || saving.current) return;
    saving.current = true;
    const base = {
      id: editing?.id ?? crypto.randomUUID(),
      date,
      recordedAt: editing?.recordedAt ?? Date.now(),
    };
    const entry: ExtraFood =
      mode === 'library'
        ? {
            ...base,
            kind: 'library',
            name: `${foodById(foodId)!.name}${foodById(foodId)!.variants.length > 1 ? ` (${variant!.label.toLowerCase()})` : ''} · ${g.value} g`,
            foodId,
            variantId,
            grams: g.value!,
            kcal: libTotals!.kcal,
            kcalSource: 'library',
            protein: libTotals!.protein,
            carbs: libTotals!.carbs,
            fat: libTotals!.fat,
          }
        : {
            ...base,
            kind: 'custom',
            name: name.trim() || 'Custom snack',
            kcal: custom.kcal!,
            kcalSource: custom.kcalSource!,
            protein: p.value,
            carbs: c.value,
            fat: f.value,
          };
    onSave(entry);
    if (editing) {
      load(null);
      setNotice('Entry updated');
      saving.current = false;
    } else {
      close();
    }
  };

  const remove = async (e: ExtraFood) => {
    const ok = await confirm({
      title: 'Delete this extra food?',
      message: `${e.name} (${Math.round(e.kcal)} kcal) on ${formatDay(e.date, today)} will be removed from that day.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    onDelete(e.id);
    if (editing?.id === e.id) load(null);
    setNotice('Entry deleted');
  };

  const sameDay = extras.filter((e) => e.date === date).sort((a, b) => b.recordedAt - a.recordedAt);

  return (
    <div className="extra-sheet">
      <form className="form" onSubmit={submit} noValidate>
        {editing && <p className="editing-note">Editing {editing.name}</p>}
        <div className="field">
          <label htmlFor={`${uid}-date`}>Date</label>
          <input
            id={`${uid}-date`}
            className="input date-input"
            type="date"
            max={today}
            value={date}
            aria-invalid={!!dateError}
            onChange={(e) => setDate(e.target.value)}
          />
          {dateError && (
            <p className="field-error" role="alert">
              {dateError}
            </p>
          )}
          <p className="helper">Counts for this date only. Your weekly plan doesn’t change.</p>
        </div>

        <div className="segmented" role="radiogroup" aria-label="Method">
          {(['library', 'custom'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              className={mode === m ? 'selected' : ''}
              onClick={() => setMode(m)}
            >
              {m === 'library' ? 'Food Library' : 'Custom Snack'}
            </button>
          ))}
        </div>

        {mode === 'library' ? (
          <>
            <div className="field">
              <label htmlFor={`${uid}-food`}>Food</label>
              <FoodPicker
                id={`${uid}-food`}
                foodId={foodId}
                variantId={variantId}
                onChange={(fid, vid) => {
                  setFoodId(fid);
                  setVariantId(vid);
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
                  placeholder="0"
                  value={gramsText}
                  aria-invalid={!!g.error}
                  onChange={(e) => setGramsText(e.target.value)}
                />
                <span className="value-unit">g</span>
              </div>
              {g.error && <p className="field-error">{g.error}</p>}
            </div>
            <p className="extra-preview" aria-live="polite">
              {libTotals ? macroText(libTotals) : 'Enter grams to calculate calories and macros.'}
            </p>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor={`${uid}-name`}>Snack Name</label>
              <input
                id={`${uid}-name`}
                className="input"
                maxLength={40}
                placeholder="Optional"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`${uid}-kcal`}>Calories (kcal)</label>
              <input
                id={`${uid}-kcal`}
                className="input"
                inputMode="decimal"
                placeholder="From label, or leave empty"
                value={kcalText}
                aria-invalid={!!kc.error}
                onChange={(e) => setKcalText(e.target.value)}
              />
            </div>
            <div className="macro-fields">
              {(
                [
                  ['Protein', pText, setP, p],
                  ['Carbs', cText, setC, c],
                  ['Fat', fText, setF, f],
                ] as const
              ).map(([label, value, set, parsed]) => (
                <div key={label} className="field">
                  <label htmlFor={`${uid}-${label}`}>{label} (g)</label>
                  <input
                    id={`${uid}-${label}`}
                    className="input"
                    inputMode="decimal"
                    placeholder="—"
                    value={value}
                    aria-invalid={!!parsed.error}
                    onChange={(e) => set(e.target.value)}
                  />
                </div>
              ))}
            </div>
            {fieldError ? (
              <p className="field-error">{fieldError}</p>
            ) : (
              <p className="extra-preview" aria-live="polite">
                {custom.kcalSource === 'macros' &&
                  `Calculated from macros (4-4-9): ${Math.round(custom.kcal!)} kcal`}
                {custom.kcalSource === 'label' && `Using label calories: ${Math.round(custom.kcal!)} kcal`}
                {custom.kcalSource === null && custom.error}
              </p>
            )}
            {custom.mismatch && (
              <p className="helper">
                The 4-4-9 estimate from these macros is {Math.round(custom.macroKcal!)} kcal. Labels can
                differ because of fibre and rounding — the label value is used.
              </p>
            )}
            <p className="helper">Leave a macro empty if you don’t know it; 0 means zero.</p>
          </>
        )}

        {editing ? (
          <div className="edit-actions">
            <button type="button" className="btn danger-text" onClick={() => void remove(editing)}>
              Delete
            </button>
            <button type="button" className="btn secondary" onClick={() => load(null)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={!canSave}>
              Save
            </button>
          </div>
        ) : (
          <button type="submit" className="btn primary block" disabled={!canSave}>
            Add Extra Food
          </button>
        )}
        <p className="helper" role="status">
          {notice}
        </p>
      </form>

      <h3 className="group-title">Extra Food on {formatDay(date, today)}</h3>
      {sameDay.length === 0 ? (
        <p className="helper">None.</p>
      ) : (
        <ul className="weight-history group">
          {sameDay.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className={`history-row burn-row${editing?.id === e.id ? ' active' : ''}`}
                aria-label={`${e.name}, ${Math.round(e.kcal)} kcal. Edit`}
                onClick={() => load(e)}
              >
                <span className="history-date">{e.name}</span>
                <span className="history-value">{Math.round(e.kcal).toLocaleString('en-US')} kcal</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
