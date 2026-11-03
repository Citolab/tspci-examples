import { useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import type { Plan, Solid } from "./plan";
import { COG_INK, stopColor, stopInk } from "./colors";
import type { Texts } from "./texts";

// The two 2D views: the floor seen from above (front left, door right, the left wall at the bottom) and the load seen
// from the left side (front left, floor at the bottom). Both are one focusable element (role application) that the
// keyboard drives (the interaction handles the keys); the mouse and touch drag boxes and click the floor.

export type ViewProps = {
  plan: Plan;
  solids: Solid[];
  selected: string | null;
  cog: { x: number; y: number; z: number } | null;
  t: Texts;
  readOnly: boolean;
  label: string;
  describedBy: string;
  onKeyDown: (e: KeyboardEvent) => void;
  onSelect: (id: string) => void;
  /** top view: a box picked up and put down at (x, y); side view: slid to x */
  onDrop: (id: string, x: number, y: number) => void;
  /** a click on the floor (top view) at a point, in cm */
  onFloor?: (x: number, y: number) => void;
  testid: string;
};

const MARGIN = 34;

/** A point of the pointer in the coordinates of the svg (cm). */
const svgPoint = (svg: SVGSVGElement, e: PointerEvent) => {
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
};

type Drag = { id: string; start: { x: number; y: number }; origin: { x: number; y: number }; at: { x: number; y: number }; moved: boolean; pointer: number };

/** A box as a rectangle with its id, stop and symbols. */
const BoxRect = ({ s, x, y, w, h, selected, ghost, t, extra, onPointerDown }: {
  s: Solid; x: number; y: number; w: number; h: number; selected: boolean; ghost?: boolean; t: Texts; extra?: string;
  onPointerDown?: (e: PointerEvent) => void;
}) => {
  const size = Math.max(7, Math.min(16, Math.min(w, h) * 0.32));
  const marks = `${s.box.upright ? "↑↑" : ""}${s.box.fragile ? " ⚠" : ""}`.trim();
  const second = [s.box.stop !== null ? t.stopShort(s.box.stop) : "", marks].filter(Boolean).join(" ");
  const lines = [s.id, second, extra ?? ""].filter(Boolean);
  return (
    <g data-box={s.id} data-selected={selected ? "true" : undefined} class={ghost ? "opacity-50" : "cursor-grab"} onPointerDown={onPointerDown}>
      <rect x={x} y={y} width={w} height={h} fill={stopColor(s.box.stop)} stroke={selected ? "#0f172a" : "#334155"} stroke-width={selected ? 3 : 0.8}
        stroke-dasharray={ghost ? "4 3" : undefined} rx="1.5" />
      {s.box.fragile && <rect x={x + 2} y={y + 2} width={Math.max(0, w - 4)} height={Math.max(0, h - 4)} fill="url(#lp-hatch)" pointer-events="none" />}
      {selected && <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} fill="none" stroke="#0f172a" stroke-width="1" stroke-dasharray="3 2" rx="3" pointer-events="none" />}
      <text x={x + w / 2} y={y + h / 2 - (lines.length - 1) * size * 0.55 + size * 0.35} font-size={size} font-weight="700" text-anchor="middle" fill={stopInk(s.box.stop)} pointer-events="none">
        {lines.map((line, i) => <tspan key={i} x={x + w / 2} dy={i ? size * 1.1 : 0} font-weight={i ? 400 : 700}>{line}</tspan>)}
      </text>
    </g>
  );
};

const Defs = () => (
  <defs>
    <pattern id="lp-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="#0f172a" stroke-opacity="0.35" stroke-width="1.4" />
    </pattern>
  </defs>
);

const CogMark = ({ x, y, label }: { x: number; y: number; label: string }) => (
  <g data-testid="cog-marker" pointer-events="none" aria-hidden="true">
    <circle cx={x} cy={y} r="7" fill="#fff" stroke={COG_INK} stroke-width="2" />
    <path d={`M${x - 11} ${y}h22M${x} ${y - 11}v22`} stroke={COG_INK} stroke-width="1.6" />
    <text x={x + 10} y={y - 9} font-size="10" font-weight="700" fill={COG_INK}>{label}</text>
  </g>
);

