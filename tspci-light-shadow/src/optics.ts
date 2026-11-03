// Light and shadow: the scene (a screen, one or two lamps, one object), where the candidate may move things, and the
// exact shadow on the screen. No imports: `npm test` runs it in node.
//
// Coordinates, in cm: x is the distance to the screen (the screen is the plane x = 0, the lamps are farthest away),
// y the height above the floor, z sideways (0 is the middle of the bench and the screen, positive towards the viewer).
//
// The shadow is computed, not rendered with shadow maps. A lamp is a point, or a round lamp of diameter `size` that
// faces the screen. The side view (x, y) gives the heights, the top view (x, z) the widths: in each view a source
// point casts the object's outline onto the screen along the tangent rays, which gives an interval. Per lamp, the
// interval of every point of the lamp together is the whole shadow (outer edges from the lamp's opposite edges), and
// what every point shares is that lamp's umbra. Over all lamps: the umbra (no light at all) is what every interval
// shares; the penumbra is what is in some shadow but not in the umbra.

export type Range = [number, number];
export type ObjectType = "ball" | "block" | "figure";
export type Axis = "x" | "y" | "z";

export type Lamp = {
  /** distance to the screen, height and sideways position of the centre of the lamp */
  x: number; y: number; z: number;
  /** 0: a point source; otherwise the diameter of the round lamp (cm) */
  size: number;
  /** the axes the candidate may move this lamp along, with their range */
  move: Partial<Record<Axis, Range>>;
};

export type SceneObject = {
  type: ObjectType;
  /** distance from the centre of the object to the screen */
  x: number;
  /** height of the bottom above the floor (the object stands on a thin rod) */
  elevation: number;
  /** a ball: width = height = depth = the diameter; a figure is flat (no depth) */
  width: number; height: number; depth: number;
  /** the range the candidate may move the object along x in; null: fixed */
  move: Range | null;
};

export const FIELDS = [
  "shadowHeight", "shadowWidth", "umbraHeight", "umbraWidth", "penumbraHeight", "penumbraWidth", "magnification",
  "lamp1Distance", "lamp1Height", "lamp1Side", "lamp2Distance", "lamp2Height", "lamp2Side", "objectDistance",
] as const;
export type Field = (typeof FIELDS)[number];

export type Target = { field: Field; value: number; margin: number; points: number };
export type Positions = { lamps: { x: number; y: number; z: number }[]; objectX: number };

export type Scene = {
  screen: { width: number; height: number };
  lamps: Lamp[];
  object: SceneObject;
  /** the step every movable value snaps to (cm) */
  step: number;
  targets: Target[];
  /** the author's answer: positions that meet the targets */
  solution: Positions | null;
};

export const MAX_TARGETS = 4;
/** Closest a lamp may come to the object's far side (cm). */
export const GAP = 2;
export const LIMITS = { distance: [5, 1000] as Range, height: [0, 400] as Range, side: [-300, 300] as Range, size: [0, 60] as Range, object: [1, 200] as Range };

export const DEFAULT_SCENE: Scene = {
  screen: { width: 240, height: 180 },
  lamps: [{ x: 300, y: 90, z: 0, size: 0, move: { x: [120, 400] } }],
  object: { type: "figure", x: 100, elevation: 70, width: 20, height: 40, depth: 0, move: null },
  step: 5,
  targets: [{ field: "magnification", value: 2, margin: 0.05, points: 1 }],
  solution: { lamps: [{ x: 200, y: 90, z: 0 }], objectX: 100 },
};

// ---------------------------------------------------------------- parsing

const num = (value: unknown, fallback: number, [lo, hi]: Range = [-Infinity, Infinity]): number => {
  const n = typeof value === "string" ? Number(value.trim().replace(",", ".")) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

const range = (value: unknown, limits: Range): Range | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const a = num(value[0], NaN, limits), b = num(value[1], NaN, limits);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [Math.min(a, b), Math.max(a, b)];
};

