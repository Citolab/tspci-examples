// The scene as numbers: the author's objects (a box, a ramp, a roof, a tank, stairs, a ladder) with their sizes and
// places, built into the points a candidate can measure between (vertices A, B, C …, midpoints of edges, centres of
// faces), the faces with their areas, and triangles for the 3D view. Measuring (lengths, angles, areas), volumes and
// the correct value of a task follow from it. No imports: `npm test` runs it in node, the 3D view only draws it.

export type Vec3 = [number, number, number];

export const OBJECT_TYPES = ["box", "ramp", "prism", "cylinder", "stairs", "ladder"] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

/** The sizes of each type, in scene units (steps: a count), with the size a new object gets. */
export const DIMENSIONS: Record<ObjectType, { key: string; default: number; integer?: boolean }[]> = {
  box: [{ key: "width", default: 1.2 }, { key: "depth", default: 0.8 }, { key: "height", default: 0.6 }],
  ramp: [{ key: "length", default: 2 }, { key: "width", default: 1 }, { key: "height", default: 0.5 }],
  prism: [{ key: "length", default: 3 }, { key: "width", default: 2 }, { key: "height", default: 1 }],
  cylinder: [{ key: "radius", default: 0.4 }, { key: "height", default: 1 }],
  stairs: [{ key: "steps", default: 4, integer: true }, { key: "run", default: 0.3 }, { key: "rise", default: 0.2 }, { key: "width", default: 1 }],
  ladder: [{ key: "reach", default: 1.2 }, { key: "height", default: 3.2 }, { key: "width", default: 0.45 }],
};

export type SceneObject = {
  /** Unique, short: the start of the ids of its points and faces ("crate" → "crate.v0"). */
  id: string;
  type: ObjectType;
  /** The name the candidate reads ("Crate"); empty: the type's name. */
  name: string;
  size: Record<string, number>;
  /** Where its origin is: the corner with the smallest x, y and z of a box, ramp, roof and stairs; the centre of the
   * bottom of a tank; the middle of the foot of a ladder. y is up. */
  position: Vec3;
  /** Degrees about the vertical axis, through the origin. */
  rotation: number;
  /** false: part of the setting (a wall), drawn but without points to measure. */
  measurable: boolean;
};

export type Scene = {
  objects: SceneObject[];
  /** The author's names of points (and faces), by id: { "crate.v0": "A" }. Vertices without one get A, B, C … */
  names: Record<string, string>;
};

export type PointKind = "vertex" | "mid" | "centre";
export type Point = {
  id: string;
  object: string;
  kind: PointKind;
  /** A vertex: its letter (or the author's name). A midpoint: the letters of the edge ("AB"); a centre: of the face. */
  label: string;
  /** The author named it: show the label as it is, not as "midpoint of AB". */
  named: boolean;
  pos: Vec3;
};
export type FacePart = "polygon" | "top" | "bottom" | "side";
export type Face = {
  id: string;
  object: string;
  part: FacePart;
  /** The letters of its vertices ("ABCD"), or the author's name; empty for the faces of a tank (see part). */
  label: string;
  area: number;
  /** The corners in order (a polygon), for drawing its outline; a tank's faces have a ring. */
  outline: Vec3[];
  centre: Vec3;
  normal: Vec3;
};
export type Built = {
  objects: SceneObject[];
  points: Point[];
  faces: Face[];
  /** Pairs of point ids: the edges, drawn as lines. */
  edges: [Vec3, Vec3][];
  /** Per object: triangles (9 numbers each) and per triangle the index of its face in `faces` (-1: not a face). */
  meshes: { object: string; positions: number[]; faceOf: number[] }[];
  /** The middle and the size of everything, for the camera. */
  centre: Vec3;
  radius: number;
};

// ---- vectors

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec3) => Math.sqrt(dot(a, a));
export const distance = (a: Vec3, b: Vec3) => length(sub(a, b));
const mid = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);
const average = (ps: Vec3[]): Vec3 => scale(ps.reduce(add, [0, 0, 0] as Vec3), 1 / ps.length);

