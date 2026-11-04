// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/graphFunctionInteraction
// (and its shared library PARCC/graphFunction), © 2014-2017 Parcc, Inc., by Sam Sipasseuth (Open Assessment Technologies)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The model of the function graph: the settings (data- attributes, all text), the function families and how two points
// determine a function of each, the curve, the asymptotes and the equation, and the response in the original's format.
// No imports: `npm test` runs it in node.

// ─── numbers ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type Language = "en" | "nl" | "fr";

/** "nl", "nl-NL", "FR" → nl, fr; anything else en. */
export const languageOf = (language: unknown): Language => {
  const code = String(language ?? "").slice(0, 2).toLowerCase();
  return code === "nl" || code === "fr" ? code : "en";
};

/** Rounds away floating point noise: 0.1 + 0.2 → 0.3. */
export const clean = (value: number): number => (isFinite(value) ? parseFloat(value.toPrecision(12)) : value);

/** Rounded to 2 decimals, as the original reports a point (toFixed(2)); -0 → 0. */
export const round2 = (value: number): number => {
  const r = Math.round(value * 100) / 100;
  return r === 0 ? 0 : clean(r);
};

/** 0.5 → "0.5" (en) or "0,5" (nl, fr); -3 → "−3"; at most 2 decimals. */
export const formatValue = (value: number, language: Language): string => {
  if (typeof value !== "number" || !isFinite(value)) return "–";
  const text = String(round2(value)).replace("-", "−");
  return language === "en" ? text : text.replace(".", ",");
};

/** A point as the candidate reads it: (2, 0.5) in English, (2 ; 0,5) in French, (2; 0,5) in Dutch. */
export const formatPoint = (p: Point, language: Language): string =>
  language === "en" ? `(${formatValue(p.x, language)}, ${formatValue(p.y, language)})`
    : language === "fr" ? `(${formatValue(p.x, language)} ; ${formatValue(p.y, language)})`
      : `(${formatValue(p.x, language)}; ${formatValue(p.y, language)})`;

/** "0,5", "0.5", " 12 ", "−3" → a number; anything else (empty, "a") null. */
export const parseNumber = (text: unknown): number | null => {
  if (typeof text === "number") return isFinite(text) ? text : null;
  if (typeof text !== "string") return null;
  const value = text.trim().replace(/[−–]/g, "-").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(value)) return null;
  const n = Number(value);
  return isFinite(n) ? n : null;
};

// ─── function families ──────────────────────────────────────────────────────────────────────────────────────────────

export type Point = { x: number; y: number };

/** The families of the original, with its names (they are the functionGraphType of the response). */
export const FAMILIES = ["linear", "absolute", "quadratic", "exponential", "logarithmic", "cosine", "tangent"] as const;
export type Family = (typeof FAMILIES)[number];

export const isFamily = (value: unknown): value is Family => FAMILIES.includes(value as Family);

/**
 * A function determined by two points (as in the original, always two):
 *
 * | family      | point 1               | point 2                    | params        | f(x)                  |
 * | ----------- | --------------------- | -------------------------- | ------------- | --------------------- |
 * | linear      | a point               | a point                    | [a, b]        | a·x + b               |
 * | absolute    | the vertex            | a point                    | [a, h, k]     | a·abs(x − h) + k      |
 * | quadratic   | the vertex            | a point                    | [a, h, k]     | a·(x − h)² + k        |
 * | exponential | a point               | a point (same sign of y)   | [a, b]        | a·e^(b·x)             |
 * | logarithmic | a point               | a point (same sign of x)   | [a, b]        | a·ln(b·x)             |
 * | cosine      | on the midline        | a highest or lowest point  | [a, b, h, d]  | a·cos(b·(x − h)) + d  |
 * | tangent     | the centre (midline)  | a quarter period further   | [a, b, h, d]  | a·tan(b·(x − h)) + d  |
 */
export type Fit = { family: Family; params: number[] };

/** Why two points do not determine a function of the family. */
export type Problem = "sameX" | "exponentialSign" | "logarithmicSide" | "logarithmicFlat";

