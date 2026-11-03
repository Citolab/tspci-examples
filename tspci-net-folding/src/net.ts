// Nets of solids, without imports (node tests run this file as it is): the faces on the grid, the hinges between
// them, folding (each face turns about the edge it shares with its parent in a spanning tree of the net), the check
// whether the folded net closes (open edges, overlapping faces), opposite and adjacent faces, the corners for the
// complete mode, and the puzzle the author makes (data-puzzle) with its correct response.

export type Side = "N" | "E" | "S" | "W";
export const SIDES: Side[] = ["N", "E", "S", "W"];

/**
 * A face of a net on the grid, in cells. A rectangle covers w × h cells from (x, y) (w and h default to 1). A
 * triangle (equilateral, side 1) lies in cell (x, y) with its base on the given side of that cell.
 */
export type Face = { x: number; y: number; w?: number; h?: number; base?: Side; label?: string };

export type Solid = "cube" | "box" | "prism" | "pyramid";
export const SOLIDS: Solid[] = ["cube", "box", "prism", "pyramid"];
export type Mode = "build" | "opposite" | "adjacent" | "complete" | "folds";
export const MODES: Mode[] = ["build", "opposite", "adjacent", "complete", "folds"];
export type LabelKind = "letters" | "dots" | "colors";
export const LABEL_KINDS: LabelKind[] = ["letters", "dots", "colors"];
/** Colour-blind safe colours (Okabe and Ito); every colour also gets its own pattern and its name on the face. */
export const COLORS = ["blue", "orange", "green", "yellow", "sky", "red", "purple", "grey"] as const;
export const COLOR_HEX: Record<string, string> = {
  blue: "#0072B2", orange: "#E69F00", green: "#009E73", yellow: "#F0E442", sky: "#56B4E9", red: "#D55E00", purple: "#CC79A7", grey: "#9CA3AF",
};

export type Puzzle = {
  mode: Mode;
  solid: Solid;
  /** a box: length × width × height, in cells */
  box: [number, number, number];
  /** the grid the author draws on, and the candidate builds on */
  columns: number;
  rows: number;
  labels: LabelKind;
  /** build: the example solution (shown in solution status); folds: the nets to choose from; else: one net */
  nets: Face[][];
  /** opposite and adjacent: the face asked about (f1 …) */
  ask: string | null;
  /** complete: the faces the candidate labels */
  blanks: string[];
  /** complete: the corner the shown solid shows, three face ids */
  view: string[];
};

export const MIN_GRID = 3;
export const MAX_GRID = 14;
export const MAX_BOX = 4;
export const MAX_NETS = 8;
export const MAX_BLANKS = 4;
const EPS = 1e-5;
const H = Math.sqrt(3) / 2;

export type P2 = [number, number];
export type P3 = [number, number, number];

// --- faces on the grid

export const isTri = (f: Face) => f.base !== undefined;
export const widthOf = (f: Face) => (isTri(f) ? 1 : f.w ?? 1);
export const heightOf = (f: Face) => (isTri(f) ? 1 : f.h ?? 1);

/** The corners of a face in grid units (x to the right, y down). */
export const polygon = (f: Face): P2[] => {
  const { x, y } = f;
  switch (f.base) {
    case "N": return [[x, y], [x + 1, y], [x + 0.5, y + H]];
    case "S": return [[x + 1, y + 1], [x, y + 1], [x + 0.5, y + 1 - H]];
    case "W": return [[x, y + 1], [x, y], [x + H, y + 0.5]];
    case "E": return [[x + 1, y], [x + 1, y + 1], [x + 1 - H, y + 0.5]];
    default: {
      const w = widthOf(f), h = heightOf(f);
      return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    }
  }
};

export const centroid = (points: P2[]): P2 => [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];

/** The cells a face takes. */
export const cellsOf = (f: Face): P2[] => {
  const cells: P2[] = [];
  for (let dy = 0; dy < heightOf(f); dy++) for (let dx = 0; dx < widthOf(f); dx++) cells.push([f.x + dx, f.y + dy]);
  return cells;
};

/** A shape as a solid knows it: "tri", or a rectangle as "1x2" (short side first). */
export const shapeKey = (f: Face) => (isTri(f) ? "tri" : `${Math.min(widthOf(f), heightOf(f))}x${Math.max(widthOf(f), heightOf(f))}`);

/** Faces in reading order, so that face ids (f1, f2 …) follow from the net itself. */
export const sortFaces = (faces: Face[]): Face[] =>
  [...faces].sort((a, b) => a.y - b.y || a.x - b.x || Number(isTri(a)) - Number(isTri(b)) || SIDES.indexOf(a.base ?? "N") - SIDES.indexOf(b.base ?? "N"));

