// The terrain (no imports: tested in node with npm test): a heightfield made of a base height, a tilt, Gaussian hills
// and hollows, ridges and valleys along lines, and small bumps from a seed (the same seed gives the same terrain).
// Coordinates are metres: x to the east (0 … width), y to the north (0 … depth); heights in metres.

export type Point = { x: number; y: number };
/** A hill (h > 0) or a hollow (h < 0): h at the top, about 13% of h at distance r. */
export type Hill = { x: number; y: number; h: number; r: number };
/** A ridge (h > 0) or a valley (h < 0) along a polyline, w wide (about 13% of h at w/2 … w from the line). */
export type Ridge = { points: [number, number][]; h: number; w: number };

export type Terrain = {
  width: number;
  depth: number;
  base: number;
  /** metres up per kilometre to the east and to the north */
  tiltX: number;
  tiltY: number;
  seed: number;
  /** how many small bumps the seed adds */
  bumps: number;
  hills: Hill[];
  ridges: Ridge[];
};

export const DEFAULT_TERRAIN: Terrain = {
  width: 2000,
  depth: 1500,
  base: 90,
  tiltX: -30,
  tiltY: 12,
  seed: 7,
  bumps: 6,
  hills: [
    { x: 560, y: 1060, h: 135, r: 460 },
    { x: 1460, y: 1130, h: 95, r: 400 },
    { x: 1700, y: 760, h: 40, r: 240 },
  ],
  ridges: [
    { points: [[560, 1060], [1460, 1130]], h: 35, w: 300 },
    { points: [[0, 330], [620, 520], [1180, 440], [2000, 190]], h: -28, w: 260 },
  ],
};

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** A terrain from data-terrain (JSON); empty or not JSON: the example. A field that is missing is flat (no tilt, no hills). */
export const parseTerrain = (text: unknown): Terrain => {
  let raw: any = null;
  if (typeof text === "string" && text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      raw = null;
    }
  } else if (text && typeof text === "object") raw = text;
  if (!raw || typeof raw !== "object") return structuredCopy(DEFAULT_TERRAIN);
  const d = DEFAULT_TERRAIN;
  const width = clampNumber(raw.width, 100, 100000, d.width);
  const depth = clampNumber(raw.depth, 100, 100000, d.depth);
  const hills: Hill[] = Array.isArray(raw.hills)
    ? raw.hills
        .map((h: any) => ({ x: Number(h?.x), y: Number(h?.y), h: Number(h?.h), r: Number(h?.r) }))
        .filter((h: Hill) => [h.x, h.y, h.h, h.r].every(Number.isFinite) && h.r > 0)
    : [];
  const ridges: Ridge[] = Array.isArray(raw.ridges)
    ? raw.ridges
        .map((r: any) => ({
          points: Array.isArray(r?.points) ? r.points.map((p: any) => [Number(p?.[0]), Number(p?.[1])] as [number, number]).filter((p: number[]) => p.every(Number.isFinite)) : [],
          h: Number(r?.h),
          w: Number(r?.w),
        }))
        .filter((r: Ridge) => r.points.length >= 2 && Number.isFinite(r.h) && Number.isFinite(r.w) && r.w > 0)
    : [];
  return {
    width,
    depth,
    base: clampNumber(raw.base, -1000, 9000, d.base),
    tiltX: clampNumber(raw.tiltX, -500, 500, 0),
    tiltY: clampNumber(raw.tiltY, -500, 500, 0),
    seed: Math.round(clampNumber(raw.seed, 0, 1e9, 1)),
    bumps: Math.round(clampNumber(raw.bumps, 0, 40, 0)),
    hills,
    ridges,
  };
};

const structuredCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const round = (n: number, decimals = 0) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

export const serializeTerrain = (t: Terrain) =>
  JSON.stringify({
    width: round(t.width), depth: round(t.depth), base: round(t.base, 1), tiltX: round(t.tiltX, 2), tiltY: round(t.tiltY, 2),
    seed: t.seed, bumps: t.bumps,
    hills: t.hills.map((h) => ({ x: round(h.x), y: round(h.y), h: round(h.h, 1), r: round(h.r) })),
    ridges: t.ridges.map((r) => ({ points: r.points.map(([x, y]) => [round(x), round(y)]), h: round(r.h, 1), w: round(r.w) })),
  });