/** The function of the family through the two points (the original's graphFunction.get), or why there is none. */
export const fit = (family: Family, p1: Point, p2: Point): Fit | Problem => {
  if (p1.x === p2.x) return "sameX";
  switch (family) {
    case "linear": {
      const a = (p2.y - p1.y) / (p2.x - p1.x);
      return { family, params: [a, p1.y - a * p1.x] };
    }
    case "absolute":
      return { family, params: [(p2.y - p1.y) / Math.abs(p2.x - p1.x), p1.x, p1.y] };
    case "quadratic":
      return { family, params: [(p2.y - p1.y) / (p2.x - p1.x) ** 2, p1.x, p1.y] };
    case "exponential": {
      if (!(p1.y * p2.y > 0)) return "exponentialSign";
      const b = Math.log(p2.y / p1.y) / (p2.x - p1.x);
      return { family, params: [p1.y / Math.exp(b * p1.x), b] };
    }
    case "logarithmic": {
      if (!(p1.x * p2.x > 0)) return "logarithmicSide";
      if (p1.y === p2.y) return "logarithmicFlat";
      const a = (p2.y - p1.y) / Math.log(p2.x / p1.x);
      return { family, params: [a, Math.exp(p1.y / a) / p1.x] };
    }
    // cos is even and tan odd: b > 0, so the equation reads as it is taught
    case "cosine":
      return { family, params: [p2.y - p1.y, Math.abs(Math.PI / (2 * (p1.x - p2.x))), p2.x, p1.y] };
    case "tangent": {
      const sign = p2.x > p1.x ? 1 : -1;
      return { family, params: [sign * (p2.y - p1.y), Math.PI / (4 * Math.abs(p2.x - p1.x)), p1.x, p1.y] };
    }
  }
};

export const isFit = (value: Fit | Problem | null | undefined): value is Fit => typeof value === "object" && value !== null;

/** f(x); null where the function is not defined (a logarithm outside its domain, a tangent at an asymptote). */
export const valueAt = ({ family, params: p }: Fit, x: number): number | null => {
  let y: number;
  switch (family) {
    case "linear": y = p[0] * x + p[1]; break;
    case "absolute": y = p[0] * Math.abs(x - p[1]) + p[2]; break;
    case "quadratic": y = p[0] * (x - p[1]) ** 2 + p[2]; break;
    case "exponential": y = p[0] * Math.exp(p[1] * x); break;
    case "logarithmic": y = p[1] * x > 0 ? p[0] * Math.log(p[1] * x) : NaN; break;
    case "cosine": y = p[0] * Math.cos(p[1] * (x - p[2])) + p[3]; break;
    case "tangent": {
      // at an asymptote cos is 0 (up to rounding): undefined
      const t = p[1] * (x - p[2]);
      y = Math.abs(Math.cos(t)) < 1e-12 ? NaN : p[0] * Math.tan(t) + p[3];
      break;
    }
  }
  return isFinite(y) ? y : null;
};

export type Range = { min: number; max: number };

/** The asymptotes within the range of x: y = 0 for an exponential function, x = 0 for a logarithm, x = h + 2d(2k + 1) for a tangent. */
export const asymptotes = (f: Fit, x: Range): { vertical: number[]; horizontal: number[] } => {
  if (f.family === "exponential") return { vertical: [], horizontal: [0] };
  if (f.family === "logarithmic") return { vertical: x.min <= 0 && 0 <= x.max ? [0] : [], horizontal: [] };
  if (f.family === "tangent") {
    const [, b, h] = f.params;
    const half = Math.abs(Math.PI / b); // the period; asymptotes half a period from the centre
    const vertical: number[] = [];
    const first = Math.ceil((x.min - h - half / 2) / half);
    for (let k = first; h + half / 2 + k * half <= x.max + 1e-9 && vertical.length < 200; k++) {
      vertical.push(clean(h + half / 2 + k * half));
    }
    return { vertical, horizontal: [] };
  }
  return { vertical: [], horizontal: [] };
};

/**
 * The curve within the view, as polylines (in the units of the axes): split where the function is not defined and at
 * its asymptotes, with y kept within a margin of the view so the drawing stays small.
 */
export const curve = (f: Fit, x: Range, y: Range, samples = 480): Point[][] => {
  const span = x.max - x.min;
  const margin = (y.max - y.min) * 2;
  const bound = (v: number) => Math.max(y.min - margin, Math.min(y.max + margin, v));
  // the pieces of the domain within the view
  let cuts = [x.min, x.max];
  const gap = span * 1e-4;
  if (f.family === "logarithmic") {
    // defined for b·x > 0
    cuts = f.params[1] > 0 ? [Math.max(x.min, gap), x.max] : [x.min, Math.min(x.max, -gap)];
    if (cuts[0] >= cuts[1]) return [];
  }
  const pieces: Range[] = [];
  const walls = f.family === "tangent" ? asymptotes(f, x).vertical : [];
  let from = cuts[0];
  for (const w of walls) {
    if (w - gap > from) pieces.push({ min: from, max: w - gap });
    from = w + gap;
  }
  if (cuts[1] > from) pieces.push({ min: from, max: cuts[1] });

  const lines: Point[][] = [];
  for (const piece of pieces) {
    const n = Math.max(2, Math.ceil((samples * (piece.max - piece.min)) / span));
    const xs = Array.from({ length: n + 1 }, (_, i) => piece.min + ((piece.max - piece.min) * i) / n);
    // the corner of an absolute value
    if (f.family === "absolute" && f.params[1] > piece.min && f.params[1] < piece.max) xs.push(f.params[1]);
    xs.sort((a, b) => a - b);
    let line: Point[] = [];
    for (const px of xs) {
      const v = valueAt(f, px);
      if (v === null) {
        if (line.length > 1) lines.push(line);
        line = [];
      } else {
        line.push({ x: px, y: bound(v) });
      }
    }
    if (line.length > 1) lines.push(line);
  }
  return lines;
};

