// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/graphFunctionInteraction,
// © 2014-2017 Parcc, Inc., by Sam Sipasseuth (Open Assessment Technologies)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { useRef, useState } from "preact/hooks";
import {
  FunctionState, Point, Settings, asymptotes, clean, curve, fitOf, formatPoint, formatValue, isFit, limits, origin, range, snap,
  snapPoint, snapSize,
} from "./functions";
import { Actions } from "./store";
import { Texts } from "./texts";

// The graph: a grid with the author's axes, the two points of the candidate and the curve of the chosen family through
// them, with its asymptotes. The mouse (or a finger) drags a point, or clicks on the grid to place a point or move the
// selected one there; the keyboard moves a point (or a cursor while points are to be placed) with the arrow keys.

/** Where the grid is within the view box, for a story that clicks on it. */
export const layout = (s: Settings) => {
  const left = 52 + (s.y.title ? 26 : 0);
  const top = 30 + (s.title ? 30 : 0);
  const right = 30;
  const bottom = 34 + (s.x.title ? 28 : 0);
  return { left, top, width: s.width, height: s.height, viewW: left + s.width + right, viewH: top + s.height + bottom };
};

type Dispatch = <K extends keyof Actions>(type: K, payload: Actions[K]) => void;

const font = "system-ui, -apple-system, Segoe UI, sans-serif";

