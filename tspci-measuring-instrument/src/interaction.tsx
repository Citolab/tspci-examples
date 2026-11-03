import { useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import View from "./view";
import { Model, decimalsOf, formatNumber, formatValue, meterTicks, parseReading, typed, withUnit } from "./instrument";
import { Actions, StateModel } from "./store";
import { Texts, nameOf, quantityOf } from "./texts";

// The candidate's view: the instruction, the instrument and, by task, the answer field (read off), the slider on the
// instrument (set) or the range buttons (choose the range).

/** The question when the item has no prompt of its own, in the candidate's language. */
export const defaultPrompt = (m: Model, t: Texts) =>
  m.mode === "set" ? t.setPrompt(m.kind, withUnit(m, m.value))
    : m.mode === "range" ? t.rangePrompt(quantityOf(m.unit), withUnit(m, m.value))
      : t.readPrompt[m.kind];

/** The accessible name of the drawing: what it is and its scale, never the value. */
export const figureLabel = (m: Model, t: Texts) => {
  if (m.kind === "clock") return t.clockFigure;
  if (m.kind === "stopwatch") return t.stopwatchFigure;
  return t.figure(nameOf(t, m.kind, m.unit), formatValue(m.min, m.language), formatValue(m.max, m.language), m.unit);
};

/** A meter with another range plugged in: its scale goes from 0 to that range. */
export const withRange = (m: Model, range: number | null): Model =>
  range === null || m.kind !== "meter" ? m : { ...m, range, max: range, high: range, ...meterTicks(range) };

const rangeText = (m: Model, r: number) => `${formatNumber(r, decimalsOf(r), m.language)} ${m.unit}`;

const Interaction = ({ prompt, m, store, t, readOnly, uid }: {
  prompt: string;
  m: Model;
  store: IStore<StateModel, Actions>;
  t: Texts;
  readOnly: boolean;
  uid: string;
}) => {
  const state = useStore(store);
  const [announce, setAnnounce] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const helpId = `${uid}-help`;
  const hintId = `${uid}-hint`;
  const question = prompt?.trim() ? prompt : defaultPrompt(m, t);

  const shownModel = m.mode === "range" ? withRange(m, state.range ?? m.ranges[0]) : m;
  const shownValue = m.mode === "read" ? m.value : m.mode === "set" ? state.value ?? m.low : 0;
  const help = [m.mode === "set" ? t.helpSet : m.mode === "range" ? t.helpRange : null, m.zoom ? t.helpZoom : null].filter(Boolean).join(" ");

  const setValue = (v: number) => {
    if (readOnly) return;
    store.dispatch({ type: "SET_VALUE", payload: { value: v } });
    setAnnounce(t.setTo(withUnit(m, v)));
  };
  const choose = (r: number) => {
    if (readOnly) return;
    store.dispatch({ type: "SET_RANGE", payload: { range: r } });
    setAnnounce(t.rangeChosen(rangeText(m, r)));
  };

  const onBeforeInput = (e: InputEvent) => {
    const field = e.target as HTMLInputElement;
    if (!e.inputType?.startsWith("insert") || e.data === null || e.data === undefined) return;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    if (typed(m.kind, field.value.slice(0, start) + e.data + field.value.slice(end), m.language, m.min < 0) === null) e.preventDefault();
  };
  const onInput = (field: HTMLInputElement) => {
    const next = typed(m.kind, field.value, m.language, m.min < 0);
    if (next === null) {
      field.value = state.text; // what beforeinput did not catch (a drop, autocorrect)
      return;
    }
    if (next !== field.value) {
      const caret = field.selectionStart;
      field.value = next;
      field.setSelectionRange(caret, caret);
    }
    setHint(null);
    if (next !== state.text) store.dispatch({ type: "SET_TEXT", payload: { text: next } });
  };
  const onBlur = () => {
    if (!state.text.trim()) return setHint(null);
    const v = parseReading(m.kind, state.text);
    if (v === null) setHint(m.kind === "clock" ? t.notATime : t.notANumber);
    else setAnnounce(t.answered(m.kind === "clock" ? state.text : `${state.text}${m.unit ? ` ${m.unit}` : ""}`));
  };

  const onRangeKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (i + d + m.ranges.length) % m.ranges.length;
    choose(m.ranges[next]);
    const group = (e.currentTarget as HTMLElement).parentElement;
    (group?.querySelectorAll("[role=radio]")[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className="inline-flex max-w-full flex-col gap-3 font-sans text-slate-800">
      {question && <p className="m-0 max-w-[70ch] text-[15px] text-slate-700" data-testid="prompt">{question}</p>}
      <div className="flex max-w-full flex-wrap items-start gap-4">
        <div className="max-w-full rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3 shadow-sm focus-within:ring-2 focus-within:ring-sky-600">
          <View m={shownModel} value={shownValue} editable={m.mode === "set"} readOnly={readOnly}
            plugged={m.kind === "meter" ? (m.mode === "range" ? state.range : m.range) : null}
            label={figureLabel(shownModel, t)} sliderLabel={nameOf(t, m.kind, m.unit)}
            valueText={m.mode === "set" ? (state.value === null ? t.notSet : withUnit(m, state.value)) : undefined}
            describedBy={help ? helpId : undefined} onChange={setValue} magnifierLabel={t.magnifier} />
        </div>
        <div className="flex min-w-[220px] max-w-[320px] flex-col gap-3">
          {m.mode === "read" && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-600">{m.kind === "clock" ? t.answerTime : t.answer}</span>
              <span className="flex items-center gap-2">
                <input type="text" inputMode={m.kind === "clock" ? "numeric" : "decimal"} autoComplete="off" spellcheck={false}
                  value={state.text} readOnly={readOnly} data-testid="answer"
                  aria-label={m.kind === "clock" ? t.answerTime : `${t.answer}${m.unit ? ` (${m.unit})` : ""}`} aria-invalid={hint ? "true" : undefined}
                  aria-describedby={hint ? hintId : undefined} placeholder={m.kind === "clock" ? "h:mm" : undefined}
                  className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-lg tabular-nums shadow-inner focus-visible:outline-2 focus-visible:outline-sky-600 read-only:bg-slate-100"
                  onBeforeInput={(e) => onBeforeInput(e as unknown as InputEvent)} onInput={(e) => onInput(e.target as HTMLInputElement)}
                  onBlur={onBlur} />
                {m.kind !== "clock" && m.unit && <span className="text-lg text-slate-700" data-testid="unit">{m.unit}</span>}
              </span>
              {hint && <span id={hintId} className="text-sm text-amber-800" data-testid="hint">⚠ {hint}</span>}
            </label>
          )}
          {m.mode === "range" && (
            <div role="radiogroup" aria-label={t.rangeGroup} className="flex flex-wrap gap-2" data-testid="ranges">
              {m.ranges.map((r, i) => {
                const checked = state.range === r;
                const tabbable = checked || (state.range === null && i === 0);
                return (
                  <button key={r} type="button" role="radio" aria-checked={checked ? "true" : "false"} tabIndex={tabbable ? 0 : -1}
                    aria-disabled={readOnly ? "true" : undefined} onClick={() => choose(r)} onKeyDown={(e) => onRangeKey(e as unknown as KeyboardEvent, i)}
                    className={`rounded-lg border-2 px-3 py-2 text-base tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${checked ? "border-slate-900 bg-slate-900 font-bold text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`}>
                    {checked ? "● " : "○ "}{rangeText(m, r)}
                  </button>
                );
              })}
            </div>
          )}
          {m.kind === "meter" && m.mode !== "range" && <p className="m-0 text-sm text-slate-600" data-testid="plugged">{t.plugged(rangeText(m, m.range))}</p>}
          {help && <p id={helpId} className="m-0 text-sm text-slate-500">{help}</p>}
        </div>
      </div>
      <div className="sr-only" aria-live="polite" data-testid="announce">{announce}</div>
    </div>
  );
};

export default Interaction;
