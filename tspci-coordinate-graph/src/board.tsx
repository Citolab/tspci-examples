// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/graphLineAndPointInteraction
// (Thibault Milan, Sam Sipasseuth) and .../graphPointLineGraphInteraction (Sam Sipasseuth, Christophe Noël),
// © 2014-2017 Parcc, Inc. (Open Assessment Technologies, for Parcc, Inc.)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useRef, useState } from "preact/hooks";
import {
  ElementDef, ElementValue, Grid, Point, Settings, addPoint, clipToGrid, equationText, formatNumber, formatPoint, gridValues,
  isLineType, linesOf, movePoint, regionAt, regionsOf, samePoint, snapPoint, toggleRegion, clean, GraphState, bounds,
} from "./model";
import { Dispatch } from "./store";
import { Texts } from "./texts";

// The coordinate grid in SVG, for the candidate and for the author's correct answer. The mouse (or a finger) places
// points for the chosen element, drags points, drags them off the grid to remove them, and shades areas for a
// solution set; the keyboard moves a cursor over the grid and does the same with Enter, the arrow keys and Delete.

/** The plot area is at most this wide or high, in view box units. */
const SIZE = 520;
const M = { left: 40, right: 36, top: 28, bottom: 36 };
/** How far off the grid (in view box units) a dragged point is removed. */
const OFF = 28;

export type Layout = {
  w: number; h: number; pw: number; ph: number;
  px: (x: number) => number; py: (y: number) => number;
  /** view box → grid units */
  dx: (vx: number) => number; dy: (vy: number) => number;
};

/** Square cells when the ranges are not too different; otherwise a fixed 520 × 400. */
export const layout = (g: Grid): Layout => {
  const xr = g.xMax - g.xMin, yr = g.yMax - g.yMin;
  const kx = SIZE / xr, ky = SIZE / yr;
  let pw: number, ph: number;
  if (Math.max(kx, ky) / Math.min(kx, ky) <= 1.6) {
    const k = Math.min(kx, ky);
    pw = xr * k;
    ph = yr * k;
  } else {
    pw = SIZE;
    ph = 400;
  }
  return {
    w: pw + M.left + M.right, h: ph + M.top + M.bottom, pw, ph,
    px: (x) => M.left + ((x - g.xMin) / xr) * pw,
    py: (y) => M.top + ph - ((y - g.yMin) / yr) * ph,
    dx: (vx) => g.xMin + ((vx - M.left) / pw) * xr,
    dy: (vy) => g.yMin + ((M.top + ph - vy) / ph) * yr,
  };
};

export type BoardProps = {
  s: Settings;
  values: Record<string, ElementValue>;
  /** The element the candidate draws now. */
  activeId: string | null;
  onActivate: (id: string) => void;
  dispatch: Dispatch;
  announce: (message: string) => void;
  texts: Texts;
  readOnly: boolean;
  label: string;
  describedBy?: string;
  testId?: string;
};

type Selected = { id: string; index: number };
type Drag = Selected & Point & { moved: boolean; off: boolean };

