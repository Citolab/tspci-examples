import { useRef, useState } from "preact/hooks";
import { Model, ModelState } from "./fraction";
import { BAR, CIRCLE, SET, barPart, gridCell, gridCellSize, nextPart, scaleTicks, sectorPath, setCentre, setColumns } from "./geometry";
import { Texts } from "./texts";

// One model drawn as SVG: a bar with an optional percentage scale, a circle, a grid or a set. When the parts can be
// shaded each part is a checkbox (roving tabindex: one Tab stop per model, the arrow keys go along the parts); a click
// shades or unshades a part, dragging carries that over every part the pointer passes. Shaded parts are blue AND
// hatched, so the shading never depends on colour alone.

let counter = 0;

const PAD = 4;

type Shape = { kind: "rect"; x: number; y: number; width: number; height: number } | { kind: "path"; d: string } | { kind: "circle"; cx: number; cy: number; r: number };

const shapes = (model: Model, parts: number): { shapes: Shape[]; width: number; height: number; columns: number } => {
  switch (model.type) {
    case "bar": {
      return {
        shapes: Array.from({ length: parts }, (_, i) => ({ kind: "rect" as const, ...barPart(i, parts) })),
        width: BAR.width, height: BAR.height, columns: 0,
      };
    }
    case "circle": {
      const size = CIRCLE.r * 2;
      return {
        shapes: Array.from({ length: parts }, (_, i) => ({ kind: "path" as const, d: sectorPath(i, parts, CIRCLE.r, CIRCLE.r, CIRCLE.r) })),
        width: size, height: size, columns: 0,
      };
    }
    case "grid": {
      const size = gridCellSize(model.rows, model.columns);
      return {
        shapes: Array.from({ length: parts }, (_, i) => ({ kind: "rect" as const, ...gridCell(i, model.columns, size) })),
        width: size * model.columns, height: size * model.rows, columns: model.columns,
      };
    }
    case "set": {
      const columns = setColumns(parts);
      return {
        shapes: Array.from({ length: parts }, (_, i) => { const c = setCentre(i, columns); return { kind: "circle" as const, cx: c.x, cy: c.y, r: SET.r }; }),
        width: columns * SET.gap, height: Math.ceil(parts / columns) * SET.gap, columns,
      };
    }
  }
};

const ShapeEl = ({ shape, ...rest }: { shape: Shape } & Record<string, unknown>) =>
  shape.kind === "rect" ? <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} {...rest} />
    : shape.kind === "path" ? <path d={shape.d} {...rest} />
      : <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...rest} />;

