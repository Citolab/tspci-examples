/*
 * The two models on screen: the rekenrek (rods with ten beads each, five red and five white, the beads slide along
 * the rod) and the hundred field (ten rows of ten squares or dots). Both show the 5-structure by colour and by a gap:
 * after five beads on a rod, after five squares in a row and after five rows. What a click, a drag or a key does is in
 * beadFrame.ts; this file only draws and passes it on (onPush, onPaint).
 */
import type { ComponentChildren } from "preact";
import { useId, useRef, useState } from "preact/hooks";
import { BEAD, FIVE, Fill, Grid, Look, Model, PER_ROW, ROD, beadX, clickCount, counts, dragCount, gridKey, rowCount, sliderKey, toggleFill } from "./beadFrame";
import { Texts } from "./texts";

export type FrameProps = {
  model: Model;
  look: Look;
  grid: Grid;
  /** the candidate (or the author) may change it */
  interactive: boolean;
  /** it only shows a number: one image for a screen reader */
  display: boolean;
  /** a sum: say which part a bead or square belongs to */
  sum: boolean;
  /** the part new beads and squares get */
  pen: 1 | 2;
  t: Texts;
  /** the grid as it is now: keys pressed faster than the screen redraws build on each other */
  current: () => Grid;
  onPush: (row: number, count: number) => void;
  onPaint: (row: number, column: number, fill: Fill) => void;
};

export const Frame = (props: FrameProps) => (props.model === "rekenrek" ? <Rekenrek {...props} /> : <HundredField {...props} />);

const HEIGHT = BEAD + 6;
/** Keep a drag on this element; a pointer the browser does not know (a synthetic event) just goes without. */
const capture = (element: Element | null | undefined, pointerId: number) => {
  try {
    element?.setPointerCapture?.(pointerId);
  } catch {
    // no active pointer with that id
  }
};
/** A bead that only moved this far (in rod units) was clicked, not dragged. */
const CLICK = 3;

function Rekenrek({ grid, interactive, display, sum, t, onPush, current }: FrameProps) {
  const id = useId();
  const total = counts(grid).value;
  return (
    <div
      className={`rekenrek ${interactive ? "interactive" : ""}`}
      role={display ? "img" : "group"}
      aria-label={display ? t.shows("rekenrek", grid.map(rowCount)) : t.frame("rekenrek")}
    >
      {!display && (
        <p id={`${id}-hint`} className="sr-only">
          {t.sliderHint}
        </p>
      )}
      {grid.map((row, r) => (
        <Rod
          key={r}
          id={`${id}-${r}`}
          hint={`${id}-hint`}
          row={row}
          r={r}
          total={total}
          interactive={interactive}
          display={display}
          sum={sum}
          t={t}
          onPush={onPush}
          current={current}
        />
      ))}
    </div>
  );
}

type RodProps = Pick<FrameProps, "interactive" | "display" | "sum" | "t" | "onPush" | "current"> & { id: string; hint: string; row: Fill[]; r: number; total: number };

/**
 * One rod: a slider of the number of beads pushed to the left. A click on a bead moves it to the other side, with the
 * beads it pushes along; a drag of half a bead does the same; keys work as on a slider (beadFrame.ts sliderKey).
 */
