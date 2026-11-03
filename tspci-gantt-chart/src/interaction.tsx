// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/ganttchart, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { Actions, StateModel } from "./store";
import { HeaderCell, Settings, Slot, Timeline, clean, runAt, runs, time } from "./gantt";
import { Texts } from "./texts";

// A grid: a row per task, a column per time slot. The selected slots of a row are drawn as bars. With the pointer:
// drag over empty slots to paint a bar, drag a bar to move it, drag its ends to resize it, click to switch one slot.
// With the keyboard (a roving tabindex, role="grid"): arrows move the cursor, Space switches a slot, Shift+arrows
// resize the bar under the cursor, Alt+arrows move it, Delete removes it. Everything snaps to the slots.

type Mode = "paint" | "move" | "start" | "end";
type Drag = { task: number; mode: Mode; origin: number; cur: number; base: number[]; run: [number, number] | null; moved: boolean };

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

/**
 * The slots of a bar moved by delta, snapped to the slots. It keeps its number of slots: unavailable slots (weekends)
 * are skipped, so a bar of five working days stays five working days; at the end of the timeline it stops.
 */
const moveRun = ([a, b]: [number, number], delta: number, slots: Slot[]) => {
  const n = slots.length;
  const length = b - a + 1;
  const free = (i: number) => i >= 0 && i < n && !slots[i].disabled;
  let start = Math.min(n - 1, Math.max(0, a + delta));
  while (start < n && !free(start)) start += delta < 0 ? -1 : 1;
  if (start < 0 || start >= n) return range(a, b);
  const placed: number[] = [];
  for (let i = start; i < n && placed.length < length; i++) if (free(i)) placed.push(i);
  for (let i = start - 1; i >= 0 && placed.length < length; i--) if (free(i)) placed.unshift(i); // against the end
  return placed;
};

/** The slots of a task while dragging from origin to cur, snapped to the slots. */
const apply = (mode: Mode, base: number[], run: [number, number] | null, origin: number, cur: number, slots: Slot[]) => {
  if (mode === "paint" || !run) return clean([...base, ...range(Math.min(origin, cur), Math.max(origin, cur))], slots);
  const [a, b] = run;
  const rest = base.filter((i) => i < a || i > b);
  if (mode === "move") return clean([...rest, ...moveRun(run, cur - origin, slots)], slots);
  if (mode === "start") return clean([...rest, ...range(Math.min(cur, b), b)], slots);
  return clean([...rest, ...range(a, Math.max(cur, a))], slots);
};

const Header = ({ cells, className, cellClass }: { cells: HeaderCell[]; className: string; cellClass?: string }) => (
  <tr className={className}>
    <th className="sticky left-0 z-20 border-r border-b border-slate-200 bg-slate-50" aria-hidden="true" />
    {cells.map((c, i) => (
      <th key={i} colSpan={c.span} scope="colgroup"
        className={`border-b border-r border-slate-200 px-1 py-1 text-center font-medium whitespace-nowrap ${c.disabled ? "gantt-off text-slate-400" : ""} ${cellClass ?? ""}`}>
        {c.label}
      </th>
    ))}
  </tr>
);

