// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/graphLineAndPointInteraction
// (Thibault Milan, Sam Sipasseuth) and .../graphPointLineGraphInteraction (Sam Sipasseuth, Christophe Noël),
// © 2014-2017 Parcc, Inc. (Open Assessment Technologies, for Parcc, Inc.)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { ElementDef, ElementValue, Settings, equationText, formatPoint, isLineType, linesOf, regionsOf, insidePolygon, labelPoint } from "./model";
import { Actions, Dispatch, StateModel } from "./store";
import { Texts } from "./texts";
import Board from "./board";

// The candidate's view: the instruction, a button per element to draw (as the original's buttons), the line style of
// a line, the grid, and a list of what is drawn with a delete button per point and a checkbox per area.

export const button =
  "inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/40 disabled:cursor-not-allowed disabled:opacity-50";
const small =
  "inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md px-2 text-[13px] hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/40 disabled:cursor-not-allowed disabled:opacity-50";

/** What is drawn of an element, in words. */
export const describe = (e: ElementDef, v: ElementValue | undefined, s: Settings, texts: Texts): string => {
  const pts = v?.points ?? [];
  const pt = (i: number) => formatPoint(pts[i], s.language);
  if (e.type === "solutionSet") return texts.areas(v?.regions?.length ?? 0);
  if (!pts.length) return texts.nothing;
  if (isLineType(e.type)) {
    if (pts.length === 1) return texts.onePoint(pt(0));
    if (e.type === "line") return `${texts.through(pt(0), pt(1))}: ${equationText(pts[0], pts[1], s.language)}`;
    return e.type === "segment" ? texts.from(pt(0), pt(1)) : texts.rayFrom(pt(0), pt(1));
  }
  return pts.map((_, i) => pt(i)).join(" ");
};

export const Swatch = ({ e }: { e: ElementDef }) => (
  <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true" class="shrink-0">
    {e.type === "solutionSet" ? <rect x="1" y="1" width="20" height="14" rx="3" fill={e.color} opacity="0.45" />
      : isLineType(e.type) ? <path d="M2 13L20 3" stroke={e.color} stroke-width="3" stroke-linecap="round" stroke-dasharray={e.dashed ? "4 3" : undefined} />
      : <g fill={e.color}><circle cx="6" cy="10" r="3.5" />{e.type === "points" && <circle cx="15" cy="6" r="3.5" />}</g>}
  </svg>
);

