import { ComponentChildren } from "preact";
import { useMemo, useRef } from "preact/hooks";
import { Band, Contour, Grid, Point, bandColor, formatNumber, gridHeight, pathLength, pointAlong } from "./terrain";
import { Texts } from "./texts";

// The contour map (SVG): tints for the heights (a picture of the grid), the contour lines with their heights, a scale
// bar and north arrow, and on top whatever the task draws. Used by the candidate's view and the authoring mode.

export const MAP_WIDTH = 640;

/** From metres on the map to the picture and back (y to the north, the picture's y down). */
export type Projection = {
  width: number;
  height: number;
  px: (p: Point) => { x: number; y: number };
  toMap: (x: number, y: number) => Point;
  /** metres to pixels */
  k: number;
};

export const projectionOf = (g: Pick<Grid, "width" | "depth">): Projection => {
  const k = MAP_WIDTH / g.width;
  const height = g.depth * k;
  return {
    width: MAP_WIDTH,
    height,
    k,
    px: (p) => ({ x: p.x * k, y: height - p.y * k }),
    toMap: (x, y) => ({ x: Math.max(0, Math.min(g.width, x / k)), y: Math.max(0, Math.min(g.depth, (height - y) / k)) }),
  };
};

/** The tints as a picture of the grid, a pixel per few metres (browser only). */
const tintImage = (g: Grid, bands: Band[]): string => {
  if (typeof document === "undefined") return "";
  const w = 320, h = Math.max(2, Math.round((w * g.depth) / g.width));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const image = ctx.createImageData(w, h);
  const rgb = new Map<string, number[]>();
  for (const b of bands) rgb.set(b.color, [1, 3, 5].map((i) => parseInt(b.color.slice(i, i + 2), 16)));
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const height = gridHeight(g, ((i + 0.5) / w) * g.width, (1 - (j + 0.5) / h) * g.depth);
      const [r, gg, b] = rgb.get(bandColor(bands, height))!;
      const o = (j * w + i) * 4;
      image.data[o] = r;
      image.data[o + 1] = gg;
      image.data[o + 2] = b;
      image.data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  try {
    return canvas.toDataURL();
  } catch {
    return "";
  }
};

/** A nice length for the scale bar: about a fifth of the map. */
export const scaleLength = (width: number) => {
  const target = width / 5;
  const pow = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 2.5, 5, 10].map((f) => f * pow).reduce((best, l) => (Math.abs(l - target) < Math.abs(best - target) ? l : best));
};

