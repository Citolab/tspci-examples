import { IStore, useStore } from "@citolab/preact-store";
import { useState } from "preact/hooks";
import { Model, ModelState, Setup, canDivide, formatNumber, percentOf, resize, startState, toggle } from "./fraction";
import { ModelView } from "./model";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the instruction, the models side by side (each with its divide control or its answer
// fields), and a live region that tells what changed.

const button = "inline-flex size-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg leading-none text-slate-700 " +
  "hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e69f00]";
const input = "rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-lg tabular-nums text-slate-900 " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e69f00] disabled:bg-slate-50 disabled:text-slate-600";

/** Refuses what is not a digit (or, for a percentage, one decimal separator) before it reaches the field. */
const guard = (percent: boolean, onRefuse: (why: string) => void, t: Texts) => (e: InputEvent) => {
  if (!e.data && e.inputType.startsWith("delete")) return;
  const field = e.target as HTMLInputElement;
  const next = field.value.slice(0, field.selectionStart ?? field.value.length) + (e.data ?? "") + field.value.slice(field.selectionEnd ?? field.value.length);
  const ok = percent ? /^\d{0,3}([.,]\d{0,2})?$/.test(next) : /^\d{0,4}$/.test(next);
  if (e.data !== null && !ok) {
    e.preventDefault();
    onRefuse(percent ? t.numberOnly : t.digitsOnly);
  } else onRefuse("");
};

