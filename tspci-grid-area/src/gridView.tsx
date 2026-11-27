/*
 * Squared paper as SVG: the grid lines, the coloured squares and half squares, and the outline of the shape. Used by the
 * interaction (the pupil draws, or looks at the author's shape) and by the authoring mode (the author draws).
 *
 * Drawing: a click on an empty square colours it; a click on a coloured square removes it, or, with halves, turns it into
 * a half square and on (grid.ts nextValue). A drag from an empty square colours every square it passes, a drag from a
 * coloured square removes them. Keyboard: the grid is an ARIA grid with one square in the tab order (a roving tabindex);
 * the arrow keys, Home and End move it, Space or Enter is a click, Delete or Backspace empties the square.
 *
 * Colour is never the only cue: a coloured square is hatched (shape B dotted) and the shape has a dark outline.
 */
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { EMPTY, FULL, cellPolygon, nextValue, outline, type CellValue, type Shape } from "./grid";
import type { Texts } from "./texts";

/** The size of a square in the SVG's own units; its size on screen is `cellSize` pixels (or less, in a narrow item). */
const S = 40;
const MARGIN = 3;

export type GridLook = "a" | "b";

type Props = {
  shape: Shape;
  /** the pupil (or the author) may colour squares; otherwise the shape can only be explored with the keyboard */
  editable: boolean;
  halves: boolean;
  t: Texts;
  /** the accessible name of the grid */
  label: string;
  /** "a": blue and hatched (the default); "b": orange and dotted, the second shape of a comparison */
  look?: GridLook;
  /** the width of a square on screen, in pixels */
  cellSize?: number;
  onCell?: (index: number, value: CellValue) => void;
};

type Drag = { start: number; mode: "fill" | "erase" | "pending"; last: number };

