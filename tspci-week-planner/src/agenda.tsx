import { useMemo, useRef, useState } from "preact/hooks";
import {
  Conflict, Day, DAY_CODES, Placement, Planner, Task, cannotPlace, clock, conflicts as findConflicts, fixedIn, place, placementOf,
  remove, resize, slotStarts, taskOf,
} from "./planner";
import { Texts } from "./texts";

// The agenda with the task cards and the tools: used by the candidate (interaction.tsx) and the author (authoring.tsx,
// the example solution). Days are column groups, with a column per resource; time runs down in rows of `slot` minutes.
// A task is dragged from its card, or picked (click or Enter) and placed with a click or the arrow keys and Enter.

const ROW = 26; // px per row
const CONFLICT = "#D55E00"; // Okabe-Ito vermillion: apart from the blue of the tasks for every colour vision

type Drag = { kind: "card"; task: string } | { kind: "move"; task: string; grab: number } | { kind: "resize"; task: string };
type Pending = { drag: Drag; startX: number; startY: number; moved: boolean; x: number; y: number };
type Cell = { c: number; r: number };

const tool =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-xs " +
  "hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 disabled:opacity-40 disabled:hover:bg-white";

const closedPattern = "repeating-linear-gradient(135deg, #f1f5f9 0 5px, #e2e8f0 5px 7px)";
const fixedPattern = "repeating-linear-gradient(45deg, #e2e8f0 0 6px, #cbd5e1 6px 8px)";
const conflictPattern = `repeating-linear-gradient(-45deg, color-mix(in oklab, ${CONFLICT} 22%, transparent) 0 4px, transparent 4px 9px)`;

