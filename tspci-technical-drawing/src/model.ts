// The workpiece and its technical drawing, without the DOM (tested in node: test/model.test.ts).
//
// A workpiece is a block with features: steps, slots, holes, chamfers and extra boxes (added or cut away). Each feature
// becomes a primitive: a convex solid (half-spaces) or a cylinder, added or subtracted. The drawing comes from those
// primitives directly: for a view, every line of the drawing lies on a "candidate" (a line at a coordinate where a
// primitive starts or ends, a chamfer's slanted edge, a hole's circle). A piece of a candidate is a line when the
// surfaces a ray meets just left of it differ from those just right of it; it is visible when the first surface
// differs, and hidden when a surface in front of it is the same on both sides. That gives the visible and hidden lines
// of European (ISO-E, first angle) projection without a mesh.
//
// Coordinates in mm: x from left to right, y from front to back, z from bottom to top. The block is [0,w]×[0,d]×[0,h].

export type V3 = [number, number, number];
export type V2 = [number, number];
export type Axis = 0 | 1 | 2;
export type ViewName = "front" | "top" | "left";
export const VIEW_NAMES: ViewName[] = ["front", "top", "left"];
export type LineKind = "visible" | "hidden";

export const STEP_EDGES = ["left", "right", "front", "back"] as const;
export type StepEdge = (typeof STEP_EDGES)[number];
export const HOLE_FACES = ["top", "front", "left"] as const;
export type HoleFace = (typeof HOLE_FACES)[number];
export const CHAMFER_EDGES = [
  "top-front", "top-back", "top-left", "top-right",
  "front-left", "front-right", "back-left", "back-right",
  "bottom-front", "bottom-back", "bottom-left", "bottom-right",
] as const;
export type ChamferEdge = (typeof CHAMFER_EDGES)[number];

export type Block = { type: "block"; w: number; d: number; h: number };
/** A box added to the workpiece or cut out of it, by its corner nearest to the origin and its sizes. */
export type Box = { type: "box"; op: "add" | "cut"; x: number; y: number; z: number; w: number; d: number; h: number };
/** A step along a top edge of the block, over its whole length: `width` in from the side, `depth` down from the top. */
export type Step = { type: "step"; edge: StepEdge; width: number; depth: number };
/** A slot across the top of the block, through, running along x or y; `offset` from the left (x) or front (y). */
export type Slot = { type: "slot"; along: "x" | "y"; offset: number; width: number; depth: number };
/**
 * A hole drilled into a face. `a`, `b`: its centre on that face (top: x, y; front: x, z; left: y, z), measured from the
 * left, the front and the bottom. `depth` 0: through.
 */
export type Hole = { type: "hole"; face: HoleFace; a: number; b: number; diameter: number; depth: number };
/** A 45° chamfer on an edge of the block. */
export type Chamfer = { type: "chamfer"; edge: ChamferEdge; size: number };
export type Feature = Block | Box | Step | Slot | Hole | Chamfer;
export type FeatureType = Feature["type"];
export const FEATURE_TYPES: FeatureType[] = ["block", "step", "slot", "hole", "chamfer", "box"];

/** The example: a block with a step on the right, a slot across the top, a hole through the step and a chamfer. */
export const DEFAULT_FEATURES: Feature[] = [
  { type: "block", w: 60, d: 40, h: 30 },
  { type: "step", edge: "right", width: 20, depth: 15 },
  { type: "slot", along: "x", offset: 15, width: 10, depth: 10 },
  { type: "hole", face: "top", a: 50, b: 20, diameter: 10, depth: 0 },
  { type: "chamfer", edge: "front-left", size: 5 },
];

const num = (value: unknown, fallback: number, min = 0, max = 10000): number => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
};
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

/** One feature from JSON, with every number a number and every choice one of its options; null when it is unknown. */
export const parseFeature = (raw: any): Feature | null => {
  if (!raw || typeof raw !== "object") return null;
  switch (raw.type) {
    case "block": return { type: "block", w: num(raw.w, 60, 1), d: num(raw.d, 40, 1), h: num(raw.h, 30, 1) };
    case "box": return {
      type: "box", op: raw.op === "cut" ? "cut" : "add", x: num(raw.x, 0, -10000), y: num(raw.y, 0, -10000), z: num(raw.z, 0, -10000),
      w: num(raw.w, 10, 0.1), d: num(raw.d, 10, 0.1), h: num(raw.h, 10, 0.1),
    };
    case "step": return { type: "step", edge: oneOf(raw.edge, STEP_EDGES, "right"), width: num(raw.width, 10, 0.1), depth: num(raw.depth, 10, 0.1) };
    case "slot": return { type: "slot", along: raw.along === "y" ? "y" : "x", offset: num(raw.offset, 10), width: num(raw.width, 10, 0.1), depth: num(raw.depth, 5, 0.1) };
    case "hole": return {
      type: "hole", face: oneOf(raw.face, HOLE_FACES, "top"), a: num(raw.a, 10), b: num(raw.b, 10), diameter: num(raw.diameter, 8, 0.1), depth: num(raw.depth, 0),
    };
    case "chamfer": return { type: "chamfer", edge: oneOf(raw.edge, CHAMFER_EDGES, "top-front"), size: num(raw.size, 3, 0.1) };
    default: return null;
  }
};

/** The features of a workpiece; the first one is always the block (the example's block when there is none). */
export const parseFeatures = (raw: unknown): Feature[] => {
  if (!Array.isArray(raw)) return DEFAULT_FEATURES.map((f) => ({ ...f }));
  const list = Array.isArray(raw) ? raw.map(parseFeature).filter((f): f is Feature => !!f) : [];
  const block = list.find((f) => f.type === "block") ?? DEFAULT_FEATURES[0];
  return [block, ...list.filter((f) => f.type !== "block")];
};

