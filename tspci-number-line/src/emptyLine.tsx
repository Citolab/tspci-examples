import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { Answer, EmptyJump, EmptyWork, MAX_EMPTY_JUMPS, checkEmpty, emptyLayout, formatNumber, parseNumber } from "./numberline";
import type { View } from "./board";

// The empty number line (lege getallenlijn, data-mode="empty"): a line without ticks or numbers. The candidate clicks
// the line to make a jump (while the pointer is over the line, a faint jump shows that it can), chooses forward (+) or
// back (−), writes above the arc how big the jump is and below the line where it lands, and writes the answer. The ×
// next to a jump takes it away. The line is not to scale (numberline.ts emptyLayout): a bigger jump is a wider arc.
// Everything is a text box or a button, in the order a candidate writes it, so the whole line works with the keyboard:
// the line itself is a button that opens the choice.

const ADD = "#0072B2";
const SUBTRACT = "#B84700";
const INK = "#1e293b";
/** Height of a text box, and the room between the line and the boxes below it. */
const BOX = 30;
const GAP = 12;

const allowed = /^[0-9.,\-−+/ ¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]*$/;

/** How high an arc goes for a jump `dx` px wide. */
const arcHeight = (dx: number) => Math.min(120, Math.max(34, Math.abs(dx) * 0.42));