/** Half the depth of the object: how far it reaches towards the lamps from its centre. */
export const halfDepth = (o: SceneObject) => (o.type === "figure" ? 0 : o.depth / 2);

/** data-scene (JSON, written by the authoring mode) → a scene; empty or unreadable: the example. */
export const parseScene = (text: unknown): Scene => {
  let raw: any = text;
  if (typeof text === "string") {
    if (!text.trim()) return clone(DEFAULT_SCENE);
    try {
      raw = JSON.parse(text);
    } catch {
      return clone(DEFAULT_SCENE);
    }
  }
  if (!raw || typeof raw !== "object") return clone(DEFAULT_SCENE);
  const d = DEFAULT_SCENE;
  const o = raw.object ?? {};
  const type: ObjectType = ["ball", "block", "figure"].includes(o.type) ? o.type : d.object.type;
  const width = num(o.width ?? o.diameter, d.object.width, LIMITS.object);
  const object: SceneObject = {
    type,
    x: num(o.x, d.object.x, LIMITS.distance),
    elevation: num(o.elevation, 0, LIMITS.height),
    width,
    height: type === "ball" ? width : num(o.height, d.object.height, LIMITS.object),
    depth: type === "ball" ? width : type === "figure" ? 0 : num(o.depth, width, LIMITS.object),
    move: range(o.move, LIMITS.distance),
  };
  const lampsRaw: any[] = Array.isArray(raw.lamps) && raw.lamps.length ? raw.lamps.slice(0, 2) : d.lamps;
  const lamps: Lamp[] = lampsRaw.map((l: any) => {
    const move: Lamp["move"] = {};
    const m = l?.move ?? {};
    const mx = range(m.x, LIMITS.distance), my = range(m.y, LIMITS.height), mz = range(m.z, LIMITS.side);
    if (mx) move.x = mx;
    if (my) move.y = my;
    if (mz) move.z = mz;
    return {
      x: num(l?.x, 300, LIMITS.distance),
      y: num(l?.y, 90, LIMITS.height),
      z: num(l?.z, 0, LIMITS.side),
      size: num(l?.size, 0, LIMITS.size),
      move,
    };
  });
  const targets: Target[] = (Array.isArray(raw.targets) ? raw.targets : [])
    .filter((t: any) => FIELDS.includes(t?.field))
    .slice(0, MAX_TARGETS)
    .map((t: any) => ({ field: t.field, value: num(t.value, 0), margin: num(t.margin, 0, [0, Infinity]), points: Math.round(num(t.points, 1, [0, 100])) }));
  const scene: Scene = {
    screen: { width: num(raw.screen?.width, d.screen.width, [20, 600]), height: num(raw.screen?.height, d.screen.height, [20, 400]) },
    lamps,
    object,
    step: num(raw.step, d.step, [0.1, 100]),
    targets,
    solution: null,
  };
  scene.solution = raw.solution ? ownPositions(scene, raw.solution) : null;
  return scene;
};

export const serializeScene = (scene: Scene): string => JSON.stringify(scene);

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------- positions

export const startPositions = (scene: Scene): Positions => ({
  lamps: scene.lamps.map(({ x, y, z }) => ({ x, y, z })),
  objectX: scene.object.x,
});

const snap = (value: number, [lo]: Range, step: number) => (step > 0 ? lo + Math.round((value - lo) / step) * step : value);
const round = (value: number, decimals = 2) => Math.round(value * 10 ** decimals) / 10 ** decimals;

/** The range the candidate can move a lamp in along an axis now: its own range, and not into the object. */
export const lampRange = (scene: Scene, positions: Positions, index: number, axis: Axis): Range | null => {
  const r = scene.lamps[index]?.move[axis];
  if (!r) return null;
  if (axis !== "x") return r;
  const nearest = positions.objectX + halfDepth(scene.object) + GAP;
  return [Math.max(r[0], nearest), r[1]];
};