export const blockOf = (features: Feature[]): Block => (features[0]?.type === "block" ? features[0] : (DEFAULT_FEATURES[0] as Block));

export type Bounds = { min: V3; max: V3 };

/** The box around the workpiece: the block and every box added to it. */
export const boundsOf = (features: Feature[]): Bounds => {
  const b = blockOf(features);
  const min: V3 = [0, 0, 0];
  const max: V3 = [b.w, b.d, b.h];
  for (const f of features) {
    if (f.type !== "box" || f.op !== "add") continue;
    const lo: V3 = [f.x, f.y, f.z];
    const hi: V3 = [f.x + f.w, f.y + f.d, f.z + f.h];
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], lo[k]);
      max[k] = Math.max(max[k], hi[k]);
    }
  }
  return { min, max };
};

// ---------------------------------------------------------------------------------------------------------------------
// Primitives

/** A half-space n·p ≤ c. */
export type Half = { n: V3; c: number };
/** How a primitive is meshed for the 3D picture (csg.ts). */
export type MeshShape =
  | { shape: "box"; min: V3; max: V3 }
  | { shape: "prism"; tri: [V3, V3, V3]; axis: Axis; lo: number; hi: number }
  | { shape: "cyl"; axis: Axis; c: V2; r: number; from: number; to: number };
type PrimBase = {
  /** 1: added, -1: cut away */
  op: 1 | -1;
  /** the feature it comes from */
  feature: number;
  /** per axis, the coordinates where it starts or ends: candidates for lines */
  crit: [number[], number[], number[]];
  /** a chamfer's slanted edge, seen along `axis` */
  diag?: { axis: Axis; p: V3; q: V3 };
  mesh: MeshShape;
};
export type Prim =
  | (PrimBase & { kind: "poly"; planes: Half[] })
  | (PrimBase & { kind: "cyl"; axis: Axis; /** centre on the two other axes, in axis order */ c: V2; r: number; from: number; to: number });

const unit = (k: number, s = 1): V3 => {
  const v: V3 = [0, 0, 0];
  v[k] = s;
  return v;
};
const otherAxes = (axis: Axis): [Axis, Axis] => (axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1]);

const boxPrim = (min: V3, max: V3, op: 1 | -1, feature: number): Prim => ({
  kind: "poly", op, feature,
  planes: [0, 1, 2].flatMap((k) => [{ n: unit(k, 1), c: max[k] }, { n: unit(k, -1), c: -min[k] }]),
  crit: [[min[0], max[0]], [min[1], max[1]], [min[2], max[2]]],
  mesh: { shape: "box", min, max },
});

const FACE: Record<string, { axis: Axis; max: boolean }> = {
  left: { axis: 0, max: false }, right: { axis: 0, max: true }, front: { axis: 1, max: false },
  back: { axis: 1, max: true }, bottom: { axis: 2, max: false }, top: { axis: 2, max: true },
};

/** The axis a chamfer runs along, and its two faces. */
export const chamferAxes = (edge: ChamferEdge) => {
  const [f1, f2] = edge.split("-").map((f) => FACE[f]);
  const axis = ([0, 1, 2] as Axis[]).find((k) => k !== f1.axis && k !== f2.axis)!;
  return { f1, f2, axis };
};

/** The cylinder of a hole: its axis, centre, and where it starts and ends (through: beyond the workpiece). */
export const holeCylinder = (hole: Hole, block: Block, bounds: Bounds) => {
  const r = hole.diameter / 2;
  const through = !(hole.depth > 0);
  if (hole.face === "top") return { axis: 2 as Axis, c: [hole.a, hole.b] as V2, r, from: through ? bounds.min[2] - 1 : block.h - hole.depth, to: bounds.max[2] + 1 };
  if (hole.face === "front") return { axis: 1 as Axis, c: [hole.a, hole.b] as V2, r, from: bounds.min[1] - 1, to: through ? bounds.max[1] + 1 : hole.depth };
  return { axis: 0 as Axis, c: [hole.a, hole.b] as V2, r, from: bounds.min[0] - 1, to: through ? bounds.max[0] + 1 : hole.depth };
};