const Interaction = ({ s, store, texts, readOnly }: {
  s: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  readOnly: boolean;
}) => {
  const state = useStore(store);
  const [announcement, setAnnouncement] = useState("");
  const [activeId, setActiveId] = useState<string | null>(s.elements[0]?.id ?? null);
  const dispatch: Dispatch = (type, payload) => store.dispatch({ type, payload } as any);
  const active = s.elements.find((e) => e.id === activeId) ?? null;
  const hasLine = linesOf(s, state.values).length > 0;
  const regions = regionsOf(linesOf(s, state.values), s.grid);

  const activate = (id: string) => {
    setActiveId(id);
    const e = s.elements.find((d) => d.id === id);
    if (e) setAnnouncement(texts.active(e.label, texts.types[e.type]));
  };
  const toolHint = (e: ElementDef) =>
    e.type === "solutionSet" && !hasLine ? texts.needLine : e.type === "points" ? `${texts.toolHint.points} (${texts.count(state.values[e.id]?.points.length ?? 0, e.max)})` : texts.toolHint[e.type];

  return (
    <div class="flex max-w-full flex-col gap-3 font-sans text-[15px] text-slate-800">
      {s.prompt && <p class="m-0 max-w-[75ch] text-slate-700" data-testid="prompt">{s.prompt}</p>}

      {!readOnly && (
        <div class="flex flex-col gap-2">
          <div role="group" aria-label={texts.draw} class="flex flex-wrap gap-2" data-testid="tools">
            {s.elements.map((e) => {
              const disabled = e.type === "solutionSet" && !hasLine;
              const n = state.values[e.id]?.points.length ?? 0;
              return (
                <button key={e.id} type="button" aria-pressed={e.id === activeId ? "true" : "false"} disabled={disabled}
                  title={disabled ? texts.needLine : undefined}
                  class={`${button} ${e.id === activeId ? "border-blue-700 bg-blue-50 ring-2 ring-blue-700" : ""}`}
                  onClick={() => activate(e.id)}>
                  <Swatch e={e} />
                  <span>{e.label}</span>
                  <span class="text-[12px] font-normal text-slate-500">
                    {texts.types[e.type]}{e.type === "points" ? ` · ${texts.count(n, e.max)}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
          {active && isLineType(active.type) && active.styleToggle && (
            <div role="radiogroup" aria-label={texts.style(active.label)} class="flex flex-wrap items-center gap-2" data-testid="line-style">
              <span class="text-[13px] text-slate-600" aria-hidden="true">{texts.style(active.label)}:</span>
              {[false, true].map((dashed) => {
                const on = (state.values[active.id]?.dashed ?? active.dashed) === dashed;
                return (
                  <button key={String(dashed)} type="button" role="radio" aria-checked={on ? "true" : "false"}
                    class={`${button} min-h-[40px] py-1 ${on ? "border-blue-700 bg-blue-50 ring-2 ring-blue-700" : ""}`}
                    onClick={() => {
                      dispatch("SET_DASHED", { id: active.id, dashed });
                      setAnnouncement(texts.styleSet(active.label, dashed));
                    }}>
                    <svg width="34" height="10" aria-hidden="true"><path d="M2 5H32" stroke={active.color} stroke-width="3" stroke-dasharray={dashed ? "6 4" : undefined} /></svg>
                    {dashed ? texts.dashed : texts.solid}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div class="flex flex-wrap items-start gap-4">
        <div class="flex min-w-0 flex-[3_1_22rem] flex-col gap-2">
          {!readOnly && (
            <p id="board-help" class="m-0 max-w-[640px] text-[13px] text-slate-600">
              {active && <strong class="font-semibold text-slate-800" data-testid="tool-hint">{toolHint(active)} </strong>}
              {texts.help}
            </p>
          )}
          <Board s={s} values={state.values} activeId={activeId} onActivate={activate} dispatch={dispatch} announce={setAnnouncement}
            texts={texts} readOnly={readOnly} describedBy={readOnly ? undefined : "board-help"}
            label={s.prompt ? `${texts.graph}: ${s.prompt}` : texts.graph} />
          <p role="status" aria-live="polite" class="m-0 min-h-[1.25rem] text-[13px] text-slate-700">{announcement}</p>
        </div>

        <section class="flex min-w-[16rem] flex-[1_1_16rem] flex-col gap-2 text-[14px]" aria-labelledby="your-graph">
          <h3 id="your-graph" class="m-0 text-[15px] font-semibold">{texts.yourGraph}</h3>
          <ul class="m-0 flex list-none flex-col gap-2 p-0" data-testid="drawn">
            {s.elements.map((e) => {
              const v = state.values[e.id];
              return (
                <li key={e.id} class={`rounded-lg border p-2 ${e.id === activeId && !readOnly ? "border-blue-300 bg-blue-50/40" : "border-slate-200"}`} data-testid={`drawn-${e.id}`}>
                  <div class="flex items-center gap-2">
                    <Swatch e={e} />
                    <span class="font-medium">{e.label}</span>
                    {!readOnly && (v?.points.length || v?.regions?.length) ? (
                      <button type="button" class={`${small} ml-auto text-slate-600`} onClick={() => {
                        dispatch("CLEAR", { id: e.id });
                        setAnnouncement(texts.cleared(e.label));
                      }}>{texts.clear(e.label)}</button>
                    ) : null}
                  </div>
                  <p class="m-0 mt-1 text-[13px] text-slate-600" data-testid={`describe-${e.id}`}>{describe(e, v, s, texts)}</p>
                  {!readOnly && e.type !== "solutionSet" && (v?.points.length ?? 0) > 0 && (
                    <div class="mt-1 flex flex-wrap gap-1">
                      {v.points.map((p, i) => (
                        <button key={i} type="button" class={`${small} border border-slate-200 text-red-700`} aria-label={texts.deletePoint(e.label, formatPoint(p, s.language))}
                          onClick={() => {
                            dispatch("REMOVE_POINT", { id: e.id, index: i });
                            setAnnouncement(texts.removed(e.label, formatPoint(p, s.language)));
                          }}>
                          <span class="tabular-nums text-slate-700">{formatPoint(p, s.language)}</span>&nbsp;✕
                        </button>
                      ))}
                    </div>
                  )}
                  {e.type === "solutionSet" && (
                    hasLine ? (
                      <fieldset class="m-0 mt-1 flex flex-col gap-0.5 border-0 p-0" data-testid={`areas-${e.id}`}>
                        <legend class="sr-only">{texts.areasLegend(e.label)}</legend>
                        {regions.map((r, i) => {
                          const on = (v?.regions ?? []).some((m) => insidePolygon(m, r.polygon));
                          return (
                            <label key={i} class="flex min-h-[32px] items-center gap-2 text-[13px]">
                              <input type="checkbox" class="h-4 w-4" style={{ accentColor: e.color }} checked={on} disabled={readOnly}
                                onChange={() => {
                                  dispatch("TOGGLE_REGION", { id: e.id, x: r.inside.x, y: r.inside.y });
                                  setAnnouncement(on ? texts.unshaded(i + 1) : texts.shaded(i + 1));
                                }} />
                              {texts.area(i + 1, formatPoint(labelPoint(r, s.grid), s.language))}
                            </label>
                          );
                        })}
                      </fieldset>
                    ) : !readOnly && <p class="m-0 mt-1 text-[12px] text-slate-500">{texts.noAreas}</p>
                  )}
                </li>
              );
            })}
          </ul>
          {s.given.length > 0 && (
            <p class="m-0 text-[13px] text-slate-600" data-testid="given-list">
              {texts.given}: {s.given.map((g) => `${g.label ? g.label + " " : ""}${formatPoint(g, s.language)}`).join(", ")}
            </p>
          )}
        </section>
      </div>
    </div>
  );
};

export default Interaction;