/** The range the candidate can move the object in now: its own range, and not into a lamp. */
export const objectRange = (scene: Scene, positions: Positions): Range | null => {
  const r = scene.object.move;
  if (!r) return null;
  const farthest = Math.min(...positions.lamps.map((l) => l.x)) - halfDepth(scene.object) - GAP;
  return [r[0], Math.min(r[1], farthest)];
};

/** Snapped to the grid of the author's range (base), kept in what is possible now ([lo, hi]). */
const clampTo = (value: number, base: number, [lo, hi]: Range, step: number) => {
  let v = snap(Math.min(hi, Math.max(lo, value)), [base, hi], step);
  // snapping can step over the edge: go one step back in
  if (v > hi + 1e-9) v -= step;
  if (v < lo - 1e-9) v += step;
  return round(Math.min(hi, Math.max(lo, v)), 4);
};

/** A lamp moved along an axis, snapped and kept in its range; positions as they were when it cannot move. */
export const moveLamp = (scene: Scene, positions: Positions, index: number, axis: Axis, value: number): Positions => {
  const r = lampRange(scene, positions, index, axis);
  if (!r || !Number.isFinite(value) || r[0] > r[1]) return positions;
  const lamps = positions.lamps.map((l, i) => (i === index ? { ...l, [axis]: clampTo(value, scene.lamps[index].move[axis]![0], r, scene.step) } : l));
  return { ...positions, lamps };
};

export const moveObject = (scene: Scene, positions: Positions, value: number): Positions => {
  const r = objectRange(scene, positions);
  if (!r || !Number.isFinite(value) || r[0] > r[1]) return positions;
  return { ...positions, objectX: clampTo(value, scene.object.move![0], r, scene.step) };
};

/**
 * Positions from a state, a response or the author's solution, made to fit the scene: what cannot move stays where the
 * scene has it, what can move is kept in its range (not snapped: an author's solution may be between steps).
 */
export const ownPositions = (scene: Scene, value: any): Positions => {
  const start = startPositions(scene);
  const objectX = scene.object.move ? num(value?.objectX, start.objectX, scene.object.move) : start.objectX;
  const lamps = start.lamps.map((l, i) => {
    const given = Array.isArray(value?.lamps) ? value.lamps[i] : undefined;
    const move = scene.lamps[i].move;
    const axis = (a: Axis) => (move[a] ? num(given?.[a], l[a], move[a]) : l[a]);
    return { x: axis("x"), y: axis("y"), z: axis("z") };
  });
  return { lamps, objectX };
};

export const samePositions = (a: Positions, b: Positions) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- geometry

export type View = "side" | "top";
/** An interval on the screen, in cm (height in the side view, sideways position in the top view). */
export type Interval = [number, number];
/** The shadow of one source point: the interval on the screen and where its two edge rays touch the object. */
export type PointShadow = { source: [number, number]; interval: Interval; touch: [[number, number], [number, number]] };

/** The points of a lamp in a view: the centre of a point lamp, the two edges of a round lamp. */
export const sourcePoints = (lamp: { x: number; y: number; z: number }, size: number, view: View): [number, number][] => {
  const v = view === "side" ? lamp.y : lamp.z;
  return size > 0 ? [[lamp.x, v - size / 2], [lamp.x, v + size / 2]] : [[lamp.x, v]];
};

/** The outline of the object in a view: a circle, or the corners of a rectangle or a line. */
export type Profile = { kind: "circle"; centre: [number, number]; r: number } | { kind: "polygon"; points: [number, number][] };

export const profileOf = (o: SceneObject, objectX: number, view: View): Profile => {
  const [vLo, vHi] = view === "side" ? [o.elevation, o.elevation + o.height] : [-o.width / 2, o.width / 2];
  if (o.type === "ball") return { kind: "circle", centre: [objectX, (vLo + vHi) / 2], r: o.width / 2 };
  const h = halfDepth(o);
  if (h === 0) return { kind: "polygon", points: [[objectX, vLo], [objectX, vHi]] };
  return { kind: "polygon", points: [[objectX - h, vLo], [objectX + h, vLo], [objectX + h, vHi], [objectX - h, vHi]] };
};

