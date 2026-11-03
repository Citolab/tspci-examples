import { useRef } from "preact/hooks";
import { FIGURE, Measures, Positions, Scene, View, ViewShadow, halfDepth } from "./optics";
import { Texts } from "./texts";
import { formatNumber } from "./format";
import type { Picked } from "./scene3d";

// The 2D drawing, the exact view for answering: the side view (distance and height) or the top view (distance and
// sideways), to scale in cm, with the bench and the screen as rulers, the rays past the edges of the object, and the
// umbra and penumbra on the screen, labelled (not by colour alone: the penumbra is hatched).
// Lamps and the object can be dragged here too; the sliders below are the keyboard's way to move them.

const MARGIN = 24;

export type DrawingProps = {
  scene: Scene;
  positions: Positions;
  measures: Measures | null;
  view: View;
  texts: Texts;
  language: "en" | "nl";
  showRays: boolean;
  showMeasurements: boolean;
  movable: (p: Picked) => boolean;
  onDrag: (p: Picked, point: { x?: number; y?: number; z?: number }) => void;
  onDragEnd: (p: Picked) => void;
};

/** The extent of the drawing in cm: horizontal from the farthest a lamp can be to the screen, vertical per view. */
const frameOf = (scene: Scene, view: View) => {
  const far = Math.max(...scene.lamps.map((l) => l.move.x?.[1] ?? l.x)) + 20;
  if (view === "side") {
    const top = Math.max(scene.screen.height, ...scene.lamps.map((l) => (l.move.y?.[1] ?? l.y) + l.size / 2), scene.object.elevation + scene.object.height) + 12;
    return { far, vTop: top, vBottom: -14 };
  }
  const half = Math.max(scene.screen.width / 2, ...scene.lamps.map((l) => Math.max(Math.abs(l.move.z?.[0] ?? l.z), Math.abs(l.move.z?.[1] ?? l.z)) + l.size / 2)) + 12;
  return { far, vTop: half, vBottom: -half };
};

