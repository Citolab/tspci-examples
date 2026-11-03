import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";
import {
  Answer, EndKind, Interval, Line, MAX_JUMPS, Mode, Orientation, Snap, Task, formatNumber, inequality, jumpText,
  keySteps, middle, normalizeInterval, numberParts, parseNumber, positionsOf, snapStep, snapTo, sumText, ticks,
} from "./numberline";
import { Texts } from "./texts";

// The number line: an SVG with the line, its ticks and numbers, and what the candidate places on it (points, an
// interval, jumps), with the HTML controls of each mode around it. The candidate's view and the authoring mode both use
// it. Everything is a value on the line (numberline.ts); `along` is the distance in px from the start of the line.

export type View = {
  line: Line;
  mode: Mode;
  task: Task;
  snap: Snap;
  orientation: Orientation;
  length: number;
  showValues: boolean;
  /** Language of the numbers (data-language). */
  language: string;
  texts: Texts;
  readOnly: boolean;
  /** Accessible name of the line. */
  label: string;
  /** Authoring mode: the numbers are buttons that hide or show them. */
  onToggleHidden?: (value: number) => void;
};

/** Colour-blind safe (Okabe-Ito, darkened for white text); every point also carries its label. */
export const COLORS = ["#0072B2", "#B84700", "#007A5E", "#A8478C", "#6B5B00", "#1F5F8B", "#4B4B4B", "#7A3FA0"];
export const colorOf = (i: number) => COLORS[i % COLORS.length];
const ADD = "#0072B2";
const SUBTRACT = "#B84700";
const INK = "#1e293b";
const PAD = 34;

type Drag =
  | { kind: "point" | "chip"; i: number; moved: boolean; x: number; y: number }
  | { kind: "from" | "to"; moved: boolean; x: number; y: number }
  | { kind: "new"; anchor: number; moved: boolean; x: number; y: number }
  | { kind: "start"; moved: boolean; x: number; y: number }
  | { kind: "landing"; i: number; moved: boolean; x: number; y: number };

const ABOVE: Record<Mode, number> = { points: 100, interval: 46, jumps: 124, read: 86 };

/** The size of the drawing and where a value lies on it. */
export const geometry = (v: View) => {
  const horizontal = v.orientation !== "vertical";
  const above = ABOVE[v.mode];
  const below = horizontal ? 56 : 84;
  const width = horizontal ? v.length : above + below + 20;
  const height = horizontal ? above + below : v.length;
  const L = (horizontal ? width : height) - 2 * PAD;
  const base = above;
  const alongOf = (value: number) => ((value - v.line.min) / (v.line.max - v.line.min)) * L;
  /** A point at `along` on the line and `across` px off it: up (horizontal) or to the left (vertical). */
  const pt = (along: number, across = 0): [number, number] =>
    horizontal ? [PAD + along, base - across] : [base - across, PAD + L - along];
  return { horizontal, width, height, L, base, alongOf, pt };
};

/** A number in the drawing: a decimal, or a whole with a stacked fraction. */
const NumLabel = ({ value, x, y, anchor, view, size = 13, fill = INK, extra }: {
  value: number; x: number; y: number; anchor: "middle" | "start"; view: View; size?: number; fill?: string;
  extra?: JSX.SVGAttributes<SVGGElement>;
}) => {
  const p = numberParts(value, view.line.format, view.language);
  const cw = size * 0.6;
  const sign = p.negative ? "−" : "";
  if (p.decimal !== null) {
    const text = sign + p.decimal;
    return (
      <g {...extra}>
        <text x={x} y={y} text-anchor={anchor} dominant-baseline="central" font-size={size} fill={fill} class="tabular-nums">{text}</text>
      </g>
    );
  }
  const small = size * 0.82;
  const fracW = Math.max(String(p.num).length, String(p.den).length) * small * 0.62 + 4;
  const signW = sign ? cw : 0;
  const wholeW = p.whole !== null ? String(p.whole).length * cw + 2 : 0;
  const total = signW + wholeW + fracW;
  let left = anchor === "middle" ? x - total / 2 : x;
  const items: JSX.Element[] = [];
  if (sign) items.push(<text x={left} y={y} dominant-baseline="central" font-size={size} fill={fill}>{sign}</text>);
  left += signW;
  if (p.whole !== null) items.push(<text x={left} y={y} dominant-baseline="central" font-size={size} fill={fill}>{p.whole}</text>);
  left += wholeW;
  const cx = left + fracW / 2;
  items.push(
    <text x={cx} y={y - small * 0.62} text-anchor="middle" dominant-baseline="central" font-size={small} fill={fill}>{p.num}</text>,
    <line x1={left + 1} x2={left + fracW - 1} y1={y} y2={y} stroke={fill} stroke-width={1.1} />,
    <text x={cx} y={y + small * 0.66} text-anchor="middle" dominant-baseline="central" font-size={small} fill={fill}>{p.den}</text>
  );
  return <g {...extra}>{items}</g>;
};

