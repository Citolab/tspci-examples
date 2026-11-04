// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Lentillespci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { AxisKey, GraphState, Settings, formatPoint, formatValue, parseNumber, validScale } from "./graph";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";
import Illustration, { DataTable } from "./illustration";
import Plot from "./plot";

// The candidate's view: the instruction, the measurements, step 1 the table (optional) and step 2 the graph with its
// axes, scale, title, points and line.

const input = "rounded border border-slate-400 bg-white px-2 py-1 text-[14px] text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/40 disabled:bg-slate-100 disabled:text-slate-600";
const button = "rounded-md border border-slate-400 bg-white px-3 py-1.5 text-[14px] font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/40 disabled:cursor-not-allowed disabled:opacity-50";

/** A number of the scale: what the candidate types, in the store when it gives a scale the graph can be drawn with. */
const ScaleInput = ({ axis, label, value, other, which, language, disabled, onValue, message }: {
  axis: AxisKey; label: string; value: number; other: number; which: "max" | "step"; language: Settings["language"]; disabled: boolean;
  onValue: (value: number) => void; message: string;
}) => {
  // what the candidate typed, for the value it belongs to; a value from outside (restore, review) shows itself
  const [edit, setEdit] = useState<{ value: number; text: string } | null>(null);
  const text = edit && edit.value === value ? edit.text : formatValue(value, language);
  const n = parseNumber(text);
  const fits = (v: number | null) => (which === "max" ? validScale(v, other) : validScale(other, v));
  const valid = fits(n);
  const id = `${axis}-${which}-error`;
  return (
    <div className="flex flex-col gap-0.5">
      <label className="flex flex-col gap-0.5 text-[13px] text-slate-700">
        {label}
        <input type="text" inputMode="decimal" className={`${input} w-24 tabular-nums`} value={text} disabled={disabled}
          aria-invalid={valid ? undefined : "true"} aria-describedby={valid ? undefined : id}
          onInput={(e) => {
            const next = (e.target as HTMLInputElement).value;
            const v = parseNumber(next);
            const take = v !== null && v !== value && fits(v);
            setEdit({ value: take ? v : value, text: next });
            if (take) onValue(v);
          }} />
      </label>
      {!valid && <span id={id} className="max-w-[12rem] text-[12px] text-red-700">{message}</span>}
    </div>
  );
};

