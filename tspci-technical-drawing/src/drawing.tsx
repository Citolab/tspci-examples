import { ComponentChildren } from "preact";
import { Feature, PlacedDim, Seg, View, ViewName, segKey } from "./model";
import { formatNumber } from "./task";
import { Texts, dimLabel } from "./texts";

// The technical drawing in SVG: the views in European projection (the top view under the front view, the left view to
// its right), with visible lines thick, hidden lines dashed, centre lines dash-dot and the dimensions. A dimension the
// candidate has to fill in is an input on the drawing. One view can hold the grid of the "complete a view" task.

export type Layout = {
  k: number;
  width: number;
  height: number;
  origin: Record<ViewName, { x: number; y: number }>;
};

/** Where an asked dimension's field is, and what goes in it. */
export type AskedField = { index: number; value: string; label: string };

const LEVEL = 7;
const FIRST = 7;

/** The unit of the drawing's lines and texts: a 60 mm workpiece has 1. */
export const unitOf = (views: Record<ViewName, View>) => Math.max(views.front.width, views.front.height, views.top.height) / 60;

/** The room each side of each view needs: the levels of dimensions on it. */
const marginsOf = (dims: PlacedDim[], k: number) => {
  const m: Record<ViewName, Record<string, number>> = { front: {}, top: {}, left: {} };
  for (const d of dims) {
    if (d.kind !== "h" && d.kind !== "v") continue;
    const room = d.kind === "v" ? 10 : 4; // a vertical dimension's field sits across its line
    m[d.view][d.side!] = Math.max(m[d.view][d.side!] ?? 0, (FIRST + LEVEL * d.level + room) * k);
  }
  const base = 6 * k; // centre lines and leaders
  const side = (view: ViewName, s: string) => Math.max(base, m[view][s] ?? 0);
  return side;
};

export const layoutOf = (views: Record<ViewName, View>, dims: PlacedDim[], show: ViewName[], labels: boolean): Layout => {
  const k = unitOf(views);
  const side = marginsOf(dims, k);
  const label = labels ? 9 * k : 0;
  const pad = 3 * k;
  const origin = { front: { x: 0, y: 0 }, top: { x: 0, y: 0 }, left: { x: 0, y: 0 } };
  if (show.length === 1) {
    const v = show[0];
    origin[v] = { x: pad + side(v, "left"), y: pad + side(v, "top") };
    return { k, origin, width: origin[v].x + views[v].width + side(v, "right") + pad, height: origin[v].y + views[v].height + side(v, "bottom") + label + pad };
  }
  const { front, top, left } = views;
  const x0 = pad + Math.max(side("front", "left"), side("top", "left"));
  const y0 = pad + Math.max(side("front", "top"), side("left", "top"));
  origin.front = { x: x0, y: y0 };
  origin.left = { x: x0 + front.width + side("front", "right") + side("left", "left") + 4 * k, y: y0 };
  origin.top = { x: x0, y: y0 + front.height + Math.max(side("front", "bottom"), side("left", "bottom")) + label + side("top", "top") + 2 * k };
  const width = Math.max(origin.left.x + left.width + side("left", "right"), x0 + top.width + side("top", "right")) + pad;
  const height = Math.max(origin.top.y + top.height + side("top", "bottom") + label, y0 + left.height + side("left", "bottom") + label) + pad;
  return { k, origin, width, height };
};

/** The outline of a view on one side at a coordinate: where an extension line starts. */
const profile = (view: View, side: string, at: number): number => {
  const horizontal = side === "top" || side === "bottom";
  let best: number | null = null;
  for (const s of view.segs) {
    const [p, q] = horizontal ? [[s.a[0], s.a[1]], [s.b[0], s.b[1]]] : [[s.a[1], s.a[0]], [s.b[1], s.b[0]]];
    const lo = Math.min(p[0], q[0]), hi = Math.max(p[0], q[0]);
    if (at < lo - 1e-6 || at > hi + 1e-6) continue;
    const values = Math.abs(q[0] - p[0]) < 1e-9 ? [p[1], q[1]] : [p[1] + ((at - p[0]) / (q[0] - p[0])) * (q[1] - p[1])];
    for (const v of values) {
      const outer = side === "top" || side === "right" ? v > (best ?? -Infinity) : v < (best ?? Infinity);
      if (outer) best = v;
    }
  }
  return best ?? (side === "top" ? view.height : side === "right" ? view.width : 0);
};

