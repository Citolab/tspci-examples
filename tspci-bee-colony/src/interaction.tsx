// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Abeillepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useEffect, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { Factor, FactorId, Settings } from "./settings";
import { Actions, LevelMap, StateModel } from "./store";
import { Texts } from "./texts";
import { beesDrawn, effectChoices, flowerGroupsOf, levelsFor, populationOf } from "./model";
import { formatNumber, parseAnswer } from "./format";
import { Scene } from "./scene";

// The candidate's view: the instruction, the meadow with the hive and the population, a slider per factor, the
// results table and the question.

const usePrefersReducedMotion = () => {
  const query = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const [reduced, setReduced] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const listener = () => setReduced(query.matches);
    query.addEventListener?.("change", listener);
    return () => query.removeEventListener?.("change", listener);
  }, []);
  return reduced;
};

/** The same levels for every factor that is on. */
export const sameLevels = (s: Settings, a: LevelMap, b: LevelMap) => s.factors.every((f) => (a[f.id] ?? 0) === (b[f.id] ?? 0));

/** The question as the candidate reads it: the author's text, or the standard one. */
export const questionTextOf = (s: Settings, texts: Texts) => {
  if (s.questionText) return s.questionText;
  if (s.question === "largestEffect") return texts.largestEffect;
  const parts = s.factors.map((f) => texts.atLevel(texts.factors[f.id], s.predict[f.id]));
  const combination = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} ${texts.and} ${parts[parts.length - 1]}` : parts[0];
  return texts.predict(combination);
};

const FactorIcon = ({ id }: { id: FactorId }) => (
  <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden="true">
    {id === "pesticide" && (
      <g>
        <rect x="9" y="11" width="13" height="18" rx="2.5" fill="#65a30d" stroke="#365314" />
        <rect x="12" y="6" width="7" height="5" fill="#a3a3a3" stroke="#525252" />
        <path d="M19 7h5" stroke="#525252" stroke-width="2" />
        <circle cx="27" cy="5" r="1.2" fill="#a3a635" />
        <circle cx="28.5" cy="9" r="1" fill="#a3a635" />
        <path d="M15.5 15l4 7h-8z" fill="#fde047" stroke="#1c1917" stroke-width="0.8" />
      </g>
    )}
    {id === "hornet" && (
      <g transform="translate(16 17) scale(0.62)">
        <ellipse cx="-6" cy="-12" rx="11" ry="6" fill="#fef3c7" stroke="#78716c" />
        <ellipse cx="-12" cy="1" rx="12" ry="8" fill="#1c1917" />
        <ellipse cx="-17" cy="1" rx="2" ry="6.5" fill="#f59e0b" />
        <ellipse cx="4" cy="0" rx="8" ry="6" fill="#292524" />
        <circle cx="15" cy="-1" r="6.5" fill="#f59e0b" stroke="#78350f" />
      </g>
    )}
    {id === "varroa" && (
      <g transform="translate(16 16) scale(2.6)">
        <path d="M-3 -1 l-2.5 -2 M-3 1 l-2.5 2 M3 -1 l2.5 -2 M3 1 l2.5 2" stroke="#451a03" stroke-width="0.7" />
        <ellipse rx="3.6" ry="2.8" fill="#9a3412" stroke="#451a03" stroke-width="0.5" />
      </g>
    )}
  </svg>
);

const Interaction = ({ prompt, settings: s, store, texts, readOnly, uid }: {
  prompt: string;
  settings: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  readOnly: boolean;
  uid: string;
}) => {
  const state = useStore(store);
  const reducedMotion = usePrefersReducedMotion();
  const [announcement, setAnnouncement] = useState("");
  const levels = levelsFor(s, state.levels);
  const population = populationOf(s, levels);
  const bees = beesDrawn(s, population);
  const slots = Math.max(beesDrawn(s, s.startPopulation), bees);
  const n = (value: number) => formatNumber(value, s.language);
  const beesText = (value: number) => texts.bees(value, n(value));
  const hornetOn = s.factors.some((f) => f.id === "hornet");

  // a hornet flies across when the candidate raises the hornet slider (not for a restored state)
  const [flight, setFlight] = useState(0);
  const lastHornet = useRef(levels.hornet ?? 0);
  useEffect(() => {
    const now = levels.hornet ?? 0;
    if (now > lastHornet.current) setFlight((f) => f + 1);
    lastHornet.current = now;
  }, [levels.hornet]);

  const move = (factor: Factor, level: number) => {
    // a drag fires input and change before a new render: compare with the store, not this render's levels
    if (readOnly || levelsFor(s, store.getState().levels)[factor.id] === level) return;
    store.dispatch({ type: "MOVE", payload: { factor: factor.id, level } });
    setAnnouncement(texts.population(beesText(populationOf(s, { ...levels, [factor.id]: level }))));
  };

  const record = () => {
    if (readOnly) return;
    const existing = state.trials.findIndex((t) => sameLevels(s, t.levels, levels));
    if (existing >= 0) return setAnnouncement(texts.alreadyRecorded(existing + 1));
    if (state.trials.length >= s.maxTrials) return setAnnouncement(texts.tableFull);
    store.dispatch({ type: "RECORD", payload: { levels: { ...levels }, population } });
    setAnnouncement(texts.recorded(state.trials.length + 1, beesText(population)));
  };

  const remove = (index: number) => {
    if (readOnly) return;
    store.dispatch({ type: "REMOVE", payload: { index } });
    setAnnouncement(texts.removed(index + 1));
  };

  const fraction = (id: FactorId) => {
    const factor = s.factors.find((f) => f.id === id);
    return factor ? (levels[id] ?? 0) / factor.levels : 0;
  };
  const flowers = flowerGroupsOf(s, population);
  const sceneLabel = [
    texts.scene.hive(bees),
    texts.scene.flowers[flowers],
    fraction("pesticide") > 0 ? texts.scene.pesticide : "",
    (levels.hornet ?? 0) > 0 ? texts.scene.hornet(levels.hornet) : "",
    fraction("varroa") > 0 ? texts.scene.varroa : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="bee-colony flex w-full max-w-[860px] flex-col gap-3 font-sans text-slate-800" lang={s.language}>
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-slate-700">{prompt}</p>}
      <section aria-label={texts.simulation} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative">
          <Scene uid={uid} bees={bees} slots={slots} flowerGroups={flowers} pesticide={fraction("pesticide")}
            hornets={hornetOn ? levels.hornet ?? 0 : 0} hornetFlight={flight} varroa={fraction("varroa")}
            reducedMotion={reducedMotion} label={sceneLabel} />
          <div className="absolute bottom-3 left-1/2 max-w-[90%] -translate-x-1/2 rounded-lg bg-slate-900/75 px-3 py-1.5 text-center text-base font-semibold tabular-nums text-white shadow sm:text-lg"
            data-testid="population">
            {texts.population(beesText(population))}
          </div>
        </div>

        <div className={`grid gap-4 border-t border-slate-100 p-4 ${s.showTable ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`}>
          <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
            <legend className="mb-1 p-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{texts.controls}</legend>
            {s.factors.map((f) => (
              <FactorSlider key={f.id} factor={f} level={levels[f.id] ?? 0} texts={texts} disabled={readOnly}
                valueText={(l) => `${texts.levelOf(l, f.levels)}, ${texts.population(beesText(populationOf(s, { ...levels, [f.id]: l })))}`}
                onMove={(l) => move(f, l)} />
            ))}
            {!s.showTable && <p className="m-0 text-xs text-slate-500">{texts.hint}</p>}
          </fieldset>

          {s.showTable && (
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500" id={`${uid}-trials`}>{texts.trials}</h3>
                <button type="button" onClick={record} disabled={readOnly}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2">
                  {texts.record}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm tabular-nums" aria-labelledby={`${uid}-trials`} data-testid="trials">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th scope="col" className="py-1 pr-2 font-medium">{texts.trial}</th>
                      {s.factors.map((f) => <th key={f.id} scope="col" className="py-1 pr-2 font-medium">{texts.short[f.id]}</th>)}
                      <th scope="col" className="py-1 pr-2 text-right font-medium">{texts.populationColumn}</th>
                      <td />
                    </tr>
                  </thead>
                  <tbody>
                    {state.trials.length === 0 && (
                      <tr><td colSpan={s.factors.length + 3} className="py-2 text-xs text-slate-500">{texts.noTrials}</td></tr>
                    )}
                    {state.trials.map((t, i) => (
                      <tr key={i} className={`border-b border-slate-100 ${sameLevels(s, t.levels, levels) ? "bg-amber-50" : ""}`}>
                        <th scope="row" className="py-1 pr-2 text-left font-medium text-slate-500">{i + 1}</th>
                        {s.factors.map((f) => <td key={f.id} className="py-1 pr-2">{t.levels[f.id] ?? 0}</td>)}
                        <td className="py-1 pr-2 text-right font-semibold">{n(t.population)}</td>
                        <td className="w-8 py-1 text-right">
                          <button type="button" aria-label={texts.remove(i + 1)} onClick={() => remove(i)} disabled={readOnly}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {s.question !== "none" && (
          <QuestionBlock settings={s} texts={texts} answer={state.answer} disabled={readOnly} uid={uid}
            onAnswer={(answer) => !readOnly && store.dispatch({ type: "ANSWER", payload: { answer } })} />
        )}
      </section>
      <div role="status" aria-live="polite" className="sr-only" data-testid="live">{announcement}</div>
    </div>
  );
};

/** A native range input with a whole number per level: arrow keys, Home and End, or drag. */
const FactorSlider = ({ factor, level, texts, disabled, valueText, onMove }: {
  factor: Factor;
  level: number;
  texts: Texts;
  disabled: boolean;
  valueText: (level: number) => string;
  onMove: (level: number) => void;
}) => {
  const read = (e: Event) => Number((e.currentTarget as HTMLInputElement).value);
  const label = texts.factors[factor.id];
  return (
    <div className="flex min-w-0 items-center gap-3">
      <FactorIcon id={factor.id} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-700">
          <span>{label}</span>
          <span className="text-xs font-medium tabular-nums text-slate-500" aria-hidden="true" data-testid={`${factor.id}-value`}>
            {level} / {factor.levels}
          </span>
        </div>
        <input type="range" data-testid={factor.id} aria-label={label} aria-valuetext={valueText(level)}
          className="range w-full" style={{ "--fill": `${(level / factor.levels) * 100}%` }}
          min={0} max={factor.levels} step={1} value={level} disabled={disabled}
          onInput={(e) => onMove(read(e))} onChange={(e) => onMove(read(e))} />
        <div className="flex justify-between px-1 text-[11px] tabular-nums text-slate-400" aria-hidden="true">
          {Array.from({ length: factor.levels + 1 }, (_, l) => (
            <span key={l}>{l === 0 ? `0 (${texts.none})` : l}</span>
          ))}
        </div>
      </div>
    </div>
  );
};

const QuestionBlock = ({ settings: s, texts, answer, disabled, uid, onAnswer }: {
  settings: Settings;
  texts: Texts;
  answer: string;
  disabled: boolean;
  uid: string;
  onAnswer: (answer: string) => void;
}) => {
  const question = questionTextOf(s, texts);
  if (s.question === "largestEffect") {
    return (
      <fieldset className="m-0 flex flex-col gap-2 border-0 border-t border-slate-100 px-4 py-4" data-testid="question">
        <legend className="float-left mb-2 w-full p-0 text-[15px] font-semibold text-slate-800">{question}</legend>
        <div className="clear-both flex flex-wrap gap-2">
          {effectChoices(s).map((choice) => (
            <label key={choice}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${answer === choice ? "border-amber-500 bg-amber-50" : "border-slate-300 bg-white"} ${disabled ? "cursor-default opacity-70" : ""}`}>
              <input type="radio" name={`${uid}-answer`} value={choice} checked={answer === choice} disabled={disabled}
                className="h-4 w-4 accent-amber-600" onChange={() => onAnswer(choice)} />
              {choice === "equal" ? texts.equal : texts.factors[choice]}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  const invalid = answer.trim() !== "" && parseAnswer(answer, s.language) === null;
  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-4" data-testid="question">
      <label htmlFor={`${uid}-answer`} className="text-[15px] font-semibold text-slate-800">{question}</label>
      <div className="flex items-center gap-2">
        <input id={`${uid}-answer`} type="text" inputMode="numeric" autoComplete="off" value={answer} disabled={disabled}
          aria-invalid={invalid ? "true" : undefined} aria-describedby={invalid ? `${uid}-invalid` : undefined}
          className="h-10 w-40 rounded-lg border border-slate-300 bg-white px-3 text-right text-[15px] tabular-nums shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:bg-slate-50"
          onInput={(e) => onAnswer((e.currentTarget as HTMLInputElement).value)} />
        <span className="text-sm text-slate-600">{texts.beesUnit}</span>
      </div>
      {invalid && <p id={`${uid}-invalid`} className="m-0 text-xs text-red-700">{texts.notANumber}</p>}
    </div>
  );
};

export default Interaction;