export const faceId = (index: number) => `f${index + 1}`;
export const faceIndex = (id: string | null | undefined) => {
  const m = /^f(\d+)$/.exec(id ?? "");
  return m ? Number(m[1]) - 1 : -1;
};
export const netId = (index: number) => `n${index + 1}`;

export const faceAt = (faces: Face[], x: number, y: number) => faces.findIndex((f) => cellsOf(f).some(([cx, cy]) => cx === x && cy === y));

/** Whether a face fits on the grid without covering another one. */
export const fits = (faces: Face[], face: Face, columns: number, rows: number) =>
  cellsOf(face).every(([x, y]) => x >= 0 && y >= 0 && x < columns && y < rows && faceAt(faces, x, y) < 0);

export const place = (faces: Face[], face: Face, columns: number, rows: number): Face[] | null =>
  fits(faces, face, columns, rows) ? sortFaces([...faces, face]) : null;

export const removeAt = (faces: Face[], x: number, y: number): Face[] => {
  const i = faceAt(faces, x, y);
  return i < 0 ? faces : faces.filter((_, k) => k !== i);
};

/** The side of a cell that borders a face, for a triangle placed there (the preferred side first). */
export const triangleSides = (faces: Face[], x: number, y: number): Side[] => {
  const step: Record<Side, P2> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
  return SIDES.filter((s) => {
    const i = faceAt(faces, x + step[s][0], y + step[s][1]);
    if (i < 0) return false;
    // the neighbour must have a whole edge on this side: a rectangle, or a triangle with its base here
    const n = faces[i];
    const opposite: Record<Side, Side> = { N: "S", S: "N", E: "W", W: "E" };
    return !isTri(n) || n.base === opposite[s];
  });
};

/** The faces of a net without anything outside the grid or on top of another face. */
export const cleanFaces = (raw: unknown, columns = MAX_GRID, rows = MAX_GRID): Face[] => {
  const faces: Face[] = [];
  if (!Array.isArray(raw)) return faces;
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const x = Math.round(Number((r as any).x)), y = Math.round(Number((r as any).y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const face: Face = { x, y };
    const base = (r as any).base;
    if (SIDES.includes(base)) face.base = base;
    else {
      const w = Math.round(Number((r as any).w ?? 1)), h = Math.round(Number((r as any).h ?? 1));
      if (!(w >= 1 && h >= 1 && w <= MAX_BOX && h <= MAX_BOX)) continue;
      if (w !== 1) face.w = w;
      if (h !== 1) face.h = h;
    }
    const label = cleanLabel((r as any).label);
    if (label) face.label = label;
    if (fits(faces, face, columns, rows)) faces.push(face);
  }
  return sortFaces(faces);
};

/** A label: one or two letters or digits, or a colour (they become part of an identifier in the complete mode). */
export const cleanLabel = (value: unknown): string => {
  const text = String(value ?? "").trim();
  return /^[A-Za-z0-9]{1,2}$/.test(text) || (COLORS as readonly string[]).includes(text) ? text : "";
};

/** A net without labels, as it is in a response. */
export const shapeOnly = (faces: Face[]) => faces.map(({ label: _, ...rest }) => rest);

// --- 4 × 4 matrices (row major) for the folds

export type Mat = number[];
const identity = (): Mat => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export const multiply = (a: Mat, b: Mat): Mat => {
  const m = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) m[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
  return m;
};
export const apply = (m: Mat, p: P3): P3 => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
  m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
  m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
];
const applyDir = (m: Mat, d: P3): P3 => [m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[4] * d[0] + m[5] * d[1] + m[6] * d[2], m[8] * d[0] + m[9] * d[1] + m[10] * d[2]];
/** A turn by angle about the line through p along the unit vector u (Rodrigues). */
const rotation = (p: P3, u: P3, angle: number): Mat => {
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  const [x, y, z] = u;
  const r = [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
  const rp = [r[0] * p[0] + r[1] * p[1] + r[2] * p[2], r[3] * p[0] + r[4] * p[1] + r[5] * p[2], r[6] * p[0] + r[7] * p[1] + r[8] * p[2]];
  return [r[0], r[1], r[2], p[0] - rp[0], r[3], r[4], r[5], p[1] - rp[1], r[6], r[7], r[8], p[2] - rp[2], 0, 0, 0, 1];
};

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: P3) => Math.sqrt(dot(a, a));
const near = (a: P3, b: P3, eps = EPS) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps;
const sameEdge = (a1: P3, a2: P3, b1: P3, b2: P3, eps = EPS) => (near(a1, b1, eps) && near(a2, b2, eps)) || (near(a1, b2, eps) && near(a2, b1, eps));
const to3 = (p: P2): P3 => [p[0], p[1], 0];

// --- hinges and folding

/** Two faces that share a whole edge in the net: the paper is not cut there. */
export type Hinge = { a: number; b: number; p: P2; q: P2 };

