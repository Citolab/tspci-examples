// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/NouvelleTerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { Range, Settings, VARIABLES, Variable, choicesOf, decimalsOf, snap } from "./settings";
import { Actions, StateModel, Values } from "./store";
import { Texts } from "./texts";
import { forceOf, formatNumber, roundScientific, scientificParts } from "./physics";

// The candidate's view: the instruction, a star and a planet in SVG, the force, a slider per shown variable, a button
// to record a measurement with the table of measurements, and optionally a question with a checkbox per variable.

const COLUMNS: Record<number, string> = { 2: "md:grid-cols-2", 3: "md:grid-cols-3" };

/** The values the simulation uses: what the candidate set, or the start value (always for a hidden variable). */
export const effective = (s: Settings, state: StateModel): Values =>
  VARIABLES.reduce((acc, v) => {
    const set = state.values[v];
    acc[v] = s.shown.includes(v) && set !== null ? snap(set, s.ranges[v]) : s.start[v];
    return acc;
  }, {} as Values);

/** The force for these values, in N, unrounded. */
export const forceFor = (s: Settings, values: Values) => forceOf(s.starMass, values.mass, values.distance);

/** The force as the candidate reads it, for the response and the table. */
export const shownForce = (s: Settings, values: Values) => roundScientific(forceFor(s, values), s.digits);