/** The angle ABC at B, in degrees (0 when a point coincides with B). */
export const angleAt = (a: Vec3, b: Vec3, c: Vec3): number => {
  const u = sub(a, b), v = sub(c, b);
  const lu = length(u), lv = length(v);
  if (lu < 1e-12 || lv < 1e-12) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (lu * lv)))) * 180) / Math.PI;
};

/** Newell's normal of a polygon: its length is twice the area. */
const newell = (ps: Vec3[]): Vec3 => {
  const n: Vec3 = [0, 0, 0];
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i], b = ps[(i + 1) % ps.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
};
export const polygonArea = (ps: Vec3[]) => length(newell(ps)) / 2;

/** The name of a face from its corners, read around from the first letter: D C B A → "ABCD". */
export const cycleLabel = (labels: string[]): string => {
  if (!labels.length) return "";
  const i = labels.reduce((best, l, k) => (l < labels[best] ? k : best), 0);
  const forward = [...labels.slice(i), ...labels.slice(0, i)];
  const backward = [forward[0], ...forward.slice(1).reverse()];
  return (backward.join("\u0000") < forward.join("\u0000") ? backward : forward).join("");
};

/** A, B, …, Z, A1, B1, … */
export const letter = (i: number) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : "");

// ---- the scene from the settings

export const DEFAULT_SCENE: Scene = {
  objects: [
    { id: "wall", type: "box", name: "Wall", size: { width: 0.3, depth: 3, height: 3.4 }, position: [-0.3, 0, -1.5], rotation: 0, measurable: false },
    { id: "ladder", type: "ladder", name: "Ladder", size: { reach: 1.2, height: 3.2, width: 0.45 }, position: [1.2, 0, 0], rotation: 180, measurable: true },
    { id: "crate", type: "box", name: "Crate", size: { width: 1.2, depth: 0.8, height: 0.6 }, position: [1.4, 0, -1.4], rotation: 0, measurable: true },
  ],
  names: {},
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.trim().replace(",", ".")) : NaN;
  return isFinite(n) ? n : null;
};

/** One object from JSON, with every size a positive number (the type's default otherwise). Unknown type: null. */
export const parseObject = (value: any, index: number): SceneObject | null => {
  const type = OBJECT_TYPES.find((t) => t === value?.type);
  if (!type) return null;
  const size: Record<string, number> = {};
  for (const d of DIMENSIONS[type]) {
    let n = num(value?.size?.[d.key]);
    if (n === null || n <= 0) n = d.default;
    size[d.key] = d.integer ? Math.max(1, Math.min(20, Math.round(n))) : n;
  }
  const p = Array.isArray(value?.position) ? value.position : [];
  const id = typeof value?.id === "string" && /^[A-Za-z][\w-]*$/.test(value.id) ? value.id : `${type}${index + 1}`;
  return {
    id,
    type,
    name: typeof value?.name === "string" ? value.name : "",
    size,
    position: [num(p[0]) ?? 0, num(p[1]) ?? 0, num(p[2]) ?? 0],
    rotation: num(value?.rotation) ?? 0,
    measurable: value?.measurable !== false,
  };
};

/** data-scene: { objects, names } as JSON; empty or broken: the example (a ladder against a wall and a crate). */
export const parseScene = (text: unknown): Scene => {
  if (typeof text !== "string" || !text.trim()) return DEFAULT_SCENE;
  try {
    const value = JSON.parse(text);
    const list = Array.isArray(value) ? value : value?.objects;
    if (!Array.isArray(list)) return DEFAULT_SCENE;
    const objects: SceneObject[] = [];
    list.forEach((o: any, i: number) => {
      const object = parseObject(o, i);
      if (!object) return;
      while (objects.some((x) => x.id === object.id)) object.id = `${object.id}_${i + 1}`;
      objects.push(object);
    });
    const names: Record<string, string> = {};
    if (value?.names && typeof value.names === "object") {
      for (const [k, v] of Object.entries(value.names)) if (typeof v === "string" && v.trim()) names[k] = v.trim();
    }
    return { objects, names };
  } catch {
    return DEFAULT_SCENE;
  }
};