const pathOf = (points: Point[], pr: Projection) =>
  points.map((p, i) => {
    const q = pr.px(p);
    return `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
  }).join("");

type Label = { x: number; y: number; angle: number; text: string };

/** Where the heights go on the contour lines: halfway along every line long enough, upright. */
const labelsOf = (contours: Contour[], pr: Projection, language: string): Label[] => {
  const labels: Label[] = [];
  for (const c of contours) {
    const length = pathLength(c.points) * pr.k;
    if (length < 90) continue;
    const count = length > 900 ? 2 : 1;
    for (let n = 0; n < count; n++) {
      const { point, angle } = pointAlong(c.points, (pathLength(c.points) * (n + 1)) / (count + 1));
      const q = pr.px(point);
      if (q.x < 14 || q.x > pr.width - 14 || q.y < 10 || q.y > pr.height - 10) continue;
      let deg = (-angle * 180) / Math.PI;
      if (deg > 90) deg -= 180;
      if (deg < -90) deg += 180;
      if (labels.some((l) => Math.hypot(l.x - q.x, l.y - q.y) < 34)) continue;
      labels.push({ x: q.x, y: q.y, angle: deg, text: formatNumber(c.level, 0, language) });
    }
  }
  return labels;
};

export type MapProps = {
  grid: Grid;
  contours: Contour[];
  bands: Band[];
  interval: number;
  tints: boolean;
  labels: boolean;
  language: string;
  texts: Texts;
  /** accessible name and description of the map */
  label: string;
  description?: string;
  /** what the task draws on the map, in the picture's pixels */
  children?: (pr: Projection) => ComponentChildren;
  /** the point under the pointer (or the keyboard cursor, or the 3D model's pointer) */
  hover: Point | null;
  /** the height to show at the hover point, or null */
  hoverText?: string | null;
  onHover?: (p: Point | null, fromKeyboard?: boolean) => void;
  /** a click, a tap, or Enter on the keyboard cursor */
  onPick?: (p: Point, keyboard?: boolean) => void;
  /** dragging with the button down, after the pick (for drawing a stream) */
  onStroke?: (p: Point) => void;
  onStrokeEnd?: () => void;
  /** a drag that starts on an element with data-handle (authoring) */
  onHandle?: (handle: string, p: Point, phase: "start" | "move" | "end") => void;
  readOnly?: boolean;
  testid?: string;
};

export const ContourMap = (props: MapProps) => {
  const { grid, contours, bands, interval, tints, labels, language, texts, hover } = props;
  const pr = useMemo(() => projectionOf(grid), [grid]);
  const image = useMemo(() => (tints ? tintImage(grid, bands) : ""), [grid, bands, tints]);
  const lines = useMemo(
    () => contours.map((c) => ({ d: pathOf(c.points, pr), index: Math.abs(c.level / (interval * 5) - Math.round(c.level / (interval * 5))) < 1e-6 })),
    [contours, pr, interval]
  );
  const contourLabels = useMemo(() => (labels ? labelsOf(contours, pr, language) : []), [contours, pr, labels, language]);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: "stroke" | "handle"; handle?: string; id: number } | null>(null);
  const scale = scaleLength(grid.width);

  const toMap = (e: PointerEvent): Point => {
    const r = svg.current!.getBoundingClientRect();
    return pr.toMap(((e.clientX - r.left) / r.width) * pr.width, ((e.clientY - r.top) / r.height) * pr.height);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || props.readOnly) return;
    const p = toMap(e);
    const handle = (e.target as Element).closest?.("[data-handle]")?.getAttribute("data-handle");
    try {
      svg.current?.setPointerCapture?.(e.pointerId);
    } catch {
      // a synthetic event in a test: no capture
    }
    if (handle && props.onHandle) {
      drag.current = { kind: "handle", handle, id: e.pointerId };
      props.onHandle(handle, p, "start");
    } else {
      drag.current = { kind: "stroke", id: e.pointerId };
      props.onPick?.(p);
    }
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => {
    const p = toMap(e);
    props.onHover?.(p);
    const d = drag.current;
    if (!d) return;
    if (d.kind === "handle") props.onHandle?.(d.handle!, p, "move");
    else props.onStroke?.(p);
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "handle") props.onHandle?.(d.handle!, toMap(e), "end");
    else props.onStrokeEnd?.();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const big = e.shiftKey ? 10 : 50;
    const step = { x: grid.width / big, y: grid.depth / big };
    const at = hover ?? { x: grid.width / 2, y: grid.depth / 2 };
    const move: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (move[e.key]) {
      const [dx, dy] = move[e.key];
      props.onHover?.({ x: Math.max(0, Math.min(grid.width, at.x + dx * step.x)), y: Math.max(0, Math.min(grid.depth, at.y + dy * step.y)) }, true);
      e.preventDefault();
    } else if ((e.key === "Enter" || e.key === " ") && !props.readOnly) {
      if (!hover) props.onHover?.(at, true);
      props.onPick?.(at, true);
      e.preventDefault();
    } else if (e.key === "Escape") {
      props.onHover?.(null);
    }
  };

  const hp = hover ? pr.px(hover) : null;
  const ticks = scaleLength(grid.width) / 2;

  return (
    <svg ref={svg} viewBox={`0 0 ${pr.width} ${pr.height}`} className="block h-auto w-full touch-none select-none rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-sky-500/60"
      role="application" aria-roledescription={texts.map} aria-label={props.label} aria-description={props.description} tabindex={0}
      data-testid={props.testid ?? "map"} onPointerDown={onPointerDown as any} onPointerMove={onPointerMove as any} onPointerUp={onPointerUp as any}
      onPointerCancel={onPointerUp as any} onPointerLeave={() => !drag.current && props.onHover?.(null)} onKeyDown={onKeyDown as any}
      onFocus={() => !hover && props.onHover?.({ x: grid.width / 2, y: grid.depth / 2 }, true)}
      style={{ cursor: props.readOnly ? "default" : "crosshair" }}>
      <rect width={pr.width} height={pr.height} fill={tints ? bands[0]?.color : "#fbfaf7"} />
      {image && <image href={image} width={pr.width} height={pr.height} preserveAspectRatio="none" style={{ imageRendering: "auto" }} />}
      {/* a light grid every half scale length */}
      <g stroke="#0f172a" stroke-opacity="0.07" stroke-width="1" aria-hidden="true">
        {Array.from({ length: Math.floor(grid.width / ticks) }, (_, i) => (i + 1) * ticks).map((x) => <line key={`x${x}`} x1={x * pr.k} x2={x * pr.k} y1={0} y2={pr.height} />)}
        {Array.from({ length: Math.floor(grid.depth / ticks) }, (_, i) => (i + 1) * ticks).map((y) => <line key={`y${y}`} y1={pr.height - y * pr.k} y2={pr.height - y * pr.k} x1={0} x2={pr.width} />)}
      </g>
      <g fill="none" stroke="#7c4a1e" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
        {lines.map((l, i) => <path key={i} d={l.d} stroke-width={l.index ? 1.8 : 0.9} stroke-opacity={l.index ? 0.95 : 0.75} />)}
      </g>
      <g aria-hidden="true" font-size="10" font-weight="600" fill="#5b3413" text-anchor="middle" dominant-baseline="central"
        style={{ paintOrder: "stroke", stroke: tints ? "#fffdf6" : "#ffffff", strokeWidth: 3, strokeLinejoin: "round" }}>
        {contourLabels.map((l, i) => <text key={i} x={l.x} y={l.y} transform={`rotate(${l.angle.toFixed(1)} ${l.x.toFixed(1)} ${l.y.toFixed(1)})`}>{l.text}</text>)}
      </g>
      {props.children?.(pr)}
      {/* scale bar and north arrow */}
      <g aria-hidden="true" transform={`translate(12 ${pr.height - 14})`} font-size="10" fill="#0f172a">
        <rect x="-6" y="-20" width={scale * pr.k + 12} height="28" rx="6" fill="#ffffff" fill-opacity="0.85" />
        <rect x="0" y="-3" width={(scale * pr.k) / 2} height="5" fill="#0f172a" />
        <rect x={(scale * pr.k) / 2} y="-3" width={(scale * pr.k) / 2} height="5" fill="#ffffff" stroke="#0f172a" stroke-width="1" />
        <text x="0" y="-8">0</text>
        <text x={scale * pr.k} y="-8" text-anchor="end">{texts.metres(formatNumber(scale, 0, language))}</text>
      </g>
      <g aria-hidden="true" transform={`translate(${pr.width - 24} 30)`}>
        <circle r="18" fill="#ffffff" fill-opacity="0.85" />
        <path d="M0 -6 L6 12 L0 8 L-6 12 Z" fill="#0f172a" />
        <text y="-7" text-anchor="middle" font-size="10" font-weight="700" fill="#0f172a">{texts.north}</text>
      </g>
      {hp && (
        <g aria-hidden="true" pointer-events="none" data-testid="map-hover">
          <line x1={hp.x - 10} x2={hp.x + 10} y1={hp.y} y2={hp.y} stroke="#0f172a" stroke-width="1.5" />
          <line y1={hp.y - 10} y2={hp.y + 10} x1={hp.x} x2={hp.x} stroke="#0f172a" stroke-width="1.5" />
          <circle cx={hp.x} cy={hp.y} r="4" fill="none" stroke="#ffffff" stroke-width="1.5" />
          {props.hoverText && (
            <g transform={`translate(${Math.min(hp.x + 10, pr.width - 70)} ${Math.max(hp.y - 26, 4)})`}>
              <rect width="62" height="18" rx="5" fill="#0f172a" fill-opacity="0.88" />
              <text x="31" y="12.5" text-anchor="middle" font-size="11" font-weight="600" fill="#ffffff" data-testid="map-hover-height">{props.hoverText}</text>
            </g>
          )}
        </g>
      )}
    </svg>
  );
};

/** A marker with a letter, as on an exam map: a white disc with a dark ring and the letter beside it. */
export const Marker = ({ at, label, shape = "circle", testid, tone = "#0f172a" }: { at: { x: number; y: number }; label?: string; shape?: "circle" | "square" | "diamond" | "triangle"; testid?: string; tone?: string }) => (
  <g data-testid={testid} pointer-events="none">
    {shape === "circle" && <circle cx={at.x} cy={at.y} r="5.5" fill="#ffffff" stroke={tone} stroke-width="2.5" />}
    {shape === "square" && <rect x={at.x - 5} y={at.y - 5} width="10" height="10" fill="#ffffff" stroke={tone} stroke-width="2.5" />}
    {shape === "diamond" && <path d={`M${at.x} ${at.y - 7}L${at.x + 7} ${at.y}L${at.x} ${at.y + 7}L${at.x - 7} ${at.y}Z`} fill="#ffffff" stroke={tone} stroke-width="2.5" />}
    {shape === "triangle" && <path d={`M${at.x} ${at.y - 7}L${at.x + 7} ${at.y + 5}L${at.x - 7} ${at.y + 5}Z`} fill="#ffffff" stroke={tone} stroke-width="2.5" />}
    {label && (
      <text x={at.x + 9} y={at.y - 7} font-size="13" font-weight="700" fill={tone} style={{ paintOrder: "stroke", stroke: "#ffffff", strokeWidth: 3.5, strokeLinejoin: "round" }}>{label}</text>
    )}
  </g>
);

export const linePath = (points: Point[], pr: Projection) => pathOf(points, pr);

/** The legend of the tints: a swatch with its heights per band, from low to high. */
export const Legend = ({ bands, texts, language }: { bands: Band[]; texts: Texts; language: string }) => (
  <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="legend">
    <div className="text-xs font-semibold text-slate-600">{texts.legend}</div>
    <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0" aria-label={texts.legend}>
      {bands.map((b) => (
        <li key={b.from} className="flex items-center gap-2 text-xs tabular-nums text-slate-700">
          <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm ring-1 ring-black/10" style={{ background: b.color }} />
          {texts.legendRange(formatNumber(b.from, 0, language), formatNumber(b.to, 0, language))}
        </li>
      ))}
    </ul>
  </div>
);