/**
 * The shadow on the screen (x = 0) of a profile from one source point farther from the screen than the object: the
 * two tangent rays and where they meet the screen. null when the source is inside or in front of the object.
 */
export const pointShadow = (source: [number, number], profile: Profile): PointShadow | null => {
  const [sx, sv] = source;
  if (profile.kind === "circle") {
    const [cx, cv] = profile.centre;
    const dx = sx - cx, dv = cv - sv;
    const d = Math.hypot(dx, dv);
    if (dx <= profile.r || d <= profile.r) return null;
    const phi = Math.atan2(dv, dx), alpha = Math.asin(profile.r / d);
    const t = Math.sqrt(d * d - profile.r * profile.r); // distance from the source to the touching points
    const ends = [phi - alpha, phi + alpha].map((a) => {
      const hit = sv + sx * Math.tan(a);
      const touch: [number, number] = [sx - t * Math.cos(a), sv + t * Math.sin(a)];
      return { hit, touch };
    });
    return { source, interval: [ends[0].hit, ends[1].hit], touch: [ends[0].touch, ends[1].touch] };
  }
  let lo: { hit: number; p: [number, number] } | null = null, hi: typeof lo = null;
  for (const p of profile.points) {
    if (p[0] >= sx) return null;
    const hit = sv + (sx * (p[1] - sv)) / (sx - p[0]);
    if (!lo || hit < lo.hit) lo = { hit, p };
    if (!hi || hit > hi.hit) hi = { hit, p };
  }
  return lo && hi ? { source, interval: [lo.hit, hi.hit], touch: [lo.p, hi.p] } : null;
};

const intersect = (intervals: Interval[]): Interval | null => {
  if (!intervals.length) return null;
  const lo = Math.max(...intervals.map((i) => i[0])), hi = Math.min(...intervals.map((i) => i[1]));
  return hi > lo ? [lo, hi] : null;
};
const hull = (intervals: Interval[]): Interval => [Math.min(...intervals.map((i) => i[0])), Math.max(...intervals.map((i) => i[1]))];
/** The total length of a union of intervals. */
export const unionLength = (intervals: Interval[]): number => {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0, start = -Infinity, end = -Infinity;
  for (const [lo, hi] of sorted) {
    if (lo > end) {
      if (end > start) total += end - start;
      start = lo;
      end = hi;
    } else end = Math.max(end, hi);
  }
  if (end > start) total += end - start;
  return total;
};

export type LampShadow = { points: PointShadow[]; shadow: Interval; umbra: Interval | null };
export type ViewShadow = {
  lamps: LampShadow[];
  /** outer edge to outer edge of every shadow */
  shadow: Interval;
  /** no light from any lamp (in this view) */
  umbra: Interval | null;
  /** the length of what is in some shadow but not in the umbra */
  penumbra: number;
};

/** The shadow in one view; null when a lamp is not behind the object. */
export const viewShadow = (scene: Scene, positions: Positions, view: View): ViewShadow | null => {
  const profile = profileOf(scene.object, positions.objectX, view);
  const lamps: LampShadow[] = [];
  for (let i = 0; i < scene.lamps.length; i++) {
    const points: PointShadow[] = [];
    for (const s of sourcePoints(positions.lamps[i], scene.lamps[i].size, view)) {
      const p = pointShadow(s, profile);
      if (!p) return null;
      points.push(p);
    }
    const intervals = points.map((p) => p.interval);
    lamps.push({ points, shadow: hull(intervals), umbra: intersect(intervals) });
  }
  const all = lamps.flatMap((l) => l.points.map((p) => p.interval));
  const umbra = intersect(all);
  const penumbra = unionLength(lamps.map((l) => l.shadow)) - (umbra ? umbra[1] - umbra[0] : 0);
  return { lamps, shadow: hull(lamps.map((l) => l.shadow)), umbra, penumbra };
};