/**
 * Whether two functions are the same within the view: the same family and, at points spread over the range of x, the
 * same value within the tolerance (in units of y) and defined at the same places. Near an asymptote of the first
 * function (beyond 10 times the range of y) values are not compared.
 */
export const sameFunction = (a: Fit, b: Fit, x: Range, y: Range, tolerance = 0): boolean => {
  if (a.family !== b.family) return false;
  const tol = Math.max(tolerance, (y.max - y.min) * 1e-6) + (y.max - y.min) * 1e-9;
  const far = Math.max(Math.abs(y.min), Math.abs(y.max)) + (y.max - y.min) * 10;
  const n = 120;
  let compared = 0;
  for (let i = 0; i <= n; i++) {
    const px = x.min + ((x.max - x.min) * i) / n;
    const va = valueAt(a, px), vb = valueAt(b, px);
    if (va === null || vb === null) {
      // defined in one but not in the other (unless that one is near an asymptote there)
      const other = va ?? vb;
      if (other !== null && Math.abs(other) <= far) return false;
      continue;
    }
    if (Math.abs(va) > far) continue;
    if (Math.abs(va - vb) > tol) return false;
    compared++;
  }
  return compared > 0;
};

// ─── the equation ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The equation of the function, rounded to 2 decimals: "display" as the candidate reads it in their language
 * (y = 0,5(x − 1)² + 2), "ascii" for the response (y = 0.5*(x - 1)^2 + 2). The display may use the names of the axes
 * (h = −5(t − 2)² + 20).
 */
export const equationText = (f: Fit, style: Language | "ascii", names: { x: string; y: string } = { x: "x", y: "y" }): string => {
  const X = names.x, Y = names.y;
  const ascii = style === "ascii";
  const num = (v: number) => (ascii ? String(round2(v)) : formatValue(v, style));
  const minus = ascii ? "-" : "−";
  const times = ascii ? "*" : "";
  /** a·rest: rest, −rest or 0.5rest; null when a rounds to 0. */
  const coef = (a: number, rest: string, sep = times): string | null => {
    const r = round2(a);
    if (r === 0) return null;
    if (r === 1) return rest;
    if (r === -1) return `${minus}${rest}`;
    return `${num(r)}${sep}${rest}`;
  };
  /** x − h */
  const shifted = (h: number) => (round2(h) === 0 ? X : round2(h) > 0 ? `${X} ${minus} ${num(h)}` : `${X} + ${num(-h)}`);
  /** + k */
  const plus = (k: number) => (round2(k) === 0 ? "" : round2(k) > 0 ? ` + ${num(k)}` : ` ${minus} ${num(-k)}`);
  /** a term and a constant: when the term vanishes, only the constant. */
  const sum = (term: string | null, k: number) => `${Y} = ${term === null ? num(k) : term + plus(k)}`;
  const p = f.params;
  switch (f.family) {
    case "linear":
      return sum(coef(p[0], X), p[1]);
    case "absolute":
      return sum(coef(p[0], ascii ? `abs(${shifted(p[1])})` : `|${shifted(p[1])}|`), p[2]);
    case "quadratic": {
      const square = round2(p[1]) === 0 ? (ascii ? `${X}^2` : `${X}²`) : ascii ? `(${shifted(p[1])})^2` : `(${shifted(p[1])})²`;
      return sum(coef(p[0], square), p[2]);
    }
    case "exponential": {
      // a·e^(bx) as a·gˣ, the way it is taught
      const g = Math.exp(p[1]);
      const power = ascii ? `${num(g)}^${X}` : X === "x" ? `${num(g)}ˣ` : `${num(g)}^${X}`;
      return `${Y} = ${coef(p[0], power, ascii ? "*" : " · ") ?? num(0)}`;
    }
    case "logarithmic": {
      const inner = round2(p[1]) === 1 ? X : `${num(p[1])}${times}${X}`;
      return `${Y} = ${coef(p[0], `ln(${inner})`, ascii ? "*" : " ") ?? num(0)}`;
    }
    case "cosine":
    case "tangent": {
      const name = f.family === "cosine" ? "cos" : "tan";
      const b = round2(p[1]);
      const arg = round2(p[2]) === 0 ? `${num(b)}${times}${X}` : `${num(b)}${times}(${shifted(p[2])})`;
      return sum(coef(p[0], `${name}(${arg})`, ascii ? "*" : " "), p[3]);
    }
  }
};