const Board = ({ s, values, activeId, onActivate, dispatch, announce, texts, readOnly, label, describedBy, testId = "board" }: BoardProps) => {
  const g = s.grid;
  const L = layout(g);
  const svg = useRef<SVGSVGElement>(null);
  const start = snapPoint({ x: Math.max(g.xMin, Math.min(g.xMax, 0)), y: Math.max(g.yMin, Math.min(g.yMax, 0)) }, g);
  const [cursor, setCursor] = useState<Point>(start);
  const [focused, setFocused] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const state: GraphState = { values };
  const def = (id: string | null) => s.elements.find((e) => e.id === id) ?? null;
  const active = def(activeId);
  const pt = (p: Point) => formatPoint(p, s.language);
  // a point removed elsewhere (restore, clear) is no longer selected
  const sel = selected && values[selected.id]?.points[selected.index] ? selected : null;
  const regions = regionsOf(linesOf(s, values), g);

  const toView = (clientX: number, clientY: number) => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    const p = el.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const v = p.matrixTransform(ctm.inverse());
    const inGrid = (m: number) => v.x >= M.left - m && v.x <= M.left + L.pw + m && v.y >= M.top - m && v.y <= M.top + L.ph + m;
    return { x: L.dx(v.x), y: L.dy(v.y), inside: inGrid(8), off: !inGrid(OFF) };
  };

  const lineMessage = (e: ElementDef, pts: Point[]) =>
    e.type === "line" && pts.length === 2 ? " " + texts.line(e.label, equationText(pts[0], pts[1], s.language)) : "";

  const add = (e: ElementDef, p: Point) => {
    const r = addPoint(s, state, e.id, p);
    if (!r) {
      const q = snapPoint(p, g);
      return announce(isLineType(e.type) && values[e.id]?.points.length === 1 && samePoint(values[e.id].points[0], q) ? texts.samePoint : texts.taken);
    }
    const q = r.state.values[e.id].points[r.index];
    dispatch("ADD_POINT", { id: e.id, ...q });
    setSelected(null);
    setCursor(q);
    announce((r.replaced ? texts.replaced(e.label, pt(q)) : texts.placed(e.label, pt(q))) + lineMessage(e, r.state.values[e.id].points));
  };

  const move = (e: ElementDef, index: number, p: Point) => {
    const next = movePoint(s, state, e.id, index, p);
    if (!next) return announce(texts.taken);
    const q = next.values[e.id].points[index];
    dispatch("MOVE_POINT", { id: e.id, index, ...q });
    setCursor(q);
    announce(texts.moved(e.label, pt(q)) + lineMessage(e, next.values[e.id].points));
  };

  const remove = (e: ElementDef, index: number) => {
    const p = values[e.id]?.points[index];
    if (!p) return;
    dispatch("REMOVE_POINT", { id: e.id, index });
    setSelected(null);
    announce(texts.removed(e.label, pt(p)));
  };

  const toggle = (e: ElementDef, p: Point) => {
    const r = toggleRegion(s, state, e.id, p);
    if (!r) return announce(texts.noArea);
    dispatch("TOGGLE_REGION", { id: e.id, x: p.x, y: p.y });
    announce(r.shaded ? texts.shaded(r.index + 1) : texts.unshaded(r.index + 1));
  };

  const startDrag = (e: ElementDef, index: number, p: Point) => {
    const update = (next: Drag | null) => {
      dragRef.current = next;
      setDrag(next);
    };
    update({ id: e.id, index, ...p, moved: false, off: false });
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      const v = toView(ev.clientX, ev.clientY);
      if (!d || !v) return;
      const at = snapPoint(v, g);
      update({ ...d, ...at, moved: d.moved || !samePoint(at, p) || v.off, off: v.off });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const d = dragRef.current;
      update(null);
      if (!d) return;
      if (d.off) remove(e, index);
      else if (d.moved) move(e, index, d);
      else announce(texts.selected(e.label, pt(p)));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onPointerDown = (ev: PointerEvent) => {
    if (readOnly || ev.button > 0) return;
    const target = (ev.target as Element).closest?.("[data-point]");
    if (target) {
      const e = def(target.getAttribute("data-element"));
      const index = Number(target.getAttribute("data-point"));
      const p = e && values[e.id]?.points[index];
      if (!e || !p) return;
      ev.preventDefault();
      if (e.id !== activeId) onActivate(e.id);
      setSelected({ id: e.id, index });
      setCursor(p);
      startDrag(e, index, p);
      return;
    }
    const v = toView(ev.clientX, ev.clientY);
    if (!v?.inside || !active) return;
    ev.preventDefault();
    if (active.type === "solutionSet") toggle(active, v);
    else add(active, v);
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (readOnly) return;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const selDef = sel ? def(sel.id) : null;
    const point = sel ? values[sel.id].points[sel.index] : null;
    if (arrows[ev.key]) {
      ev.preventDefault();
      const [dx, dy] = arrows[ev.key];
      const from = point ?? cursor;
      const f = ev.shiftKey ? 1 : g.snap;
      const next = snapPoint({ x: clean(from.x + dx * g.xStep * f), y: clean(from.y + dy * g.yStep * f) }, g);
      if (point && selDef) move(selDef, sel.index, next);
      else {
        setCursor(next);
        announce(texts.cursor(pt(next)));
      }
    } else if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      if (point && selDef) {
        setSelected(null);
        announce(texts.moved(selDef.label, pt(point)));
        return;
      }
      if (!active) return;
      if (active.type === "solutionSet") {
        // just off the cursor, so that a cursor on a line still picks an area
        toggle(active, { x: cursor.x + g.xStep * 0.013, y: cursor.y + g.yStep * 0.007 });
        return;
      }
      const index = (values[active.id]?.points ?? []).findIndex((p) => samePoint(p, cursor));
      if (index >= 0) {
        setSelected({ id: active.id, index });
        announce(texts.selected(active.label, pt(cursor)));
      } else add(active, cursor);
    } else if ((ev.key === "Delete" || ev.key === "Backspace") && point && selDef) {
      ev.preventDefault();
      remove(selDef, sel.index);
    } else if (ev.key === "Escape" && point) {
      ev.preventDefault();
      setSelected(null);
    }
  };

  // what the grid shows: the dragged point where it is now
  const shown = (e: ElementDef): Point[] => (values[e.id]?.points ?? []).map((p, i) => (drag && drag.id === e.id && drag.index === i ? { x: drag.x, y: drag.y } : p));
  const xs = gridValues(g.xMin, g.xMax, g.xStep), ys = gridValues(g.yMin, g.yMax, g.yStep);
  const every = (n: number) => Math.max(1, Math.ceil(n / 12));
  const xAxis = g.yMin <= 0 && g.yMax >= 0 ? 0 : g.yMin; // where the horizontal axis is
  const yAxis = g.xMin <= 0 && g.xMax >= 0 ? 0 : g.xMin;
  const font = "system-ui, -apple-system, Segoe UI, sans-serif";
  const path = (poly: Point[]) => poly.map((p, i) => `${i ? "L" : "M"}${L.px(p.x).toFixed(2)} ${L.py(p.y).toFixed(2)}`).join("") + "Z";
  const pointsTo = (pts: Point[]) => pts.map((p) => `${L.px(p.x).toFixed(2)},${L.py(p.y).toFixed(2)}`).join(" ");
  const byX = (pts: Point[]) => [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const shadingActive = !readOnly && active?.type === "solutionSet";
  const hoverRegion = shadingActive && focused && !sel ? regionAt(regions, { x: cursor.x + g.xStep * 0.013, y: cursor.y + g.yStep * 0.007 }) : -1;
  const b = bounds(g);

  return (
    <svg ref={svg} viewBox={`0 0 ${L.w} ${L.h}`} data-testid={testId}
      className="block h-auto w-full touch-none select-none rounded-lg border border-slate-300 bg-white outline-none focus-visible:ring-4 focus-visible:ring-blue-600/40"
      style={{ maxWidth: `${Math.round(L.w * 1.15)}px`, cursor: readOnly ? "default" : "crosshair" }}
      tabindex={readOnly ? -1 : 0} role="application" aria-roledescription={texts.graph} aria-label={label}
      aria-describedby={describedBy} aria-disabled={readOnly ? "true" : undefined}
      onPointerDown={onPointerDown} onKeyDown={onKeyDown} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
      <defs>
        <clipPath id={`${testId}-clip`}><rect x={M.left} y={M.top} width={L.pw} height={L.ph} /></clipPath>
        <marker id={`${testId}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#334155" />
        </marker>
      </defs>
      {/* where a click lands */}
      <rect x={M.left - 8} y={M.top - 8} width={L.pw + 16} height={L.ph + 16} fill="transparent" />
      {/* the grid: a line every step, a lighter one at every snap position when that is half a step */}
      <g stroke-width="1">
        {g.snap === 0.5 && gridValues(g.xMin, g.xMax, g.xStep / 2).map((x) => <path key={`hx${x}`} d={`M${L.px(x)} ${M.top}V${M.top + L.ph}`} stroke="#f1f5f9" />)}
        {g.snap === 0.5 && gridValues(g.yMin, g.yMax, g.yStep / 2).map((y) => <path key={`hy${y}`} d={`M${M.left} ${L.py(y)}H${M.left + L.pw}`} stroke="#f1f5f9" />)}
        {xs.map((x) => <path key={`gx${x}`} d={`M${L.px(x)} ${M.top}V${M.top + L.ph}`} stroke="#d4dbe5" />)}
        {ys.map((y) => <path key={`gy${y}`} d={`M${M.left} ${L.py(y)}H${M.left + L.pw}`} stroke="#d4dbe5" />)}
        <rect x={M.left} y={M.top} width={L.pw} height={L.ph} fill="none" stroke="#94a3b8" />
      </g>
      {/* the shaded areas of every solution set */}
      <g clip-path={`url(#${testId}-clip)`}>
        {regions.map((r, i) => (i === hoverRegion ? <path key={`hover${i}`} d={path(r.polygon)} fill={active?.color ?? "#2563eb"} opacity="0.12" data-testid="hover-area" /> : null))}
        {s.elements.filter((e) => e.type === "solutionSet").map((e) =>
          regions.map((r, i) => ((values[e.id]?.regions ?? []).some((m) => regionAt([r], m) === 0) ? (
            <path key={`${e.id}-${i}`} d={path(r.polygon)} fill={e.color} opacity="0.3" data-testid="shaded-area" data-element={e.id} />
          ) : null)))}
      </g>
      {/* the axes */}
      <path d={`M${M.left} ${L.py(xAxis)}H${M.left + L.pw + 18}`} stroke="#334155" stroke-width="1.6" marker-end={`url(#${testId}-arrow)`} />
      <path d={`M${L.px(yAxis)} ${M.top + L.ph}V${M.top - 18}`} stroke="#334155" stroke-width="1.6" marker-end={`url(#${testId}-arrow)`} />
      <g font-size="12" fill="#334155" font-family={font} aria-hidden="true" stroke="#fff" stroke-width="3" paint-order="stroke" stroke-linejoin="round">
        {xs.filter((_, i) => i % every(xs.length) === 0).filter((x) => Math.abs(x - yAxis) > 1e-9 || yAxis !== 0).map((x) => (
          <text key={`tx${x}`} x={L.px(x)} y={Math.min(L.py(xAxis) + 15, M.top + L.ph + 15)} text-anchor="middle">{formatNumber(x, s.language)}</text>
        ))}
        {ys.filter((_, i) => i % every(ys.length) === 0).filter((y) => Math.abs(y - xAxis) > 1e-9 || xAxis !== 0).map((y) => (
          <text key={`ty${y}`} x={Math.max(L.px(yAxis) - 5, 14)} y={L.py(y) + 4} text-anchor="end">{formatNumber(y, s.language)}</text>
        ))}
        {xAxis === 0 && yAxis === 0 && <text x={L.px(0) - 5} y={L.py(0) + 15} text-anchor="end">0</text>}
        <text x={M.left + L.pw + 22} y={L.py(xAxis) + 4} font-size="15" font-style="italic" font-weight="600" data-testid="x-label">{s.xLabel}</text>
        <text x={L.px(yAxis)} y={M.top - 20} text-anchor="middle" font-size="15" font-style="italic" font-weight="600" data-testid="y-label">{s.yLabel}</text>
      </g>
      <g clip-path={`url(#${testId}-clip)`}>
        {/* the author's points */}
        {s.connectGiven && s.given.length >= 2 && <polyline points={pointsTo(byX(s.given))} fill="none" stroke="#64748b" stroke-width="2" />}
        {s.given.map((p, i) => (
          <g key={`given${i}`} data-testid="given">
            <circle cx={L.px(p.x)} cy={L.py(p.y)} r="5" fill="#475569" />
            {p.label && <text x={L.px(p.x) + 8} y={L.py(p.y) - 8} font-size="13" font-family={font} fill="#334155" font-weight="600"
              stroke="#fff" stroke-width="3" paint-order="stroke" stroke-linejoin="round">{p.label}</text>}
          </g>
        ))}
        {/* the lines, segments, rays and connected sets */}
        {s.elements.map((e) => {
          const pts = shown(e);
          const v = values[e.id];
          if (isLineType(e.type) && pts.length === 2) {
            const c = clipToGrid(pts[0], pts[1], e.type, g);
            if (!c) return null;
            return (
              <line key={`l-${e.id}`} x1={L.px(c[0].x)} y1={L.py(c[0].y)} x2={L.px(c[1].x)} y2={L.py(c[1].y)} stroke={e.color} stroke-width="3"
                stroke-linecap="round" stroke-dasharray={v?.dashed ? "10 7" : undefined} data-testid="drawn-line" data-element={e.id}
                data-dashed={v?.dashed ? "true" : "false"} />
            );
          }
          if (e.type === "points" && e.connect && pts.length >= 2) {
            return <polyline key={`c-${e.id}`} points={pointsTo(byX(pts))} fill="none" stroke={e.color} stroke-width="2.5" stroke-linejoin="round" data-testid="connect-line" />;
          }
          return null;
        })}
      </g>
      {/* the points: a large target for a finger, a halo for the element being drawn */}
      {s.elements.map((e) => shown(e).map((p, i) => {
        const removing = drag?.id === e.id && drag.index === i && drag.off;
        const x = L.px(p.x), y = L.py(p.y);
        const isSel = sel?.id === e.id && sel.index === i;
        return (
          <g key={`${e.id}-${i}`} data-point={i} data-element={e.id} opacity={removing ? 0.35 : 1}
            style={{ cursor: readOnly ? "default" : "grab" }}>
            <circle cx={x} cy={y} r="14" fill="transparent" />
            {e.id === activeId && !readOnly && <circle cx={x} cy={y} r="11" fill={e.color} opacity="0.18" />}
            <circle cx={x} cy={y} r="6.5" fill={e.type === "ray" && i === 1 ? "#fff" : e.color} stroke={e.type === "ray" && i === 1 ? e.color : "#fff"} stroke-width="2" />
            {isSel && <circle cx={x} cy={y} r="12" fill="none" stroke="#1d4ed8" stroke-width="2.4" data-testid="selected-point" />}
            {e.type === "point" && (
              <text x={x + 10} y={y - 10} font-size="13" font-weight="600" font-family={font} fill={e.color} aria-hidden="true"
                stroke="#fff" stroke-width="3" paint-order="stroke" stroke-linejoin="round">{e.label}</text>
            )}
          </g>
        );
      }))}
      {focused && !sel && !readOnly && (
        <g data-testid="cursor" pointer-events="none">
          <circle cx={L.px(cursor.x)} cy={L.py(cursor.y)} r="9" fill="none" stroke="#1d4ed8" stroke-width="1.8" stroke-dasharray="3 2" />
          <path d={`M${L.px(cursor.x)} ${L.py(cursor.y) - 15}v30M${L.px(cursor.x) - 15} ${L.py(cursor.y)}h30`} stroke="#1d4ed8" stroke-width="1" />
        </g>
      )}
      {/* the area a point can be in, when that is not the whole grid */}
      {!g.allowEdge && (
        <rect x={L.px(b.xMin)} y={L.py(b.yMax)} width={L.px(b.xMax) - L.px(b.xMin)} height={L.py(b.yMin) - L.py(b.yMax)}
          fill="none" stroke="#cbd5e1" stroke-dasharray="2 3" pointer-events="none" />
      )}
    </svg>
  );
};

export default Board;