export type Measures = {
  side: ViewShadow; top: ViewShadow;
  /** the values of the response, rounded: cm to 0.1, the magnification to 0.01 */
  values: Record<Field, number | null>;
};

/**
 * Everything the candidate can measure. Heights from the side view, widths from the top view. Without an umbra in one
 * view there is none anywhere (no point of the screen lies in both shadows), so both umbra values are 0 then and
 * the whole shadow is penumbra. The magnification is the height of the whole shadow over the height of the object.
 */
export const measure = (scene: Scene, positions: Positions): Measures | null => {
  const side = viewShadow(scene, positions, "side");
  const top = viewShadow(scene, positions, "top");
  if (!side || !top) return null;
  const length = (i: Interval | null) => (i ? i[1] - i[0] : 0);
  const both = !!side.umbra && !!top.umbra;
  const sidePenumbra = both ? side.penumbra : unionLength(side.lamps.map((l) => l.shadow));
  const topPenumbra = both ? top.penumbra : unionLength(top.lamps.map((l) => l.shadow));
  const cm = (v: number) => round(v, 1);
  const lamp = (i: number, a: Axis) => (positions.lamps[i] ? cm(positions.lamps[i][a]) : null);
  const values: Record<Field, number | null> = {
    shadowHeight: cm(length(side.shadow)),
    shadowWidth: cm(length(top.shadow)),
    umbraHeight: both ? cm(length(side.umbra)) : 0,
    umbraWidth: both ? cm(length(top.umbra)) : 0,
    penumbraHeight: cm(sidePenumbra),
    penumbraWidth: cm(topPenumbra),
    magnification: round(length(side.shadow) / scene.object.height, 2),
    lamp1Distance: lamp(0, "x"), lamp1Height: lamp(0, "y"), lamp1Side: lamp(0, "z"),
    lamp2Distance: lamp(1, "x"), lamp2Height: lamp(1, "y"), lamp2Side: lamp(1, "z"),
    objectDistance: cm(positions.objectX),
  };
  return { side, top, values };
};

// ---------------------------------------------------------------- the targets

export type Evaluation = { results: { target: Target; value: number | null; passed: boolean }[]; score: number; maxscore: number; correct: boolean };

export const passes = (target: Target, value: number | null) => value !== null && Math.abs(value - target.value) <= target.margin + 1e-9;

export const evaluate = (scene: Scene, positions: Positions): Evaluation => {
  const m = measure(scene, positions);
  const results = scene.targets.map((target) => {
    const value = m ? m.values[target.field] : null;
    return { target, value, passed: passes(target, value) };
  });
  const score = results.reduce((s, r) => s + (r.passed ? r.target.points : 0), 0);
  const maxscore = results.reduce((s, r) => s + r.target.points, 0);
  return { results, score, maxscore, correct: results.length > 0 && results.every((r) => r.passed) };
};

/** The fields a response has for this scene: lamp 2 only with two lamps. */
export const fieldsOf = (scene: Scene): Field[] => FIELDS.filter((f) => scene.lamps.length > 1 || !f.startsWith("lamp2"));

// ---------------------------------------------------------------- the 3D shadow on the screen

/** The outline of the cut-out figure, x from −0.5 to 0.5 (width), y from 0 to 1 (height). */
export const FIGURE: [number, number][] = [
  [-0.22, 0], [-0.06, 0], [0, 0.36], [0.06, 0], [0.22, 0], [0.14, 0.44], [0.16, 0.6], [0.44, 0.46], [0.5, 0.52], [0.2, 0.74],
  [0.1, 0.78], [0.13, 0.82], [0.16, 0.9], [0.12, 0.97], [0, 1], [-0.12, 0.97], [-0.16, 0.9], [-0.13, 0.82], [-0.1, 0.78],
  [-0.2, 0.74], [-0.5, 0.52], [-0.44, 0.46], [-0.16, 0.6], [-0.14, 0.44],
];