/** The scene as the authoring mode writes it to data-scene. */
export const serializeScene = (scene: Scene): string =>
  JSON.stringify({
    objects: scene.objects.map((o) => ({
      id: o.id, type: o.type, ...(o.name ? { name: o.name } : {}), size: o.size, position: o.position,
      ...(o.rotation ? { rotation: o.rotation } : {}), ...(o.measurable ? {} : { measurable: false }),
    })),
    ...(Object.keys(scene.names).length ? { names: scene.names } : {}),
  });

// ---- the shapes

type Shape = {
  vertices: Vec3[];
  /** Faces as indices into vertices, counter-clockwise from outside; with their own triangles when not convex. */
  faces: { corners: number[]; triangles?: number[][]; part?: FacePart; noCentre?: boolean }[];
};

const boxShape = (w: number, h: number, d: number): Shape => ({
  vertices: [[0, 0, d], [w, 0, d], [w, 0, 0], [0, 0, 0], [0, h, d], [w, h, d], [w, h, 0], [0, h, 0]],
  faces: [
    { corners: [3, 2, 1, 0] }, // bottom
    { corners: [4, 5, 6, 7] }, // top
    { corners: [0, 1, 5, 4] }, // front (z = d)
    { corners: [2, 3, 7, 6] }, // back
    { corners: [1, 2, 6, 5] }, // right (x = w)
    { corners: [3, 0, 4, 7] }, // left
  ],
});

/** A wedge rising from x = 0 to its height at x = length. */
const rampShape = (l: number, w: number, h: number): Shape => ({
  vertices: [[0, 0, w], [l, 0, w], [l, 0, 0], [0, 0, 0], [l, h, w], [l, h, 0]],
  faces: [
    { corners: [3, 2, 1, 0] }, // bottom
    { corners: [0, 1, 4] }, // front side
    { corners: [2, 3, 5] }, // back side
    { corners: [1, 2, 5, 4] }, // the high end
    { corners: [3, 0, 4, 5] }, // the slope
  ],
});

/** A roof: a triangular prism along x with its ridge in the middle of the width. */
const prismShape = (l: number, w: number, h: number): Shape => ({
  vertices: [[0, 0, w], [l, 0, w], [l, 0, 0], [0, 0, 0], [l, h, w / 2], [0, h, w / 2]],
  faces: [
    { corners: [3, 2, 1, 0] }, // bottom
    { corners: [0, 1, 4, 5] }, // front slope
    { corners: [2, 3, 5, 4] }, // back slope
    { corners: [1, 2, 4] }, // right gable
    { corners: [3, 0, 5] }, // left gable
  ],
});

/** Stairs rising along x: step i is run wide and (i + 1) rise high, the width along z. */
const stairsShape = (n: number, run: number, rise: number, width: number): Shape => {
  // the profile in the x-y plane, counter-clockwise: along the bottom, up the back, down the steps
  const profile: [number, number][] = [[0, 0], [n * run, 0], [n * run, n * rise]];
  for (let i = n - 1; i >= 0; i--) {
    profile.push([i * run, (i + 1) * rise]);
    if (i > 0) profile.push([i * run, i * rise]);
  }
  const m = profile.length;
  const vertices: Vec3[] = [...profile.map(([x, y]) => [x, y, width] as Vec3), ...profile.map(([x, y]) => [x, y, 0] as Vec3)];
  // the sides are not convex: per step a column from the floor to its tread
  const front: number[][] = [];
  const back: number[][] = [];
  const at = (x: number, y: number) => profile.findIndex(([px, py]) => Math.abs(px - x) < 1e-9 && Math.abs(py - y) < 1e-9);
  const extra: Vec3[] = [];
  const index = (x: number, y: number, z: number) => {
    const i = at(x, y);
    if (i >= 0) return z ? i : i + m;
    // a point of a column that is not a corner of the profile: on the floor under a step
    const found = extra.findIndex((p) => p[0] === x && p[1] === y && p[2] === z);
    if (found >= 0) return 2 * m + found;
    extra.push([x, y, z]);
    return 2 * m + extra.length - 1;
  };
  for (let i = 0; i < n; i++) {
    const x0 = i * run, x1 = (i + 1) * run, top = (i + 1) * rise;
    const a = index(x0, 0, width), b = index(x1, 0, width), c = index(x1, top, width), d = index(x0, top, width);
    front.push([a, b, c], [a, c, d]);
    const a2 = index(x0, 0, 0), b2 = index(x1, 0, 0), c2 = index(x1, top, 0), d2 = index(x0, top, 0);
    back.push([b2, a2, d2], [b2, d2, c2]);
  }
  const faces: Shape["faces"] = [
    { corners: profile.map((_, i) => i), triangles: front, noCentre: true },
    { corners: profile.map((_, i) => i + m).reverse(), triangles: back, noCentre: true },
  ];
  // the bands around the profile: bottom, back, and per step its tread and riser
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    faces.push({ corners: [i + m, j + m, j, i] });
  }
  return { vertices: [...vertices, ...extra], faces };
};

