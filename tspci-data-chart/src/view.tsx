import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { ChartData, ChartType, Layout, LegendPosition, Orientation, ShowValues, dataDecimals, findSegment, segmentId } from "./chart";
import { arcPath, extent, formatNumber, linear, niceAxis, polar, slices, stack, stepDecimals, textOn, textWidth, withUnit } from "./scale";
import { Texts } from "./texts";

// The chart itself, for the candidate (interaction.tsx) and as the author's preview (authoring.tsx): hand-made SVG.
// Every part of a bar (a slice, a point) is a mark: the mouse, a tap or the keyboard (one tab stop, arrow keys between
// the marks) shows its numbers in a tooltip, and in select mode a click or Enter chooses it.

export type ChartSettings = {
  title: string;
  chartType: ChartType;
  orientation: Orientation;
  layout: Layout;
  showValues: ShowValues;
  unit: string;
  valueAxisLabel: string;
  categoryAxisLabel: string;
  min: number | null;
  max: number | null;
  gridlines: boolean;
  legend: LegendPosition;
  source: string;
  width: number;
  language: string;
};

type Shape =
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "path"; d: string; cx: number; cy: number; r: number; start: number; end: number }
  | { kind: "circle"; cx: number; cy: number; r: number };
type Mark = {
  id: string;
  ci: number;
  si: number;
  value: number;
  /** The share of the category's total, in %, in a 100% stack or a pie. */
  share: number | null;
  color: string;
  shape: Shape;
  /** The middle, for the arrow keys and the tooltip. */
  center: { x: number; y: number };
  /** The top of the mark, where the tooltip points. */
  top: number;
  bottom: number;
  label?: { x: number; y: number; anchor: "start" | "middle" | "end"; fill: string; text: string };
  grow: string;
};
type Line = { x1: number; y1: number; x2: number; y2: number };
type Text = { x: number; y: number; text: string | string[]; anchor?: "start" | "middle" | "end"; rotate?: boolean; className?: string; baseline?: "middle" | "hanging" | "auto" };
type Geometry = { width: number; height: number; marks: Mark[]; grid: Line[]; axes: Line[]; texts: Text[]; lines: { d: string; color: string }[] };

const FONT = 13;
const TICK = 12;
const LINE = 15;

/** A label in at most `lines` lines of at most `width` px; what does not fit ends in "…". */
export const wrap = (text: string, width: number, lines = 2, size = FONT): string[] => {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (textWidth(next, size) <= width || !current) current = next;
    else {
      out.push(current);
      current = word;
    }
  }
  if (current) out.push(current);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] += "…";
  }
  return out.map((l) => {
    if (textWidth(l, size) <= width) return l;
    let s = l;
    while (s.length > 1 && textWidth(`${s}…`, size) > width) s = s.slice(0, -1);
    return `${s.replace(/…$/, "")}…`;
  });
};

