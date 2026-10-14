import { useMemo, useRef, useState } from "preact/hooks";
import { Paper } from "./interaction";
import {
  DEFAULT_PARTITION, GRID, Line, Partition, SIZE, SNAPS, Snap, danglingLines, fraction, normalizeLine, regions,
} from "./partition";

// The authoring mode (index.tsx getAuthoringInstance): size the rectangle, draw the lines that split it. Lines snap to
// 1/4, 1/8 or 1/16 of the sides; the result is data-partition (partition.ts).

const MARGIN = 64;
const HANDLE = 14;

const strings = {
  en: {
    snap: "Snap lines to",
    width: "Width",
    height: "Height",
    undo: "Undo",
    removeLine: "Remove line",
    clear: "Remove all lines",
    standard: "Standard shape",
    hint: "Drag to draw a line (start anywhere, also on a line); click a line to select it. Drag the corner to resize.",
    parts: (n: number) => (n === 1 ? "1 part" : `${n} parts`),
    dangling: (n: number) => (n === 1 ? "1 line splits nothing and is not shown to the candidate." : `${n} lines split nothing and are not shown to the candidate.`),
    noParts: "Draw at least one line that splits the rectangle into parts.",
    shape: "Shape to colour",
  },
  nl: {
    snap: "Lijnen vastklikken op",
    width: "Breedte",
    height: "Hoogte",
    undo: "Ongedaan maken",
    removeLine: "Lijn verwijderen",
    clear: "Alle lijnen verwijderen",
    standard: "Standaardvorm",
    hint: "Sleep om een lijn te tekenen (ook vanaf een lijn); klik op een lijn om hem te selecteren. Sleep de hoek om de maat te wijzigen.",
    parts: (n: number) => (n === 1 ? "1 deel" : `${n} delen`),
    dangling: (n: number) => (n === 1 ? "1 lijn verdeelt niets en wordt niet aan de kandidaat getoond." : `${n} lijnen verdelen niets en worden niet aan de kandidaat getoond.`),
    noParts: "Teken minstens één lijn die de rechthoek in delen verdeelt.",
    shape: "Vorm om te kleuren",
  },
};
const textsFor = (language: string) => strings[language as keyof typeof strings] ?? strings.en;

/** What keeps the shape from being used (getAuthoringInstance validate()). */
export const authoringProblems = (p: Partition, language: string) => (regions(p).length < 2 ? [textsFor(language).noParts] : []);

const sameLine = (a: Line, b: Line) => a.every((n, i) => n === b[i]);

type Drag =
  | { kind: "line"; from: [number, number]; to: [number, number] }
  /** `before`: the shape when the drag started (one undo step for the whole drag). */
  | { kind: "resize"; frame: { width: number; height: number }; before: Partition };