const insidePolygon = (px: number, py: number, polygon: [number, number][]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Points of a round lamp facing the screen, for the 3D picture: the centre and rings ("count" about 7 or 19). */
export const lampSamples = (size: number, rings: number): [number, number][] => {
  if (size <= 0) return [[0, 0]];
  const out: [number, number][] = [[0, 0]];
  for (let r = 1; r <= rings; r++) {
    const radius = (size / 2) * (r / rings);
    const n = 6 * r;
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * (k + (r % 2) * 0.5)) / n;
      out.push([radius * Math.cos(a), radius * Math.sin(a)]);
    }
  }
  return out;
};

/** Whether the object blocks the straight line from a source point (sx, sy, sz) to the point (0, y, z) of the screen. */
export const blocks = (o: SceneObject, objectX: number, sx: number, sy: number, sz: number, y: number, z: number): boolean => {
  if (o.type === "ball") {
    const r = o.width / 2, cy = o.elevation + r;
    // |s + t (p − s) − c|² = r², t in (0, 1)
    const dx = -sx, dy = y - sy, dz = z - sz;
    const fx = sx - objectX, fy = sy - cy, fz = sz;
    const a = dx * dx + dy * dy + dz * dz, b = 2 * (fx * dx + fy * dy + fz * dz), c = fx * fx + fy * fy + fz * fz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t > 0 && t < 1;
  }
  const h = halfDepth(o);
  if (o.type === "figure" || h === 0) {
    const t = (sx - objectX) / sx; // where the line crosses the plane of the figure
    if (t <= 0 || t >= 1) return false;
    const py = sy + t * (y - sy), pz = sz + t * (z - sz);
    const u = pz / o.width, v = (py - o.elevation) / o.height;
    if (u < -0.5 || u > 0.5 || v < 0 || v > 1) return false;
    return o.type === "figure" ? insidePolygon(u, v, FIGURE) : true;
  }
  // a block: the slabs of the box
  let t0 = 0, t1 = 1;
  const slab = (s: number, d: number, lo: number, hi: number) => {
    if (Math.abs(d) < 1e-12) return s >= lo && s <= hi;
    let a = (lo - s) / d, b = (hi - s) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    return t0 <= t1;
  };
  return (
    slab(sx, -sx, objectX - h, objectX + h) &&
    slab(sy, y - sy, o.elevation, o.elevation + o.height) &&
    slab(sz, z - sz, -o.width / 2, o.width / 2)
  );
};

/**
 * The light on the screen, cell by cell, from 0 (no light) to 1 (every lamp shines fully): `columns` × `rows` values,
 * row 0 at the top of the screen, column 0 at z = −width/2 (away from the viewer).
 * Only the cells inside the shadows' bounds are traced; the rest is fully lit.
 */
export const lightMap = (scene: Scene, positions: Positions, columns: number, rows: number, rings = 2): Float32Array => {
  const light = new Float32Array(columns * rows).fill(1);
  const m = measure(scene, positions);
  if (!m) return light;
  const { width, height } = scene.screen;
  const samples = scene.lamps.map((l, i) => lampSamples(l.size, rings).map(([dy, dz]) => [positions.lamps[i].x, positions.lamps[i].y + dy, positions.lamps[i].z + dz]));
  const [yLo, yHi] = m.side.shadow, [zLo, zHi] = m.top.shadow;
  const share = 1 / scene.lamps.length;
  for (let r = 0; r < rows; r++) {
    const y = height * (1 - (r + 0.5) / rows);
    if (y < yLo || y > yHi) continue;
    for (let c = 0; c < columns; c++) {
      const z = -width / 2 + (width * (c + 0.5)) / columns;
      if (z < zLo || z > zHi) continue;
      let lit = 0;
      for (const points of samples) {
        let open = 0;
        for (const [sx, sy, sz] of points) if (!blocks(scene.object, positions.objectX, sx, sy, sz, y, z)) open++;
        lit += (open / points.length) * share;
      }
      light[r * columns + c] = lit;
    }
  }
  return light;
};