const Interaction = ({ prompt, settings: s, store, texts, disabled }: {
  prompt: string;
  settings: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  disabled: boolean;
}) => {
  const state = useStore(store);
  const committed = effective(s, state);
  // while the candidate drags a slider: its value, before it goes in the store
  const [live, setLive] = useState<Partial<Values>>({});
  const [announcement, setAnnouncement] = useState("");
  const values: Values = { ...committed, ...live };
  const force = forceFor(s, values);
  const lang = s.language;

  const decimals = (v: Variable) => Math.max(decimalsOf(s.ranges[v].step), decimalsOf(s.ranges[v].min));
  const valueText = (v: Variable, value: number) => `${formatNumber(value, lang, decimals(v))} ${texts.units[v]}`;
  const spokenValue = (v: Variable, value: number) => `${formatNumber(value, lang, decimals(v))} ${texts.spokenUnits[v]}`;
  const forceSpoken = (f: number) => {
    const p = scientificParts(f, lang, s.digits);
    return texts.spoken(p.mantissa, p.exponent);
  };

  const commit = (variable: Variable, value: number) => {
    setLive({});
    if (disabled) return;
    store.dispatch({ type: "SET", payload: { variable, value } });
    setAnnouncement(texts.announce(forceSpoken(forceFor(s, { ...committed, [variable]: value }))));
  };

  const record = () => {
    if (disabled) return;
    store.dispatch({ type: "RECORD", payload: { measurement: { ...committed, force: shownForce(s, committed) }, max: s.maxRecords } });
    setAnnouncement(texts.recorded(Math.min(state.records.length + 1, s.maxRecords)));
  };

  return (
    <div className="gravitation flex w-full max-w-[760px] flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-slate-700">{prompt}</p>}
      <section aria-label={texts.simulation} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Picture settings={s} values={values} label={texts.picture(valueText("distance", values.distance), valueText("radius", values.radius))} />
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-600">{texts.forceValue}</span>
          <span className="text-2xl font-semibold tabular-nums text-slate-900" data-testid="force">
            <Scientific value={force} settings={s} spoken={forceSpoken(force)} />
          </span>
        </div>

        {s.shown.length > 0 && (
          <div className={`grid gap-4 border-t border-slate-100 p-4 ${COLUMNS[s.shown.length] ?? ""}`}>
            {s.shown.map((v) => (
              <div key={v} className="flex min-w-0 flex-col gap-1.5">
                <div className="text-sm font-semibold text-slate-700" id={`label-${v}`}>{texts.names[v]}</div>
                <Slider testid={v} label={texts.names[v]} range={s.ranges[v]} value={values[v]} texts={texts} disabled={disabled}
                  display={(x) => valueText(v, x)} spoken={(x) => spokenValue(v, x)} snap={(x) => snap(x, s.ranges[v])}
                  onLive={(x) => setLive({ [v]: x })} onCommit={(x) => commit(v, x)} />
              </div>
            ))}
          </div>
        )}

        {s.record && (
          <Records settings={s} records={state.records} texts={texts} disabled={disabled} valueText={valueText} onRecord={record}
            onRemove={(index) => {
              if (disabled) return;
              store.dispatch({ type: "REMOVE", payload: { index } });
              setAnnouncement(texts.removed(index + 1));
            }} />
        )}
      </section>

      {s.question === "influence" && choicesOf(s).length > 0 && (
        <fieldset className="m-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="question">
          <legend className="px-1 text-[15px] font-semibold text-slate-800">{s.questionText || texts.question}</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {choicesOf(s).map((v) => {
              const checked = state.answer.includes(v);
              return (
                <label key={v}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-[15px] ring-1 ${checked ? "bg-indigo-50 ring-indigo-400" : "bg-white ring-slate-300"} ${disabled ? "cursor-default opacity-70" : "hover:bg-slate-50"}`}>
                  <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={checked} disabled={disabled} data-testid={`answer-${v}`}
                    onChange={() => !disabled && store.dispatch({ type: "TOGGLE", payload: { variable: v } })} />
                  {texts.names[v]}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      <div role="status" aria-live="polite" className="sr-only" data-testid="live">{announcement}</div>
    </div>
  );
};

/** "6,67 × 10²⁶ N" with a real superscript; a screen reader hears "6,67 maal 10 tot de macht 26 newton". */
const Scientific = ({ value, settings: s, spoken }: { value: number; settings: Settings; spoken: string }) => {
  const p = scientificParts(value, s.language, s.digits);
  return (
    <span>
      <span className="sr-only">{spoken}</span>
      <span aria-hidden="true" data-testid="force-text">
        {p.mantissa} × 10<sup className="text-[0.6em]">{p.exponent}</sup> N
      </span>
    </span>
  );
};

const Records = ({ settings: s, records, texts, disabled, valueText, onRecord, onRemove }: {
  settings: Settings;
  records: (Values & { force: number })[];
  texts: Texts;
  disabled: boolean;
  valueText: (v: Variable, value: number) => string;
  onRecord: () => void;
  onRemove: (index: number) => void;
}) => (
  <div className="flex flex-col gap-2 border-t border-slate-100 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="m-0 text-sm font-semibold text-slate-700">{texts.measurements}</h3>
      <button type="button" onClick={onRecord} disabled={disabled} data-testid="record"
        className="min-h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2">
        {texts.record}
      </button>
    </div>
    {records.length === 0 ? (
      <p className="m-0 text-sm text-slate-500">{texts.noMeasurements}</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm tabular-nums" data-testid="records">
          <caption className="sr-only">{texts.measurements}</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th scope="col" className="py-1.5 pr-3 font-semibold">{texts.number}</th>
              {s.shown.map((v) => <th key={v} scope="col" className="py-1.5 pr-3 font-semibold">{texts.short[v]} ({texts.units[v]})</th>)}
              <th scope="col" className="py-1.5 pr-3 font-semibold">{texts.force} (N)</th>
              <th scope="col" className="py-1.5"><span className="sr-only">–</span></th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => {
              const p = scientificParts(r.force, s.language, s.digits);
              return (
                <tr key={i} className="border-b border-slate-100">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-slate-500">{i + 1}</th>
                  {s.shown.map((v) => <td key={v} className="py-1.5 pr-3">{valueText(v, r[v]).replace(` ${texts.units[v]}`, "")}</td>)}
                  <td className="py-1.5 pr-3">{p.mantissa} × 10<sup>{p.exponent}</sup></td>
                  <td className="py-1.5 text-right">
                    {!disabled && (
                      <button type="button" aria-label={texts.remove(i + 1)} onClick={() => onRemove(i)} data-testid={`remove-${i + 1}`}
                        className="h-8 w-8 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {records.length >= s.maxRecords && <p className="m-0 mt-1 text-xs text-slate-500">{texts.full(s.maxRecords)}</p>}
      </div>
    )}
  </div>
);

/**
 * A native range input: arrow keys move one step, Page Up/Down ten percent, Home/End to the ends; the − and + buttons
 * one step. While dragging only the picture follows (onLive); letting go or a key puts the value in (onCommit).
 */
const Slider = ({ testid, label, range, value, texts, disabled, display, spoken, snap, onLive, onCommit }: {
  testid: string;
  label: string;
  range: Range;
  value: number;
  texts: Texts;
  disabled: boolean;
  display: (v: number) => string;
  spoken: (v: number) => string;
  snap: (v: number) => number;
  onLive: (v: number) => void;
  onCommit: (v: number) => void;
}) => {
  const read = (e: Event) => snap(Number((e.currentTarget as HTMLInputElement).value));
  const percent = ((value - range.min) / (range.max - range.min)) * 100;
  const button =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg leading-none text-slate-700 shadow-sm " +
    "hover:bg-slate-50 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <button type="button" className={button} aria-label={texts.decrease(label)} data-testid={`${testid}-minus`}
          disabled={disabled || value <= range.min} onClick={() => onCommit(snap(value - range.step))}>−</button>
        <input type="range" data-testid={testid} aria-label={label} aria-valuetext={spoken(value)} disabled={disabled}
          className="range min-w-0 flex-1" style={{ "--fill": `${percent}%` }}
          min={range.min} max={range.max} step={range.step} value={value}
          onInput={(e) => onLive(read(e))} onChange={(e) => onCommit(read(e))} />
        <button type="button" className={button} aria-label={texts.increase(label)} data-testid={`${testid}-plus`}
          disabled={disabled || value >= range.max} onClick={() => onCommit(snap(value + range.step))}>+</button>
      </div>
      <div aria-hidden="true" className="text-center text-[15px] font-medium tabular-nums text-slate-900" data-testid={`${testid}-value`}>{display(value)}</div>
    </div>
  );
};

/** Background stars at fixed places (no randomness: the picture is the same every time). */
const SKY = Array.from({ length: 40 }, (_, i) => ({
  x: (i * 137.5 + 31) % 760,
  y: (i * 71.3 + 17) % 230,
  r: 0.6 + ((i * 7) % 5) * 0.25,
  o: 0.35 + ((i * 13) % 7) * 0.08,
}));

/** The star on the left, the planet at its distance and with its radius; a dashed line for the distance. */
const Picture = ({ settings: s, values, label }: { settings: Settings; values: Values; label: string }) => {
  const W = 760, H = 230, CY = 115, STAR_X = 30, STAR_R = 72, X0 = 150, X1 = 700;
  const d = s.ranges.distance;
  const frac = (values.distance - d.min) / (d.max - d.min || 1);
  const x = X0 + Math.min(1, Math.max(0, frac)) * (X1 - X0);
  const r = Math.max(4, 40 * (values.radius / s.ranges.radius.max));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} data-testid="picture" className="block h-auto w-full"
      data-planet-x={x.toFixed(1)} data-planet-r={r.toFixed(1)}>
      <defs>
        <linearGradient id="grav-space" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0b1026" />
          <stop offset="1" stop-color="#1e1b4b" />
        </linearGradient>
        <radialGradient id="grav-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#fde68a" stop-opacity="0.55" />
          <stop offset="0.6" stop-color="#f59e0b" stop-opacity="0.15" />
          <stop offset="1" stop-color="#f59e0b" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="grav-star" cx="0.6" cy="0.45" r="0.6">
          <stop offset="0" stop-color="#fffbeb" />
          <stop offset="0.35" stop-color="#fde047" />
          <stop offset="0.8" stop-color="#f97316" />
          <stop offset="1" stop-color="#c2410c" />
        </radialGradient>
        <radialGradient id="grav-planet" cx="0.32" cy="0.35" r="0.75">
          <stop offset="0" stop-color="#bae6fd" />
          <stop offset="0.45" stop-color="#0ea5e9" />
          <stop offset="0.8" stop-color="#1e40af" />
          <stop offset="1" stop-color="#172554" />
        </radialGradient>
        <radialGradient id="grav-shade" cx="0.15" cy="0.5" r="0.9">
          <stop offset="0.55" stop-color="#000" stop-opacity="0" />
          <stop offset="1" stop-color="#000" stop-opacity="0.55" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#grav-space)" />
      {SKY.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="#fff" opacity={p.o} />)}
      <circle cx={STAR_X} cy={CY} r={STAR_R * 1.9} fill="url(#grav-glow)" />
      <circle cx={STAR_X} cy={CY} r={STAR_R} fill="url(#grav-star)" />
      <line x1={STAR_X + STAR_R + 6} x2={x - r - 6} y1={CY} y2={CY} stroke="#a5b4fc" stroke-width="1.5" stroke-dasharray="6 5" opacity="0.7" />
      <g data-testid="planet">
        <circle cx={x} cy={CY} r={r} fill="url(#grav-planet)" />
        <circle cx={x} cy={CY} r={r} fill="url(#grav-shade)" />
      </g>
    </svg>
  );
};

export default Interaction;