/** A small, fast pseudo random generator (mulberry32): the same seed, the same numbers. */
export const random = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** The bumps of the seed: small hills and hollows anywhere on the map. */
export const bumpsOf = (t: Terrain): Hill[] => {
  const next = random(t.seed * 7919 + 17);
  const size = Math.min(t.width, t.depth);
  return Array.from({ length: t.bumps }, () => ({
    x: next() * t.width,
    y: next() * t.depth,
    h: -6 + next() * 18,
    r: size * (0.06 + next() * 0.1),
  }));
};

const distanceToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2)) : 0;
  const cx = ax + t * dx - px, cy = ay + t * dy - py;
  return Math.sqrt(cx * cx + cy * cy);
};

/** The distance from a point to a polyline. */
export const distanceToPath = (p: Point, path: Point[]) => {
  if (!path.length) return Infinity;
  if (path.length === 1) return Math.hypot(p.x - path[0].x, p.y - path[0].y);
  let best = Infinity;
  for (let i = 1; i < path.length; i++) best = Math.min(best, distanceToSegment(p.x, p.y, path[i - 1].x, path[i - 1].y, path[i].x, path[i].y));
  return best;
};

/** A function for the height at a point: the terrain with its bumps worked out once. */
export const heightFunction = (t: Terrain) => {
  const hills = [...t.hills, ...bumpsOf(t)].map((h) => ({ ...h, k: 1 / (2 * (h.r / 2) ** 2) }));
  const ridges = t.ridges.map((r) => ({ ...r, k: 1 / (2 * (r.w / 2) ** 2) }));
  return (x: number, y: number) => {
    let h = t.base + (t.tiltX * x) / 1000 + (t.tiltY * y) / 1000;
    for (const hill of hills) {
      const dx = x - hill.x, dy = y - hill.y;
      h += hill.h * Math.exp(-(dx * dx + dy * dy) * hill.k);
    }
    for (const r of ridges) {
      let d = Infinity;
      for (let i = 1; i < r.points.length; i++) d = Math.min(d, distanceToSegment(x, y, r.points[i - 1][0], r.points[i - 1][1], r.points[i][0], r.points[i][1]));
      h += r.h * Math.exp(-d * d * r.k);
    }
    return h;
  };
};

export type HeightAt = (x: number, y: number) => number;

/** The heights on a grid of columns × rows points, from the south-west corner; values[row * columns + column]. */
export type Grid = { columns: number; rows: number; width: number; depth: number; values: Float64Array; min: number; max: number };

