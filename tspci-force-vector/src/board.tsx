import { useRef, useState } from "preact/hooks";
import { EXAMPLE_SVG } from "./example";
import { Texts } from "./texts";
import {
  ArrowDef, Bounds, DrawOptions, MIN_LENGTH, Point, Tolerance, Vector, clampPoint, endPoint, firstVector, formatNumber,
  labelParts, makeVector, numberSetting, nudge, snapStart,
} from "./vector";

// The drawing: the picture, the arrows and the ruler, in an SVG of data-width × data-height pixels. Everything is in
// cm (vector.ts), times pixelsPerCm on screen. The candidate's view and the authoring mode both use it.

export type ShowLabel = "both" | "newton" | "cm" | "none";
export type Settings = {
  width: number;
  height: number;
  pixelsPerCm: number;
  newtonPerCm: number;
  showLabel: ShowLabel;
  decimals: number;
  angleSnap: number;
  lengthStep: number;
  grid: boolean;
  /** The picture, as the href of an SVG image. */
  background: string;
  language: string;
};

const svgDataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
/** data-background: SVG markup, a URL, or empty for the example. As an <image>: scripts in an SVG never run. */
export const backgroundHref = (value: string) => {
  const v = (value ?? "").trim();
  if (!v) return svgDataUri(EXAMPLE_SVG);
  return v.startsWith("<") ? svgDataUri(v) : v;
};

/** The data- attributes as numbers and choices, within sensible limits. */
export const readSettings = (p: Record<string, string>): Settings => ({
  width: Math.round(numberSetting(p.width, 560, 200, 1200)),
  height: Math.round(numberSetting(p.height, 400, 150, 1000)),
  pixelsPerCm: numberSetting(p.pixelsPerCm, 40, 10, 200),
  newtonPerCm: numberSetting(p.newtonPerCm, 10, 0),
  showLabel: (["both", "newton", "cm", "none"].includes(p.showLabel) ? p.showLabel : "both") as ShowLabel,
  decimals: Math.round(numberSetting(p.decimals, 0, 0, 3)),
  angleSnap: numberSetting(p.angleSnap, 1, 0, 90),
  lengthStep: numberSetting(p.lengthStep, 0.1, 0, 5),
  grid: String(p.grid) === "true",
  background: backgroundHref(p.background),
  language: (p.language ?? "en").slice(0, 2).toLowerCase(),
});

export const boundsOf = (s: Settings): Bounds => ({ width: s.width / s.pixelsPerCm, height: s.height / s.pixelsPerCm });
export const drawOptions = (s: Settings): DrawOptions => ({ bounds: boundsOf(s), angleSnap: s.angleSnap, lengthStep: s.lengthStep });

export const ARROW_COLORS = ["#1d4ed8", "#be185d", "#7c3aed", "#c2410c", "#0e7490", "#4d7c0f"];
export const CORRECT_COLOR = "#15803d";
export const colorOf = (i: number) => ARROW_COLORS[i % ARROW_COLORS.length];

/** "F_z" as text for a screen reader and the chips: "Fz". */
export const plainLabel = (label: string) => {
  const { main, sub } = labelParts(label);
  return main + sub;
};
/** "F_z" with z as a subscript, in HTML. */
export const Label = ({ label }: { label: string }) => {
  const { main, sub } = labelParts(label);
  return <span>{main}{sub && <sub>{sub}</sub>}</span>;
};

export const newtonOf = (v: Vector, s: Settings) => formatNumber(v.length * s.newtonPerCm, s.decimals, s.language);
export const cmOf = (v: Vector, s: Settings) => formatNumber(v.length, 1, s.language);
/** What the arrow says: "30 N", "3.0 cm", or both. */
export const sizeText = (v: Vector, s: Settings, show: ShowLabel = s.showLabel) =>
  show === "newton" ? `${newtonOf(v, s)} N` : show === "cm" ? `${cmOf(v, s)} cm` : show === "both" ? `${newtonOf(v, s)} N · ${cmOf(v, s)} cm` : "";