// ---------------------------------------------------------------- authoring checks

/** What keeps the scene from working, as codes with a value; the texts make sentences of them. */
export type Problem =
  | { code: "lampInObject"; lamp: number }
  | { code: "nothingMoves" }
  | { code: "noTargets" }
  | { code: "noSolution" }
  | { code: "solutionFails"; target: number }
  | { code: "startOutsideRange"; what: "object" | "lamp"; lamp?: number };

export const sceneProblems = (scene: Scene, mode: string): Problem[] => {
  const problems: Problem[] = [];
  const o = scene.object;
  const objectFar = (o.move ? o.move[1] : o.x) + halfDepth(o) + GAP;
  scene.lamps.forEach((l, i) => {
    const nearest = l.move.x ? l.move.x[0] : l.x;
    if (nearest < objectFar - 1e-9) problems.push({ code: "lampInObject", lamp: i + 1 });
    for (const a of ["x", "y", "z"] as Axis[]) {
      const r = l.move[a];
      if (r && (l[a] < r[0] - 1e-9 || l[a] > r[1] + 1e-9)) {
        problems.push({ code: "startOutsideRange", what: "lamp", lamp: i + 1 });
        break;
      }
    }
  });
  if (o.move && (o.x < o.move[0] - 1e-9 || o.x > o.move[1] + 1e-9)) problems.push({ code: "startOutsideRange", what: "object" });
  const moves = !!o.move || scene.lamps.some((l) => Object.keys(l.move).length > 0);
  if (!moves) problems.push({ code: "nothingMoves" });
  if (mode !== "tool") {
    if (!scene.targets.length) problems.push({ code: "noTargets" });
    else if (!scene.solution) problems.push({ code: "noSolution" });
    else evaluate(scene, scene.solution).results.forEach((r, i) => !r.passed && problems.push({ code: "solutionFails", target: i + 1 }));
  }
  return problems;
};

// ---------------------------------------------------------------- response processing for the item

/**
 * QTI response processing that scores the targets with the margins in the item itself (qti-equal with an absolute
 * tolerance on a field of the record), as an alternative to taking the PCI's score field. SCORE and MAXSCORE are the
 * item's outcomes.
 */
export const responseProcessing = (scene: Scene, identifier = "RESPONSE"): string => {
  const max = scene.targets.reduce((s, t) => s + t.points, 0);
  const field = (name: string) => `<qti-field-value field-identifier="${name}"><qti-variable identifier="${identifier}"/></qti-field-value>`;
  const rules = scene.targets.map((t, i) => [
    `  <!-- target ${i + 1}: ${t.field} = ${t.value} ± ${t.margin} -->`,
    `  <qti-response-condition>`,
    `    <qti-response-if>`,
    `      <qti-equal tolerance-mode="absolute" tolerance="${t.margin} ${t.margin}">`,
    `        ${field(t.field)}`,
    `        <qti-base-value base-type="float">${t.value}</qti-base-value>`,
    `      </qti-equal>`,
    `      <qti-set-outcome-value identifier="SCORE">`,
    `        <qti-sum><qti-variable identifier="SCORE"/><qti-base-value base-type="float">${t.points}</qti-base-value></qti-sum>`,
    `      </qti-set-outcome-value>`,
    `    </qti-response-if>`,
    `  </qti-response-condition>`,
  ].join("\n"));
  return [
    `<qti-outcome-declaration identifier="SCORE" cardinality="single" base-type="float">`,
    `  <qti-default-value><qti-value>0</qti-value></qti-default-value>`,
    `</qti-outcome-declaration>`,
    `<qti-outcome-declaration identifier="MAXSCORE" cardinality="single" base-type="float">`,
    `  <qti-default-value><qti-value>${max}</qti-value></qti-default-value>`,
    `</qti-outcome-declaration>`,
    `<qti-response-processing>`,
    ...rules,
    `</qti-response-processing>`,
  ].join("\n");
};