export const hinges = (faces: Face[]): Hinge[] => {
  const polys = faces.map(polygon);
  const out: Hinge[] = [];
  for (let a = 0; a < faces.length; a++)
    for (let b = a + 1; b < faces.length; b++)
      for (let i = 0; i < polys[a].length; i++)
        for (let j = 0; j < polys[b].length; j++) {
          const a1 = polys[a][i], a2 = polys[a][(i + 1) % polys[a].length];
          const b1 = polys[b][j], b2 = polys[b][(j + 1) % polys[b].length];
          if (sameEdge(to3(a1), to3(a2), to3(b1), to3(b2))) out.push({ a, b, p: a1, q: a2 });
        }
  return out;
};

/** How far a face turns at a hinge when the net is folded (π minus the angle between the faces in the solid). */
export const foldAngle = (solid: Solid, a: Face, b: Face): number => {
  const tris = Number(isTri(a)) + Number(isTri(b));
  if (solid === "prism") return tris === 0 ? (2 * Math.PI) / 3 : Math.PI / 2;
  if (solid === "pyramid") {
    if (tris === 1) return Math.PI - Math.acos(1 / Math.sqrt(3));
    if (tris === 2) return Math.PI - Math.acos(-1 / 3);
  }
  return Math.PI / 2;
};

export type Fold = {
  /** per face: where its points go (net coordinates; the printed side looks to +z and folds away from it) */
  matrices: Mat[];
  /** per face: its corners in 3D */
  points: P3[][];
  /** per face: its outward normal (the printed side) */
  normals: P3[];
  /** per face: the face it hangs from (-1 for the face that stays put in its part of the net) */
  parent: number[];
  /** the parts of the net that are not joined to each other */
  components: number[][];
};

/**
 * Folds the net: in each part of the net the face with the most neighbours stays put, and every other face turns
 * about the edge it shares with its parent in a breadth-first tree, by progress × its fold angle.
 */
export const fold = (faces: Face[], solid: Solid, progress = 1): Fold => {
  const n = faces.length;
  const links = hinges(faces);
  const neighbours: { other: number; hinge: Hinge }[][] = faces.map(() => []);
  for (const h of links) {
    neighbours[h.a].push({ other: h.b, hinge: h });
    neighbours[h.b].push({ other: h.a, hinge: h });
  }
  const matrices: Mat[] = faces.map(() => identity());
  const parent = faces.map(() => -1);
  const seen = faces.map(() => false);
  const components: number[][] = [];
  for (let start = 0; start < n; start++) {
    if (seen[start]) continue;
    // the part of the net with this face
    const part: number[] = [];
    const stack = [start];
    seen[start] = true;
    while (stack.length) {
      const f = stack.pop()!;
      part.push(f);
      for (const { other } of neighbours[f]) if (!seen[other]) { seen[other] = true; stack.push(other); }
    }
    part.sort((x, y) => x - y);
    components.push(part);
    const root = part.reduce((best, f) => (neighbours[f].length > neighbours[best].length ? f : best), part[0]);
    const visited = new Set([root]);
    const queue = [root];
    while (queue.length) {
      const f = queue.shift()!;
      for (const { other, hinge } of neighbours[f]) {
        if (visited.has(other)) continue;
        visited.add(other);
        parent[other] = f;
        const p = to3(hinge.p), q = to3(hinge.q);
        const d = sub(q, p);
        const u: P3 = [d[0] / length(d), d[1] / length(d), 0];
        const c = centroid(polygon(faces[other]));
        const v: P3 = [c[0] - p[0], c[1] - p[1], 0];
        // the face turns away from the printed side (to -z)
        const side = u[0] * v[1] - u[1] * v[0];
        const angle = foldAngle(solid, faces[f], faces[other]) * progress * (side > 0 ? -1 : 1);
        matrices[other] = multiply(matrices[f], rotation(p, u, angle));
        queue.push(other);
      }
    }
  }
  const points = faces.map((f, i) => polygon(f).map((p) => apply(matrices[i], to3(p))));
  const normals = matrices.map((m) => applyDir(m, [0, 0, 1]));
  return { matrices, points, normals, parent, components };
};

// --- does it close?

export type Analysis = {
  fold: Fold;
  /** edges of faces that meet no other face */
  gaps: number;
  /** pairs of faces on top of each other, or an edge where three faces meet */
  overlaps: number;
  /** faces with an overlap */
  overlapping: number[];
  /** the faces join into one piece */
  connected: boolean;
  /** one piece without open edges or overlaps */
  closed: boolean;
  /** per face: the faces it shares an edge with in the folded solid */
  adjacent: number[][];
  /** per face: the face opposite it (parallel, facing the other way), or -1 */
  opposite: number[];
};