/** The primitives of a workpiece: what is added and what is cut away. Cutters reach 1 mm past the workpiece. */
export const primitivesOf = (features: Feature[]): Prim[] => {
  const block = blockOf(features);
  const bounds = boundsOf(features);
  const lo = bounds.min.map((v) => v - 1) as V3;
  const hi = bounds.max.map((v) => v + 1) as V3;
  const B: V3 = [block.w, block.d, block.h];
  const prims: Prim[] = [];
  features.forEach((f, i) => {
    switch (f.type) {
      case "block":
        prims.push(boxPrim([0, 0, 0], [f.w, f.d, f.h], 1, i));
        break;
      case "box":
        prims.push(boxPrim([f.x, f.y, f.z], [f.x + f.w, f.y + f.d, f.z + f.h], f.op === "add" ? 1 : -1, i));
        break;
      case "step": {
        const min: V3 = [lo[0], lo[1], block.h - f.depth];
        const max: V3 = [hi[0], hi[1], hi[2]];
        if (f.edge === "right") min[0] = block.w - f.width;
        if (f.edge === "left") max[0] = f.width;
        if (f.edge === "front") max[1] = f.width;
        if (f.edge === "back") min[1] = block.d - f.width;
        prims.push(boxPrim(min, max, -1, i));
        break;
      }
      case "slot": {
        const k = f.along === "x" ? 1 : 0; // the slot runs along x: its width is across y
        const min: V3 = [lo[0], lo[1], block.h - f.depth];
        const max: V3 = [hi[0], hi[1], hi[2]];
        min[k] = f.offset;
        max[k] = f.offset + f.width;
        prims.push(boxPrim(min, max, -1, i));
        break;
      }
      case "hole": {
        const c = holeCylinder(f, block, bounds);
        const [i0, i1] = otherAxes(c.axis);
        const crit: [number[], number[], number[]] = [[], [], []];
        crit[c.axis] = [c.from, c.to];
        crit[i0] = [c.c[0] - c.r, c.c[0] + c.r];
        crit[i1] = [c.c[1] - c.r, c.c[1] + c.r];
        prims.push({ kind: "cyl", op: -1, feature: i, ...c, crit, mesh: { shape: "cyl", ...c } });
        break;
      }
      case "chamfer": {
        const { f1, f2, axis } = chamferAxes(f.edge);
        const o = 1;
        const s = f.size;
        // depth into the block from a face: max face B - p, min face p - 0
        const sg = (face: { max: boolean }) => (face.max ? -1 : 1);
        const k = (face: { axis: Axis; max: boolean }) => (face.max ? B[face.axis] : 0);
        const along = (face: { axis: Axis; max: boolean }, depth: number) => (face.max ? B[face.axis] - depth : depth);
        const n: V3 = [0, 0, 0];
        n[f1.axis] = sg(f1) / Math.SQRT2;
        n[f2.axis] = sg(f2) / Math.SQRT2;
        // d1 + d2 ≤ s  ⇔  sg1·p1 + sg2·p2 ≤ s − (B1 if max) − (B2 if max)
        const c = (s - k(f1) - k(f2)) / Math.SQRT2;
        const planes: Half[] = [
          { n, c },
          f1.max ? { n: unit(f1.axis, 1), c: B[f1.axis] + o } : { n: unit(f1.axis, -1), c: o },
          f2.max ? { n: unit(f2.axis, 1), c: B[f2.axis] + o } : { n: unit(f2.axis, -1), c: o },
          { n: unit(axis, 1), c: B[axis] + o },
          { n: unit(axis, -1), c: o },
        ];
        const point = (d1: number, d2: number): V3 => {
          const p: V3 = [0, 0, 0];
          p[f1.axis] = along(f1, d1);
          p[f2.axis] = along(f2, d2);
          return p;
        };
        const crit: [number[], number[], number[]] = [[], [], []];
        crit[f1.axis] = [along(f1, 0), along(f1, s)];
        crit[f2.axis] = [along(f2, 0), along(f2, s)];
        crit[axis] = [0, B[axis]];
        prims.push({
          kind: "poly", op: -1, feature: i, planes, crit,
          diag: { axis, p: point(s, 0), q: point(0, s) },
          mesh: { shape: "prism", tri: [point(-o, -o), point(s + o, -o), point(-o, s + o)], axis, lo: -o, hi: B[axis] + o },
        });
        break;
      }
    }
  });
  return prims;
};

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const inPrim = (p: Prim, q: V3): boolean => {
  if (p.kind === "poly") return p.planes.every((h) => dot(h.n, q) <= h.c);
  const [i0, i1] = otherAxes(p.axis);
  const a = q[p.axis];
  return a >= p.from && a <= p.to && (q[i0] - p.c[0]) ** 2 + (q[i1] - p.c[1]) ** 2 <= p.r * p.r;
};

/** Whether a point is in the material. */
export const inside = (prims: Prim[], q: V3): boolean =>
  prims.some((p) => p.op === 1 && inPrim(p, q)) && !prims.some((p) => p.op === -1 && inPrim(p, q));

/** A surface a ray meets: its depth, its normal (up to sign) and whether the ray enters the material there. */
export type Crossing = { t: number; n: V3; enter: boolean };

const canonical = (n: V3): V3 => {
  const k = Math.abs(n[0]) > 1e-9 ? 0 : Math.abs(n[1]) > 1e-9 ? 1 : 2;
  return n[k] < 0 ? [-n[0], -n[1], -n[2]] : [n[0], n[1], n[2]];
};

/** Where a ray along `axis` meets a primitive: the interval on that axis, with the normals at both ends. */
const interval = (p: Prim, axis: Axis, base: V3): { lo: number; hi: number; nlo: V3; nhi: V3 } | null => {
  if (p.kind === "poly") {
    let lo = -Infinity, hi = Infinity;
    let nlo: V3 = unit(axis), nhi: V3 = unit(axis);
    for (const h of p.planes) {
      let rest = h.c;
      for (let k = 0; k < 3; k++) if (k !== axis) rest -= h.n[k] * base[k];
      const na = h.n[axis];
      if (Math.abs(na) < 1e-12) {
        if (rest < 0) return null;
      } else if (na > 0) {
        if (rest / na < hi) { hi = rest / na; nhi = h.n; }
      } else if (rest / na > lo) {
        lo = rest / na;
        nlo = h.n;
      }
    }
    return lo < hi ? { lo, hi, nlo, nhi } : null;
  }
  const [i0, i1] = otherAxes(p.axis);
  if (axis === p.axis) {
    if ((base[i0] - p.c[0]) ** 2 + (base[i1] - p.c[1]) ** 2 >= p.r * p.r) return null;
    return { lo: p.from, hi: p.to, nlo: unit(axis), nhi: unit(axis) };
  }
  // the ray crosses the cylinder: it runs along one radial axis, the other (m) stays fixed
  if (base[p.axis] <= p.from || base[p.axis] >= p.to) return null;
  const m = axis === i0 ? i1 : i0;
  const cm = m === i0 ? p.c[0] : p.c[1];
  const ca = axis === i0 ? p.c[0] : p.c[1];
  const dm = base[m] - cm;
  if (Math.abs(dm) >= p.r) return null;
  const half = Math.sqrt(p.r * p.r - dm * dm);
  const nlo: V3 = [0, 0, 0], nhi: V3 = [0, 0, 0];
  nlo[axis] = -half / p.r;
  nlo[m] = dm / p.r;
  nhi[axis] = half / p.r;
  nhi[m] = dm / p.r;
  return { lo: ca - half, hi: ca + half, nlo, nhi };
};

