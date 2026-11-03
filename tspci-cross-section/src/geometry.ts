// The solids, the plane and the cross-section, without imports (tested in node: npm test).
//
// Coordinates in cm, y up: every solid stands on the ground (y = 0), centred on the y axis. The plane is n·x = c with a
// unit normal n that points up (n.y ≥ 0); the candidate sets it as three numbers:
//   tilt   the angle between the plane and the ground, 0° (horizontal) to 90° (vertical),
//   turn   the compass direction the plane leans towards, 0° to 360°,
//   offset how far the plane lies from the centre of the solid, along the normal, in cm.
// For polyhedra the section is plane ∩ edges (exact up to floating point); for a cylinder, cone and sphere the boundary
// is found analytically per ray (the solids are convex), with the corners where it meets the base or top added exactly.

export type Vec = [number, number, number];
export type Pt = [number, number];

export type SolidType = "cube" | "box" | "prism" | "pyramid" | "cylinder" | "cone" | "sphere";
export const SOLID_TYPES: SolidType[] = ["cube", "box", "prism", "pyramid", "cylinder", "cone", "sphere"];
export const ROUND: SolidType[] = ["cylinder", "cone", "sphere"];

/** A solid as the author describes it; the dimensions in cm (README: which number is what). */
export type SolidSpec = { type: SolidType; dims: number[]; baseSides: number };

/** The names of the dimensions per solid, in the order of SolidSpec.dims. */
export const DIMENSIONS: Record<SolidType, string[]> = {
  cube: ["edge"],
  box: ["length", "width", "height"],
  prism: ["side", "height"],
  pyramid: ["side", "height"],
  cylinder: ["radius", "height"],
  cone: ["radius", "height"],
  sphere: ["radius"],
};
export const DEFAULT_DIMS: Record<SolidType, number[]> = {
  cube: [6], box: [8, 4, 6], prism: [6, 8], pyramid: [6, 6], cylinder: [3, 8], cone: [4, 8], sphere: [4],
};

export type PlaneParams = { offset: number; tilt: number; turn: number };
export type Plane = { n: Vec; c: number };

export type Model = {
  spec: SolidSpec;
  /** the polyhedron (empty for the round solids) */
  vertices: Vec[];
  faces: number[][];
  edges: [number, number][];
  labels: string[];
  /** the centre the offset counts from, and the radius of a sphere around it that holds the solid */
  center: Vec;
  radius: number;
  height: number;
};

// --- vectors

export const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec) => Math.sqrt(dot(a, a));
export const normalize = (a: Vec): Vec => {
  const l = length(a);
  return l > 0 ? scale(a, 1 / l) : [0, 0, 0];
};
export const lerp = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const dist2 = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// --- solids

const LETTERS = "ABCDEFGHIJKLMNOPQRSUVWXYZ"; // no T: T is the top of a pyramid

/** A clean solid: known type, positive dimensions (defaults where missing), 3 to 8 sides for a prism or pyramid. */
export const cleanSpec = (spec: Partial<SolidSpec>): SolidSpec => {
  const type: SolidType = SOLID_TYPES.includes(spec.type as SolidType) ? (spec.type as SolidType) : "cube";
  const want = DEFAULT_DIMS[type];
  const given = (spec.dims ?? []).filter((d) => typeof d === "number" && isFinite(d) && d > 0);
  const dims = want.map((d, i) => Math.min(100, given[i] ?? d));
  const n = Math.round(Number(spec.baseSides));
  const baseSides = type === "cube" || type === "box" ? 4 : isFinite(n) && n >= 3 && n <= 8 ? n : type === "prism" ? 3 : 4;
  return { type, dims, baseSides };
};

/** The base of a prism or pyramid: a regular polygon with its first side in front (z > 0), from left to right. */
const regularBase = (n: number, side: number, y: number): Vec[] => {
  const R = side / (2 * Math.sin(Math.PI / n));
  return Array.from({ length: n }, (_, k) => {
    const a = Math.PI / 2 + Math.PI / n - (2 * Math.PI * k) / n;
    return [R * Math.cos(a), y, R * Math.sin(a)] as Vec;
  });
};

