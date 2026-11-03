import { useMemo, useRef, useState } from "preact/hooks";
import { Defs, Drawing } from "./drawings";
import { Model, Point, geometryOf, positionOf, snap, stepValue, valueAt } from "./instrument";

// The instrument on screen: the drawing, dragging and the keyboard (a slider, in set mode), and the magnifier (on
// hover, and on focus at the reading point). The candidate's view and the authoring mode's preview both use it.

let counter = 0;
const LENS_RADIUS = 64;
const LENS_FACTOR = 2.5;

export type ViewProps = {
  m: Model;
  /** The value the instrument shows. */
  value: number;
  /** Drag and the keyboard set the value (set mode, the authoring mode). */
  editable: boolean;
  readOnly?: boolean;
  /** Meter: the range plugged in. */
  plugged?: number | null;
  /** The accessible name of the drawing, and of the slider. */
  label: string;
  sliderLabel?: string;
  valueText?: string;
  describedBy?: string;
  onChange?: (value: number) => void;
  magnifierLabel: string;
  testid?: string;
};

const View = ({ m, value, editable, readOnly, plugged, label, sliderLabel, valueText, describedBy, onChange, magnifierLabel, testid = "instrument" }: ViewProps) => {
  const uid = useMemo(() => `mi${++counter}`, []);
  const g = geometryOf(m);
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [lens, setLens] = useState<Point | null>(null);
  const [focused, setFocused] = useState(false);
  const shown = drag ?? value;
  const canEdit = editable && !readOnly;

  /** A pointer in the coordinates of the drawing (the SVG keeps the aspect ratio of its viewBox). */
  const local = (e: PointerEvent): Point => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * g.width) / r.width, y: ((e.clientY - r.top) * g.height) / r.height };
  };
  const moveTo = (p: Point) => {
    const next = snap(m, valueAt(m, p.x, p.y, dragging.current ?? shown));
    dragging.current = next;
    setDrag(next);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!canEdit || e.button !== 0) return;
    e.preventDefault();
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // a synthetic pointer: no capture, the moves still arrive on the drawing
    }
    dragging.current = shown;
    moveTo(local(e));
    (svg.current?.querySelector('[role="slider"]') as SVGElement | null)?.focus({ preventScroll: true } as FocusOptions);
  };
  const onPointerMove = (e: PointerEvent) => {
    const p = local(e);
    if (m.zoom && e.pointerType !== "touch") setLens(p);
    if (dragging.current !== null) moveTo(p);
  };
  const finish = () => {
    if (dragging.current === null) return;
    const v = dragging.current;
    dragging.current = null;
    setDrag(null);
    onChange?.(v);
  };

  const onSliderKey = (e: KeyboardEvent) => {
    if (!canEdit) return;
    const next = stepValue(m, shown, e.key, e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    onChange?.(next);
  };
  /** Read mode: the arrow keys move the magnifier over the drawing. */
  const onFigureKey = (e: KeyboardEvent) => {
    if (!m.zoom) return;
    const d = e.shiftKey ? 40 : 10;
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -d], ArrowDown: [0, d], ArrowLeft: [-d, 0], ArrowRight: [d, 0] };
    if (e.key === "Escape") return setLens(null);
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setLens((l) => {
      const from = l ?? positionOf(m, shown);
      return { x: Math.max(0, Math.min(g.width, from.x + move[0])), y: Math.max(0, Math.min(g.height, from.y + move[1])) };
    });
  };

  const reading = positionOf(m, shown);
  const lensAt = lens ?? (focused && m.zoom ? reading : null);
  const drawing = <Drawing m={m} value={shown} uid={uid} plugged={plugged} />;
  const figureProps: Record<string, unknown> = editable
    ? { role: "group", "aria-label": label }
    : { role: "img", "aria-label": label, tabIndex: m.zoom ? 0 : undefined, "aria-describedby": describedBy,
        onFocus: () => setFocused(true), onBlur: () => { setFocused(false); setLens(null); }, onKeyDown: onFigureKey };

  return (
    <svg ref={svg} viewBox={`0 0 ${g.width} ${g.height}`} width={g.width} height={g.height} data-testid={testid}
      class={`mi-figure block h-auto max-w-full select-none outline-none ${canEdit ? "cursor-pointer touch-none" : ""}`}
      style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }} {...figureProps}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish}
      onPointerLeave={() => dragging.current === null && setLens(null)}>
      <Defs uid={uid} />
      <g aria-hidden="true">{drawing}</g>
      {editable && (
        <g role="slider" tabIndex={readOnly ? -1 : 0} aria-label={sliderLabel ?? label} aria-valuemin={m.low} aria-valuemax={m.high}
          aria-valuenow={shown} aria-valuetext={valueText} aria-readonly={readOnly ? "true" : undefined} aria-describedby={describedBy}
          data-testid="handle" class="outline-none" onKeyDown={onSliderKey}
          onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); finish(); }}>
          <circle cx={reading.x} cy={reading.y} r={focused ? 13 : 9} fill="#fff" fill-opacity={focused ? 0.35 : 0.55}
            stroke={focused ? "#0369a1" : "#0284c7"} stroke-width={focused ? 3 : 2} stroke-dasharray={focused ? undefined : "3 2"} />
        </g>
      )}
      {!editable && focused && m.zoom && !lens && (
        <circle cx={reading.x} cy={reading.y} r={LENS_RADIUS + 4} fill="none" stroke="#0369a1" stroke-width={3} aria-hidden="true" />
      )}
      {lensAt && m.zoom && (
        <g class="mi-lens pointer-events-none" aria-hidden="true" data-testid="lens" data-label={magnifierLabel}>
          <clipPath id={`${uid}-lens`}>
            <circle cx={lensAt.x} cy={lensAt.y} r={LENS_RADIUS} />
          </clipPath>
          <g clip-path={`url(#${uid}-lens)`}>
            <circle cx={lensAt.x} cy={lensAt.y} r={LENS_RADIUS} fill="#fff" />
            <g transform={`translate(${lensAt.x} ${lensAt.y}) scale(${LENS_FACTOR}) translate(${-lensAt.x} ${-lensAt.y})`}>{drawing}</g>
          </g>
          <circle cx={lensAt.x} cy={lensAt.y} r={LENS_RADIUS} fill="none" stroke="#334155" stroke-width={4} />
          <circle cx={lensAt.x} cy={lensAt.y} r={LENS_RADIUS - 3} fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width={1.5} />
        </g>
      )}
    </svg>
  );
};

export default View;