const arrowHead = (tip: [number, number], from: [number, number], size: number, fill: string) => {
  const dx = tip[0] - from[0], dy = tip[1] - from[1];
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  const bx = tip[0] - ux * size, by = tip[1] - uy * size;
  const px = -uy * size * 0.55, py = ux * size * 0.55;
  return <polygon points={`${tip[0]},${tip[1]} ${bx + px},${by + py} ${bx - px},${by - py}`} fill={fill} />;
};

export const NumberLine = ({ view, answer, onChange }: {
  view: View;
  answer: Answer;
  /** A change, with what the status line says about it. */
  onChange: (next: Answer, message: string) => void;
}) => {
  const { line, mode, task, texts: t, readOnly } = view;
  const g = geometry(view);
  const { horizontal, width, height, L, base, alongOf, pt } = g;
  const svgRef = useRef<SVGSVGElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<Answer | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const step = snapStep(line, view.snap);
  const keys = keySteps(line, view.snap);
  const fmt = (v: number) => formatNumber(v, line.format, view.language);
  const shown = preview ?? answer;
  const allTicks = useMemo(() => ticks(line), [line]);

  useEffect(() => {
    if (!focusNext.current) return;
    const el = rootRef.current?.querySelector<HTMLElement | SVGElement>(`[data-focus="${focusNext.current}"]`);
    if (!el) return; // not drawn yet: the store's render comes after the status line's
    focusNext.current = null;
    (el as HTMLElement).focus();
  });

  const say = (message: string) => setStatus(message);
  const commit = (next: Answer, message: string, focus?: string) => {
    if (focus) focusNext.current = focus;
    say(message);
    onChange(next, message);
  };

  const valueAt = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    const along = horizontal ? p.x - PAD : PAD + L - p.y;
    const across = horizontal ? base - p.y : base - p.x;
    return { value: snapTo(line.min + (along / L) * (line.max - line.min), line, step), across };
  };

  // --- the messages

  const intervalMessage = (i: Interval | null) => (i ? t.intervalIs(inequality(i, line.format, view.language) ?? t.allNumbers) : t.intervalRemoved);
  const pointLabel = (i: number) => task.points[i]?.label || String(i + 1);
  const jumpMessage = (a: Answer, i: number) => {
    const route = positionsOf(task, a);
    return t.jumped(i + 1, jumpText(route[i], route[i + 1], line.format, view.language), fmt(route[i]), fmt(route[i + 1]));
  };

  // --- dragging (pointer events on the drawing, captured)

  const apply = (d: Drag, value: number, a: Answer): Answer => {
    switch (d.kind) {
      case "point":
      case "chip":
        return { ...a, points: a.points.map((p, j) => (j === d.i ? value : p)) };
      case "from":
        return a.interval ? { ...a, interval: { ...a.interval, from: value } } : a;
      case "to":
        return a.interval ? { ...a, interval: { ...a.interval, to: value } } : a;
      case "new":
        return { ...a, interval: { from: d.anchor, to: value, fromEnd: "closed", toEnd: "closed" } };
      case "start":
        return { ...a, start: value };
      case "landing":
        return { ...a, landings: a.landings.map((p, j) => (j === d.i ? value : p)) };
    }
  };

  const finish = (d: Drag, result: Answer) => {
    setDrag(null);
    setPreview(null);
    if ((d.kind === "from" || d.kind === "to") && !d.moved && result.interval) {
      // a click on an end: open ↔ closed
      const key = d.kind === "from" ? "fromEnd" : "toEnd";
      const kind: EndKind = result.interval[key] === "closed" ? "open" : "closed";
      const interval = normalizeInterval({ ...result.interval, [key]: kind }, line);
      commit({ ...result, interval }, intervalMessage(interval));
      return;
    }
    if (d.kind === "point" || d.kind === "chip") {
      const v = result.points[d.i];
      if (v === null || v === undefined) return;
      setSelected(null);
      commit(result, t.placed(pointLabel(d.i), fmt(v)));
    } else if (d.kind === "from" || d.kind === "to" || d.kind === "new") {
      const interval = result.interval ? normalizeInterval(result.interval, line) : null;
      commit({ ...result, interval }, intervalMessage(interval));
    } else if (d.kind === "start") {
      commit(result, t.startAt(fmt(result.start as number)));
    } else {
      commit(result, jumpMessage(result, (d as { i: number }).i));
    }
  };

  const startDrag = (e: PointerEvent, d: Drag, first: Answer) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // a synthetic event without an active pointer
    }
    setDrag(d);
    setPreview(first);
  };

  const onLineDown = (e: PointerEvent) => {
    if (readOnly || e.button > 0) return;
    const at = valueAt(e.clientX, e.clientY);
    if (!at) return;
    const v = at.value;
    const here = { moved: false, x: e.clientX, y: e.clientY };
    if (mode === "points") {
      const i = selected !== null && answer.points[selected] === null ? selected : answer.points.findIndex((p) => p === null);
      if (i < 0) return;
      const d: Drag = { kind: "point", i, ...here, moved: true };
      startDrag(e, d, apply(d, v, answer));
    } else if (mode === "interval") {
      const d: Drag = { kind: "new", anchor: v, ...here, moved: true };
      startDrag(e, d, apply(d, v, answer));
    } else if (mode === "jumps") {
      if (!task.jumps.givenStart && answer.start === null) {
        const d: Drag = { kind: "start", ...here, moved: true };
        startDrag(e, d, apply(d, v, answer));
      } else if (answer.landings.length >= MAX_JUMPS) {
        say(t.noMoreJumps);
      } else {
        const d: Drag = { kind: "landing", i: answer.landings.length, ...here, moved: true };
        startDrag(e, d, apply(d, v, { ...answer, landings: [...answer.landings, v] }));
      }
    }
  };

  const onMove = (e: PointerEvent) => {
    if (!drag || drag.kind === "chip") return;
    const at = valueAt(e.clientX, e.clientY);
    if (!at) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4;
    if (moved !== drag.moved) setDrag({ ...drag, moved });
    if (!moved) return;
    // a point dragged far away from the line goes back to the tray
    if (drag.kind === "point" && Math.abs(at.across) > 70) {
      setPreview({ ...answer, points: answer.points.map((p, j) => (j === drag.i ? null : p)) });
      return;
    }
    setPreview(apply(drag, at.value, preview ?? answer));
  };

  const onUp = () => {
    if (!drag || drag.kind === "chip") return;
    const result = preview ?? answer;
    if (drag.kind === "point" && result.points[drag.i] === null) {
      setDrag(null);
      setPreview(null);
      commit(result, t.removed(pointLabel(drag.i)), `chip-${drag.i}`);
      return;
    }
    finish(drag, result);
  };

  // --- the points still in the tray: drag them onto the line, choose them, or Enter

  const chipDown = (e: PointerEvent, i: number) => {
    if (readOnly || e.button > 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ kind: "chip", i, moved: false, x: e.clientX, y: e.clientY });
  };
  const chipMove = (e: PointerEvent) => {
    if (drag?.kind !== "chip") return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4;
    if (moved !== drag.moved) setDrag({ ...drag, moved });
    const r = svgRef.current?.getBoundingClientRect();
    const inside = r && e.clientX > r.left - 20 && e.clientX < r.right + 20 && e.clientY > r.top - 20 && e.clientY < r.bottom + 20;
    const at = inside ? valueAt(e.clientX, e.clientY) : null;
    setPreview(at ? apply(drag, at.value, answer) : null);
  };
  const chipUp = (i: number) => {
    if (drag?.kind !== "chip") return;
    if (drag.moved && preview && preview.points[i] !== null) {
      finish(drag, preview);
      focusNext.current = `point-${i}`;
      return;
    }
    setDrag(null);
    setPreview(null);
    if (!drag.moved) {
      const next = selected === i ? null : i;
      setSelected(next);
      say(next === null ? "" : t.chosen(pointLabel(i)));
    }
  };
  const placeAtMiddle = (i: number) => {
    if (readOnly) return;
    const v = middle(line, step);
    setSelected(null);
    commit({ ...answer, points: answer.points.map((p, j) => (j === i ? v : p)) }, t.placed(pointLabel(i), fmt(v)), `point-${i}`);
  };

  // --- the keyboard: every handle is a slider

  type Handle = { kind: "point"; i: number } | { kind: "from" | "to" } | { kind: "start" } | { kind: "landing"; i: number };
  const valueOf = (h: Handle, a: Answer): number | null =>
    h.kind === "point" ? a.points[h.i] : h.kind === "from" ? a.interval?.from ?? null : h.kind === "to" ? a.interval?.to ?? null
    : h.kind === "start" ? a.start : a.landings[(h as { i: number }).i] ?? null;

  const onKey = (h: Handle) => (e: KeyboardEvent) => {
    if (readOnly) return;
    const cur = valueOf(h, answer);
    if (cur === null) return;
    const up = horizontal ? ["ArrowRight", "ArrowUp"] : ["ArrowUp", "ArrowRight"];
    const down = horizontal ? ["ArrowLeft", "ArrowDown"] : ["ArrowDown", "ArrowLeft"];
    let next: number | null = null;
    if (up.includes(e.key)) next = cur + (e.shiftKey ? keys.coarse : keys.fine);
    else if (down.includes(e.key)) next = cur - (e.shiftKey ? keys.coarse : keys.fine);
    else if (e.key === "PageUp") next = cur + keys.coarse;
    else if (e.key === "PageDown") next = cur - keys.coarse;
    else if (e.key === "Home") next = line.min;
    else if (e.key === "End") next = line.max;
    else if ((e.key === "Delete" || e.key === "Backspace") && h.kind === "point") {
      e.preventDefault();
      commit({ ...answer, points: answer.points.map((p, j) => (j === h.i ? null : p)) }, t.removed(pointLabel(h.i)), `chip-${h.i}`);
      return;
    } else if ((e.key === "Delete" || e.key === "Backspace") && h.kind === "landing" && h.i === answer.landings.length - 1) {
      e.preventDefault();
      removeJump();
      return;
    } else if ((e.key === "Enter" || e.key === " ") && (h.kind === "from" || h.kind === "to") && answer.interval) {
      e.preventDefault();
      const key = h.kind === "from" ? "fromEnd" : "toEnd";
      const interval = { ...answer.interval, [key]: answer.interval[key] === "closed" ? "open" : "closed" } as Interval;
      commit({ ...answer, interval }, intervalMessage(interval));
      return;
    }
    if (next === null) return;
    e.preventDefault();
    const v = snapTo(next, line, step);
    if (v === cur) return;
    if (h.kind === "from" || h.kind === "to") {
      // an end does not pass the other end
      const i = answer.interval as Interval;
      const bounded = h.kind === "from" ? Math.min(v, i.to) : Math.max(v, i.from);
      const interval = { ...i, [h.kind]: bounded };
      commit({ ...answer, interval }, intervalMessage(interval));
      return;
    }
    const d = { ...h, moved: true, x: 0, y: 0 } as Drag;
    const result = apply(d, v, answer);
    if (h.kind === "point") commit(result, t.placed(pointLabel(h.i), fmt(v)));
    else if (h.kind === "start") commit(result, t.startAt(fmt(v)));
    else commit(result, jumpMessage(result, (h as { i: number }).i));
  };

  const slider = (h: Handle, name: string, value: number, valueText: string, focusId: string): any => ({
    role: "slider",
    tabindex: 0, // lower case: an SVG attribute
    class: "nl-handle",
    "data-focus": focusId,
    "aria-label": name,
    "aria-valuemin": line.min,
    "aria-valuemax": line.max,
    "aria-valuenow": value,
    "aria-valuetext": valueText,
    "aria-orientation": horizontal ? "horizontal" : "vertical",
    "aria-readonly": readOnly ? "true" : undefined,
    onKeyDown: onKey(h),
  });

  // --- the interval's and the jumps' buttons

  const setEnd = (which: "fromEnd" | "toEnd", kind: EndKind) => {
    if (!answer.interval || readOnly) return;
    let interval = { ...answer.interval, [which]: kind } as Interval;
    if (answer.interval[which] === "none" && kind !== "none") interval = { ...interval, [which === "fromEnd" ? "from" : "to"]: which === "fromEnd" ? line.min : line.max };
    interval = normalizeInterval(interval, line);
    commit({ ...answer, interval }, intervalMessage(interval));
  };
  const markInterval = () => {
    const third = (line.max - line.min) / 3;
    const interval: Interval = { from: snapTo(line.min + third, line, step), to: snapTo(line.max - third, line, step), fromEnd: "closed", toEnd: "closed" };
    commit({ ...answer, interval }, intervalMessage(interval), "from");
  };
  const placeStart = () => {
    const v = middle(line, step);
    commit({ ...answer, start: v }, t.startAt(fmt(v)), "start");
  };
  const addJump = () => {
    const route = positionsOf(task, answer);
    const last = route[route.length - 1];
    if (last === undefined) return;
    if (answer.landings.length >= MAX_JUMPS) return say(t.noMoreJumps);
    let v = snapTo(last + keys.fine, line, step);
    if (v === last) v = snapTo(last - keys.fine, line, step);
    const next = { ...answer, landings: [...answer.landings, v] };
    commit(next, jumpMessage(next, answer.landings.length), `landing-${answer.landings.length}`);
  };
  const removeJump = () => {
    const n = answer.landings.length;
    if (!n) return;
    commit({ ...answer, landings: answer.landings.slice(0, -1) }, t.jumpRemoved(n), n > 1 ? `landing-${n - 2}` : "add-jump");
  };

  // --- drawing

  const tickEls: JSX.Element[] = [];
  const labelEls: JSX.Element[] = [];
  const boxes: { value: number; index: number; x: number; y: number }[] = [];
  const tickBoxes = mode === "read" ? task.read.map((r, i) => ({ r, i })).filter(({ r }) => r.kind === "tick") : [];
  for (const tick of allTicks) {
    const a = alongOf(tick.value);
    const size = tick.labelled ? 8 : 4.5;
    const [x1, y1] = pt(a, size), [x2, y2] = pt(a, -size);
    tickEls.push(<line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} stroke-width={tick.labelled ? 1.6 : 1} />);
    const [lx, ly] = horizontal ? pt(a, -28) : pt(a, -16);
    const box = tickBoxes.find(({ r }) => Math.abs(r.value - tick.value) < 1e-7);
    if (box) {
      boxes.push({ value: tick.value, index: box.i, x: lx, y: ly });
      continue;
    }
    if (!tick.labelled) continue;
    if (view.onToggleHidden) {
      labelEls.push(
        <NumLabel value={tick.value} x={lx} y={ly} anchor={horizontal ? "middle" : "start"} view={view} fill={tick.hidden ? "#94a3b8" : INK}
          extra={{
            role: "button", tabindex: 0, class: `nl-toggle${tick.hidden ? " nl-hidden" : ""}`, "aria-pressed": tick.hidden ? "true" : "false",
            "aria-label": fmt(tick.value), "data-testid": `label-${tick.value}`,
            onClick: () => view.onToggleHidden!(tick.value),
            onKeyDown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); view.onToggleHidden!(tick.value); } },
          } as any} />
      );
    } else if (!tick.hidden) {
      labelEls.push(<NumLabel value={tick.value} x={lx} y={ly} anchor={horizontal ? "middle" : "start"} view={view} extra={{ "aria-hidden": "true" } as any} />);
    }
  }
  // the line, with arrows: it runs on
  const [ax1, ay1] = pt(-16), [ax2, ay2] = pt(L + 16);
  const axis = (
    <g aria-hidden="true">
      <line x1={ax1} y1={ay1} x2={ax2} y2={ay2} stroke={INK} stroke-width={1.6} />
      {arrowHead(pt(L + 22), pt(L + 10), 10, INK)}
      {arrowHead(pt(-22), pt(-10), 10, INK)}
    </g>
  );
  const [hx, hy] = horizontal ? pt(-8, 22) : pt(L + 8, 22); // from 22 px above to 14 px below the line, clear of the numbers
  const hit = !readOnly && mode !== "read" && (
    <rect x={hx} y={hy} width={horizontal ? L + 16 : 36} height={horizontal ? 36 : L + 16} fill="transparent" class="nl-hit"
      data-testid="line-hit" onPointerDown={onLineDown} />
  );

  // a point: a dot on the line, a stem and a tag with its label (and its value, when shown)
  const marker = (i: number, value: number, label: string, h: Handle | null, focusId: string, color = colorOf(i)) => {
    const a = alongOf(value);
    const lift = 30 + 22 * (i % 3);
    const text = view.showValues && h ? `${label} = ${fmt(value)}` : label;
    const w = 14 + text.length * 7.4, hgt = 20;
    const [dx, dy] = pt(a, 0), [sx, sy] = pt(a, lift - hgt / 2);
    const [tx, ty] = pt(a, lift);
    const rectX = horizontal ? tx - w / 2 : tx - w + 4, rectY = ty - hgt / 2;
    const textX = horizontal ? tx : tx - w / 2 + 4;
    const body = (
      <>
        <line x1={dx} y1={dy} x2={sx} y2={sy} stroke={color} stroke-width={2} />
        <rect class="nl-ring" x={rectX - 4} y={rectY - 4} width={w + 8} height={hgt + 8} rx={8} fill="none" stroke="#f59e0b" stroke-width={3} />
        <rect x={rectX} y={rectY} width={w} height={hgt} rx={6} fill={color} />
        <text x={textX} y={ty} text-anchor="middle" dominant-baseline="central" font-size={12.5} font-weight={700} fill="#fff">{text}</text>
        <circle cx={dx} cy={dy} r={6} fill={color} stroke="#fff" stroke-width={2} />
        <circle cx={dx} cy={dy} r={16} fill="transparent" />
      </>
    );
    if (!h) return <g aria-hidden="true" data-testid={`given-${i}`}>{body}</g>;
    return (
      <g {...slider(h, t.pointName(label), value, `${label}: ${fmt(value)}`, focusId)} data-testid={`point-${i}`} data-value={value}
        onPointerDown={(e: PointerEvent) => startDrag(e, { kind: "point", i, moved: false, x: e.clientX, y: e.clientY }, answer)}>
        {body}
      </g>
    );
  };

  const modeEls: JSX.Element[] = [];
  if (mode === "points") {
    shown.points.forEach((v, i) => {
      if (v !== null && v !== undefined) modeEls.push(marker(i, v, pointLabel(i), { kind: "point", i }, `point-${i}`));
    });
  } else if (mode === "read") {
    task.read.forEach((r, i) => {
      if (r.kind === "point") modeEls.push(marker(i, r.value, r.label || String(i + 1), null, ""));
      else {
        const [x1, y1] = pt(alongOf(r.value), 12), [x2, y2] = pt(alongOf(r.value), -12);
        modeEls.push(<line x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} stroke-width={2.4} aria-hidden="true" />);
      }
    });
  } else if (mode === "interval" && shown.interval) {
    const i = shown.interval;
    const lo = i.fromEnd === "none" ? -14 : alongOf(i.from);
    const hi = i.toEnd === "none" ? L + 14 : alongOf(i.to);
    const [bx1, by1] = pt(Math.min(lo, hi)), [bx2, by2] = pt(Math.max(lo, hi));
    modeEls.push(
      <g aria-hidden="true">
        <line x1={bx1} y1={by1} x2={bx2} y2={by2} stroke={ADD} stroke-width={7} stroke-linecap="butt" opacity={0.9} data-testid="band" />
        {i.fromEnd === "none" && arrowHead(pt(-26), pt(-12), 15, ADD)}
        {i.toEnd === "none" && arrowHead(pt(L + 26), pt(L + 12), 15, ADD)}
      </g>
    );
    const end = (which: "from" | "to") => {
      const kind = which === "from" ? i.fromEnd : i.toEnd;
      if (kind === "none") return null;
      const value = which === "from" ? i.from : i.to;
      const [cx, cy] = pt(alongOf(value));
      const name = t.endName(which === "from" ? (horizontal ? t.fromEnd : t.lowEnd) : horizontal ? t.toEnd : t.highEnd);
      const kindText = kind === "closed" ? t.closed : t.open;
      return (
        <g {...slider({ kind: which }, name, value, `${fmt(value)}, ${kindText}`, which)} data-testid={`end-${which}`} data-kind={kind}
          onPointerDown={(e: PointerEvent) => startDrag(e, { kind: which, moved: false, x: e.clientX, y: e.clientY }, answer)}>
          <circle class="nl-ring" cx={cx} cy={cy} r={13} fill="none" stroke="#f59e0b" stroke-width={3} />
          <circle cx={cx} cy={cy} r={18} fill="transparent" />
          <circle cx={cx} cy={cy} r={7.5} fill={kind === "closed" ? ADD : "#fff"} stroke={ADD} stroke-width={3} />
        </g>
      );
    };
    modeEls.push(<>{end("from")}{end("to")}</>);
  } else if (mode === "jumps") {
    const route = positionsOf(task, shown);
    for (let k = 1; k < route.length; k++) {
      const a = alongOf(route[k - 1]), b = alongOf(route[k]);
      if (Math.abs(b - a) < 0.5) continue;
      const peak = Math.min(Math.max(Math.abs(b - a) * 0.42, 26), 84) + (k % 2) * 8;
      const p0 = pt(a, 5), c = pt((a + b) / 2, peak * 2), p1 = pt(b, 5);
      const minus = route[k] < route[k - 1];
      const color = minus ? SUBTRACT : ADD;
      const [lx, ly] = pt((a + b) / 2, peak + 12);
      const label = jumpText(route[k - 1], route[k], line.format, view.language);
      modeEls.push(
        <g aria-hidden="true" data-testid={`arc-${k}`}>
          <path d={`M${p0[0]},${p0[1]} Q${c[0]},${c[1]} ${p1[0]},${p1[1]}`} fill="none" stroke={color} stroke-width={2.4} stroke-dasharray={minus ? "6 4" : undefined} />
          {arrowHead(p1, [(c[0] + p1[0]) / 2, (c[1] + p1[1]) / 2], 10, color)}
          <text x={lx} y={ly} text-anchor="middle" dominant-baseline="central" font-size={13} font-weight={700} fill={color}
            stroke="#fff" stroke-width={4} paint-order="stroke">{label}</text>
        </g>
      );
    }
    if (route.length) {
      const [sx, sy] = pt(alongOf(route[0]));
      const [tx, ty] = pt(alongOf(route[0]), horizontal ? -46 : -54);
      const startDot = (
        <>
          <circle class="nl-ring" cx={sx} cy={sy} r={12} fill="none" stroke="#f59e0b" stroke-width={3} />
          <circle cx={sx} cy={sy} r={16} fill="transparent" />
          <rect x={sx - 5.5} y={sy - 5.5} width={11} height={11} fill={INK} transform={`rotate(45 ${sx} ${sy})`} />
        </>
      );
      modeEls.push(
        <text x={tx} y={ty} text-anchor={horizontal ? "middle" : "start"} dominant-baseline="central" font-size={11} fill="#475569" aria-hidden="true">{t.start}</text>
      );
      if (task.jumps.givenStart) modeEls.push(<g aria-hidden="true" data-testid="start">{startDot}</g>);
      else
        modeEls.push(
          <g {...slider({ kind: "start" }, t.start, route[0], fmt(route[0]), "start")} data-testid="start"
            onPointerDown={(e: PointerEvent) => startDrag(e, { kind: "start", moved: false, x: e.clientX, y: e.clientY }, answer)}>
            {startDot}
          </g>
        );
    }
    shown.landings.forEach((v, k) => {
      const [cx, cy] = pt(alongOf(v));
      const minus = v < (route[k] ?? v);
      modeEls.push(
        <g {...slider({ kind: "landing", i: k }, t.jumpName(k + 1), v, `${fmt(v)} (${jumpText(route[k], v, line.format, view.language)})`, `landing-${k}`)}
          data-testid={`landing-${k}`} onPointerDown={(e: PointerEvent) => startDrag(e, { kind: "landing", i: k, moved: false, x: e.clientX, y: e.clientY }, answer)}>
          <circle class="nl-ring" cx={cx} cy={cy} r={12} fill="none" stroke="#f59e0b" stroke-width={3} />
          <circle cx={cx} cy={cy} r={16} fill="transparent" />
          <circle cx={cx} cy={cy} r={6} fill="#fff" stroke={minus ? SUBTRACT : ADD} stroke-width={3} />
        </g>
      );
    });
  }

  // --- the HTML around the drawing

  const button =
    "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500";
  const anything =
    mode === "points" ? answer.points.some((p) => p !== null) : mode === "interval" ? !!answer.interval
    : mode === "jumps" ? answer.landings.length > 0 || answer.start !== null : answer.read.some((r) => r !== "");
  const clearAll = () => {
    setSelected(null);
    commit({ points: answer.points.map(() => null), interval: null, start: null, landings: [], read: answer.read.map(() => "") }, t.cleared);
  };
  const setRead = (i: number, value: string) => onChange({ ...answer, read: answer.read.map((r, j) => (j === i ? value : r)) }, "");
  const allowed = /^[0-9.,\-−+/ ¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]*$/;
  const readInput = (i: number, name: string, extra: string, style?: Record<string, string>) => {
    const value = answer.read[i] ?? "";
    const invalid = value.trim() !== "" && parseNumber(value) === null;
    return (
      <input type="text" inputMode="text" autoComplete="off" spellcheck={false} value={value} readOnly={readOnly} aria-label={name}
        aria-invalid={invalid ? "true" : undefined} data-testid={`read-${i}`} style={style}
        class={`${extra} rounded-md border bg-white px-1.5 text-center text-sm tabular-nums text-slate-900 shadow-sm focus-visible:outline-2 focus-visible:outline-amber-500 ${invalid ? "border-2 border-red-700" : "border-slate-400"}`}
        onBeforeInput={(e: InputEvent) => { if (e.data && !allowed.test(e.data)) e.preventDefault(); }}
        onInput={(e) => setRead(i, (e.target as HTMLInputElement).value)} />
    );
  };
  const readInvalid = mode === "read" && answer.read.some((r) => r.trim() !== "" && parseNumber(r) === null);

  const unplaced = mode === "points" ? task.points.map((p, i) => ({ p, i })).filter(({ i }) => answer.points[i] === null || answer.points[i] === undefined) : []; // not the preview: a chip being dragged stays
  const route = positionsOf(task, answer);
  const hasStart = route.length > 0;
  const lowName = horizontal ? t.fromEnd : t.lowEnd;
  const highName = horizontal ? t.toEnd : t.highEnd;
  const endChoice = (which: "fromEnd" | "toEnd", legend: string) => (
    <fieldset class="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 px-3 py-1.5" data-testid={`choice-${which}`}>
      <legend class="px-1 text-xs font-semibold text-slate-500">{legend}</legend>
      {(["closed", "open", "none"] as EndKind[]).map((kind) => (
        <label class="flex items-center gap-1.5 text-sm">
          <input type="radio" name={`nl-${uid}-${which}`} checked={answer.interval?.[which] === kind} disabled={readOnly || !answer.interval}
            onChange={() => setEnd(which, kind)} class="accent-sky-700" />
          {t[kind]}
        </label>
      ))}
    </fieldset>
  );

  return (
    <div ref={rootRef} class="flex max-w-full flex-col gap-2">
      {mode === "points" && !readOnly && (
        <div class="flex flex-wrap items-center gap-2" role="group" aria-label={t.tray} data-testid="tray">
          {unplaced.map(({ p, i }) => (
            <button type="button" class={`nl-chip flex items-center gap-1.5 rounded-full border-2 bg-white py-1 pl-1.5 pr-3 text-sm font-semibold shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ${selected === i ? "ring-2 ring-amber-400" : ""}`}
              style={{ borderColor: colorOf(i), color: colorOf(i), touchAction: "none" }} aria-pressed={selected === i ? "true" : "false"}
              aria-label={`${t.pointName(p.label || String(i + 1))}, ${t.notPlaced}`} data-focus={`chip-${i}`} data-testid={`chip-${i}`}
              onPointerDown={(e) => chipDown(e as unknown as PointerEvent, i)} onPointerMove={(e) => chipMove(e as unknown as PointerEvent)}
              onPointerUp={() => chipUp(i)} onPointerCancel={() => { setDrag(null); setPreview(null); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); placeAtMiddle(i); } }}
              onClick={(e) => { if ((e as MouseEvent).detail === 0) placeAtMiddle(i); }}>
              <span class="flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs text-white" style={{ background: colorOf(i) }}>{p.label || i + 1}</span>
              {t.pointName(p.label || String(i + 1))}
            </button>
          ))}
          <span class="text-xs text-slate-500">{unplaced.length ? t.trayHint : t.allPlaced}</span>
        </div>
      )}

      <div class="relative max-w-full" style={{ width: `${width}px` }}>
        <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="group" aria-label={view.label}
          class="block h-auto max-w-full touch-none select-none overflow-visible font-sans" data-testid="line"
          onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { setDrag(null); setPreview(null); }}>
          {axis}
          {tickEls}
          {labelEls}
          {hit}
          {modeEls}
        </svg>
        {boxes.map((b, k) =>
          readInput(b.index, t.tickBox(k + 1), "absolute h-7 w-16", {
            left: `${(b.x / width) * 100}%`, top: `${(b.y / height) * 100}%`, transform: horizontal ? "translate(-50%, -50%)" : "translate(0, -50%)",
          })
        )}
      </div>

      {mode === "read" && task.read.some((r) => r.kind === "point") && (
        <div class="flex flex-wrap gap-3">
          {task.read.map((r, i) =>
            r.kind === "point" ? (
              <label class="flex items-center gap-1.5 text-sm font-semibold" style={{ color: colorOf(i) }}>
                <span class="flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-xs text-white" style={{ background: colorOf(i) }}>{r.label || i + 1}</span>
                =
                {readInput(i, t.valueOf(r.label || String(i + 1)), "h-8 w-20")}
              </label>
            ) : null
          )}
        </div>
      )}
      {readInvalid && <p class="m-0 text-sm text-red-800" data-testid="invalid">⚠ {t.notANumber}</p>}

      {mode === "interval" && !readOnly && (
        <div class="flex flex-wrap items-center gap-2">
          {answer.interval ? (
            <>
              {endChoice("fromEnd", lowName)}
              {endChoice("toEnd", highName)}
              <button type="button" class={button} onClick={() => commit({ ...answer, interval: null }, t.intervalRemoved, "mark")}>{t.removeInterval}</button>
            </>
          ) : (
            <>
              <button type="button" class={button} data-focus="mark" onClick={markInterval}>{t.mark}</button>
              <span class="text-xs text-slate-500">{t.markHint}</span>
            </>
          )}
        </div>
      )}
      {mode === "interval" && view.showValues && answer.interval && (
        <p class="m-0 text-base font-semibold text-sky-900" data-testid="inequality">{inequality(answer.interval, line.format, view.language) ?? t.allNumbers}</p>
      )}

      {mode === "jumps" && !readOnly && (
        <div class="flex flex-wrap items-center gap-2">
          {!hasStart && <button type="button" class={button} onClick={placeStart}>{t.placeStart}</button>}
          {hasStart && <button type="button" class={button} data-focus="add-jump" disabled={answer.landings.length >= MAX_JUMPS} onClick={addJump}>+ {t.addJump}</button>}
          {hasStart && <button type="button" class={button} disabled={!answer.landings.length} onClick={removeJump}>{t.removeJump}</button>}
          <span class="text-xs text-slate-500">{t.jumpsHint}</span>
        </div>
      )}
      {mode === "jumps" && view.showValues && route.length > 1 && (
        <p class="m-0 text-base font-semibold tabular-nums text-slate-800" data-testid="sum">{sumText(route, line.format, view.language)}</p>
      )}

      <div class="flex flex-wrap items-center gap-3">
        {!readOnly && <button type="button" class={button} disabled={!anything} onClick={clearAll}>{t.clear}</button>}
        {!readOnly && mode !== "read" && (
          <details class="text-sm text-slate-600">
            <summary class="cursor-pointer select-none rounded focus-visible:outline-2 focus-visible:outline-amber-500">{t.help}</summary>
            <p class="m-0 mt-1 max-w-[70ch] text-xs">{t.helpText}</p>
          </details>
        )}
        <p role="status" aria-live="polite" class="m-0 min-h-5 text-sm text-slate-600" data-testid="status">{readOnly ? t.readOnly : status}</p>
      </div>
    </div>
  );
};

