// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/graphLineAndPointInteraction
// (Thibault Milan, Sam Sipasseuth) and .../graphPointLineGraphInteraction (Sam Sipasseuth, Christophe Noël),
// © 2014-2017 Parcc, Inc. (Open Assessment Technologies, for Parcc, Inc.)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The model of the coordinate graph: the settings, the elements the author defined, what the candidate drew, the
// geometry (canonical lines, clipping to the grid, the areas between the lines) and the scoring. Pure TypeScript
// without imports, so node runs it in the tests (npm test) as it is.

export type Language = "en" | "nl" | "fr";
export type Point = { x: number; y: number };
export type ElementType = "point" | "points" | "line" | "segment" | "ray" | "solutionSet";
export const ELEMENT_TYPES: ElementType[] = ["point", "points", "line", "segment", "ray", "solutionSet"];
export const LINE_TYPES: ElementType[] = ["line", "segment", "ray"];
export const isLineType = (t: ElementType) => t === "line" || t === "segment" || t === "ray";

/** The most elements an item can have; the response has check1 … check12. */
export const MAX_ELEMENTS = 12;
/** The most points of a set of points. */
export const MAX_SET = 20;

/** What the candidate drew of an element: its points, the line style, the shaded areas (a point inside each). */
export type ElementValue = { points: Point[]; dashed?: boolean; regions?: Point[] };

/** An element the candidate can draw, as the author defined it (data-elements, JSON). */
export type ElementDef = {
  /** The name of its field in the response: points_1, setPoints_2, lines_3, segments_4, rays_5, solutionSet_6. */
  id: string;
  type: ElementType;
  label: string;
  color: string;
  /** How many points: 1 for a point, 2 for a line, segment or ray, up to MAX_SET for a set of points. */
  max: number;
  /** A set of points: connect them from left to right (Point Graph's line graph). */
  connect: boolean;
  /** A line, segment or ray: dashed at the start. */
  dashed: boolean;
  /** A line, segment or ray: the candidate chooses solid or dashed (and that counts when there is a correct answer). */
  styleToggle: boolean;
  /** The points for this element when it is right; 0: not scored. */
  score: number;
  /** The correct answer, or null: not scored (unless equation). */
  correct: ElementValue | null;
  /** A set of points: right when every point is on y = equation (instead of a correct answer). */
  equation: string;
  /** With an equation: at least this many points. */
  minPoints: number;
};

export type Grid = {
  xMin: number; xMax: number; yMin: number; yMax: number;
  /** The distance between grid lines. */
  xStep: number; yStep: number;
  /** Points snap to this part of a grid step: 1, 0.5 or 0.1. */
  snap: number;
  /** Points may be placed on the edge of the grid (Point Graph's allowOuter). */
  allowEdge: boolean;
};

/** A point the author gives (Point Graph's static points): shown, not movable. */
export type Given = { label: string; x: number; y: number };

export type Settings = {
  prompt: string;
  grid: Grid;
  xLabel: string;
  yLabel: string;
  elements: ElementDef[];
  given: Given[];
  connectGiven: boolean;
  /** How far (in units of the axes) a point may be from the correct one. */
  tolerance: number;
  language: Language;
  /** No elements configured: the example. */
  example: boolean;
};

export type GraphState = { values: Record<string, ElementValue> };

// --- numbers -----------------------------------------------------------------------------------------------------

export const EPS = 1e-6;
/** Rounds away floating point noise: 0.30000000000000004 → 0.3. */
export const clean = (v: number) => {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
};
const round2 = (v: number) => clean(Math.round(v * 100) / 100);

export const languageOf = (value: unknown): Language => {
  const l = String(value ?? "").slice(0, 2).toLowerCase();
  return l === "nl" || l === "fr" ? l : "en";
};