/** Two convex polygons in one plane overlap with an area (separating axis test). */
const overlapInPlane = (a: P3[], b: P3[], normal: P3) => {
  const axes: P3[] = [];
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) axes.push(cross(normal, sub(poly[(i + 1) % poly.length], poly[i])));
  return axes.every((axis) => {
    const pa = a.map((p) => dot(p, axis)), pb = b.map((p) => dot(p, axis));
    const scale = length(axis);
    return Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) > 1e-4 * scale;
  });
};

export const analyze = (faces: Face[], solid: Solid): Analysis => {
  const f = fold(faces, solid, 1);
  const n = faces.length;
  const adjacent: number[][] = faces.map(() => []);
  let gaps = 0;
  const overlapping = new Set<number>();
  let overlaps = 0;
  for (let i = 0; i < n; i++) {
    const poly = f.points[i];
    for (let e = 0; e < poly.length; e++) {
      const a1 = poly[e], a2 = poly[(e + 1) % poly.length];
      const matches: number[] = [];
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const other = f.points[j];
        for (let k = 0; k < other.length; k++) if (sameEdge(a1, a2, other[k], other[(k + 1) % other.length], 1e-4)) matches.push(j);
      }
      if (matches.length === 0) gaps++;
      if (matches.length > 1) {
        overlapping.add(i);
        if (i < Math.min(...matches)) overlaps++;
      }
      for (const j of matches) if (!adjacent[i].includes(j)) adjacent[i].push(j);
    }
  }
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const ni = f.normals[i], nj = f.normals[j];
      if (Math.abs(dot(ni, nj)) < 1 - 1e-6) continue;
      if (Math.abs(dot(ni, sub(f.points[j][0], f.points[i][0]))) > 1e-4) continue;
      if (overlapInPlane(f.points[i], f.points[j], ni)) {
        overlaps++;
        overlapping.add(i);
        overlapping.add(j);
      }
    }
  const connected = f.components.length <= 1;
  const closed = n > 0 && connected && gaps === 0 && overlaps === 0;
  const opposite = faces.map((_, i) => {
    if (!closed) return -1;
    const j = faces.findIndex((__, k) => k !== i && dot(f.normals[i], f.normals[k]) < -1 + 1e-6);
    return j;
  });
  adjacent.forEach((list) => list.sort((x, y) => x - y));
  return { fold: f, gaps, overlaps, overlapping: [...overlapping].sort((x, y) => x - y), connected, closed, adjacent, opposite };
};

/** The shapes of the faces of a solid, sorted. */
export const targetShapes = (solid: Solid, box: [number, number, number]): string[] => {
  const rect = (a: number, b: number) => `${Math.min(a, b)}x${Math.max(a, b)}`;
  switch (solid) {
    case "cube": return Array(6).fill("1x1");
    case "box": {
      const [l, w, h] = box;
      return [rect(l, w), rect(l, w), rect(l, h), rect(l, h), rect(w, h), rect(w, h)].sort();
    }
    case "prism": return ["1x1", "1x1", "1x1", "tri", "tri"];
    case "pyramid": return ["1x1", "tri", "tri", "tri", "tri"];
  }
};

export const sameShapes = (faces: Face[], solid: Solid, box: [number, number, number]) =>
  faces.map(shapeKey).sort().join(" ") === targetShapes(solid, box).join(" ");

/** The net folds into the solid: it closes, and its faces are the solid's faces. */
export const foldsInto = (faces: Face[], solid: Solid, box: [number, number, number]) =>
  sameShapes(faces, solid, box) && analyze(faces, solid).closed;

/** The tiles a candidate builds with: rectangles (w × h) and, for a prism or a pyramid, the triangle. */
export type Tile = { w: number; h: number } | "tri";
export const tilesFor = (solid: Solid, box: [number, number, number]): Tile[] => {
  if (solid === "prism" || solid === "pyramid") return [{ w: 1, h: 1 }, "tri"];
  if (solid === "cube") return [{ w: 1, h: 1 }];
  const [l, w, h] = box;
  const keys = new Set<string>();
  const tiles: Tile[] = [];
  for (const [a, b] of [[l, w], [l, h], [w, h]]) {
    const key = `${Math.min(a, b)}x${Math.max(a, b)}`;
    if (keys.has(key)) continue;
    keys.add(key);
    tiles.push({ w: Math.max(a, b), h: Math.min(a, b) });
  }
  return tiles;
};

/** A net that folds into the solid, from (x, y): a cross for a cube or a box, a strip for a prism, a star for a pyramid. */
export const standardNet = (solid: Solid, box: [number, number, number], x = 0, y = 0): Face[] => {
  const r = (fx: number, fy: number, w = 1, h = 1): Face => {
    const face: Face = { x: x + fx, y: y + fy };
    if (w !== 1) face.w = w;
    if (h !== 1) face.h = h;
    return face;
  };
  const t = (fx: number, fy: number, base: Side): Face => ({ x: x + fx, y: y + fy, base });
  if (solid === "prism") return sortFaces([r(0, 1), r(1, 1), r(2, 1), t(1, 0, "S"), t(1, 2, "N")]);
  if (solid === "pyramid") return sortFaces([r(1, 1), t(1, 0, "S"), t(1, 2, "N"), t(0, 1, "E"), t(2, 1, "W")]);
  const [l, w, h] = solid === "cube" ? [1, 1, 1] : box;
  // a strip of side, bottom, side, top (w high), with the front and the back above and below the bottom
  return sortFaces([r(0, h, h, w), r(h, h, l, w), r(h + l, h, h, w), r(2 * h + l, h, l, w), r(h, 0, l, h), r(h, h + w, l, h)]);
};