const Authoring = ({ initial, colors, language, onChange }: {
  initial: Partition;
  colors: string;
  language: string;
  onChange: (partition: Partition) => void;
}) => {
  const t = textsFor(language);
  const [partition, setPartition] = useState<Partition>(initial);
  const [history, setHistory] = useState<Partition[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const shape = useRef<SVGGElement>();

  const parts = useMemo(() => regions(partition), [partition]);
  const dangling = useMemo(() => danglingLines(partition, parts), [partition, parts]);
  const tints = colors.split(",").map((c) => c.trim()).filter(Boolean);
  const cellW = partition.width / GRID;
  const cellH = partition.height / GRID;
  const step = GRID / partition.snap;

  const commit = (next: Partition) => {
    setHistory((h) => [...h, partition]);
    setPartition(next);
    onChange(next);
  };
  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    setSelected(null);
    setPartition(previous);
    onChange(previous);
  };
  const removeSelected = () => {
    if (selected === null) return;
    commit({ ...partition, lines: partition.lines.filter((_, i) => i !== selected) });
    setSelected(null);
  };

  /** The pointer in drawing units, relative to the rectangle's top left corner. */
  const pointer = (e: PointerEvent) => {
    const matrix = shape.current.getScreenCTM().inverse();
    const svg = shape.current.ownerSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(matrix);
    return { x: p.x, y: p.y };
  };
  /** The nearest grid point the snap allows, in sixteenths. */
  const snapped = (e: PointerEvent): [number, number] => {
    const { x, y } = pointer(e);
    const clamp = (n: number) => Math.min(GRID, Math.max(0, n));
    return [clamp(Math.round(x / cellW / step) * step), clamp(Math.round(y / cellH / step) * step)];
  };
  /** The line within a few units of a point (drawing units), or null. */
  const lineAt = ({ x, y }: { x: number; y: number }) => {
    const distance = ([x1, y1, x2, y2]: Line) => {
      const [ax, ay, bx, by] = [x1 * cellW, y1 * cellH, x2 * cellW, y2 * cellH];
      const cx = Math.min(Math.max(x, ax), bx);
      const cy = Math.min(Math.max(y, ay), by);
      return Math.hypot(x - cx, y - cy);
    };
    const near = partition.lines.map((l, i) => ({ i, d: distance(l) })).filter((c) => c.d < 10).sort((a, b) => a.d - b.d);
    return near.length ? near[0].i : null;
  };
  /** A line from `from` towards `to`, horizontal or vertical, whichever is closer. */
  const straight = (from: [number, number], to: [number, number]): [number, number] =>
    Math.abs(to[0] - from[0]) >= Math.abs(to[1] - from[1]) ? [to[0], from[1]] : [from[0], to[1]];

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const { x, y } = pointer(e);
    if (x < -cellW || y < -cellH || x > partition.width + cellW || y > partition.height + cellH) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const at = snapped(e);
    setDrag({ kind: "line", from: at, to: at });
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return;
    if (drag.kind === "line") {
      setDrag({ ...drag, to: straight(drag.from, snapped(e)) });
    } else {
      const { x, y } = pointer(e);
      const size = (n: number, max: number) => Math.min(max, Math.max(SIZE.min, Math.round(n / SIZE.step) * SIZE.step));
      const next = { ...partition, width: size(x, drag.frame.width), height: size(y, drag.frame.height) };
      if (next.width !== partition.width || next.height !== partition.height) setPartition(next);
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!drag) return;
    setDrag(null);
    if (drag.kind === "line") {
      const line = normalizeLine([...drag.from, ...drag.to]);
      if (!line) setSelected(lineAt(pointer(e)));  // a click: select the line under the pointer, if any
      else if (!partition.lines.some((l) => sameLine(l, line))) commit({ ...partition, lines: [...partition.lines, line] });
    } else if (partition !== drag.before) {
      setHistory((h) => [...h, drag.before]);
      onChange(partition);
    }
  };

  // While resizing, the drawing keeps the frame it had, so it does not zoom under the pointer.
  const frame = drag?.kind === "resize" ? drag.frame : { width: partition.width, height: partition.height };
  const viewWidth = Math.max(frame.width, partition.width) + 2 * MARGIN;
  const viewHeight = Math.max(frame.height, partition.height) + 2 * MARGIN;
  const draft = drag?.kind === "line" ? normalizeLine([...drag.from, ...drag.to]) : null;

  return (
    <div className="flex flex-col gap-3 font-sans text-slate-800">
      <div className="flex flex-wrap items-end gap-4 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">{t.snap}</span>
          <select className="rounded-md border border-slate-300 bg-white px-2 py-1" value={partition.snap} data-testid="snap"
            onChange={(e) => commit({ ...partition, snap: Number((e.target as HTMLSelectElement).value) as Snap })}>
            {SNAPS.map((s) => <option key={s} value={s}>1/{s}</option>)}
          </select>
        </label>
        {(["width", "height"] as const).map((side) => (
          <label key={side} className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">{t[side]}</span>
            <input type="number" className="w-24 rounded-md border border-slate-300 px-2 py-1" min={SIZE.min} max={SIZE.max} step={SIZE.step}
              value={partition[side]} data-testid={side}
              onChange={(e) => {
                const n = Math.round(Number((e.target as HTMLInputElement).value) / SIZE.step) * SIZE.step;
                if (Number.isFinite(n) && n !== partition[side]) commit({ ...partition, [side]: Math.min(SIZE.max, Math.max(SIZE.min, n)) });
              }} />
          </label>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50 disabled:opacity-40"
            disabled={selected === null} onClick={removeSelected} data-testid="remove-line">{t.removeLine}</button>
          <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50 disabled:opacity-40"
            disabled={!history.length} onClick={undo} data-testid="undo">{t.undo}</button>
          <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50 disabled:opacity-40"
            disabled={!partition.lines.length} onClick={() => { setSelected(null); commit({ ...partition, lines: [] }); }} data-testid="clear">{t.clear}</button>
          <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50"
            onClick={() => { setSelected(null); commit(DEFAULT_PARTITION); }} data-testid="standard">{t.standard}</button>
        </div>
      </div>
      <p className="m-0 text-xs text-slate-500">{t.hint}</p>

      <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="max-h-[calc(70vh_-_8rem)] w-full touch-none select-none"
        role="img" aria-label={`${t.shape}: ${t.parts(parts.length)}`} tabIndex={0} data-testid="authoring-shape"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}
        onKeyDown={(e) => {
          if ((e.key === "Delete" || e.key === "Backspace") && selected !== null) removeSelected();
          if (e.key === "z" && (e.ctrlKey || e.metaKey)) undo();
        }}>
        <Paper width={viewWidth} height={viewHeight} />
        <g ref={shape} transform={`translate(${MARGIN} ${MARGIN})`}>
          <rect width={partition.width} height={partition.height} fill="#fff" />
          {parts.map((part, i) => {
            const tint = tints[i % Math.max(1, tints.length)] ?? "#94a3b8";
            const [sx, sy] = part.cells.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
            // the label goes in the cell nearest to the middle of the part (an L-shaped part has its middle outside)
            const [lx, ly] = part.cells.reduce((best, c) =>
              Math.hypot(c[0] - sx / part.cells.length, c[1] - sy / part.cells.length) <
              Math.hypot(best[0] - sx / part.cells.length, best[1] - sy / part.cells.length) ? c : best);
            return (
              <g key={part.id} pointer-events="none">
                {part.cells.map(([x, y]) => (
                  <rect key={`${x},${y}`} x={x * cellW} y={y * cellH} width={cellW} height={cellH} fill={tint} fill-opacity="0.12" />
                ))}
                {parts.length > 1 && (
                  <text x={(lx + 0.5) * cellW} y={(ly + 0.5) * cellH} text-anchor="middle" dominant-baseline="central" fill="#475569"
                    font-size={Math.max(12, Math.min(22, cellW * 0.9, cellH * 0.9))}>{fraction(part)}</text>
                )}
              </g>
            );
          })}
          <g stroke="#cbd5e1" stroke-width="1" pointer-events="none">
            {Array.from({ length: partition.snap - 1 }, (_, i) => (i + 1) * step).map((n) => (
              <g key={n}>
                <line x1={n * cellW} y1={0} x2={n * cellW} y2={partition.height} stroke-dasharray="2 4" />
                <line x1={0} y1={n * cellH} x2={partition.width} y2={n * cellH} stroke-dasharray="2 4" />
              </g>
            ))}
          </g>
          <rect width={partition.width} height={partition.height} fill="none" stroke="#334155" stroke-width="3" pointer-events="none" />
          {partition.lines.map((line, i) => {
            const [x1, y1, x2, y2] = line;
            const loose = dangling.some((l) => sameLine(l, line));
            return (
              <g key={line.join(",")} data-testid="line">
                <line x1={x1 * cellW} y1={y1 * cellH} x2={x2 * cellW} y2={y2 * cellH} stroke-linecap="square" pointer-events="none"
                  stroke={selected === i ? "#2563eb" : loose ? "#f59e0b" : "#334155"} stroke-width={selected === i ? 5 : 3}
                  stroke-dasharray={loose ? "8 6" : undefined} />
              </g>
            );
          })}
          {draft && (
            <line x1={draft[0] * cellW} y1={draft[1] * cellH} x2={draft[2] * cellW} y2={draft[3] * cellH}
              stroke="#2563eb" stroke-width="3" stroke-dasharray="6 4" pointer-events="none" />
          )}
          <rect x={partition.width - HANDLE / 2} y={partition.height - HANDLE / 2} width={HANDLE} height={HANDLE} rx="3"
            fill="#fff" stroke="#2563eb" stroke-width="2" className="cursor-nwse-resize" data-testid="resize"
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.currentTarget as SVGElement).ownerSVGElement?.setPointerCapture(e.pointerId);
              setSelected(null);
              const frame = { width: Math.min(SIZE.max, partition.width * 1.5), height: Math.min(SIZE.max, partition.height * 1.5) };
              setDrag({ kind: "resize", frame, before: partition });
            }} />
        </g>
      </svg>

      <p className="m-0 text-sm text-slate-600" data-testid="summary">
        {t.parts(parts.length)}
        {dangling.length > 0 && <span className="ml-2 text-amber-600">{t.dangling(dangling.length)}</span>}
        {parts.length < 2 && <span className="ml-2 text-red-600">{t.noParts}</span>}
      </p>
    </div>
  );
};

export default Authoring;