const rotate = (p: Vec3, degrees: number, origin: Vec3): Vec3 => {
  const t = (degrees * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  // as three.js rotation.y: x' = x cos + z sin, z' = −x sin + z cos
  return [origin[0] + p[0] * c + p[2] * s, origin[1] + p[1], origin[2] - p[0] * s + p[2] * c];
};

const round = (v: Vec3): Vec3 => v.map((x) => Math.round(x * 1e9) / 1e9) as Vec3;

/** The thin boxes of a ladder's rails and rungs, as triangles. */
const beam = (a: Vec3, b: Vec3, t: number, out: number[]) => {
  const axis = sub(b, a);
  const len = length(axis);
  if (len < 1e-9) return;
  const u = scale(axis, 1 / len);
  const helper: Vec3 = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const v = scale(cross(u, helper), t / length(cross(u, helper)));
  const w = scale(cross(u, v), t / length(cross(u, v)));
  const corner = (p: Vec3, sv: number, sw: number) => add(add(p, scale(v, sv)), scale(w, sw));
  const ring = (p: Vec3) => [corner(p, 1, 1), corner(p, -1, 1), corner(p, -1, -1), corner(p, 1, -1)];
  const ra = ring(a), rb = ring(b);
  const tri = (p: Vec3, q: Vec3, r: Vec3) => out.push(...p, ...q, ...r);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tri(ra[i], rb[i], rb[j]);
    tri(ra[i], rb[j], ra[j]);
  }
  tri(ra[0], ra[2], ra[1]); tri(ra[0], ra[3], ra[2]);
  tri(rb[0], rb[1], rb[2]); tri(rb[0], rb[2], rb[3]);
};

const SEGMENTS = 48;
/** The points of a tank on its rim: 0°, 90°, 180° and 270°, at the bottom and the top. */
const RIM = 4;

