// The workpiece as a mesh, for the 3D picture: constructive solid geometry with BSP trees (after csg.js by Evan
// Wallace, MIT), on the primitives of model.ts. Also the edges to draw on the mesh and the order to paint its faces in
// for the picture without WebGL. No DOM, no three.js: tested in node (test/csg.test.ts).
import type { MeshShape, Prim, V3 } from "./model";

const EPS = 1e-5;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A cylinder wall a polygon belongs to: its axis and centre, for smooth normals and to leave out its seams. */
export type Wall = { axis: 0 | 1 | 2; c: [number, number] };

class Plane {
  n: V3;
  w: number;
  constructor(n: V3, w: number) { this.n = n; this.w = w; }
  static from(a: V3, b: V3, c: V3) {
    const n = norm(cross(sub(b, a), sub(c, a)));
    return new Plane(n, dot(n, a));
  }
  clone() { return new Plane([...this.n] as V3, this.w); }
  flip() { this.n = scale(this.n, -1); this.w = -this.w; }
  split(p: Polygon, coFront: Polygon[], coBack: Polygon[], front: Polygon[], back: Polygon[]) {
    const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;
    let type = 0;
    const types = p.vertices.map((v) => {
      const t = dot(this.n, v) - this.w;
      const k = t < -EPS ? BACK : t > EPS ? FRONT : COPLANAR;
      type |= k;
      return k;
    });
    if (type === COPLANAR) (dot(this.n, p.plane.n) > 0 ? coFront : coBack).push(p);
    else if (type === FRONT) front.push(p);
    else if (type === BACK) back.push(p);
    else {
      const f: V3[] = [], b: V3[] = [];
      for (let i = 0; i < p.vertices.length; i++) {
        const j = (i + 1) % p.vertices.length;
        const ti = types[i], tj = types[j];
        const vi = p.vertices[i], vj = p.vertices[j];
        if (ti !== BACK) f.push(vi);
        if (ti !== FRONT) b.push(vi);
        if ((ti | tj) === SPANNING) {
          const t = (this.w - dot(this.n, vi)) / dot(this.n, sub(vj, vi));
          const v = lerp(vi, vj, t);
          f.push(v);
          b.push(v);
        }
      }
      if (f.length >= 3) front.push(new Polygon(f, p.wall, p.plane));
      if (b.length >= 3) back.push(new Polygon(b, p.wall, p.plane));
    }
  }
}

export class Polygon {
  plane: Plane;
  vertices: V3[];
  wall: Wall | null;
  constructor(vertices: V3[], wall: Wall | null = null, plane?: Plane) {
    this.vertices = vertices;
    this.wall = wall;
    this.plane = plane ? plane.clone() : Plane.from(vertices[0], vertices[1], vertices[2]);
  }
  clone() { return new Polygon(this.vertices.map((v) => [...v] as V3), this.wall, this.plane); }
  flip() { this.vertices.reverse(); this.plane.flip(); }
  get normal(): V3 { return this.plane.n; }
}

class Node {
  plane: Plane | null = null;
  front: Node | null = null;
  back: Node | null = null;
  polygons: Polygon[] = [];
  constructor(polygons?: Polygon[]) { if (polygons) this.build(polygons); }
  invert() {
    for (const p of this.polygons) p.flip();
    this.plane?.flip();
    this.front?.invert();
    this.back?.invert();
    [this.front, this.back] = [this.back, this.front];
  }
  clipPolygons(polygons: Polygon[]): Polygon[] {
    if (!this.plane) return polygons.slice();
    let front: Polygon[] = [], back: Polygon[] = [];
    for (const p of polygons) this.plane.split(p, front, back, front, back);
    if (this.front) front = this.front.clipPolygons(front);
    back = this.back ? this.back.clipPolygons(back) : [];
    return front.concat(back);
  }
  clipTo(bsp: Node) {
    this.polygons = bsp.clipPolygons(this.polygons);
    this.front?.clipTo(bsp);
    this.back?.clipTo(bsp);
  }
  allPolygons(): Polygon[] {
    const list = this.polygons.slice();
    if (this.front) list.push(...this.front.allPolygons());
    if (this.back) list.push(...this.back.allPolygons());
    return list;
  }
  build(polygons: Polygon[]) {
    if (!polygons.length) return;
    if (!this.plane) this.plane = polygons[0].plane.clone();
    const front: Polygon[] = [], back: Polygon[] = [];
    for (const p of polygons) this.plane.split(p, this.polygons, this.polygons, front, back);
    if (front.length) (this.front ??= new Node()).build(front);
    if (back.length) (this.back ??= new Node()).build(back);
  }
}