/** The size of a net's bounding box, in cells. */
export const extent = (faces: Face[]) => {
  if (!faces.length) return { x: 0, y: 0, columns: 0, rows: 0 };
  const xs = faces.flatMap((f) => [f.x, f.x + widthOf(f)]), ys = faces.flatMap((f) => [f.y, f.y + heightOf(f)]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, columns: Math.max(...xs) - x, rows: Math.max(...ys) - y };
};

// --- corners: the complete mode shows a corner of the solid

/** Three faces that meet in a vertex and each share an edge, in turning order (det of the normals > 0), the lowest first. */
export const corners = (a: Analysis): number[][] => {
  const { points, normals } = a.fold;
  const vertices: P3[] = [];
  for (const poly of points) for (const p of poly) if (!vertices.some((v) => near(v, p, 1e-4))) vertices.push(p);
  const out: number[][] = [];
  const keys = new Set<string>();
  for (const v of vertices) {
    const at = points.map((poly, i) => (poly.some((p) => near(p, v, 1e-4)) ? i : -1)).filter((i) => i >= 0);
    for (let i = 0; i < at.length; i++)
      for (let j = i + 1; j < at.length; j++)
        for (let k = j + 1; k < at.length; k++) {
          const [p, q, r] = [at[i], at[j], at[k]];
          if (!a.adjacent[p].includes(q) || !a.adjacent[q].includes(r) || !a.adjacent[p].includes(r)) continue;
          const triple = dot(normals[p], cross(normals[q], normals[r])) > 0 ? [p, q, r] : [p, r, q];
          const key = triple.join(",");
          if (!keys.has(key)) { keys.add(key); out.push(triple); }
        }
  }
  return out.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
};

/** A corner as the author stored it, back in turning order with the lowest face first; null when it is no corner. */
export const cornerOf = (a: Analysis, ids: string[]): number[] | null => {
  const idx = ids.map(faceIndex);
  if (idx.length !== 3 || idx.some((i) => i < 0)) return null;
  const sorted = [...idx].sort((x, y) => x - y).join(",");
  return corners(a).find((c) => [...c].sort((x, y) => x - y).join(",") === sorted) ?? null;
};

/**
 * Labels (per face, "" when empty) make the shown corner: some corner of the folded net carries the shown labels
 * on faces of the same shapes, in the same turning order.
 */
export const showsCorner = (faces: Face[], all: number[][], labels: string[], shown: string[], shownShapes: string[]) =>
  all.some((c) =>
    [0, 1, 2].some((r) => [0, 1, 2].every((k) => {
      const face = c[(k + r) % 3];
      return labels[face] === shown[k] && shapeKey(faces[face]) === shownShapes[k];
    })));

// --- the puzzle (data-puzzle)

const LETTERS = "ABCDEFGHIJ".split("");

/** The labels a candidate can give a face in the complete mode. */
export const paletteFor = (p: Puzzle): string[] => {
  if (p.labels === "dots") return ["1", "2", "3", "4", "5", "6"];
  const used = [...new Set((p.nets[0] ?? []).map((f) => f.label).filter(Boolean) as string[])];
  if (p.labels === "colors") return COLORS.filter((c) => used.includes(c));
  return used.sort();
};

export const defaultLabels = (kind: LabelKind, count: number): string[] =>
  Array.from({ length: count }, (_, i) => (kind === "dots" ? String((i % 6) + 1) : kind === "colors" ? COLORS[i % COLORS.length] : LETTERS[i % LETTERS.length]));

const label = (faces: Face[], labels: string[]) => faces.map((f, i) => ({ ...f, label: labels[i] }));
const grid = (text: string, ox = 0, oy = 0): Face[] =>
  sortFaces(text.trim().split("\n").flatMap((line, y) => [...line.trim()].flatMap((ch, x) => (ch === "#" ? [{ x: x + ox, y: y + oy }] : []))));