/** Everything that can be measured, with names, and the triangles to draw. */
export const buildScene = (scene: Scene): Built => {
  const points: Point[] = [];
  const faces: Face[] = [];
  const edges: [Vec3, Vec3][] = [];
  const meshes: Built["meshes"] = [];
  let letters = 0;
  const all: Vec3[] = [];
  const nameOf = (id: string) => scene.names[id];
  const vertexLabel = (id: string) => nameOf(id) ?? letter(letters++);

  for (const o of scene.objects) {
    const world = (p: Vec3) => round(rotate(p, o.rotation, o.position));
    const s = o.size;
    const positions: number[] = [];
    const faceOf: number[] = [];
    const pushTriangle = (a: Vec3, b: Vec3, c: Vec3, face: number) => {
      positions.push(...a, ...b, ...c);
      faceOf.push(face);
    };

    if (o.type === "cylinder") {
      const r = s.radius, h = s.height;
      const ring = (y: number, k: number) => world([r * Math.cos((2 * Math.PI * k) / SEGMENTS), y, -r * Math.sin((2 * Math.PI * k) / SEGMENTS)]);
      const bottomCentre = world([0, 0, 0]), topCentre = world([0, h, 0]);
      const bottomRing = Array.from({ length: SEGMENTS }, (_, k) => ring(0, k));
      const topRing = Array.from({ length: SEGMENTS }, (_, k) => ring(h, k));
      if (o.measurable) {
        for (let k = 0; k < RIM; k++) {
          const id = `${o.id}.b${k}`;
          points.push({ id, object: o.id, kind: "vertex", label: vertexLabel(id), named: true, pos: bottomRing[(k * SEGMENTS) / RIM] });
        }
        for (let k = 0; k < RIM; k++) {
          const id = `${o.id}.t${k}`;
          points.push({ id, object: o.id, kind: "vertex", label: vertexLabel(id), named: true, pos: topRing[(k * SEGMENTS) / RIM] });
        }
      }
      const base = faces.length;
      const faceIndex = (part: FacePart) => (o.measurable ? base + ["bottom", "top", "side"].indexOf(part) : -1);
      if (o.measurable) {
        const disc = (part: FacePart, centre: Vec3, outline: Vec3[], normal: Vec3) =>
          faces.push({ id: `${o.id}.${part}`, object: o.id, part, label: nameOf(`${o.id}.${part}`) ?? "", area: Math.PI * r * r, outline, centre, normal });
        disc("bottom", bottomCentre, bottomRing, [0, -1, 0]);
        disc("top", topCentre, topRing, [0, 1, 0]);
        faces.push({ id: `${o.id}.side`, object: o.id, part: "side", label: nameOf(`${o.id}.side`) ?? "", area: 2 * Math.PI * r * h, outline: [], centre: mid(bottomCentre, topCentre), normal: [0, 0, 0] });
        points.push({ id: `${o.id}.bottom`, object: o.id, kind: "centre", label: nameOf(`${o.id}.bottom`) ?? "", named: !!nameOf(`${o.id}.bottom`), pos: bottomCentre });
        points.push({ id: `${o.id}.top`, object: o.id, kind: "centre", label: nameOf(`${o.id}.top`) ?? "", named: !!nameOf(`${o.id}.top`), pos: topCentre });
      }
      for (let k = 0; k < SEGMENTS; k++) {
        const j = (k + 1) % SEGMENTS;
        pushTriangle(bottomCentre, bottomRing[j], bottomRing[k], faceIndex("bottom"));
        pushTriangle(topCentre, topRing[k], topRing[j], faceIndex("top"));
        pushTriangle(bottomRing[k], bottomRing[j], topRing[j], faceIndex("side"));
        pushTriangle(bottomRing[k], topRing[j], topRing[k], faceIndex("side"));
        edges.push([bottomRing[k], bottomRing[j]], [topRing[k], topRing[j]]);
      }
      for (let k = 0; k < RIM; k++) edges.push([bottomRing[(k * SEGMENTS) / RIM], topRing[(k * SEGMENTS) / RIM]]);
      all.push(...bottomRing, ...topRing);
    } else if (o.type === "ladder") {
      const { reach, height, width } = s;
      const corners: Vec3[] = [[0, 0, width / 2], [0, 0, -width / 2], [reach, height, -width / 2], [reach, height, width / 2]].map((p) => world(p as Vec3));
      if (o.measurable) {
        corners.forEach((pos, k) => {
          const id = `${o.id}.v${k}`;
          points.push({ id, object: o.id, kind: "vertex", label: vertexLabel(id), named: true, pos });
        });
        const labels = points.slice(-4).map((p) => p.label);
        const midpoint = (key: string, a: number, b: number) =>
          points.push({ id: `${o.id}.${key}`, object: o.id, kind: "mid", label: nameOf(`${o.id}.${key}`) ?? labels[a] + labels[b], named: !!nameOf(`${o.id}.${key}`), pos: round(mid(corners[a], corners[b])) });
        midpoint("foot", 0, 1);
        midpoint("top", 2, 3);
        midpoint("m03", 0, 3);
        midpoint("m12", 1, 2);
      }
      const t = width * 0.08;
      beam(corners[0], corners[3], t, positions);
      beam(corners[1], corners[2], t, positions);
      const len = distance(corners[0], corners[3]);
      const rungs = Math.max(3, Math.round(len / 0.3));
      for (let k = 1; k < rungs; k++) {
        const f = k / rungs;
        beam(add(corners[0], scale(sub(corners[3], corners[0]), f)), add(corners[1], scale(sub(corners[2], corners[1]), f)), t * 0.7, positions);
      }
      for (let k = 0; k < positions.length / 9; k++) faceOf.push(-1);
      edges.push([corners[0], corners[3]], [corners[1], corners[2]]);
      all.push(...corners);
    } else {
      const shape =
        o.type === "box" ? boxShape(s.width, s.height, s.depth)
        : o.type === "ramp" ? rampShape(s.length, s.width, s.height)
        : o.type === "prism" ? prismShape(s.length, s.width, s.height)
        : stairsShape(s.steps, s.run, s.rise, s.width);
      const vs = shape.vertices.map(world);
      // the corners of the faces are the vertices to measure (stairs have helper points that are not)
      const used = new Set(shape.faces.flatMap((f) => f.corners));
      const labelOf: string[] = [];
      vs.forEach((pos, i) => {
        if (!used.has(i)) return;
        const id = `${o.id}.v${i}`;
        labelOf[i] = o.measurable ? vertexLabel(id) : "";
        if (o.measurable) points.push({ id, object: o.id, kind: "vertex", label: labelOf[i], named: true, pos });
      });
      const seen = new Set<string>();
      const mids: Point[] = [];
      shape.faces.forEach((f, fi) => {
        const outline = f.corners.map((i) => vs[i]);
        const n = newell(outline);
        const area = length(n) / 2;
        const index = o.measurable ? faces.length : -1;
        if (o.measurable) {
          const id = `${o.id}.f${fi}`;
          const label = nameOf(id) ?? cycleLabel(f.corners.map((i) => labelOf[i]));
          faces.push({ id, object: o.id, part: "polygon", label, area, outline, centre: round(average(outline)), normal: scale(n, 1 / (2 * area)) });
          if (!f.noCentre) points.push({ id: `${id}.c`, object: o.id, kind: "centre", label: nameOf(`${id}.c`) ?? label, named: !!nameOf(`${id}.c`), pos: round(average(outline)) });
        }
        const triangles = f.triangles ?? f.corners.slice(1, -1).map((_, k) => [f.corners[0], f.corners[k + 1], f.corners[k + 2]]);
        triangles.forEach(([a, b, c]) => pushTriangle(vs[a], vs[b], vs[c], index));
        f.corners.forEach((a, k) => {
          const b = f.corners[(k + 1) % f.corners.length];
          const key = a < b ? `${a}-${b}` : `${b}-${a}`;
          if (seen.has(key)) return;
          seen.add(key);
          edges.push([vs[a], vs[b]]);
          if (o.measurable) {
            const id = `${o.id}.e${key}`;
            mids.push({ id, object: o.id, kind: "mid", label: nameOf(id) ?? labelOf[Math.min(a, b)] + labelOf[Math.max(a, b)], named: !!nameOf(id), pos: round(mid(vs[a], vs[b])) });
          }
        });
      });
      points.push(...mids);
      all.push(...vs);
    }
    meshes.push({ object: o.id, positions, faceOf });
  }

  // the camera looks at the middle of everything
  if (!all.length) all.push([0, 0, 0]);
  const min = [0, 1, 2].map((k) => Math.min(...all.map((p) => p[k])));
  const max = [0, 1, 2].map((k) => Math.max(...all.map((p) => p[k])));
  const centre: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.max(0.5, distance(min as Vec3, max as Vec3) / 2);
  // the vertices first, then midpoints, then centres: the order of the lists
  const order: Record<PointKind, number> = { vertex: 0, mid: 1, centre: 2 };
  const sorted = points.map((p, i) => ({ p, i })).sort((a, b) => order[a.p.kind] - order[b.p.kind] || a.i - b.i).map((x) => x.p);
  return { objects: scene.objects, points: sorted, faces, edges, meshes, centre, radius };
};

