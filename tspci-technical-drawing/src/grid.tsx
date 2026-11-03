import { useRef, useState } from "preact/hooks";
import { LineKind, View } from "./model";
import { Line, formatNumber } from "./task";
import { Texts } from "./texts";

// The grid of the "complete a view" task, in the view's coordinates on the drawing: the candidate draws lines from
// grid point to grid point with the mouse (click-click or drag), touch or the keyboard (a cursor on the grid).

export const pointText = (p: [number, number], language: string) =>
  `(${formatNumber(p[0], language)}${language === "nl" ? "; " : ", "}${formatNumber(p[1], language)})`;
export const lineText = (t: Texts, l: Line, language: string) => t.lineText(t.lineKindShort[l.kind], pointText(l.a, language), pointText(l.b, language));

/** The distance from a point to a line, in mm. */
const distance = (p: [number, number], l: Line) => {
  const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1];
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - l.a[0]) * dx + (p[1] - l.a[1]) * dy) / len2));
  return Math.hypot(p[0] - (l.a[0] + t * dx), p[1] - (l.a[1] + t * dy));
};

type Props = {
  view: View;
  X: (u: number) => number;
  Y: (v: number) => number;
  k: number;
  step: number;
  lines: Line[];
  kind: LineKind;
  erase: boolean;
  readOnly: boolean;
  texts: Texts;
  language: string;
  viewLabel: string;
  onAdd: (line: Line) => void;
  onRemove: (index: number) => void;
  announce: (message: string) => void;
};

export const GridLayer = (p: Props) => {
  const { view, X, Y, k, step } = p;
  const cols = Math.ceil(view.width / step - 1e-6) + 1, rows = Math.ceil(view.height / step - 1e-6) + 1;
  const [cursor, setCursorState] = useState<[number, number]>([0, 0]);
  const cursorRef = useRef<[number, number]>([0, 0]);
  const setCursor = (q: [number, number]) => { cursorRef.current = q; setCursorState(q); };
  // refs as well as state: a fast click's pointerup comes before the render of its pointerdown
  const [start, setStartState] = useState<[number, number] | null>(null);
  const startRef = useRef<[number, number] | null>(null);
  const setStart = (q: [number, number] | null) => { startRef.current = q; setStartState(q); };
  const dragRef = useRef(false);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [focused, setFocused] = useState(false);
  const t = p.texts;

  const clamp = (q: [number, number]): [number, number] => [
    Math.max(-1, Math.min(cols, q[0])) * step, Math.max(-1, Math.min(rows, q[1])) * step,
  ];
  const snap = (e: PointerEvent): [number, number] | null => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const q = pt.matrixTransform(m.inverse());
    const u = q.x - X(0), v = Y(0) - q.y;
    return clamp([Math.round(u / step), Math.round(v / step)]);
  };
  const same = (a: [number, number], b: [number, number]) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
  const finish = (a: [number, number], b: [number, number]) => {
    if (same(a, b)) return;
    const line: Line = { kind: p.kind, a, b };
    p.onAdd(line);
    p.announce(t.lineAdded(lineText(t, line, p.language)));
  };
  const eraseAt = (q: [number, number]) => {
    let best = -1, bestD = Infinity;
    p.lines.forEach((l, i) => {
      const d = distance(q, l);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best >= 0 && bestD <= Math.max(step * 0.45, 1.5 * k)) {
      p.announce(t.lineRemoved(lineText(t, p.lines[best], p.language)));
      p.onRemove(best);
    } else p.announce(t.nothingThere);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (p.readOnly) return;
    const q = snap(e);
    if (!q) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setCursor(q);
    if (p.erase) {
      // erase where the pointer is, not at the grid point
      const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
      eraseAt([r.x - X(0), Y(0) - r.y]);
      return;
    }
    dragRef.current = true;
    if (!startRef.current) setStart(q);
  };
  const onPointerMove = (e: PointerEvent) => {
    const q = snap(e);
    if (q) setHover(q);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!dragRef.current || p.readOnly) return;
    const q = snap(e);
    dragRef.current = false;
    const start = startRef.current;
    if (!q || !start) return;
    if (!same(q, start)) {
      finish(start, q);
      setStart(null);
    } else p.announce(t.lineStarted(pointText(q, p.language)));
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (p.readOnly) return;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      const next = clamp([Math.round(cursorRef.current[0] / step) + m[0], Math.round(cursorRef.current[1] / step) + m[1]]);
      setCursor(next);
      p.announce(t.cursorAt(pointText(next, p.language)));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setCursor([0, 0]);
      p.announce(t.cursorAt(pointText([0, 0], p.language)));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (p.erase) return eraseAt(cursorRef.current);
      const start = startRef.current;
      if (!start) {
        setStart(cursorRef.current);
        p.announce(t.lineStarted(pointText(cursorRef.current, p.language)));
      } else if (!same(start, cursorRef.current)) {
        finish(start, cursorRef.current);
        setStart(null);
      }
      return;
    }
    if (e.key === "Escape" && startRef.current) {
      e.preventDefault();
      setStart(null);
      p.announce(t.cancelled);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      eraseAt(cursorRef.current);
    }
  };

  const dots = [];
  for (let i = -1; i <= cols; i++) for (let j = -1; j <= rows; j++) dots.push(<circle key={`${i},${j}`} cx={X(i * step)} cy={Y(j * step)} r={0.35 * k} className="fill-slate-400" />);
  const end = hover ?? cursor;
  return (
    <g>
      <rect x={X(-step) - k} y={Y((rows) * step) - k} width={(cols + 1) * step + 2 * k} height={(rows + 1) * step + 2 * k}
        className={focused ? "fill-sky-50 stroke-sky-600" : "fill-slate-50 stroke-slate-200"} stroke-width={focused ? 0.6 * k : 0.25 * k} rx={k} />
      {dots}
      {p.lines.map((l, i) => (
        <line key={`l${i}`} x1={X(l.a[0])} y1={Y(l.a[1])} x2={X(l.b[0])} y2={Y(l.b[1])} data-testid="candidate-line" data-kind={l.kind}
          className="stroke-blue-700" stroke-linecap="round" stroke-width={l.kind === "visible" ? 0.8 * k : 0.45 * k}
          stroke-dasharray={l.kind === "hidden" ? `${2.4 * k} ${1.2 * k}` : undefined} />
      ))}
      {start && !p.erase && (
        <line x1={X(start[0])} y1={Y(start[1])} x2={X(end[0])} y2={Y(end[1])} className="stroke-blue-500" stroke-width={0.4 * k}
          stroke-dasharray={p.kind === "hidden" ? `${2.4 * k} ${1.2 * k}` : `${0.6 * k} ${0.6 * k}`} />
      )}
      {start && <circle cx={X(start[0])} cy={Y(start[1])} r={1.1 * k} className="fill-blue-700" />}
      {focused && <circle cx={X(cursor[0])} cy={Y(cursor[1])} r={1.6 * k} className="fill-none stroke-sky-700" stroke-width={0.5 * k} data-testid="grid-cursor" />}
      <rect x={X(-step) - k} y={Y(rows * step) - k} width={(cols + 1) * step + 2 * k} height={(rows + 1) * step + 2 * k} fill="transparent"
        tabIndex={p.readOnly ? -1 : 0} role="application" aria-roledescription={p.language === "nl" ? "tekenraster" : "drawing grid"}
        aria-label={t.gridOf(p.viewLabel)} data-testid="grid" className={p.erase ? "cursor-crosshair outline-none" : "cursor-crosshair outline-none"}
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
    </g>
  );
};