/**
 * The surfaces a ray meets, nearest first. The ray runs along `axis` in direction `sign`, through `base` (its
 * coordinate on `axis` does not count); the depth t is sign × the coordinate on the axis.
 */
export const crossings = (prims: Prim[], axis: Axis, sign: 1 | -1, base: V3): Crossing[] => {
  const spans: { lo: number; hi: number; nlo: V3; nhi: V3; op: 1 | -1 }[] = [];
  for (const p of prims) {
    const s = interval(p, axis, base);
    if (s) spans.push({ ...s, op: p.op });
  }
  if (!spans.some((s) => s.op === 1)) return [];
  const events: { at: number; n: V3 }[] = [];
  for (const s of spans) events.push({ at: s.lo, n: s.nlo }, { at: s.hi, n: s.nhi });
  events.sort((a, b) => a.at - b.at);
  const at: { at: number; n: V3 }[] = [];
  for (const e of events) if (!at.length || e.at - at[at.length - 1].at > 1e-9) at.push(e);
  const solid = (x: number) => spans.some((s) => s.op === 1 && s.lo < x && x < s.hi) && !spans.some((s) => s.op === -1 && s.lo < x && x < s.hi);
  const result: { at: number; n: V3; after: boolean }[] = [];
  let before = false;
  for (let i = 0; i < at.length; i++) {
    const after = i + 1 < at.length ? solid((at[i].at + at[i + 1].at) / 2) : false;
    if (after !== before) result.push({ at: at[i].at, n: canonical(at[i].n), after });
    before = after;
  }
  const list = result.map((r) => ({ t: sign * r.at, n: r.n, enter: sign > 0 ? r.after : !r.after }));
  return sign > 0 ? list : list.reverse();
};

const sameCrossing = (a: Crossing, b: Crossing) =>
  a.enter === b.enter && Math.abs(a.t - b.t) < 0.01 && dot(a.n, b.n) > 1 - 1e-5;

/** -1: the same surfaces; otherwise the first one that differs (0: the nearest, so the line is visible). */
export const firstDifference = (a: Crossing[], b: Crossing[]): number => {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (!a[i] || !b[i] || !sameCrossing(a[i], b[i])) return i;
  return -1;
};

// ---------------------------------------------------------------------------------------------------------------------
// Views

/**
 * A view: which axes are its horizontal (u) and vertical (v) direction and which one it looks along. The left view
 * looks from the left (+x), so the front of the workpiece is on its right: u = back − y.
 */
export const VIEW_DEF: Record<ViewName, { u: Axis; su: 1 | -1; v: Axis; axis: Axis; sign: 1 | -1 }> = {
  front: { u: 0, su: 1, v: 2, axis: 1, sign: 1 },
  top: { u: 0, su: 1, v: 1, axis: 2, sign: -1 },
  left: { u: 1, su: -1, v: 2, axis: 0, sign: 1 },
};

/** A line of a view, in mm from the view's bottom left corner (v up). */
export type Seg = { kind: LineKind; a: V2; b: V2 };
/** A circle or arc of a view: angles in radians, counter-clockwise, from `from` to `to`. */
export type Arc = { kind: LineKind; cx: number; cy: number; r: number; from: number; to: number };
export type CentreLine = { a: V2; b: V2 };
export type View = { name: ViewName; width: number; height: number; segs: Seg[]; arcs: Arc[]; centres: CentreLine[] };

const uniq = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((v, i) => i === 0 || v - sorted[i - 1] > 1e-6);
};
const round = (v: number) => Math.round(v * 1000) / 1000;
const EPS = 1e-3;