// ---- measuring

/** A point of a measurement: a named point (id), or a point on a face where the candidate clicked (face, pos). */
export type PointRef = { id: string } | { face: string; pos: Vec3 };
export type Measurement =
  | { tool: "tape"; points: [PointRef, PointRef] }
  | { tool: "protractor"; points: [PointRef, PointRef, PointRef] }
  | { tool: "area"; face: string };
export const TOOLS = ["tape", "protractor", "area"] as const;
export type Tool = (typeof TOOLS)[number];

export const pointById = (built: Built, id: string) => built.points.find((p) => p.id === id);
export const faceById = (built: Built, id: string) => built.faces.find((f) => f.id === id);

/** Where a point of a measurement is; null when the scene has no such point (any more). */
export const positionOf = (built: Built, ref: PointRef): Vec3 | null => {
  if ("id" in ref) return pointById(built, ref.id)?.pos ?? null;
  return faceById(built, ref.face) ? ref.pos : null;
};

/** A measurement in scene units: a length, an angle in degrees or an area; null when a point or face is gone. */
export const measure = (built: Built, m: Measurement): number | null => {
  if (m.tool === "area") return faceById(built, m.face)?.area ?? null;
  const ps = m.points.map((r) => positionOf(built, r));
  if (ps.some((p) => !p)) return null;
  return m.tool === "tape" ? distance(ps[0], ps[1]) : angleAt(ps[0], ps[1], ps[2]);
};