export const EmptyLine = ({ view, answer, onChange }: {
  view: View;
  answer: Answer;
  onChange: (next: Answer) => void;
}) => {
  const t = view.texts;
  const { task, readOnly } = view;
  const work = answer.empty;
  const givenStart = task.empty.givenStart && task.empty.start !== null;
  const rootRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(null);
  /** Where the pointer is over the line (px), for the faint jump; null when it is not. */
  const [hoverX, setHoverX] = useState<number | null>(null);
  /** The choice forward/back, open at x (px) on the line; null when closed. */
  const [menuX, setMenuX] = useState<number | null>(null);

  // after a jump is added (or removed), the focus goes to the box to write in next
  useLayoutEffect(() => {
    if (!focusNext.current) return;
    // right after the render (a layout effect), so nothing typed in between ends up in the wrong box; the box may not be there yet: a render for the closed choice can come before the one with the new jump, so the
    // focus waits until the box is there
    const target = rootRef.current?.querySelector<HTMLElement>(`[data-testid="${focusNext.current}"]`);
    if (!target) return;
    target.focus();
    focusNext.current = null;
  });

  const set = (next: Partial<EmptyWork>) => onChange({ ...answer, empty: { ...work, ...next } });
  const setJump = (i: number, change: Partial<EmptyJump>) => set({ jumps: work.jumps.map((j, k) => (k === i ? { ...j, ...change } : j)) });
  const addJump = (sign: "+" | "-") => {
    focusNext.current = `empty-size-${work.jumps.length}`;
    setMenuX(null);
    setHoverX(null);
    set({ jumps: [...work.jumps, { sign, size: "", landing: "" }] });
  };
  const removeJump = (i: number) => {
    focusNext.current = "empty-add";
    set({ jumps: work.jumps.filter((_, k) => k !== i) });
  };
  const closeMenu = (refocus: boolean) => {
    if (refocus) focusNext.current = "empty-add";
    setMenuX(null);
  };
  const full = work.jumps.length >= MAX_EMPTY_JUMPS;

  // the choice opens with the focus on its first button, and closes on a tap or click anywhere else (Safari on a tablet
  // does not move the focus away on a tap, so losing the focus is not enough)
  useEffect(() => {
    if (menuX === null) return;
    rootRef.current?.querySelector<HTMLElement>("[data-testid=empty-forward]")?.focus();
    const outside = (e: PointerEvent) => {
      const menu = rootRef.current?.querySelector("[data-testid=empty-menu]");
      if (menu && !e.composedPath().includes(menu)) setMenuX(null);
    };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, [menuX !== null]);

  const layout = emptyLayout(task, work, Math.max(480, view.length));
  const xs = layout.x;
  const arcs = work.jumps.map((j, i) => {
    const x1 = xs[i], x2 = xs[i + 1];
    const forward = j.sign !== "-";
    // a jump back and forth over the same stretch: the later arc goes a bit higher, so both stay readable
    const same = work.jumps.slice(0, i).filter((_, k) => Math.min(xs[k], xs[k + 1]) === Math.min(x1, x2) && Math.max(xs[k], xs[k + 1]) === Math.max(x1, x2)).length;
    return { x1, x2, h: arcHeight(x2 - x1) + same * 40, forward, color: forward ? ADD : SUBTRACT };
  });
  const top = Math.max(60, ...arcs.map((a) => a.h)) + BOX + 18;
  const lineY = top;
  // the boxes below the line: a number that comes back (a jump back to where you were) gets a row lower
  const rows: number[] = [];
  const seen = new Map<number, number>();
  xs.forEach((x, i) => {
    const row = seen.get(x) ?? 0;
    rows[i] = row;
    seen.set(x, row + 1);
  });
  const height = lineY + GAP + (Math.max(...rows) + 1) * (BOX + 6) + 4;
  const width = layout.width;
  /** Where the line ends now: the last landing, or the start. A new jump goes from there. */
  const endX = xs[xs.length - 1];
  const ghost = !readOnly && !full && menuX === null && hoverX !== null ? { x: hoverX, h: arcHeight(hoverX - endX) } : null;

  const check = checkEmpty(task, work);
  const invalid = [work.start, work.answer, ...work.jumps.flatMap((j) => [j.size, j.landing])].some((v) => v.trim() !== "" && parseNumber(v) === null);

  const box = (props: { testid: string; label: string; value: string; onInput: (v: string) => void; x: number; y: number; w?: number; locked?: boolean; color?: string }) => {
    const bad = props.value.trim() !== "" && parseNumber(props.value) === null;
    const w = props.w ?? 76;
    return (
      <input type="text" inputMode="text" autoComplete="off" spellcheck={false} value={props.value} readOnly={readOnly || props.locked}
        aria-label={props.label} aria-invalid={bad ? "true" : undefined} data-testid={props.testid}
        style={{ left: `${props.x - w / 2}px`, top: `${props.y}px`, width: `${w}px`, height: `${BOX}px`, color: props.color }}
        class={`absolute rounded-md border bg-white px-1 text-center text-[15px] font-semibold tabular-nums shadow-sm focus-visible:outline-2 focus-visible:outline-amber-500 ${
          props.locked ? "border-slate-300 bg-slate-100 text-slate-700" : bad ? "border-2 border-red-700" : "border-slate-400 text-slate-900"
        }`}
        onBeforeInput={(e: InputEvent) => { if (e.data && !allowed.test(e.data)) e.preventDefault(); }}
        onInput={(e) => props.onInput((e.target as HTMLInputElement).value)} />
    );
  };

  const button =
    "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-amber-500";
  const choice =
    "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-amber-500";
  const startText = givenStart ? formatNumber(task.empty.start as number, "decimal", view.language) : work.start;

  return (
    <div ref={rootRef} class="flex max-w-full flex-col gap-3" role="group" aria-label={view.label} data-testid="empty-line">
      <div class="max-w-full overflow-x-auto">
        <div class="relative" style={{ width: `${width}px`, height: `${height}px` }}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} class="absolute inset-0 block select-none overflow-visible" aria-hidden="true">
            <line x1={12} y1={lineY} x2={width - 12} y2={lineY} stroke={INK} stroke-width={2.5} stroke-linecap="round" />
            {xs.map((x) => <line x1={x} y1={lineY - 7} x2={x} y2={lineY + 7} stroke={INK} stroke-width={2} />)}
            {arcs.map((a, i) => {
              const dx = a.x2 - a.x1;
              const c = 1.33 * a.h; // a cubic with these control points peaks at height h
              const d = `M ${a.x1} ${lineY} C ${a.x1 + dx * 0.12} ${lineY - c}, ${a.x2 - dx * 0.12} ${lineY - c}, ${a.x2} ${lineY}`;
              // the arrowhead along the end of the curve
              const ux = dx * 0.12, uy = c;
              const len = Math.hypot(ux, uy) || 1;
              const [ex, ey] = [ux / len, uy / len];
              const tip: [number, number] = [a.x2, lineY - 1];
              const back: [number, number] = [tip[0] - ex * 11, tip[1] - ey * 11];
              const side: [number, number] = [-ey * 5.5, ex * 5.5];
              return (
                <g data-testid={`empty-arc-${i}`} data-direction={a.forward ? "forward" : "back"}>
                  <path d={d} fill="none" stroke={a.color} stroke-width={2.5} stroke-dasharray={a.forward ? undefined : "7 5"} />
                  <polygon fill={a.color} points={`${tip[0]},${tip[1]} ${back[0] + side[0]},${back[1] + side[1]} ${back[0] - side[0]},${back[1] - side[1]}`} />
                </g>
              );
            })}
            {/* the pointer over the line: a faint jump from where you are to the pointer, and what a click does */}
            {ghost && (
              <g data-testid="empty-ghost" pointer-events="none">
                {Math.abs(ghost.x - endX) > 16 && (
                  <path d={`M ${endX} ${lineY} C ${endX + (ghost.x - endX) * 0.12} ${lineY - 1.33 * ghost.h}, ${ghost.x - (ghost.x - endX) * 0.12} ${lineY - 1.33 * ghost.h}, ${ghost.x} ${lineY}`}
                    fill="none" stroke="#94a3b8" stroke-width={2} stroke-dasharray="4 4" />
                )}
                <circle cx={ghost.x} cy={lineY} r={6} fill="white" stroke="#64748b" stroke-width={2} />
                <text x={ghost.x} y={lineY - 30} text-anchor="middle" font-size={12} fill="#475569">{t.emptyClickHint}</text>
              </g>
            )}
          </svg>

          {/* in the order a candidate writes: the start, then per jump its sign, how big it is (above the arc), the × that takes
              it away, and where it lands (below the line); then the line itself, to make the next jump */}
          {box({
            testid: "empty-start", label: t.emptyStartName, value: startText, locked: givenStart, x: xs[0], y: lineY + GAP + rows[0] * (BOX + 6),
            onInput: (v) => set({ start: v }),
          })}
          {arcs.map((a, i) => {
            const j = work.jumps[i];
            const mid = (a.x1 + a.x2) / 2;
            const y = lineY - a.h - BOX - 4;
            return (
              <>
                <div class="absolute flex items-center gap-1" style={{ left: `${mid - 56}px`, top: `${y}px`, width: readOnly ? "108px" : "140px" }}>
                  <button type="button" disabled={readOnly} data-testid={`empty-sign-${i}`}
                    aria-label={t.emptySign(i + 1, j.sign)} title={readOnly ? undefined : t.emptyTurn}
                    class="h-[30px] w-7 shrink-0 rounded-md text-lg font-bold leading-none hover:bg-slate-100 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-amber-500"
                    style={{ color: a.color }}
                    onClick={() => setJump(i, { sign: j.sign === "-" ? "+" : "-" })}>
                    {j.sign === "-" ? "−" : "+"}
                  </button>
                  <div class="relative h-[30px] w-[76px] shrink-0">
                    {box({ testid: `empty-size-${i}`, label: t.emptySize(i + 1), value: j.size, onInput: (v) => setJump(i, { size: v }), x: 38, y: 0, w: 76, color: a.color })}
                  </div>
                  {!readOnly && (
                    <button type="button" data-testid={`empty-remove-${i}`} aria-label={t.emptyRemove(i + 1)} title={t.emptyRemove(i + 1)}
                      class="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full text-lg leading-none text-slate-500 opacity-60 hover:bg-red-50 hover:text-red-700 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-amber-500"
                      onClick={() => removeJump(i)}>
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
                </div>
                {box({
                  testid: `empty-landing-${i}`, label: t.emptyLanding(i + 1), value: j.landing, x: xs[i + 1], y: lineY + GAP + rows[i + 1] * (BOX + 6),
                  onInput: (v) => setJump(i, { landing: v }),
                })}
              </>
            );
          })}

          {/* the line: a click (or Enter) opens the choice forward or back; the pointer over it shows the faint jump */}
          {!readOnly && (
            <button type="button" data-testid="empty-add" aria-label={t.emptyAddJump} aria-haspopup="true" aria-expanded={menuX !== null}
              aria-disabled={full ? "true" : undefined} title={full ? t.noMoreJumps : undefined}
              class={`absolute rounded-md bg-transparent focus-visible:outline-2 focus-visible:outline-amber-500 ${full ? "cursor-not-allowed" : "cursor-pointer"}`}
              style={{ left: "0px", top: `${lineY - 22}px`, width: `${width}px`, height: "32px" }}
              onPointerMove={(e) => setHoverX(Math.min(width - 12, Math.max(12, (e as PointerEvent).offsetX)))}
              onPointerLeave={() => setHoverX(null)}
              onClick={(e) => {
                if (full) return;
                // a click with the pointer opens where it is; Enter or Space (detail 0) at the end of the line
                setMenuX((e as MouseEvent).detail ? Math.min(width - 12, Math.max(12, (e as MouseEvent).offsetX)) : endX);
              }} />
          )}
          {menuX !== null && (
            <div role="group" aria-label={t.emptyChoose} data-testid="empty-menu"
              class="absolute z-10 flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1 shadow-lg"
              style={{ left: `${Math.min(Math.max(menuX - 130, 0), Math.max(width - 260, 0))}px`, top: `${lineY - 54}px` }}
              onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); closeMenu(true); } }}
              onFocusOut={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) closeMenu(false); }}>
              <button type="button" class={choice} data-testid="empty-forward" onClick={() => addJump("+")}>
                <span class="text-lg font-bold leading-none" style={{ color: ADD }} aria-hidden="true">+</span> {t.emptyForward}
              </button>
              <button type="button" class={choice} data-testid="empty-back" onClick={() => addJump("-")}>
                <span class="text-lg font-bold leading-none" style={{ color: SUBTRACT }} aria-hidden="true">−</span> {t.emptyBack}
              </button>
            </div>
          )}
        </div>
      </div>

      {!readOnly && <p class="m-0 max-w-[70ch] text-xs text-slate-500">{full ? t.noMoreJumps : t.emptyHint}</p>}

      <label class="flex items-center gap-2 text-[15px] font-semibold text-slate-800">
        {t.emptyAnswer}
        <input type="text" inputMode="text" autoComplete="off" spellcheck={false} value={work.answer} readOnly={readOnly} data-testid="empty-answer"
          aria-invalid={work.answer.trim() !== "" && check.answer === null ? "true" : undefined}
          class={`w-28 rounded-md border bg-white px-2 py-1 text-center text-[15px] tabular-nums shadow-sm focus-visible:outline-2 focus-visible:outline-amber-500 ${
            work.answer.trim() !== "" && check.answer === null ? "border-2 border-red-700" : "border-2 border-teal-700"
          }`}
          onBeforeInput={(e: InputEvent) => { if (e.data && !allowed.test(e.data)) e.preventDefault(); }}
          onInput={(e) => set({ answer: (e.target as HTMLInputElement).value })} />
      </label>
      {invalid && <p class="m-0 text-sm text-red-800" data-testid="invalid">⚠ {t.notANumber}</p>}

      <div class="flex flex-wrap items-center gap-3">
        {!readOnly && (
          <button type="button" class={button} disabled={!work.jumps.length && !work.answer && !(work.start && !givenStart)}
            onClick={() => { focusNext.current = "empty-add"; set({ start: givenStart ? work.start : "", jumps: [], answer: "" }); }}>
            {t.clear}
          </button>
        )}
        {readOnly && <p class="m-0 text-sm text-slate-600">{t.readOnly}</p>}
      </div>
    </div>
  );
};