const union = (a: Polygon[], b: Polygon[]) => {
  const A = new Node(a.map((p) => p.clone())), B = new Node(b.map((p) => p.clone()));
  A.clipTo(B); B.clipTo(A); B.invert(); B.clipTo(A); B.invert();
  A.build(B.allPolygons());
  return A.allPolygons();
};
const subtract = (a: Polygon[], b: Polygon[]) => {
  const A = new Node(a.map((p) => p.clone())), B = new Node(b.map((p) => p.clone()));
  A.invert(); A.clipTo(B); B.clipTo(A); B.invert(); B.clipTo(A); B.invert();
  A.build(B.allPolygons());
  A.invert();
  return A.allPolygons();
};

/** Faces of a convex solid, each turned to face away from its centre. */
const outward = (faces: V3[][], centre: V3, wall: (i: number) => Wall | null = () => null) =>
  faces.map((f, i) => {
    const p = new Polygon(f, wall(i));
    if (dot(p.normal, sub(f[0], centre)) < 0) p.flip();
    return p;
  });

const withAxis = (axis: number, along: number, u: number, v: number): V3 => {
  const p: V3 = [0, 0, 0];
  const [i0, i1] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
  p[axis] = along;
  p[i0] = u;
  p[i1] = v;
  return p;
};

/** The polygons of a primitive's solid; cylinders with `segments` sides. */
export const shapePolygons = (m: MeshShape, segments = 48): Polygon[] => {
  if (m.shape === "box") {
    const [x0, y0, z0] = m.min, [x1, y1, z1] = m.max;
    const c: V3 = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    const P = (x: number, y: number, z: number): V3 => [x, y, z];
    return outward([
      [P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)],
      [P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0)],
      [P(x0, y0, z0), P(x0, y0, z1), P(x1, y0, z1), P(x1, y0, z0)],
      [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)],
      [P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)],
      [P(x0, y0, z1), P(x0, y1, z1), P(x1, y1, z1), P(x1, y0, z1)],
    ], c);
  }
  if (m.shape === "prism") {
    const at = (p: V3, a: number): V3 => { const q: V3 = [...p] as V3; q[m.axis] = a; return q; };
    const lo = m.tri.map((p) => at(p, m.lo));
    const hi = m.tri.map((p) => at(p, m.hi));
    const c = scale(add(add(lo[0], lo[1]), add(lo[2], add(hi[0], add(hi[1], hi[2])))), 1 / 6);
    return outward([lo, hi, ...[0, 1, 2].map((i) => [lo[i], lo[(i + 1) % 3], hi[(i + 1) % 3], hi[i]])], c);
  }
  const ring = (along: number) =>
    Array.from({ length: segments }, (_, i) => {
      const a = (i / segments) * 2 * Math.PI;
      return withAxis(m.axis, along, m.c[0] + m.r * Math.cos(a), m.c[1] + m.r * Math.sin(a));
    });
  const lo = ring(m.from), hi = ring(m.to);
  const c = withAxis(m.axis, (m.from + m.to) / 2, m.c[0], m.c[1]);
  const sides = lo.map((_, i) => [lo[i], lo[(i + 1) % segments], hi[(i + 1) % segments], hi[i]]);
  const wall: Wall = { axis: m.axis, c: m.c };
  return outward([lo, hi, ...sides], c, (i) => (i >= 2 ? wall : null));
};

/** The surface of the workpiece: everything added, minus everything cut away. */
export const solidPolygons = (prims: Prim[], segments = 48): Polygon[] => {
  let result: Polygon[] = [];
  for (const p of prims.filter((q) => q.op === 1)) result = result.length ? union(result, shapePolygons(p.mesh, segments)) : shapePolygons(p.mesh, segments);
  for (const p of prims.filter((q) => q.op === -1)) result = subtract(result, shapePolygons(p.mesh, segments));
  return result;
};