/** Faces turned outward (counter-clockwise seen from outside), for the 3D view. */
const outward = (vertices: Vec[], faces: number[][]): number[][] => {
  const inside = scale(vertices.reduce(add, [0, 0, 0] as Vec), 1 / vertices.length);
  return faces.map((f) => {
    const nrm = cross(sub(vertices[f[1]], vertices[f[0]]), sub(vertices[f[2]], vertices[f[0]]));
    const mid = scale(f.map((i) => vertices[i]).reduce(add, [0, 0, 0] as Vec), 1 / f.length);
    return dot(nrm, sub(mid, inside)) < 0 ? [...f].reverse() : f;
  });
};

const edgesOf = (faces: number[][]): [number, number][] => {
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  for (const f of faces)
    f.forEach((a, i) => {
      const b = f[(i + 1) % f.length];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push(a < b ? [a, b] : [b, a]);
      }
    });
  return edges;
};

export const buildModel = (input: Partial<SolidSpec>): Model => {
  const spec = cleanSpec(input);
  const [a, b, c] = spec.dims;
  let vertices: Vec[] = [];
  let faces: number[][] = [];
  let labels: string[] = [];
  let height = 0;
  if (spec.type === "cube" || spec.type === "box" || spec.type === "prism") {
    let base: Vec[];
    if (spec.type === "prism") {
      height = b;
      base = regularBase(spec.baseSides, a, 0);
    } else {
      const [l, w, h] = spec.type === "cube" ? [a, a, a] : [a, b, c];
      height = h;
      base = [[-l / 2, 0, w / 2], [l / 2, 0, w / 2], [l / 2, 0, -w / 2], [-l / 2, 0, -w / 2]];
    }
    const n = base.length;
    vertices = [...base, ...base.map((v) => [v[0], height, v[2]] as Vec)];
    faces = [base.map((_, i) => i), base.map((_, i) => n + i)];
    for (let k = 0; k < n; k++) faces.push([k, (k + 1) % n, n + ((k + 1) % n), n + k]);
    labels = vertices.map((_, i) => LETTERS[i]);
  } else if (spec.type === "pyramid") {
    height = b;
    const base = regularBase(spec.baseSides, a, 0);
    const n = base.length;
    vertices = [...base, [0, height, 0]];
    faces = [base.map((_, i) => i)];
    for (let k = 0; k < n; k++) faces.push([k, (k + 1) % n, n]);
    labels = [...base.map((_, i) => LETTERS[i]), "T"];
  } else {
    height = spec.type === "sphere" ? 2 * a : b;
  }
  if (faces.length) faces = outward(vertices, faces);
  const center: Vec = [0, height / 2, 0];
  let radius: number;
  if (vertices.length) radius = Math.max(...vertices.map((v) => length(sub(v, center))));
  else radius = spec.type === "sphere" ? a : Math.hypot(a, height / 2);
  return { spec, vertices, faces, edges: edgesOf(faces), labels, center, radius, height };
};

export const isRound = (m: Model) => ROUND.includes(m.spec.type);

// --- the plane

export const normalOf = (tilt: number, turn: number): Vec => {
  const t = rad(tilt), f = rad(turn);
  return [Math.sin(t) * Math.cos(f), Math.cos(t), Math.sin(t) * Math.sin(f)];
};

export const planeOf = (m: Model, p: PlaneParams): Plane => {
  const n = normalOf(p.tilt, p.turn);
  return { n, c: dot(n, m.center) + p.offset };
};

/** The in-plane axes of the 2D view: U horizontal, V up the slope (or away from the viewer when the plane is flat). */
export const planeAxes = (p: PlaneParams): { U: Vec; V: Vec } => {
  const t = rad(p.tilt), f = rad(p.turn);
  const h: Vec = [Math.cos(f), 0, Math.sin(f)];
  const U: Vec = [Math.sin(f), 0, -Math.cos(f)]; // U × V = n: seen from above the plane, U right and V up
  const V: Vec = add(scale(h, -Math.cos(t)), [0, Math.sin(t), 0]);
  return { U, V };
};