/** Lays out the chart: where every mark, gridline and text goes, in SVG units. */
export const layout = (data: ChartData, s: ChartSettings): Geometry => {
  const W = Math.max(280, Math.min(1600, s.width || 640));
  const decimals = dataDecimals(data);
  const valueText = (v: number) => withUnit(formatNumber(v, s.language, decimals), s.unit);
  const percent = s.chartType === "bar" && s.layout === "percent";
  const stacked = s.chartType === "bar" && s.layout !== "grouped";
  const rows = data.categories.map((c) => c.values);
  const marks: Mark[] = [];
  const grid: Line[] = [];
  const axes: Line[] = [];
  const texts: Text[] = [];
  const lines: { d: string; color: string }[] = [];
  const always = s.showValues === "always";
  const shareText = (p: number) => `${formatNumber(p, s.language, p < 10 && p % 1 ? 1 : 0)}%`;
  /** What a label in the chart says: the share in a 100% stack (unless the values are percentages already). */
  const labelText = (v: number, share: number | null) => (share !== null && s.unit.trim() !== "%" ? shareText(share) : valueText(v));

  if (s.chartType === "pie") {
    const n = data.categories.length;
    const columns = Math.max(1, Math.min(n, Math.floor(W / 150)));
    const cell = W / columns;
    const r = Math.min(88, cell / 2 - 14);
    const inner = r * 0.52;
    const rowHeight = 2 * r + 16 + LINE * 2 + 8;
    data.categories.forEach((c, ci) => {
      const cx = cell * (ci % columns) + cell / 2;
      const top = Math.floor(ci / columns) * rowHeight + 8;
      const cy = top + r;
      const sl = slices(c.values);
      sl.forEach((slice, si) => {
        const v = c.values[si];
        if (v === null || v === undefined || slice.share === 0) return;
        const mid = (slice.start + slice.end) / 2;
        const at = polar(cx, cy, (r + inner) / 2, mid);
        const color = data.series[si].color;
        const share = slice.share * 100;
        const text = labelText(v, share);
        marks.push({
          id: segmentId(c, data.series[si]), ci, si, value: v, share, color,
          shape: { kind: "path", d: arcPath(cx, cy, r, inner, slice.start, slice.end), cx, cy, r, start: slice.start, end: slice.end },
          center: at, top: polar(cx, cy, r, mid).y - 2, bottom: polar(cx, cy, r, mid).y + 2,
          label: always && slice.end - slice.start > 0.42 && textWidth(text, TICK) < r - inner + 18
            ? { x: at.x, y: at.y, anchor: "middle", fill: textOn(color), text } : undefined,
          grow: "pie",
        });
      });
      texts.push({ x: cx, y: cy + r + 12, text: wrap(c.label, cell - 12), anchor: "middle", baseline: "hanging", className: "dc-label" });
    });
    const height = Math.ceil(n / columns) * rowHeight + 4;
    return { width: W, height, marks, grid, axes, texts, lines };
  }

  const ext = extent(rows, stacked, s.chartType === "bar");
  const axis = percent ? niceAxis(0, 100, 0, 100) : niceAxis(ext.lo, ext.hi, s.min, s.max);
  const tickDecimals = Math.max(stepDecimals(axis.step), 0);
  const tickText = (t: number) => {
    const text = formatNumber(t, s.language, tickDecimals);
    if (percent) return `${text}%`;
    const u = s.unit.trim();
    return ["%", "€", "$", "£", "‰"].includes(u) ? withUnit(text, u) : text;
  };
  const horizontal = s.chartType === "bar" && s.orientation === "horizontal";
  const nCat = data.categories.length;
  const nSer = data.series.length;
  const grouped = s.chartType === "bar" && !stacked;

  if (horizontal) {
    const band = stacked ? 40 : Math.max(26, nSer * 15 + 12);
    const thickness = stacked ? 26 : band - 12;
    const labelWidth = Math.min(W * 0.32, Math.max(40, ...data.categories.map((c) => textWidth(c.label, FONT))) + 4);
    const left = labelWidth + 14;
    const valueRoom = always && grouped ? Math.max(...marksValues(data).map((v) => textWidth(valueText(v), TICK))) + 10 : 0;
    const right = 14 + valueRoom;
    const top = s.categoryAxisLabel ? 28 : 10;
    const plotH = band * nCat;
    const bottom = 26 + (s.valueAxisLabel ? 22 : 0);
    const height = top + plotH + bottom;
    const x = linear(axis.min, axis.max, left, W - right);
    const clamp = (v: number) => Math.max(left, Math.min(W - right, x(v)));
    for (const t of axis.ticks) {
      const tx = x(t);
      if (s.gridlines) grid.push({ x1: tx, y1: top, x2: tx, y2: top + plotH });
      texts.push({ x: tx, y: top + plotH + 8, text: tickText(t), anchor: "middle", baseline: "hanging", className: "dc-tick" });
    }
    axes.push({ x1: clamp(0), y1: top, x2: clamp(0), y2: top + plotH });
    if (s.categoryAxisLabel) texts.push({ x: 0, y: 6, text: s.categoryAxisLabel, anchor: "start", baseline: "hanging", className: "dc-axis" });
    if (s.valueAxisLabel) texts.push({ x: (left + W - right) / 2, y: top + plotH + 30, text: s.valueAxisLabel, anchor: "middle", baseline: "hanging", className: "dc-axis" });
    data.categories.forEach((c, ci) => {
      const y0 = top + ci * band + (band - thickness) / 2;
      const ls = wrap(c.label, labelWidth, 2);
      texts.push({ x: left - 10, y: top + ci * band + band / 2 - ((ls.length - 1) * LINE) / 2, text: ls, anchor: "end", baseline: "middle", className: "dc-label" });
      const st = stack(c.values, percent);
      data.series.forEach((ser, si) => {
        const v = c.values[si];
        if (v === null || v === undefined) return;
        let a: number;
        let b: number;
        let y: number;
        let h: number;
        if (stacked) {
          [a, b] = [clamp(st[si].start), clamp(st[si].end)];
          y = y0;
          h = thickness;
        } else {
          [a, b] = [clamp(0), clamp(v)];
          h = (thickness / nSer) - 2;
          y = y0 + si * (thickness / nSer) + 1;
        }
        const x1 = Math.min(a, b);
        const w = Math.abs(b - a);
        const share = percent ? Math.abs(st[si].end - st[si].start) : null;
        const text = labelText(v, share);
        let label: Mark["label"];
        if (always) {
          if (stacked) {
            if (textWidth(text, TICK) < w - 6) label = { x: x1 + w / 2, y: y + h / 2, anchor: "middle", fill: textOn(ser.color), text };
          } else {
            label = v >= 0 ? { x: x1 + w + 4, y: y + h / 2, anchor: "start", fill: "#334155", text } : { x: x1 - 4, y: y + h / 2, anchor: "end", fill: "#334155", text };
          }
        }
        marks.push({
          id: segmentId(c, ser), ci, si, value: v, share, color: ser.color,
          shape: { kind: "rect", x: x1, y, w: Math.max(w, 0.5), h },
          center: { x: x1 + w / 2, y: y + h / 2 }, top: y, bottom: y + h, label, grow: v < 0 ? "-x" : "x",
        });
      });
    });
    return { width: W, height, marks, grid, axes, texts, lines };
  }

  // vertical bars, and lines: the categories along the bottom
  const H = Math.round(Math.max(240, Math.min(420, W * 0.55)));
  const tickWidth = Math.max(...axis.ticks.map((t) => textWidth(tickText(t), TICK)));
  const left = tickWidth + 12 + (s.valueAxisLabel ? 22 : 0);
  const right = 16;
  const top = always ? 22 : 12;
  const bandGuess = (W - left - right) / nCat;
  const catLines = data.categories.map((c) => wrap(c.label, bandGuess - 6, 2));
  const labelLines = Math.max(1, ...catLines.map((l) => l.length));
  const bottom = 10 + labelLines * LINE + (s.categoryAxisLabel ? 24 : 4);
  const plotTop = top;
  const plotBottom = H - bottom;
  const y = linear(axis.min, axis.max, plotBottom, plotTop);
  const clamp = (v: number) => Math.max(plotTop, Math.min(plotBottom, y(v)));
  const band = (W - left - right) / nCat;
  for (const t of axis.ticks) {
    const ty = y(t);
    if (s.gridlines) grid.push({ x1: left, y1: ty, x2: W - right, y2: ty });
    texts.push({ x: left - 8, y: ty, text: tickText(t), anchor: "end", baseline: "middle", className: "dc-tick" });
  }
  const zero = s.chartType === "bar" ? clamp(0) : plotBottom;
  axes.push({ x1: left, y1: zero, x2: W - right, y2: zero });
  if (s.valueAxisLabel) texts.push({ x: 12, y: (plotTop + plotBottom) / 2, text: s.valueAxisLabel, anchor: "middle", rotate: true, className: "dc-axis" });
  if (s.categoryAxisLabel) texts.push({ x: (left + W - right) / 2, y: H - 18, text: s.categoryAxisLabel, anchor: "middle", baseline: "hanging", className: "dc-axis" });
  data.categories.forEach((c, ci) => {
    texts.push({ x: left + band * ci + band / 2, y: plotBottom + 8, text: catLines[ci], anchor: "middle", baseline: "hanging", className: "dc-label" });
  });

  if (s.chartType === "line") {
    data.series.forEach((ser, si) => {
      let d = "";
      let pen = false;
      data.categories.forEach((c, ci) => {
        const v = c.values[si];
        if (v === null || v === undefined) {
          pen = false;
          return;
        }
        const px = left + band * ci + band / 2;
        const py = clamp(v);
        d += `${pen ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`;
        pen = true;
        const text = valueText(v);
        marks.push({
          id: segmentId(c, ser), ci, si, value: v, share: null, color: ser.color,
          shape: { kind: "circle", cx: px, cy: py, r: 5 },
          center: { x: px, y: py }, top: py - 6, bottom: py + 6,
          label: always ? { x: px, y: py - 13, anchor: "middle", fill: "#334155", text } : undefined,
          grow: "point",
        });
      });
      if (d) lines.push({ d, color: ser.color });
    });
    return { width: W, height: H, marks, grid, axes, texts, lines };
  }

  const thickness = stacked ? Math.min(64, band * 0.62) : Math.min(nSer * 40, band * 0.78);
  // labels above grouped columns: with the unit when every one fits above its column, else without, else none
  const slot = thickness / nSer + 4;
  const fitsAbove = (f: (v: number) => string) => nSer === 1 || marksValues(data).every((v) => textWidth(f(v), TICK) <= slot);
  const aboveText = fitsAbove(valueText) ? valueText : fitsAbove((v) => formatNumber(v, s.language, decimals)) ? (v: number) => formatNumber(v, s.language, decimals) : null;
  data.categories.forEach((c, ci) => {
    const x0 = left + band * ci + (band - thickness) / 2;
    const st = stack(c.values, percent);
    data.series.forEach((ser, si) => {
      const v = c.values[si];
      if (v === null || v === undefined) return;
      let a: number;
      let b: number;
      let x: number;
      let w: number;
      if (stacked) {
        [a, b] = [clamp(st[si].start), clamp(st[si].end)];
        x = x0;
        w = thickness;
      } else {
        [a, b] = [clamp(0), clamp(v)];
        w = thickness / nSer - 2;
        x = x0 + si * (thickness / nSer) + 1;
      }
      const y1 = Math.min(a, b);
      const h = Math.abs(b - a);
      const share = percent ? Math.abs(st[si].end - st[si].start) : null;
      const text = labelText(v, share);
      let label: Mark["label"];
      if (always) {
        if (stacked) {
          if (h >= 16 && textWidth(text, TICK) < w - 4) label = { x: x + w / 2, y: y1 + h / 2, anchor: "middle", fill: textOn(ser.color), text };
        } else if (aboveText) {
          label = { x: x + w / 2, y: v >= 0 ? y1 - 8 : y1 + h + 9, anchor: "middle", fill: "#334155", text: aboveText(v) };
        }
      }
      marks.push({
        id: segmentId(c, ser), ci, si, value: v, share, color: ser.color,
        shape: { kind: "rect", x, y: y1, w, h: Math.max(h, 0.5) },
        center: { x: x + w / 2, y: y1 + h / 2 }, top: y1, bottom: y1 + h, label, grow: v < 0 ? "-y" : "y",
      });
    });
  });
  return { width: W, height: H, marks, grid, axes, texts, lines };
};

