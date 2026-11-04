// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/graphFunctionInteraction,
// © 2014-2017 Parcc, Inc., by Sam Sipasseuth (Open Assessment Technologies)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import {
  Axis, Family, FunctionState, Settings, equationText, fitOf, formatPoint, formatValue, isFit, limits, parseNumber, sameState, snap,
  startPoints,
} from "./functions";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";
import Plot from "./plot";

// The candidate's view: the instruction, the families to choose from, the graph, and next to it the coordinates of the
// points (to type), the equation (when the author shows it), what is wrong with the points, and "start again".

const input = "w-20 rounded-md border border-slate-400 bg-white px-2 py-2 text-[15px] tabular-nums text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/40 disabled:bg-slate-100 disabled:text-slate-600";
const button = "min-h-11 rounded-md border px-3 py-2 text-[14px] font-medium focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/40 disabled:cursor-not-allowed disabled:opacity-50";

/** A small picture of each family on its button. */
const ICONS: Record<Family, string> = {
  linear: "M3 19L25 3",
  absolute: "M3 3L14 17L25 3",
  quadratic: "M4 2C8 22 20 22 24 2",
  exponential: "M2 19C14 19 19 17 25 2",
  logarithmic: "M3 21C4 8 9 5 25 3",
  cosine: "M1 4C6 4 7 18 13 18S20 4 26 4",
  tangent: "M2 20C10 16 6 11 14 11S18 6 26 2",
};