export const sampleGrid = (t: Terrain, height: HeightAt, columns = 101): Grid => {
  const rows = Math.max(2, Math.round(((columns - 1) * t.depth) / t.width) + 1);
  const values = new Float64Array(columns * rows);
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const v = height((i / (columns - 1)) * t.width, (j / (rows - 1)) * t.depth);
      values[j * columns + i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return { columns, rows, width: t.width, depth: t.depth, values, min, max };
};

/** The height between the grid points, linear in both directions (as the contour lines are drawn). */
export const gridHeight = (g: Grid, x: number, y: number) => {
  const fx = Math.max(0, Math.min(g.columns - 1, (x / g.width) * (g.columns - 1)));
  const fy = Math.max(0, Math.min(g.rows - 1, (y / g.depth) * (g.rows - 1)));
  const i = Math.min(g.columns - 2, Math.floor(fx)), j = Math.min(g.rows - 2, Math.floor(fy));
  const u = fx - i, v = fy - j;
  const at = (a: number, b: number) => g.values[b * g.columns + a];
  return (1 - v) * ((1 - u) * at(i, j) + u * at(i + 1, j)) + v * ((1 - u) * at(i, j + 1) + u * at(i + 1, j + 1));
};

/** The contour levels: every multiple of the interval between the lowest and the highest point. */
export const levelsOf = (min: number, max: number, interval: number) => {
  if (!(interval > 0)) return [];
  const levels: number[] = [];
  for (let l = Math.ceil(min / interval) * interval; l <= max && levels.length < 400; l += interval) levels.push(round(l, 6));
  return levels;
};

export type Contour = { level: number; points: Point[]; closed: boolean };

/**
 * The contour lines at a level, by marching squares on the grid: a segment per cell the level crosses, joined into
 * lines through the edges they share. A saddle cell is split by the height in its middle.
 */
export const contoursAt = (g: Grid, level: number): Contour[] => {
  const { columns, rows, values } = g;
  const dx = g.width / (columns - 1), dy = g.depth / (rows - 1);
  const v = (i: number, j: number) => values[j * columns + i];
  // an edge crossing: its key and its point
  const points = new Map<string, Point>();
  const crossing = (i1: number, j1: number, i2: number, j2: number): string => {
    const key = i1 === i2 ? `v${i1},${Math.min(j1, j2)}` : `h${Math.min(i1, i2)},${j1}`;
    if (!points.has(key)) {
      const a = v(i1, j1), b = v(i2, j2);
      const t = a === b ? 0.5 : (level - a) / (b - a);
      points.set(key, { x: (i1 + t * (i2 - i1)) * dx, y: (j1 + t * (j2 - j1)) * dy });
    }
    return key;
  };
  const links = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (a === b) return;
    (links.get(a) ?? links.set(a, []).get(a)!).push(b);
    (links.get(b) ?? links.set(b, []).get(b)!).push(a);
  };
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < columns - 1; i++) {
      // corners counter-clockwise from the south-west: 0 (i,j) 1 (i+1,j) 2 (i+1,j+1) 3 (i,j+1)
      const c = [v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1)];
      const above = c.map((h) => h >= level);
      const index = (above[0] ? 1 : 0) | (above[1] ? 2 : 0) | (above[2] ? 4 : 0) | (above[3] ? 8 : 0);
      if (index === 0 || index === 15) continue;
      const S = () => crossing(i, j, i + 1, j);
      const E = () => crossing(i + 1, j, i + 1, j + 1);
      const N = () => crossing(i, j + 1, i + 1, j + 1);
      const W = () => crossing(i, j, i, j + 1);
      switch (index) {
        case 1: case 14: link(W(), S()); break;
        case 2: case 13: link(S(), E()); break;
        case 3: case 12: link(W(), E()); break;
        case 4: case 11: link(E(), N()); break;
        case 6: case 9: link(S(), N()); break;
        case 7: case 8: link(W(), N()); break;
        case 5: case 10: {
          const middle = (c[0] + c[1] + c[2] + c[3]) / 4 >= level;
          // 5: south-west and north-east above
          if ((index === 5) === middle) { link(W(), N()); link(S(), E()); }
          else { link(W(), S()); link(E(), N()); }
          break;
        }
      }
    }
  }
  const used = new Set<string>();
  const lines: Contour[] = [];
  const walk = (start: string) => {
    const chain = [start];
    used.add(start);
    let current = start;
    for (;;) {
      const next = (links.get(current) ?? []).find((k) => !used.has(k));
      if (!next) break;
      used.add(next);
      chain.push(next);
      current = next;
    }
    return chain;
  };
  // open lines start at an end (a key with one link: the edge of the map); then the closed loops
  for (const [key, to] of links) if (to.length === 1 && !used.has(key)) lines.push({ level, points: walk(key).map((k) => points.get(k)!), closed: false });
  for (const key of links.keys()) {
    if (used.has(key)) continue;
    const chain = walk(key);
    const pts = chain.map((k) => points.get(k)!);
    pts.push(pts[0]);
    lines.push({ level, points: pts, closed: true });
  }
  return lines;
};

export const allContours = (g: Grid, interval: number): Contour[] => levelsOf(g.min, g.max, interval).flatMap((l) => contoursAt(g, l));

export const pathLength = (path: Point[]) => {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return length;
};

/** The point at a distance along a polyline, with the direction there (radians). */
export const pointAlong = (path: Point[], distance: number): { point: Point; angle: number } => {
  let left = distance;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= l || i === path.length - 1) {
      const t = l ? Math.max(0, Math.min(1, left / l)) : 0;
      return { point: { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    left -= l;
  }
  return { point: path[0] ?? { x: 0, y: 0 }, angle: 0 };
};

/** Points along a polyline every `spacing` metres (with both ends). */
export const resample = (path: Point[], spacing: number): Point[] => {
  if (path.length < 2) return path.slice();
  const length = pathLength(path);
  const n = Math.max(1, Math.ceil(length / spacing));
  return Array.from({ length: n + 1 }, (_, i) => pointAlong(path, (i / n) * length).point);
};

/** The heights at `samples` points evenly from A to B (A and B included). */
export const profile = (height: HeightAt, a: Point, b: Point, samples: number) =>
  Array.from({ length: samples }, (_, i) => {
    const t = samples > 1 ? i / (samples - 1) : 0;
    return height(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y));
  });