const marksValues = (data: ChartData) => data.categories.flatMap((c) => c.values).filter((v): v is number => v !== null && v !== undefined);

/**
 * The mark an arrow key goes to. Stacked bars: along a bar to the next or previous series, across the bars to the
 * neighbouring category, the part nearest on screen. Bars side by side and pies: the next or previous mark, in reading
 * order. Lines: left and right along the line, up and down to the nearest point that way.
 */
export const nextMark = (marks: Mark[], from: Mark, key: string, chartType: ChartType, horizontal = false, stacked = true): Mark | null => {
  const i = marks.indexOf(from);
  if (key === "Home") return marks[0];
  if (key === "End") return marks[marks.length - 1];
  const forward = horizontal ? ["ArrowRight", "ArrowDown"] : ["ArrowRight", "ArrowUp"];
  if (chartType === "pie" || (chartType === "bar" && !stacked)) {
    const by = forward.includes(key) || (chartType === "pie" && key === "ArrowDown") ? 1 : -1;
    return marks[i + by] ?? null;
  }
  if (chartType === "bar") {
    const alongBar = horizontal ? ["ArrowLeft", "ArrowRight"] : ["ArrowDown", "ArrowUp"];
    if (alongBar.includes(key)) {
      const by = forward.includes(key) ? 1 : -1;
      const same = marks.filter((m) => m.ci === from.ci && Math.sign(m.si - from.si) === by).sort((a, b) => by * (a.si - b.si));
      return same[0] ?? null;
    }
    const by = key === (horizontal ? "ArrowDown" : "ArrowRight") ? 1 : -1;
    const others = marks.filter((m) => Math.sign(m.ci - from.ci) === by);
    if (!others.length) return null;
    const ci = others.reduce((best, m) => (by * (m.ci - best) < 0 ? m.ci : best), others[0].ci);
    const axis = horizontal ? "x" : "y";
    return others.filter((m) => m.ci === ci).sort((a, b) => Math.abs(a.center[axis] - from.center[axis]) - Math.abs(b.center[axis] - from.center[axis]))[0];
  }
  if (chartType === "line" && (key === "ArrowLeft" || key === "ArrowRight")) {
    const by = key === "ArrowRight" ? 1 : -1;
    const same = marks.filter((m) => m.si === from.si && Math.sign(m.ci - from.ci) === by).sort((a, b) => by * (a.ci - b.ci));
    return same[0] ?? null;
  }
  const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[key];
  if (!dir) return null;
  let best: Mark | null = null;
  let cost = Infinity;
  for (const m of marks) {
    if (m === from) continue;
    const dx = m.center.x - from.center.x;
    const dy = m.center.y - from.center.y;
    const along = dx * dir[0] + dy * dir[1];
    if (along <= 0.5) continue;
    const across = Math.abs(dx * dir[1] - dy * dir[0]);
    // in a 45° cone first (the next part of the same bar), then anything that way
    const c = (across <= along ? 0 : 1e6) + along * 2 + across;
    if (c < cost) {
      cost = c;
      best = m;
    }
  }
  return best;
};