const Plot = ({ s, state, texts, readOnly, dispatch, announce, selected, setSelected, pointName }: {
  s: Settings;
  state: FunctionState;
  texts: Texts;
  readOnly: boolean;
  dispatch: Dispatch;
  announce: (message: string, next?: FunctionState) => void;
  selected: number | null;
  setSelected: (index: number | null) => void;
  pointName: (index: number) => string;
}) => {
  const svg = useRef<SVGSVGElement>(null);
  const L = layout(s);
  const { x: xa, y: ya } = s;
  const px = (x: number) => L.left + ((x - xa.start) / (xa.end - xa.start)) * L.width;
  const py = (y: number) => L.top + L.height - ((y - ya.start) / (ya.end - ya.start)) * L.height;
  const o = origin(s);
  const [cursor, setCursor] = useState<Point>(snapPoint(o, s));
  const [focused, setFocused] = useState(false);
  /** A point being dragged, where it is now and whether it moved. */
  const [drag, setDrag] = useState<{ index: number; x: number; y: number; moved: boolean } | null>(null);
  const dragRef = useRef(drag);
  const pointText = (p: Point) => formatPoint(p, s.language);
  const placing = state.points.length < 2;

  /** A position on the screen in units of the axes, snapped; null outside the grid. */
  const toGrid = (clientX: number, clientY: number, anywhere = false): Point | null => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    const pt = el.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const v = pt.matrixTransform(ctm.inverse());
    const inside = v.x >= L.left - 8 && v.x <= L.left + L.width + 8 && v.y >= L.top - 8 && v.y <= L.top + L.height + 8;
    if (!inside && !anywhere) return null;
    const x = xa.start + ((v.x - L.left) / L.width) * (xa.end - xa.start);
    const y = ya.start + ((L.top + L.height - v.y) / L.height) * (ya.end - ya.start);
    return snapPoint({ x, y }, s);
  };

  const with_ = (index: number, p: Point): FunctionState => ({ ...state, points: state.points.map((q, i) => (i === index ? p : q)) });

  const move = (index: number, p: Point) => {
    dispatch("MOVE_POINT", { index, ...p });
    announce(texts.moved(pointName(index), pointText(p)), with_(index, p));
  };

  const add = (p: Point) => {
    const index = state.points.length;
    dispatch("ADD_POINT", p);
    setCursor(p);
    setSelected(index === 1 ? 1 : null);
    announce(texts.placed(pointName(index), pointText(p)), { ...state, points: [...state.points, p] });
  };

  // a drag goes on outside the graph: listen on the window while it lasts
  const startDrag = (index: number, p: Point) => {
    const update = (next: typeof drag) => {
      dragRef.current = next;
      setDrag(next);
    };
    update({ index, ...p, moved: false });
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      const at = toGrid(e.clientX, e.clientY, true);
      if (!d || !at) return;
      update({ ...d, ...at, moved: d.moved || at.x !== p.x || at.y !== p.y });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const d = dragRef.current;
      update(null);
      if (!d) return;
      if (d.moved && (d.x !== p.x || d.y !== p.y)) move(d.index, { x: d.x, y: d.y });
      else announce(texts.selected(pointName(index), pointText(p)));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
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
      startDrag(index, p);
      return;
    }
    const at = toGrid(e.clientX, e.clientY);
    if (!at) return;
    e.preventDefault();
    if (placing) return add(at);
    // as the original: a click moves the second point, or the selected one
    const index = selected ?? 1;
    const p = state.points[index];
    if (p.x !== at.x || p.y !== at.y) move(index, at);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (readOnly) return;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const index = placing ? null : selected ?? 0;
    if (arrows[e.key]) {
      e.preventDefault();
      const [dx, dy] = arrows[e.key];
      const from = index === null ? cursor : state.points[index];
      const lx = limits(xa), ly = limits(ya);
      const next = {
        x: clean(Math.max(lx.min, Math.min(lx.max, e.shiftKey ? from.x + dx * xa.step : snap(from.x + dx * snapSize(xa), xa)))),
        y: clean(Math.max(ly.min, Math.min(ly.max, e.shiftKey ? from.y + dy * ya.step : snap(from.y + dy * snapSize(ya), ya)))),
      };
      if (index === null) {
        setCursor(next);
        announce(texts.cursor(pointText(next)));
      } else {
        setSelected(index);
        if (next.x !== from.x || next.y !== from.y) move(index, next);
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (index === null) return add(cursor);
      const other = index === 0 ? 1 : 0;
      setSelected(other);
      announce(texts.selected(pointName(other), pointText(state.points[other])));
    } else if (e.key === "Escape" && selected !== null) {
      e.preventDefault();
      setSelected(null);
    }
  };

  // what is drawn: the dragged point where it is now
  const shown = state.points.map((p, i) => (drag?.index === i ? { x: drag.x, y: drag.y } : p));
  const f = fitOf({ ...state, points: shown });
  const lines = isFit(f) ? curve(f, range(xa), range(ya)) : [];
  const walls = isFit(f) && s.showAsymptotes ? asymptotes(f, range(xa)) : { vertical: [], horizontal: [] };

  // the grid: a line every step, a lighter one every snap where they are not too close
  const ticks = (a: Settings["x"]) => {
    const n = Math.round((a.end - a.start) / a.step);
    return Array.from({ length: n + 1 }, (_, i) => clean(a.start + i * a.step)).filter((v) => v <= a.end + 1e-9);
  };
  const subs = (a: Settings["x"], pixels: number) => {
    const n = Math.round((a.end - a.start) / snapSize(a));
    if (a.subStep < 2 || pixels / n < 8 || n > 400) return [];
    return Array.from({ length: n + 1 }, (_, i) => clean(a.start + i * snapSize(a))).filter((v, i) => i % a.subStep !== 0 && v <= a.end);
  };
  const xt = ticks(xa), yt = ticks(ya);
  const everyX = Math.max(1, Math.ceil(xt.length / Math.max(2, L.width / 34)));
  const everyY = Math.max(1, Math.ceil(yt.length / Math.max(2, L.height / 26)));
  const axisX = py(o.y), axisY = px(o.x);
  /** Both axes inside the grid: one 0 at the origin. */
  const crossInside = o.x !== xa.start && o.y !== ya.start;

  const label = `${texts.graph}: ${texts.family[state.family]}; ` +
    [0, 1].map((i) => `${pointName(i)} ${state.points[i] ? pointText(state.points[i]) : texts.notPlaced}`).join("; ");

  return (
    <svg ref={svg} viewBox={`0 0 ${L.viewW} ${L.viewH}`} style={{ maxWidth: `${L.viewW}px`, cursor: readOnly ? "default" : "crosshair" }}
      className="block h-auto w-full touch-none select-none rounded-lg border border-slate-300 bg-white outline-none focus-visible:ring-4 focus-visible:ring-blue-600/40"
      tabIndex={readOnly ? -1 : 0} role="application" aria-roledescription={texts.graph} aria-label={label}
      aria-describedby="plot-help" aria-disabled={readOnly ? "true" : undefined} data-testid="plot"
      onPointerDown={onPointerDown} onKeyDown={onKeyDown} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
      <defs>
        <clipPath id="grid-clip"><rect x={L.left} y={L.top} width={L.width} height={L.height} /></clipPath>
        <marker id="axis-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#334155" />
        </marker>
      </defs>
      <rect x={L.left - 8} y={L.top - 8} width={L.width + 16} height={L.height + 16} fill="transparent" />
      <g stroke-width="1">
        {subs(xa, L.width).map((v) => <path key={`sx${v}`} d={`M${px(v)} ${L.top}V${L.top + L.height}`} stroke="#f1f5f9" />)}
        {subs(ya, L.height).map((v) => <path key={`sy${v}`} d={`M${L.left} ${py(v)}H${L.left + L.width}`} stroke="#f1f5f9" />)}
        {xt.map((v) => <path key={`gx${v}`} d={`M${px(v)} ${L.top}V${L.top + L.height}`} stroke="#d5dde8" />)}
        {yt.map((v) => <path key={`gy${v}`} d={`M${L.left} ${py(v)}H${L.left + L.width}`} stroke="#d5dde8" />)}
      </g>
      <rect x={L.left} y={L.top} width={L.width} height={L.height} fill="none" stroke="#94a3b8" />
      {/* the axes, through the origin (or along the border), with arrows */}
      <path d={`M${L.left} ${axisX}H${L.left + L.width + 18}`} stroke="#334155" stroke-width="1.6" marker-end="url(#axis-arrow)" />
      <path d={`M${axisY} ${L.top + L.height}V${L.top - 18}`} stroke="#334155" stroke-width="1.6" marker-end="url(#axis-arrow)" />
      <g font-size="12" fill="#334155" font-family={font} aria-hidden="true">
        {xt.filter((_, i) => i % everyX === 0).filter((v) => !(crossInside && v === o.x)).map((v) => (
          <text key={`tx${v}`} x={px(v)} y={Math.min(axisX + 16, L.top + L.height + 16)} text-anchor="middle">{formatValue(v, s.language)}</text>
        ))}
        {yt.filter((_, i) => i % everyY === 0).filter((v) => !(crossInside && v === o.y)).map((v) => (
          <text key={`ty${v}`} x={axisY - 6} y={py(v) + 4} text-anchor="end">{formatValue(v, s.language)}</text>
        ))}
        {crossInside && <text x={axisY - 6} y={axisX + 16} text-anchor="end">0</text>}
        {xa.label && <text x={L.left + L.width + 22} y={axisX + 4} font-size="15" font-style="italic" data-testid="x-label">{xa.label}</text>}
        {ya.label && <text x={axisY} y={L.top - 22} text-anchor="middle" font-size="15" font-style="italic" data-testid="y-label">{ya.label}</text>}
        {xa.title && <text x={L.left + L.width / 2} y={L.viewH - 10} text-anchor="middle" font-size="14" font-weight="600" fill="#0f172a">{xa.title}</text>}
        {ya.title && <text x={16} y={L.top + L.height / 2} text-anchor="middle" font-size="14" font-weight="600" fill="#0f172a"
          transform={`rotate(-90 16 ${L.top + L.height / 2})`}>{ya.title}</text>}
        {s.title && <text x={L.viewW / 2} y={24} text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a" data-testid="title">{s.title}</text>}
      </g>
      <g clip-path="url(#grid-clip)">
        {walls.vertical.map((v) => (
          <path key={`av${v}`} d={`M${px(v)} ${L.top}V${L.top + L.height}`} stroke="#64748b" stroke-width="1.6" stroke-dasharray="6 5" data-testid="asymptote" />
        ))}
        {walls.horizontal.map((v) => (
          <path key={`ah${v}`} d={`M${L.left} ${py(v)}H${L.left + L.width}`} stroke="#64748b" stroke-width="1.6" stroke-dasharray="6 5" data-testid="asymptote" />
        ))}
        {lines.map((line, i) => (
          <polyline key={i} points={line.map((p) => `${clean(px(p.x))},${clean(py(p.y))}`).join(" ")} fill="none" stroke={s.plotColor}
            stroke-width={s.plotThickness} stroke-linejoin="round" stroke-linecap="round" data-testid="curve" />
        ))}
      </g>
      {focused && placing && !readOnly && (
        <g data-testid="cursor" pointer-events="none">
          <circle cx={px(cursor.x)} cy={py(cursor.y)} r="9" fill="none" stroke="#2563eb" stroke-width="1.6" stroke-dasharray="3 2" />
          <path d={`M${px(cursor.x)} ${py(cursor.y) - 14}v28M${px(cursor.x) - 14} ${py(cursor.y)}h28`} stroke="#2563eb" stroke-width="0.8" />
        </g>
      )}
      {shown.map((p, i) => {
        const x = px(p.x), y = py(p.y);
        const active = !readOnly && (selected === i || (focused && selected === null && !placing && i === 0));
        return (
          <g key={i} data-point={i} style={{ cursor: readOnly ? "default" : drag?.index === i ? "grabbing" : "grab" }}>
            <circle cx={x} cy={y} r={Math.max(s.pointRadius + 6, 18)} fill="transparent" />
            {active && <circle cx={x} cy={y} r={s.pointRadius + 5} fill="none" stroke="#f59e0b" stroke-width="3" data-testid="selected" />}
            <circle cx={x} cy={y} r={s.pointRadius} fill={s.pointColor} stroke="white" stroke-width="2" />
            <text x={x + s.pointRadius + 3} y={y - s.pointRadius - 1} font-size="13" font-weight="700" font-family={font} fill={s.pointColor}
              stroke="white" stroke-width="3" paint-order="stroke" aria-hidden="true">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
};

export default Plot;