const Interaction = ({ prompt, setup, store, texts, language, readOnly, showReadout, solution }: {
  prompt: string;
  setup: Setup;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  language: string;
  readOnly: boolean;
  showReadout: boolean;
  solution: boolean;
}) => {
  const { models } = useStore(store);
  const [message, setMessage] = useState("");
  const set = (index: number, model: ModelState) => store.dispatch({ type: "SET_MODEL", payload: { index, model } });
  const latest = (index: number) => store.getState().models[index];
  const nameOf = (m: Model, i: number) => texts.model(m.type, m.label || (setup.models.length > 1 ? String.fromCharCode(65 + i) : ""));

  const card = (m: Model, i: number) => {
    const s = models[i] ?? startState(m);
    const name = nameOf(m, i);
    const shade = m.task === "shade" && !readOnly;
    const divide = canDivide(m) && !readOnly;
    const changeParts = (n: number) => {
      const next = Math.min(m.max, Math.max(m.min, Math.round(n)));
      if (!Number.isFinite(next) || next === latest(i).parts) return;
      const r = resize(latest(i), next);
      set(i, r.state);
      setMessage(texts.divided(name, next, r.kept));
    };
    const percent = formatNumber(percentOf({ n: s.shaded.length, d: s.parts }), language);
    const display = (v: string) => (language === "nl" ? v.replace(".", ",") : v.replace(",", "."));
    return (
      <section key={i} className="flex min-w-0 flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`model-${i}`}
        aria-label={name}>
        <h3 className="m-0 self-start text-sm font-semibold text-slate-600">{name}</h3>
        <ModelView model={m} state={s} texts={texts} name={name} interactive={shade} testid={`svg-${i}`}
          onToggle={(part, on, drag) => {
            const before = latest(i);
            const next = toggle(before, part, on);
            if (next === before) return;
            set(i, next);
            if (!drag) {
              const partName = texts.part(m.type, part, before.parts, m.columns);
              setMessage(`${on ? texts.shaded(partName) : texts.unshaded(partName)} ${texts.count(name, next.parts, next.shaded.length)}`);
            }
          }}
          onPaintEnd={() => setMessage(texts.count(name, latest(i).parts, latest(i).shaded.length))} />

        {divide && (
          <div className="flex items-center gap-2" role="group" aria-label={`${texts.parts}: ${name}`}>
            <button type="button" className={button} aria-label={`${texts.fewer}: ${name}`} disabled={s.parts <= m.min}
              onClick={() => changeParts(s.parts - 1)} data-testid={`fewer-${i}`}>−</button>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>{texts.parts}</span>
              <input type="number" className={`${input} w-16 py-0.5 text-base`} min={m.min} max={m.max} value={s.parts} data-testid={`parts-${i}`}
                aria-label={`${texts.parts}: ${name}`}
                onChange={(e) => {
                  const field = e.target as HTMLInputElement;
                  const n = Number(field.value);
                  if (field.value === "" || !Number.isFinite(n)) field.value = String(latest(i).parts);
                  else changeParts(n);
                  field.value = String(latest(i).parts);
                }} />
            </label>
            <button type="button" className={button} aria-label={`${texts.more}: ${name}`} disabled={s.parts >= m.max}
              onClick={() => changeParts(s.parts + 1)} data-testid={`more-${i}`}>+</button>
          </div>
        )}

        {m.task === "name" && m.entry === "fraction" && (
          <div className="flex flex-col items-center gap-1" role="group" aria-label={texts.fractionOf(name)} data-testid={`entry-${i}`}>
            <input type="text" inputMode="numeric" autoComplete="off" className={`${input} w-20`} value={s.numerator} disabled={readOnly}
              aria-label={`${texts.numerator}: ${name}`} data-testid={`numerator-${i}`}
              onBeforeInput={guard(false, setMessage, texts)}
              onInput={(e) => set(i, { ...latest(i), numerator: (e.target as HTMLInputElement).value.replace(/\D/g, "").slice(0, 4) })} />
            <span className="block h-0.5 w-24 rounded bg-slate-800" aria-hidden="true" />
            <input type="text" inputMode="numeric" autoComplete="off" className={`${input} w-20`} value={s.denominator} disabled={readOnly}
              aria-label={`${texts.denominator}: ${name}`} data-testid={`denominator-${i}`}
              onBeforeInput={guard(false, setMessage, texts)}
              onInput={(e) => set(i, { ...latest(i), denominator: (e.target as HTMLInputElement).value.replace(/\D/g, "").slice(0, 4) })} />
          </div>
        )}
        {m.task === "name" && m.entry === "percent" && (
          <label className="flex items-center gap-1.5 text-lg text-slate-800" data-testid={`entry-${i}`}>
            <input type="text" inputMode="decimal" autoComplete="off" className={`${input} w-24`} value={display(s.percent)} disabled={readOnly}
              aria-label={texts.percentOf(name)} data-testid={`percent-${i}`}
              onBeforeInput={guard(true, setMessage, texts)}
              onInput={(e) => {
                const field = e.target as HTMLInputElement;
                const clean = /^\d{0,3}([.,]\d{0,2})?$/.test(field.value) ? field.value : latest(i).percent;
                if (clean !== field.value) field.value = display(clean);
                set(i, { ...latest(i), percent: clean });
              }} />
            <span aria-hidden="true">%</span>
          </label>
        )}

        {(showReadout || solution) && m.task === "shade" && (
          <p className="m-0 text-sm tabular-nums text-slate-600" data-testid={`readout-${i}`}>{texts.readout(s.shaded.length, s.parts, percent)}</p>
        )}
        {shade && (
          <button type="button" className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-[#e69f00]"
            onClick={() => {
              set(i, startState(m));
              setMessage(texts.cleared(name));
            }} data-testid={`clear-${i}`} aria-label={`${texts.clear}: ${name}`}>{texts.clear}</button>
        )}
      </section>
    );
  };

  const interactive = !readOnly && setup.models.some((m) => m.task === "shade");
  return (
    <div className="inline-flex max-w-full flex-col gap-3 font-sans text-slate-800" lang={language}>
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] text-slate-700" data-testid="prompt">{prompt}</p>}
      {interactive && <p className="m-0 max-w-[70ch] text-xs text-slate-500" data-testid="help">{texts.help}</p>}
      {solution && <p className="m-0 text-xs font-medium text-emerald-700" data-testid="solution">✓ {texts.solution}</p>}
      <div className="flex flex-wrap items-start gap-4" role="group" aria-label={prompt ? `${texts.models}: ${prompt}` : texts.models}>
        {setup.models.map(card)}
      </div>
      <p className="m-0 min-h-5 text-sm text-slate-600" role="status" aria-live="polite" data-testid="status">{message}</p>
    </div>
  );
};

export default Interaction;