/** "2,5", "2.5", "-3", "1/2" → a number; anything else null. */
export const parseNumber = (text: unknown): number | null => {
  if (typeof text === "number") return Number.isFinite(text) ? text : null;
  const t = String(text ?? "").trim().replace(",", ".").replace("−", "-");
  if (!t) return null;
  const frac = t.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (frac) {
    const d = Number(frac[2]);
    return d ? Number(frac[1]) / d : null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** A number as the candidate reads it: a decimal comma in Dutch and French, a real minus sign. */
export const formatNumber = (v: number, language: Language) => {
  const s = String(clean(v));
  return (language === "en" ? s : s.replace(".", ",")).replace("-", "−");
};
/** (2, 3) in English; (2; 3) with a decimal comma. */
export const formatPoint = (p: Point, language: Language) =>
  `(${formatNumber(p.x, language)}${language === "en" ? ", " : "; "}${formatNumber(p.y, language)})`;

// --- the grid ----------------------------------------------------------------------------------------------------

export const DEFAULT_GRID: Grid = { xMin: -10, xMax: 10, yMin: -10, yMax: 10, xStep: 1, yStep: 1, snap: 1, allowEdge: true };

const SNAPS: Record<string, number> = { grid: 1, half: 0.5, tenth: 0.1 };

/** The grid from the settings; anything that cannot be drawn falls back on -10 … 10 by 1. */
export const parseGrid = (p: Record<string, unknown>): Grid => {
  const num = (k: string, d: number) => parseNumber(p[k]) ?? d;
  let xMin = num("xMin", -10), xMax = num("xMax", 10), yMin = num("yMin", -10), yMax = num("yMax", 10);
  if (!(xMax > xMin)) [xMin, xMax] = [-10, 10];
  if (!(yMax > yMin)) [yMin, yMax] = [-10, 10];
  const step = (v: number | null, range: number) => (v && v > 0 && range / v <= 100 && range / v >= 1 ? v : Math.max(range / 20, niceStep(range)));
  const xStep = step(parseNumber(p.xStep), xMax - xMin);
  const yStep = step(parseNumber(p.yStep), yMax - yMin);
  const snap = SNAPS[String(p.snap ?? "grid")] ?? 1;
  const allowEdge = String(p.allowEdge ?? "true") !== "false";
  return { xMin, xMax, yMin, yMax, xStep, yStep, snap, allowEdge };
};

/** A round step that divides a range in about 10 to 20 parts. */
const niceStep = (range: number) => {
  const raw = range / 20;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
};

/** The grid lines of an axis: the multiples of the step within the range. */
export const gridValues = (min: number, max: number, step: number) => {
  const out: number[] = [];
  for (let k = Math.ceil(min / step - EPS); k * step <= max + EPS; k++) out.push(clean(k * step));
  return out;
};

/** The area a point can be in: the grid, or within it when points may not be on the edge. */
export const bounds = (g: Grid) => {
  const dx = g.allowEdge ? 0 : g.xStep * g.snap, dy = g.allowEdge ? 0 : g.yStep * g.snap;
  return { xMin: g.xMin + dx, xMax: g.xMax - dx, yMin: g.yMin + dy, yMax: g.yMax - dy };
};

const snapValue = (v: number, unit: number, min: number, max: number) => {
  const s = clean(Math.round(v / unit) * unit);
  // off the grid after rounding: the nearest multiple inside
  if (s < min - EPS) return clean(Math.ceil(min / unit - EPS) * unit);
  if (s > max + EPS) return clean(Math.floor(max / unit + EPS) * unit);
  return s;
};

/** A position on the grid → the nearest point a candidate can place. */
export const snapPoint = (p: Point, g: Grid): Point => {
  const b = bounds(g);
  return {
    x: snapValue(Math.max(b.xMin, Math.min(b.xMax, p.x)), g.xStep * g.snap, b.xMin, b.xMax),
    y: snapValue(Math.max(b.yMin, Math.min(b.yMax, p.y)), g.yStep * g.snap, b.yMin, b.yMax),
  };
};

export const insideGrid = (p: Point, g: Grid) => {
  const b = bounds(g);
  return p.x >= b.xMin - EPS && p.x <= b.xMax + EPS && p.y >= b.yMin - EPS && p.y <= b.yMax + EPS;
};

// --- lines -------------------------------------------------------------------------------------------------------

/** A line a·x + b·y = c, with a² + b² = 1 and a > 0 (or a = 0 and b > 0): one form per line. */
export type Line = { a: number; b: number; c: number };

export const samePoint = (p: Point, q: Point, tol = EPS) => Math.abs(p.x - q.x) <= tol + EPS && Math.abs(p.y - q.y) <= tol + EPS;

/** The canonical form of the line through two points; null when they are the same point. */
export const lineThrough = (p: Point, q: Point): Line | null => {
  const l = rawLine(p, q);
  return l && { a: clean(l.a), b: clean(l.b), c: clean(l.c) };
};

const rawLine = (p: Point, q: Point): Line | null => {
  let a = q.y - p.y, b = p.x - q.x;
  const n = Math.hypot(a, b);
  if (n < EPS) return null;
  a /= n;
  b /= n;
  if (a < -EPS || (Math.abs(a) <= EPS && b < 0)) {
    a = -a;
    b = -b;
  }
  return { a, b, c: a * p.x + b * p.y };
};

export const distanceToLine = (p: Point, l: Line) => Math.abs(l.a * p.x + l.b * p.y - l.c);

/** The equation of the line through two points, as on paper: y = 0.5x + 1, y = −2, x = 3. */
export const equationText = (p: Point, q: Point, language: Language): string => {
  const n = (v: number) => formatNumber(round2(v), language);
  if (Math.abs(q.x - p.x) < EPS) return `x = ${n(p.x)}`;
  const m = (q.y - p.y) / (q.x - p.x);
  const c = p.y - m * p.x;
  if (Math.abs(m) < EPS) return `y = ${n(c)}`;
  const slope = Math.abs(round2(m) - 1) < EPS ? "" : Math.abs(round2(m) + 1) < EPS ? "−" : n(m);
  const rc = round2(c);
  const constant = Math.abs(rc) < EPS ? "" : rc > 0 ? ` + ${n(rc)}` : ` − ${n(-rc)}`;
  return `y = ${slope}x${constant}`;
};

/** The part of a line, ray or segment through p and q that is on the grid; null when none is. */
export const clipToGrid = (p: Point, q: Point, type: ElementType, g: Grid): [Point, Point] | null => {
  const dx = q.x - p.x, dy = q.y - p.y;
  if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return null;
  let t0 = type === "line" ? -Infinity : 0;
  let t1 = type === "segment" ? 1 : Infinity;
  // Liang–Barsky
  const edges: [number, number][] = [[-dx, p.x - g.xMin], [dx, g.xMax - p.x], [-dy, p.y - g.yMin], [dy, g.yMax - p.y]];
  for (const [pp, qq] of edges) {
    if (Math.abs(pp) < 1e-12) {
      if (qq < -EPS) return null;
    } else {
      const t = qq / pp;
      if (pp < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  if (t0 > t1 + 1e-9 || !Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return [{ x: p.x + t0 * dx, y: p.y + t0 * dy }, { x: p.x + t1 * dx, y: p.y + t1 * dy }];
};

// --- the areas between the lines (solution sets) -----------------------------------------------------------------

export type Polygon = Point[];

export const polygonArea = (poly: Polygon) => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};

export const centroid = (poly: Polygon): Point => {
  const area = polygonArea(poly);
  if (Math.abs(area) < 1e-12) {
    return { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
};

/** The two halves of a convex polygon on either side of a line (Sutherland–Hodgman for both sides). */
const split = (poly: Polygon, l: Line): [Polygon, Polygon] => {
  const side = (p: Point) => l.a * p.x + l.b * p.y - l.c;
  const below: Polygon = [], above: Polygon = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = side(p), sq = side(q);
    if (sp <= EPS) below.push(p);
    if (sp >= -EPS) above.push(p);
    if ((sp < -EPS && sq > EPS) || (sp > EPS && sq < -EPS)) {
      const t = sp / (sp - sq);
      const x = { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
      below.push(x);
      above.push(x);
    }
  }
  return [below, above];
};

export type Region = { polygon: Polygon; inside: Point };

/** The areas the lines cut the grid into, from top left to bottom right; one area (the grid) without lines. */
export const regionsOf = (lines: Line[], g: Grid): Region[] => {
  let polys: Polygon[] = [[{ x: g.xMin, y: g.yMin }, { x: g.xMax, y: g.yMin }, { x: g.xMax, y: g.yMax }, { x: g.xMin, y: g.yMax }]];
  const minArea = (g.xMax - g.xMin) * (g.yMax - g.yMin) * 1e-7;
  for (const l of lines) {
    polys = polys.flatMap((poly) => split(poly, l)).filter((poly) => poly.length >= 3 && Math.abs(polygonArea(poly)) > minArea);
  }
  return polys
    .map((polygon) => ({ polygon, inside: centroid(polygon) }))
    .sort((r, s) => (Math.abs(r.inside.y - s.inside.y) > EPS ? s.inside.y - r.inside.y : r.inside.x - s.inside.x));
};

export const insidePolygon = (p: Point, poly: Polygon) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

/** The index of the area a point is in, or -1. */
export const regionAt = (regions: Region[], p: Point) => regions.findIndex((r) => insidePolygon(p, r.polygon));

/** A point of the grid well inside an area, near its middle, to name it by: "Area 1, around (−2, 5)". */
export const labelPoint = (r: Region, g: Grid): Point => {
  const c = r.inside;
  let best: Point | null = null, bestD = Infinity;
  const inner = (p: Point) => {
    if (!insidePolygon(p, r.polygon)) return false;
    // not on (or very near) an edge
    for (let i = 0; i < r.polygon.length; i++) {
      const l = rawLine(r.polygon[i], r.polygon[(i + 1) % r.polygon.length]);
      if (l && distanceToLine(p, l) < Math.min(g.xStep, g.yStep) * 0.25) return false;
    }
    return true;
  };
  for (const x of gridValues(g.xMin, g.xMax, g.xStep)) {
    for (const y of gridValues(g.yMin, g.yMax, g.yStep)) {
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < bestD && inner({ x, y })) {
        best = { x, y };
        bestD = d;
      }
    }
  }
  return best ?? { x: round2(c.x), y: round2(c.y) };
};

/** A polygon for the response: its corners rounded to 2 decimals, counterclockwise from the leftmost: "x y, x y, …". */
export const polygonText = (poly: Polygon) => {
  let pts = poly.map((p) => ({ x: round2(p.x), y: round2(p.y) }));
  pts = pts.filter((p, i) => !samePoint(p, pts[(i + 1) % pts.length]));
  if (polygonArea(pts) < 0) pts.reverse();
  let start = 0;
  pts.forEach((p, i) => {
    if (p.x < pts[start].x - EPS || (Math.abs(p.x - pts[start].x) <= EPS && p.y < pts[start].y)) start = i;
  });
  return [...pts.slice(start), ...pts.slice(0, start)].map((p) => `${p.x} ${p.y}`).join(", ");
};

/** "x y, x y, …" (ours) → a polygon; null when it is not one. */
export const parsePolygon = (text: string): Polygon | null => {
  const pts = String(text).split(/[,;]/).map((s) => s.trim().split(/\s+/).map(Number));
  if (pts.length < 3 || pts.some((p) => p.length !== 2 || !p.every(Number.isFinite))) return null;
  return pts.map(([x, y]) => ({ x, y }));
};

/** The full lines of a state, in the order of the elements: they divide the grid into areas. */
export const linesOf = (s: Settings, values: Record<string, ElementValue | null | undefined>): Line[] =>
  s.elements
    .filter((e) => e.type === "line")
    .map((e) => values[e.id]?.points)
    .filter((pts) => pts && pts.length === 2)
    .map((pts) => lineThrough(pts[0], pts[1]))
    .filter((l): l is Line => l !== null);

/** The areas of the state's lines that are shaded for this solution set. */
export const shadedRegions = (s: Settings, values: Record<string, ElementValue | null | undefined>, id: string): Region[] => {
  const marks = values[id]?.regions ?? [];
  if (!marks.length) return [];
  return regionsOf(linesOf(s, values), s.grid).filter((r) => marks.some((m) => insidePolygon(m, r.polygon)));
};

// --- the example and the settings --------------------------------------------------------------------------------

const EXAMPLE_TEXTS = {
  en: {
    prompt: "Graph the inequality y > ½x + 1: draw the boundary line, choose a solid or a dashed line, and shade the solution set. Then mark the point where the line crosses the y-axis.",
    line: "Boundary line", set: "Solution set", point: "y-intercept",
  },
  nl: {
    prompt: "Teken de ongelijkheid y > ½x + 1: teken de grenslijn, kies een doorgetrokken of een gestippelde lijn, en kleur het oplossingsgebied. Zet daarna een punt waar de lijn de y-as snijdt.",
    line: "Grenslijn", set: "Oplossingsgebied", point: "Snijpunt y-as",
  },
  fr: {
    prompt: "Représente l'inéquation y > ½x + 1 : trace la droite frontière, choisis un trait plein ou pointillé, et colorie l'ensemble des solutions. Place ensuite le point où la droite coupe l'axe des y.",
    line: "Droite frontière", set: "Ensemble des solutions", point: "Ordonnée à l'origine",
  },
};

export const examplePrompt = (language: Language) => EXAMPLE_TEXTS[language].prompt;

/** The example: a dashed boundary line y = ½x + 1, the area above it, and the point (0, 1). */
export const exampleElements = (language: Language): ElementDef[] => {
  const t = EXAMPLE_TEXTS[language];
  return [
    defaults({ id: "lines_1", type: "line", label: t.line, color: "#2563eb", styleToggle: true, correct: { points: [{ x: 0, y: 1 }, { x: 2, y: 2 }], dashed: true } }),
    defaults({ id: "solutionSet_2", type: "solutionSet", label: t.set, color: "#0d9488", correct: { points: [], regions: [{ x: -5, y: 5 }] } }),
    defaults({ id: "points_3", type: "point", label: t.point, color: "#dc2626", correct: { points: [{ x: 0, y: 1 }] } }),
  ];
};

/** The prefix of the ids of a type, as in the original (points_1, setPoints_4, lines_9, segments_6, solutionSet_13). */
export const ID_PREFIX: Record<ElementType, string> = {
  point: "points", points: "setPoints", line: "lines", segment: "segments", ray: "rays", solutionSet: "solutionSet",
};
export const COLORS = ["#2563eb", "#dc2626", "#0d9488", "#9333ea", "#ea580c", "#0891b2", "#be185d", "#4d7c0f", "#b45309", "#475569"];

/** A new id for an element of this type that the others do not have. */
export const newId = (type: ElementType, taken: string[]) => {
  let n = taken.length + 1;
  while (taken.includes(`${ID_PREFIX[type]}_${n}`)) n++;
  return `${ID_PREFIX[type]}_${n}`;
};

const maxOf = (type: ElementType, max?: unknown) =>
  type === "point" ? 1 : isLineType(type) ? 2 : type === "solutionSet" ? 0 : Math.max(1, Math.min(MAX_SET, Math.round(Number(max) || 5)));

/** An element with every field, from what the author wrote. */
export const defaults = (raw: Partial<ElementDef> & { type: ElementType; id: string }): ElementDef => ({
  id: raw.id,
  type: raw.type,
  label: typeof raw.label === "string" ? raw.label : raw.id,
  color: typeof raw.color === "string" && /^#[0-9a-f]{3,8}$/i.test(raw.color) ? raw.color : COLORS[0],
  max: maxOf(raw.type, raw.max),
  connect: raw.type === "points" && raw.connect === true,
  dashed: isLineType(raw.type) && raw.dashed === true,
  styleToggle: isLineType(raw.type) && raw.styleToggle === true,
  score: Number.isFinite(Number(raw.score)) && Number(raw.score) >= 0 ? Math.round(Number(raw.score)) : 1,
  correct: raw.correct ? cleanValue(raw.correct, raw.type, maxOf(raw.type, raw.max)) : null,
  equation: raw.type === "points" && typeof raw.equation === "string" ? raw.equation.trim() : "",
  minPoints: Math.max(1, Math.round(Number(raw.minPoints) || 2)),
});

const asPoint = (p: any): Point | null => {
  const x = Array.isArray(p) ? parseNumber(p[0]) : parseNumber(p?.x);
  const y = Array.isArray(p) ? parseNumber(p[1]) : parseNumber(p?.y);
  return x === null || y === null ? null : { x: clean(x), y: clean(y) };
};

/** A value with only what fits its type. */
const cleanValue = (raw: any, type: ElementType, max: number): ElementValue => {
  const points = (Array.isArray(raw?.points) ? raw.points : []).map(asPoint).filter((p: Point | null): p is Point => p !== null).slice(0, max);
  const value: ElementValue = { points: type === "solutionSet" ? [] : points };
  if (isLineType(type) && typeof raw?.dashed === "boolean") value.dashed = raw.dashed;
  if (type === "solutionSet") value.regions = (Array.isArray(raw?.regions) ? raw.regions : []).map(asPoint).filter((p: Point | null): p is Point => p !== null);
  return value;
};

/** data-elements (JSON, written by the authoring mode) → the elements; null when it is empty or not valid. */
export const parseElements = (text: unknown): ElementDef[] | null => {
  const t = String(text ?? "").trim();
  if (!t) return null;
  try {
    const raw = JSON.parse(t);
    if (!Array.isArray(raw)) return null;
    const seen = new Set<string>();
    const out: ElementDef[] = [];
    raw.forEach((r: any, i: number) => {
      if (!r || !ELEMENT_TYPES.includes(r.type) || out.length >= MAX_ELEMENTS) return;
      let id = typeof r.id === "string" && /^[A-Za-z_][\w.-]*$/.test(r.id) ? r.id : r.uid;
      if (typeof id !== "string" || seen.has(id) || !/^[A-Za-z_][\w.-]*$/.test(id)) id = newId(r.type, [...seen]);
      seen.add(id);
      out.push(defaults({ ...r, id, color: r.color ?? COLORS[i % COLORS.length] }));
    });
    return out.length ? out : null;
  } catch {
    return null;
  }
};

/** data-given: a line per point, label;x;y (or x;y). */
export const parseGiven = (text: unknown): Given[] =>
  String(text ?? "")
    .split(/\r?\n|\|/)
    .map((line) => line.split(";").map((s) => s.trim()))
    .map((parts) => {
      const [label, xs, ys] = parts.length >= 3 ? parts : ["", parts[0], parts[1]];
      const x = parseNumber(xs), y = parseNumber(ys);
      return x === null || y === null ? null : { label, x, y };
    })
    .filter((g): g is Given => g !== null)
    .slice(0, 30);

export const parseSettings = (p: Record<string, unknown>): Settings => {
  const language = languageOf(p.language);
  const elements = parseElements(p.elements);
  const tolerance = parseNumber(p.tolerance);
  return {
    prompt: String(p.prompt ?? "").trim() || (elements ? "" : examplePrompt(language)),
    grid: parseGrid(p),
    xLabel: String(p.xLabel ?? "x"),
    yLabel: String(p.yLabel ?? "y"),
    elements: elements ?? exampleElements(language),
    given: parseGiven(p.given),
    connectGiven: String(p.connectGiven ?? "false") === "true",
    tolerance: tolerance !== null && tolerance >= 0 ? tolerance : 0,
    language,
    example: !elements,
  };
};

// --- the state ---------------------------------------------------------------------------------------------------

export const emptyValue = (e: ElementDef): ElementValue =>
  e.type === "solutionSet" ? { points: [], regions: [] } : isLineType(e.type) ? { points: [], dashed: e.dashed } : { points: [] };

export const initialState = (s: Settings): GraphState => ({
  values: Object.fromEntries(s.elements.map((e) => [e.id, emptyValue(e)])),
});

/** A state from elsewhere (a saved state, a response) with only what fits the elements and the grid. */
export const validState = (raw: any, s: Settings): GraphState | null => {
  if (!raw || typeof raw !== "object" || !raw.values || typeof raw.values !== "object") return null;
  const values: Record<string, ElementValue> = {};
  for (const e of s.elements) {
    const v = cleanValue(raw.values[e.id] ?? {}, e.type, e.max);
    v.points = v.points.filter((p) => insideGrid(p, { ...s.grid, allowEdge: true }));
    if (isLineType(e.type) && v.dashed === undefined) v.dashed = e.dashed;
    if (isLineType(e.type) && v.points.length === 2 && samePoint(v.points[0], v.points[1])) v.points = v.points.slice(0, 1);
    values[e.id] = v;
  }
  return { values };
};

export const sameState = (a: GraphState, b: GraphState) => JSON.stringify(a.values) === JSON.stringify(b.values);

/** The candidate drew something of this element. */
export const drawn = (e: ElementDef, v: ElementValue | undefined) =>
  !!v && (e.type === "solutionSet" ? (v.regions?.length ?? 0) > 0 : v.points.length > 0);

const withValue = (state: GraphState, id: string, value: ElementValue): GraphState => ({ values: { ...state.values, [id]: value } });

/** After a full line changed, the areas are other areas: the solution sets start over (as in the original). */
const clearRegions = (s: Settings, state: GraphState): GraphState => {
  const values = { ...state.values };
  for (const e of s.elements) if (e.type === "solutionSet" && values[e.id]?.regions?.length) values[e.id] = { ...values[e.id], regions: [] };
  return { values };
};
const afterChange = (s: Settings, e: ElementDef, before: GraphState, next: GraphState) => {
  if (e.type !== "line") return next;
  const a = linesOf(s, before.values), b = linesOf(s, next.values);
  return JSON.stringify(a) === JSON.stringify(b) ? next : clearRegions(s, next);
};

export type AddResult = { state: GraphState; index: number; replaced: boolean } | null;

/**
 * A point placed for an element. When it has all its points, the last one moves there (as in the original). Null when
 * it cannot be placed: the second point of a line on the first.
 */
export const addPoint = (s: Settings, state: GraphState, id: string, p: Point): AddResult => {
  const e = s.elements.find((d) => d.id === id);
  if (!e || e.type === "solutionSet") return null;
  const v = state.values[id] ?? emptyValue(e);
  const q = snapPoint(p, s.grid);
  const others = v.points.length < e.max ? v.points : v.points.slice(0, -1);
  if (isLineType(e.type) && others.some((o) => samePoint(o, q))) return null;
  if (e.type === "points" && others.some((o) => samePoint(o, q))) return null;
  const points = [...others, q];
  const next = withValue(state, id, { ...v, points });
  return { state: afterChange(s, e, state, next), index: points.length - 1, replaced: v.points.length >= e.max };
};

export const movePoint = (s: Settings, state: GraphState, id: string, index: number, p: Point): GraphState | null => {
  const e = s.elements.find((d) => d.id === id);
  const v = state.values[id];
  if (!e || !v || !v.points[index]) return null;
  const q = snapPoint(p, s.grid);
  if ((isLineType(e.type) || e.type === "points") && v.points.some((o, i) => i !== index && samePoint(o, q))) return null;
  const next = withValue(state, id, { ...v, points: v.points.map((o, i) => (i === index ? q : o)) });
  return afterChange(s, e, state, next);
};

export const removePoint = (s: Settings, state: GraphState, id: string, index: number): GraphState => {
  const e = s.elements.find((d) => d.id === id);
  const v = state.values[id];
  if (!e || !v) return state;
  return afterChange(s, e, state, withValue(state, id, { ...v, points: v.points.filter((_, i) => i !== index) }));
};

export const clearElement = (s: Settings, state: GraphState, id: string): GraphState => {
  const e = s.elements.find((d) => d.id === id);
  if (!e) return state;
  return afterChange(s, e, state, withValue(state, id, { ...emptyValue(e), dashed: state.values[id]?.dashed ?? e.dashed }));
};

export const setDashed = (s: Settings, state: GraphState, id: string, dashed: boolean): GraphState => {
  const e = s.elements.find((d) => d.id === id);
  if (!e || !isLineType(e.type)) return state;
  return withValue(state, id, { ...(state.values[id] ?? emptyValue(e)), dashed });
};

/** Shades the area around p for a solution set, or unshades it when it is shaded. */
export const toggleRegion = (s: Settings, state: GraphState, id: string, p: Point): { state: GraphState; index: number; shaded: boolean } | null => {
  const e = s.elements.find((d) => d.id === id);
  if (!e || e.type !== "solutionSet") return null;
  const regions = regionsOf(linesOf(s, state.values), s.grid);
  const index = regionAt(regions, p);
  if (index < 0) return null;
  const r = regions[index];
  const v = state.values[id] ?? emptyValue(e);
  const marks = v.regions ?? [];
  const shaded = marks.some((m) => insidePolygon(m, r.polygon));
  const inside = { x: clean(r.inside.x), y: clean(r.inside.y) };
  const next = shaded ? marks.filter((m) => !insidePolygon(m, r.polygon)) : [...marks, inside];
  return { state: withValue(state, id, { ...v, regions: next }), index, shaded: !shaded };
};

// --- equations (Point Graph's equation scoring) -------------------------------------------------------------------

/** "y = 2x^2 - 3", "2*x+1", "sqrt(x)" → f(x); null when it cannot be read. */
export const parseEquation = (text: string): ((x: number) => number) | null => {
  const src = String(text ?? "").trim().replace(/^(y|f\s*\(\s*x\s*\))\s*=/i, "").replace(/−/g, "-").replace(/,/g, ".").replace(/·|×/g, "*").toLowerCase();
  if (!src) return null;
  const tokens = src.match(/\d+(?:\.\d+)?|[a-z]+|[+\-*/^()]|\S/g) ?? [];
  let i = 0;
  type F = (x: number) => number;
  const FUNCS: Record<string, (v: number) => number> = {
    sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, ln: Math.log, log: Math.log10,
  };
  const peek = () => tokens[i];
  const startsPrimary = (t: string | undefined) => t !== undefined && (/^\d/.test(t) || /^[a-z]/.test(t) || t === "(");
  const primary = (): F => {
    const t = tokens[i++];
    if (t === undefined) throw new Error("end");
    if (/^\d/.test(t)) {
      const n = Number(t);
      return () => n;
    }
    if (t === "(") {
      const f = expr();
      if (tokens[i++] !== ")") throw new Error(")");
      return f;
    }
    if (t === "x") return (x) => x;
    if (t === "pi") return () => Math.PI;
    if (t === "e") return () => Math.E;
    if (FUNCS[t]) {
      const g = FUNCS[t];
      const arg = power();
      return (x) => g(arg(x));
    }
    // 2xx, xpi: letters run together
    if (/^[a-z]+$/.test(t) && /^(x|pi|e)+$/.test(t)) {
      const parts = t.match(/x|pi|e/g)!.map((p) => (p === "x" ? (x: number) => x : p === "pi" ? () => Math.PI : () => Math.E));
      return (x) => parts.reduce((acc, f) => acc * f(x), 1);
    }
    throw new Error(t);
  };
  const power = (): F => {
    const base = primary();
    if (peek() === "^") {
      i++;
      const exp = factor();
      return (x) => Math.pow(base(x), exp(x));
    }
    return base;
  };
  const factor = (): F => {
    if (peek() === "-") {
      i++;
      const f = factor();
      return (x) => -f(x);
    }
    if (peek() === "+") {
      i++;
      return factor();
    }
    return power();
  };
  const term = (): F => {
    let f = factor();
    for (;;) {
      const t = peek();
      if (t === "*" || t === "/") {
        i++;
        const g = factor(), h = f;
        f = t === "*" ? (x) => h(x) * g(x) : (x) => h(x) / g(x);
      } else if (startsPrimary(t)) {
        const g = power(), h = f;
        f = (x) => h(x) * g(x);
      } else return f;
    }
  };
  const expr = (): F => {
    let f = term();
    for (;;) {
      const t = peek();
      if (t !== "+" && t !== "-") return f;
      i++;
      const g = term(), h = f;
      f = t === "+" ? (x) => h(x) + g(x) : (x) => h(x) - g(x);
    }
  };
  try {
    const f = expr();
    if (i !== tokens.length) return null;
    f(1.2345); // throws for nothing, but catches a broken tree early
    return f;
  } catch {
    return null;
  }
};

// --- scoring -----------------------------------------------------------------------------------------------------

/** Each point of one list matches its own point of the other (within the tolerance). */
export const matchAll = (a: Point[], b: Point[], tol: number) => {
  if (a.length !== b.length) return false;
  const owner: number[] = new Array(b.length).fill(-1);
  const tryMatch = (i: number, seen: boolean[]): boolean => {
    for (let j = 0; j < b.length; j++) {
      if (seen[j] || !samePoint(a[i], b[j], tol)) continue;
      seen[j] = true;
      if (owner[j] < 0 || tryMatch(owner[j], seen)) {
        owner[j] = i;
        return true;
      }
    }
    return false;
  };
  return a.every((_, i) => tryMatch(i, new Array(b.length).fill(false)));
};

/** Two lines are the same where the grid shows them: each one's ends on the grid lie on the other (within tol). */
export const sameLine = (p: Point[], q: Point[], g: Grid, tol: number) => {
  const lp = rawLine(p[0], p[1]), lq = rawLine(q[0], q[1]);
  if (!lp || !lq) return false;
  const cp = clipToGrid(p[0], p[1], "line", g) ?? [p[0], p[1]];
  const cq = clipToGrid(q[0], q[1], "line", g) ?? [q[0], q[1]];
  const t = tol + EPS;
  return cp.every((e) => distanceToLine(e, lq) <= t) && cq.every((e) => distanceToLine(e, lp) <= t);
};

/** Two rays: the same start, and the same end on the grid. */
export const sameRay = (p: Point[], q: Point[], g: Grid, tol: number) => {
  if (!samePoint(p[0], q[0], tol)) return false;
  const cp = clipToGrid(p[0], p[1], "ray", g), cq = clipToGrid(q[0], q[1], "ray", g);
  if (!cp || !cq) return false;
  return samePoint(cp[1], cq[1], tol + EPS);
};

/** How well the shaded areas of the candidate cover the correct ones: the share of the grid where they differ. */
export const shadedDifference = (s: Settings, mine: Region[], correct: Region[]) => {
  const g = s.grid, n = 120;
  let differ = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // the middle of a cell, a little off so that it is never exactly on a line
      const p = { x: g.xMin + ((i + 0.5013) / n) * (g.xMax - g.xMin), y: g.yMin + ((j + 0.4987) / n) * (g.yMax - g.yMin) };
      const a = mine.some((r) => insidePolygon(p, r.polygon));
      const b = correct.some((r) => insidePolygon(p, r.polygon));
      if (a !== b) differ++;
    }
  }
  return differ / (n * n);
};

/** The values of the correct answer, by element (for the solution sets: the areas of the correct lines). */
export const correctValues = (s: Settings): Record<string, ElementValue | null> =>
  Object.fromEntries(s.elements.map((e) => [e.id, e.correct]));

/** Is this element right? null when it is not scored (no correct answer and no equation, or 0 points). */
export const checkElement = (s: Settings, e: ElementDef, state: GraphState): boolean | null => {
  if (e.score <= 0) return null;
  const v = state.values[e.id] ?? emptyValue(e);
  const tol = s.tolerance;
  if (e.type === "points" && e.equation) {
    const f = parseEquation(e.equation);
    if (!f) return null;
    return v.points.length >= Math.min(e.minPoints, e.max) && v.points.every((p) => {
      const y = f(p.x);
      return Number.isFinite(y) && Math.abs(y - p.y) <= tol + EPS;
    });
  }
  const c = e.correct;
  if (!c) return null;
  if (e.type === "solutionSet") {
    const mine = shadedRegions(s, state.values, e.id);
    const correct = shadedRegions(s, correctValues(s), e.id);
    return shadedDifference(s, mine, correct) <= 0.01;
  }
  if (isLineType(e.type)) {
    if (c.points.length < 2 || v.points.length < 2) return c.points.length === v.points.length && c.points.length === 0;
    const style = !e.styleToggle || (c.dashed ?? e.dashed) === (v.dashed ?? e.dashed);
    const same = e.type === "line" ? sameLine(v.points, c.points, s.grid, tol)
      : e.type === "ray" ? sameRay(v.points, c.points, s.grid, tol)
      : matchAll(v.points, c.points, tol);
    return style && same;
  }
  return matchAll(v.points, c.points, tol);
};

export type Evaluation = { checks: (boolean | null)[]; score: number; maxscore: number; correct: boolean };

export const evaluate = (s: Settings, state: GraphState): Evaluation => {
  const checks = s.elements.map((e) => checkElement(s, e, state));
  let score = 0, maxscore = 0;
  checks.forEach((c, i) => {
    if (c === null) return;
    maxscore += s.elements[i].score;
    if (c) score += s.elements[i].score;
  });
  return { checks, score, maxscore, correct: maxscore > 0 && score === maxscore };
};

/** The state of the correct answer (solution status); null when no element has one. */
export const solutionState = (s: Settings): GraphState | null => {
  if (!s.elements.some((e) => e.correct)) return null;
  const values: Record<string, ElementValue> = {};
  for (const e of s.elements) values[e.id] = e.correct ? { ...emptyValue(e), ...e.correct } : emptyValue(e);
  return validState({ values }, s);
};

// --- the response ------------------------------------------------------------------------------------------------

export type RecordField = { name: string; base?: Record<string, unknown> | null; list?: Record<string, unknown[]> | null };

/**
 * The record of a state: score, maxscore, correct and check1 … (a field per element in order: 1 right, 0 not; left out
 * when the element is not scored), then a field per element named by its id, as in the original: a point list
 * ([x, y] per point; a line, segment or ray: its two points), a solution set a string list (a polygon per shaded
 * area), then graph: the state as JSON (with the line styles).
 */
export const responseRecord = (s: Settings, state: GraphState): RecordField[] => {
  const e = evaluate(s, state);
  const record: RecordField[] = [
    { name: "score", base: { integer: e.score } },
    { name: "maxscore", base: { integer: e.maxscore } },
    { name: "correct", base: { integer: e.correct ? 1 : 0 } },
  ];
  e.checks.forEach((c, i) => {
    if (c !== null) record.push({ name: `check${i + 1}`, base: { integer: c ? 1 : 0 } });
  });
  for (const d of s.elements) {
    if (d.type === "solutionSet") {
      record.push({ name: d.id, list: { string: shadedRegions(s, state.values, d.id).map((r) => polygonText(r.polygon)) } });
    } else {
      record.push({ name: d.id, list: { point: (state.values[d.id]?.points ?? []).map((p) => [p.x, p.y]) } });
    }
  }
  record.push({ name: "graph", base: { string: JSON.stringify(state) } });
  return record;
};

/** The fields of a record response: { record: [...] }, or a correct response's [{ fieldIdentifier, value }]. */
const fieldsOf = (value: any): RecordField[] | null => {
  if (!value) return null;
  if (Array.isArray(value.record)) return value.record;
  if (Array.isArray(value) && value.every((v) => v && typeof v === "object")) {
    return value.map((v: any) => (v.name ? v : { name: v.fieldIdentifier ?? v.identifier, base: v.base ?? (typeof v.value === "string" ? { string: v.value } : null), list: v.list ?? null }));
  }
  return null;
};

const pointsOfField = (f: RecordField): Point[] | null => {
  const list = (f.list as any)?.point ?? (f.base as any)?.list?.point; // ours, or the original's base.list.point
  if (!Array.isArray(list)) return null;
  return list.map(asPoint).filter((p: Point | null): p is Point => p !== null);
};

/**
 * A response back in the PCI: our record (its graph field, or else the element fields), the original's record
 * ({ name, base: { list: { point } } } per element, a solution set as one entry per shaded area with its corners) or
 * Point Graph's { list: { string: ["x y", …] } } for the first set of points. Null when it is none of these.
 */
export const stateFromResponse = (value: any, s: Settings): GraphState | null => {
  if (value && Array.isArray(value.list?.string) && !value.record) {
    const set = s.elements.find((e) => e.type === "points") ?? s.elements.find((e) => e.type === "point");
    if (!set) return null;
    const points = value.list.string.map((t: string) => String(t).trim().split(/\s+/)).map(asPoint).filter(Boolean);
    return validState({ values: { ...initialState(s).values, [set.id]: { points } } }, s);
  }
  const fields = fieldsOf(value);
  if (!fields) return null;
  const graph = fields.find((f) => f?.name === "graph");
  const graphText = (graph?.base as any)?.string;
  if (typeof graphText === "string") {
    try {
      const st = validState(JSON.parse(graphText), s);
      if (st) return st;
    } catch {
      // the element fields below
    }
  }
  const values: Record<string, any> = { ...initialState(s).values };
  let found = false;
  for (const e of s.elements) {
    const own = fields.filter((f) => f?.name === e.id);
    if (!own.length) continue;
    found = true;
    if (e.type === "solutionSet") {
      const polygons: Polygon[] = [];
      for (const f of own) {
        const strings = (f.list as any)?.string;
        if (Array.isArray(strings)) strings.forEach((t: string) => { const poly = parsePolygon(t); if (poly) polygons.push(poly); });
        const pts = pointsOfField(f);
        if (pts && pts.length >= 3) polygons.push(pts);
      }
      values[e.id] = { points: [], regions: polygons.map((poly) => { const c = centroid(poly); return { x: clean(c.x), y: clean(c.y) }; }) };
    } else {
      values[e.id] = { ...values[e.id], points: pointsOfField(own[0]) ?? [] };
    }
  }
  return found ? validState({ values }, s) : null;
};

// --- the authoring mode ------------------------------------------------------------------------------------------

export type Problem =
  | { kind: "noElements" }
  | { kind: "noLabel"; index: number }
  | { kind: "noLine"; label: string }
  | { kind: "incomplete"; label: string }
  | { kind: "equation"; label: string }
  | { kind: "outside"; label: string };

/** What keeps the elements from being used (validate() of the authoring mode). */
export const elementProblems = (s: Settings, elements: ElementDef[]): Problem[] => {
  const out: Problem[] = [];
  if (!elements.length) out.push({ kind: "noElements" });
  elements.forEach((e, index) => {
    if (!e.label.trim()) out.push({ kind: "noLabel", index });
    if (e.type === "solutionSet" && !elements.some((d) => d.type === "line")) out.push({ kind: "noLine", label: e.label });
    if (isLineType(e.type) && e.correct && e.correct.points.length === 1) out.push({ kind: "incomplete", label: e.label });
    if (e.type === "points" && e.equation && !parseEquation(e.equation)) out.push({ kind: "equation", label: e.label });
    if (e.correct?.points.some((p) => !insideGrid(p, { ...s.grid, allowEdge: true }))) out.push({ kind: "outside", label: e.label });
  });
  return out;
};

/** The elements as data-elements: only what differs from the defaults of a type. */
export const serializeElements = (elements: ElementDef[]) =>
  JSON.stringify(elements.map((e) => {
    const out: Record<string, unknown> = { id: e.id, type: e.type, label: e.label, color: e.color };
    if (e.type === "points") {
      out.max = e.max;
      if (e.connect) out.connect = true;
      if (e.equation) {
        out.equation = e.equation;
        out.minPoints = e.minPoints;
      }
    }
    if (isLineType(e.type)) {
      if (e.dashed) out.dashed = true;
      if (e.styleToggle) out.styleToggle = true;
    }
    if (e.score !== 1) out.score = e.score;
    if (e.correct) {
      const { dashed, ...rest } = e.correct;
      // the style of the correct line only counts when the candidate chooses it
      out.correct = e.styleToggle && dashed !== undefined ? { ...rest, dashed } : rest;
      if (e.type !== "solutionSet") delete (out.correct as Record<string, unknown>).regions;
    }
    return out;
  }));