export const gradient = (height: HeightAt, x: number, y: number, step = 1) => ({
  x: (height(x + step, y) - height(x - step, y)) / (2 * step),
  y: (height(x, y + step) - height(x, y - step)) / (2 * step),
});

/** The slope at a point: metres up per metre along the steepest direction. */
export const slopeAt = (height: HeightAt, x: number, y: number) => {
  const g = gradient(height, x, y);
  return Math.hypot(g.x, g.y);
};

export type Region = { x: number; y: number; r: number };

const inside = (t: Terrain, x: number, y: number) => x >= 0 && y >= 0 && x <= t.width && y <= t.depth;
const inRegion = (region: Region | undefined, x: number, y: number) => !region || Math.hypot(x - region.x, y - region.y) <= region.r;

/**
 * The point where a value of the terrain is largest (in a region, or on the whole map): first on a fine grid, then
 * refined around the best grid point.
 */
const searchMax = (t: Terrain, value: (x: number, y: number) => number, region?: Region): Point => {
  const n = 160;
  const step = Math.max(t.width, t.depth) / n;
  let best = { x: region ? region.x : t.width / 2, y: region ? region.y : t.depth / 2 };
  let bestValue = -Infinity;
  for (let y = 0; y <= t.depth + 1e-9; y += step) {
    for (let x = 0; x <= t.width + 1e-9; x += step) {
      if (!inRegion(region, x, y)) continue;
      const v = value(x, y);
      if (v > bestValue) { bestValue = v; best = { x, y }; }
    }
  }
  // refine: a smaller and smaller search around the best point
  for (let s = step / 2; s > 0.25; s /= 2) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const [ox, oy] of [[s, 0], [-s, 0], [0, s], [0, -s], [s, s], [s, -s], [-s, s], [-s, -s]]) {
        const x = best.x + ox, y = best.y + oy;
        if (!inside(t, x, y) || !inRegion(region, x, y)) continue;
        const v = value(x, y);
        if (v > bestValue + 1e-9) { bestValue = v; best = { x, y }; moved = true; }
      }
    }
  }
  return best;
};

export const highestPoint = (t: Terrain, height: HeightAt, region?: Region) => searchMax(t, height, region);
export const lowestPoint = (t: Terrain, height: HeightAt, region?: Region) => searchMax(t, (x, y) => -height(x, y), region);
export const steepestPoint = (t: Terrain, height: HeightAt, region?: Region) => searchMax(t, (x, y) => slopeAt(height, x, y), region);

/**
 * Where water from a source flows: down the steepest slope, in small steps, until it reaches the edge of the map or a
 * hollow (where it does not go down any more).
 */
export const descentPath = (t: Terrain, height: HeightAt, source: Point): Point[] => {
  const step = Math.min(t.width, t.depth) / 500;
  const path: Point[] = [{ ...source }];
  let p = { ...source };
  let h = height(p.x, p.y);
  for (let i = 0; i < 6000; i++) {
    const g = gradient(height, p.x, p.y, step / 4);
    const length = Math.hypot(g.x, g.y);
    if (length < 1e-6) break;
    let next = { x: p.x - (step * g.x) / length, y: p.y - (step * g.y) / length };
    let nh = height(next.x, next.y);
    if (nh >= h) {
      // a hollow, or the bottom of a valley that zigzags: a smaller step, else stop
      const half = { x: p.x - (step * g.x) / length / 4, y: p.y - (step * g.y) / length / 4 };
      const hh = height(half.x, half.y);
      if (hh >= h - 1e-7) break;
      next = half;
      nh = hh;
    }
    if (!inside(t, next.x, next.y)) {
      // to the edge of the map
      const tx = next.x < 0 ? p.x / (p.x - next.x) : next.x > t.width ? (t.width - p.x) / (next.x - p.x) : 1;
      const ty = next.y < 0 ? p.y / (p.y - next.y) : next.y > t.depth ? (t.depth - p.y) / (next.y - p.y) : 1;
      const f = Math.max(0, Math.min(1, tx, ty));
      path.push({ x: p.x + f * (next.x - p.x), y: p.y + f * (next.y - p.y) });
      return simplify(path, step * 5);
    }
    p = next;
    h = nh;
    path.push(p);
  }
  return simplify(path, step * 5);
};