/** The examples the authoring mode starts from, per mode (and the defaults without data-puzzle). */
export const EXAMPLES: Record<Mode, Puzzle> = {
  build: { mode: "build", solid: "cube", box: [2, 1, 1], columns: 6, rows: 5, labels: "letters", nets: [standardNet("cube", [1, 1, 1], 1, 1)], ask: null, blanks: [], view: [] },
  opposite: {
    mode: "opposite", solid: "cube", box: [2, 1, 1], columns: 6, rows: 5, labels: "letters",
    nets: [label(grid("##..\n.##.\n..##", 1, 1), ["P", "Q", "R", "S", "T", "U"])], ask: "f1", blanks: [], view: [],
  },
  adjacent: {
    mode: "adjacent", solid: "cube", box: [2, 1, 1], columns: 6, rows: 5, labels: "colors",
    nets: [label(grid("#...\n####\n..#.", 1, 1), ["blue", "orange", "green", "yellow", "sky", "red"])], ask: "f2", blanks: [], view: [],
  },
  complete: {
    mode: "complete", solid: "cube", box: [2, 1, 1], columns: 6, rows: 5, labels: "dots",
    // a die: the opposite faces add up to 7
    nets: [label(grid(".#..\n####\n.#..", 1, 1), ["1", "4", "2", "3", "5", "6"])], ask: null, blanks: ["f2", "f3"], view: [],
  },
  folds: {
    mode: "folds", solid: "cube", box: [2, 1, 1], columns: 6, rows: 5, labels: "letters",
    nets: [grid("###.\n..###"), grid("##..\n.###\n.#.."), grid("####\n.##."), grid("#.#\n###\n.#.")], ask: null, blanks: [], view: [],
  },
};
// the corner of the die: the faces 1, 2 (blank) and 3 (blank)
EXAMPLES.complete.view = (() => {
  const a = analyze(EXAMPLES.complete.nets[0], "cube");
  const c = corners(a).find((k) => k.includes(0) && k.includes(1) && k.includes(2));
  return (c ?? corners(a)[0]).map(faceId);
})();

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => (options.includes(value as T) ? (value as T) : fallback);
const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** data-puzzle, or the example of the default mode. Whatever cannot be read falls back to the example. */
export const parsePuzzle = (text: string | undefined | null): Puzzle => {
  let raw: any = null;
  try {
    raw = text && String(text).trim() ? JSON.parse(String(text)) : null;
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== "object") return clone(EXAMPLES.build);
  const mode = oneOf(raw.mode, MODES, "build");
  const example = EXAMPLES[mode];
  const solid = oneOf(raw.solid, SOLIDS, example.solid);
  const box = (Array.isArray(raw.box) && raw.box.length === 3 ? raw.box : example.box).map((v: unknown) => clampInt(v, 1, MAX_BOX, 1)) as [number, number, number];
  const columns = clampInt(raw.columns, MIN_GRID, MAX_GRID, example.columns);
  const rows = clampInt(raw.rows, MIN_GRID, MAX_GRID, example.rows);
  const labels = oneOf(raw.labels, LABEL_KINDS, example.labels);
  const own = Array.isArray(raw.nets);
  const nets = own ? raw.nets.slice(0, MAX_NETS).map((n: unknown) => cleanFaces(n, columns, rows)) : clone(example.nets);
  // without nets of its own, the question of the example goes with the example's net
  if (!own) for (const key of ["ask", "blanks", "view"]) if (raw[key] === undefined) raw[key] = clone(example[key as "ask"]);
  const ids = (list: unknown) => (Array.isArray(list) ? list.filter((v) => typeof v === "string" && faceIndex(v) >= 0 && faceIndex(v) < (nets[0]?.length ?? 0)) : []);
  const ask = typeof raw.ask === "string" && faceIndex(raw.ask) >= 0 && faceIndex(raw.ask) < (nets[0]?.length ?? 0) ? raw.ask : null;
  return { mode, solid, box, columns, rows, labels, nets, ask, blanks: [...new Set(ids(raw.blanks))].slice(0, MAX_BLANKS) as string[], view: ids(raw.view).slice(0, 3) as string[] };
};

export const serializePuzzle = (p: Puzzle) => JSON.stringify(p);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** The net the 3D view and the questions are about (the first one). */
export const mainNet = (p: Puzzle) => p.nets[0] ?? [];
export const solidBox = (p: Puzzle): [number, number, number] => (p.solid === "cube" ? [1, 1, 1] : p.box);

/** The candidate's labels in the complete mode: the given labels, and theirs on the blank faces. */
export const labelsWith = (p: Puzzle, filled: Record<string, string>): string[] =>
  mainNet(p).map((f, i) => (p.blanks.includes(faceId(i)) ? filled[faceId(i)] ?? "" : f.label ?? ""));

/** What the shown solid shows in the complete mode: three faces in turning order, their labels and shapes. */
export const shownCorner = (p: Puzzle) => {
  const faces = mainNet(p);
  const a = analyze(faces, p.solid);
  const corner = a.closed ? cornerOf(a, p.view) : null;
  return corner ? { corner, labels: corner.map((i) => faces[i].label ?? ""), shapes: corner.map((i) => shapeKey(faces[i])), analysis: a } : null;
};

