// SPDX-License-Identifier: GPL-2.0-only
// Based on the creator of https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/graphLineAndPointInteraction
// (Thibault Milan, Sam Sipasseuth) and the equation wizard of .../graphPointLineGraphInteraction (Sam Sipasseuth,
// Christophe Noël), © 2014-2017 Parcc, Inc. (Open Assessment Technologies, for Parcc, Inc.)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useState } from "preact/hooks";
import Board from "./board";
import { Swatch, button, describe } from "./interaction";
import {
  COLORS, ELEMENT_TYPES, ElementDef, ElementType, GraphState, MAX_ELEMENTS, MAX_SET, Settings, defaults, drawn, elementProblems,
  emptyValue, isLineType, newId,
} from "./model";
import { Action, Dispatch, applyAction } from "./store";
import { textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance), like the original's creator: the author makes the list of
// elements the candidate can draw (type, label, colour, how many points, line style) and draws the correct answer of
// each on the same grid the candidate gets. The result is data-elements (model.ts ElementDef, as JSON).

const field = "min-h-[36px] rounded-md border border-slate-300 bg-white px-2 py-1 text-[14px] focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/40";

/** The correct answers as a state of the grid. */
const correctState = (elements: ElementDef[]): GraphState => ({
  values: Object.fromEntries(elements.map((e) => [e.id, e.correct ? { ...emptyValue(e), ...e.correct } : emptyValue(e)])),
});

export const authoringProblems = (s: Settings, elements: ElementDef[], language: string) =>
  elementProblems(s, elements).map(textsFor(language).a.problem);