/** The value in the unit the candidate reads: lengths times the scale, areas times its square; angles stay degrees. */
export const scaled = (value: number, tool: Tool | "volume", factor: number) =>
  tool === "tape" ? value * factor : tool === "area" ? value * factor * factor : tool === "volume" ? value * factor ** 3 : value;

/** A measurement whose points and face are all in the scene. */
export const validMeasurement = (built: Built, value: any): Measurement | null => {
  const ref = (r: any): PointRef | null => {
    if (typeof r?.id === "string") return pointById(built, r.id) ? { id: r.id } : null;
    if (typeof r?.face === "string" && Array.isArray(r.pos) && r.pos.length === 3 && r.pos.every((x: unknown) => typeof x === "number" && isFinite(x)))
      return faceById(built, r.face) ? { face: r.face, pos: [r.pos[0], r.pos[1], r.pos[2]] } : null;
    return null;
  };
  if (value?.tool === "area") return typeof value.face === "string" && faceById(built, value.face) ? { tool: "area", face: value.face } : null;
  const count = value?.tool === "tape" ? 2 : value?.tool === "protractor" ? 3 : 0;
  if (!count || !Array.isArray(value.points) || value.points.length !== count) return null;
  const refs = value.points.map(ref);
  if (refs.some((r: PointRef | null) => !r)) return null;
  return { tool: value.tool, points: refs } as Measurement;
};

// ---- volumes and the task

/** The volume of an object in scene units, or null (a ladder). */
export const volumeOf = (o: SceneObject): number | null => {
  const s = o.size;
  switch (o.type) {
    case "box": return s.width * s.depth * s.height;
    case "ramp":
    case "prism": return (s.length * s.width * s.height) / 2;
    case "cylinder": return Math.PI * s.radius * s.radius * s.height;
    case "stairs": return (s.width * s.run * s.rise * s.steps * (s.steps + 1)) / 2;
    default: return null;
  }
};

/** What the candidate is asked: a length between two points, the angle at the middle one of three, an area, a volume. */
export type Target =
  | { kind: "length"; points: [string, string] }
  | { kind: "angle"; points: [string, string, string] }
  | { kind: "area"; face: string }
  | { kind: "volume"; object: string };
export const TARGET_KINDS = ["length", "angle", "area", "volume"] as const;

/** The example's: how long is the ladder (from its foot A to its top D). */
export const DEFAULT_TARGET: Target = { kind: "length", points: ["ladder.v0", "ladder.v3"] };

