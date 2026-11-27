import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  Answer, DoubleMark, DoubleWork, MAX_DOUBLE_MARKS, doubleFreeSpot, doubleRows, doubleShadeAt, formatNumber, parseAmount, stripPlace,
} from "./numberline";
import type { View } from "./board";

// The double number line (dubbele getallenlijn, procentenstrook; data-mode="double"): a strip, or a line, with two
// scales on the same positions. The given pairs are on it (0 % ↔ 0, 100 % ↔ 80). The candidate adds marks (a click on
// the strip, or the button), writes the numbers above and below each one, and writes the answer. A mark is a slider: drag
// it, or move it with the arrow keys. The strip is not to scale; only the order counts (numberline.ts checkDouble).
// Every number is a text box, in the order a candidate writes it; a new mark puts the focus on its number above.

const INK = "#1e293b";
const MARK = "#0072B2";
const SHADE = "#cfe3f3";
/** A text box: height and width; a row of boxes. */
const BOX = 30;
const BOX_W = 64;
const ROW = BOX + 6;
/** The height of the strip, and how far a mark sticks out of it (or out of the line). */
const BAR = 36;
const REACH = 12;

const allowed = /^[0-9.,\-−+/ ¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞%€$£]*$/;

export const DoubleLine = ({ view, answer, onChange }: {
  view: View;
  answer: Answer;
  onChange: (next: Answer) => void;
}) => {
  const t = view.texts;
  const { task, readOnly } = view;
  const d = task.double;
  const work = answer.double;
  const strip = d.look !== "line";
  const rootRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(null);
  const [drag, setDrag] = useState<{ i: number; at: number; moved: boolean; x: number } | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const fmt = (v: number) => formatNumber(v, "decimal", view.language);

  // after a mark is added (or removed), the focus goes to where to write next
  useLayoutEffect(() => {
    if (!focusNext.current) return;
    // right after the render (a layout effect); the box may not be there yet (a render can come before the one with the new mark): wait until it is
    const target = rootRef.current?.querySelector<HTMLElement>(`[data-testid="${focusNext.current}"]`);
    if (!target) return;
    target.focus();
    focusNext.current = null;
  });

  const set = (next: Partial<DoubleWork>) => onChange({ ...answer, double: { ...work, ...next } });
  const setMark = (i: number, change: Partial<DoubleMark>) => set({ marks: work.marks.map((m, k) => (k === i ? { ...m, ...change } : m)) });

  // --- where everything goes: the strip from x0 to x1, the boxes in rows above and below it
  const marks = work.marks.map((m, i) => (drag && drag.i === i ? { ...m, at: drag.at } : m));
  const labelLength = Math.max(d.topLabel.length, d.bottomLabel.length);
  const gutter = labelLength ? Math.min(150, 22 + labelLength * 8.5) : 8;
  const width = Math.max(520, view.length);
  const x0 = gutter + BOX_W / 2 + 4;
  const x1 = width - BOX_W / 2 - 8;
  const xAt = (at: number) => x0 + at * (x1 - x0);
  const rows = doubleRows([...d.given.map((g) => xAt(g.at)), ...marks.map((m) => xAt(m.at))], BOX_W + 6, d.given.length);
  const rowOf = (i: number, given: boolean) => rows[given ? i : d.given.length + i];
  const rowCount = Math.max(1, ...rows.map((r) => r + 1));
  const top = 4 + BOX + 6 + REACH + (rowCount - 1) * ROW; // the strip's upper edge, or the line
  const bottom = top + (strip ? BAR : 0);
  const topY = (row: number) => top - REACH - 6 - BOX - row * ROW;
  const bottomY = (row: number) => bottom + REACH + 6 + row * ROW;
  const height = bottomY(rowCount - 1) + BOX + 4;
  const shadeAt = doubleShadeAt(task, { ...work, marks });

  /** The place on the strip under the pointer. */
  const atX = (clientX: number) => {
    const r = areaRef.current?.getBoundingClientRect();
    const scale = r && r.width ? r.width / width : 1;
    return stripPlace(((clientX - (r?.left ?? 0)) / scale - x0) / (x1 - x0));
  };

  // --- adding, removing, moving marks

  const add = (at: number) => {
    if (readOnly) return;
    if (work.marks.length >= MAX_DOUBLE_MARKS) return setStatus(t.doubleNoMore);
    const n = work.marks.length;
    focusNext.current = `double-top-${n}`;
    setActive(n);
    setStatus(t.doubleAdded(n + 1));
    set({ marks: [...work.marks, { at: stripPlace(at), top: "", bottom: "" }] });
  };
  const addFree = () => add(doubleFreeSpot([...d.given.map((g) => g.at), ...work.marks.map((m) => m.at)]));
  const remove = (i: number) => {
    if (readOnly || !work.marks[i]) return;
    focusNext.current = "double-add";
    setActive(null);
    setStatus(t.doubleRemoved(i + 1));
    set({ marks: work.marks.filter((_, k) => k !== i) });
  };

  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (readOnly) return;
    const cur = work.marks[i].at;
    const step = e.shiftKey ? 0.1 : 0.01;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = cur + step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = cur - step;
    else if (e.key === "PageUp") next = cur + 0.1;
    else if (e.key === "PageDown") next = cur - 0.1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 1;
    else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(i);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    const at = stripPlace(next);
    if (at !== cur) setMark(i, { at });
  };
  const onDown = (i: number) => (e: PointerEvent) => {
    if (readOnly || e.button > 0) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // a synthetic event without an active pointer
    }
    el.focus();
    setActive(i);
    setDrag({ i, at: work.marks[i].at, moved: false, x: e.clientX });
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const moved = drag.moved || Math.abs(e.clientX - drag.x) > 3;
    if (moved) setDrag({ ...drag, moved, at: atX(e.clientX) });
  };
  const onUp = () => {
    if (!drag) return;
    const done = drag;
    setDrag(null);
    if (done.moved && done.at !== work.marks[done.i]?.at) setMark(done.i, { at: done.at });
  };

  // --- what a screen reader hears about a mark: where it is, between which pairs
  const pairText = (top: string, bottom: string) =>
    [top, d.topLabel].filter(Boolean).join(" ") + " / " + [bottom, d.bottomLabel].filter(Boolean).join(" ");
  const placeText = (i: number) => {
    const at = marks[i].at;
    const others = [
      ...d.given.map((g) => ({ at: g.at, text: pairText(fmt(g.top), fmt(g.bottom)) })),
      ...marks.map((m, k) => ({ at: m.at, text: pairText(m.top.trim() || "?", m.bottom.trim() || "?"), k })).filter((m) => m.k !== i),
    ];
    const left = others.filter((o) => o.at <= at).sort((a, b) => b.at - a.at)[0];
    const right = others.filter((o) => o.at > at).sort((a, b) => a.at - b.at)[0];
    return t.doublePlace(Math.round(at * 100), left?.text ?? t.doubleLeftEnd, right?.text ?? t.doubleRightEnd);
  };

  const invalid = [work.answer, ...work.marks.flatMap((m) => [m.top, m.bottom])].some((v) => v.trim() !== "" && parseAmount(v) === null);
  const answerInvalid = work.answer.trim() !== "" && parseAmount(work.answer) === null;

  const box = (props: { testid: string; label: string; value: string; onInput?: (v: string) => void; x: number; y: number; locked?: boolean; given?: boolean; onFocus?: () => void }) => {
    const bad = props.value.trim() !== "" && parseAmount(props.value) === null;
    return (
      <input type="text" inputMode="text" autoComplete="off" spellcheck={false} value={props.value} readOnly={readOnly || props.locked}
        tabIndex={props.locked ? -1 : undefined} aria-label={props.label} aria-invalid={bad ? "true" : undefined} data-testid={props.testid} onFocus={props.onFocus}
        style={{ left: `${props.x - BOX_W / 2}px`, top: `${props.y}px`, width: `${BOX_W}px`, height: `${BOX}px` }}
        class={`absolute rounded-md border px-1 text-center text-[15px] font-semibold tabular-nums shadow-sm focus-visible:outline-2 focus-visible:outline-amber-500 ${
          props.locked || props.given ? "border-slate-300 bg-slate-100 text-slate-800" : bad ? "border-2 border-red-700 bg-white text-slate-900" : "border-slate-400 bg-white text-slate-900"
        }`}
        onBeforeInput={(e: InputEvent) => { if (e.data && !allowed.test(e.data)) e.preventDefault(); }}
        onInput={(e) => props.onInput?.((e.target as HTMLInputElement).value)} />
    );
  };

  /** A mark through the strip (or across the line), with a thin lead to its boxes when they are a row further out. */
  const stroke = (x: number, row: number, kind: "given" | "mark", testid: string) => (
    <g data-testid={testid} data-kind={kind}>
      {row > 0 && (
        <>
          <line x1={x} y1={topY(row) + BOX} x2={x} y2={top - REACH} stroke="#94a3b8" stroke-width={1} stroke-dasharray="2 3" />
          <line x1={x} y1={bottom + REACH} x2={x} y2={bottomY(row)} stroke="#94a3b8" stroke-width={1} stroke-dasharray="2 3" />
        </>
      )}
      <line x1={x} y1={top - REACH} x2={x} y2={bottom + REACH} stroke={kind === "given" ? INK : MARK} stroke-width={kind === "given" ? 3 : 2.5} stroke-linecap="round" />
      {/* the candidate's own marks have a knob: they can be moved, the given ones cannot */}
      {kind === "mark" && <circle cx={x} cy={(top + bottom) / 2} r={5.5} fill="#fff" stroke={MARK} stroke-width={2.5} />}
    </g>
  );

  const button =
    "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-amber-500";
  const chosen = active !== null && active < work.marks.length ? active : work.marks.length - 1;

  return (
    <div ref={rootRef} class="flex max-w-full flex-col gap-3" role="group" aria-label={view.label} data-testid="double-line" data-look={d.look}>
      <div class="max-w-full overflow-x-auto">
        <div ref={areaRef} class="relative" style={{ width: `${width}px`, height: `${height}px` }}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} class="pointer-events-none absolute inset-0 block select-none overflow-visible" aria-hidden="true">
            {strip ? (
              <>
                <defs>
                  <pattern id={`hatch-${uid}`} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1={0} y1={0} x2={0} y2={8} stroke="#5b8fb9" stroke-width={1.5} />
                  </pattern>
                </defs>
                <rect x={x0} y={top} width={x1 - x0} height={BAR} fill="#fff" />
                {shadeAt !== null && shadeAt > 0 && (
                  <g data-testid="double-shade">
                    <rect x={x0} y={top} width={xAt(shadeAt) - x0} height={BAR} fill={SHADE} />
                    <rect x={x0} y={top} width={xAt(shadeAt) - x0} height={BAR} fill={`url(#hatch-${uid})`} opacity={0.55} />
                  </g>
                )}
                <rect x={x0} y={top} width={x1 - x0} height={BAR} fill="none" stroke={INK} stroke-width={2} rx={2} />
              </>
            ) : (
              <line x1={x0 - 16} y1={top} x2={x1 + 16} y2={top} stroke={INK} stroke-width={2.5} stroke-linecap="round" />
            )}
            {d.given.map((g, i) => stroke(xAt(g.at), rowOf(i, true), "given", `double-given-mark-${i}`))}
            {marks.map((m, i) => stroke(xAt(m.at), rowOf(i, false), m.given ? "given" : "mark", `double-mark-${i}`))}
          </svg>

          {/* the scales' names, at the left */}
          {d.topLabel && (
            <span class="absolute flex items-center text-[15px] font-semibold text-slate-700" style={{ left: "0px", top: `${topY(0)}px`, height: `${BOX}px`, width: `${gutter - 6}px` }}
              data-testid="double-top-label">{d.topLabel}</span>
          )}
          {d.bottomLabel && (
            <span class="absolute flex items-center text-[15px] font-semibold text-slate-700" style={{ left: "0px", top: `${bottomY(0)}px`, height: `${BOX}px`, width: `${gutter - 6}px` }}
              data-testid="double-bottom-label">{d.bottomLabel}</span>
          )}

          {/* a click on the strip adds a mark there (the keyboard has the button below) */}
          {!readOnly && (
            <div class="absolute cursor-crosshair" data-testid="double-hit" aria-hidden="true"
              style={{ left: `${x0}px`, top: `${top - REACH}px`, width: `${x1 - x0}px`, height: `${bottom - top + 2 * REACH}px` }}
              onClick={(e) => add(atX((e as MouseEvent).clientX))} />
          )}

          {/* the given pairs (locked: read, not a tab stop), above and below the strip */}
          {d.given.map((g, i) => (
            <>
              {box({ testid: `double-given-top-${i}`, label: t.doubleGivenTop(i + 1, d.topLabel), value: fmt(g.top), locked: true, x: xAt(g.at), y: topY(rowOf(i, true)) })}
              {box({ testid: `double-given-bottom-${i}`, label: t.doubleGivenBottom(i + 1, d.bottomLabel), value: fmt(g.bottom), locked: true, x: xAt(g.at), y: bottomY(rowOf(i, true)) })}
            </>
          ))}
          {/* the candidate's marks: a slider along the strip, then its numbers above and below (the order of the Tab key) */}
          {marks.map((m, i) => (
            <>
              <div role="slider" tabIndex={0} data-testid={`double-handle-${i}`}
                aria-label={t.doubleHandle(i + 1)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(m.at * 100)}
                aria-valuetext={placeText(i)} aria-orientation="horizontal" aria-readonly={readOnly ? "true" : undefined}
                class={`absolute rounded-md focus-visible:outline-2 focus-visible:outline-amber-500 ${readOnly ? "" : "cursor-ew-resize"}`}
                style={{ left: `${xAt(m.at) - 12}px`, top: `${top - REACH - 2}px`, width: "24px", height: `${bottom - top + 2 * REACH + 4}px`, touchAction: "none" }}
                onKeyDown={onKey(i)} onFocus={() => setActive(i)}
                onPointerDown={onDown(i)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)} />
              {box({
                testid: `double-top-${i}`, label: t.doubleTop(i + 1, d.topLabel), value: m.top, given: m.given, x: xAt(m.at), y: topY(rowOf(i, false)),
                onInput: (v) => setMark(i, { top: v }), onFocus: () => setActive(i),
              })}
              {box({
                testid: `double-bottom-${i}`, label: t.doubleBottom(i + 1, d.bottomLabel), value: m.bottom, given: m.given, x: xAt(m.at), y: bottomY(rowOf(i, false)),
                onInput: (v) => setMark(i, { bottom: v }), onFocus: () => setActive(i),
              })}
            </>
          ))}
        </div>
      </div>

      {!readOnly && (
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class={button} data-testid="double-add" disabled={work.marks.length >= MAX_DOUBLE_MARKS} onClick={addFree}>
            <span class="font-bold" style={{ color: MARK }} aria-hidden="true">|</span> {t.doubleAdd}
          </button>
          <button type="button" class={button} data-testid="double-remove" disabled={chosen < 0} onClick={() => remove(chosen)}>
            {t.doubleRemove(Math.max(1, chosen + 1))}
          </button>
          <span class="max-w-[60ch] text-xs text-slate-500">{t.doubleHint(strip)}</span>
        </div>
      )}

      <label class="flex items-center gap-2 text-[15px] font-semibold text-slate-800">
        {t.doubleAnswer}
        <input type="text" inputMode="text" autoComplete="off" spellcheck={false} value={work.answer} readOnly={readOnly} data-testid="double-answer"
          aria-invalid={answerInvalid ? "true" : undefined}
          class={`w-28 rounded-md border-2 bg-white px-2 py-1 text-center text-[15px] tabular-nums shadow-sm focus-visible:outline-2 focus-visible:outline-amber-500 ${
            answerInvalid ? "border-red-700" : "border-teal-700"
          }`}
          onBeforeInput={(e: InputEvent) => { if (e.data && !allowed.test(e.data)) e.preventDefault(); }}
          onInput={(e) => set({ answer: (e.target as HTMLInputElement).value })} />
      </label>
      {invalid && <p class="m-0 text-sm text-red-800" data-testid="invalid">⚠ {t.notANumber}</p>}

      <div class="flex flex-wrap items-center gap-3">
        {!readOnly && (
          <button type="button" class={button} disabled={!work.marks.length && !work.answer}
            onClick={() => { focusNext.current = "double-add"; setActive(null); setStatus(t.cleared); set({ marks: [], answer: "" }); }}>
            {t.clear}
          </button>
        )}
        <p role="status" aria-live="polite" class="m-0 min-h-5 text-sm text-slate-600" data-testid="double-status">{readOnly ? t.readOnly : status}</p>
      </div>
    </div>
  );
};