/** Fewer points: one every `spacing` metres or more, with the last point kept. */
const simplify = (path: Point[], spacing: number): Point[] => {
  const out: Point[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const last = out[out.length - 1];
    if (Math.hypot(path[i].x - last.x, path[i].y - last.y) >= spacing) out.push(path[i]);
  }
  if (path.length > 1) out.push(path[path.length - 1]);
  return out;
};

/**
 * How far apart two paths are: the mean distance from the points of each (every `spacing` metres) to the other path,
 * the larger of the two. A path that stops halfway or goes on past the end is far from the other on that part.
 */
export const pathDistance = (a: Point[], b: Point[], spacing: number) => {
  if (a.length < 2 || b.length < 2) return Infinity;
  const mean = (from: Point[], to: Point[]) => {
    const pts = resample(from, spacing);
    return pts.reduce((sum, p) => sum + distanceToPath(p, to), 0) / pts.length;
  };
  return Math.max(mean(a, b), mean(b, a));
};

/** The hypsometric tints: light green low, through yellow, to dark brown high; the lightness falls all the way. */
export const TINTS = ["#e3f1dc", "#cbe5bd", "#dfe3a8", "#ecd898", "#e4bf80", "#d3a26c", "#bb845a", "#9c684a", "#7d513e", "#5f3d33"];

export type Band = { from: number; to: number; color: string };

/**
 * The colour bands of a map, from below the lowest to above the highest point: each a whole number of contour
 * intervals wide, at most one per tint.
 */
export const bandsOf = (min: number, max: number, interval: number): Band[] => {
  if (!(interval > 0) || !(max >= min)) return [{ from: min, to: max, color: TINTS[0] }];
  // a band is one or more contour intervals, so that there are at most as many bands as tints
  const steps = Math.max(1, Math.ceil((max - Math.floor(min / interval) * interval) / interval));
  const band = interval * Math.ceil(steps / TINTS.length);
  const low = Math.floor(min / band) * band;
  const count = Math.max(1, Math.ceil((max - low) / band));
  return Array.from({ length: count }, (_, i) => ({
    from: round(low + i * band, 6),
    to: round(low + (i + 1) * band, 6),
    color: TINTS[count <= 1 ? 0 : Math.round((i * (TINTS.length - 1)) / Math.max(count - 1, TINTS.length - 1))],
  }));
};

export const bandColor = (bands: Band[], h: number) => (bands.find((b) => h < b.to) ?? bands[bands.length - 1]).color;

// --- the tasks: what the candidate does on the map, the correct answers and the scoring

export type TaskType = "profile" | "point" | "height" | "river";
/** What the candidate clicks in a point task. */
export type PointTarget = "highest" | "lowest" | "steepest" | "region" | "flowEnd";
export const TASK_TYPES: TaskType[] = ["profile", "point", "height", "river"];
export const POINT_TARGETS: PointTarget[] = ["highest", "lowest", "steepest", "region", "flowEnd"];
export const MAX_TASKS = 6;

export type Mark = Point & { label: string };

export type Task = {
  type: TaskType;
  /** the instruction; empty: the standard one for the type, in the candidate's language */
  text?: string;
  /** what the task is worth */
  points: number;
  /** profile and height: metres up or down; point and river: metres on the map */
  margin: number;
  /** profile: the line A–B; without it the candidate draws the line */
  a?: Point;
  b?: Point;
  /** profile: the number of points of the profile, evenly from A to B */
  samples?: number;
  /** profile and height: how many points must lie within the margin (default all) */
  minCorrect?: number;
  /** point: what to click; highest, lowest and steepest search in the region when there is one */
  target?: PointTarget;
  region?: Region;
  /** point (region): the name of the region on the map */
  regionLabel?: string;
  /** river and point (flowEnd): where the water starts */
  source?: Point;
  /** height: the marked points */
  marks?: Mark[];
};

/** What the candidate did in a task (only the fields of its type). */
export type Answer = {
  a?: Point | null;
  b?: Point | null;
  heights?: (number | null)[];
  p?: Point | null;
  values?: (number | null)[];
  path?: Point[];
};