const Arrow = ({ x, y, dx, dy, k }: { x: number; y: number; dx: number; dy: number; k: number }) => {
  const l = 2.6 * k, w = 0.8 * k;
  const bx = x - dx * l, by = y - dy * l;
  return <polygon points={`${x},${y} ${bx - dy * w},${by + dx * w} ${bx + dy * w},${by - dx * w}`} className="fill-slate-800" />;
};

type Props = {
  features: Feature[];
  views: Record<ViewName, View>;
  dims: PlacedDim[];
  show: ViewName[];
  labels: boolean;
  texts: Texts;
  language: string;
  /** the asked dimensions' fields, by dimension id */
  asked?: Record<string, AskedField>;
  onValue?: (index: number, text: string, input: HTMLInputElement) => void;
  onBeforeInput?: (e: InputEvent) => void;
  readOnly?: boolean;
  /** the view that holds the grid, and which of its lines are left out (by key) */
  gridView?: ViewName;
  hiddenSegs?: Set<string>;
  /** the grid layer, drawn in the grid view's coordinates */
  grid?: (view: View, toX: (u: number) => number, toY: (v: number) => number, k: number) => ComponentChildren;
  /** authoring: click a line to leave it out */
  onSegClick?: (seg: Seg) => void;
  /** authoring: the lines left out, drawn red and dashed */
  marked?: Set<string>;
  label: string;
  maxWidth?: number;
};

