// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Lentillespci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useRef, useState } from "preact/hooks";
import { GraphState, Language, Point, clean, formatPoint, formatValue, linePoints, snap, snapOf, stepCount } from "./graph";
import { Actions } from "./store";
import { Texts } from "./texts";

// The graph: a grid with the candidate's scale, the axis labels and the title they chose, their points as red crosses
// (as in the original) and the line through them. The mouse places, drags and removes points; the keyboard moves a
// cursor and places, selects, moves and removes points; the list under the graph has every point with a delete button.

export const VIEW_W = 640, VIEW_H = 460;
/** The plot area within the view box. */
export const PLOT = { left: 78, top: 44, width: 640 - 78 - 24, height: 460 - 44 - 72 };
/** How far off the plot area (in view box units) a dragged point is removed. */
const OFF = 24;

type Dispatch = <K extends keyof Actions>(type: K, payload: Actions[K]) => void;

const axisText = (quantity: string, unit: string) => (quantity || unit ? `${quantity || "?"} (${unit || "?"})` : "?");

const Plot = ({ state, language, texts, readOnly, dispatch, announce, selected, setSelected }: {
  state: GraphState;
  language: Language;
  texts: Texts;
  readOnly: boolean;
  dispatch: Dispatch;
  announce: (message: string) => void;
  selected: number | null;
  setSelected: (index: number | null) => void;
}) => {
  const svg = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const [focused, setFocused] = useState(false);
  /** A point being dragged: where it is now, whether it moved and whether it is off the graph (removed on release). */
  const [drag, setDrag] = useState<{ index: number; x: number; y: number; moved: boolean; off: boolean } | null>(null);
  const dragRef = useRef(drag);

  const { x: xa, y: ya } = state;
  const px = (x: number) => PLOT.left + (x / xa.max) * PLOT.width;
  const py = (y: number) => PLOT.top + PLOT.height - (y / ya.max) * PLOT.height;
  const pointText = (p: Point) => formatPoint(p.x, p.y, language);
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  const snapped = (x: number, y: number): Point => ({ x: clamp(snap(x, xa), xa.max), y: clamp(snap(y, ya), ya.max) });

  /** A position on the screen in view box units and in data units. */
  const toView = (clientX: number, clientY: number) => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    const pt = el.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const v = pt.matrixTransform(ctm.inverse());
    return {
      vx: v.x, vy: v.y,
      x: ((v.x - PLOT.left) / PLOT.width) * xa.max,
      y: ((PLOT.top + PLOT.height - v.y) / PLOT.height) * ya.max,
      inside: v.x >= PLOT.left - 6 && v.x <= PLOT.left + PLOT.width + 6 && v.y >= PLOT.top - 6 && v.y <= PLOT.top + PLOT.height + 6,
      off: v.x < PLOT.left - OFF || v.x > PLOT.left + PLOT.width + OFF || v.y < PLOT.top - OFF || v.y > PLOT.top + PLOT.height + OFF,
    };
  };

  const add = (p: Point) => {
    if (state.points.length >= 30) return announce(texts.full);
    dispatch("ADD_POINT", p);
    setSelected(null);
    setCursor(p);
    announce(texts.placed(pointText(p)));
  };

  // a drag goes on outside the graph: listen on the window while it lasts
  const startDrag = (index: number, p: Point) => {
    const update = (next: typeof drag) => {
      dragRef.current = next;
      setDrag(next);
    };
    update({ index, x: p.x, y: p.y, moved: false, off: false });
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      const v = toView(e.clientX, e.clientY);
      if (!d || !v) return;
      const at = snapped(v.x, v.y);
      update({ ...d, ...at, moved: d.moved || at.x !== p.x || at.y !== p.y || v.off, off: v.off });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const d = dragRef.current;
      update(null);
      if (!d) return;
      if (d.off) {
        dispatch("REMOVE_POINT", { index: d.index });
        setSelected(null);
        announce(texts.removed(pointText(p)));
      } else if (d.moved) {
        dispatch("MOVE_POINT", { index: d.index, x: d.x, y: d.y });
        setCursor({ x: d.x, y: d.y });
        announce(texts.moved(pointText(d)));
      } else {
        announce(texts.selected(pointText(p)));
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (readOnly || e.button > 0) return;
    const target = (e.target as Element).closest?.("[data-point]");
    if (target) {
      const index = Number(target.getAttribute("data-point"));
      const p = state.points[index];
      if (!p) return;
      e.preventDefault();
      setSelected(index);
      setCursor(p);
      startDrag(index, p);
      return;
    }
    const v = toView(e.clientX, e.clientY);
    if (!v?.inside) return;
    e.preventDefault();
    add(snapped(v.x, v.y));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (readOnly) return;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const point = selected !== null ? state.points[selected] : null;
    if (arrows[e.key]) {
      e.preventDefault();
      const [dx, dy] = arrows[e.key];
      const from = point ?? cursor;
      const next = {
        x: clamp(clean(from.x + dx * (e.shiftKey ? xa.step : snapOf(xa))), xa.max),
        y: clamp(clean(from.y + dy * (e.shiftKey ? ya.step : snapOf(ya))), ya.max),
      };
      setCursor(next);
      if (point) {
        dispatch("MOVE_POINT", { index: selected, ...next });
        announce(texts.moved(pointText(next)));
      } else {
        announce(texts.cursor(pointText(next)));
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (point) {
        setSelected(null);
        announce(texts.moved(pointText(point)));
        return;
      }
      const near = state.points.findIndex((p) => Math.abs(p.x - cursor.x) <= snapOf(xa) / 2 && Math.abs(p.y - cursor.y) <= snapOf(ya) / 2);
      if (near >= 0) {
        setSelected(near);
        announce(texts.selected(pointText(state.points[near])));
      } else {
        add(cursor);
      }
    } else if ((e.key === "Delete" || e.key === "Backspace") && point) {
      e.preventDefault();
      dispatch("REMOVE_POINT", { index: selected });
      setSelected(null);
      announce(texts.removed(pointText(point)));
    } else if (e.key === "Escape" && point) {
      e.preventDefault();
      setSelected(null);
    }
  };

  const xSteps = stepCount(xa), ySteps = stepCount(ya);
  const every = (n: number) => Math.max(1, Math.ceil(n / 12));
  const shown = state.points.map((p, i) => (drag?.index === i ? { x: drag.x, y: drag.y } : p));
  const line = linePoints(shown.filter((_, i) => !(drag?.off && drag.index === i)));
  const font = "system-ui, -apple-system, Segoe UI, sans-serif";

  return (
    <svg ref={svg} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="block h-auto w-full max-w-[640px] touch-none select-none rounded-md border border-slate-300 bg-white outline-none focus-visible:ring-4 focus-visible:ring-teal-600/40"
      tabIndex={readOnly ? -1 : 0} role="application" aria-roledescription={texts.graph} aria-label={`${texts.graph}: ${state.title || axisText(ya.quantity, ya.unit) + " / " + axisText(xa.quantity, xa.unit)}`}
      aria-describedby="plot-help" aria-disabled={readOnly ? "true" : undefined} data-testid="plot"
      onPointerDown={onPointerDown} onKeyDown={onKeyDown} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{ cursor: readOnly ? "default" : "crosshair" }}>
      <defs>
        <clipPath id="plot-clip"><rect x={PLOT.left - 8} y={PLOT.top - 8} width={PLOT.width + 16} height={PLOT.height + 16} /></clipPath>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#334155" />
        </marker>
      </defs>
      {/* where a click places a point */}
      <rect x={PLOT.left - 6} y={PLOT.top - 6} width={PLOT.width + 12} height={PLOT.height + 12} fill="transparent" />
      {/* the grid: a line every step, a lighter one every half step */}
      <g stroke="#e2e8f0" stroke-width="0.8">
        {Array.from({ length: xSteps * 2 + 1 }, (_, i) => i * xa.step / 2).filter((v) => v <= xa.max + 1e-9).map((v, i) => (
          <path key={`gx${i}`} d={`M${px(v)} ${PLOT.top}V${PLOT.top + PLOT.height}`} stroke={i % 2 ? "#f1f5f9" : "#cbd5e1"} />
        ))}
        {Array.from({ length: ySteps * 2 + 1 }, (_, i) => i * ya.step / 2).filter((v) => v <= ya.max + 1e-9).map((v, i) => (
          <path key={`gy${i}`} d={`M${PLOT.left} ${py(v)}H${PLOT.left + PLOT.width}`} stroke={i % 2 ? "#f1f5f9" : "#cbd5e1"} />
        ))}
      </g>
      {/* the axes with arrows */}
      <path d={`M${PLOT.left} ${PLOT.top + PLOT.height}H${PLOT.left + PLOT.width + 16}`} stroke="#334155" stroke-width="1.6" marker-end="url(#arrow)" />
      <path d={`M${PLOT.left} ${PLOT.top + PLOT.height}V${PLOT.top - 16}`} stroke="#334155" stroke-width="1.6" marker-end="url(#arrow)" />
      <g font-size="13" fill="#334155" font-family={font} aria-hidden="true">
        {Array.from({ length: xSteps + 1 }, (_, i) => i).filter((i) => i % every(xSteps) === 0).map((i) => (
          <g key={`tx${i}`}>
            <path d={`M${px(i * xa.step)} ${PLOT.top + PLOT.height}v5`} stroke="#334155" />
            <text x={px(i * xa.step)} y={PLOT.top + PLOT.height + 19} text-anchor="middle">{formatValue(clean(i * xa.step), language)}</text>
          </g>
        ))}
        {Array.from({ length: ySteps + 1 }, (_, i) => i).filter((i) => i % every(ySteps) === 0).map((i) => (
          <g key={`ty${i}`}>
            <path d={`M${PLOT.left} ${py(i * ya.step)}h-5`} stroke="#334155" />
            <text x={PLOT.left - 9} y={py(i * ya.step) + 4} text-anchor="end">{formatValue(clean(i * ya.step), language)}</text>
          </g>
        ))}
        <text x={PLOT.left + PLOT.width / 2} y={VIEW_H - 18} text-anchor="middle" font-size="15" font-weight="600" data-testid="x-label"
          fill={xa.quantity ? "#0f172a" : "#94a3b8"}>{axisText(xa.quantity, xa.unit)}</text>
        <text x={20} y={PLOT.top + PLOT.height / 2} text-anchor="middle" font-size="15" font-weight="600" data-testid="y-label"
          transform={`rotate(-90 20 ${PLOT.top + PLOT.height / 2})`} fill={ya.quantity ? "#0f172a" : "#94a3b8"}>{axisText(ya.quantity, ya.unit)}</text>
        {state.title && <text x={VIEW_W / 2} y={24} text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">{state.title}</text>}
      </g>
      <g clip-path="url(#plot-clip)">
        {state.line && line.length >= 2 && (
          <polyline points={line.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")} fill="none" stroke="#0f766e" stroke-width="2.2"
            stroke-linejoin="round" data-testid="line" />
        )}
        {shown.map((p, i) => {
          const removing = drag?.index === i && drag.off;
          const x = px(p.x), y = py(p.y);
          return (
            <g key={i} data-point={i} style={{ cursor: readOnly ? "default" : "grab" }} opacity={removing ? 0.35 : 1}>
              <circle cx={x} cy={y} r="11" fill="transparent" />
              {selected === i && <circle cx={x} cy={y} r="10" fill="none" stroke="#2563eb" stroke-width="2" />}
              <path d={`M${x - 6} ${y - 6}l12 12M${x + 6} ${y - 6}l-12 12`} stroke={removing ? "#64748b" : "#dc2626"} stroke-width="2.6" stroke-linecap="round" />
            </g>
          );
        })}
        {focused && selected === null && !readOnly && (
          <g data-testid="cursor" pointer-events="none">
            <circle cx={px(cursor.x)} cy={py(cursor.y)} r="9" fill="none" stroke="#2563eb" stroke-width="1.6" stroke-dasharray="3 2" />
            <path d={`M${px(cursor.x)} ${py(cursor.y) - 14}v28M${px(cursor.x) - 14} ${py(cursor.y)}h28`} stroke="#2563eb" stroke-width="0.8" />
          </g>
        )}
      </g>
    </svg>
  );
};

export default Plot;