/** The view of a workpiece: its visible and hidden lines, circles and centre lines. */
export const computeView = (features: Feature[], name: ViewName, prims = primitivesOf(features), bounds = boundsOf(features)): View => {
  const def = VIEW_DEF[name];
  const { u: ua, v: va, axis } = def;
  const lo = bounds.min, hi = bounds.max;
  const crit = (k: Axis) => uniq(prims.flatMap((p) => p.crit[k]).filter((c) => c >= lo[k] - 1e-9 && c <= hi[k] + 1e-9).concat([lo[k], hi[k]]));
  const Us = crit(ua);
  const Vs = crit(va);
  const diags = prims.filter((p) => p.diag && p.diag.axis === axis).map((p) => ({ p: [p.diag!.p[ua], p.diag!.p[va]] as V2, q: [p.diag!.q[ua], p.diag!.q[va]] as V2 }));
  const circles = prims.filter((p): p is Extract<Prim, { kind: "cyl" }> => p.kind === "cyl" && p.axis === axis).map((p) => {
    const [i0] = otherAxes(p.axis);
    return { cu: ua === i0 ? p.c[0] : p.c[1], cv: va === i0 ? p.c[0] : p.c[1], r: p.r };
  });

  const ray = (u: number, v: number) => {
    const base: V3 = [0, 0, 0];
    base[ua] = u;
    base[va] = v;
    return crossings(prims, axis, def.sign, base);
  };
  /** The kind of line at (u, v) on a candidate whose normal is (nu, nv); null: no line. */
  const classify = (u: number, v: number, nu: number, nv: number): LineKind | null => {
    const k = firstDifference(ray(u - nu * EPS, v - nv * EPS), ray(u + nu * EPS, v + nv * EPS));
    return k < 0 ? null : k === 0 ? "visible" : "hidden";
  };
  const U = (u: number) => round(def.su > 0 ? u - lo[ua] : hi[ua] - u);
  const V = (v: number) => round(v - lo[va]);
  const raw: { kind: LineKind; a: V2; b: V2 }[] = [];

  /** Cuts a candidate at its breakpoints (parameters 0..1) and keeps the pieces that are lines, joined. */
  const pieces = (point: (t: number) => V2, normal: V2, breaks: number[]) => {
    const ts = uniq(breaks.filter((t) => t >= -1e-9 && t <= 1 + 1e-9).concat([0, 1]));
    let open: { kind: LineKind; from: number } | null = null;
    let last = 0;
    for (let i = 0; i + 1 < ts.length; i++) {
      if (ts[i + 1] - ts[i] < 1e-7) continue;
      const [mu, mv] = point((ts[i] + ts[i + 1]) / 2);
      const kind = classify(mu, mv, normal[0], normal[1]);
      if (open && open.kind !== kind) {
        raw.push({ kind: open.kind, a: point(open.from), b: point(last) });
        open = null;
      }
      if (kind && !open) open = { kind, from: ts[i] };
      last = ts[i + 1];
    }
    if (open) raw.push({ kind: open.kind, a: point(open.from), b: point(last) });
  };
  const circleCuts = (fixed: number, axisIsU: boolean) =>
    circles.flatMap((c) => {
      const d = fixed - (axisIsU ? c.cv : c.cu);
      const m = axisIsU ? c.cu : c.cv;
      if (Math.abs(d) > c.r + 1e-9) return [];
      // a tangent: cut at the point it touches, so no piece is tested there
      if (Math.abs(d) >= c.r - 1e-9) return [m];
      const h = Math.sqrt(c.r * c.r - d * d);
      return [m - h, m + h];
    });
  const diagCut = (d: { p: V2; q: V2 }, k: 0 | 1, value: number) => {
    const den = d.q[k] - d.p[k];
    if (Math.abs(den) < 1e-12) return [];
    const t = (value - d.p[k]) / den;
    return t > 0 && t < 1 ? [d.p[1 - k] + t * (d.q[1 - k] - d.p[1 - k])] : [];
  };

  // horizontal candidates: v constant, u from lo to hi
  const du = hi[ua] - lo[ua], dv = hi[va] - lo[va];
  for (const v of Vs) {
    const cuts = [...Us, ...circleCuts(v, true), ...diags.flatMap((d) => diagCut(d, 1, v))];
    pieces((t) => [lo[ua] + t * du, v], [0, 1], cuts.map((u) => (u - lo[ua]) / du));
  }
  for (const u of Us) {
    const cuts = [...Vs, ...circleCuts(u, false), ...diags.flatMap((d) => diagCut(d, 0, u))];
    pieces((t) => [u, lo[va] + t * dv], [1, 0], cuts.map((v) => (v - lo[va]) / dv));
  }
  for (const d of diags) {
    const len = Math.hypot(d.q[0] - d.p[0], d.q[1] - d.p[1]);
    const normal: V2 = [-(d.q[1] - d.p[1]) / len, (d.q[0] - d.p[0]) / len];
    const ts: number[] = [];
    const param = (k: 0 | 1, value: number) => {
      const den = d.q[k] - d.p[k];
      if (Math.abs(den) > 1e-12) ts.push((value - d.p[k]) / den);
    };
    Us.forEach((u) => param(0, u));
    Vs.forEach((v) => param(1, v));
    pieces((t) => [d.p[0] + t * (d.q[0] - d.p[0]), d.p[1] + t * (d.q[1] - d.p[1])], normal, ts);
  }
  const arcs: Arc[] = [];
  for (const c of circles) {
    const angles = Array.from({ length: 16 }, (_, i) => (i / 16) * 2 * Math.PI);
    for (const u of Us) if (Math.abs(u - c.cu) < c.r) { const a = Math.acos((u - c.cu) / c.r); angles.push(a, 2 * Math.PI - a); }
    for (const v of Vs) if (Math.abs(v - c.cv) < c.r) { const a = Math.asin((v - c.cv) / c.r); angles.push((a + 2 * Math.PI) % (2 * Math.PI), Math.PI - a); }
    const as = uniq(angles.map((a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI))).concat([2 * Math.PI]);
    const parts: { kind: LineKind | null; from: number; to: number }[] = [];
    for (let i = 0; i + 1 < as.length; i++) {
      if (as[i + 1] - as[i] < 1e-7) continue;
      const m = (as[i] + as[i + 1]) / 2;
      const kind = classify(c.cu + c.r * Math.cos(m), c.cv + c.r * Math.sin(m), Math.cos(m), Math.sin(m));
      const prev = parts[parts.length - 1];
      if (prev && prev.kind === kind) prev.to = as[i + 1];
      else parts.push({ kind, from: as[i], to: as[i + 1] });
    }
    if (parts.length > 1 && parts[0].kind === parts[parts.length - 1].kind) {
      const end = parts.pop()!;
      parts[0].from = end.from - 2 * Math.PI;
    }
    const cx = U(c.cu), cy = V(c.cv);
    for (const p of parts) {
      if (!p.kind) continue;
      // the left view is mirrored: angle θ becomes π − θ
      const [from, to] = def.su > 0 ? [p.from, p.to] : [Math.PI - p.to, Math.PI - p.from];
      arcs.push({ kind: p.kind, cx, cy, r: round(c.r), from: round(from), to: round(to) });
    }
  }

  // centre lines of the holes
  const centres: CentreLine[] = [];
  features.forEach((f) => {
    if (f.type !== "hole") return;
    const c = holeCylinder(f, blockOf(features), bounds);
    const [i0, i1] = otherAxes(c.axis);
    const over = 2 + c.r * 0.3;
    const centreOn = (k: Axis) => (k === i0 ? c.c[0] : c.c[1]);
    if (c.axis === axis) {
      const cu = centreOn(ua), cv = centreOn(va);
      centres.push({ a: [U(cu - c.r - over), V(cv)], b: [U(cu + c.r + over), V(cv)] });
      centres.push({ a: [U(cu), V(cv - c.r - over)], b: [U(cu), V(cv + c.r + over)] });
      return;
    }
    const from = Math.max(c.from, lo[c.axis]) - over, to = Math.min(c.to, hi[c.axis]) + over;
    if (c.axis === ua) { const v = centreOn(va); centres.push({ a: [U(from), V(v)], b: [U(to), V(v)] }); }
    else { const u = centreOn(ua); centres.push({ a: [U(u), V(from)], b: [U(u), V(to)] }); }
  });

  const segs = raw.map((s) => normalizeSeg({ kind: s.kind, a: [U(s.a[0]), V(s.a[1])], b: [U(s.b[0]), V(s.b[1])] }));
  segs.sort((x, y) => segKey(x).localeCompare(segKey(y)));
  return { name, width: round(du), height: round(dv), segs, arcs, centres };
};