const Authoring = ({ settings, initial, language, onChange }: {
  /** The item's settings: the grid and the axes. */
  settings: Settings;
  initial: ElementDef[];
  /** The author's language, for the texts. */
  language: string;
  onChange: (elements: ElementDef[]) => void;
}) => {
  const texts = textsFor(language);
  const t = texts.a;
  const [elements, setElements] = useState<ElementDef[]>(initial);
  const [activeId, setActiveId] = useState<string | null>(initial[0]?.id ?? null);
  const [newType, setNewType] = useState<ElementType>("point");
  const [announcement, setAnnouncement] = useState("");
  const s: Settings = { ...settings, elements, language: settings.language };
  const state = correctState(elements);

  const commit = (next: ElementDef[]) => {
    setElements(next);
    onChange(next);
  };
  const update = (id: string, change: Partial<ElementDef>) => commit(elements.map((e) => (e.id === id ? defaults({ ...e, ...change }) : e)));
  // the grid changes the correct answers
  const dispatch: Dispatch = (type, payload) => {
    const next = applyAction(s, state, { type, payload } as Action);
    commit(elements.map((e) => {
      const v = next.values[e.id];
      return { ...e, correct: drawn(e, v) ? v : null };
    }));
  };
  const add = () => {
    const id = newId(newType, elements.map((e) => e.id));
    const label = `${texts.types[newType][0].toUpperCase()}${texts.types[newType].slice(1)} ${elements.filter((e) => e.type === newType).length + 1}`;
    const e = defaults({ id, type: newType, label, color: COLORS[elements.length % COLORS.length] });
    commit([...elements, e]);
    setActiveId(id);
  };
  const moveBy = (i: number, d: number) => {
    const next = [...elements];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    commit(next);
  };
  const problems = authoringProblems(s, elements, language);

  return (
    <div class="flex flex-col gap-3 font-sans text-[14px] text-slate-800">
      <p class="m-0 max-w-[80ch] text-[13px] text-slate-600">{t.intro}</p>
      <div class="flex flex-wrap items-start gap-4">
        <div class="flex min-w-0 flex-[3_1_22rem] flex-col gap-2">
          {elements.find((e) => e.id === activeId) && (
            <p class="m-0 text-[13px] font-semibold" data-testid="drawing">{t.drawCorrect(elements.find((e) => e.id === activeId)!.label)}</p>
          )}
          <Board s={s} values={state.values} activeId={activeId} onActivate={setActiveId} dispatch={dispatch} announce={setAnnouncement}
            texts={texts} readOnly={false} label={texts.graph} testId="authoring-board" />
          <p role="status" aria-live="polite" class="m-0 min-h-[1.25rem] text-[13px] text-slate-700">{announcement}</p>
        </div>

        <section class="flex min-w-[18rem] flex-[2_1_20rem] flex-col gap-2" aria-labelledby="elements-heading">
          <h3 id="elements-heading" class="m-0 text-[15px] font-semibold">{t.elements}</h3>
          <ol class="m-0 flex list-none flex-col gap-2 p-0">
            {elements.map((e, i) => (
              <li key={e.id} class={`flex flex-col gap-2 rounded-lg border p-2 ${e.id === activeId ? "border-blue-400 bg-blue-50/40" : "border-slate-200"}`} data-testid={`element-${i}`}>
                <div class="flex flex-wrap items-center gap-2">
                  <button type="button" class={`${button} min-h-[36px] py-1 ${e.id === activeId ? "border-blue-700 ring-2 ring-blue-700" : ""}`}
                    aria-pressed={e.id === activeId ? "true" : "false"} onClick={() => setActiveId(e.id)}>
                    <Swatch e={e} /> {t.drawCorrect(e.label)}
                  </button>
                  <code class="text-[12px] text-slate-500">{e.id}</code>
                </div>
                <p class="m-0 text-[12px] text-slate-600" data-testid={`correct-${i}`}>
                  {e.correct ? describe(e, state.values[e.id], s, texts) : e.equation ? `y = ${e.equation}` : t.noCorrect}
                </p>
                <div class="flex flex-wrap items-end gap-2">
                  <label class="flex flex-col text-[12px] text-slate-600">{t.label}
                    <input class={`${field} w-40`} value={e.label} onInput={(ev) => update(e.id, { label: (ev.target as HTMLInputElement).value })} />
                  </label>
                  <label class="flex flex-col text-[12px] text-slate-600">{t.type}
                    <select class={field} value={e.type} onChange={(ev) => {
                      const type = (ev.target as HTMLSelectElement).value as ElementType;
                      const id = newId(type, elements.filter((d) => d.id !== e.id).map((d) => d.id));
                      commit(elements.map((d) => (d.id === e.id ? defaults({ id, type, label: e.label, color: e.color, score: e.score }) : d)));
                      if (activeId === e.id) setActiveId(id);
                    }}>
                      {ELEMENT_TYPES.map((type) => <option key={type} value={type}>{texts.types[type]}</option>)}
                    </select>
                  </label>
                  <label class="flex flex-col text-[12px] text-slate-600">{t.color}
                    <input type="color" class="h-9 w-12 rounded border border-slate-300" value={e.color} onInput={(ev) => update(e.id, { color: (ev.target as HTMLInputElement).value })} />
                  </label>
                  <label class="flex flex-col text-[12px] text-slate-600">{t.score}
                    <input type="number" min={0} class={`${field} w-16`} value={e.score} onChange={(ev) => update(e.id, { score: Number((ev.target as HTMLInputElement).value) })} />
                  </label>
                  {e.type === "points" && (
                    <label class="flex flex-col text-[12px] text-slate-600">{t.max}
                      <input type="number" min={1} max={MAX_SET} class={`${field} w-16`} value={e.max} onChange={(ev) => update(e.id, { max: Number((ev.target as HTMLInputElement).value) })} />
                    </label>
                  )}
                </div>
                {e.type === "points" && (
                  <>
                    <label class="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" checked={e.connect} onChange={() => update(e.id, { connect: !e.connect })} /> {t.connect}
                    </label>
                    <div class="flex flex-wrap items-end gap-2">
                      <label class="flex flex-col text-[12px] text-slate-600">{t.equation}
                        <input class={`${field} w-44`} value={e.equation} placeholder="2x + 1" onChange={(ev) => update(e.id, { equation: (ev.target as HTMLInputElement).value })} />
                      </label>
                      {e.equation && (
                        <label class="flex flex-col text-[12px] text-slate-600">{t.minPoints}
                          <input type="number" min={1} class={`${field} w-16`} value={e.minPoints} onChange={(ev) => update(e.id, { minPoints: Number((ev.target as HTMLInputElement).value) })} />
                        </label>
                      )}
                    </div>
                  </>
                )}
                {isLineType(e.type) && (
                  <div class="flex flex-col gap-1 text-[13px]">
                    <label class="flex items-center gap-2"><input type="checkbox" checked={e.dashed} onChange={() => update(e.id, { dashed: !e.dashed })} /> {t.dashed}</label>
                    <label class="flex items-center gap-2"><input type="checkbox" checked={e.styleToggle} onChange={() => update(e.id, { styleToggle: !e.styleToggle })} /> {t.styleToggle}</label>
                    {e.styleToggle && e.correct && (
                      <label class="flex items-center gap-2">
                        <input type="checkbox" checked={e.correct.dashed ?? e.dashed} onChange={() => update(e.id, { correct: { ...e.correct, dashed: !(e.correct.dashed ?? e.dashed) } })} /> {t.correctDashed}
                      </label>
                    )}
                  </div>
                )}
                <div class="flex flex-wrap gap-1">
                  {e.correct && <button type="button" class={`${button} min-h-[32px] py-0.5 text-[13px]`} onClick={() => update(e.id, { correct: null })}>{t.clearCorrect}</button>}
                  <button type="button" class={`${button} min-h-[32px] py-0.5 text-[13px]`} disabled={i === 0} aria-label={`${t.up}: ${e.label}`} onClick={() => moveBy(i, -1)}>↑</button>
                  <button type="button" class={`${button} min-h-[32px] py-0.5 text-[13px]`} disabled={i === elements.length - 1} aria-label={`${t.down}: ${e.label}`} onClick={() => moveBy(i, 1)}>↓</button>
                  <button type="button" class={`${button} min-h-[32px] py-0.5 text-[13px] text-red-700`} onClick={() => {
                    commit(elements.filter((d) => d.id !== e.id));
                    if (activeId === e.id) setActiveId(elements.find((d) => d.id !== e.id)?.id ?? null);
                  }}>{t.remove}</button>
                </div>
              </li>
            ))}
          </ol>
          <div class="flex flex-wrap items-center gap-2">
            <select class={field} value={newType} aria-label={t.newType} onChange={(ev) => setNewType((ev.target as HTMLSelectElement).value as ElementType)}>
              {ELEMENT_TYPES.map((type) => <option key={type} value={type}>{texts.types[type]}</option>)}
            </select>
            <button type="button" class={button} disabled={elements.length >= MAX_ELEMENTS} onClick={add}>+ {t.add}</button>
          </div>
          {problems.length > 0 && (
            <ul class="m-0 list-none rounded-lg bg-red-50 p-2 pl-3 text-red-800" data-testid="problems">
              {problems.map((p) => <li key={p}>⚠ {p}</li>)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default Authoring;
