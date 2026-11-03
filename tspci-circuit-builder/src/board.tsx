import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  Circuit, PaletteItem, PartType, Placed, Rotation, analyze, boardOf, edgeKey, move, partAt, place, remaining, remove,
  rotate, rotation as toRotation, terminalsOf,
} from "./circuit";
import { CELL_UNITS, PartSymbol, sidePoint } from "./symbols";
import { Texts } from "./texts";

// The board with the palette and the tools: used by the candidate (interaction.tsx) and the author (authoring.tsx).
// Parts are placed by dragging from the palette, or by choosing a palette part and then a cell; the keyboard does
// everything too. Open ends and joints are marked from the analysis (circuit.ts).

const CELL = 56; // px

type Drag = { from: "palette"; type: PartType } | { from: "board"; x: number; y: number };
type Pending = { drag: Drag; startX: number; startY: number; moved: boolean; pointerX: number; pointerY: number };

const iconButton =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-xs " +
  "hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600 disabled:opacity-40 disabled:hover:bg-white";

const Board = ({ circuit, locked, parts, start, onChange, texts, showOpenEnds = true, showCurrent = false, readOnly = false, ignoreLimits = false, onSelect, label, testid = "board" }: {
  /** Size and palette (the preset and checks are not used here). */
  circuit: Circuit;
  /** Parts nobody changes here: shown, not moved. */
  locked: Placed[];
  /** The parts that can change. A part with locked set (the author's preset) shows a lock. */
  parts: Placed[];
  /** What "Start again" goes back to. */
  start: Placed[];
  onChange: (parts: Placed[]) => void;
  texts: Texts;
  showOpenEnds?: boolean;
  showCurrent?: boolean;
  readOnly?: boolean;
  /** The author places as many as they like. */
  ignoreLimits?: boolean;
  /** Tells which part (cell) is selected, for the author's lock box. */
  onSelect?: (cell: { x: number; y: number } | null) => void;
  label?: string;
  testid?: string;
}) => {
  const t = texts;
  // the ops of circuit.ts read the size, the palette and the locked parts from a circuit
  const frame: Circuit = useMemo(() => ({ ...circuit, preset: locked.map((p) => ({ ...p, locked: true })) }), [circuit, locked]);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [armed, setArmed] = useState<PartType | null>(null);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const history = useRef<Placed[][]>([]);
  const boardRef = useRef<HTMLDivElement>(null);
  const partsRef = useRef(parts);
  partsRef.current = parts;

  const all = boardOf(frame, parts);
  const analysis = useMemo(() => analyze(all), [JSON.stringify(all)]);
  const name = (type: PartType) => t.part[type];
  const where = (x: number, y: number) => [y + 1, x + 1] as const;

  useEffect(() => onSelect?.(partAt(parts, cursor.x, cursor.y) ? cursor : null), [cursor.x, cursor.y, parts]);

  const commit = (next: Placed[] | null, message: string) => {
    if (!next) return false;
    history.current.push(partsRef.current);
    if (history.current.length > 200) history.current.shift();
    onChange(next);
    setStatus(message);
    return true;
  };

  const placeAt = (type: PartType, x: number, y: number, turn: Rotation = 0) => {
    if (readOnly) return;
    if (partAt(locked, x, y)) return setStatus(t.isLocked);
    const existing = partAt(parts, x, y);
    const next = place(frame, parts, type, x, y, existing && existing.type === type ? existing.rotation : turn, ignoreLimits);
    if (!next) return setStatus(t.noneLeft(name(type)));
    // a part placed by the author keeps its lock mark
    const kept = existing?.locked ? next.map((p) => (p.x === x && p.y === y ? { ...p, locked: true } : p)) : next;
    commit(kept, t.placed(name(type), ...where(x, y)));
    setCursor({ x, y });
  };
  const moveTo = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    if (readOnly) return;
    const part = partAt(parts, from.x, from.y);
    if (!part || (from.x === to.x && from.y === to.y)) return;
    if (partAt(locked, to.x, to.y)) return setStatus(t.isLocked);
    if (commit(move(frame, parts, from, to), t.moved(name(part.type), ...where(to.x, to.y)))) setCursor(to);
  };
  const turn = (x: number, y: number) => {
    if (readOnly) return;
    if (partAt(locked, x, y)) return setStatus(t.isLocked);
    const part = partAt(parts, x, y);
    if (part) commit(rotate(parts, x, y), t.rotated(name(part.type), toRotation(part.rotation + 90)));
  };
  const removeAt = (x: number, y: number) => {
    if (readOnly) return;
    if (partAt(locked, x, y)) return setStatus(t.isLocked);
    const part = partAt(parts, x, y);
    if (part) commit(remove(parts, x, y), t.removed(name(part.type)));
  };
  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    onChange(previous);
    setStatus(t.undone);
  };
  const clear = () => commit(start, t.cleared);
  const arm = (type: PartType | null) => {
    setArmed(type);
    if (type) setStatus(t.chosen(name(type)));
  };

  // --- pointer: drag from the palette or the board, or click

  const cellFromPoint = (clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.floor(((clientX - rect.left) / rect.width) * circuit.columns);
    const y = Math.floor(((clientY - rect.top) / rect.height) * circuit.rows);
    return x >= 0 && y >= 0 && x < circuit.columns && y < circuit.rows ? { x, y } : null;
  };
  // the drop needs the latest parts: the listeners below call it through a ref
  const drop = useRef<(drag: Drag, clientX: number, clientY: number) => void>();
  drop.current = (drag, clientX, clientY) => {
    const cell = cellFromPoint(clientX, clientY);
    if (drag.from === "palette") {
      if (cell) placeAt(drag.type, cell.x, cell.y);
    } else if (cell) moveTo(drag, cell);
    else removeAt(drag.x, drag.y); // dragged off the board
  };
  /** Listens on the window right away (not in an effect, which could come after a quick pointerup). */
  const startDrag = (e: PointerEvent, drag: Drag) => {
    if (readOnly || e.button > 0) return;
    let state: Pending = { drag, startX: e.clientX, startY: e.clientY, moved: false, pointerX: e.clientX, pointerY: e.clientY };
    const onMove = (ev: PointerEvent) => {
      const moved = state.moved || Math.hypot(ev.clientX - state.startX, ev.clientY - state.startY) > 5;
      state = { ...state, moved, pointerX: ev.clientX, pointerY: ev.clientY };
      if (moved) setPending(state);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setPending(null);
      if (!state.moved || ev.type === "pointercancel") return; // a click: the click handlers do it
      drop.current(state.drag, ev.clientX, ev.clientY);
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const suppressClick = useRef(false);

  const clickCell = (x: number, y: number) => {
    if (suppressClick.current) return;
    setCursor({ x, y });
    boardRef.current?.focus();
    if (armed && !partAt(parts, x, y) && !partAt(locked, x, y)) placeAt(armed, x, y);
  };

  // --- keyboard on the board

  const onKeyDown = (e: KeyboardEvent) => {
    const { x, y } = cursor;
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const key = e.key;
    if (steps[key]) {
      e.preventDefault();
      const to = { x: Math.min(circuit.columns - 1, Math.max(0, x + steps[key][0])), y: Math.min(circuit.rows - 1, Math.max(0, y + steps[key][1])) };
      if (e.shiftKey && partAt(parts, x, y)) moveTo(cursor, to);
      else setCursor(to);
    } else if (key === "Enter" || key === " ") {
      e.preventDefault();
      if (armed) placeAt(armed, x, y);
    } else if (key === "r" || key === "R") {
      e.preventDefault();
      turn(x, y);
    } else if (key === "Delete" || key === "Backspace") {
      e.preventDefault();
      removeAt(x, y);
    } else if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    } else if (key === "Escape") {
      arm(null);
    }
  };

  // --- what the board shows

  const cellLabel = (x: number, y: number) => {
    const p = partAt(all, x, y);
    const open = analysis.net.openEnds.filter((o) => o.x === x && o.y === y).length;
    const desc = p ? [name(p.type), t.turned(p.rotation), partAt(locked, x, y) || p.locked ? t.locked : "", showOpenEnds && open ? t.openEnds(open) : ""].filter(Boolean).join(", ") : t.empty;
    return `${t.cell(y + 1, x + 1)}: ${desc}`;
  };
  const liveNodes = useMemo(() => {
    const nodes = new Set<number>();
    analysis.net.elements.forEach((e) => analysis.live[e.index] && Object.values(e.nodes).forEach((n) => nodes.add(n)));
    return nodes;
  }, [analysis]);
  const closed = analysis.sources.length > 0 && analysis.shorted.length === 0 && analysis.live.length > analysis.sources.length && analysis.live.every(Boolean);
  const glowing = (p: Placed) => {
    if (!showCurrent || !closed) return false;
    const node = analysis.net.edgeNode[edgeKey(p.x, p.y, terminalsOf(p.type, p.rotation)[0].side)];
    return liveNodes.has(node);
  };
  const lit = (p: Placed) => {
    if (!showCurrent || !closed) return false;
    if (p.type === "lamp") return true;
    if (p.type === "led") {
      const e = analysis.net.elements.find((el) => el.x === p.x && el.y === p.y);
      return !!e && analysis.forward(e.index) === true;
    }
    return false;
  };

  const point = (x: number, y: number, side: "N" | "E" | "S" | "W") => [x * CELL_UNITS + sidePoint[side][0], y * CELL_UNITS + sidePoint[side][1]];
  const jointPoints = analysis.net.joints.map((k) => {
    const [kind, rest] = [k[0], k.slice(1)];
    const [a, b] = rest.split(",").map(Number);
    return kind === "v" ? [a * CELL_UNITS, b * CELL_UNITS + CELL_UNITS / 2] : [a * CELL_UNITS + CELL_UNITS / 2, b * CELL_UNITS];
  });

  const dragging = pending?.moved ? pending : null;
  const dragType = dragging ? (dragging.drag.from === "palette" ? dragging.drag.type : partAt(parts, dragging.drag.x, dragging.drag.y)?.type) : null;
  const dragTurn = dragging && dragging.drag.from === "board" ? partAt(parts, dragging.drag.x, dragging.drag.y)?.rotation ?? 0 : 0;
  const target = dragging ? cellFromPoint(dragging.pointerX, dragging.pointerY) : null;
  const selected = partAt(parts, cursor.x, cursor.y);
  const cellId = (x: number, y: number) => `${testid}-cell-${x}-${y}`;

  const paletteItem = (item: PaletteItem) => {
    const left = ignoreLimits ? null : remaining(frame, parts, item.type);
    const empty = left !== null && left < 1;
    return (
      <li key={item.type}>
        <button type="button" data-testid={`palette-${item.type}`} aria-pressed={armed === item.type} disabled={readOnly || empty}
          aria-label={`${name(item.type)}${left !== null ? `, ${left ? t.left(left) : t.none}` : ""}`}
          className={"group relative flex w-full touch-none select-none flex-col items-center gap-0.5 rounded-lg border px-1 pt-1 pb-1.5 text-[11px] leading-tight " +
            "border-slate-200 bg-white text-slate-700 hover:border-sky-400 hover:bg-sky-50 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-white " +
            "aria-pressed:border-sky-600 aria-pressed:bg-sky-50 aria-pressed:ring-2 aria-pressed:ring-sky-200 focus-visible:outline-2 focus-visible:outline-sky-600 cursor-grab"}
          onPointerDown={(e) => !empty && startDrag(e, { from: "palette", type: item.type })}
          onClick={() => !suppressClick.current && arm(armed === item.type ? null : item.type)}>
          <PartSymbol type={item.type} rotation={0} className="size-10 text-slate-800" />
          <span className="text-center">{name(item.type)}</span>
          {left !== null && (
            <span className="absolute top-0.5 right-0.5 min-w-4 rounded-full bg-slate-100 px-1 text-[10px] font-semibold text-slate-600 tabular-nums">{left}</span>
          )}
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-4">
        {!readOnly && (
          <section aria-label={t.palette} className="w-full max-w-[360px] sm:w-auto">
            <h3 className="m-0 mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">{t.palette}</h3>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(74px,1fr))] gap-1.5 p-0 sm:w-[244px] sm:max-h-[var(--board-h)] sm:overflow-y-auto sm:pr-1"
              style={{ "--board-h": `${Math.max(circuit.rows * CELL, 280)}px` }}>
              {circuit.palette.map(paletteItem)}
            </ul>
          </section>
        )}
        <div className="flex flex-col gap-2">
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label={label ?? t.board}>
              <button type="button" className={iconButton} disabled={!selected} onClick={() => turn(cursor.x, cursor.y)} data-testid="rotate">
                <span aria-hidden="true">⟳</span>{t.rotate}
              </button>
              <button type="button" className={iconButton} disabled={!selected} onClick={() => removeAt(cursor.x, cursor.y)} data-testid="delete">
                <span aria-hidden="true">✕</span>{t.remove}
              </button>
              <button type="button" className={iconButton} onClick={undo} data-testid="undo">
                <span aria-hidden="true">↶</span>{t.undo}
              </button>
              <button type="button" className={iconButton} onClick={clear} data-testid="clear">{t.clear}</button>
              <button type="button" className={`${iconButton} ml-auto`} aria-expanded={helpOpen} aria-label={t.showHelp} title={t.showHelp} onClick={() => setHelpOpen(!helpOpen)} data-testid="help"><span aria-hidden="true">?</span></button>
            </div>
          )}
          {helpOpen && <p className="m-0 max-w-[60ch] rounded-lg bg-sky-50 p-2.5 text-xs text-sky-900">{t.help}</p>}
          <div className="relative rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <div ref={boardRef} role="grid" tabIndex={0} aria-label={label ?? t.board} aria-activedescendant={cellId(cursor.x, cursor.y)} data-testid={testid}
              aria-readonly={readOnly ? "true" : undefined}
              onKeyDown={onKeyDown}
              className="group relative grid touch-none select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sky-200 focus-visible:ring-offset-2"
              style={{
                gridTemplateColumns: `repeat(${circuit.columns}, ${CELL}px)`, gridTemplateRows: `repeat(${circuit.rows}, ${CELL}px)`,
                backgroundImage: "linear-gradient(to right, #eef2f6 1px, transparent 1px), linear-gradient(to bottom, #eef2f6 1px, transparent 1px)",
                backgroundSize: `${CELL}px ${CELL}px`, boxShadow: "inset -1px -1px 0 #eef2f6",
              }}>
              {Array.from({ length: circuit.rows }, (_, y) => (
                <div role="row" key={y} className="contents">
                  {Array.from({ length: circuit.columns }, (_, x) => {
                    const p = partAt(all, x, y);
                    const fixed = !!partAt(locked, x, y);
                    const isCursor = cursor.x === x && cursor.y === y;
                    const isTarget = target && target.x === x && target.y === y;
                    const beingDragged = dragging?.drag.from === "board" && dragging.drag.x === x && dragging.drag.y === y;
                    return (
                      <div role="gridcell" id={cellId(x, y)} key={x} aria-label={cellLabel(x, y)} aria-selected={isCursor} aria-readonly={fixed || readOnly ? "true" : undefined}
                        data-testid={`cell-${x}-${y}`} data-part={p ? `${p.type}@${p.rotation}` : undefined}
                        className={"relative " + (fixed ? "bg-slate-100/70 " : "") + (isTarget ? "bg-sky-100 " : "") + (isCursor ? "z-10 " : "")}
                        onClick={() => clickCell(x, y)}
                        onDblClick={() => turn(x, y)}
                        onPointerDown={(e) => p && !fixed && startDrag(e, { from: "board", x, y })}>
                        {p && (
                          <PartSymbol type={p.type} rotation={p.rotation}
                            className={"absolute inset-0 size-full transition-opacity " + (fixed ? "text-slate-500 " : "text-slate-900 ") + (beingDragged ? "opacity-30 " : "") +
                              (glowing(p) ? "cb-live " : "") + (lit(p) ? (p.type === "led" ? "cb-lit-led " : "cb-lit ") : "") + (!fixed && !readOnly ? "cursor-grab" : "")} />
                        )}
                        {p && (fixed || p.locked) && (
                          <svg aria-hidden="true" viewBox="0 0 10 12" className="absolute top-1 left-1 h-2.5 w-2 fill-slate-400"><path d="M2.5 5V3.5a2.5 2.5 0 0 1 5 0V5H9v7H1V5zm1.2 0h2.6V3.5a1.3 1.3 0 0 0-2.6 0z" /></svg>
                        )}
                        {isCursor && <span aria-hidden="true" className="pointer-events-none absolute inset-0.5 hidden rounded-md ring-2 ring-sky-500 group-focus:block" />}
                      </div>
                    );
                  })}
                </div>
              ))}
              <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible"
                viewBox={`0 0 ${circuit.columns * CELL_UNITS} ${circuit.rows * CELL_UNITS}`}>
                {jointPoints.map(([cx, cy], i) => <circle key={`j${i}`} cx={cx} cy={cy} r={2.4} className="fill-emerald-500" data-testid="joint" />)}
                {showOpenEnds && analysis.net.openEnds.map((o, i) => {
                  const [cx, cy] = point(o.x, o.y, o.side);
                  return <circle key={`o${i}`} cx={cx} cy={cy} r={5.5} className="fill-white stroke-rose-500" stroke-width={2.5} data-testid="open-end" />;
                })}
              </svg>
            </div>
          </div>
          <div className="flex min-h-5 flex-wrap items-center gap-3 text-xs text-slate-500">
            {showOpenEnds && analysis.net.openEnds.length > 0 && (
              <span className="inline-flex items-center gap-1"><span className="inline-block size-2.5 rounded-full border-2 border-rose-500" />{t.openEnds(analysis.net.openEnds.length)}</span>
            )}
            {showCurrent && closed && <span className="inline-flex items-center gap-1 text-amber-700" data-testid="closed"><span className="inline-block size-2.5 rounded-full bg-amber-400" />{t.closedCircuit}</span>}
            <span role="status" aria-live="polite" className="text-slate-600" data-testid="status">{status}</span>
          </div>
        </div>
      </div>
      {dragging && dragType && (
        <div aria-hidden="true" className="pointer-events-none fixed z-50 text-sky-700 opacity-80"
          style={{ left: `${dragging.pointerX - CELL / 2}px`, top: `${dragging.pointerY - CELL / 2}px`, width: `${CELL}px`, height: `${CELL}px` }}>
          <PartSymbol type={dragType} rotation={dragTurn} className="size-full" />
        </div>
      )}
    </div>
  );
};

export default Board;