/** A segment with its endpoints in a fixed order (left to right, then bottom to top). */
export const normalizeSeg = (s: Seg): Seg => {
  const swap = s.a[0] > s.b[0] + 1e-9 || (Math.abs(s.a[0] - s.b[0]) <= 1e-9 && s.a[1] > s.b[1]);
  return swap ? { kind: s.kind, a: s.b, b: s.a } : s;
};
const fmt = (v: number) => String(Math.round(v * 100) / 100);
/** A segment as text, the same for the same segment: "visible:0,0,60,0". */
export const segKey = (s: Seg) => {
  const n = normalizeSeg(s);
  return `${n.kind}:${fmt(n.a[0])},${fmt(n.a[1])},${fmt(n.b[0])},${fmt(n.b[1])}`;
};

export const computeViews = (features: Feature[]): Record<ViewName, View> => {
  const prims = primitivesOf(features);
  const bounds = boundsOf(features);
  return {
    front: computeView(features, "front", prims, bounds),
    top: computeView(features, "top", prims, bounds),
    left: computeView(features, "left", prims, bounds),
  };
};

/** The three views as text: two workpieces with the same text look the same on paper. */
export const viewSignature = (features: Feature[]) => {
  const views = computeViews(features);
  return VIEW_NAMES.map((n) => {
    const v = views[n];
    const arcs = v.arcs.map((a) => `${a.kind}:${fmt(a.cx)},${fmt(a.cy)},${fmt(a.r)},${fmt(a.from)},${fmt(a.to)}`).sort();
    return `${n}|${fmt(v.width)}x${fmt(v.height)}|${v.segs.map(segKey).join(";")}|${arcs.join(";")}`;
  }).join("\n");
};

// ---------------------------------------------------------------------------------------------------------------------
// Dimensions

export type DimSide = "top" | "bottom" | "left" | "right";
/**
 * A dimension of the drawing. "h" and "v": a length between two coordinates along the view's u or v axis, drawn on
 * `side`. "dia": the diameter of a circle (centre `at`, radius `r`). "chamfer": a leader to a chamfer at `at`, away
 * from the material in direction `dir`.
 */
export type Dim = {
  id: string;
  feature: number;
  key: string;
  value: number;
  view: ViewName;
  kind: "h" | "v" | "dia" | "chamfer";
  from?: number;
  to?: number;
  side?: DimSide;
  at?: V2;
  r?: number;
  dir?: V2;
  /** shown on the drawing unless the author says otherwise */
  standard: boolean;
};