export const Drawing = (p: Props) => {
  const layout = layoutOf(p.views, p.dims, p.show, p.labels);
  const { k } = layout;
  const t = p.texts;
  const fs = 3.4 * k;
  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label={p.label} data-testid="drawing"
      className="block h-auto w-full select-none rounded-lg border border-slate-200 bg-white" style={{ maxWidth: `${p.maxWidth ?? 860}px` }}>
      {p.show.map((name) => {
        const view = p.views[name];
        const o = layout.origin[name];
        const X = (u: number) => o.x + u;
        const Y = (v: number) => o.y + view.height - v;
        const isGrid = p.gridView === name;
        const segs = view.segs.filter((s) => !(isGrid && p.hiddenSegs?.has(segKey(s))));
        const visible = segs.filter((s) => s.kind === "visible").length;
        const hidden = segs.length - visible;
        const dims = p.dims.filter((d) => d.view === name);
        return (
          <g key={name} data-view={name} data-testid={`view-${name}`}>
            <title>{`${p.labels ? t.view[name] : t.unlabelledView}: ${t.linesOfView(visible, hidden, view.arcs.length)}`}</title>
            {isGrid && p.grid?.(view, X, Y, k)}
            {view.centres.map((c, i) => (
              <line key={`c${i}`} pointer-events="none" x1={X(c.a[0])} y1={Y(c.a[1])} x2={X(c.b[0])} y2={Y(c.b[1])} className="stroke-slate-500"
                stroke-width={0.25 * k} stroke-dasharray={`${6 * k} ${1.2 * k} ${1 * k} ${1.2 * k}`} />
            ))}
            {segs.map((s) => {
              const key = segKey(s);
              const marked = isGrid && p.marked?.has(key);
              return (
                <line key={key} pointer-events="none" x1={X(s.a[0])} y1={Y(s.a[1])} x2={X(s.b[0])} y2={Y(s.b[1])} data-seg={key}
                  className={marked ? "stroke-red-600" : "stroke-slate-900"} stroke-linecap="round"
                  stroke-width={s.kind === "visible" ? 0.7 * k : 0.35 * k}
                  stroke-dasharray={marked ? `${0.8 * k} ${1.2 * k}` : s.kind === "hidden" ? `${2.4 * k} ${1.2 * k}` : undefined} />
              );
            })}
            {view.arcs.map((a, i) => {
              const full = a.to - a.from > 2 * Math.PI - 1e-3;
              const props = { "pointer-events": "none", className: "stroke-slate-900 fill-none", "stroke-width": a.kind === "visible" ? 0.7 * k : 0.35 * k, "stroke-dasharray": a.kind === "hidden" ? `${2.4 * k} ${1.2 * k}` : undefined };
              if (full) return <circle key={`a${i}`} cx={X(a.cx)} cy={Y(a.cy)} r={a.r} {...props} />;
              const p0 = [X(a.cx + a.r * Math.cos(a.from)), Y(a.cy + a.r * Math.sin(a.from))];
              const p1 = [X(a.cx + a.r * Math.cos(a.to)), Y(a.cy + a.r * Math.sin(a.to))];
              const large = a.to - a.from > Math.PI ? 1 : 0;
              return <path key={`a${i}`} d={`M${p0[0]},${p0[1]} A${a.r},${a.r} 0 ${large} 0 ${p1[0]},${p1[1]}`} {...props} />;
            })}
            {p.onSegClick && segs.map((s) => (
              <line key={`hit-${segKey(s)}`} x1={X(s.a[0])} y1={Y(s.a[1])} x2={X(s.b[0])} y2={Y(s.b[1])} stroke="transparent" stroke-width={3 * k}
                className="cursor-pointer" onClick={() => p.onSegClick!(s)} data-testid={`seg-${name}-${segKey(s)}`} />
            ))}
            {dims.map((d) => <Dimension key={d.id} dim={d} view={view} X={X} Y={Y} k={k} fs={fs} {...p} field={p.asked?.[d.id]} />)}
            {p.labels && (
              <text x={X(view.width / 2)} y={Y(0) + Math.max(6 * k, ...dims.filter((d) => d.side === "bottom").map((d) => (FIRST + LEVEL * d.level + 4) * k)) + 5 * k}
                text-anchor="middle" font-size={fs * 1.05} className="fill-slate-600 font-sans font-semibold">{t.view[name]}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

const Dimension = (p: Props & { dim: PlacedDim; view: View; X: (u: number) => number; Y: (v: number) => number; k: number; fs: number; field?: AskedField }) => {
  const { dim, view, X, Y, k, fs, field, texts: t, language } = p;
  const text = dim.kind === "dia" ? `Ø${formatNumber(dim.value, language)}` : dim.kind === "chamfer" ? `${formatNumber(dim.value, language)}×45°` : formatNumber(dim.value, language);
  const label = dimLabel(t, dim, p.features);
  const input = (x: number, y: number, prefix = "", suffix = "") => {
    const w = 15 * k, h = 6.4 * k;
    const extra = (prefix.length + suffix.length) * fs * 0.62;
    return (
      <foreignObject x={x - (w + extra) / 2} y={y - h / 2} width={w + extra} height={h}>
        <div className="flex h-full items-center justify-center gap-[0.1em]" style={{ fontSize: `${fs}px` }}>
          {prefix && <span aria-hidden="true">{prefix}</span>}
          <input type="text" inputMode="decimal" autoComplete="off" spellcheck={false} value={field!.value} readOnly={p.readOnly}
            aria-label={t.dimInput(field!.label)} data-testid={`dim-${dim.id}`}
            className="td-dim box-border h-full min-w-0 border-0 bg-sky-50 px-[0.2em] text-center font-sans text-slate-900"
            style={{ width: `${w}px`, fontSize: `${fs}px`, borderRadius: `${0.8 * k}px`, ["--k" as any]: k }}
            onBeforeInput={(e) => p.onBeforeInput?.(e as unknown as InputEvent)}
            onInput={(e) => p.onValue?.(field!.index, (e.target as HTMLInputElement).value, e.target as HTMLInputElement)} />
          {suffix && <span aria-hidden="true">{suffix}</span>}
        </div>
      </foreignObject>
    );
  };
  const thin = { className: "stroke-slate-700", "stroke-width": 0.25 * k };
  if (dim.kind === "h" || dim.kind === "v") {
    const dist = (FIRST + LEVEL * dim.level) * k;
    const gap = 1.2 * k, over = 1.6 * k;
    if (dim.kind === "h") {
      const top = dim.side === "top";
      const yLine = top ? Y(view.height) - dist : Y(0) + dist;
      const ext = (u: number) => {
        const start = Y(profile(view, dim.side!, u)) + (top ? -gap : gap);
        return <line x1={X(u)} y1={start} x2={X(u)} y2={yLine + (top ? -over : over)} {...thin} />;
      };
      const x1 = X(dim.from!), x2 = X(dim.to!);
      const narrow = x2 - x1 < 9 * k;
      return (
        <g data-dim={dim.id}>
          <title>{`${label}: ${field ? "?" : text}`}</title>
          {ext(dim.from!)}{ext(dim.to!)}
          <line x1={x1} y1={yLine} x2={x2} y2={yLine} {...thin} />
          <Arrow x={x1} y={yLine} dx={-1} dy={0} k={k} />
          <Arrow x={x2} y={yLine} dx={1} dy={0} k={k} />
          {field ? input((x1 + x2) / 2, yLine - 3.6 * k)
            : <text x={narrow ? x2 + 1.5 * k : (x1 + x2) / 2} y={yLine - 1.2 * k} text-anchor={narrow ? "start" : "middle"} font-size={fs} className="fill-slate-900 font-sans">{text}</text>}
        </g>
      );
    }
    const right = dim.side === "right";
    const xLine = right ? X(view.width) + dist : X(0) - dist;
    const ext = (v: number) => {
      const start = X(profile(view, dim.side!, v)) + (right ? gap : -gap);
      return <line x1={start} y1={Y(v)} x2={xLine + (right ? over : -over)} y2={Y(v)} {...thin} />;
    };
    const y1 = Y(dim.from!), y2 = Y(dim.to!);
    const narrow = y1 - y2 < 9 * k;
    const tx = xLine - 1.2 * k, ty = narrow ? y2 - 1.5 * k : (y1 + y2) / 2;
    return (
      <g data-dim={dim.id}>
        <title>{`${label}: ${field ? "?" : text}`}</title>
        {ext(dim.from!)}{ext(dim.to!)}
        <line x1={xLine} y1={y1} x2={xLine} y2={y2} {...thin} />
        <Arrow x={xLine} y={y1} dx={0} dy={1} k={k} />
        <Arrow x={xLine} y={y2} dx={0} dy={-1} k={k} />
        {field ? input(xLine, (y1 + y2) / 2)
          : <text x={tx} y={ty} transform={`rotate(-90 ${tx} ${ty})`} text-anchor={narrow ? "start" : "middle"} font-size={fs} className="fill-slate-900 font-sans">{text}</text>}
      </g>
    );
  }
  // a leader: to a circle at 45°, or away from a chamfer, then a short shoulder with the text
  const at = dim.at!;
  const dir = dim.kind === "dia" ? [Math.SQRT1_2, Math.SQRT1_2] : dim.dir!;
  const startR = dim.kind === "dia" ? dim.r! : 0;
  const sx = X(at[0] + dir[0] * startR), sy = Y(at[1] + dir[1] * startR);
  const len = 9 * k;
  const ex = sx + dir[0] * len, ey = sy - dir[1] * len;
  const sign = dir[0] >= 0 ? 1 : -1;
  const shoulder = 12 * k;
  const end = ex + sign * shoulder;
  return (
    <g data-dim={dim.id}>
      <title>{`${label}: ${field ? "?" : text}`}</title>
      <line x1={sx} y1={sy} x2={ex} y2={ey} {...thin} />
      <line x1={ex} y1={ey} x2={end} y2={ey} {...thin} />
      <Arrow x={sx} y={sy} dx={-dir[0]} dy={dir[1]} k={k} />
      {field ? input((ex + end) / 2, ey - 3.6 * k, dim.kind === "dia" ? "Ø" : "", dim.kind === "chamfer" ? "×45°" : "")
        : <text x={(ex + end) / 2} y={ey - 1.2 * k} text-anchor="middle" font-size={fs} className="fill-slate-900 font-sans">{text}</text>}
    </g>
  );
};