function Rod({ id, hint, row, r, total, interactive, display, sum, t, onPush, current }: RodProps) {
  const pushed = rowCount(row);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ bead: number; x: number; pushed: number; moved: boolean } | null>(null);
  /** A pointer's x in the units of the rod (beadX), whatever the width on screen. */
  const units = (clientX: number) => {
    const box = svg.current!.getBoundingClientRect();
    return ((clientX - box.left) * ROD) / (box.width || 1);
  };
  const red = Math.min(pushed, FIVE);
  const second = row.filter((fill) => fill === 2).length;

  const handlers = interactive
    ? {
        onPointerDown: (e: PointerEvent) => {
          const bead = (e.target as Element).closest?.("[data-bead]");
          if (!bead || e.button > 0) return;
          capture(e.currentTarget as Element, e.pointerId);
          drag.current = { bead: Number(bead.getAttribute("data-bead")), x: units(e.clientX), pushed, moved: false };
        },
        onPointerMove: (e: PointerEvent) => {
          const d = drag.current;
          if (!d) return;
          const dx = units(e.clientX) - d.x;
          if (Math.abs(dx) > CLICK) d.moved = true;
          if (d.moved) onPush(r, dragCount(d.bead, d.pushed, dx));
        },
        onPointerUp: () => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) onPush(r, clickCount(d.bead, d.pushed));
        },
        onPointerCancel: () => (drag.current = null),
        onKeyDown: (e: KeyboardEvent) => {
          const next = sliderKey(e.key, rowCount(current()[r] ?? row));
          if (next === null) return;
          e.preventDefault();
          onPush(r, next);
        },
      }
    : {};

  return (
    <div
      className={`rod ${r === FIVE ? "five" : ""}`}
      data-row={r}
      role={display ? undefined : "slider"}
      tabIndex={display ? undefined : 0}
      aria-label={display ? undefined : t.row(r + 1)}
      aria-describedby={display || !interactive ? undefined : hint}
      aria-orientation={display ? undefined : "horizontal"}
      aria-valuemin={display ? undefined : 0}
      aria-valuemax={display ? undefined : PER_ROW}
      aria-valuenow={display ? undefined : pushed}
      aria-valuetext={display ? undefined : t.rowValue(pushed, red, pushed - red, second, total, sum)}
      aria-disabled={display || interactive ? undefined : "true"}
      {...handlers}
    >
      <svg ref={svg} viewBox={`0 0 ${ROD} ${HEIGHT}`} className="block w-full" aria-hidden="true">
        <defs>
          <radialGradient id={`${id}-red`} cx="35%" cy="30%" r="75%">
            <stop offset="0" stop-color="#f87171" />
            <stop offset="0.55" stop-color="#dc2626" />
            <stop offset="1" stop-color="#991b1b" />
          </radialGradient>
          <radialGradient id={`${id}-white`} cx="35%" cy="30%" r="75%">
            <stop offset="0" stop-color="#ffffff" />
            <stop offset="0.6" stop-color="#f8fafc" />
            <stop offset="1" stop-color="#cbd5e1" />
          </radialGradient>
        </defs>
        <line x1={0} x2={ROD} y1={HEIGHT / 2} y2={HEIGHT / 2} stroke="#64748b" stroke-width={3} stroke-linecap="round" />
        {row.map((fill, i) => (
          <g key={i} data-bead={i} className="bead" style={{ transform: `translate(${beadX(i, pushed)}px, ${HEIGHT / 2}px)` }}>
            <circle
              r={BEAD / 2 - 1.5}
              fill={`url(#${id}-${i < FIVE ? "red" : "white"})`}
              stroke={i < FIVE ? "#7f1d1d" : "#64748b"}
              stroke-width={1.5}
            />
            {fill === 2 && <circle r={5.5} fill="#1d4ed8" stroke="#ffffff" stroke-width={2} />}
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * The hundred field: a checkbox per square, one tab stop (the arrow keys move within the field), space or Enter colours
 * a square or takes its colour off. A drag colours (or uncolours) every square it passes.
 */
function HundredField({ grid, look, interactive, display, sum, pen, t, onPaint, current }: FrameProps) {
  const [active, setActive] = useState<[number, number]>([0, 0]);
  const field = useRef<HTMLDivElement>(null);
  const painting = useRef<Fill | null>(null);

  const cellOf = (element: Element | null): [number, number] | null => {
    const cell = element?.closest?.("[data-cell]");
    if (!cell) return null;
    const [r, c] = cell.getAttribute("data-cell")!.split("-").map(Number);
    return [r, c];
  };
  const focusCell = (r: number, c: number) => {
    setActive([r, c]);
    field.current?.querySelector<HTMLElement>(`[data-cell="${r}-${c}"]`)?.focus();
  };

  const handlers = interactive
    ? {
        onPointerDown: (e: PointerEvent) => {
          const cell = cellOf(e.target as Element);
          if (!cell || e.button > 0) return;
          const [r, c] = cell;
          painting.current = toggleFill(current()[r][c], pen);
          onPaint(r, c, painting.current);
          focusCell(r, c);
          capture(field.current, e.pointerId);
          e.preventDefault();
        },
        onPointerMove: (e: PointerEvent) => {
          if (painting.current === null) return;
          const root = field.current?.getRootNode() as Document | ShadowRoot | undefined;
          const cell = cellOf(root?.elementFromPoint?.(e.clientX, e.clientY) ?? null);
          if (cell) onPaint(cell[0], cell[1], painting.current);
        },
        onPointerUp: () => (painting.current = null),
        onPointerCancel: () => (painting.current = null),
      }
    : {};

  const onKey = (e: KeyboardEvent, r: number, c: number) => {
    const move = gridKey(e.key, r, c, grid.length);
    if (move) {
      e.preventDefault();
      focusCell(move[0], move[1]);
    } else if (interactive && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      onPaint(r, c, toggleFill(current()[r][c], pen));
    }
  };

  return (
    <div
      ref={field}
      className={`field ${look} ${interactive ? "interactive" : ""}`}
      role={display ? "img" : "group"}
      aria-label={display ? t.shows("hundred", grid.map(rowCount)) : t.field(grid.length)}
      {...handlers}
    >
      {grid.map((row, r) => (
        <div key={r} className={`field-row ${r === FIVE ? "five" : ""}`}>
          {row.map((fill, c) => {
            const state = sum ? t.squareState(fill, true) : "";
            return (
              <div
                key={c}
                data-cell={`${r}-${c}`}
                className={`place fill-${fill} ${c === FIVE ? "five" : ""}`}
                role={display ? undefined : "checkbox"}
                aria-checked={display ? undefined : fill !== 0}
                aria-label={display ? undefined : `${t.square(r + 1, c + 1)}${state ? `: ${state}` : ""}`}
                aria-disabled={display || interactive ? undefined : "true"}
                tabIndex={display ? undefined : r === active[0] && c === active[1] ? 0 : -1}
                onKeyDown={display ? undefined : (e: KeyboardEvent) => onKey(e, r, c)}
              >
                {look === "dots" && <span className="dot" />}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** A small picture of a part: a bead (with the dot of the second part) or a square (striped for the second part). */
export function Swatch({ model, part }: { model: Model; part: 1 | 2 }) {
  if (model === "hundred") return <span className={`swatch place fill-${part}`} aria-hidden="true" />;
  return (
    <svg viewBox="-12 -12 24 24" className="swatch" aria-hidden="true">
      <circle r={10.5} fill="#dc2626" stroke="#7f1d1d" stroke-width={1.5} />
      {part === 2 && <circle r={4.5} fill="#1d4ed8" stroke="#ffffff" stroke-width={1.8} />}
    </svg>
  );
}

/** The two parts of a sum, one picked: a radio group, the arrow keys move between them. */
export function Pens({ model, pen, onPen, t, labels }: { model: Model; pen: 1 | 2; onPen: (pen: 1 | 2) => void; t: Texts; labels: [string, string] }) {
  const group = useRef<HTMLDivElement>(null);
  const pick = (part: 1 | 2) => {
    onPen(part);
    group.current?.querySelector<HTMLElement>(`[data-pen="${part}"]`)?.focus();
  };
  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={t.pens}
      className="pens"
      onKeyDown={(e) => {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
          e.preventDefault();
          pick(pen === 1 ? 2 : 1);
        }
      }}
    >
      <span className="text-sm font-semibold text-slate-600" aria-hidden="true">
        {t.pens}
      </span>
      {([1, 2] as const).map((part) => (
        <Pen key={part} part={part} checked={pen === part} onPick={() => pick(part)}>
          <Swatch model={model} part={part} />
          {labels[part - 1]}
        </Pen>
      ))}
    </div>
  );
}

function Pen({ part, checked, onPick, children }: { part: 1 | 2; checked: boolean; onPick: () => void; children: ComponentChildren }) {
  return (
    <button type="button" role="radio" data-pen={part} aria-checked={checked} tabIndex={checked ? 0 : -1} onClick={onPick} className={`pen ${checked ? "checked" : ""}`}>
      {children}
    </button>
  );
}