/** Every dimension of a workpiece, the standard ones and extra ones (from the other side, the rest of a height). */
export const dimensionsOf = (features: Feature[]): Dim[] => {
  const block = blockOf(features);
  const bounds = boundsOf(features);
  const dims: Dim[] = [];
  const { w, d, h } = block;
  /** A linear dimension along raw axis k, from r1 to r2, in a view. */
  const lin = (feature: number, key: string, view: ViewName, k: Axis, r1: number, r2: number, side: DimSide, standard = true) => {
    const def = VIEW_DEF[view];
    if (Math.abs(r2 - r1) < 1e-6) return;
    const conv = (r: number, ax: Axis, s: 1 | -1) => round(s > 0 ? r - bounds.min[ax] : bounds.max[ax] - r);
    let kind: "h" | "v";
    let a: number, b: number;
    if (k === def.u) { kind = "h"; a = conv(r1, k, def.su); b = conv(r2, k, def.su); }
    else if (k === def.v) { kind = "v"; a = conv(r1, k, 1); b = conv(r2, k, 1); }
    else return;
    dims.push({ id: `${feature}.${key}`, feature, key, value: round(Math.abs(r2 - r1)), view, kind, from: Math.min(a, b), to: Math.max(a, b), side, standard });
  };
  const at = (view: ViewName, p: V3): V2 => {
    const def = VIEW_DEF[view];
    return [round(def.su > 0 ? p[def.u] - bounds.min[def.u] : bounds.max[def.u] - p[def.u]), round(p[def.v] - bounds.min[def.v])];
  };
  features.forEach((f, i) => {
    switch (f.type) {
      case "block":
        lin(i, "w", "front", 0, 0, w, "top");
        lin(i, "h", "front", 2, 0, h, "left");
        lin(i, "d", "top", 1, 0, d, "left");
        break;
      case "box": {
        const cut = f.op === "cut";
        lin(i, "x", "front", 0, 0, f.x, "top", f.x > 0);
        lin(i, "w", "front", 0, f.x, f.x + f.w, "top");
        lin(i, "z", "front", 2, 0, f.z, "right", f.z > 0 && !cut);
        lin(i, "h", "front", 2, f.z, f.z + f.h, "right");
        lin(i, "y", "top", 1, 0, f.y, "left", f.y > 0);
        lin(i, "d", "top", 1, f.y, f.y + f.d, "left");
        break;
      }
      case "step": {
        const rest = h - f.depth;
        if (f.edge === "right" || f.edge === "left") {
          const right = f.edge === "right";
          lin(i, "width", "front", 0, right ? w - f.width : 0, right ? w : f.width, "top");
          lin(i, "depth", "front", 2, rest, h, right ? "right" : "left");
          lin(i, "rest", "front", 2, 0, rest, right ? "right" : "left", false);
        } else {
          const front = f.edge === "front";
          lin(i, "width", "left", 1, front ? 0 : d - f.width, front ? f.width : d, "top");
          lin(i, "depth", "left", 2, rest, h, front ? "right" : "left");
          lin(i, "rest", "left", 2, 0, rest, front ? "right" : "left", false);
        }
        break;
      }
      case "slot": {
        const rest = h - f.depth;
        if (f.along === "y") {
          const side: DimSide = f.offset + f.width / 2 <= w / 2 ? "left" : "right";
          lin(i, "offset", "front", 0, 0, f.offset, "top");
          lin(i, "width", "front", 0, f.offset, f.offset + f.width, "top");
          lin(i, "offsetOther", "front", 0, f.offset + f.width, w, "top", false);
          lin(i, "depth", "front", 2, rest, h, side);
          lin(i, "rest", "front", 2, 0, rest, side, false);
        } else {
          const side: DimSide = f.offset + f.width / 2 <= d / 2 ? "right" : "left";
          lin(i, "offset", "left", 1, 0, f.offset, "top");
          lin(i, "width", "left", 1, f.offset, f.offset + f.width, "top");
          lin(i, "offsetOther", "left", 1, f.offset + f.width, d, "top", false);
          lin(i, "depth", "left", 2, rest, h, side);
          lin(i, "rest", "left", 2, 0, rest, side, false);
        }
        break;
      }
      case "hole": {
        const blind = f.depth > 0;
        if (f.face === "top") {
          lin(i, "a", "top", 0, 0, f.a, "bottom");
          lin(i, "aOther", "top", 0, f.a, w, "bottom", false);
          lin(i, "b", "top", 1, 0, f.b, "left");
          lin(i, "bOther", "top", 1, f.b, d, "left", false);
          dims.push({ id: `${i}.diameter`, feature: i, key: "diameter", value: f.diameter, view: "top", kind: "dia", at: at("top", [f.a, f.b, h]), r: f.diameter / 2, standard: true });
          if (blind) lin(i, "depth", "front", 2, h - f.depth, h, f.a <= w / 2 ? "left" : "right");
        } else if (f.face === "front") {
          lin(i, "a", "front", 0, 0, f.a, "top");
          lin(i, "aOther", "front", 0, f.a, w, "top", false);
          lin(i, "b", "front", 2, 0, f.b, f.a <= w / 2 ? "left" : "right");
          lin(i, "bOther", "front", 2, f.b, h, f.a <= w / 2 ? "left" : "right", false);
          dims.push({ id: `${i}.diameter`, feature: i, key: "diameter", value: f.diameter, view: "front", kind: "dia", at: at("front", [f.a, 0, f.b]), r: f.diameter / 2, standard: true });
          if (blind) lin(i, "depth", "top", 1, 0, f.depth, "left");
        } else {
          lin(i, "a", "left", 1, 0, f.a, "top");
          lin(i, "aOther", "left", 1, f.a, d, "top", false);
          lin(i, "b", "left", 2, 0, f.b, "right");
          lin(i, "bOther", "left", 2, f.b, h, "right", false);
          dims.push({ id: `${i}.diameter`, feature: i, key: "diameter", value: f.diameter, view: "left", kind: "dia", at: at("left", [0, f.a, f.b]), r: f.diameter / 2, standard: true });
          if (blind) lin(i, "depth", "front", 0, 0, f.depth, "top");
        }
        break;
      }
      case "chamfer": {
        const { f1, f2, axis } = chamferAxes(f.edge);
        const view = VIEW_NAMES.find((n) => VIEW_DEF[n].axis === axis)!;
        const B: V3 = [w, d, h];
        const mid: V3 = [0, 0, 0];
        const out: V3 = [0, 0, 0];
        mid[f1.axis] = f1.max ? B[f1.axis] - f.size / 2 : f.size / 2;
        mid[f2.axis] = f2.max ? B[f2.axis] - f.size / 2 : f.size / 2;
        out[f1.axis] = f1.max ? 1 : -1;
        out[f2.axis] = f2.max ? 1 : -1;
        const def = VIEW_DEF[view];
        const dir: V2 = [out[def.u] * def.su, out[def.v]];
        dims.push({ id: `${i}.size`, feature: i, key: "size", value: f.size, view, kind: "chamfer", at: at(view, mid), dir: [dir[0] / Math.SQRT2, dir[1] / Math.SQRT2], standard: true });
        break;
      }
    }
  });
  return dims;
};

/** A dimension's place: how far out from the view (level 0 is nearest). */
export type PlacedDim = Dim & { level: number };

/**
 * Stacks the linear dimensions of each side of each view: the shortest nearest to the view, and dimensions that do not
 * overlap (a chain: 15, 10, 35) side by side on one level.
 */