type Active = { id: string; by: "pointer" | "focus" | "touch" };

const Chart = ({ data, settings, texts, label, selected, selectable, single = true, onChoose, onView }: {
  data: ChartData;
  settings: ChartSettings;
  texts: Texts;
  /** The accessible name of the chart. */
  label: string;
  /** The chosen marks (the candidate's, or the correct ones in the author's preview). */
  selected: string[];
  /** A click or Enter chooses the mark. */
  selectable: boolean;
  /** One choice (radio buttons) or more (checkboxes). */
  single?: boolean;
  onChoose?: (id: string) => void;
  /** The candidate saw the numbers of a mark long enough to read them. */
  onView?: (id: string) => void;
}) => {
  // laid out for the room there is (up to the width the author set), so the texts keep their size on a small screen
  const [room, setRoom] = useState<number | null>(null);
  const figure = useRef<HTMLElement>();
  useLayoutEffect(() => {
    const el = figure.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setRoom(Math.floor(el.clientWidth) || null);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const width = Math.max(280, Math.min(settings.width || 640, room ?? Infinity));
  const g = useMemo(() => layout(data, { ...settings, width }), [data, settings, width]);
  const [active, setActive] = useState<Active | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const pointer = useRef<string>("mouse");
  const box = useRef<HTMLDivElement>();
  const svg = useRef<SVGSVGElement>();
  const tip = useRef<HTMLDivElement>();
  const refs = useRef<Record<string, SVGElement>>({});
  const decimals = dataDecimals(data);
  const s = settings;

  const tabStop = g.marks.find((m) => m.id === focusId) ?? g.marks.find((m) => selected.includes(m.id)) ?? g.marks[0];
  const activeMark = active ? g.marks.find((m) => m.id === active.id) : null;

  // a look counts once the numbers were there long enough to read
  useEffect(() => {
    if (!activeMark || !onView) return;
    const timer = window.setTimeout(() => onView(activeMark.id), 400);
    return () => window.clearTimeout(timer);
  }, [activeMark?.id]);

  // the tooltip above the mark, or below it near the top; inside the chart
  useLayoutEffect(() => {
    const el = tip.current;
    if (!el || !activeMark || !svg.current || !box.current) return;
    const scale = svg.current.getBoundingClientRect().width / g.width || 1;
    const offset = svg.current.getBoundingClientRect().top - box.current.getBoundingClientRect().top;
    const offsetX = svg.current.getBoundingClientRect().left - box.current.getBoundingClientRect().left;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const boxW = box.current.clientWidth;
    let x = offsetX + activeMark.center.x * scale - w / 2;
    x = Math.max(0, Math.min(boxW - w, x));
    let y = offset + activeMark.top * scale - h - 10;
    if (y < 0) y = offset + activeMark.bottom * scale + 10;
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  });

  // a tap elsewhere on the page hides the tooltip a tap showed
  useEffect(() => {
    if (active?.by !== "touch") return;
    const away = (e: PointerEvent) => {
      if (!e.composedPath().some((el) => (el as Element)?.hasAttribute?.("data-mark"))) setActive(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [active?.by]);

  const valueText = (v: number) => withUnit(formatNumber(v, s.language, decimals), s.unit);
  const hide = s.showValues === "never";
  const ariaLabel = (m: Mark) => {
    const seg = findSegment(data, m.id);
    let value: string | null = null;
    if (!hide) {
      value = valueText(m.value);
      if (m.share !== null && s.unit.trim() !== "%") value += ` (${texts.share(`${formatNumber(m.share, s.language, 1)}%`)})`;
    }
    return texts.segment(seg?.category.label ?? "", seg?.series.name ?? "", value);
  };

  const choose = (id: string) => {
    if (selectable && onChoose) onChoose(id);
  };
  const moveTo = (m: Mark | null) => {
    if (!m) return;
    setFocusId(m.id);
    refs.current[m.id]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent, m: Mark) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(m.id);
      setActive({ id: m.id, by: "focus" });
      return;
    }
    if (e.key === "Escape") {
      setActive(null);
      return;
    }
    const next = nextMark(g.marks, m, e.key, s.chartType, s.orientation === "horizontal", s.layout !== "grouped");
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      moveTo(next);
    }
  };

  const role: "radio" | "checkbox" | "img" = selectable ? (single ? "radio" : "checkbox") : "img";

  const legend = s.legend !== "none" && (
    <ul className={`dc-legend m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[13px] text-slate-700 ${s.legend === "right" ? "flex-col" : ""}`} data-testid="legend">
      {data.series.map((ser) => (
        <li key={ser.id} className={`flex items-center gap-1.5 transition-opacity ${activeMark && activeMark.si !== data.series.indexOf(ser) ? "opacity-50" : ""}`}>
          <span className="inline-block size-3 shrink-0 rounded-[3px]" style={{ background: ser.color }} />
          <span>{ser.name}</span>
        </li>
      ))}
    </ul>
  );

  const ring = (m: Mark, pad: number, className: string) => {
    const sh = m.shape;
    if (sh.kind === "rect") return <rect className={className} x={sh.x - pad} y={sh.y - pad} width={sh.w + 2 * pad} height={sh.h + 2 * pad} rx={2 + pad / 2} />;
    if (sh.kind === "circle") return <circle className={className} cx={sh.cx} cy={sh.cy} r={sh.r + pad + 1} />;
    return <path className={className} d={sh.d} />;
  };
  /** The corner of a chosen mark gets a check. */
  const badge = (m: Mark) => {
    const sh = m.shape;
    const at = sh.kind === "rect" ? { x: sh.x + sh.w, y: sh.y } : sh.kind === "circle" ? { x: sh.cx + 7, y: sh.cy - 7 } : polar(sh.cx, sh.cy, sh.r, (sh.start + sh.end) / 2);
    return (
      <g key={`badge-${m.id}`} className="dc-badge" transform={`translate(${at.x} ${at.y})`} aria-hidden="true">
        <circle r="8" fill="#0f172a" stroke="#fff" stroke-width="1.5" />
        <path d="M-3.5 0.2l2.4 2.4 4.6-4.8" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </g>
    );
  };

  const seg = activeMark ? findSegment(data, activeMark.id) : null;
  const sourceText = s.source.trim()
    ? /^(source|bron)\b/i.test(s.source.trim()) ? s.source.trim() : `${texts.source}: ${s.source.trim()}`
    : "";

  return (
    <figure ref={figure} className="dc m-0 flex w-full flex-col gap-2" style={{ maxWidth: `${settings.width || 640}px` }}>
      {s.title && <figcaption className="text-[15px] font-semibold text-slate-900" data-testid="title">{s.title}</figcaption>}
      {s.legend === "top" && legend}
      <div className={`flex gap-4 ${s.legend === "right" ? "flex-row items-start" : "flex-col"}`}>
        <div ref={box} className="relative min-w-0 flex-1"
          onPointerLeave={() => setActive((a) => (a?.by === "pointer" ? null : a))}
          onPointerDown={(e) => {
            pointer.current = e.pointerType;
            if (!(e.target as Element).closest?.("[data-mark]")) setActive((a) => (a?.by === "focus" ? a : null));
          }}>
          <svg ref={svg} viewBox={`0 0 ${g.width} ${g.height}`} width="100%" className="block h-auto select-none overflow-visible"
            role={selectable && single ? "radiogroup" : "group"} aria-label={label}
            data-testid="chart" style={{ maxWidth: `${g.width}px` }}>
            <g className="dc-grid pointer-events-none" aria-hidden="true">
              {g.grid.map((l, i) => <line key={i} {...l} />)}
            </g>
            <g aria-hidden="true" className="pointer-events-none">
              {g.texts.map((t, i) => {
                const parts = Array.isArray(t.text) ? t.text : [t.text];
                return (
                  <text key={i} className={t.className} x={t.x} y={t.y} text-anchor={t.anchor ?? "start"}
                    dominant-baseline={t.baseline ?? "auto"} transform={t.rotate ? `rotate(-90 ${t.x} ${t.y})` : undefined}>
                    {parts.length === 1 ? parts[0] : parts.map((p, j) => <tspan key={j} x={t.x} dy={j === 0 ? 0 : LINE}>{p}</tspan>)}
                  </text>
                );
              })}
            </g>
            {g.lines.map((l, i) => <path key={`line-${i}`} className="dc-line" d={l.d} stroke={l.color} pathLength={1} aria-hidden="true" />)}
            <g className={`dc-marks ${activeMark ? "dc-dim" : ""}`}>
              {g.marks.map((m) => {
                const sh = m.shape;
                const isSelected = selected.includes(m.id);
                const common = {
                  ref: (el: SVGElement) => { if (el) refs.current[m.id] = el; else delete refs.current[m.id]; },
                  "data-mark": m.id,
                  "data-testid": `mark-${m.id}`,
                  className: `dc-mark dc-grow-${m.grow} ${activeMark?.id === m.id ? "dc-active" : ""} ${isSelected ? "dc-selected" : ""} ${selectable ? "cursor-pointer" : ""}`,
                  fill: m.color,
                  tabindex: m === tabStop ? 0 : -1,
                  role,
                  "aria-label": ariaLabel(m),
                  "aria-checked": selectable ? isSelected : undefined,
                  onPointerEnter: (e: PointerEvent) => { if (e.pointerType !== "touch") setActive({ id: m.id, by: "pointer" }); },
                  onPointerDown: (e: PointerEvent) => { pointer.current = e.pointerType; e.preventDefault(); },
                  onClick: () => {
                    setFocusId(m.id);
                    if (pointer.current === "touch" && active?.id !== m.id) {
                      setActive({ id: m.id, by: "touch" });
                      return;
                    }
                    if (pointer.current === "touch") setActive({ id: m.id, by: "touch" });
                    choose(m.id);
                  },
                  onFocus: () => { setFocusId(m.id); setFocused(m.id); setActive({ id: m.id, by: "focus" }); },
                  onBlur: () => { setFocused((f) => (f === m.id ? null : f)); setActive((a) => (a?.by === "focus" && a.id === m.id ? null : a)); },
                  onKeyDown: (e: KeyboardEvent) => onKeyDown(e, m),
                };
                if (sh.kind === "rect") return <rect key={m.id} {...common} x={sh.x} y={sh.y} width={sh.w} height={sh.h} rx={Math.min(3, sh.w / 2, sh.h / 2)} />;
                if (sh.kind === "circle") return <circle key={m.id} {...common} cx={sh.cx} cy={sh.cy} r={sh.r} stroke="#fff" stroke-width="2" />;
                return <path key={m.id} {...common} d={sh.d} stroke="#fff" stroke-width="1.5" style={{ transformOrigin: `${sh.cx}px ${sh.cy}px` }} />;
              })}
            </g>
            <g className="dc-axis-line pointer-events-none" aria-hidden="true">
              {g.axes.map((l, i) => <line key={i} {...l} />)}
            </g>
            <g aria-hidden="true" className="dc-values">
              {g.marks.filter((m) => m.label).map((m) => (
                <text key={`label-${m.id}`} x={m.label.x} y={m.label.y} text-anchor={m.label.anchor} dominant-baseline="middle" fill={m.label.fill}>{m.label.text}</text>
              ))}
            </g>
            <g aria-hidden="true" className="pointer-events-none">
              {g.marks.filter((m) => selected.includes(m.id)).map((m) => <g key={`sel-${m.id}`}>{ring(m, 1.5, "dc-ring-selected")}</g>)}
              {g.marks.filter((m) => selected.includes(m.id)).map(badge)}
              {focused && g.marks.filter((m) => m.id === focused).map((m) => <g key="focus">{ring(m, 4, "dc-ring-focus")}</g>)}
            </g>
          </svg>
          {activeMark && seg && (
            <div ref={tip} className="dc-tip pointer-events-none absolute top-0 left-0 z-10 min-w-36 max-w-64 rounded-lg bg-slate-900/95 px-3 py-2 text-[13px] leading-snug text-white shadow-lg"
              aria-hidden="true" data-testid="tooltip">
              <div className="font-semibold">{seg.category.label}</div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="inline-block size-2.5 shrink-0 rounded-sm ring-1 ring-white/60" style={{ background: seg.series.color }} />
                <span className="text-slate-200">{seg.series.name}</span>
                {!hide && <span className="ml-auto pl-3 font-semibold tabular-nums" data-testid="tooltip-value">{valueText(activeMark.value)}</span>}
              </div>
              {!hide && activeMark.share !== null && s.unit.trim() !== "%" && (
                <div className="mt-0.5 text-xs text-slate-300">{texts.share(`${formatNumber(activeMark.share, s.language, 1)}%`)}</div>
              )}
              {selected.includes(activeMark.id) && <div className="mt-1 text-xs font-medium text-emerald-300">✓ {texts.selected}</div>}
            </div>
          )}
        </div>
        {s.legend === "right" && legend}
      </div>
      {s.legend === "bottom" && legend}
      {sourceText && <p className="m-0 text-xs text-slate-500" data-testid="source">{sourceText}</p>}
    </figure>
  );
};

export default Chart;