// ─── settings ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type Axis = {
  start: number;
  end: number;
  /** A grid line and a tick every step. */
  step: number;
  /** Points snap to step / subStep. */
  subStep: number;
  /** The small label at the tip of the axis: "x". */
  label: string;
  /** The title along the axis: "Time (s)". */
  title: string;
  /** Points may lie on the border of the grid. */
  allowOuter: boolean;
};

export type Settings = {
  language: Language;
  prompt: string;
  /** The families the candidate chooses from, in the original's order. */
  families: Family[];
  /** "default": two points to drag from the start (as the original); "empty": the candidate places both. */
  startPoints: "default" | "empty";
  showEquation: boolean;
  showAsymptotes: boolean;
  title: string;
  x: Axis;
  y: Axis;
  /** The size of the grid, in pixels (the graph scales down on a narrow screen). */
  width: number;
  height: number;
  plotColor: string;
  pointColor: string;
  plotThickness: number;
  pointRadius: number;
  /** The author's correct function: a family and two points, as the original's correct response. */
  correct: { family: Family; points: [Point, Point] } | null;
  /** How far (in units of y) the candidate's function may be from the correct one. */
  tolerance: number;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim());
const isTrue = (value: unknown, fallback: boolean) => {
  const t = text(value).toLowerCase();
  return t === "true" ? true : t === "false" ? false : fallback;
};
const numberOr = (value: unknown, fallback: number) => parseNumber(text(value)) ?? fallback;
const whole = (value: unknown, fallback: number, min: number, max: number) => {
  const n = parseNumber(text(value));
  return n === null ? fallback : Math.max(min, Math.min(max, Math.round(n)));
};
const color = (value: unknown, fallback: string) => (/^#[0-9a-f]{3,8}$|^[a-z]+$|^(rgb|hsl)a?\(/i.test(text(value)) ? text(value) : fallback);

/** "linear,quadratic" (the original's graphs property; also ; or spaces) → the families, in the original's order. */
export const parseFamilies = (value: unknown): Family[] => {
  const names = text(value).toLowerCase().split(/[\s,;]+/).filter(Boolean);
  const chosen = FAMILIES.filter((f) => names.includes(f));
  return chosen.length ? chosen : [...FAMILIES];
};

/**
 * "x1 y1,x2 y2" (the original's points field) → the points: a point is two numbers separated by spaces, points are
 * separated by commas. Stops at the first point that is not.
 */
export const parsePoints = (value: unknown): Point[] => {
  const points: Point[] = [];
  for (const part of text(value).split(",")) {
    const xy = part.trim().split(/\s+/).map((v) => parseNumber(v));
    if (xy.length !== 2 || xy[0] === null || xy[1] === null) break;
    points.push({ x: xy[0], y: xy[1] });
  }
  return points;
};

/** The points as the original reports them: "-2 -8,6 1" (2 decimals at most). */
export const pointsText = (points: Point[]): string => points.map((p) => `${round2(p.x)} ${round2(p.y)}`).join(",");

const axisOf = (props: Record<string, unknown>, k: "x" | "y"): Axis => {
  let start = numberOr(props[`${k}Start`], -10);
  let end = numberOr(props[`${k}End`], 10);
  if (!(start < end)) [start, end] = [-10, 10];
  let step = numberOr(props[`${k}Step`], 1);
  if (!(step > 0) || (end - start) / step > 100) step = clean((end - start) / 10);
  return {
    start, end, step,
    subStep: whole(props[`${k}SubStep`], 2, 1, 20),
    label: text(props[`${k}Label`]),
    title: text(props[`${k}Title`]),
    allowOuter: isTrue(props[`${k}AllowOuter`], true),
  };
};

export const parseSettings = (props: Record<string, unknown> = {}): Settings => {
  const correctFamily = text(props.correctType).toLowerCase();
  const correctPoints = parsePoints(props.correctPoints);
  return {
    language: languageOf(props.language),
    prompt: text(props.prompt),
    families: parseFamilies(props.graphs),
    startPoints: text(props.startPoints).toLowerCase() === "empty" ? "empty" : "default",
    showEquation: isTrue(props.showEquation, false),
    showAsymptotes: isTrue(props.showAsymptotes, true),
    title: text(props.graphTitle),
    x: axisOf(props, "x"),
    y: axisOf(props, "y"),
    width: whole(props.width, 450, 150, 1200),
    height: whole(props.height, 450, 150, 1200),
    plotColor: color(props.plotColor, "#2563eb"),
    pointColor: color(props.pointColor, "#1e3a8a"),
    plotThickness: whole(props.plotThickness, 3, 1, 12),
    pointRadius: whole(props.pointRadius, 8, 4, 20),
    correct: isFamily(correctFamily) && correctPoints.length >= 2 ? { family: correctFamily, points: [correctPoints[0], correctPoints[1]] } : null,
    tolerance: Math.max(0, numberOr(props.tolerance, 0)),
  };
};

// ─── the grid ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const snapSize = (a: Axis) => a.step / a.subStep;

/** Where points may go on an axis: the whole axis, or without the border (allowOuter false). */
export const limits = (a: Axis): Range => (a.allowOuter ? { min: a.start, max: a.end } : { min: clean(a.start + snapSize(a)), max: clean(a.end - snapSize(a)) });

/** A value snapped to the grid (step / subStep from the start of the axis) and kept within the limits. */
export const snap = (v: number, a: Axis): number => {
  const s = snapSize(a);
  const { min, max } = limits(a);
  const snapped = clean(a.start + Math.round((v - a.start) / s) * s);
  return clean(Math.max(min, Math.min(max, snapped)));
};

export const snapPoint = (p: Point, s: Settings): Point => ({ x: snap(p.x, s.x), y: snap(p.y, s.y) });

/** Where the axes cross: at 0 when 0 is on the axis, otherwise at the start (the original's getGraphOrigin). */
export const origin = (s: Settings): Point => {
  const at = (a: Axis) => (a.start <= 0 && a.end >= 0 ? 0 : a.start);
  return { x: at(s.x), y: at(s.y) };
};

// ─── the candidate's work ───────────────────────────────────────────────────────────────────────────────────────────

export type FunctionState = { family: Family; points: Point[] };

/** The points to drag at the start (the original's plotDefault): the origin and a step further; for an exponential or logarithmic function one and two steps from the origin, where it is defined. */
export const startPoints = (s: Settings, family: Family): Point[] => {
  if (s.startPoints === "empty") return [];
  const o = origin(s);
  const k = family === "exponential" || family === "logarithmic" ? 1 : 0;
  return [
    snapPoint({ x: o.x + k * s.x.step, y: o.y + k * s.y.step }, s),
    snapPoint({ x: o.x + (k + 1) * s.x.step, y: o.y + (k + 1) * s.y.step }, s),
  ];
};

export const initialState = (s: Settings): FunctionState => ({ family: s.families[0], points: startPoints(s, s.families[0]) });

export const sameState = (a: FunctionState, b: FunctionState) =>
  a.family === b.family && a.points.length === b.points.length && a.points.every((p, i) => p.x === b.points[i].x && p.y === b.points[i].y);

/** A state from outside (a saved state, a response): a known family and at most two points with numbers; else null. */
export const validState = (raw: unknown): FunctionState | null => {
  const r = raw as { family?: unknown; points?: unknown };
  if (!r || !isFamily(r.family) || !Array.isArray(r.points)) return null;
  const points = r.points.slice(0, 2).map((p: any) => ({ x: Number(p?.x), y: Number(p?.y) }));
  if (points.some((p) => !isFinite(p.x) || !isFinite(p.y))) return null;
  return { family: r.family, points };
};

/** The function the candidate drew, or why it is not one; null with fewer than two points. */
export const fitOf = (state: FunctionState): Fit | Problem | null =>
  state.points.length < 2 ? null : fit(state.family, state.points[0], state.points[1]);

export const range = (a: Axis): Range => ({ min: a.start, max: a.end });

/** The candidate's function compared with the correct one. */
export const evaluate = (s: Settings, state: FunctionState, correct: FunctionState | null) => {
  const mine = fitOf(state);
  const right = correct ? fitOf(correct) : null;
  const ok = isFit(mine) && isFit(right) && sameFunction(right, mine, range(s.x), range(s.y), s.tolerance);
  return { scored: isFit(right), score: ok ? 1 : 0, maxscore: 1, correct: ok, fit: mine };
};

/** The state for the correct function of the settings. */
export const correctState = (s: Settings): FunctionState | null => (s.correct ? { family: s.correct.family, points: [...s.correct.points] } : null);