const Interaction = ({ prompt, settings, timeline, store, texts }: {
  prompt: string;
  settings: Settings;
  timeline: Timeline;
  store: IStore<StateModel, Actions>;
  texts: Texts;
}) => {
  const { selection } = useStore(store);
  const { slots } = timeline;
  const tasks = settings.tasks;
  const [cursor, setCursor] = useState({ task: 0, slot: 0 });
  const [preview, setPreview] = useState<{ task: number; slots: number[] } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const drag = useRef<Drag | null>(null);
  const tbody = useRef<HTMLTableSectionElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const focusCursor = useRef(false);

  const fmt = useMemo(() => new Intl.DateTimeFormat(texts.locale, { weekday: "short", day: "numeric", month: "short" }), [texts.locale]);
  const slotLabel = (i: number) => fmt.format(slots[i].date) + (settings.useHours ? " " + time(slots[i].date) : "");
  const describe = (sel: number[]) =>
    runs(sel).map(([a, b]) => (a === b ? slotLabel(a) : texts.range(slotLabel(a), slotLabel(b)))).join(", ") || texts.notPlanned;
  // a line between weeks (days) or between days (hours)
  const boundary = (i: number) =>
    i > 0 && (settings.useHours ? slots[i].date.getDate() !== slots[i - 1].date.getDate() : slots[i].date.getDay() === 1);

  const selected = (task: number) => (preview?.task === task ? preview.slots : selection[task] ?? []);

  const commit = (task: number, next: number[]) => {
    store.dispatch({ type: "SET_TASK", payload: { task, slots: next } });
    setAnnouncement(texts.planned(tasks[task].name, describe(next)));
  };

  const moveCursor = (task: number, slot: number) => {
    focusCursor.current = true;
    setCursor({ task: Math.max(0, Math.min(tasks.length - 1, task)), slot: Math.max(0, Math.min(slots.length - 1, slot)) });
  };

  useLayoutEffect(() => {
    if (!focusCursor.current) return;
    focusCursor.current = false;
    const cell = tbody.current?.querySelector<HTMLElement>(`[data-task="${cursor.task}"][data-slot="${cursor.slot}"]`);
    cell?.focus();
  }, [cursor]);

  // keep the cursor on the grid when the settings change
  useEffect(() => {
    if (cursor.task >= tasks.length || cursor.slot >= slots.length) setCursor({ task: 0, slot: 0 });
  }, [tasks.length, slots.length]);

  /** The slot under the pointer, by x, within the row of the drag (so a drag never leaves its task). */
  const slotAt = (task: number, x: number) => {
    const cells = tbody.current?.querySelectorAll<HTMLElement>(`[data-task="${task}"][data-slot]`);
    if (!cells?.length) return 0;
    for (let i = 0; i < cells.length; i++) {
      if (x < cells[i].getBoundingClientRect().right) return i;
    }
    return cells.length - 1;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const cell = target.closest<HTMLElement>("[data-slot]");
    if (!cell) return;
    const task = +cell.dataset.task;
    const slot = +cell.dataset.slot;
    e.preventDefault();
    cell.focus({ preventScroll: true });
    setCursor({ task, slot });
    if (slots[slot].disabled) return;
    const base = selection[task] ?? [];
    const run = runAt(base, slot) ?? null;
    const handle = target.closest<HTMLElement>("[data-handle]")?.dataset.handle as Mode | undefined;
    drag.current = { task, mode: handle ?? (run ? "move" : "paint"), origin: slot, cur: slot, base, run, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const cur = slotAt(d.task, e.clientX);
    if (cur !== d.cur) {
      d.cur = cur;
      d.moved = true;
      setPreview({ task: d.task, slots: apply(d.mode, d.base, d.run, d.origin, cur, slots) });
    }
    // scroll along at the edges
    const box = scroller.current?.getBoundingClientRect();
    if (box) {
      if (e.clientX > box.right - 24) scroller.current.scrollLeft += 12;
      else if (e.clientX < box.left + 180) scroller.current.scrollLeft -= 12;
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setPreview(null);
    if (!d.moved) {
      // a click switches the slot, like the original
      const on = d.base.includes(d.origin);
      commit(d.task, clean(on ? d.base.filter((i) => i !== d.origin) : [...d.base, d.origin], slots));
    } else {
      commit(d.task, apply(d.mode, d.base, d.run, d.origin, d.cur, slots));
      setCursor({ task: d.task, slot: d.cur });
    }
  };

  const onPointerCancel = () => {
    drag.current = null;
    setPreview(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!tasks.length || !slots.length) return;
    const { task, slot } = cursor;
    const sel = selection[task] ?? [];
    const run = runAt(sel, slot) ?? null;
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (dir && (e.altKey || e.ctrlKey || e.metaKey) && run) {
      const placed = moveRun(run, dir, slots);
      commit(task, clean([...sel.filter((i) => i < run[0] || i > run[1]), ...placed], slots));
      moveCursor(task, placed[Math.min(placed.length - 1, slot - run[0])]);
    } else if (dir === 1 && e.shiftKey) {
      if (run) {
        const j = range(run[1] + 1, slots.length - 1).find((i) => !slots[i].disabled);
        if (j !== undefined) {
          commit(task, clean([...sel, j], slots));
          moveCursor(task, j);
        }
      } else if (!slots[slot].disabled) {
        commit(task, clean([...sel, slot], slots));
      }
    } else if (dir === -1 && e.shiftKey) {
      if (run) {
        commit(task, sel.filter((i) => i !== run[1]));
        moveCursor(task, Math.max(run[0], run[1] - 1));
      }
    } else if (dir) {
      moveCursor(task, slot + dir);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      moveCursor(task + (e.key === "ArrowDown" ? 1 : -1), slot);
    } else if (e.key === "Home") {
      moveCursor(e.ctrlKey ? 0 : task, 0);
    } else if (e.key === "End") {
      moveCursor(e.ctrlKey ? tasks.length - 1 : task, slots.length - 1);
    } else if (e.key === " " || e.key === "Enter") {
      if (slots[slot].disabled) return;
      commit(task, clean(sel.includes(slot) ? sel.filter((i) => i !== slot) : [...sel, slot], slots));
    } else if ((e.key === "Delete" || e.key === "Backspace") && run) {
      commit(task, sel.filter((i) => i < run[0] || i > run[1]));
    } else {
      return;
    }
    e.preventDefault();
  };

  if (!tasks.length) {
    return <p className="m-0 font-sans text-sm text-slate-600">{texts.noTasks}</p>;
  }

  return (
    <div className="flex max-w-full flex-col gap-3 font-sans text-slate-800" data-testid="gantt">
      {prompt && <p className="m-0 text-[15px] text-slate-700">{prompt}</p>}
      <p id="gantt-hint" className="m-0 text-xs text-slate-500">{texts.hint}</p>
      <div ref={scroller}
        className="max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)]">
        <table role="grid" aria-label={prompt || texts.chart} aria-describedby="gantt-hint" onKeyDown={onKeyDown}
          className="border-separate border-spacing-0 text-sm tabular-nums select-none">
          <thead className="text-xs text-slate-600">
            {timeline.months && <Header cells={timeline.months} className="bg-slate-50" cellClass="font-semibold text-slate-700 text-left px-2" />}
            {timeline.days && <Header cells={timeline.days} className="bg-white" />}
            {timeline.weekDays && <Header cells={timeline.weekDays} className="bg-white" cellClass="font-normal" />}
            {timeline.times && <Header cells={timeline.times} className="bg-white" cellClass="font-normal text-[11px]" />}
          </thead>
          <tbody ref={tbody} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}>
            {tasks.map((t, ti) => {
              const sel = new Set(selected(ti));
              return (
                <tr key={ti} role="row" className="group">
                  <th scope="row" role="rowheader"
                    className="sticky left-0 z-20 min-w-36 border-r border-b border-slate-200 bg-white px-3 py-0 text-left font-medium whitespace-nowrap">
                    <span className="mr-2 inline-block h-3 w-3 rounded-sm align-[-1px]" style={{ backgroundColor: t.color }} aria-hidden="true" />
                    {t.name}
                  </th>
                  {slots.map((s, i) => {
                    const on = sel.has(i);
                    const first = on && !sel.has(i - 1);
                    const last = on && !sel.has(i + 1);
                    const isCursor = cursor.task === ti && cursor.slot === i;
                    return (
                      <td key={i} role="gridcell" data-task={ti} data-slot={i} data-selected={on}
                        tabIndex={isCursor ? 0 : -1} aria-selected={on} aria-disabled={s.disabled || undefined}
                        aria-label={`${t.name}, ${slotLabel(i)}${s.disabled ? `, ${texts.unavailable}` : ""}`}
                        className={`relative h-10 min-w-8 touch-pan-y border-b border-slate-200 p-0 outline-none focus-visible:z-10 focus-visible:shadow-[inset_0_0_0_2px_var(--color-sky-600)] ${boundary(i) ? "border-l border-l-slate-300" : ""} ${s.disabled ? "gantt-off cursor-not-allowed bg-slate-50" : on ? "cursor-grab" : "cursor-crosshair hover:bg-sky-50"}`}>
                        {on && (
                          <div aria-hidden="true"
                            className={`pointer-events-none absolute inset-y-1.5 ${first ? "left-[3px] rounded-l-md" : "-left-px"} ${last ? "right-[3px] rounded-r-md" : "-right-px"} shadow-sm`}
                            style={{ backgroundColor: t.color }} />
                        )}
                        {first && (
                          <div data-handle="start" aria-hidden="true" className="absolute inset-y-1.5 left-0 z-[1] w-2 cursor-ew-resize">
                            <span className="absolute inset-y-2 left-[5px] w-0.5 rounded bg-white/80 opacity-0 group-hover:opacity-100" />
                          </div>
                        )}
                        {last && (
                          <div data-handle="end" aria-hidden="true" className="absolute inset-y-1.5 right-0 z-[1] w-2 cursor-ew-resize">
                            <span className="absolute inset-y-2 right-[5px] w-0.5 rounded bg-white/80 opacity-0 group-hover:opacity-100" />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs text-slate-600" data-testid="summary">
        {tasks.map((t, ti) => (
          <li key={ti}>
            <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-[-1px]" style={{ backgroundColor: t.color }} aria-hidden="true" />
            {texts.planned(t.name, describe(selection[ti] ?? []))}
          </li>
        ))}
      </ul>
      <div className="sr-only" aria-live="polite">{announcement}</div>
    </div>
  );
};

export default Interaction;