/** For a screen reader: the size (unless the candidate has to measure), the direction and where it starts. */
export const describe = (def: ArrowDef, v: Vector | null, s: Settings, t: Texts, fixed: boolean) => {
  const name = plainLabel(def.label);
  if (!v) return `${name}: ${t.notDrawn}`;
  const parts = [
    s.showLabel === "none" ? null : t.value(newtonOf(v, s), cmOf(v, s)),
    t.direction(formatNumber(v.angle, Number.isInteger(v.angle) ? 0 : 1, s.language)),
    fixed && def.point ? t.pointAt(def.point) : t.startAt(formatNumber(v.x, 1, s.language), formatNumber(v.y, 1, s.language)),
  ];
  return `${name}: ${parts.filter(Boolean).join(", ")}`;
};

type Drag =
  | { kind: "draw"; index: number; start: Point }
  | { kind: "head"; index: number; start: Point }
  | { kind: "move"; index: number; offset: Point; vector: Vector }
  | { kind: "ruler-move"; offset: Point }
  | { kind: "ruler-rotate" };

type Ruler = { x: number; y: number; angle: number };

/** An annular sector around (cx, cy) in px, between two directions (degrees, counter-clockwise): where the head may end. */
const sector = (cx: number, cy: number, r1: number, r2: number, a1: number, a2: number) => {
  const at = (r: number, a: number) => `${cx + r * Math.cos((a * Math.PI) / 180)} ${cy - r * Math.sin((a * Math.PI) / 180)}`;
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M ${at(r2, a1)} A ${r2} ${r2} 0 ${large} 0 ${at(r2, a2)} L ${at(r1, a2)} A ${r1} ${r1} 0 ${large} 1 ${at(r1, a1)} Z`;
};

/** The arrow itself, in px: a line and a head. */
const ArrowShape = ({ v, ppc, color, dashed = false }: { v: Vector; ppc: number; color: string; dashed?: boolean }) => {
  const s = { x: v.x * ppc, y: v.y * ppc };
  const e = endPoint(v);
  const ex = e.x * ppc;
  const ey = e.y * ppc;
  const len = v.length * ppc;
  const rad = (v.angle * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = -Math.sin(rad);
  const head = Math.min(16, len * 0.6);
  const half = head * 0.42;
  const bx = ex - ux * head;
  const by = ey - uy * head;
  return (
    <g>
      <line x1={s.x} y1={s.y} x2={ex - ux * head * 0.8} y2={ey - uy * head * 0.8} stroke={color} stroke-width={3.2}
        stroke-linecap="round" stroke-dasharray={dashed ? "7 5" : undefined} />
      <polygon points={`${ex},${ey} ${bx - uy * half},${by + ux * half} ${bx + uy * half},${by - ux * half}`}
        fill={dashed ? "white" : color} stroke={color} stroke-width={dashed ? 2 : 1} stroke-linejoin="round" />
    </g>
  );
};

/** A label next to the head: "F_z = 30 N", with z as a subscript and a white halo on the picture. */
const ArrowLabel = ({ v, ppc, color, label, text }: { v: Vector; ppc: number; color: string; label: string; text: string }) => {
  const e = endPoint(v);
  const rad = (v.angle * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = -Math.sin(rad);
  // beyond the head; beside it (on the right) when the arrow is about vertical, so the line never runs through it
  const upright = Math.abs(ux) < 0.35;
  const x = upright ? e.x * ppc + 16 : e.x * ppc + ux * 14;
  const y = upright ? e.y * ppc - uy * 6 : e.y * ppc + uy * 14;
  const anchor = upright || ux > 0 ? "start" : "end";
  const dy = upright ? 5 : uy > 0.35 ? 14 : uy < -0.35 ? -4 : 5;
  const { main, sub } = labelParts(label);
  return (
    <text x={x} y={y + dy} text-anchor={anchor} fill={color} font-size="15" font-weight="600" stroke="white" stroke-width="4"
      stroke-linejoin="round" paint-order="stroke" class="pointer-events-none select-none" aria-hidden="true">
      <tspan font-style="italic">{main}</tspan>
      {sub && <tspan dy="4" font-size="11">{sub}</tspan>}
      {text && <tspan dy={sub ? -4 : 0} font-weight="500">{` = ${text}`}</tspan>}
    </text>
  );
};

const RULER_HEIGHT = 34;

const Board = ({ settings: s, defs, arrows, fixed, active, onActive, onCommit, correct, tolerance, ruler = false, texts: t,
  label, onAnnounce, helpId, marks }: {
  settings: Settings;
  defs: ArrowDef[];
  /** One per def; null: not drawn. */
  arrows: (Vector | null)[];
  /** Per arrow: the start is given (drawn from the point), or free. */
  fixed: boolean[];
  active: number;
  onActive: (index: number) => void;
  onCommit: (index: number, vector: Vector | null) => void;
  /** The correct arrows, dashed (solution status). */
  correct?: (Vector | null)[] | null;
  /** The authoring mode: shade what is scored as correct around the arrows. */
  tolerance?: Tolerance;
  ruler?: boolean;
  texts: Texts;
  label: string;
  onAnnounce?: (text: string) => void;
  helpId?: string;
  /** The authoring mode: show the named point at the start of these arrows, though the start is free to move. */
  marks?: boolean[];
}) => {
  const ppc = s.pixelsPerCm;
  const o = drawOptions(s);
  const svg = useRef<SVGSVGElement>();
  const handles = useRef<(SVGGElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<{ index: number; vector: Vector } | null>(null);
  const [focused, setFocused] = useState<number | "ruler" | null>(null);
  // short enough to stand upright on the drawing, at most 10 cm
  const rulerLength = Math.max(2, Math.min(10, Math.floor(Math.min(o.bounds.width, o.bounds.height) - 1.5)));
  const [rulerAt, setRuler] = useState<Ruler>({ x: 0.75, y: Math.max(0.5, o.bounds.height - 1.4), angle: 0 });
  /** The ruler with its handle on the drawing: moved back as far as it sticks out. */
  const keepOn = (r: Ruler): Ruler => {
    const rad = (r.angle * Math.PI) / 180;
    const ox = r.x * ppc;
    const oy = r.y * ppc;
    const corners = [[-0.4 * ppc, 0], [-0.4 * ppc, RULER_HEIGHT], [(rulerLength + 0.4) * ppc + 28, 0], [(rulerLength + 0.4) * ppc + 28, RULER_HEIGHT]]
      .map(([x, y]) => [ox + x * Math.cos(rad) - y * Math.sin(rad), oy + x * Math.sin(rad) + y * Math.cos(rad)]);
    const shift = (lo: number, hi: number, size: number) => (lo < 0 ? -lo : hi > size ? Math.max(size - hi, -lo) : 0);
    const dx = shift(Math.min(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[0])), s.width);
    const dy = shift(Math.min(...corners.map((c) => c[1])), Math.max(...corners.map((c) => c[1])), s.height);
    return { ...r, x: (ox + dx) / ppc, y: (oy + dy) / ppc };
  };
  const setRulerAt = (change: (r: Ruler) => Ruler) => setRuler((r) => keepOn(change(r)));

  const shown = arrows.map((v, i) => (preview?.index === i ? preview.vector : v));
  const announce = (i: number, v: Vector | null) => onAnnounce?.(describe(defs[i], v, s, t, fixed[i]));

  const toCm = (e: PointerEvent): Point => {
    const pt = svg.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.current.getScreenCTM().inverse());
    return { x: p.x / ppc, y: p.y / ppc };
  };
  const begin = (e: PointerEvent, d: Drag) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      svg.current.setPointerCapture?.(e.pointerId); // keeps the drag when the pointer leaves the drawing
    } catch {
      // a pointer that is already gone: the drag still works inside the drawing
    }
    setDrag(d);
  };
  const focusArrow = (i: number) => handles.current[i]?.focus({ preventScroll: true });

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const p = toCm(e);
    // on (or near) a given point: that arrow; anywhere else: the selected arrow
    const near = defs.findIndex((d, j) => fixed[j] && d.start && Math.hypot(d.start.x - p.x, d.start.y - p.y) * ppc < 18);
    const i = near >= 0 ? near : active;
    // away from its point, an arrow with a given start is only drawn while it is not there yet: a stray click keeps it
    if (near < 0 && fixed[i] && arrows[i]) return;
    const start = fixed[i] && defs[i].start ? defs[i].start : snapStart(p, o.bounds);
    onActive(i);
    begin(e, { kind: "draw", index: i, start });
  };

  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const p = toCm(e);
    if (drag.kind === "draw") {
      const v = makeVector(drag.start, p, o);
      setPreview(v.length >= MIN_LENGTH ? { index: drag.index, vector: v } : null);
    } else if (drag.kind === "head") {
      const v = makeVector(drag.start, p, o);
      if (v.length >= MIN_LENGTH) setPreview({ index: drag.index, vector: v });
    } else if (drag.kind === "move") {
      const start = snapStart({ x: p.x + drag.offset.x, y: p.y + drag.offset.y }, o.bounds);
      const end = endPoint(drag.vector);
      const v = makeVector(start, { x: start.x + end.x - drag.vector.x, y: start.y + end.y - drag.vector.y }, { ...o, angleSnap: 0, lengthStep: 0 });
      setPreview({ index: drag.index, vector: { ...v, angle: drag.vector.angle } });
    } else if (drag.kind === "ruler-move") {
      setRulerAt((r) => ({ ...r, ...clampPoint({ x: p.x + drag.offset.x, y: p.y + drag.offset.y }, o.bounds) }));
    } else {
      // the handle sits beside the end of the ruler, a little below its edge
      const handle = (Math.atan2(RULER_HEIGHT / 2, (rulerLength + 0.4) * ppc + 16) * 180) / Math.PI;
      // turned around its 0; moved back onto the drawing when let go
      setRuler((r) => ({ ...r, angle: Math.round((Math.atan2(p.y - r.y, p.x - r.x) * 180) / Math.PI - handle) }));
    }
  };

  const onUp = () => {
    if (!drag) return;
    if (drag.kind === "draw" || drag.kind === "head" || drag.kind === "move") {
      const i = drag.index;
      if (preview && JSON.stringify(preview.vector) !== JSON.stringify(arrows[i])) {
        onCommit(i, preview.vector);
        announce(i, preview.vector);
      }
      focusArrow(i);
    }
    if (drag.kind === "ruler-rotate") setRuler(keepOn);
    setPreview(null);
    setDrag(null);
  };

  const keys: Record<string, number> = { ArrowRight: 0, ArrowUp: 90, ArrowLeft: 180, ArrowDown: 270 };
  const onArrowKey = (i: number) => (e: KeyboardEvent) => {
    const v = arrows[i];
    let next: Vector | null | undefined;
    if (e.key === "Delete" || e.key === "Backspace") {
      if (v) {
        onCommit(i, null);
        onAnnounce?.(t.removed(plainLabel(defs[i].label)));
      }
      e.preventDefault();
      return;
    }
    if (!(e.key in keys)) return;
    e.preventDefault();
    const big = e.shiftKey;
    if (!v) {
      const start = fixed[i] && defs[i].start ? defs[i].start : { x: o.bounds.width / 2, y: o.bounds.height / 2 };
      next = firstVector(start, keys[e.key], o);
    } else if (e.altKey && !fixed[i]) {
      const d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      next = nudge(v, { kind: "move", dx: d[0], dy: d[1] }, o, big);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      next = nudge(v, { kind: "rotate", direction: e.key === "ArrowLeft" ? 1 : -1 }, o, big);
    } else {
      next = nudge(v, { kind: "length", direction: e.key === "ArrowUp" ? 1 : -1 }, o, big);
    }
    if (next && next.length > 0 && JSON.stringify(next) !== JSON.stringify(v)) {
      onCommit(i, next);
      announce(i, next);
    }
  };

  const onRulerKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 1 : 0.1;
    const move = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (move) {
      setRulerAt((r) => ({ ...r, ...clampPoint({ x: r.x + move[0] * step, y: r.y + move[1] * step }, o.bounds) }));
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      const turn = (e.shiftKey ? 15 : 1) * (e.key === "PageUp" ? -1 : 1);
      setRulerAt((r) => ({ ...r, angle: (((r.angle + turn + 180) % 360) + 360) % 360 - 180 }));
    } else return;
    e.preventDefault();
  };

  const gridLines = s.grid
    ? [
      ...Array.from({ length: Math.floor(o.bounds.width) }, (_, i) => <line key={`v${i}`} x1={(i + 1) * ppc} y1={0} x2={(i + 1) * ppc} y2={s.height} />),
      ...Array.from({ length: Math.floor(o.bounds.height) }, (_, i) => <line key={`h${i}`} x1={0} y1={(i + 1) * ppc} x2={s.width} y2={(i + 1) * ppc} />),
    ]
    : null;

  return (
    <svg ref={svg} width={s.width} height={s.height} viewBox={`0 0 ${s.width} ${s.height}`} role="group" aria-label={label}
      class="block h-auto max-w-full touch-none select-none rounded-xl border border-slate-300 bg-white shadow-sm"
      style={{ cursor: drag ? "grabbing" : "crosshair" }} font-family="ui-sans-serif, system-ui, sans-serif"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} data-testid="board">
      <image href={s.background} x={0} y={0} width={s.width} height={s.height} preserveAspectRatio="xMidYMid meet" aria-hidden="true" />
      {gridLines && <g stroke="#94a3b8" stroke-opacity="0.35" stroke-width="1" aria-hidden="true">{gridLines}</g>}

      {/* the ruler, under the arrows: the arrow and its label stay in sight */}
      {ruler && (
        <g transform={`translate(${rulerAt.x * ppc} ${rulerAt.y * ppc}) rotate(${rulerAt.angle})`} tabIndex={0} role="slider"
          aria-roledescription={t.ruler} aria-label={t.ruler} aria-valuenow={rulerAt.angle} aria-valuetext={`${t.rulerLabel} ${rulerAt.angle}°`}
          aria-describedby={helpId} class="outline-none" data-testid="ruler"
          onFocus={() => setFocused("ruler")} onBlur={() => setFocused((f) => (f === "ruler" ? null : f))} onKeyDown={onRulerKey}>
          <rect x={-0.4 * ppc} y={0} width={(rulerLength + 0.8) * ppc} height={RULER_HEIGHT} rx={4} fill="#fefce8" fill-opacity="0.88"
            stroke={focused === "ruler" ? "#f59e0b" : "#a16207"} stroke-width={focused === "ruler" ? 3 : 1.2} style={{ cursor: "move" }}
            data-testid="ruler-body"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              const p = toCm(e);
              begin(e, { kind: "ruler-move", offset: { x: rulerAt.x - p.x, y: rulerAt.y - p.y } });
            }} />
          <g stroke="#422006" stroke-width="1" class="pointer-events-none" aria-hidden="true">
            {Array.from({ length: rulerLength * 10 + 1 }, (_, mm) => (
              (ppc >= 20 || mm % 5 === 0) && (
                <line key={mm} x1={(mm / 10) * ppc} y1={0} x2={(mm / 10) * ppc} y2={mm % 10 === 0 ? 13 : mm % 5 === 0 ? 9 : 5} />
              )
            ))}
          </g>
          <g font-size="10" fill="#422006" text-anchor="middle" class="pointer-events-none select-none" aria-hidden="true">
            {Array.from({ length: rulerLength + 1 }, (_, cm) => <text key={cm} x={cm * ppc} y={25}>{cm}</text>)}
            <text x={(rulerLength + 0.25) * ppc} y={25} text-anchor="start" font-size="9">cm</text>
          </g>
          {/* turn the ruler around its 0 */}
          <g data-testid="ruler-rotate" style={{ cursor: "alias" }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              begin(e, { kind: "ruler-rotate" });
            }}>
            <circle cx={(rulerLength + 0.4) * ppc + 16} cy={RULER_HEIGHT / 2} r={11} fill="white" stroke="#a16207" stroke-width={1.5} />
            <path d={`M ${(rulerLength + 0.4) * ppc + 11} ${RULER_HEIGHT / 2 - 3} a 5.5 5.5 0 1 1 3 7`} fill="none" stroke="#a16207"
              stroke-width={1.6} stroke-linecap="round" aria-hidden="true" />
          </g>
        </g>
      )}
      {/* the authoring mode: what is scored as correct */}
      {tolerance && shown.map((v, i) => v && (
        <g key={`tol${i}`} fill={colorOf(i)} fill-opacity="0.14" stroke={colorOf(i)} stroke-opacity="0.45" stroke-dasharray="3 3" aria-hidden="true" data-testid={`tolerance-${i}`}>
          <circle cx={v.x * ppc} cy={v.y * ppc} r={Math.max(2, tolerance.start * ppc)} />
          <path d={sector(v.x * ppc, v.y * ppc, Math.max(0, v.length - tolerance.length) * ppc, (v.length + tolerance.length) * ppc,
            v.angle - tolerance.angle, v.angle + Math.max(0.2, tolerance.angle))} />
        </g>
      ))}

      {/* solution status: the correct arrows, dashed */}
      {correct?.map((v, i) => v && defs[i] && (
        <g key={`c${i}`} data-testid={`correct-${i}`} role="img" aria-label={`${t.correct}: ${describe(defs[i], v, { ...s, showLabel: "both" }, t, fixed[i])}`}>
          <ArrowShape v={v} ppc={ppc} color={CORRECT_COLOR} dashed />
        </g>
      ))}

      {defs.map((def, i) => {
        const v = shown[i];
        const color = colorOf(i);
        const start = fixed[i] && def.start ? def.start : v ? { x: v.x, y: v.y } : def.start;
        const mark = fixed[i] || !!marks?.[i];
        const end = v ? endPoint(v) : null;
        const isActive = active === i;
        const ring = focused === i ? (end ?? start) : null;
        return (
          <g key={i} ref={(el) => { handles.current[i] = el; }} tabIndex={0} role="slider" aria-roledescription={t.arrow}
            aria-label={t.arrowName(plainLabel(def.label))} aria-valuetext={describe(def, v, s, t, fixed[i])}
            aria-valuenow={v ? v.length : 0} aria-valuemin={0} aria-describedby={helpId} class="outline-none"
            data-testid={`arrow-${i}`} data-active={isActive ? "true" : "false"}
            onFocus={() => { setFocused(i); onActive(i); }} onBlur={() => setFocused((f) => (f === i ? null : f))}
            onKeyDown={onArrowKey(i)}>
            {v && v.length > 0 && <ArrowShape v={v} ppc={ppc} color={color} />}
            {/* the line: drag to move an arrow with a free start */}
            {v && !fixed[i] && (
              <line x1={v.x * ppc} y1={v.y * ppc} x2={end.x * ppc} y2={end.y * ppc} stroke="transparent" stroke-width={14}
                style={{ cursor: "move" }} data-testid={`body-${i}`}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  const p = toCm(e);
                  onActive(i);
                  begin(e, { kind: "move", index: i, offset: { x: v.x - p.x, y: v.y - p.y }, vector: v });
                }} />
            )}
            {start && mark && (
              <g aria-hidden="true">
                <circle cx={start.x * ppc} cy={start.y * ppc} r={isActive && !v ? 9 : 5.5} fill={isActive && !v ? "white" : "#0f172a"}
                  stroke={isActive && !v ? color : "white"} stroke-width={isActive && !v ? 3 : 2} class={isActive && !v ? "animate-pulse" : ""} />
                {isActive && !v && <circle cx={start.x * ppc} cy={start.y * ppc} r={3} fill={color} />}
                {def.point && (
                  <text x={start.x * ppc - 12} y={start.y * ppc - 10} text-anchor="end" font-size="16" font-weight="700" font-style="italic"
                    fill="#0f172a" stroke="white" stroke-width="4" paint-order="stroke" class="pointer-events-none">{def.point}</text>
                )}
              </g>
            )}
            {v && v.length > 0 && (
              <ArrowLabel v={v} ppc={ppc} color={color} label={def.label} text={sizeText(v, s)} />
            )}
            {/* the head: drag it to change the arrow */}
            {v && (
              <circle cx={end.x * ppc} cy={end.y * ppc} r={13} fill={color} fill-opacity={drag?.kind === "head" && drag.index === i ? 0.18 : 0.001}
                stroke={color} stroke-opacity={isActive ? 0.5 : 0} stroke-width={1.5} style={{ cursor: "grab" }} data-testid={`head-${i}`}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  onActive(i);
                  begin(e, { kind: "head", index: i, start: { x: v.x, y: v.y } });
                }} />
            )}
            {ring && (
              <circle cx={ring.x * ppc} cy={ring.y * ppc} r={18} fill="none" stroke="#f59e0b" stroke-width={3} class="pointer-events-none" aria-hidden="true" />
            )}
          </g>
        );
      })}

    </svg>
  );
};

export default Board;