export const ModelView = ({ model, state, texts, name, interactive, onToggle, onPaintEnd, testid }: {
  model: Model;
  state: ModelState;
  texts: Texts;
  /** "Bar A" */
  name: string;
  /** the parts can be shaded (else the model is a picture with a description) */
  interactive: boolean;
  /** shade (on) or unshade a part; `drag` while painting */
  onToggle?: (part: number, on: boolean, drag: boolean) => void;
  /** a drag over parts ended */
  onPaintEnd?: () => void;
  testid?: string;
}) => {
  const [uid] = useState(() => `fm${++counter}`);
  const [active, setActive] = useState(0);
  const [focus, setFocus] = useState<number | null>(null);
  const painting = useRef<{ on: boolean; moved: boolean; x: number; y: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const parts = state.parts;
  const { shapes: list, width, height, columns } = shapes(model, parts);
  const shaded = new Set(state.shaded);
  const scale = model.type === "bar" && model.scale;
  const fullHeight = height + (scale ? 30 : 0);
  const current = Math.min(active, parts - 1);
  const summary = model.type === "set" ? texts.setSummary(parts, shaded.size) : texts.summary(parts, shaded.size);

  const partAt = (x: number, y: number, target: EventTarget | null): number | null => {
    const root = svg.current?.getRootNode() as Document | ShadowRoot | undefined;
    const el = (root?.elementFromPoint?.(x, y) ?? (target as Element)) as Element | null;
    const part = el?.closest?.("[data-part]");
    if (!part || !svg.current?.contains(part)) return null;
    const i = Number(part.getAttribute("data-part"));
    return Number.isInteger(i) ? i : null;
  };

  const down = (e: PointerEvent, i: number) => {
    if (!interactive || e.button !== 0) return;
    e.preventDefault();
    const on = !shaded.has(i);
    painting.current = { on, moved: false, x: e.clientX, y: e.clientY };
    setActive(i);
    (e.currentTarget as SVGElement).focus?.({ preventScroll: true } as FocusOptions);
    try {
      svg.current?.setPointerCapture(e.pointerId);
    } catch {
      // a synthetic pointer: the moves arrive at the parts and bubble up
    }
    onToggle?.(i, on, false);
  };
  const move = (e: PointerEvent) => {
    const p = painting.current;
    if (!p) return;
    // a fast pointer jumps over parts: look at every few pixels between the last position and this one
    const steps = Math.max(1, Math.ceil(Math.hypot(e.clientX - p.x, e.clientY - p.y) / 6));
    const seen = new Set<number>();
    for (let k = 1; k <= steps; k++) {
      const i = partAt(p.x + ((e.clientX - p.x) * k) / steps, p.y + ((e.clientY - p.y) * k) / steps, k === steps ? e.target : null);
      if (i === null || seen.has(i)) continue;
      seen.add(i);
      if (shaded.has(i) === p.on) continue;
      p.moved = true;
      onToggle?.(i, p.on, true);
    }
    p.x = e.clientX;
    p.y = e.clientY;
  };
  const up = () => {
    const p = painting.current;
    painting.current = null;
    if (p?.moved) onPaintEnd?.();
  };

  const key = (e: KeyboardEvent, i: number) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onToggle?.(i, !shaded.has(i), false);
      return;
    }
    const next = nextPart(e.key, i, parts, columns);
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    (svg.current?.querySelector(`[data-part="${next}"]`) as SVGElement | null)?.focus();
  };

  const hatch = `${uid}-hatch`;
  const focused = focus !== null && focus < parts ? list[focus] : null;
  return (
    <svg ref={svg} width={width + PAD * 2} height={fullHeight + PAD * 2} viewBox={`${-PAD} ${-PAD} ${width + PAD * 2} ${fullHeight + PAD * 2}`}
      class={`fm-model block max-w-full overflow-visible ${interactive ? "fm-interactive touch-none select-none" : ""}`}
      role={interactive ? "group" : "img"} aria-label={`${name}: ${summary}${interactive ? "" : `, ${texts.given}`}`}
      data-testid={testid} data-parts={parts} data-shaded={state.shaded.join(",")}
      onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>
      <defs>
        <pattern id={hatch} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <rect width="8" height="8" class="fm-shade" />
          <line x1="0" y1="0" x2="0" y2="8" class="fm-hatch" stroke-width="3" />
        </pattern>
      </defs>
      {list.map((shape, i) => {
        const on = shaded.has(i);
        const common = {
          shape,
          "data-part": i,
          "data-on": on ? "true" : "false",
          style: on ? { fill: `url(#${hatch})` } : undefined,
          class: `fm-part ${on ? "fm-on" : ""}`,
        };
        if (!interactive) return <ShapeEl key={i} {...common} aria-hidden="true" />;
        return (
          <ShapeEl key={i} {...common} role="checkbox" aria-checked={on ? "true" : "false"} aria-label={texts.part(model.type, i, parts, columns)}
            tabindex={i === current ? 0 : -1}
            onPointerDown={(e: PointerEvent) => down(e, i)}
            onKeyDown={(e: KeyboardEvent) => key(e, i)}
            onFocus={(e: FocusEvent) => {
              setActive(i);
              setFocus((e.currentTarget as Element).matches(":focus-visible") ? i : null);
            }}
            onBlur={() => setFocus(null)} />
        );
      })}
      {focused && <ShapeEl shape={focused} class="fm-focus" fill="none" aria-hidden="true" />}
      {scale && (
        <g aria-hidden="true" class="fm-scale" transform={`translate(0 ${height})`}>
          <line x1="0" x2={width} y1="0" y2="0" />
          {scaleTicks(width).map((t) => (
            <g key={t.percent}>
              <line x1={t.x} x2={t.x} y1="0" y2={t.major ? 9 : 5} />
              {t.major && <text x={t.x} y="22" text-anchor="middle">{t.percent}%</text>}
            </g>
          ))}
        </g>
      )}
    </svg>
  );
};