export const placeDims = (dims: Dim[]): PlacedDim[] => {
  const placed: PlacedDim[] = [];
  const groups = new Map<string, Dim[]>();
  for (const dim of dims) {
    if (dim.kind !== "h" && dim.kind !== "v") { placed.push({ ...dim, level: 0 }); continue; }
    const key = `${dim.view}:${dim.side}`;
    groups.set(key, [...(groups.get(key) ?? []), dim]);
  }
  for (const group of groups.values()) {
    const levels: { from: number; to: number }[][] = [];
    const sorted = [...group].sort((a, b) => a.to! - a.from! - (b.to! - b.from!) || a.from! - b.from!);
    for (const dim of sorted) {
      let level = levels.findIndex((spans) => spans.every((s) => dim.to! <= s.from + 1e-6 || dim.from! >= s.to - 1e-6));
      if (level < 0) { level = levels.length; levels.push([]); }
      levels[level].push({ from: dim.from!, to: dim.to! });
      placed.push({ ...dim, level });
    }
  }
  return placed;
};

// ---------------------------------------------------------------------------------------------------------------------
// Checks and variants

/** What is wrong with a workpiece, as codes with the feature (1-based) they are about. */
export const featureProblems = (features: Feature[]): { code: string; feature: number }[] => {
  const problems: { code: string; feature: number }[] = [];
  const { w, d, h } = blockOf(features);
  features.forEach((f, i) => {
    const n = i + 1;
    switch (f.type) {
      case "step":
        if (f.depth >= h) problems.push({ code: "tooDeep", feature: n });
        if (f.width >= (f.edge === "left" || f.edge === "right" ? w : d)) problems.push({ code: "tooWide", feature: n });
        break;
      case "slot":
        if (f.depth >= h) problems.push({ code: "tooDeep", feature: n });
        if (f.offset + f.width > (f.along === "y" ? w : d)) problems.push({ code: "outside", feature: n });
        break;
      case "hole": {
        const r = f.diameter / 2;
        const [ma, mb, md] = f.face === "top" ? [w, d, h] : f.face === "front" ? [w, h, d] : [d, h, w];
        if (f.a - r < 0 || f.a + r > ma || f.b - r < 0 || f.b + r > mb) problems.push({ code: "outside", feature: n });
        if (f.depth >= md) problems.push({ code: "tooDeep", feature: n });
        break;
      }
      case "chamfer": {
        const { f1, f2 } = chamferAxes(f.edge);
        const B = [w, d, h];
        if (f.size >= B[f1.axis] || f.size >= B[f2.axis]) problems.push({ code: "tooWide", feature: n });
        break;
      }
    }
  });
  return problems;
};

const MIRROR_STEP: Record<StepEdge, StepEdge> = { left: "right", right: "left", front: "back", back: "front" };
const MIRROR_CHAMFER = (edge: ChamferEdge): ChamferEdge => {
  const swap: Record<string, string> = { front: "back", back: "front", left: "right", right: "left", top: "bottom", bottom: "top" };
  const [a, b] = edge.split("-");
  // mirror the second face (top-front → top-back; front-left → front-right)
  return `${a}-${swap[b]}` as ChamferEdge;
};

/**
 * Workpieces that look like this one but differ in at least one view: for the question "which workpiece is drawn?".
 * Each changes one feature (mirrored, turned, through or not) or leaves it out.
 */
export const variantsOf = (features: Feature[], max = 6): Feature[][] => {
  const { w, d, h } = blockOf(features);
  const candidates: Feature[][] = [];
  const replace = (i: number, f: Feature) => features.map((g, j) => (j === i ? f : g));
  features.forEach((f, i) => {
    switch (f.type) {
      case "step":
        candidates.push(replace(i, { ...f, edge: MIRROR_STEP[f.edge] }));
        candidates.push(replace(i, { ...f, edge: f.edge === "left" || f.edge === "right" ? "front" : "right", width: Math.min(f.width, f.edge === "left" || f.edge === "right" ? d / 2 : w / 2) }));
        break;
      case "slot":
        candidates.push(replace(i, { ...f, along: f.along === "x" ? "y" : "x", offset: Math.min(f.offset, (f.along === "x" ? w : d) - f.width) }));
        candidates.push(replace(i, { ...f, offset: Math.max(0, (f.along === "y" ? w : d) - f.offset - f.width) }));
        break;
      case "hole": {
        const [ma, , md] = f.face === "top" ? [w, d, h] : f.face === "front" ? [w, h, d] : [d, h, w];
        candidates.push(replace(i, { ...f, depth: f.depth > 0 ? 0 : Math.round(md / 2) }));
        candidates.push(replace(i, { ...f, a: ma - f.a }));
        break;
      }
      case "chamfer":
        candidates.push(replace(i, { ...f, edge: MIRROR_CHAMFER(f.edge) }));
        break;
      case "box":
        candidates.push(replace(i, { ...f, x: w - f.x - f.w }));
        break;
    }
    if (i > 0) candidates.push(features.filter((_, j) => j !== i));
  });
  const seen = new Set([viewSignature(features)]);
  const result: Feature[][] = [];
  for (const c of candidates) {
    if (featureProblems(c).length) continue;
    const s = viewSignature(c);
    if (seen.has(s)) continue;
    seen.add(s);
    result.push(c);
    if (result.length >= max) break;
  }
  return result;
};

/**
 * Where to put several workpieces side by side (the model task): two to a row, the first row at the back, so they read
 * A B / C D from the viewer. Each offset moves a workpiece's bounds' corner nearest the origin there.
 */
export const arrange = (bounds: Bounds[]): V3[] => {
  const span = Math.max(...bounds.map((b) => Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2])));
  const gap = span * 0.45;
  const cols = bounds.length <= 2 ? bounds.length : 2;
  const w = Math.max(...bounds.map((b) => b.max[0] - b.min[0]));
  const d = Math.max(...bounds.map((b) => b.max[1] - b.min[1]));
  const rows = Math.ceil(bounds.length / cols);
  return bounds.map((b, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    return [col * (w + gap) - b.min[0], (rows - 1 - row) * (d + gap * 1.4) - b.min[1], -b.min[2]];
  });
};
