/*
 * The floor plan of the floor covering task: the room on squared paper, its walls with their lengths in metres, the door,
 * and the strips laid on it. Used by the interaction and by the authoring mode.
 *
 * Three layers: an SVG with the paper and the floor, the strips as HTML elements on top of it (so `touch-action: none`
 * holds on a strip only, and a finger can still scroll the page from the rest of the plan), and an SVG with the walls,
 * the door and the lengths on top of everything, that lets the pointer through.
 *
 * A strip is dragged to move it (it snaps to the squares), and its round handle at the end is dragged to make it longer
 * or shorter. The keyboard and the screen reader use the list of strips under the plan (coverView.tsx), which does the
 * same; so the strips here are hidden from a screen reader, and the plan itself has a description in words.
 */
import { useRef } from "preact/hooks";
import { decimal, doorOf, fitStrip, resizeStrip, stripBox, walls, type CoverSettings, type Strip, type Wall } from "./cover.ts";
import type { CoverTexts } from "./coverTexts.ts";

/** A square in the SVG's own units; the margins around the paper (for the lengths of the walls), in squares. */
const S = 40;
const MX = 1.6;
const MY = 1.1;

type Props = {
  s: CoverSettings;
  t: CoverTexts;
  language: string;
  strips: Strip[];
  /** the strip chosen: outlined, with its handle */
  selected: number | null;
  /** the strips can be moved and resized */
  editable: boolean;
  /** the width of a square on screen, in pixels */
  cellSize?: number;
  onSelect?: (index: number) => void;
  /** a strip changed by a drag; `done` when the drag ended (or was cancelled and put back) */
  onStrip?: (index: number, strip: Strip, done: boolean) => void;
};

type Drag = { kind: "move" | "length"; index: number; start: Strip; last: Strip; x: number; y: number; pointerId: number; moved: boolean };

const same = (a: Strip, b: Strip) => a.x === b.x && a.y === b.y && a.length === b.length && a.vertical === b.vertical;

/** The unit vector of a wall and the normal into the room (walking clockwise, y down, the floor is on the right). */
const directions = (w: Wall) => {
  const dx = Math.sign(w.x2 - w.x1), dy = Math.sign(w.y2 - w.y1);
  return { dx, dy, nx: -dy, ny: dx };
};

type Box = { x1: number; y1: number; x2: number; y2: number };
/** Whether two boxes overlap, or come closer than `gap` squares. */
const overlaps = (a: Box, b: Box, gap = 0) => a.x1 < b.x2 + gap && b.x1 < a.x2 + gap && a.y1 < b.y2 + gap && b.y1 < a.y2 + gap;
/** The box of a text of `chars` characters, in squares (17 units of 40 a square, about 0.6 em a character). */
const TEXT_H = 0.42;
const textWidth = (chars: number) => chars * 0.26;

export type WallLabel = { x: number; y: number; anchor: "start" | "middle" | "end"; text: string };

/**
 * Where the length of each wall goes: outside the room, next to the middle of the wall. A short wall (a chimney breast,
 * an inner corner) has little room, so the longest walls are placed first, and a label that would cover another label
 * or a wall moves further out, step by step; when no place is free it stays next to its wall.
 */
export function wallLabels(list: Wall[], texts: string[], reserved: Box[] = []): (WallLabel | null)[] {
  const placed: Box[] = [...reserved];
  const lines: Box[] = list.map((w) => ({ x1: Math.min(w.x1, w.x2) - 0.04, y1: Math.min(w.y1, w.y2) - 0.04, x2: Math.max(w.x1, w.x2) + 0.04, y2: Math.max(w.y1, w.y2) + 0.04 }));
  const result: (WallLabel | null)[] = list.map(() => null);
  const order = list.map((_, i) => i).sort((a, b) => list[b].length - list[a].length || a - b);
  for (const i of order) {
    const w = list[i];
    const { nx, ny } = directions(w);
    const ox = -nx, oy = -ny; // outward
    const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
    const width = textWidth(texts[i].length);
    let chosen: { label: WallLabel; box: Box } | null = null;
    // next to the middle of the wall; else slid along it (still next to it); else further out
    const slides = [0, 0.3, -0.3, 0.6, -0.6].filter((t) => Math.abs(t) <= w.length / 2 - 0.15 || t === 0);
    const candidates = [0.25, 0.7, 1.15, 1.6].flatMap((d) => slides.map((along) => ({ d, along })));
    for (const { d, along } of candidates) {
      let label: WallLabel, box: Box;
      if (oy !== 0) {
        const cx = mx + along, cy = my + oy * (d + TEXT_H / 2);
        box = { x1: cx - width / 2, y1: cy - TEXT_H / 2, x2: cx + width / 2, y2: cy + TEXT_H / 2 };
        label = { x: cx, y: cy + 0.15, anchor: "middle", text: texts[i] };
      } else {
        const x = mx + ox * d, cy = my + along;
        box = { x1: ox > 0 ? x : x - width, y1: cy - TEXT_H / 2, x2: ox > 0 ? x + width : x, y2: cy + TEXT_H / 2 };
        label = { x, y: cy + 0.15, anchor: ox > 0 ? "start" : "end", text: texts[i] };
      }
      const free = !placed.some((b) => overlaps(b, box, 0.2)) && !lines.some((b, j) => j !== i && overlaps(b, box));
      if (free || !chosen) chosen = { label, box };
      if (free) break;
    }
    if (chosen && !placed.some((b) => overlaps(b, chosen!.box))) {
      placed.push(chosen.box);
      result[i] = chosen.label;
    } else {
      // nothing free: next to its wall
      const d = 0.25;
      result[i] = oy !== 0
        ? { x: mx, y: my + oy * (d + TEXT_H / 2) + 0.15, anchor: "middle", text: texts[i] }
        : { x: mx + ox * d, y: my + 0.15, anchor: ox > 0 ? "start" : "end", text: texts[i] };
    }
  }
  return result;
}