const norm360 = (a: number) => ((a % 360) + 360) % 360;
const round = (x: number, d = 1e6) => Math.round(x * d) / d;

/** The plane through a point with a normal, as offset, tilt and turn (the turn kept when the plane is flat). */
export const paramsOf = (m: Model, normal: Vec, point: Vec, previousTurn = 0): PlaneParams => {
  let n = normalize(normal);
  if (n[1] < 0 || (Math.abs(n[1]) < 1e-12 && (n[0] < -1e-12 || (Math.abs(n[0]) < 1e-12 && n[2] < 0)))) n = scale(n, -1);
  const tilt = deg(Math.acos(Math.max(-1, Math.min(1, n[1]))));
  const turn = tilt < 1e-9 ? previousTurn : norm360(deg(Math.atan2(n[2], n[0])));
  return { offset: round(dot(n, point) - dot(n, m.center)), tilt: round(tilt), turn: round(norm360(turn)) };
};

/** A point on an edge: the edge's index and the distance in cm from its first vertex. */
export type EdgePoint = { edge: number; at: number };

export const edgeLength = (m: Model, edge: number) => {
  const e = m.edges[edge];
  return e ? length(sub(m.vertices[e[1]], m.vertices[e[0]])) : 0;
};

export const pointOnEdge = (m: Model, p: EdgePoint): Vec | null => {
  const e = m.edges[p.edge];
  if (!e) return null;
  const len = edgeLength(m, p.edge);
  return lerp(m.vertices[e[0]], m.vertices[e[1]], len > 0 ? Math.max(0, Math.min(1, p.at / len)) : 0);
};

/** The plane through three points on edges, or null when they lie on one line (or two are the same). */
export const planeThrough = (m: Model, points: EdgePoint[], previousTurn = 0): PlaneParams | null => {
  const ps = points.map((p) => pointOnEdge(m, p));
  if (ps.length !== 3 || ps.some((p) => !p)) return null;
  const [a, b, c] = ps as Vec[];
  const n = cross(sub(b, a), sub(c, a));
  if (length(n) < 1e-9 * m.radius * m.radius) return null;
  return paramsOf(m, n, a, previousTurn);
};

/** The name of an edge by its vertices ("AB"). */
export const edgeName = (m: Model, edge: number) => {
  const e = m.edges[edge];
  return e ? `${m.labels[e[0]]}${m.labels[e[1]]}` : "";
};

/** The edges sorted as a textbook lists them: AB, BC, …, then the rest by name. */
export const edgeOrder = (m: Model): number[] =>
  m.edges.map((_, i) => i).sort((x, y) => edgeName(m, x).localeCompare(edgeName(m, y)));

// --- the cross-section

export type ShapeCode =
  | "none"
  | "triangle" | "equilateralTriangle" | "isoscelesTriangle" | "rightTriangle" | "rightIsoscelesTriangle"
  | "quadrilateral" | "trapezium" | "isoscelesTrapezium" | "kite" | "parallelogram" | "rhombus" | "rectangle" | "square"
  | "pentagon" | "regularPentagon" | "hexagon" | "regularHexagon" | "heptagon" | "regularHeptagon"
  | "octagon" | "regularOctagon" | "polygon"
  | "circle" | "ellipse" | "ellipseSegment" | "parabolaSegment" | "hyperbolaSegment" | "curved";

/** The shapes an author can ask for, from general to specific. */
export const TARGET_SHAPES: ShapeCode[] = [
  "triangle", "equilateralTriangle", "isoscelesTriangle", "rightTriangle",
  "quadrilateral", "trapezium", "isoscelesTrapezium", "kite", "parallelogram", "rhombus", "rectangle", "square",
  "pentagon", "regularPentagon", "hexagon", "regularHexagon", "heptagon", "octagon",
  "circle", "ellipse", "ellipseSegment", "parabolaSegment", "hyperbolaSegment",
];