export function GridView({ shape, editable, halves, t, label, look = "a", cellSize = 36, onCell }: Props) {
  const { columns, rows, cells } = shape;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, ""); // the pattern's id: unique, also with several grids in one shadow root
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const latest = useRef(cells); // the cells as they are now, also between two renders during a fast drag
  latest.current = cells;
  const [cursor, setCursor] = useState(0);
  const [focused, setFocused] = useState(false);
  const width = columns * S, height = rows * S;

  const set = (index: number, value: CellValue) => {
    if (latest.current[index] === value) return;
    latest.current = latest.current.map((v, i) => (i === index ? value : v));
    onCell?.(index, value);
  };

  /** The square under the pointer, or -1 outside the grid. */
  const cellAt = (event: PointerEvent) => {
    const box = svg.current!.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * (width + 2 * MARGIN) - MARGIN;
    const y = ((event.clientY - box.top) / box.height) * (height + 2 * MARGIN) - MARGIN;
    const column = Math.floor(x / S), row = Math.floor(y / S);
    return column < 0 || row < 0 || column >= columns || row >= rows ? -1 : row * columns + column;
  };

  const focusCell = (index: number) => svg.current?.querySelector<SVGElement>(`[data-cell="${index}"]`)?.focus();

  const onPointerDown = (event: PointerEvent) => {
    if (!editable || event.button !== 0) return;
    const index = cellAt(event);
    if (index < 0) return;
    event.preventDefault();
    try {
      svg.current!.setPointerCapture(event.pointerId);
    } catch {
      // a pointer the browser does not know (a test): the moves still arrive on the grid
    }
    setCursor(index);
    focusCell(index);
    setFocused(false); // the pupil sees where the pointer is; the dashed cursor is for the keyboard
    if (latest.current[index] === EMPTY) {
      set(index, FULL);
      drag.current = { start: index, mode: "fill", last: index };
    } else {
      drag.current = { start: index, mode: "pending", last: index }; // a click or the start of a drag that erases
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    const current = drag.current;
    if (!current) return;
    const index = cellAt(event);
    if (index < 0 || index === current.last) return;
    if (current.mode === "pending") {
      current.mode = "erase";
      set(current.start, EMPTY);
    }
    set(index, current.mode === "fill" ? FULL : EMPTY);
    current.last = index;
  };

  const onPointerUp = () => {
    const current = drag.current;
    drag.current = null;
    if (current?.mode === "pending") set(current.start, nextValue(latest.current[current.start], halves));
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const row = Math.floor(index / columns), column = index % columns;
    let next = index;
    switch (event.key) {
      case "ArrowLeft": next = row * columns + Math.max(0, column - 1); break;
      case "ArrowRight": next = row * columns + Math.min(columns - 1, column + 1); break;
      case "ArrowUp": next = Math.max(0, row - 1) * columns + column; break;
      case "ArrowDown": next = Math.min(rows - 1, row + 1) * columns + column; break;
      case "Home": next = row * columns; break;
      case "End": next = row * columns + columns - 1; break;
      case " ":
      case "Enter":
        if (editable) set(index, nextValue(latest.current[index], halves));
        break;
      case "Delete":
      case "Backspace":
        if (editable) set(index, EMPTY);
        break;
      default:
        return;
    }
    event.preventDefault();
    setFocused(true); // the keyboard is in use: show where it is
    if (next !== index) {
      setCursor(next);
      focusCell(next);
    }
  };

  // the roving tabindex stays on a square that exists when the grid gets smaller
  useEffect(() => {
    if (cursor >= columns * rows) setCursor(0);
  }, [columns, rows]);

  const edges = outline(shape);
  const palette = look === "b" ? { fill: "#fed7aa", ink: "#9a3412" } : { fill: "#bfdbfe", ink: "#1d4ed8" };
  const cursorX = (cursor % columns) * S, cursorY = Math.floor(cursor / columns) * S;

  return (
    <svg
      ref={svg}
      role="grid"
      tabindex={-1} // not a tab stop itself (Chrome makes a grid one): the square with the roving tabindex is
      aria-label={label}
      aria-readonly={editable ? undefined : "true"}
      viewBox={`${-MARGIN} ${-MARGIN} ${width + 2 * MARGIN} ${height + 2 * MARGIN}`}
      className={`block h-auto max-w-full select-none ${editable ? "cursor-pointer touch-none" : ""}`}
      style={{ width: `${(columns * cellSize * (width + 2 * MARGIN)) / width}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      onFocusIn={(event) => setFocused((event.target as Element).matches(":focus-visible"))}
      onFocusOut={() => setFocused(false)}
      data-look={look}
    >
      <defs>
        {look === "b" ? (
          <pattern id={`${id}-fill`} patternUnits="userSpaceOnUse" width="10" height="10">
            <rect width="10" height="10" fill={palette.fill} />
            <circle cx="5" cy="5" r="1.8" fill={palette.ink} />
          </pattern>
        ) : (
          <pattern id={`${id}-fill`} patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
            <rect width="10" height="10" fill={palette.fill} />
            <line x1="0" y1="0" x2="0" y2="10" stroke={palette.ink} stroke-width="2.4" />
          </pattern>
        )}
      </defs>
      <rect x="0" y="0" width={width} height={height} fill="#fff" />

      {/* the coloured squares and halves, under the grid lines */}
      <g aria-hidden="true" data-shape>
        {cells.map((value, index) =>
          value === EMPTY ? null : (
            <polygon
              key={index}
              data-value={value}
              points={cellPolygon(value, index % columns, Math.floor(index / columns))
                .map(([x, y]) => `${x * S},${y * S}`)
                .join(" ")}
              fill={`url(#${id}-fill)`}
            />
          )
        )}
      </g>

      {/* the squared paper */}
      <g aria-hidden="true" stroke="#94a3b8" stroke-width="1">
        {Array.from({ length: columns + 1 }, (_, x) => (
          <line key={`v${x}`} x1={x * S} y1="0" x2={x * S} y2={height} />
        ))}
        {Array.from({ length: rows + 1 }, (_, y) => (
          <line key={`h${y}`} x1="0" y1={y * S} x2={width} y2={y * S} />
        ))}
      </g>

      {/* the outline of the shape: what the perimeter measures */}
      <g aria-hidden="true" stroke={palette.ink} stroke-width="4" stroke-linecap="round" data-outline>
        {edges.map((s, i) => (
          <line key={i} x1={s.x1 * S} y1={s.y1 * S} x2={s.x2 * S} y2={s.y2 * S} />
        ))}
      </g>

      {/* the squares for the pointer, the keyboard and a screen reader, transparent, on top */}
      {Array.from({ length: rows }, (_, row) => (
        <g key={row} role="row">
          {Array.from({ length: columns }, (_, column) => {
            const index = row * columns + column;
            return (
              <rect
                key={index}
                role="gridcell"
                data-cell={index}
                x={column * S}
                y={row * S}
                width={S}
                height={S}
                fill="transparent"
                tabindex={index === cursor ? 0 : -1} // lowercase: Preact sets SVG attributes as written
                aria-label={t.cell(row + 1, column + 1, cells[index])}
                aria-selected={cells[index] !== EMPTY ? "true" : "false"}
                className="outline-none"
                onKeyDown={(event) => onKeyDown(event, index)}
                onFocus={() => setCursor(index)}
              />
            );
          })}
        </g>
      ))}

      {/* where the keyboard is (not after a click: the pupil sees where the pointer is) */}
      {focused && (
        <rect aria-hidden="true" x={cursorX + 2} y={cursorY + 2} width={S - 4} height={S - 4} rx="4" fill="none" stroke="#0f172a" stroke-width="3" stroke-dasharray="6 4" pointer-events="none" data-cursor />
      )}
    </svg>
  );
}