/** The complete mode: the candidate's labels make the shown corner. */
export const completeCorrect = (p: Puzzle, filled: Record<string, string>) => {
  const shown = shownCorner(p);
  if (!shown) return false;
  return showsCorner(mainNet(p), corners(shown.analysis), labelsWith(p, filled), shown.labels, shown.shapes);
};

/** Every way to label the blank faces from the palette that makes the shown corner (at most `limit`). */
export const completions = (p: Puzzle, limit = 10): Record<string, string>[] => {
  const shown = shownCorner(p);
  if (!shown || !p.blanks.length) return [];
  const palette = paletteFor(p);
  const all = corners(shown.analysis);
  const out: Record<string, string>[] = [];
  const total = Math.pow(palette.length, p.blanks.length);
  for (let n = 0; n < total && out.length < limit; n++) {
    const filled: Record<string, string> = {};
    let rest = n;
    for (const id of p.blanks) {
      filled[id] = palette[rest % palette.length];
      rest = Math.floor(rest / palette.length);
    }
    if (showsCorner(mainNet(p), all, labelsWith(p, filled), shown.labels, shown.shapes)) out.push(filled);
  }
  return out;
};

/** The pairs of the complete mode as identifiers (f2-A), sorted. */
export const pairIds = (filled: Record<string, string>) =>
  Object.entries(filled).filter(([, v]) => v).map(([k, v]) => `${k}-${v}`).sort((a, b) => faceIndex(a.split("-")[0]) - faceIndex(b.split("-")[0]) || a.localeCompare(b));
export const parsePairs = (ids: string[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const id of ids) {
    const m = /^(f\d+)-([A-Za-z0-9]+)$/.exec(id);
    if (m && cleanLabel(m[2])) out[m[1]] = m[2];
  }
  return out;
};

/** Identifiers in the order of the faces or nets (f2 before f10). */
export const sortIds = (ids: string[]) => [...new Set(ids)].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)) || a.localeCompare(b));

/** The correct identifiers for the puzzle, or null when the settings give no single answer (and in build mode). */
export const correctIds = (p: Puzzle): string[] | null => {
  const faces = mainNet(p);
  switch (p.mode) {
    case "opposite": {
      const i = faceIndex(p.ask);
      const a = analyze(faces, p.solid);
      const j = i >= 0 ? a.opposite[i] : -1;
      return j >= 0 ? [faceId(j)] : null;
    }
    case "adjacent": {
      const i = faceIndex(p.ask);
      const a = analyze(faces, p.solid);
      return i >= 0 && a.closed ? a.adjacent[i].map(faceId) : null;
    }
    case "folds": {
      const ok = p.nets.map((n, i) => (foldsInto(n, p.solid, solidBox(p)) ? netId(i) : "")).filter(Boolean);
      return ok.length ? ok : null;
    }
    case "complete": {
      const found = completions(p, 2);
      if (found.length !== 1) return null;
      return pairIds(found[0]);
    }
    default:
      return null;
  }
};

/** The build mode: what the record response says about the candidate's net. */
export const evaluateBuild = (p: Puzzle, faces: Face[]) => {
  const a = analyze(faces, p.solid);
  const correct = a.closed && sameShapes(faces, p.solid, solidBox(p));
  return { score: correct ? 1 : 0, maxscore: 1, correct, closed: a.closed, overlap: a.overlaps > 0, gaps: a.gaps, faces: faces.length, net: JSON.stringify(shapeOnly(faces)) };
};

/** The example solution of the build mode: the author's net when it folds, else the standard net in the grid. */
export const buildSolution = (p: Puzzle): Face[] => {
  const own = mainNet(p);
  if (own.length && foldsInto(own, p.solid, solidBox(p))) return shapeOnly(own);
  const net = standardNet(p.solid, solidBox(p));
  const e = extent(net);
  const dx = Math.max(0, Math.floor((p.columns - e.columns) / 2)), dy = Math.max(0, Math.floor((p.rows - e.rows) / 2));
  return net.map((f) => ({ ...f, x: f.x + dx, y: f.y + dy }));
};

/** What keeps the puzzle from working, as keys for the texts (with a number where it matters). */
export type Problem = { key: "noNet" | "offGrid" | "exampleDoesNotFold" | "notClosed" | "noAsk" | "noOpposite" | "noBlanks" | "tooManyBlanks" | "noView" | "notUnique" | "noAnswer" | "unlabeled" | "fewNets" | "noneFold" | "allFold"; n?: number };