/** The normal to shade a vertex with: smooth on a cylinder wall, the face's own elsewhere. */
export const vertexNormal = (p: Polygon, v: V3): V3 => {
  if (!p.wall) return p.normal;
  const radial = withAxis(p.wall.axis, 0, 0, 0);
  const [i0, i1] = p.wall.axis === 0 ? [1, 2] : p.wall.axis === 1 ? [0, 2] : [0, 1];
  radial[i0] = v[i0] - p.wall.c[0];
  radial[i1] = v[i1] - p.wall.c[1];
  const r = norm(radial);
  return dot(r, p.normal) >= 0 ? r : scale(r, -1);
};

/** Triangles of the mesh: positions and normals, three numbers per vertex. */
export const triangles = (polygons: Polygon[]) => {
  const positions: number[] = [], normals: number[] = [];
  for (const p of polygons) {
    for (let i = 1; i + 1 < p.vertices.length; i++) {
      for (const v of [p.vertices[0], p.vertices[i], p.vertices[i + 1]]) {
        positions.push(...v);
        normals.push(...vertexNormal(p, v));
      }
    }
  }
  return { positions, normals };
};

/**
 * The edges to draw on the mesh: where two faces meet at an angle. A polygon edge where the face goes on in the same
 * plane (the BSP split it) is left out, and so are the seams of a cylinder wall along its axis.
 * `inside` tells whether a point is in the material (model.ts).
 */
export const creaseEdges = (polygons: Polygon[], inside: (p: V3) => boolean, delta = 0.05): [V3, V3][] => {
  const seen = new Set<string>();
  const edges: [V3, V3][] = [];
  const key = (a: V3, b: V3) => {
    const k = (v: V3) => v.map((x) => Math.round(x * 100)).join(",");
    const [s, t] = [k(a), k(b)].sort();
    return `${s}|${t}`;
  };
  for (const p of polygons) {
    const n = p.normal;
    for (let i = 0; i < p.vertices.length; i++) {
      const a = p.vertices[i], b = p.vertices[(i + 1) % p.vertices.length];
      const e = sub(b, a);
      const len = Math.hypot(...e);
      if (len < 1e-6) continue;
      if (p.wall && Math.abs(e[p.wall.axis]) > 0.999 * len) continue;
      const k = key(a, b);
      if (seen.has(k)) continue;
      // the vertices go round counter-clockwise seen from outside: out of the polygon is e × n
      const outOfPolygon = norm(cross(e, n));
      const m = scale(add(a, b), 0.5);
      const beyond = add(m, scale(outOfPolygon, delta));
      const goesOn = inside(add(beyond, scale(n, -delta))) && !inside(add(beyond, scale(n, delta)));
      if (goesOn) continue;
      seen.add(k);
      edges.push([a, b]);
    }
  }
  return edges;
};

/**
 * The faces turned towards a viewer looking in direction `dir`, back to front: the order to paint them in (a BSP
 * tree of the surface gives it exactly).
 */
export const paintOrder = (polygons: Polygon[], dir: V3): Polygon[] => {
  const tree = new Node(polygons.map((p) => p.clone()));
  const out: Polygon[] = [];
  const walk = (node: Node | null) => {
    if (!node || !node.plane) return;
    // the viewer is on the front side of the plane when it looks against its normal
    const viewerInFront = dot(node.plane.n, dir) < 0;
    walk(viewerInFront ? node.back : node.front);
    for (const p of node.polygons) if (dot(p.normal, dir) < 0) out.push(p);
    walk(viewerInFront ? node.front : node.back);
  };
  walk(tree);
  return out;
};

/** The volume enclosed by the polygons (for tests). */
export const volumeOf = (polygons: Polygon[]) => {
  let v = 0;
  for (const p of polygons) for (let i = 1; i + 1 < p.vertices.length; i++) v += dot(p.vertices[0], cross(p.vertices[i], p.vertices[i + 1])) / 6;
  return v;
};