function useDrag(readOnly: boolean, onSelect: (id: string) => void, onDrop: (id: string, x: number, y: number) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const start = (s: Solid, e: PointerEvent) => {
    if (readOnly || !svg.current) return;
    e.stopPropagation();
    e.preventDefault();
    svg.current.setPointerCapture?.(e.pointerId);
    svg.current.focus({ preventScroll: true });
    onSelect(s.id);
    setDrag({ id: s.id, start: svgPoint(svg.current, e), origin: { x: s.x, y: s.y }, at: { x: s.x, y: s.y }, moved: false, pointer: e.pointerId });
  };
  return { svg, drag, setDrag, start };
}

export const TopView = (p: ViewProps) => {
  const { plan, solids, selected, cog, t, readOnly } = p;
  const { length: L, width: W, grid } = plan.space;
  const { svg, drag, setDrag, start } = useDrag(readOnly, p.onSelect, p.onDrop);
  const order = [...solids].sort((a, b) => a.z + a.dz - (b.z + b.dz));
  const lines: JSX.Element[] = [];
  const step = grid < 10 ? 10 : grid;
  for (let x = step; x < L; x += step) lines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={W} stroke-width={x % 50 === 0 ? 0.6 : 0.3} />);
  for (let y = step; y < W; y += step) lines.push(<line key={`y${y}`} x1={0} y1={W - y} x2={L} y2={W - y} stroke-width={y % 50 === 0 ? 0.6 : 0.3} />);
  const dragged = drag?.moved ? solids.find((s) => s.id === drag.id) : null;

  return (
    <svg ref={svg} role="application" aria-roledescription={t.topView} aria-label={p.label} aria-describedby={p.describedBy} tabindex={0}
      data-testid={p.testid} viewBox={`${-MARGIN} ${-MARGIN} ${L + 2 * MARGIN} ${W + 2 * MARGIN}`}
      class="block h-auto w-full touch-none select-none rounded-lg bg-white outline-none focus-visible:ring-2 focus-visible:ring-sky-600" style={{ maxHeight: 360 }}
      onKeyDown={p.onKeyDown}
      onPointerDown={(e) => {
        if (readOnly || !p.onFloor || !svg.current) return;
        const pt = svgPoint(svg.current, e);
        if (pt.x >= 0 && pt.x <= L && pt.y >= 0 && pt.y <= W) p.onFloor(pt.x, W - pt.y);
      }}
      onPointerMove={(e) => {
        if (!drag || !svg.current || e.pointerId !== drag.pointer) return;
        const pt = svgPoint(svg.current, e);
        const dx = pt.x - drag.start.x, dy = -(pt.y - drag.start.y);
        const moved = drag.moved || Math.hypot(dx, dy) > 4;
        setDrag({ ...drag, moved, at: { x: drag.origin.x + dx, y: drag.origin.y + dy } });
      }}
      onPointerUp={(e) => {
        if (!drag || e.pointerId !== drag.pointer) return;
        setDrag(null);
        if (drag.moved) p.onDrop(drag.id, drag.at.x, drag.at.y);
      }}
      onPointerCancel={() => setDrag(null)}>
      <Defs />
      <rect x={0} y={0} width={L} height={W} fill={plan.space.kind === "pallet" ? "#e9d8b8" : "#f1f5f9"} stroke="#334155" stroke-width="1.5" />
      <g stroke="#94a3b8" pointer-events="none">{lines}</g>
      {plan.space.kind !== "pallet" && <rect x={L - 2} y={0} width={6} height={W} fill="#334155" pointer-events="none" />}
      <g font-size="11" fill="#475569" pointer-events="none" aria-hidden="true">
        <text x={-8} y={W / 2} text-anchor="middle" transform={`rotate(-90 ${-8} ${W / 2})`}>{t.front}</text>
        {plan.space.kind !== "pallet" && <text x={L + 16} y={W / 2} text-anchor="middle" transform={`rotate(90 ${L + 16} ${W / 2})`} font-weight="700">{t.door}</text>}
        <text x={L / 2} y={W + 16} text-anchor="middle">{t.left}</text>
        <text x={L / 2} y={-8} text-anchor="middle">{t.right}</text>
      </g>
      {order.map((s) => (
        <BoxRect key={s.id} s={s} x={s.x} y={W - s.y - s.dy} w={s.dx} h={s.dy} selected={s.id === selected} t={t}
          extra={s.z > 0 ? `↥${Math.round(s.z)}` : undefined} onPointerDown={(e) => start(s, e)} />
      ))}
      {dragged && drag && (() => {
        const x = Math.max(0, Math.min(L - dragged.dx, Math.round(drag.at.x / grid) * grid));
        const y = Math.max(0, Math.min(W - dragged.dy, Math.round(drag.at.y / grid) * grid));
        return <BoxRect s={dragged} x={x} y={W - y - dragged.dy} w={dragged.dx} h={dragged.dy} selected ghost t={t} />;
      })()}
      {cog && <CogMark x={cog.x} y={W - cog.y} label={t.cogShort} />}
    </svg>
  );
};