const AxisControls = ({ axis, legend, state, s, texts, disabled, setAxis }: {
  axis: AxisKey; legend: string; state: GraphState; s: Settings; texts: Texts; disabled: boolean;
  setAxis: (axis: AxisKey, change: Actions["SET_AXIS"]) => void;
}) => {
  const a = state[axis];
  const select = (label: string, value: string, options: string[], key: "quantity" | "unit") => (
    <label className="flex flex-col gap-0.5 text-[13px] text-slate-700">
      {label}
      <select className={`${input} max-w-[16rem]`} value={value} disabled={disabled}
        onChange={(e) => setAxis(axis, { axis, [key]: (e.target as HTMLSelectElement).value })}>
        <option value="">{texts.choose}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        {value && !options.includes(value) && <option value={value}>{value}</option>}
      </select>
    </label>
  );
  return (
    <fieldset className="m-0 flex flex-col gap-2 rounded-md border border-slate-300 p-3" data-testid={`axis-${axis}`}>
      <legend className="px-1 text-[14px] font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {select(texts.quantity, a.quantity, s.quantityOptions, "quantity")}
        {select(texts.unit, a.unit, s.unitOptions, "unit")}
      </div>
      <div className="flex flex-wrap gap-2">
        <ScaleInput axis={axis} label={texts.max} value={a.max} other={a.step} which="max" language={s.language} disabled={disabled}
          message={texts.scaleInvalid} onValue={(max) => setAxis(axis, { axis, max })} />
        <ScaleInput axis={axis} label={texts.step} value={a.step} other={a.max} which="step" language={s.language} disabled={disabled}
          message={texts.scaleInvalid} onValue={(step) => setAxis(axis, { axis, step })} />
      </div>
    </fieldset>
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
  const setAxis = (_axis: AxisKey, change: Actions["SET_AXIS"]) => dispatch("SET_AXIS", change);
  const pointText = (x: number, y: number) => formatPoint(x, y, s.language);
  const outside = (x: number, y: number) => x < 0 || y < 0 || x > state.x.max || y > state.y.max;
  // a point removed elsewhere (restore, clear) is no longer selected
  const current = selected !== null && selected < state.points.length ? selected : null;

  const removePoint = (index: number) => {
    const p = state.points[index];
    if (!p) return;
    dispatch("REMOVE_POINT", { index });
    setSelected(null);
    setAnnouncement(texts.removed(pointText(p.x, p.y)));
  };

  return (
    <div className="flex max-w-full flex-col gap-4 font-sans text-[15px] text-slate-800">
      {s.prompt && <p className="m-0 max-w-[75ch] text-slate-700" data-testid="prompt">{s.prompt}</p>}

      <section aria-label={texts.measurements} className="flex flex-wrap items-start gap-4">
        {s.dataSource !== "table" && <Illustration s={s} texts={texts} />}
        {s.dataSource !== "illustration" && <DataTable s={s} texts={texts} />}
      </section>

      {s.tableStep && (
        <section className="flex flex-col gap-2" aria-labelledby="step1">
          <h3 id="step1" className="m-0 text-[16px] font-semibold">{texts.step1}</h3>
          <p className="m-0 text-[14px] text-slate-600">{texts.tableHint}</p>
          <table className="self-start border-collapse" data-testid="table">
            <thead>
              <tr>
                {[0, 1].map((c) => (
                  <th key={c} scope="col" className="border border-slate-300 bg-slate-100 p-1">
                    <input type="text" className={`${input} w-48 font-semibold`} aria-label={texts.headerLabel(c + 1)} placeholder={texts.headerPlaceholder}
                      value={state.table.headers[c]} disabled={readOnly}
                      onInput={(e) => dispatch("SET_HEADER", { column: c as 0 | 1, value: (e.target as HTMLInputElement).value })} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.table.rows.map((row, r) => (
                <tr key={r}>
                  {[0, 1].map((c) => (
                    <td key={c} className="border border-slate-300 p-1">
                      <input type="text" inputMode="decimal" className={`${input} w-40 text-right tabular-nums`} aria-label={texts.cellLabel(r + 1, c + 1)}
                        value={row[c]} disabled={readOnly}
                        onInput={(e) => dispatch("SET_CELL", { row: r, column: c as 0 | 1, value: (e.target as HTMLInputElement).value })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="step2">
        <h3 id="step2" className="m-0 text-[16px] font-semibold">{s.tableStep ? texts.step2 : texts.graphHeading}</h3>
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex w-[17rem] max-w-full flex-col gap-3">
            {s.askTitle && (
              <label className="flex flex-col gap-0.5 text-[13px] text-slate-700">
                {texts.title}
                <input type="text" className={input} value={state.title} disabled={readOnly}
                  onInput={(e) => dispatch("SET_TITLE", { value: (e.target as HTMLInputElement).value })} />
              </label>
            )}
            <AxisControls axis="x" legend={texts.horizontalAxis} state={state} s={s} texts={texts} disabled={readOnly} setAxis={setAxis} />
            <AxisControls axis="y" legend={texts.verticalAxis} state={state} s={s} texts={texts} disabled={readOnly} setAxis={setAxis} />
          </div>
          <div className="flex min-w-0 flex-1 basis-[22rem] flex-col gap-2">
            <p id="plot-help" className="m-0 max-w-[640px] text-[13px] text-slate-600">{texts.plotHelp}</p>
            <Plot state={state} language={s.language} texts={texts} readOnly={readOnly} selected={current} setSelected={setSelected}
              announce={setAnnouncement} dispatch={dispatch} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button} disabled={readOnly || (!state.line && state.points.length < 2)}
                onClick={() => {
                  dispatch("SET_LINE", { line: !state.line });
                  setAnnouncement(state.line ? texts.lineOff : texts.lineOn);
                }}>
                {state.line ? texts.removeLine : texts.drawLine}
              </button>
              <button type="button" className={button} disabled={readOnly || current === null} onClick={() => removePoint(current)}>
                {texts.deletePoint}
              </button>
              <button type="button" className={button} disabled={readOnly || state.points.length === 0}
                onClick={() => {
                  dispatch("CLEAR_POINTS", {});
                  setSelected(null);
                  setAnnouncement(texts.cleared);
                }}>
                {texts.clearPoints}
              </button>
            </div>
            <p role="status" aria-live="polite" className="m-0 min-h-[1.25rem] text-[13px] text-slate-700">{announcement}</p>
            <div className="text-[14px]">
              <p className="m-0 font-medium" id="points-heading">{texts.points(state.points.length)}</p>
              {state.points.length === 0 ? <p className="m-0 mt-1 text-slate-600">{texts.noPoints}</p> : (
                <ul className="m-0 mt-1 flex list-none flex-wrap gap-1 p-0" data-testid="point-list" aria-labelledby="points-heading">
                  {state.points.map((p, i) => (
                    <li key={i} className={`flex items-center gap-1 rounded border px-2 py-0.5 ${current === i ? "border-blue-600 bg-blue-50" : "border-slate-300"}`}>
                      <span className="tabular-nums">{pointText(p.x, p.y)}{outside(p.x, p.y) ? ` – ${texts.outside}` : ""}</span>
                      <button type="button" className="rounded px-1 text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50"
                        aria-label={texts.deletePointAt(pointText(p.x, p.y))} disabled={readOnly} onClick={() => removePoint(i)}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Interaction;