export const DEFAULT_TASKS: Task[] = [
  { type: "profile", a: { x: 150, y: 1000 }, b: { x: 1850, y: 1180 }, samples: 9, margin: 15, points: 1 },
  { type: "point", target: "highest", margin: 60, points: 1 },
  { type: "river", source: { x: 1330, y: 900 }, margin: 50, points: 1 },
];

const pointOf = (raw: any): Point | undefined => {
  const x = Number(raw?.x), y = Number(raw?.y);
  return raw && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
};

const positive = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** The tasks from data-tasks (JSON, a list); empty or not JSON: the example. At most MAX_TASKS. */
export const parseTasks = (text: unknown): Task[] => {
  let raw: any = null;
  if (typeof text === "string" && text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      raw = null;
    }
  } else if (Array.isArray(text)) raw = text;
  if (raw && !Array.isArray(raw) && Array.isArray(raw.tasks)) raw = raw.tasks;
  if (!Array.isArray(raw)) return structuredCopy(DEFAULT_TASKS);
  return raw
    .filter((t: any) => TASK_TYPES.includes(t?.type))
    .slice(0, MAX_TASKS)
    .map((t: any): Task => {
      const task: Task = { type: t.type, points: positive(t.points, 1), margin: positive(t.margin, t.type === "point" || t.type === "river" ? 50 : 10) };
      if (typeof t.text === "string" && t.text.trim()) task.text = t.text;
      if (t.type === "profile") {
        const a = pointOf(t.a), b = pointOf(t.b);
        if (a && b) { task.a = a; task.b = b; }
        task.samples = Math.round(Math.min(21, Math.max(3, positive(t.samples, 9))));
      }
      if (t.type === "point") {
        task.target = POINT_TARGETS.includes(t.target) ? t.target : "highest";
        const region = pointOf(t.region);
        if (region && Number(t.region.r) > 0) task.region = { ...region, r: Number(t.region.r) };
        if (typeof t.regionLabel === "string" && t.regionLabel.trim()) task.regionLabel = t.regionLabel.trim();
      }
      if (t.type === "river" || (t.type === "point" && task.target === "flowEnd")) {
        task.source = pointOf(t.source) ?? { x: 0, y: 0 };
      }
      if (t.type === "height") {
        task.marks = (Array.isArray(t.marks) ? t.marks : [])
          .map((m: any, i: number) => {
            const p = pointOf(m);
            return p ? { ...p, label: typeof m.label === "string" && m.label.trim() ? m.label.trim() : `P${i + 1}` } : null;
          })
          .filter(Boolean)
          .slice(0, 8);
      }
      if ((t.type === "profile" || t.type === "height") && t.minCorrect !== undefined && Number.isFinite(Number(t.minCorrect))) {
        task.minCorrect = Math.max(0, Math.round(Number(t.minCorrect)));
      }
      return task;
    });
};

export const serializeTasks = (tasks: Task[]) =>
  JSON.stringify(
    tasks.map((t) => {
      const p = (q?: Point) => (q ? { x: round(q.x), y: round(q.y) } : undefined);
      return {
        type: t.type,
        text: t.text || undefined,
        points: t.points,
        margin: round(t.margin, 1),
        a: p(t.a),
        b: p(t.b),
        samples: t.type === "profile" ? t.samples : undefined,
        minCorrect: t.minCorrect,
        target: t.target,
        region: t.region ? { x: round(t.region.x), y: round(t.region.y), r: round(t.region.r) } : undefined,
        regionLabel: t.regionLabel,
        source: p(t.source),
        marks: t.marks?.map((m) => ({ x: round(m.x), y: round(m.y), label: m.label })),
      };
    })
  );

/** The model of a map: the terrain with its height function, worked out once. */
export type Model = { terrain: Terrain; height: HeightAt };
export const modelOf = (terrain: Terrain): Model => ({ terrain, height: heightFunction(terrain) });

/** The line of a profile task when the author gave none (the correct answer in review): west to east, halfway. */
export const suggestedLine = (t: Terrain) => ({ a: { x: t.width * 0.1, y: t.depth / 2 }, b: { x: t.width * 0.9, y: t.depth / 2 } });

/** The shortest line the candidate may draw for a profile: a quarter of the map's shorter side. */
export const minLineLength = (t: Terrain) => Math.min(t.width, t.depth) / 4;