export const puzzleProblems = (p: Puzzle): Problem[] => {
  const problems: Problem[] = [];
  const faces = mainNet(p);
  if (p.nets.some((n) => n.some((f) => cellsOf(f).some(([x, y]) => x >= p.columns || y >= p.rows)))) problems.push({ key: "offGrid" });
  if (p.mode === "build") {
    if (faces.length && !foldsInto(faces, p.solid, solidBox(p))) problems.push({ key: "exampleDoesNotFold" });
    return problems;
  }
  if (p.mode === "folds") {
    if (p.nets.length < 2) problems.push({ key: "fewNets" });
    p.nets.forEach((n, i) => !n.length && problems.push({ key: "noNet", n: i + 1 }));
    const folding = p.nets.filter((n) => foldsInto(n, p.solid, solidBox(p))).length;
    if (!folding) problems.push({ key: "noneFold" });
    else if (folding === p.nets.length && p.nets.length > 1) problems.push({ key: "allFold" });
    return problems;
  }
  if (!faces.length) return [...problems, { key: "noNet", n: 1 }];
  if (!foldsInto(faces, p.solid, solidBox(p))) return [...problems, { key: "notClosed" }];
  if (faces.some((f) => !f.label)) problems.push({ key: "unlabeled" });
  if (p.mode === "opposite" || p.mode === "adjacent") {
    if (faceIndex(p.ask) < 0) problems.push({ key: "noAsk" });
    else if (p.mode === "opposite" && analyze(faces, p.solid).opposite[faceIndex(p.ask)] < 0) problems.push({ key: "noOpposite" });
  }
  if (p.mode === "complete") {
    if (!p.blanks.length) problems.push({ key: "noBlanks" });
    if (!shownCorner(p)) problems.push({ key: "noView" });
    else if (p.blanks.length) {
      const found = completions(p, 2);
      if (found.length > 1) problems.push({ key: "notUnique" });
      if (found.length === 0) problems.push({ key: "noAnswer" });
    }
  }
  return problems;
};

// --- editing a net on the grid (the candidate in build mode, the author on the Net tab)

export type Edit = { faces: Face[]; result: "placed" | "removed" | "turned" | "doesNotFit" | "needsNeighbour" | "none"; face?: Face };

/** The side of a cell nearest to a point in it (fractions 0..1 of the cell). */
export const nearestSide = (fx: number, fy: number): Side => {
  const d: [Side, number][] = [["N", fy], ["S", 1 - fy], ["W", fx], ["E", 1 - fx]];
  return d.sort((a, b) => a[1] - b[1])[0][0];
};

/**
 * Activates a cell with a tile: an occupied cell loses its face; an empty one gets the tile (a rectangle from this
 * cell, turned when `turned`; a triangle against the edge of a neighbouring square, the hinted side first).
 */
export const applyTile = (faces: Face[], tile: Tile, turned: boolean, x: number, y: number, columns: number, rows: number, hint?: Side): Edit => {
  const at = faceAt(faces, x, y);
  if (at >= 0) return { faces: faces.filter((_, k) => k !== at), result: "removed", face: faces[at] };
  if (tile === "tri") {
    const sides = triangleSides(faces, x, y);
    if (!sides.length) return { faces, result: "needsNeighbour" };
    const base = hint && sides.includes(hint) ? hint : sides[0];
    const face: Face = { x, y, base };
    const next = place(faces, face, columns, rows);
    return next ? { faces: next, result: "placed", face } : { faces, result: "doesNotFit" };
  }
  const w = turned ? tile.h : tile.w, h = turned ? tile.w : tile.h;
  const face: Face = { x, y };
  if (w !== 1) face.w = w;
  if (h !== 1) face.h = h;
  const next = place(faces, face, columns, rows);
  return next ? { faces: next, result: "placed", face } : { faces, result: "doesNotFit" };
};

/** Turns the face in a cell: a triangle to the next side with a square, a rectangle a quarter (when it fits). */
export const turnAt = (faces: Face[], x: number, y: number, columns: number, rows: number): Edit => {
  const at = faceAt(faces, x, y);
  if (at < 0) return { faces, result: "none" };
  const face = faces[at];
  const rest = faces.filter((_, k) => k !== at);
  if (isTri(face)) {
    const sides = triangleSides(rest, face.x, face.y);
    const order = SIDES.slice(SIDES.indexOf(face.base!) + 1).concat(SIDES.slice(0, SIDES.indexOf(face.base!) + 1));
    const base = order.find((s) => sides.includes(s));
    if (!base || base === face.base) return { faces, result: "none" };
    const turned = { ...face, base };
    return { faces: sortFaces([...rest, turned]), result: "turned", face: turned };
  }
  if (widthOf(face) === heightOf(face)) return { faces, result: "none" };
  const turned: Face = { x: face.x, y: face.y, ...(face.label ? { label: face.label } : {}) };
  if (heightOf(face) !== 1) turned.w = heightOf(face);
  if (widthOf(face) !== 1) turned.h = widthOf(face);
  const next = place(rest, turned, columns, rows);
  return next ? { faces: next, result: "turned", face: turned } : { faces, result: "doesNotFit" };
};