const FamilyIcon = ({ family }: { family: Family }) => (
  <svg viewBox="0 0 27 23" width="27" height="23" aria-hidden="true" className="shrink-0">
    <path d="M1 11.5H26M13.5 1V22" stroke="currentColor" stroke-opacity="0.3" stroke-width="1" />
    <path d={ICONS[family]} fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

/** A coordinate the candidate types: in the store (snapped) on Enter or when the field loses the focus, if it is a number on the axis. */
const CoordinateInput = ({ label, axis, value, language, disabled, onValue }: {
  label: string; axis: Axis; value: number; language: Settings["language"]; disabled: boolean; onValue: (value: number) => void;
}) => {
  // what the candidate is typing, for the value it was typed over; the value shows itself once it changes (a drag, a restore)
  const [edit, setEdit] = useState<{ value: number; text: string } | null>(null);
  const text = edit && edit.value === value ? edit.text : null;
  const shown = text ?? formatValue(value, language);
  const { min, max } = limits(axis);
  const n = parseNumber(shown);
  const valid = n !== null && n >= min - 1e-9 && n <= max + 1e-9;
  const commit = () => {
    if (text === null) return;
    if (valid) {
      setEdit(null);
      const v = snap(n, axis);
      if (v !== value) onValue(v);
    }
  };
  return (
    <label className="flex items-center gap-1.5 text-[15px] italic text-slate-700">
      {label}
      <input type="text" inputMode="decimal" className={input} value={shown} disabled={disabled}
        aria-invalid={valid ? undefined : "true"}
        onInput={(e) => setEdit({ value, text: (e.target as HTMLInputElement).value })}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
        onBlur={commit} />
    </label>
  );
};

const Interaction = ({ s, store, texts, readOnly }: {
  s: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  readOnly: boolean;
}) => {
  const state = useStore(store);
  const [announcement, setAnnouncement] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const dispatch = <K extends keyof Actions>(type: K, payload: Actions[K]) => store.dispatch({ type, payload } as any);
  const pointName = (i: number, family: Family = state.family) => texts.pointName(i + 1, texts.roles[family][i]);
  const f = fitOf(state);
  const problem = typeof f === "string" ? texts.problem[f] : "";

  /** Says what happened, and what is wrong with the points after it. */
  const announce = (message: string, next?: FunctionState) => {
    const after = next ? fitOf(next) : null;
    setAnnouncement(typeof after === "string" ? `${message} ${texts.problem[after]}` : message);
  };

  // the equation in the names of the axes, when they are short ("t", "h")
  const short = (label: string, fallback: string) => (label && label.length <= 3 ? label : fallback);
  const names = { x: short(s.x.label, "x"), y: short(s.y.label, "y") };
  const families = s.families.includes(state.family) ? s.families : [...s.families, state.family];
  const start = startPoints(s, state.family);
  const atStart = sameState(state, { family: state.family, points: start });
  const current = selected !== null && selected < state.points.length ? selected : null;

  const moveTo = (index: number, x: number, y: number) => {
    dispatch("MOVE_POINT", { index, x, y });
    const p = { x, y };
    announce(texts.moved(pointName(index), formatPoint(p, s.language)), { ...state, points: state.points.map((q, i) => (i === index ? p : q)) });
  };

  return (
    <div className="flex max-w-full flex-col gap-3 font-sans text-[15px] text-slate-800">
      <p className="m-0 max-w-[75ch] text-slate-700" data-testid="prompt">
        {s.prompt || (s.startPoints === "empty" ? texts.promptEmpty : texts.prompt)}
      </p>

      {families.length > 1 && (
        <div role="group" aria-label={texts.families} className="flex flex-wrap gap-2">
          {families.map((family) => {
            const on = state.family === family;
            return (
              <button key={family} type="button" aria-pressed={on ? "true" : "false"} disabled={readOnly}
                className={`${button} inline-flex items-center gap-2 ${on ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`}
                onClick={() => {
                  if (on) return;
                  dispatch("SET_FAMILY", { family });
                  announce(texts.chosen(texts.family[family]), { ...state, family });
                }}>
                <FamilyIcon family={family} />
                {texts.family[family]}
              </button>
            );
          })}
        </div>
      )}
      <p className="m-0 text-[14px] text-slate-600" data-testid="hint">
        {families.length === 1 && <strong className="font-semibold text-slate-800">{texts.family[state.family]}: </strong>}
        {texts.hint[state.family]}
      </p>

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[1_1_320px]" style={{ maxWidth: "fit-content" }}>
          <Plot s={s} state={state} texts={texts} readOnly={readOnly} dispatch={dispatch} announce={announce}
            selected={current} setSelected={setSelected} pointName={pointName} />
          <p id="plot-help" className="m-0 mt-1 max-w-[60ch] text-[13px] text-slate-500">
            {readOnly ? "" : s.startPoints === "empty" ? texts.plotHelpEmpty : texts.plotHelp}
          </p>
        </div>

        <div className="flex min-w-[15rem] flex-[0_1_18rem] flex-col gap-3">
          <section aria-label={texts.coordinates} className="flex flex-col gap-2">
            {[0, 1].map((i) => {
              const p = state.points[i];
              return (
                <fieldset key={i} className={`m-0 flex flex-col gap-1.5 rounded-md border p-2 ${current === i ? "border-amber-500" : "border-slate-300"}`}
                  data-testid={`point-${i + 1}`}>
                  <legend className="px-1 text-[14px] font-semibold">{pointName(i)}</legend>
                  {p ? (
                    <div className="flex flex-wrap gap-3">
                      <CoordinateInput label={s.x.label || "x"} axis={s.x} value={p.x} language={s.language} disabled={readOnly}
                        onValue={(x) => moveTo(i, x, p.y)} />
                      <CoordinateInput label={s.y.label || "y"} axis={s.y} value={p.y} language={s.language} disabled={readOnly}
                        onValue={(y) => moveTo(i, p.x, y)} />
                    </div>
                  ) : (
                    <span className="text-[14px] text-slate-500">{texts.notPlaced}</span>
                  )}
                </fieldset>
              );
            })}
          </section>

          {s.showEquation && isFit(f) && (
            <p className="m-0 rounded-md bg-slate-100 px-3 py-2">
              <span className="text-[13px] text-slate-600">{texts.equation}</span><br />
              <span className="font-serif text-[18px] text-slate-900" data-testid="equation">{equationText(f, s.language, names)}</span>
            </p>
          )}
          {problem && <p className="m-0 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-[14px] text-red-800" data-testid="problem">{problem}</p>}

          <button type="button" className={`${button} self-start border-slate-400 bg-white text-slate-800 hover:bg-slate-50`}
            disabled={readOnly || atStart}
            onClick={() => {
              dispatch("RESET", { points: start });
              setSelected(null);
              announce(texts.resetDone);
            }}>
            {texts.reset}
          </button>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
};

export default Interaction;