/** The line of a profile task: the author's, or the candidate's once A and B are both there. */
export const lineOf = (task: Task, answer?: Answer): { a: Point; b: Point } | null =>
  task.a && task.b ? { a: task.a, b: task.b } : answer?.a && answer?.b ? { a: answer.a, b: answer.b } : null;

/** The point a point task asks for (for a region: its middle). */
export const targetOf = (m: Model, task: Task): Point => {
  const { terrain: t, height } = m;
  switch (task.target ?? "highest") {
    case "lowest": return lowestPoint(t, height, task.region);
    case "steepest": return steepestPoint(t, height, task.region);
    case "region": return task.region ? { x: task.region.x, y: task.region.y } : { x: t.width / 2, y: t.depth / 2 };
    case "flowEnd": {
      const path = descentPath(t, height, task.source ?? { x: 0, y: 0 });
      return path[path.length - 1];
    }
    default: return highestPoint(t, height, task.region);
  }
};

/** The correct answer of a task, as the candidate would give it. */
export const correctAnswer = (m: Model, task: Task): Answer => {
  const r = (p: Point) => ({ x: round(p.x), y: round(p.y) });
  switch (task.type) {
    case "profile": {
      const line = lineOf(task) ?? suggestedLine(m.terrain);
      const heights = profile(m.height, line.a, line.b, task.samples ?? 9).map((h) => round(h, 1));
      return task.a && task.b ? { heights } : { a: r(line.a), b: r(line.b), heights };
    }
    case "point": return { p: r(targetOf(m, task)) };
    case "height": return { values: (task.marks ?? []).map((p) => round(m.height(p.x, p.y), 1)) };
    case "river": return { path: descentPath(m.terrain, m.height, task.source ?? { x: 0, y: 0 }).map(r) };
  }
};

export type TaskResult = {
  /** the points earned */
  points: number;
  max: number;
  passed: boolean;
  /** the candidate did something in this task */
  answered: boolean;
  /** profile: points within the margin; point: metres to the target; height: the first value; river: metres apart */
  number: number | null;
  /** what the candidate did, as text in no language ("-": not given) */
  value: string;
  /** profile and height: per point, within the margin */
  within?: boolean[];
  /** profile with a line the candidate draws: the line is long enough */
  lineOk?: boolean;
};

const coords = (p: Point) => `${round(p.x)} ${round(p.y)}`;
const numbers = (list: (number | null | undefined)[]) => list.map((v) => (v === null || v === undefined ? "-" : String(round(v, 1)))).join(" ");

export const evaluateTask = (m: Model, task: Task, answer: Answer = {}): TaskResult => {
  const max = task.points;
  const done = (passed: boolean, rest: Omit<TaskResult, "points" | "max" | "passed">): TaskResult => ({ points: passed ? max : 0, max, passed, ...rest });
  switch (task.type) {
    case "profile": {
      const samples = task.samples ?? 9;
      const line = lineOf(task, answer);
      const heights = Array.from({ length: samples }, (_, i) => answer.heights?.[i] ?? null);
      const truth = line ? profile(m.height, line.a, line.b, samples) : null;
      const within = heights.map((h, i) => h !== null && !!truth && Math.abs(h - truth[i]) <= task.margin + 1e-9);
      const count = within.filter(Boolean).length;
      const lineOk = !!line && (!!(task.a && task.b) || Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y) >= minLineLength(m.terrain));
      const free = !(task.a && task.b);
      const value = (free ? `A ${answer.a ? coords(answer.a) : "-"} B ${answer.b ? coords(answer.b) : "-"}: ` : "") + numbers(heights);
      const needed = Math.min(samples, task.minCorrect ?? samples);
      return done(lineOk && count >= needed, {
        answered: heights.some((h) => h !== null) || (free && !!(answer.a || answer.b)),
        number: count,
        value,
        within,
        lineOk,
      });
    }
    case "point": {
      if (!answer.p) return done(false, { answered: false, number: null, value: "-" });
      const target = targetOf(m, task);
      const distance = Math.hypot(answer.p.x - target.x, answer.p.y - target.y);
      const passed = task.target === "region" && task.region ? distance <= task.region.r + 1e-9 : distance <= task.margin + 1e-9;
      return done(passed, { answered: true, number: round(distance, 1), value: coords(answer.p) });
    }
    case "height": {
      const marks = task.marks ?? [];
      const values = marks.map((_, i) => answer.values?.[i] ?? null);
      const within = values.map((v, i) => v !== null && Math.abs(v - m.height(marks[i].x, marks[i].y)) <= task.margin + 1e-9);
      const needed = Math.min(marks.length, task.minCorrect ?? marks.length);
      return done(marks.length > 0 && within.filter(Boolean).length >= needed, {
        answered: values.some((v) => v !== null),
        number: values[0] ?? null,
        value: numbers(values),
        within,
      });
    }
    case "river": {
      const path = answer.path ?? [];
      if (path.length < 2) return done(false, { answered: path.length > 0, number: null, value: path.length ? path.map(coords).join(", ") : "-" });
      const truth = descentPath(m.terrain, m.height, task.source ?? path[0]);
      const distance = pathDistance(path, truth, Math.max(5, task.margin / 4));
      return done(distance <= task.margin + 1e-9, { answered: true, number: round(distance, 1), value: path.map(coords).join(", ") });
    }
  }
};