export type Section = {
  shape: ShapeCode;
  /** every name that fits, from specific to general: a square is also a rectangle, a rhombus, …, a quadrilateral */
  kinds: ShapeCode[];
  /** the number of straight sides (0 for a circle or ellipse) */
  sides: number;
  /** a curved part in the boundary */
  curved: boolean;
  /** the boundary in 3D and in the plane (U, V), counter-clockwise; dense along curves */
  points3d: Vec[];
  points2d: Pt[];
  /** the corners: indices into points2d (all of them for a polygon) */
  corners: number[];
  /** the straight sides as pairs of indices into points2d, in order, with their lengths */
  segments: { from: number; to: number; length: number }[];
  /** side lengths for a polygon; the diameter of a circle; the long and short axis of an ellipse; else the straight sides */
  measures: number[];
  /** for a circle or ellipse: its centre (2D) and half axes along U and V */
  conic?: { center: Pt; a: number; b: number };
  area: number;
  perimeter: number;
  /** the angles of a polygon at its corners, in degrees */
  angles: number[];
};

export const NO_SECTION: Section = {
  shape: "none", kinds: ["none"], sides: 0, curved: false, points3d: [], points2d: [], corners: [], segments: [], measures: [],
  area: 0, perimeter: 0, angles: [],
};

/** Convex hull (monotone chain), counter-clockwise, without points on a side. Returns indices. */
const hull = (pts: Pt[], eps: number): number[] => {
  const idx = pts.map((_, i) => i).sort((a, b) => pts[a][0] - pts[b][0] || pts[a][1] - pts[b][1]);
  if (idx.length < 3) return idx;
  const turn = (o: number, a: number, b: number) =>
    (pts[a][0] - pts[o][0]) * (pts[b][1] - pts[o][1]) - (pts[a][1] - pts[o][1]) * (pts[b][0] - pts[o][0]);
  const lower: number[] = [];
  for (const i of idx) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], i) <= eps) lower.pop();
    lower.push(i);
  }
  const upper: number[] = [];
  for (const i of [...idx].reverse()) {
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], i) <= eps) upper.pop();
    upper.push(i);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
};

const shoelace = (pts: Pt[]) => {
  let s = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    s += p[0] * q[1] - q[0] * p[1];
  });
  return s / 2;
};
const perimeterOf = (pts: Pt[]) => pts.reduce((s, p, i) => s + dist2(p, pts[(i + 1) % pts.length]), 0);

/** Tolerances for "equal", "right" and "parallel": a share of the longest side, and degrees. */
export type Tolerance = { length: number; angle: number };
export const DEFAULT_TOLERANCE: Tolerance = { length: 0.02, angle: 2 };

const NAMES5: Record<number, [ShapeCode, ShapeCode]> = {
  5: ["pentagon", "regularPentagon"], 6: ["hexagon", "regularHexagon"], 7: ["heptagon", "regularHeptagon"], 8: ["octagon", "regularOctagon"],
};