/** data-target as JSON; empty: the example's when the scene is the example, otherwise none; broken: none. */
export const parseTarget = (text: unknown, isDefaultScene: boolean): Target | null => {
  if (typeof text !== "string" || !text.trim()) return isDefaultScene ? DEFAULT_TARGET : null;
  try {
    const v = JSON.parse(text);
    const ids = (n: number) => Array.isArray(v?.points) && v.points.length === n && v.points.every((p: unknown) => typeof p === "string");
    if (v?.kind === "length" && ids(2)) return { kind: "length", points: [v.points[0], v.points[1]] };
    if (v?.kind === "angle" && ids(3)) return { kind: "angle", points: [v.points[0], v.points[1], v.points[2]] };
    if (v?.kind === "area" && typeof v.face === "string") return { kind: "area", face: v.face };
    if (v?.kind === "volume" && typeof v.object === "string") return { kind: "volume", object: v.object };
  } catch {
    // not JSON
  }
  return null;
};

/** The answer to the task in the candidate's unit (the scale applied), or null when the scene does not have it. */
export const correctValue = (built: Built, target: Target | null, factor: number): number | null => {
  if (!target) return null;
  if (target.kind === "volume") {
    const o = built.objects.find((x) => x.id === target.object);
    const v = o ? volumeOf(o) : null;
    return v === null ? null : scaled(v, "volume", factor);
  }
  const m: Measurement =
    target.kind === "area" ? { tool: "area", face: target.face }
    : target.kind === "length" ? { tool: "tape", points: [{ id: target.points[0] }, { id: target.points[1] }] }
    : { tool: "protractor", points: [{ id: target.points[0] }, { id: target.points[1] }, { id: target.points[2] }] };
  const value = measure(built, m);
  return value === null ? null : scaled(value, m.tool, factor);
};

/** The tool that measures a target directly (a volume has none: it takes several lengths). */
export const toolOfTarget = (target: Target): Tool | null =>
  target.kind === "length" ? "tape" : target.kind === "angle" ? "protractor" : target.kind === "area" ? "area" : null;

/**
 * Did the candidate make the measurement the task asks for? A length: the tape between the two points (either way);
 * an angle: the protractor with the same vertex and the same two other points; an area: that face. A volume: a length
 * on the object, at least one. Points on a face count when they are within `near` of the named point.
 */
export const madeTarget = (built: Built, target: Target | null, measurements: Measurement[], near = 1e-6): boolean => {
  if (!target) return false;
  const at = (ref: PointRef, id: string) => {
    if ("id" in ref && ref.id === id) return true;
    const p = pointById(built, id);
    const q = positionOf(built, ref);
    return !!p && !!q && distance(p.pos, q) <= near;
  };
  return measurements.some((m) => {
    if (target.kind === "area") return m.tool === "area" && m.face === target.face;
    if (target.kind === "length")
      return m.tool === "tape" && ((at(m.points[0], target.points[0]) && at(m.points[1], target.points[1])) || (at(m.points[0], target.points[1]) && at(m.points[1], target.points[0])));
    if (target.kind === "angle")
      return m.tool === "protractor" && at(m.points[1], target.points[1]) &&
        ((at(m.points[0], target.points[0]) && at(m.points[2], target.points[2])) || (at(m.points[0], target.points[2]) && at(m.points[2], target.points[0])));
    const owner = (ref: PointRef) => ("id" in ref ? pointById(built, ref.id)?.object : faceById(built, ref.face)?.object);
    return m.tool === "tape" && m.points.every((r) => owner(r) === target.object);
  });
};

/** The screen point nearest to (x, y) within `max` pixels: its index, or -1. */
export const nearestOnScreen = (candidates: { x: number; y: number }[], x: number, y: number, max: number) => {
  let best = -1, bestD = max;
  candidates.forEach((c, i) => {
    const d = Math.hypot(c.x - x, c.y - y);
    if (d <= bestD) { best = i; bestD = d; }
  });
  return best;
};