export type Evaluation = { score: number; maxscore: number; correct: boolean; results: TaskResult[] };

export const evaluate = (m: Model, tasks: Task[], answers: Answer[]): Evaluation => {
  const results = tasks.map((t, i) => evaluateTask(m, t, answers[i] ?? {}));
  return {
    score: results.reduce((s, r) => s + r.points, 0),
    maxscore: results.reduce((s, r) => s + r.max, 0),
    correct: results.length > 0 && results.every((r) => r.passed),
    results,
  };
};

/** The answers in the form of the state and the response: rounded, only the fields of each task's type. */
export const cleanAnswers = (tasks: Task[], answers: unknown): Answer[] => {
  const list = Array.isArray(answers) ? answers : [];
  const pt = (p: any) => {
    const q = pointOf(p);
    return q ? { x: round(q.x), y: round(q.y) } : null;
  };
  const num = (v: any) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : round(Number(v), 1));
  return tasks.map((task, i) => {
    const a: any = list[i] ?? {};
    switch (task.type) {
      case "profile": {
        const out: Answer = { heights: Array.from({ length: task.samples ?? 9 }, (_, j) => num(a.heights?.[j])) };
        if (!(task.a && task.b)) { out.a = pt(a.a); out.b = pt(a.b); }
        return out;
      }
      case "point": return { p: pt(a.p) };
      case "height": return { values: (task.marks ?? []).map((_, j) => num(a.values?.[j])) };
      case "river": return { path: (Array.isArray(a.path) ? a.path : []).map(pt).filter(Boolean).slice(0, 400) };
    }
  });
};

/** The candidate did nothing yet. */
export const isEmpty = (answers: Answer[]) =>
  answers.every((a) => !a || (!a.a && !a.b && !a.p && !(a.path?.length) && !a.heights?.some((h) => h !== null && h !== undefined) && !a.values?.some((v) => v !== null && v !== undefined)));

/** The response, as the fields of a QTI record (name, base type, value); see the README. */
export type Field = { name: string; integer?: number; float?: number; string?: string };

export const responseFields = (m: Model, tasks: Task[], answers: Answer[]): Field[] => {
  const e = evaluate(m, tasks, answers);
  const fields: Field[] = [
    { name: "score", integer: e.score },
    { name: "maxscore", integer: e.maxscore },
    { name: "correct", integer: e.correct ? 1 : 0 },
  ];
  e.results.forEach((r, i) => {
    fields.push({ name: `task${i + 1}`, integer: r.points });
    if (r.number !== null) fields.push({ name: `task${i + 1}number`, float: r.number });
    fields.push({ name: `task${i + 1}value`, string: r.value });
  });
  fields.push({ name: "answers", string: JSON.stringify(cleanAnswers(tasks, answers)) });
  return fields;
};

// --- numbers in the candidate's language

export const formatNumber = (n: number, decimals: number, language: string) => {
  const text = (Math.round(n * 10 ** decimals) / 10 ** decimals).toFixed(decimals);
  const clean = text === "-0" || /^-0[.,]0+$/.test(text) ? text.slice(1) : text;
  return language === "nl" ? clean.replace(".", ",") : clean;
};

/** A number as the candidate types it: a comma or a point for the decimals, a space between thousands. */
export const parseNumber = (text: string): number | null => {
  const t = text.trim().replace(/\s/g, "").replace("−", "-").replace(",", ".");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