/** The name of a convex polygon (counter-clockwise corners), with every name that fits. */
export const classifyPolygon = (pts: Pt[], tol: Tolerance = DEFAULT_TOLERANCE): { shape: ShapeCode; kinds: ShapeCode[]; angles: number[] } => {
  const n = pts.length;
  const sides = pts.map((p, i) => dist2(p, pts[(i + 1) % n]));
  const dirs = pts.map((p, i) => Math.atan2(pts[(i + 1) % n][1] - p[1], pts[(i + 1) % n][0] - p[0]));
  const angles = pts.map((p, i) => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const u = [a[0] - p[0], a[1] - p[1]], v = [b[0] - p[0], b[1] - p[1]];
    return deg(Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]))))));
  });
  const longest = Math.max(...sides);
  const eq = (a: number, b: number) => Math.abs(a - b) <= tol.length * longest;
  const right = (a: number) => Math.abs(a - 90) <= tol.angle;
  const parallel = (i: number, j: number) => {
    const d = Math.abs(deg(dirs[i] - dirs[j])) % 180;
    return Math.min(d, 180 - d) <= tol.angle;
  };
  const allEqual = sides.every((s) => eq(s, sides[0]));
  if (n === 3) {
    const equilateral = allEqual;
    const isosceles = eq(sides[0], sides[1]) || eq(sides[1], sides[2]) || eq(sides[2], sides[0]);
    const rightAngled = angles.some(right);
    const kinds: ShapeCode[] = [];
    if (equilateral) kinds.push("equilateralTriangle");
    if (rightAngled && isosceles) kinds.push("rightIsoscelesTriangle");
    if (rightAngled) kinds.push("rightTriangle");
    if (isosceles) kinds.push("isoscelesTriangle");
    kinds.push("triangle", "polygon");
    return { shape: kinds[0], kinds, angles };
  }
  if (n === 4) {
    const p02 = parallel(0, 2), p13 = parallel(1, 3);
    const parallelogram = p02 && p13;
    const rectangle = parallelogram && angles.every(right);
    const rhombus = allEqual;
    const trapezium = p02 || p13;
    const diagonals = eq(dist2(pts[0], pts[2]), dist2(pts[1], pts[3]));
    const isoscelesTrapezium = trapezium && diagonals;
    const kite = (eq(sides[0], sides[1]) && eq(sides[2], sides[3])) || (eq(sides[1], sides[2]) && eq(sides[3], sides[0]));
    const kinds: ShapeCode[] = [];
    if (rectangle && rhombus) kinds.push("square");
    if (rectangle) kinds.push("rectangle");
    if (rhombus) kinds.push("rhombus");
    if (parallelogram) kinds.push("parallelogram");
    if (isoscelesTrapezium) kinds.push("isoscelesTrapezium");
    if (kite) kinds.push("kite");
    if (trapezium) kinds.push("trapezium");
    kinds.push("quadrilateral", "polygon");
    return { shape: kinds[0], kinds, angles };
  }
  const names = NAMES5[n];
  const regular = allEqual && angles.every((a) => Math.abs(a - (180 * (n - 2)) / n) <= tol.angle);
  const kinds: ShapeCode[] = [];
  if (names) {
    if (regular) kinds.push(names[1]);
    kinds.push(names[0]);
  }
  kinds.push("polygon");
  return { shape: kinds[0], kinds, angles };
};

/** A polygon section from its corners in 3D (any order: they are sorted around the centre). */
const polygonSection = (corners3d: Vec[], O: Vec, U: Vec, V: Vec, scaleLen: number, tol: Tolerance): Section => {
  const eps = 1e-9 * scaleLen;
  const unique: Vec[] = [];
  for (const p of corners3d) if (!unique.some((q) => length(sub(p, q)) < 1e-7 * scaleLen)) unique.push(p);
  if (unique.length < 3) return NO_SECTION;
  const pts2 = unique.map((p): Pt => [dot(sub(p, O), U), dot(sub(p, O), V)]);
  const order = hull(pts2, eps * scaleLen);
  if (order.length < 3) return NO_SECTION;
  const points2d = order.map((i) => pts2[i]);
  const points3d = order.map((i) => unique[i]);
  const area = shoelace(points2d);
  if (area < 1e-9 * scaleLen * scaleLen) return NO_SECTION;
  const segments = points2d.map((p, i) => ({ from: i, to: (i + 1) % points2d.length, length: dist2(p, points2d[(i + 1) % points2d.length]) }));
  const { shape, kinds, angles } = classifyPolygon(points2d, tol);
  return {
    shape, kinds, sides: points2d.length, curved: false, points3d, points2d, corners: points2d.map((_, i) => i), segments,
    measures: segments.map((s) => s.length), area, perimeter: perimeterOf(points2d), angles,
  };
};

/** Inside a round solid (with a little room for rounding). */
const insideRound = (m: Model, p: Vec, eps: number) => {
  const [r, h] = m.spec.dims;
  if (m.spec.type === "sphere") return length(sub(p, m.center)) <= r + eps;
  if (p[1] < -eps || p[1] > m.height + eps) return false;
  const rho = Math.hypot(p[0], p[2]);
  return m.spec.type === "cylinder" ? rho <= r + eps : rho <= r * (1 - p[1] / h) + eps;
};