const Drawing = (p: DrawingProps) => {
  const { scene, positions, measures, view, texts: t } = p;
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ picked: Picked; dx: number; dv: number } | null>(null);
  const { far, vTop, vBottom } = frameOf(scene, view);
  const n = (v: number, d = 1) => formatNumber(v, d, p.language);
  // cm → the drawing: x from the left (far) to the screen (right), v up (side view) or towards the viewer (top view)
  const X = (x: number) => far - x;
  const V = (v: number) => (view === "side" ? vTop - v : v - vBottom);
  const vOf = (l: { y: number; z: number }) => (view === "side" ? l.y : l.z);
  const width = far + MARGIN + 48, height = vTop - vBottom;
  const screenLo = view === "side" ? 0 : -scene.screen.width / 2;
  const screenHi = view === "side" ? scene.screen.height : scene.screen.width / 2;
  const shadow: ViewShadow | null = measures ? measures[view] : null;
  const o = scene.object;

  const toCm = (e: PointerEvent) => {
    const m = svg.current?.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: far - pt.x, v: view === "side" ? vTop - pt.y : pt.y + vBottom };
  };
  const down = (picked: Picked, at: { x: number; v: number }) => (e: PointerEvent) => {
    if (!p.movable(picked)) return;
    const cm = toCm(e);
    if (!cm) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { picked, dx: at.x - cm.x, dv: at.v - cm.v };
    e.preventDefault();
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    const cm = d && toCm(e);
    if (!d || !cm) return;
    const x = cm.x + d.dx, v = cm.v + d.dv;
    p.onDrag(d.picked, view === "side" ? { x, y: v } : { x, z: v });
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d) p.onDragEnd(d.picked);
  };

  // the object in this view
  const centreV = view === "side" ? o.elevation + o.height / 2 : 0;
  const objectShape = (() => {
    const x = X(positions.objectX);
    if (o.type === "ball") return <circle cx={x} cy={V(centreV)} r={o.width / 2} />;
    const [lo, hi] = view === "side" ? [o.elevation, o.elevation + o.height] : [-o.width / 2, o.width / 2];
    const h = Math.max(halfDepth(o), 0.8);
    if (o.type === "figure" && view === "side") {
      // the cut-out seen from the side: a thin board; its outline shows next to it in the top view
      return <rect x={x - h} y={V(hi)} width={2 * h} height={hi - lo} rx={0.6} />;
    }
    return <rect x={x - h} y={Math.min(V(lo), V(hi))} width={2 * h} height={hi - lo} rx={o.type === "figure" ? 0.6 : 1} />;
  })();

  const ticks: preact.JSX.Element[] = [];
  // the bench (side view: on the floor; top view: along the middle line): distance to the screen
  const benchV = view === "side" ? 0 : vBottom + 4;
  for (let x = 0; x <= far - 10; x += 10) {
    const big = x % 50 === 0;
    ticks.push(<line key={`b${x}`} x1={X(x)} x2={X(x)} y1={V(benchV)} y2={V(benchV) + (big ? 4 : 2)} className="stroke-slate-400" />);
    if (big) ticks.push(<text key={`bt${x}`} x={X(x)} y={V(benchV) + 10} text-anchor="middle" className="fill-slate-500 text-[6.5px]">{n(x, 0)}</text>);
  }
  // the screen as a ruler, labelled every 50 cm
  const sx = X(0);
  for (let v = Math.ceil(screenLo / 10) * 10; v <= screenHi; v += 10) {
    const big = v % 50 === 0;
    ticks.push(<line key={`s${v}`} x1={sx + 2} x2={sx + (big ? 7 : 4.5)} y1={V(v)} y2={V(v)} className="stroke-slate-500" />);
    if (big) ticks.push(<text key={`st${v}`} x={sx + 9} y={V(v) + 2.2} className="fill-slate-500 text-[6.5px]">{n(v, 0)}</text>);
  }

  // the shadow behind the object: per source point, from where its edge rays touch the object to the screen
  const wedges = shadow?.lamps.flatMap((lamp, i) =>
    lamp.points.map((pt, k) => {
      const [a, b] = pt.touch;
      const points = [[a[0], a[1]], [0, pt.interval[0]], [0, pt.interval[1]], [b[0], b[1]]].map(([x, v]) => `${X(x)},${V(v)}`).join(" ");
      return <polygon key={`w${i}-${k}`} points={points} className="fill-slate-700" fill-opacity={0.16} />;
    })
  );
  const rays = p.showRays && shadow
    ? shadow.lamps.flatMap((lamp, i) =>
        lamp.points.flatMap((pt, k) =>
          [0, 1].map((e) => (
            <line key={`r${i}-${k}-${e}`} x1={X(pt.source[0])} y1={V(pt.source[1])} x2={X(0)} y2={V(pt.interval[e])}
              className="stroke-amber-600" stroke-width={0.9} stroke-dasharray={k === 1 ? "4 2" : undefined} />
          ))
        )
      )
    : [];

  // on the screen: the umbra solid, the penumbra hatched, each with its name
  const bar = sx - 1.2;
  const marks: preact.JSX.Element[] = [];
  if (shadow) {
    const clip = (lo: number, hi: number): [number, number] | null => {
      const a = Math.max(lo, screenLo), b = Math.min(hi, screenHi);
      return b > a ? [a, b] : null;
    };
    const umbra = measures && measures.values.umbraHeight! > 0 && measures.values.umbraWidth! > 0 ? shadow.umbra : null;
    shadow.lamps.forEach((lamp, i) => {
      const c = clip(lamp.shadow[0], lamp.shadow[1]);
      if (c) marks.push(<rect key={`p${i}`} x={bar - 3} y={Math.min(V(c[0]), V(c[1]))} width={4.4} height={c[1] - c[0]} fill="url(#ls-hatch)" className="stroke-slate-700" stroke-width={0.4} data-testid={`penumbra-${view}-${i}`} />);
    });
    const u = umbra && clip(umbra[0], umbra[1]);
    if (u) marks.push(<rect key="u" x={bar - 3} y={Math.min(V(u[0]), V(u[1]))} width={4.4} height={u[1] - u[0]} className="fill-slate-800" data-testid={`umbra-${view}`} />);
    // labels left of the screen, at the middle of each part
    if (u) marks.push(<text key="ut" x={bar - 5} y={V((u[0] + u[1]) / 2) + 2} text-anchor="end" className="fill-slate-900 text-[6.5px] font-semibold">{t.umbra}</text>);
    const pen = [shadow.shadow[0], shadow.shadow[1]];
    if (shadow.penumbra > 0.05) {
      const lowEnd = u ? u[0] : (pen[0] + pen[1]) / 2;
      const c = clip(pen[0], lowEnd);
      if (c && c[1] - c[0] > 1) marks.push(<text key="pt" x={bar - 5} y={V((c[0] + c[1]) / 2) + 2} text-anchor="end" className="fill-slate-700 text-[6.5px]">{t.penumbra}</text>);
    }
    // the whole shadow's length, with a dimension line right of the ruler
    if (p.showMeasurements && measures) {
      const len = view === "side" ? measures.values.shadowHeight! : measures.values.shadowWidth!;
      const c = clip(shadow.shadow[0], shadow.shadow[1]);
      if (c) {
        const dx = sx + 22;
        marks.push(
          <g key="dim" data-testid={`dimension-${view}`}>
            <line x1={dx} x2={dx} y1={V(c[0])} y2={V(c[1])} className="stroke-slate-900" stroke-width={0.7} marker-start="url(#ls-arrow)" marker-end="url(#ls-arrow)" />
            <text x={dx + 3} y={V((c[0] + c[1]) / 2) + 2.4} className="fill-slate-900 text-[7px] font-semibold">{n(len)}</text>
          </g>
        );
      }
    }
  }

  const lampShapes = scene.lamps.map((lamp, i) => {
    const l = positions.lamps[i];
    const picked: Picked = { kind: "lamp", index: i };
    const can = p.movable(picked);
    const x = X(l.x), v = V(vOf(l));
    return (
      <g key={`l${i}`} data-testid={`drawing-lamp-${i}`} className={can ? "cursor-grab" : ""}
        onPointerDown={down(picked, { x: l.x, v: vOf(l) }) as any}>
        {view === "side" && <line x1={x + (lamp.size > 0 ? 3 : 0)} x2={x + (lamp.size > 0 ? 3 : 0)} y1={v} y2={V(0)} className="stroke-slate-400" stroke-width={1} />}
        {lamp.size > 0 ? (
          <>
            <rect x={x} y={v - lamp.size / 2 - 1.5} width={7} height={lamp.size + 3} rx={1.5} className="fill-slate-600" />
            <line x1={x} x2={x} y1={v - lamp.size / 2} y2={v + lamp.size / 2} className="stroke-yellow-400" stroke-width={2.4} stroke-linecap="round" />
          </>
        ) : (
          <circle cx={x} cy={v} r={3.2} className="fill-yellow-300 stroke-amber-700" stroke-width={0.8} />
        )}
        {/* a larger target for a finger */}
        <circle cx={x} cy={v} r={Math.max(9, lamp.size / 2 + 4)} fill="transparent" />
        {scene.lamps.length > 1 && <text x={x - 6} y={v - Math.max(lamp.size / 2, 3) - 3} text-anchor="middle" className="fill-slate-900 text-[7px] font-bold">{i + 1}</text>}
      </g>
    );
  });

  const objectPicked: Picked = { kind: "object", index: 0 };
  return (
    <svg ref={svg} viewBox={`${-MARGIN} 0 ${width} ${height}`} className="block h-auto w-full select-none touch-none" role="img"
      aria-label={view === "side" ? t.sideViewLabel : t.topViewLabel} data-testid={`drawing-${view}`}
      onPointerMove={move as any} onPointerUp={up} onPointerCancel={up}>
      <defs>
        <pattern id="ls-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3" height="3" className="fill-slate-300" />
          <line x1="0" y1="0" x2="0" y2="3" className="stroke-slate-700" stroke-width="1.2" />
        </pattern>
        <marker id="ls-arrow" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L6,3 L0,6 z" className="fill-slate-900" />
        </marker>
        <clipPath id={`ls-clip-${view}`}>
          <rect x={0} y={0} width={far} height={height} />
        </clipPath>
      </defs>
      {view === "side" && <rect x={-MARGIN} y={V(0)} width={width} height={-vBottom} className="fill-stone-100" />}
      {view === "side" && <line x1={-MARGIN} x2={width} y1={V(0)} y2={V(0)} className="stroke-stone-400" stroke-width={0.8} />}
      {view === "top" && <line x1={0} x2={far} y1={V(0)} y2={V(0)} className="stroke-slate-300" stroke-width={0.6} stroke-dasharray="3 3" />}
      {ticks}
      <g clip-path={`url(#ls-clip-${view})`}>
        {wedges}
        {rays}
      </g>
      <line x1={sx} x2={sx} y1={V(screenLo)} y2={V(screenHi)} className="stroke-slate-800" stroke-width={2.2} />
      <text x={sx} y={view === "side" ? V(screenHi) - 3 : V(screenLo) - 3} text-anchor="middle" className="fill-slate-600 text-[6.5px]">{t.screen}</text>
      {marks}
      <g data-testid="drawing-object" className={`fill-sky-700 stroke-sky-900 ${p.movable(objectPicked) ? "cursor-grab" : ""}`} stroke-width={0.6}
        onPointerDown={down(objectPicked, { x: positions.objectX, v: centreV }) as any}>
        {view === "side" && o.elevation > 0 && <line x1={X(positions.objectX)} x2={X(positions.objectX)} y1={V(o.elevation)} y2={V(0)} className="stroke-slate-400" stroke-width={0.8} />}
        {objectShape}
        <rect x={X(positions.objectX) - 9} y={V(view === "side" ? o.elevation + o.height : o.width / 2) - 3} width={18}
          height={(view === "side" ? o.height : o.width) + 6} fill="transparent" stroke="none" />
      </g>
      {lampShapes}
      {!measures && <text x={far / 2} y={12} text-anchor="middle" className="fill-rose-700 text-[8px] font-semibold">{t.noShadow}</text>}
    </svg>
  );
};

/** The outline of the figure as an SVG path in a box of w × h, for the object's picture in the controls. */
export const figurePath = (w: number, h: number) =>
  FIGURE.map(([u, v], i) => `${i ? "L" : "M"}${((u + 0.5) * w).toFixed(2)},${((1 - v) * h).toFixed(2)}`).join(" ") + " Z";

export default Drawing;