const Agenda = ({ planner: p, placements, onChange, texts: t, feedback = true, readOnly = false, label, testid = "agenda" }: {
  planner: Planner;
  placements: Placement[];
  onChange: (placements: Placement[]) => void;
  texts: Texts;
  /** live feedback: overlaps and tasks outside opening hours */
  feedback?: boolean;
  readOnly?: boolean;
  label?: string;
  testid?: string;
}) => {
  const columns = useMemo(() => p.days.flatMap((day) => p.resources.map((r) => ({ day, resource: r.id }))), [p]);
  const rows = useMemo(() => slotStarts(p), [p]);
  const R = p.resources.length;
  const headerRows = R > 1 ? 2 : 1;
  const [cursor, setCursor] = useState<Cell>({ c: 0, r: Math.max(0, rows.findIndex((s) => s >= p.open.start)) });
  const [picked, setPicked] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const history = useRef<Placement[][]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const current = useRef(placements);
  current.current = placements;
  const suppressClick = useRef(false);

  const conflicts: Record<string, Conflict> = useMemo(() => (feedback ? findConflicts(p, placements) : {}), [p, placements, feedback]);
  const hasConflict = (task: string) => !!conflicts[task] && (conflicts[task].overlaps.length > 0 || conflicts[task].outside);

  // --- names

  const dayName = (d: Day) => t.days[DAY_CODES.indexOf(d)];
  const dayShort = (d: Day) => t.daysShort[DAY_CODES.indexOf(d)];
  const resourceName = (id: string) => p.resources.find((r) => r.id === id)?.name ?? id;
  const taskName = (id: string) => taskOf(p, id)?.label ?? id;
  const itemName = (id: string) => taskOf(p, id)?.label ?? p.fixed.find((f) => f.id === id)?.label ?? id;
  const when = (x: Placement, short = false) =>
    `${short ? dayShort(x.day) : dayName(x.day)} ${clock(x.start)}–${clock(x.end)}${R > 1 ? `, ${resourceName(x.resource)}` : ""}`;
  const conflictText = (task: string) => {
    const c = conflicts[task];
    if (!c) return [];
    return [...(c.overlaps.length ? [t.overlaps(c.overlaps.map(itemName))] : []), ...(c.outside ? [t.outside] : [])];
  };
  const rowOf = (minutes: number) => Math.round((minutes - p.start) / p.slot);
  const columnOf = (x: { day: Day; resource: string }) => p.days.indexOf(x.day) * R + p.resources.findIndex((r) => r.id === x.resource);

  // --- changes

  const commit = (next: Placement[] | null, message: string) => {
    if (!next) return false;
    history.current.push(current.current);
    if (history.current.length > 200) history.current.shift();
    onChange(next);
    setStatus(message);
    return true;
  };
  const withConflicts = (next: Placement[], task: string) => {
    if (!feedback) return "";
    const c = findConflicts(p, next)[task];
    const parts = c ? [...(c.overlaps.length ? [t.overlaps(c.overlaps.map(itemName))] : []), ...(c.outside ? [t.outside] : [])] : [];
    return parts.length ? ` ${parts.join(". ")}.` : "";
  };
  const placeAt = (taskId: string, c: number, r: number) => {
    if (readOnly) return;
    const task = taskOf(p, taskId);
    const col = columns[c];
    if (!task || !col) return;
    if (cannotPlace(p, task, col.resource, col.day) === "resource") return setStatus(t.onlyForStatus(task.label, resourceName(task.resource)));
    const next = place(p, current.current, taskId, col.resource, col.day, p.start + r * p.slot);
    if (!next) return;
    const x = placementOf(next, taskId)!;
    commit(next, t.placed(task.label, when(x)) + withConflicts(next, taskId));
    setPicked(null);
    setCursor({ c, r: rowOf(x.start) });
  };
  const resizeTo = (taskId: string, end: number) => {
    if (readOnly) return;
    const next = resize(p, current.current, taskId, end);
    if (next) commit(next, t.resized(taskName(taskId), when(placementOf(next, taskId)!)) + withConflicts(next, taskId));
  };
  const removeTask = (taskId: string) => {
    if (readOnly || !placementOf(current.current, taskId)) return;
    commit(remove(current.current, taskId), t.removed(taskName(taskId)));
    if (picked === taskId) setPicked(null);
  };
  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    onChange(previous);
    setStatus(t.undone);
  };
  const clear = () => commit([], t.cleared);

  /** Picks a card: the cursor goes to where the task is, or to the first column it may go in. */
  const pick = (taskId: string | null, focus = true) => {
    setPicked(taskId);
    if (!taskId) return setStatus(t.dropped);
    const task = taskOf(p, taskId)!;
    setStatus(t.picked(task.label));
    const at = placementOf(current.current, taskId);
    if (at) setCursor({ c: columnOf(at), r: rowOf(at.start) });
    else if (task.resource && columns[cursor.c]?.resource !== task.resource) {
      const c = columns.findIndex((col) => col.resource === task.resource);
      if (c >= 0) setCursor({ ...cursor, c });
    }
    if (focus) gridRef.current?.focus();
  };

  // --- what is where

  /** The tasks in a cell, the one on top last. */
  const tasksIn = (c: number, r: number) => {
    const col = columns[c], s = rows[r];
    return placements.filter((x) => x.day === col.day && x.resource === col.resource && x.start < s + p.slot && x.end > s);
  };
  const fixedInCell = (c: number, r: number) => {
    const col = columns[c], s = rows[r];
    return fixedIn(p, col.resource, col.day).filter((f) => f.start < s + p.slot && f.end > s);
  };
  const isClosed = (r: number) => rows[r] < p.open.start || rows[r] + p.slot > p.open.end;
  const selectedTask = (() => {
    const here = columns[cursor.c] && rows[cursor.r] !== undefined ? tasksIn(cursor.c, cursor.r) : [];
    return here.length ? here[here.length - 1].task : null;
  })();

  const cellLabel = (c: number, r: number) => {
    const col = columns[c];
    const where = t.cell(dayName(col.day), R > 1 ? resourceName(col.resource) : "", clock(rows[r]));
    const what = [
      ...tasksIn(c, r).map((x) => [`${taskName(x.task)} ${clock(x.start)}–${clock(x.end)}`, ...conflictText(x.task)].join(", ")),
      ...fixedInCell(c, r).map((f) => `${t.fixedBlock(f.label)} ${clock(f.start)}–${clock(f.end)}`),
    ];
    if (isClosed(r)) what.push(t.closed);
    return `${where}: ${what.length ? what.join("; ") : t.free}`;
  };

  // --- pointer

  const cellFromPoint = (x: number, y: number): Cell | null => {
    const first = gridRef.current?.querySelector(`[data-cell="0-0"]`);
    if (!first) return null;
    const rect = first.getBoundingClientRect();
    const c = Math.floor((x - rect.left) / rect.width), r = Math.floor((y - rect.top) / rect.height);
    return c >= 0 && r >= 0 && c < columns.length && r < rows.length ? { c, r } : null;
  };
  const endFromPoint = (y: number) => {
    const first = gridRef.current?.querySelector(`[data-cell="0-0"]`);
    if (!first) return null;
    const rect = first.getBoundingClientRect();
    return p.start + Math.round((y - rect.top) / rect.height) * p.slot;
  };
  /** Where a drag would put the task (for the drop and the preview). */
  const target = (drag: Drag, x: number, y: number): Cell | null => {
    const cell = cellFromPoint(x, y);
    if (!cell || drag.kind === "resize") return cell;
    return drag.kind === "move" ? { c: cell.c, r: Math.max(0, cell.r - drag.grab) } : cell;
  };
  const drop = useRef<(state: Pending) => void>();
  drop.current = ({ drag, x, y }) => {
    if (drag.kind === "resize") {
      const end = endFromPoint(y);
      if (end !== null) resizeTo(drag.task, end);
      return;
    }
    const cell = target(drag, x, y);
    if (cell) placeAt(drag.task, cell.c, cell.r);
    else if (drag.kind === "move") removeTask(drag.task); // dragged out of the agenda
  };
  const click = useRef<(state: Pending) => void>();
  click.current = ({ drag, x, y }) => {
    if (drag.kind === "card") return; // the card's own click
    const cell = cellFromPoint(x, y);
    if (!cell) return;
    if (picked && picked !== drag.task) return placeAt(picked, cell.c, cell.r);
    setCursor(cell);
    gridRef.current?.focus();
  };
  /** Listens on the window right away (not in an effect, which could come after a quick pointerup). */
  const startDrag = (e: PointerEvent, drag: Drag) => {
    if (readOnly || e.button > 0) return;
    e.stopPropagation();
    if (drag.kind !== "card") e.preventDefault(); // no text selection, and the grid keeps the focus
    let state: Pending = { drag, startX: e.clientX, startY: e.clientY, moved: false, x: e.clientX, y: e.clientY };
    const onMove = (ev: PointerEvent) => {
      const moved = state.moved || Math.hypot(ev.clientX - state.startX, ev.clientY - state.startY) > 5;
      state = { ...state, moved, x: ev.clientX, y: ev.clientY };
      if (moved) setPending(state);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setPending(null);
      if (ev.type === "pointercancel") return;
      state = { ...state, x: ev.clientX, y: ev.clientY };
      if (!state.moved) return click.current(state);
      drop.current(state);
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const clickCell = (c: number, r: number) => {
    if (suppressClick.current) return;
    if (picked && !readOnly) return placeAt(picked, c, r);
    setCursor({ c, r });
    gridRef.current?.focus();
  };

  // --- keyboard

  const onKeyDown = (e: KeyboardEvent) => {
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const key = e.key;
    if (steps[key]) {
      e.preventDefault();
      if (e.shiftKey && !picked && selectedTask && steps[key][1] !== 0) {
        const x = placementOf(placements, selectedTask)!;
        return resizeTo(selectedTask, x.end + steps[key][1] * p.slot);
      }
      setCursor({
        c: Math.min(columns.length - 1, Math.max(0, cursor.c + steps[key][0])),
        r: Math.min(rows.length - 1, Math.max(0, cursor.r + steps[key][1])),
      });
    } else if (key === "Enter" || key === " ") {
      e.preventDefault();
      if (readOnly) return;
      if (picked) placeAt(picked, cursor.c, cursor.r);
      else if (selectedTask) {
        const x = placementOf(placements, selectedTask)!;
        setCursor({ c: cursor.c, r: rowOf(x.start) });
        setPicked(selectedTask);
        setStatus(t.picked(taskName(selectedTask)));
      }
    } else if (key === "Delete" || key === "Backspace") {
      e.preventDefault();
      const task = picked && placementOf(placements, picked) ? picked : selectedTask;
      if (task) removeTask(task);
    } else if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    } else if (key === "Escape" && picked) {
      e.preventDefault();
      pick(null, false);
    }
  };

  // --- what the agenda shows

  const dragging = pending?.moved ? pending : null;
  /** The preview of where a picked or dragged task would go. */
  const preview: Placement | null = (() => {
    if (readOnly) return null;
    let taskId: string | null = null, cell: Cell | null = null;
    if (dragging && dragging.drag.kind !== "resize") {
      taskId = dragging.drag.task;
      cell = target(dragging.drag, dragging.x, dragging.y);
    } else if (dragging?.drag.kind === "resize") {
      const end = endFromPoint(dragging.y);
      const next = end !== null ? resize(p, placements, dragging.drag.task, end) : null;
      return next ? placementOf(next, dragging.drag.task)! : null;
    } else if (picked) {
      taskId = picked;
      cell = cursor;
    }
    if (!taskId || !cell) return null;
    const col = columns[cell.c];
    const next = col ? place(p, placements, taskId, col.resource, col.day, p.start + cell.r * p.slot) : null;
    return next ? placementOf(next, taskId)! : null;
  })();
  const moving = dragging && dragging.drag.kind !== "card" ? dragging.drag.task : picked;

  /** Side by side when tasks in a column overlap. */
  const lanes = (x: Placement) => {
    const same = placements.filter((y) => y.day === x.day && y.resource === x.resource && y.start < x.end && x.start < y.end);
    return { lane: same.indexOf(x), lanes: same.length };
  };
  const cellId = (c: number, r: number) => `${testid}-cell-${c}-${r}`;
  const gridRow = (start: number, end: number) => `${headerRows + 1 + rowOf(start)} / ${headerRows + 1 + rowOf(end)}`;

  const card = (task: Task) => {
    const at = placementOf(placements, task.id);
    const length = task.min === task.max ? t.duration(task.duration) : t.between(t.duration(task.min), t.duration(task.max));
    const name = [task.label, length, task.resource ? t.onlyFor(resourceName(task.resource)) : "", at ? t.plannedAt(when(at)) : t.notPlanned]
      .filter(Boolean).join(", ");
    return (
      <li key={task.id}>
        <button type="button" data-testid={`card-${task.id}`} aria-pressed={picked === task.id} disabled={readOnly} aria-label={name}
          aria-describedby={task.notes ? `${testid}-notes-${task.id}` : undefined}
          className={"flex w-full touch-none select-none flex-col items-start gap-0.5 rounded-lg border px-2.5 py-1.5 text-left text-xs " +
            "border-slate-200 bg-white text-slate-700 hover:border-sky-400 hover:bg-sky-50 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-white " +
            "aria-pressed:border-sky-600 aria-pressed:bg-sky-50 aria-pressed:ring-2 aria-pressed:ring-sky-200 focus-visible:outline-2 focus-visible:outline-sky-600 " +
            (readOnly ? "" : "cursor-grab ") + (at ? "border-l-4 border-l-sky-600" : "border-l-4 border-l-slate-300 border-dashed")}
          onPointerDown={(e) => startDrag(e, { kind: "card", task: task.id })}
          onClick={() => !suppressClick.current && pick(picked === task.id ? null : task.id)}>
          <span className="text-[13px] font-medium text-slate-900">{task.label}</span>
          <span className="flex flex-wrap gap-x-2 text-slate-500">
            <span className="tabular-nums">{length}</span>
            {task.resource && <span>{t.onlyFor(resourceName(task.resource))}</span>}
          </span>
          {task.notes && <span id={`${testid}-notes-${task.id}`} className="text-slate-500 italic">{task.notes}</span>}
          <span className={`tabular-nums ${at ? "text-sky-800" : "text-slate-400"}`} data-testid={`card-${task.id}-at`}>
            {at ? <><span aria-hidden="true">✓ </span>{when(at, true)}</> : t.notPlanned}
          </span>
        </button>
      </li>
    );
  };

  const conflictList = feedback ? placements.filter((x) => hasConflict(x.task)) : [];

  return (
    <div className="flex flex-wrap items-start gap-4">
      <section aria-label={t.tasks} className="w-full sm:w-[230px]">
        <h3 className="m-0 mb-1.5 flex items-baseline justify-between text-xs font-semibold tracking-wide text-slate-500 uppercase">
          {t.tasks}
          <span className="font-normal normal-case tracking-normal" data-testid="planned-count">{t.allPlanned(placements.length, p.tasks.length)}</span>
        </h3>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0 sm:max-h-(--tray-h) sm:overflow-y-auto sm:pr-1"
          style={{ "--tray-h": `${Math.max(320, rows.length * ROW + 150)}px` }}>{p.tasks.map(card)}</ul>
      </section>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label={t.agenda}>
            <button type="button" className={tool} disabled={!selectedTask} onClick={() => selectedTask && removeTask(selectedTask)} data-testid="remove">
              <span aria-hidden="true">✕</span>{t.remove}
            </button>
            <button type="button" className={tool} disabled={!selectedTask || taskOf(p, selectedTask).min === taskOf(p, selectedTask).max} data-testid="shorter"
              onClick={() => selectedTask && resizeTo(selectedTask, placementOf(placements, selectedTask)!.end - p.slot)}>
              <span aria-hidden="true">−</span>{t.shorter}
            </button>
            <button type="button" className={tool} disabled={!selectedTask || taskOf(p, selectedTask).min === taskOf(p, selectedTask).max} data-testid="longer"
              onClick={() => selectedTask && resizeTo(selectedTask, placementOf(placements, selectedTask)!.end + p.slot)}>
              <span aria-hidden="true">+</span>{t.longer}
            </button>
            <button type="button" className={tool} onClick={undo} data-testid="undo"><span aria-hidden="true">↶</span>{t.undo}</button>
            <button type="button" className={tool} onClick={clear} data-testid="clear">{t.clear}</button>
            <button type="button" className={`${tool} ml-auto`} aria-expanded={helpOpen} aria-label={t.showHelp} title={t.showHelp}
              onClick={() => setHelpOpen(!helpOpen)} data-testid="help"><span aria-hidden="true">?</span></button>
          </div>
        )}
        {helpOpen && <p className="m-0 max-w-[70ch] rounded-lg bg-sky-50 p-2.5 text-xs text-sky-900">{t.help}</p>}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <div ref={gridRef} role="grid" tabIndex={0} aria-label={label ?? t.agenda} aria-activedescendant={cellId(cursor.c, cursor.r)} data-testid={testid}
            aria-readonly={readOnly ? "true" : undefined} aria-rowcount={rows.length + headerRows} aria-colcount={columns.length + 1}
            onKeyDown={onKeyDown}
            className="group relative grid select-none outline-none focus-visible:ring-2 focus-visible:ring-sky-200 focus-visible:ring-offset-2"
            style={{
              gridTemplateColumns: `46px repeat(${columns.length}, minmax(${R > 1 ? 56 : 84}px, 1fr))`,
              gridTemplateRows: `${R > 1 ? "auto auto" : "auto"} repeat(${rows.length}, ${ROW}px)`,
            }}>
            <div role="row" className="contents">
              <div role="columnheader" style={{ gridRow: 1, gridColumn: 1 }} className="sticky left-0 z-20 bg-white text-[11px] text-slate-400">
                <span className="sr-only">{t.time}</span>
              </div>
              {p.days.map((d, i) => (
                <div role="columnheader" key={d} aria-colspan={R} style={{ gridRow: 1, gridColumn: `${2 + i * R} / span ${R}` }}
                  className="border-l-2 border-slate-200 px-1 pb-1 text-center text-xs font-semibold text-slate-700">
                  <span aria-hidden="true">{dayShort(d)}</span><span className="sr-only">{dayName(d)}</span>
                </div>
              ))}
            </div>
            {R > 1 && (
              <div role="row" className="contents">
                <div role="columnheader" style={{ gridRow: 2, gridColumn: 1 }} className="sticky left-0 z-20 bg-white" />
                {columns.map((col, c) => (
                  <div role="columnheader" key={c} style={{ gridRow: 2, gridColumn: 2 + c }} title={resourceName(col.resource)}
                    className={`truncate px-1 pb-1 text-center text-[11px] text-slate-500 ${c % R === 0 ? "border-l-2 border-slate-200" : "border-l border-slate-100"}`}>
                    {resourceName(col.resource)}
                  </div>
                ))}
              </div>
            )}
            {rows.map((s, r) => {
              const hour = s % 60 === 0;
              return (
                <div role="row" key={s} className="contents">
                  <div role="rowheader" aria-label={clock(s)} style={{ gridRow: headerRows + 1 + r, gridColumn: 1 }}
                    className={`sticky left-0 z-20 bg-white pr-1.5 text-right text-[11px] leading-none tabular-nums text-slate-500 ${hour ? "border-t border-slate-200" : ""}`}>
                    <span aria-hidden="true" className="relative -top-1.5">{hour || p.slot >= 60 ? clock(s) : ""}</span>
                  </div>
                  {columns.map((col, c) => {
                    const isCursor = cursor.c === c && cursor.r === r;
                    return (
                      <div role="gridcell" id={cellId(c, r)} key={c} data-cell={`${c}-${r}`} data-testid={`cell-${col.day}-${col.resource}-${clock(s)}`}
                        aria-label={cellLabel(c, r)} aria-selected={isCursor} aria-readonly={readOnly ? "true" : undefined}
                        style={{ gridRow: headerRows + 1 + r, gridColumn: 2 + c, ...(isClosed(r) ? { backgroundImage: closedPattern } : {}) }}
                        className={"relative " + (c % R === 0 ? "border-l-2 border-l-slate-200 " : "border-l border-l-slate-100 ") +
                          (hour ? "border-t border-t-slate-200 " : "border-t border-t-slate-100 ") + (picked && !readOnly ? "cursor-copy" : "")}
                        onClick={() => clickCell(c, r)}>
                        {isCursor && <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 hidden rounded-sm ring-2 ring-sky-600 group-focus:block" />}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {p.fixed.filter((f) => p.days.includes(f.day)).map((f) => {
              const d = p.days.indexOf(f.day);
              const column = f.resource ? `${2 + d * R + p.resources.findIndex((r) => r.id === f.resource)}` : `${2 + d * R} / span ${R}`;
              return (
                <div key={f.id} aria-hidden="true" data-testid={`fixed-${f.id}`} style={{ gridRow: gridRow(f.start, f.end), gridColumn: column, backgroundImage: fixedPattern }}
                  className="pointer-events-none z-0 m-px flex items-start gap-1 overflow-hidden rounded-md border border-slate-300 px-1 py-0.5 text-[11px] leading-tight text-slate-700">
                  <svg viewBox="0 0 10 12" className="mt-px h-2.5 w-2 shrink-0 fill-slate-500"><path d="M2.5 5V3.5a2.5 2.5 0 0 1 5 0V5H9v7H1V5zm1.2 0h2.6V3.5a1.3 1.3 0 0 0-2.6 0z" /></svg>
                  <span className="rounded bg-white/80 px-0.5">{f.label}</span>
                </div>
              );
            })}

            {placements.map((x) => {
              const task = taskOf(p, x.task)!;
              const { lane, lanes: n } = lanes(x);
              const conflict = hasConflict(x.task);
              const resizable = task.min !== task.max && !readOnly;
              const selected = selectedTask === x.task;
              return (
                <div key={x.task} aria-hidden="true" data-testid={`block-${x.task}`} data-conflict={conflict ? "true" : undefined}
                  title={[`${task.label} ${clock(x.start)}–${clock(x.end)}`, ...conflictText(x.task)].join("\n")}
                  style={{
                    gridRow: gridRow(x.start, x.end), gridColumn: 2 + columnOf(x),
                    marginLeft: `calc(${(lane * 100) / n}% + 2px)`, width: `calc(${100 / n}% - 4px)`,
                    ...(conflict ? { backgroundImage: conflictPattern, borderColor: CONFLICT } : {}),
                  }}
                  className={"wp-block relative z-10 my-px flex touch-none flex-col justify-self-start overflow-hidden rounded-md border-l-4 px-1 py-0.5 text-[11px] leading-tight shadow-xs " +
                    (conflict ? "border-2 border-dashed bg-orange-50 text-slate-900 " : "border-sky-700 bg-sky-100 text-slate-900 ") +
                    (selected ? "ring-2 ring-sky-600 " : "") + (moving === x.task && (dragging || picked) ? "opacity-40 " : "") + (readOnly ? "" : "cursor-grab")}
                  onPointerDown={(e) => {
                    const cell = cellFromPoint(e.clientX, e.clientY);
                    startDrag(e, { kind: "move", task: x.task, grab: cell ? Math.max(0, cell.r - rowOf(x.start)) : 0 });
                  }}>
                  <span className="truncate font-medium">
                    {conflict && <span style={{ color: CONFLICT }} className="mr-0.5 font-bold">⚠</span>}
                    {task.label}
                  </span>
                  {x.end - x.start >= p.slot * 2 && <span className="tabular-nums text-slate-600">{clock(x.start)}–{clock(x.end)}</span>}
                  {conflict && x.end - x.start >= p.slot * 3 && <span className="truncate text-[10px] font-semibold" style={{ color: "#9a3f00" }}>{conflictText(x.task)[0]}</span>}
                  {resizable && (
                    <span className="absolute inset-x-0 bottom-0 flex h-2 cursor-ns-resize justify-center" data-testid={`resize-${x.task}`}
                      onPointerDown={(e) => startDrag(e, { kind: "resize", task: x.task })}>
                      <span className="mt-0.5 h-0.5 w-5 rounded bg-sky-700/50" />
                    </span>
                  )}
                </div>
              );
            })}

            {preview && (
              <div aria-hidden="true" data-testid="preview" style={{ gridRow: gridRow(preview.start, preview.end), gridColumn: 2 + columnOf(preview) }}
                className="pointer-events-none z-20 m-px flex flex-col overflow-hidden rounded-md border-2 border-dashed border-sky-600 bg-sky-200/60 px-1 py-0.5 text-[11px] leading-tight text-sky-900">
                <span className="truncate font-medium">{taskName(preview.task)}</span>
                {preview.end - preview.start >= p.slot * 2 && <span className="truncate tabular-nums">{clock(preview.start)}–{clock(preview.end)}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500" data-testid="legend">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border border-slate-300" style={{ backgroundImage: closedPattern }} />{t.legendClosed} ({t.opening(clock(p.open.start), clock(p.open.end))})</span>
          {p.fixed.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border border-slate-300" style={{ backgroundImage: fixedPattern }} />{t.legendFixed}</span>}
          {feedback && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border-2 border-dashed" style={{ backgroundImage: conflictPattern, borderColor: CONFLICT }} />{t.legendConflict}</span>}
        </div>
        {feedback && conflictList.length > 0 && (
          <section aria-label={t.conflicts} className="rounded-lg border border-dashed px-2.5 py-1.5 text-xs" style={{ borderColor: CONFLICT }} data-testid="conflicts">
            <h3 className="m-0 mb-0.5 text-xs font-semibold" style={{ color: "#9a3f00" }}><span aria-hidden="true">⚠ </span>{t.conflicts}</h3>
            <ul className="m-0 list-none p-0 text-slate-700">
              {conflictList.map((x) => <li key={x.task}><strong className="font-medium">{taskName(x.task)}</strong> ({when(x, true)}): {conflictText(x.task).join("; ")}</li>)}
            </ul>
          </section>
        )}
        <p role="status" aria-live="polite" className="m-0 min-h-5 text-xs text-slate-600" data-testid="status">{status}</p>
      </div>

      {dragging && dragging.drag.kind === "card" && (
        <div aria-hidden="true" className="pointer-events-none fixed z-50 rounded-md border border-sky-600 bg-white/90 px-2 py-1 text-xs text-sky-900 shadow-md"
          style={{ left: `${dragging.x + 10}px`, top: `${dragging.y + 6}px` }}>
          {taskName(dragging.drag.task)}
        </div>
      )}
    </div>
  );
};

export default Agenda;