/** The lateral surface as f(p) ≤ 0: x² + z² − ρ(y)². Exactly quadratic along any line. */
const lateral = (m: Model, p: Vec) => {
  const [r, h] = m.spec.dims;
  if (m.spec.type === "sphere") return dot(sub(p, m.center), sub(p, m.center)) - r * r;
  const rho = m.spec.type === "cylinder" ? r : r * (1 - p[1] / h);
  return p[0] * p[0] + p[2] * p[2] - rho * rho;
};

/** f(P + s·D) = A s² + B s + C, from three values. */
const quadraticAlong = (m: Model, P: Vec, D: Vec) => {
  const C = lateral(m, P);
  const f1 = lateral(m, add(P, D)), fm = lateral(m, sub(P, D));
  return { A: (f1 + fm) / 2 - C, B: (f1 - fm) / 2, C };
};
const roots = ({ A, B, C }: { A: number; B: number; C: number }): number[] => {
  if (Math.abs(A) < 1e-14) return Math.abs(B) < 1e-14 ? [] : [-C / B];
  const d = B * B - 4 * A * C;
  if (d < 0) return [];
  const s = Math.sqrt(d);
  return [(-B - s) / (2 * A), (-B + s) / (2 * A)].sort((x, y) => x - y);
};

const RAYS = 720;

