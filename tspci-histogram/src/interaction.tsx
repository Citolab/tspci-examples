// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/histogramInteraction,
// © 2014-2017 Parcc, Inc. (Sam Sipasseuth, Open Assessment Technologies)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { Settings, formatValue, heightFor, parseNumber, sameHeights, snapValue, ticks } from "./histogram";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the instruction, the data (a frequency table or a list of observations), the chart with a
// slider per bar (drag, click or keyboard), the heights as number fields, and a button back to the start.

const input = "w-full rounded border border-slate-400 bg-white px-2 py-1.5 text-[15px] tabular-nums text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/40 disabled:bg-slate-100 disabled:text-slate-600";
const button = "min-h-[44px] rounded-md border border-slate-400 bg-white px-4 py-2 text-[14px] font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/40 disabled:cursor-not-allowed disabled:opacity-50";

/** The layout of the chart in SVG units (1 unit = 1 css pixel at the measured width). */
export const geometry = (s: Settings, width: number) => {
  const W = Math.max(260, Math.round(width));
  const n = s.bars.length;
  const left = s.valueTitle ? 70 : 48;
  const right = 16;
  const plotW = W - left - right;
  const slot = plotW / n;
  const longest = Math.max(...s.bars.map((b) => b.label.length));
  const histogramAxis = s.chartType === "histogram" && !!s.classes;
  // labels under the bars turn when they do not fit next to each other
  const rotate = !histogramAxis && longest * 7.2 + 8 > slot;
  const labelSpace = rotate ? Math.min(110, longest * 6.2 + 14) : 26;
  const top = s.showValues ? 28 : 14;
  const plotH = Math.max(180, Math.min(320, Math.round(W * 0.42)));
  const bottom = labelSpace + (s.categoryTitle ? 30 : 8);
  const gap = s.chartType === "histogram" ? 0 : Math.min(slot * 0.3, 40);
  return { W, H: top + plotH + bottom, left, top, plotW, plotH, slot, gap, rotate, histogramAxis, baseline: top + plotH };
};
type Geometry = ReturnType<typeof geometry>;

const yOf = (g: Geometry, s: Settings, v: number) => g.baseline - (v / s.max) * g.plotH;