export const SideView = (p: ViewProps) => {
  const { plan, solids, selected, cog, t, readOnly } = p;
  const { length: L, height: H, grid } = plan.space;
  const { svg, drag, setDrag, start } = useDrag(readOnly, p.onSelect, p.onDrop);
  const top = Math.max(H, ...solids.map((s) => s.z + s.dz));
  // far boxes first, so the nearer ones (small y) cover them
  const order = [...solids].sort((a, b) => b.y - a.y || a.z - b.z);
  const dragged = drag?.moved ? solids.find((s) => s.id === drag.id) : null;
  return (
    <svg ref={svg} role="application" aria-roledescription={t.sideView} aria-label={p.label} aria-describedby={p.describedBy} tabindex={0}
      data-testid={p.testid} viewBox={`${-MARGIN} ${-MARGIN + H - top} ${L + 2 * MARGIN} ${top + 2 * MARGIN}`}
      class="block h-auto w-full touch-none select-none rounded-lg bg-white outline-none focus-visible:ring-2 focus-visible:ring-sky-600" style={{ maxHeight: 360 }}
      onKeyDown={p.onKeyDown}
      onPointerMove={(e) => {
        if (!drag || !svg.current || e.pointerId !== drag.pointer) return;
        const pt = svgPoint(svg.current, e);
        const dx = pt.x - drag.start.x;
        setDrag({ ...drag, moved: drag.moved || Math.abs(dx) > 4, at: { x: drag.origin.x + dx, y: drag.origin.y } });
      }}
      onPointerUp={(e) => {
        if (!drag || e.pointerId !== drag.pointer) return;
        setDrag(null);
        if (drag.moved) p.onDrop(drag.id, drag.at.x, drag.at.y);
      }}
      onPointerCancel={() => setDrag(null)}>
      <Defs />
      <rect x={0} y={0} width={L} height={H} fill={plan.space.kind === "pallet" ? "none" : "#f8fafc"} stroke="#64748b" stroke-width="1"
        stroke-dasharray={plan.space.kind === "pallet" ? "6 4" : undefined} />
      <rect x={-4} y={H} width={L + 8} height={plan.space.kind === "pallet" ? 14 : 5} fill={plan.space.kind === "pallet" ? "#c8a26b" : "#475569"} />
      <g font-size="11" fill="#475569" pointer-events="none" aria-hidden="true">
        <text x={-8} y={H / 2} text-anchor="middle" transform={`rotate(-90 ${-8} ${H / 2})`}>{t.front}</text>
        {plan.space.kind !== "pallet" && <text x={L + 16} y={H / 2} text-anchor="middle" transform={`rotate(90 ${L + 16} ${H / 2})`} font-weight="700">{t.door}</text>}
        <text x={L / 2} y={-6} text-anchor="middle">{plan.space.kind === "pallet" ? t.maxHeight : t.roof}</text>
        <text x={L / 2} y={H + 26} text-anchor="middle">{t.floor}</text>
      </g>
      {order.map((s) => (
        <BoxRect key={s.id} s={s} x={s.x} y={H - s.z - s.dz} w={s.dx} h={s.dz} selected={s.id === selected} t={t} onPointerDown={(e) => start(s, e)} />
      ))}
      {dragged && drag && (() => {
        const x = Math.max(0, Math.min(L - dragged.dx, Math.round(drag.at.x / grid) * grid));
        return <BoxRect s={dragged} x={x} y={H - dragged.z - dragged.dz} w={dragged.dx} h={dragged.dz} selected ghost t={t} />;
      })()}
      {cog && <CogMark x={cog.x} y={H - cog.z} label={t.cogShort} />}
    </svg>
  );
};