/** The description of the plan, for a screen reader. */
export function planDescription(s: CoverSettings, t: CoverTexts, language: string): string {
  const list = walls(s.room);
  const door = doorOf(s);
  const xs = s.room.cells.map((v, i) => (v ? i % s.columns : Infinity));
  const ys = s.room.cells.map((v, i) => (v ? Math.floor(i / s.columns) : Infinity));
  const lengths = list.map((w, i) => {
    const text = `${decimal(w.length * s.scale, language)} m`;
    return door && door.wall === i + 1 ? t.wallWithDoor(text, s.doorWidth) : text;
  });
  return t.description(s.columns, s.rows, s.scale, Math.min(...xs) * s.scale, Math.min(...ys) * s.scale, lengths.join(", "));
}

export function PlanView({ s, t, language, strips, selected, editable, cellSize = 36, onSelect, onStrip }: Props) {
  const { columns, rows, room, width } = s;
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Set<number>());
  const totalX = columns + 2 * MX, totalY = rows + 2 * MY;
  const viewBox = `${-MX * S} ${-MY * S} ${totalX * S} ${totalY * S}`;
  const list = walls(room);
  const door = doorOf(s);

  /** The size of a square on screen now, in pixels. */
  const unit = () => (box.current ? box.current.getBoundingClientRect().width / totalX : cellSize);

  const cancel = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !same(d.last, d.start)) onStrip?.(d.index, d.start, true); // put back: a cancelled drag (a pinch, a scroll) does nothing
  };

  const begin = (event: PointerEvent, index: number, kind: Drag["kind"]) => {
    if (!editable || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.stopPropagation();
    if (pointers.current.size > 1) return cancel(); // two fingers: a pinch, never a drag
    event.preventDefault();
    try {
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    } catch {
      // a pointer the browser does not know (a test): the moves still arrive on the strip
    }
    drag.current = { kind, index, start: strips[index], last: strips[index], x: event.clientX, y: event.clientY, pointerId: event.pointerId, moved: false };
    onSelect?.(index);
  };

  const move = (event: PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const dx = event.clientX - d.x, dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 10) return; // a tap: a finger moves a little
    d.moved = true;
    const u = unit();
    const next =
      d.kind === "move"
        ? fitStrip({ ...d.start, x: d.start.x + Math.round(dx / u), y: d.start.y + Math.round(dy / u) }, width, columns, rows)
        : resizeStrip(d.start, d.start.length + Math.round((d.start.vertical ? dy : dx) / u), columns, rows);
    if (next && !same(next, d.last)) {
      d.last = next;
      onStrip?.(d.index, next, false);
    }
  };

  const end = (event: PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    drag.current = null;
    if (d.moved && !same(d.last, d.start)) onStrip?.(d.index, d.last, true);
  };

  // every finger on the plan, to tell a pinch from a drag; a primary pointer means no other one is down
  const down = (event: PointerEvent) => {
    if (event.isPrimary) pointers.current.clear();
    pointers.current.add(event.pointerId);
    if (pointers.current.size > 1) cancel();
  };
  const up = (event: PointerEvent) => pointers.current.delete(event.pointerId);

  const percent = (n: number, total: number) => `${(n / total) * 100}%`;
  /** a white edge around a text, so it stays readable over a strip or a line */
  const halo = { "paint-order": "stroke", stroke: "#fff", "stroke-width": "5", "stroke-linejoin": "round" as const };

  // the walls, with a gap for the door
  const wallLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  let doorLeaf: { hx: number; hy: number; lx: number; ly: number; ex: number; ey: number; r: number; tx: number; ty: number } | null = null;
  list.forEach((w, i) => {
    if (door && door.wall === i + 1) {
      const { dx, dy, nx, ny } = directions(w);
      const ax = w.x1 + dx * door.from, ay = w.y1 + dy * door.from, bx = w.x1 + dx * door.to, by = w.y1 + dy * door.to;
      wallLines.push({ x1: w.x1, y1: w.y1, x2: ax, y2: ay }, { x1: bx, y1: by, x2: w.x2, y2: w.y2 });
      const r = door.to - door.from;
      doorLeaf = { hx: ax, hy: ay, lx: ax + nx * r, ly: ay + ny * r, ex: bx, ey: by, r, tx: (ax + bx) / 2 + nx * (r + 0.45), ty: (ay + by) / 2 + ny * (r + 0.45) };
    } else {
      wallLines.push({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 });
    }
  });
  const leaf = doorLeaf as typeof doorLeaf;
  const doorText = t.door(s.doorWidth);
  const doorBox: Box[] = leaf
    ? [{ x1: leaf.tx - textWidth(doorText.length) * 0.45, y1: leaf.ty - 0.25, x2: leaf.tx + textWidth(doorText.length) * 0.45, y2: leaf.ty + 0.2 }]
    : [];
  const labels = wallLabels(list, list.map((w) => `${decimal(w.length * s.scale, language)} m`), doorBox);

  return (
    <div
      ref={box}
      className="relative max-w-full select-none"
      style={{ width: `${totalX * cellSize}px` }}
      onPointerDownCapture={down}
      onPointerUpCapture={up}
      onPointerCancelCapture={up}
      data-plan
    >
      <svg role="img" aria-label={planDescription(s, t, language)} viewBox={viewBox} className="block h-auto w-full">
        <rect x="0" y="0" width={columns * S} height={rows * S} fill="#fff" />
        <g data-floor>
          {room.cells.map((v, i) =>
            v ? <rect key={i} x={(i % columns) * S} y={Math.floor(i / columns) * S} width={S} height={S} fill="#fdecc8" /> : null
          )}
        </g>
        <g stroke="#b4bfcd" stroke-width="1">
          {Array.from({ length: columns + 1 }, (_, x) => (
            <line key={`v${x}`} x1={x * S} y1="0" x2={x * S} y2={rows * S} />
          ))}
          {Array.from({ length: rows + 1 }, (_, y) => (
            <line key={`h${y}`} x1="0" y1={y * S} x2={columns * S} y2={y * S} />
          ))}
        </g>
      </svg>

      {/* the strips: HTML, so touch-action holds on a strip only */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {strips.map((strip, index) => {
          const b = stripBox(strip, width);
          const chosen = index === selected;
          return (
            <div
              key={index}
              className={`strip ${editable ? "editable" : ""} ${chosen ? "selected" : ""}`}
              data-strip={index}
              style={{
                left: percent(MX + b.x, totalX),
                top: percent(MY + b.y, totalY),
                width: percent(b.w, totalX),
                height: percent(b.h, totalY),
                zIndex: chosen ? 2 : 1,
              }}
              onPointerDown={(event) => begin(event, index, "move")}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={cancel}
            >
              <span className="strip-label">
                {index + 1} {strip.vertical ? "↓" : "→"}
              </span>
              {chosen && editable && (
                <span
                  className={`strip-handle ${strip.vertical ? "down" : "across"}`}
                  data-handle
                  title={t.strips.length}
                  onPointerDown={(event) => begin(event, index, "length")}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* the walls, the door and the lengths, on top; the pointer goes through */}
      <svg aria-hidden="true" viewBox={viewBox} className="pointer-events-none absolute inset-0 h-full w-full" data-walls>
        <g stroke="#0f172a" stroke-width="6" stroke-linecap="square">
          {wallLines.map((l, i) => (
            <line key={i} x1={l.x1 * S} y1={l.y1 * S} x2={l.x2 * S} y2={l.y2 * S} />
          ))}
        </g>
        {leaf && (
          <g fill="none" stroke="#0f172a" stroke-width="2" data-door>
            <line x1={leaf.hx * S} y1={leaf.hy * S} x2={leaf.lx * S} y2={leaf.ly * S} />
            <path d={`M ${leaf.lx * S} ${leaf.ly * S} A ${leaf.r * S} ${leaf.r * S} 0 0 0 ${leaf.ex * S} ${leaf.ey * S}`} stroke-dasharray="5 4" />
            <text x={leaf.tx * S} y={leaf.ty * S + 6} fill="#0f172a" font-size="15" text-anchor="middle" {...halo}>
              {doorText}
            </text>
          </g>
        )}
        <g font-size="17" font-weight="600" fill="#0f172a" data-lengths>
          {labels.map((label, i) =>
            label ? (
              <text key={i} x={label.x * S} y={label.y * S} text-anchor={label.anchor} {...halo}>
                {label.text}
              </text>
            ) : null
          )}
        </g>
      </svg>
    </div>
  );
}