/** The section of a cylinder, cone or sphere. */
const roundSection = (m: Model, plane: Plane, p: PlaneParams, tol: Tolerance): Section => {
  const { n, c } = plane;
  const { U, V } = planeAxes(p);
  const O = add(m.center, scale(n, c - dot(n, m.center)));
  const L = m.radius;
  const eps = 1e-9 * L;
  const [r, h] = m.spec.dims;
  const at = (u: number, v: number): Vec => add(O, add(scale(U, u), scale(V, v)));
  const to2 = (q: Vec): Pt => [dot(sub(q, O), U), dot(sub(q, O), V)];

  if (m.spec.type === "sphere") {
    const d = c - dot(n, m.center);
    if (Math.abs(d) >= r - eps) return NO_SECTION;
    const rho = Math.sqrt(r * r - d * d);
    return conicSection(O, U, V, [0, 0], rho, rho, "circle");
  }

  // a cylinder cut along its axis, or a cone through its top: straight sides only
  const capLine = (y: number) => {
    // the points of the plane at height y: v fixed (U is horizontal), u along the line
    if (Math.abs(V[1]) < 1e-12) return [] as Vec[];
    const v = (y - O[1]) / V[1];
    const P = at(0, v);
    return roots(quadraticAlong(m, P, U)).map((u) => add(P, scale(U, u)));
  };
  const apex: Vec = [0, h, 0];
  if (m.spec.type === "cylinder" && Math.abs(n[1]) < 1e-9) {
    const corners = [...capLine(0), ...capLine(h)];
    return corners.length === 4 ? polygonSection(corners, O, U, V, L, tol) : NO_SECTION;
  }
  if (m.spec.type === "cone" && Math.abs(dot(n, apex) - c) < 1e-9 * L) {
    const corners = [apex, ...capLine(0)];
    return corners.length === 3 ? polygonSection(corners, O, U, V, L, tol) : NO_SECTION;
  }

  // an inside point: the axis where the plane crosses it, or else the plane's point nearest the axis at mid height
  let Q: Vec | null = null;
  const candidates: Vec[] = [];
  if (Math.abs(n[1]) > 1e-9) candidates.push([0, c / n[1], 0]);
  for (const y of [0.5, 0.25, 0.1, 0.75, 0.02].map((k) => k * h)) {
    if (Math.abs(V[1]) < 1e-12) break;
    const v = (y - O[1]) / V[1];
    const P = at(0, v);
    const rs = roots(quadraticAlong(m, P, U));
    if (rs.length === 2 && rs[1] - rs[0] > eps) candidates.push(add(P, scale(U, (rs[0] + rs[1]) / 2)));
  }
  for (const cand of candidates) {
    const q = add(cand, scale(n, c - dot(n, cand)));
    if (insideRound(m, q, -1e-7 * L)) {
      Q = q;
      break;
    }
  }
  if (!Q) return NO_SECTION;

  const exit = (D: Vec) => {
    let t = Infinity;
    if (D[1] < -1e-15) t = Math.min(t, -Q[1] / D[1]);
    if (D[1] > 1e-15) t = Math.min(t, (h - Q[1]) / D[1]);
    for (const s of roots(quadraticAlong(m, Q, D))) if (s > 1e-12) {
      // the first root ahead where the lateral function turns positive
      const mid = lateral(m, add(Q, scale(D, s * (1 + 1e-9) + 1e-12)));
      if (mid >= 0) {
        t = Math.min(t, s);
        break;
      }
    }
    return t;
  };
  const q2 = to2(Q);
  type Sample = { angle: number; p: Vec; corner: boolean };
  const samples: Sample[] = [];
  for (let i = 0; i < RAYS; i++) {
    const a = (2 * Math.PI * i) / RAYS;
    const D = add(scale(U, Math.cos(a)), scale(V, Math.sin(a)));
    const t = exit(D);
    if (isFinite(t)) samples.push({ angle: a, p: add(Q, scale(D, t)), corner: false });
  }
  // the corners: where the base (and the top of a cylinder) meet the curved surface
  for (const y of m.spec.type === "cylinder" ? [0, h] : [0])
    for (const p3 of capLine(y)) {
      const okOther = m.spec.type === "cylinder" ? p3[1] >= -eps && p3[1] <= h + eps : true;
      if (!okOther) continue;
      const p2 = to2(p3);
      const angle = (Math.atan2(p2[1] - q2[1], p2[0] - q2[0]) + 2 * Math.PI) % (2 * Math.PI);
      samples.push({ angle, p: p3, corner: true });
    }
  samples.sort((x, y) => x.angle - y.angle);
  const points3d = samples.map((s) => s.p);
  const points2d = points3d.map(to2);
  const area = shoelace(points2d);
  if (area < 1e-9 * L * L) return NO_SECTION;
  const corners = samples.map((s, i) => (s.corner ? i : -1)).filter((i) => i >= 0);

  // what kind of curve: the angle between the plane and the ground against the slope of a cone's side
  const tiltRad = Math.acos(Math.min(1, n[1]));
  if (!corners.length) {
    // a closed curve: a circle or an ellipse, symmetric about the line u = 0
    const along = roots(quadraticAlong(m, O, V));
    if (along.length === 2) {
      const vc = (along[0] + along[1]) / 2;
      const b = (along[1] - along[0]) / 2;
      const across = roots(quadraticAlong(m, at(0, vc), U));
      const a = across.length === 2 ? (across[1] - across[0]) / 2 : 0;
      const center: Pt = [across.length === 2 ? (across[0] + across[1]) / 2 : 0, vc];
      const circle = Math.abs(a - b) <= tol.length * Math.max(a, b) && tiltRad < rad(tol.angle) + 1e-12;
      return conicSection(O, U, V, center, a, b, circle ? "circle" : "ellipse");
    }
  }
  let shape: ShapeCode = "ellipseSegment";
  if (m.spec.type === "cone") {
    const slope = Math.atan(h / r); // the angle between the cone's side and the ground
    if (Math.abs(tiltRad - slope) <= rad(0.05)) shape = "parabolaSegment";
    else if (tiltRad > slope) shape = "hyperbolaSegment";
  }
  // the straight sides: between two corners on the same height
  const segments: Section["segments"] = [];
  for (let i = 0; i < corners.length; i++)
    for (let j = i + 1; j < corners.length; j++) {
      const a3 = points3d[corners[i]], b3 = points3d[corners[j]];
      if (Math.abs(a3[1] - b3[1]) < 1e-7 * L) {
        const len = length(sub(a3, b3));
        if (len > 1e-9 * L) segments.push({ from: corners[i], to: corners[j], length: len });
      }
    }
  return {
    shape, kinds: [shape, "curved"],
    sides: segments.length, curved: true, points3d, points2d, corners, segments, measures: segments.map((s) => s.length),
    area, perimeter: perimeterOf(points2d), angles: [],
  };
};