const DataPanel = ({ s, texts }: { s: Settings; texts: Texts }) => {
  if (s.dataDisplay === "table" && s.table.length) {
    return (
      <section className="flex-none" aria-labelledby="hg-data">
        <h3 id="hg-data" className="m-0 mb-2 text-[15px] font-semibold text-slate-800">{texts.data}</h3>
        <table data-testid="data-table" className="border-collapse text-[14px] text-slate-800">
          <thead>
            <tr className="bg-slate-100">
              <th scope="col" className="border border-slate-300 px-3 py-1.5 text-left font-semibold">{s.categoryTitle || (s.classes ? texts.category : texts.label)}</th>
              <th scope="col" className="border border-slate-300 px-3 py-1.5 text-right font-semibold">{s.valueTitle || texts.frequency}</th>
            </tr>
          </thead>
          <tbody>
            {s.bars.map((b, i) => (
              <tr key={i}>
                <th scope="row" className="border border-slate-300 px-3 py-1.5 text-left font-normal">{b.label}</th>
                <td className="border border-slate-300 px-3 py-1.5 text-right tabular-nums">{s.table[i] === null || s.table[i] === undefined ? "" : formatValue(s.table[i] as number, s.language)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }
  if (s.dataDisplay === "list" && s.observations.length) {
    return (
      <section className="min-w-0 flex-[1_1_14rem]" aria-labelledby="hg-data">
        <h3 id="hg-data" className="m-0 mb-2 text-[15px] font-semibold text-slate-800">
          {texts.data} <span className="font-normal text-slate-600">({texts.observations(s.observations.length)})</span>
        </h3>
        <ul data-testid="data-list" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {s.observations.map((o, i) => {
            const n = s.classes ? parseNumber(o) : null;
            return (
              <li key={i} className="rounded border border-slate-300 bg-slate-50 px-2 py-0.5 text-[14px] tabular-nums text-slate-800">
                {n !== null ? formatValue(n, s.language) : o}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
  return null;
};

/** A height as the candidate types it: in the store when it is a number on the axis; a value from outside shows itself. */
const HeightInput = ({ label, name, value, s, disabled, onValue, onDone, message }: {
  label: string; name: string; value: number; s: Settings; disabled: boolean;
  onValue: (value: number) => void; onDone: (typed: number | null) => void; message: string;
}) => {
  const [edit, setEdit] = useState<{ value: number; text: string } | null>(null);
  const text = edit && edit.value === value ? edit.text : formatValue(value, s.language);
  const n = parseNumber(text);
  const valid = n !== null && n >= 0 && n <= s.max;
  const id = `hg-error-${name}`;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <label className="flex flex-col gap-0.5 text-[13px] text-slate-700">
        <span className="truncate">{label}</span>
        <input type="text" inputMode="decimal" className={input} value={text} disabled={disabled} aria-label={name}
          aria-invalid={valid ? undefined : "true"} aria-describedby={valid ? undefined : id}
          onInput={(e) => {
            const next = (e.target as HTMLInputElement).value;
            const v = parseNumber(next);
            const ok = v !== null && v >= 0 && v <= s.max;
            const snapped = ok ? snapValue(v, s) : value;
            setEdit({ value: snapped, text: next });
            if (ok && snapped !== value) onValue(snapped);
          }}
          onBlur={() => {
            if (edit) onDone(parseNumber(edit.text));
            setEdit(null);
          }} />
      </label>
      {!valid && <span id={id} className="text-[12px] text-red-700">{message}</span>}
    </div>
  );
};

const Interaction = ({ s, store, texts, readOnly, solution }: {
  s: Settings; store: IStore<StateModel, Actions>; texts: Texts; readOnly: boolean; solution: boolean;
}) => {
  const state = useStore(store);
  const [announcement, setAnnouncement] = useState("");
  const [width, setWidth] = useState(640);
  const [dragging, setDragging] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const fmt = (v: number) => formatValue(v, s.language);
  const starts = s.bars.map((b) => b.start);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => el.clientWidth > 0 && setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = geometry(s, width);

  /** Sets a bar's height (snapped; a locked bar does not move) and says so when asked. */
  const setHeight = (bar: number, value: number, how: Actions["SET_HEIGHT"]["how"], say = true) => {
    const b = s.bars[bar];
    if (readOnly || !b) return;
    if (b.locked) return say && setAnnouncement(texts.cannot(b.label));
    const height = heightFor(s, bar, value);
    if (height !== store.getState().heights[bar]) store.dispatch({ type: "SET_HEIGHT", payload: { bar, height, how } });
    if (say) setAnnouncement(texts.set(b.label, fmt(height)));
  };

  const valueAt = (clientY: number) => {
    const r = svg.current!.getBoundingClientRect();
    const k = r.height / g.H;
    return ((g.baseline - (clientY - r.top) / k) / g.plotH) * s.max;
  };

  // dragging: the window follows the pointer until it is let go
  useEffect(() => {
    if (dragging === null) return;
    const move = (e: PointerEvent) => setHeight(dragging, valueAt(e.clientY), "drag", false);
    const up = (e: PointerEvent) => {
      setHeight(dragging, valueAt(e.clientY), "drag");
      setDragging(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, width, s]);

  const onKey = (bar: number, e: KeyboardEvent) => {
    const h = state.heights[bar];
    const next: Record<string, number> = {
      ArrowUp: h + s.snap, ArrowRight: h + s.snap, ArrowDown: h - s.snap, ArrowLeft: h - s.snap,
      PageUp: h + s.step, PageDown: h - s.step, Home: 0, End: s.max,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    setHeight(bar, Math.min(s.max, Math.max(0, next[e.key])), "key");
  };

  const reset = () => {
    store.dispatch({ type: "RESET_HEIGHTS", payload: { heights: starts } });
    setAnnouncement(texts.resetDone);
  };

  const tickValues = ticks(s);

  return (
    <div className="flex flex-col gap-4 font-sans text-slate-900">
      {s.prompt && <p data-testid="prompt" className="m-0 text-[16px] leading-snug">{s.prompt}</p>}
      <div className="flex flex-wrap items-start gap-6">
        <DataPanel s={s} texts={texts} />
        <section className="flex min-w-[260px] flex-[3_1_22rem] flex-col gap-2" aria-labelledby="hg-chart">
          <h3 id="hg-chart" className="m-0 text-[15px] font-semibold text-slate-800">{s.title || texts.chart}</h3>
          {!readOnly && <p id="hg-help" className="m-0 text-[13px] text-slate-600">{texts.chartHelp}</p>}
          {solution && <p className="m-0 text-[13px] font-medium text-emerald-800">{texts.solution}</p>}
          <div ref={box} className="w-full">
            <svg ref={svg} data-testid="chart" viewBox={`0 0 ${g.W} ${g.H}`} width="100%" className="block select-none touch-none overflow-visible" role="group"
              aria-label={s.title || texts.chart}>
              <defs>
                <pattern id="hg-locked" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="3" height="8" fill="white" fill-opacity="0.45" />
                </pattern>
              </defs>
              {/* gridlines and the value axis */}
              {tickValues.map((t) => (
                <g key={t} aria-hidden="true">
                  <line x1={g.left} x2={g.left + g.plotW} y1={yOf(g, s, t)} y2={yOf(g, s, t)} stroke={t === 0 ? "#334155" : "#e2e8f0"} stroke-width={t === 0 ? 1.5 : 1} />
                  <text x={g.left - 8} y={yOf(g, s, t)} text-anchor="end" dominant-baseline="middle" font-size="12" fill="#475569" className="tabular-nums">{fmt(t)}</text>
                </g>
              ))}
              <line x1={g.left} x2={g.left} y1={g.top - 6} y2={g.baseline} stroke="#334155" stroke-width="1.5" aria-hidden="true" />
              {s.valueTitle && (
                <text data-testid="value-title" aria-hidden="true" font-size="13" fill="#1e293b" font-weight="600" text-anchor="middle"
                  transform={`translate(16 ${g.top + g.plotH / 2}) rotate(-90)`}>{s.valueTitle}</text>
              )}
              {/* the category axis: class boundaries under the edges, or a label under each bar */}
              {g.histogramAxis
                ? s.classes!.map((c, i) => (
                  <g key={i} aria-hidden="true">
                    <line x1={g.left + i * g.slot} x2={g.left + i * g.slot} y1={g.baseline} y2={g.baseline + 5} stroke="#334155" />
                    <text x={g.left + i * g.slot} y={g.baseline + 18} text-anchor="middle" font-size="12" fill="#475569">{fmt(c)}</text>
                  </g>
                ))
                : s.bars.map((b, i) => {
                  const x = g.left + (i + 0.5) * g.slot;
                  return (
                    <text key={i} aria-hidden="true" font-size="12" fill="#475569" text-anchor={g.rotate ? "end" : "middle"}
                      transform={g.rotate ? `translate(${x + 4} ${g.baseline + 10}) rotate(-40)` : `translate(${x} ${g.baseline + 18})`}>{b.label}</text>
                  );
                })}
              {s.categoryTitle && (
                <text data-testid="category-title" aria-hidden="true" x={g.left + g.plotW / 2} y={g.H - 8} text-anchor="middle" font-size="13" font-weight="600" fill="#1e293b">{s.categoryTitle}</text>
              )}
              {/* the bars: a slider each */}
              {s.bars.map((b, i) => {
                const h = state.heights[i] ?? 0;
                const x = g.left + i * g.slot + g.gap / 2;
                const w = g.slot - g.gap;
                const y = yOf(g, s, h);
                const active = !readOnly && !b.locked;
                const handleW = Math.min(36, Math.max(14, w - 8));
                return (
                  <g key={i} className={`hg-bar ${active ? "cursor-ns-resize" : ""}`} role="slider" tabindex={readOnly ? -1 : 0} data-bar={i}
                    aria-label={texts.barName(b.label)} aria-orientation="vertical"
                    aria-valuemin={0} aria-valuemax={s.max} aria-valuenow={h} aria-valuetext={b.locked ? `${fmt(h)}, ${texts.locked}` : fmt(h)}
                    aria-readonly={readOnly || b.locked ? "true" : undefined} aria-describedby={readOnly ? undefined : "hg-help"}
                    onKeyDown={(e) => !readOnly && onKey(i, e as unknown as KeyboardEvent)}
                    onPointerDown={(e) => {
                      if (!active || e.button !== 0) return;
                      e.preventDefault();
                      (e.currentTarget as SVGGElement).focus();
                      setHeight(i, valueAt(e.clientY), "drag", false);
                      setDragging(i);
                    }}>
                    {/* the whole column is the target: a large one for a finger */}
                    <rect x={g.left + i * g.slot} y={g.top - 14} width={g.slot} height={g.plotH + 14} fill="transparent" />
                    <rect className="hg-focus" x={x} y={y} width={w} height={Math.max(0, g.baseline - y)} fill={b.color}
                      stroke="white" stroke-width={s.chartType === "histogram" ? 1 : 0} fill-opacity={dragging === i ? 0.85 : 1} />
                    {b.locked && <rect x={x} y={y} width={w} height={Math.max(0, g.baseline - y)} fill="url(#hg-locked)" pointer-events="none" />}
                    {active && (
                      <g pointer-events="none" aria-hidden="true">
                        <rect x={x + w / 2 - handleW / 2} y={y - 6} width={handleW} height={12} rx={6} fill="white" stroke="#0f172a" stroke-width="1.5" />
                        <line x1={x + w / 2 - handleW / 4} x2={x + w / 2 + handleW / 4} y1={y} y2={y} stroke="#0f172a" stroke-width="1.5" />
                      </g>
                    )}
                    {s.showValues && (
                      <text aria-hidden="true" x={x + w / 2} y={y - (active ? 12 : 6)} text-anchor="middle" font-size="12" font-weight="600" fill="#0f172a"
                        className="tabular-nums" pointer-events="none">{fmt(h)}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-1 p-0 text-[13px] text-slate-700">{readOnly ? texts.heights : texts.heightsHelp}</legend>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
              {s.bars.map((b, i) => (
                <HeightInput key={i} label={b.locked ? `${b.label} 🔒` : b.label} name={texts.barName(b.label)} value={state.heights[i] ?? 0} s={s}
                  disabled={readOnly || b.locked} message={texts.invalid(fmt(s.max))}
                  onValue={(v) => setHeight(i, v, "typed", false)}
                  onDone={(typed) => {
                    const now = store.getState().heights[i];
                    if (typed !== null && typed !== now && typed >= 0 && typed <= s.max) setAnnouncement(texts.rounded(b.label, fmt(now)));
                    else if (typed !== null) setAnnouncement(texts.set(b.label, fmt(now)));
                  }} />
              ))}
            </div>
          </fieldset>
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={button} disabled={sameHeights(state.heights, starts)} onClick={reset}>{texts.reset}</button>
            </div>
          )}
          <p role="status" aria-live="polite" className="m-0 min-h-[1.25rem] text-[13px] text-slate-700">{announcement}</p>
        </section>
      </div>
    </div>
  );
};

export default Interaction;