/** A full circle or ellipse in the plane, centre (u, v) and half axes a (along U) and b (along V). */
const conicSection = (O: Vec, U: Vec, V: Vec, center: Pt, a: number, b: number, shape: "circle" | "ellipse"): Section => {
  const points2d: Pt[] = Array.from({ length: RAYS }, (_, i) => {
    const t = (2 * Math.PI * i) / RAYS;
    return [center[0] + a * Math.cos(t), center[1] + b * Math.sin(t)];
  });
  const points3d = points2d.map(([u, v]) => add(O, add(scale(U, u), scale(V, v))));
  // Ramanujan's perimeter
  const hh = ((a - b) * (a - b)) / ((a + b) * (a + b));
  const perimeter = Math.PI * (a + b) * (1 + (3 * hh) / (10 + Math.sqrt(4 - 3 * hh)));
  return {
    shape, kinds: shape === "circle" ? ["circle", "curved"] : ["ellipse", "curved"],
    sides: 0, curved: true, points3d, points2d, corners: [], segments: [],
    measures: shape === "circle" ? [2 * a] : [2 * Math.max(a, b), 2 * Math.min(a, b)],
    conic: { center, a, b }, area: Math.PI * a * b, perimeter, angles: [],
  };
};

/** The cross-section of the solid with the plane. */
export const sectionOf = (m: Model, p: PlaneParams, tol: Tolerance = DEFAULT_TOLERANCE): Section => {
  const plane = planeOf(m, p);
  if (isRound(m)) return roundSection(m, plane, p, tol);
  const { n, c } = plane;
  const { U, V } = planeAxes(p);
  const O = add(m.center, scale(n, c - dot(n, m.center)));
  const eps = 1e-9 * m.radius;
  const s = m.vertices.map((v) => dot(n, v) - c);
  const pts: Vec[] = [];
  m.vertices.forEach((v, i) => Math.abs(s[i]) <= eps && pts.push(v));
  for (const [i, j] of m.edges)
    if ((s[i] > eps && s[j] < -eps) || (s[i] < -eps && s[j] > eps)) pts.push(lerp(m.vertices[i], m.vertices[j], s[i] / (s[i] - s[j])));
  return polygonSection(pts, O, U, V, m.radius, tol);
};

// --- measuring and checking

/**
 * The shapes a solid can give, found by trying planes: for the author's check that a target can be made. Deterministic
 * (its own random numbers), every kind found at least once in a few thousand planes, plus the special planes.
 */
export const reachableKinds = (m: Model, tries = 2500): Set<ShapeCode> => {
  const kinds = new Set<ShapeCode>();
  const add1 = (s: Section) => s.kinds.forEach((k) => kinds.add(k));
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const tilt of [0, 30, 45, 60, 90]) for (const turn of [0, 45, 90]) add1(sectionOf(m, { offset: 0, tilt, turn }));
  if (m.spec.type === "cone") {
    const [r, h] = m.spec.dims;
    const slope = deg(Math.atan(h / r));
    for (const turn of [0, 30]) {
      add1(sectionOf(m, { offset: 0, tilt: slope, turn }));
      // through the top
      for (const tilt of [60, 75, 89, 90]) {
        const n = normalOf(tilt, turn);
        add1(sectionOf(m, { offset: dot(n, sub([0, h, 0], m.center)), tilt, turn }));
      }
    }
  }
  if (!isRound(m)) {
    const fractions = [0, 0.5, 1, 1 / 3, 2 / 3, 0.25, 0.75];
    const E = m.edges.length;
    for (let i = 0; i < tries; i++) {
      const pts = [0, 1, 2].map((): EdgePoint => {
        const edge = Math.floor(rnd() * E);
        const f = rnd() < 0.6 ? fractions[Math.floor(rnd() * fractions.length)] : rnd();
        return { edge, at: f * edgeLength(m, edge) };
      });
      const p = planeThrough(m, pts);
      if (p) add1(sectionOf(m, p));
    }
  }
  for (let i = 0; i < (isRound(m) ? tries / 5 : tries); i++)
    add1(sectionOf(m, { offset: (rnd() * 2 - 1) * m.radius, tilt: rnd() * 90, turn: rnd() * 360 }));
  kinds.delete("none");
  return kinds;
};
