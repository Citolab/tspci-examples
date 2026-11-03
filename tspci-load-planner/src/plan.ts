// The load plan without a picture: the cargo space, the boxes, where the candidate put them, gravity, the metrics and
// the author's checks. No imports, so node runs the tests on this file as it is (npm test).
//
// Coordinates in cm. x runs from the front of the cargo space (behind the cab; 0) to the door (length), y from the
// left wall (0) to the right wall (width), z from the floor (0) up. A box lies at its lowest corner (x, y, z).

export type SpaceKind = "van" | "container" | "pallet";
export const SPACE_KINDS: SpaceKind[] = ["van", "container", "pallet"];

export type Axles = {
  /** where the front and rear axle are, in cm from the front of the cargo space (the front axle is usually negative) */
  front: number;
  rear: number;
  /** the payload each axle may carry, in kg (0: no limit) */
  maxFront: number;
  maxRear: number;
};

export type Space = {
  kind: SpaceKind;
  length: number;
  width: number;
  /** the height of the cargo space; for a pallet the highest the load may be */
  height: number;
  /** kg */
  maxPayload: number;
  /** the snap of the positions, in cm */
  grid: number;
  /** only for a van: the axles, for the axle loads */
  axles: Axles | null;
};

export type Box = {
  id: string;
  label: string;
  /** cm, as the box stands upright */
  length: number;
  width: number;
  height: number;
  /** kg */
  weight: number;
  /** "this side up": the box may turn around the vertical axis, never tip over */
  upright: boolean;
  /** nothing may stand on it */
  fragile: boolean;
  /** the delivery stop (1 is unloaded first), or null */
  stop: number | null;
};

/** Which side of the box (l, w, h) lies along x, y and z. "lwh" is the box as it is described, upright. */
export type Orientation = "lwh" | "wlh" | "lhw" | "hlw" | "whl" | "hwl";
export const ORIENTATIONS: Orientation[] = ["lwh", "wlh", "lhw", "hlw", "whl", "hwl"];

export type Placed = { id: string; x: number; y: number; z: number; o: Orientation };

export type CheckType = "allLoaded" | "stable" | "upright" | "fragile" | "maxWeight" | "cog" | "unloadOrder" | "heavyBottom" | "axles";
export const CHECK_TYPES: CheckType[] = ["allLoaded", "stable", "upright", "fragile", "maxWeight", "cog", "unloadOrder", "heavyBottom", "axles"];

export type Check = {
  type: CheckType;
  points: number;
  /** cog: the largest offset of the centre of gravity from the middle, front/back (x) and left/right (y), in cm */
  x?: number;
  y?: number;
};

export type Plan = {
  space: Space;
  boxes: Box[];
  checks: Check[];
  /** the least part of a box's base that must rest on the floor or on boxes, in % */
  support: number;
  /** the checks other than allLoaded only pass when every box is loaded */
  requireAll: boolean;
  /** the author's example solution */
  solution: Placed[] | null;
};

export const MAX_CHECKS = 10;
export const MAX_BOXES = 40;
const EPS = 1e-6;

// --- the example: a delivery van with eight boxes for three stops

export const EXAMPLE_PLAN: Plan = {
  space: { kind: "van", length: 300, width: 170, height: 160, maxPayload: 800, grid: 10, axles: { front: -90, rear: 210, maxFront: 350, maxRear: 320 } },
  boxes: [
    { id: "A", label: "Washing machine", length: 60, width: 60, height: 90, weight: 70, upright: true, fragile: false, stop: 3 },
    { id: "B", label: "Dryer", length: 60, width: 60, height: 90, weight: 45, upright: true, fragile: false, stop: 3 },
    { id: "C", label: "Television", length: 130, width: 20, height: 80, weight: 15, upright: true, fragile: true, stop: 2 },
    { id: "D", label: "Garden tiles", length: 60, width: 40, height: 30, weight: 120, upright: false, fragile: false, stop: 2 },
    { id: "E", label: "Paint", length: 60, width: 40, height: 40, weight: 60, upright: true, fragile: false, stop: 2 },
    { id: "F", label: "Books", length: 40, width: 30, height: 30, weight: 25, upright: false, fragile: false, stop: 1 },
    { id: "G", label: "Books", length: 40, width: 30, height: 30, weight: 25, upright: false, fragile: false, stop: 1 },
    { id: "H", label: "Lamps", length: 50, width: 50, height: 60, weight: 6, upright: true, fragile: true, stop: 1 },
  ],
  checks: [
    { type: "allLoaded", points: 1 },
    { type: "stable", points: 1 },
    { type: "upright", points: 1 },
    { type: "fragile", points: 1 },
    { type: "unloadOrder", points: 2 },
    { type: "heavyBottom", points: 1 },
    { type: "cog", points: 1, x: 40, y: 20 },
    { type: "axles", points: 1 },
  ],
  support: 70,
  requireAll: true,
  solution: [
    { id: "A", x: 0, y: 0, z: 0, o: "lwh" },
    { id: "B", x: 0, y: 60, z: 0, o: "lwh" },
    { id: "C", x: 0, y: 150, z: 0, o: "lwh" },
    { id: "E", x: 60, y: 0, z: 0, o: "lwh" },
    { id: "D", x: 180, y: 130, z: 0, o: "lwh" },
    { id: "F", x: 260, y: 0, z: 0, o: "lwh" },
    { id: "G", x: 260, y: 0, z: 30, o: "lwh" },
    { id: "H", x: 250, y: 120, z: 0, o: "lwh" },
  ],
};

/** Typical cargo spaces, for the authoring mode. */
export const SPACE_PRESETS: Record<SpaceKind, Space> = {
  van: EXAMPLE_PLAN.space,
  container: { kind: "container", length: 590, width: 230, height: 230, maxPayload: 21000, grid: 10, axles: null },
  pallet: { kind: "pallet", length: 120, width: 80, height: 150, maxPayload: 1000, grid: 10, axles: null },
};

// --- reading and writing

const num = (v: unknown, fallback: number, min: number, max: number) => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

export const parseSpace = (raw: any): Space => {
  const d = SPACE_PRESETS[SPACE_KINDS.includes(raw?.kind) ? (raw.kind as SpaceKind) : "van"];
  const kind = d.kind;
  const a = raw?.axles;
  const axles: Axles | null =
    kind === "van" && a && typeof a === "object"
      ? { front: num(a.front, -90, -500, 2000), rear: num(a.rear, 210, -500, 2000), maxFront: num(a.maxFront, 0, 0, 100000), maxRear: num(a.maxRear, 0, 0, 100000) }
      : kind === "van" && raw?.axles === undefined ? d.axles : null;
  if (axles && axles.rear <= axles.front) axles.rear = axles.front + 100;
  return {
    kind,
    length: Math.round(num(raw?.length, d.length, 10, 2000)),
    width: Math.round(num(raw?.width, d.width, 10, 1000)),
    height: Math.round(num(raw?.height, d.height, 10, 1000)),
    maxPayload: num(raw?.maxPayload, d.maxPayload, 1, 100000),
    grid: Math.round(num(raw?.grid, 10, 1, 100)),
    axles,
  };
};

const truthy = (v: unknown) => v === true || /^(1|true|yes|ja|j|y|x|✓)$/i.test(String(v ?? "").trim());

export const parseBox = (raw: any, index: number): Box => ({
  id: String(raw?.id ?? "").trim() || `box${index + 1}`,
  label: String(raw?.label ?? "").trim() || `Box ${index + 1}`,
  length: Math.round(num(raw?.length, 40, 1, 2000)),
  width: Math.round(num(raw?.width, 30, 1, 1000)),
  height: Math.round(num(raw?.height, 30, 1, 1000)),
  weight: round1(num(raw?.weight, 10, 0, 100000)),
  upright: truthy(raw?.upright),
  fragile: truthy(raw?.fragile),
  stop: raw?.stop === null || raw?.stop === undefined || raw?.stop === "" ? null : Math.round(num(raw.stop, 1, 1, 99)),
});

/** Box ids are unique: a second "A" becomes "A2". */
export const uniqueIds = (boxes: Box[]): Box[] => {
  const seen = new Set<string>();
  return boxes.map((b) => {
    let id = b.id;
    for (let n = 2; seen.has(id); n++) id = `${b.id}${n}`;
    seen.add(id);
    return id === b.id ? b : { ...b, id };
  });
};

export const parseCheck = (raw: any): Check | null => {
  if (!CHECK_TYPES.includes(raw?.type)) return null;
  const check: Check = { type: raw.type, points: Math.round(num(raw.points, 1, 0, 100)) };
  if (raw.type === "cog") {
    check.x = num(raw.x, 40, 0, 1000);
    check.y = num(raw.y, 20, 0, 1000);
  }
  return check;
};

export const isOrientation = (o: unknown): o is Orientation => ORIENTATIONS.includes(o as Orientation);
export const allowed = (box: Box, o: Orientation) => !box.upright || o[2] === "h";

/** The placement of a response, a state or the author: only boxes of the plan, once each, in the space, settled. */
export const ownPlacement = (plan: Plan, raw: unknown): Placed[] => {
  const list: any[] = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.boxes) ? (raw as any).boxes : [];
  const seen = new Set<string>();
  const result: Placed[] = [];
  for (const r of list) {
    const box = plan.boxes.find((b) => b.id === String(r?.id));
    if (!box || seen.has(box.id)) continue;
    const o: Orientation = isOrientation(r.o) && allowed(box, r.o) ? r.o : "lwh";
    seen.add(box.id);
    result.push(clampToSpace(plan, box, { id: box.id, x: num(r.x, 0, -1e5, 1e5), y: num(r.y, 0, -1e5, 1e5), z: num(r.z, 0, 0, 1e5), o }, false));
  }
  return settle(plan, result);
};

export const parsePlan = (text: string | undefined | null): Plan => {
  if (!text || !String(text).trim()) return clonePlan(EXAMPLE_PLAN);
  let raw: any;
  try {
    raw = JSON.parse(String(text));
  } catch {
    return clonePlan(EXAMPLE_PLAN);
  }
  const boxes = uniqueIds((Array.isArray(raw?.boxes) ? raw.boxes : []).slice(0, MAX_BOXES).map(parseBox));
  const plan: Plan = {
    space: parseSpace(raw?.space),
    boxes,
    checks: (Array.isArray(raw?.checks) ? raw.checks : []).map(parseCheck).filter(Boolean).slice(0, MAX_CHECKS) as Check[],
    support: Math.round(num(raw?.support, 70, 0, 100)),
    requireAll: raw?.requireAll === undefined ? true : truthy(raw.requireAll),
    solution: null,
  };
  if (Array.isArray(raw?.solution)) plan.solution = ownPlacement(plan, raw.solution);
  return plan;
};

export const clonePlan = (p: Plan): Plan => JSON.parse(JSON.stringify(p));
export const serializePlan = (p: Plan): string => JSON.stringify(p);

/**
 * Boxes from a table, as an author pastes it from a spreadsheet: label, length, width, height, weight, this side up,
 * fragile, stop, count (tabs or semicolons; a header row and empty lines are skipped; a decimal comma is fine).
 * Returns the boxes and the line numbers it could not read.
 */
export const parseBoxesTsv = (text: string): { boxes: Box[]; errors: number[] } => {
  const boxes: Box[] = [];
  const errors: number[] = [];
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const cells = line.split(line.includes("\t") ? "\t" : ";").map((c) => c.trim());
    const nums = cells.slice(1, 5).map((c) => Number(c.replace(",", ".")));
    if (nums.length < 4 || nums.some((n) => !Number.isFinite(n) || n <= 0)) {
      // the first line may be a header
      if (!(boxes.length === 0 && errors.length === 0 && i === lines.findIndex((l) => l.trim()))) errors.push(i + 1);
      return;
    }
    const count = Math.min(MAX_BOXES, Math.max(1, Math.round(Number(cells[8]) || 1)));
    for (let k = 0; k < count && boxes.length < MAX_BOXES; k++) {
      const index = boxes.length;
      boxes.push(parseBox({ id: boxId(index), label: cells[0], length: nums[0], width: nums[1], height: nums[2], weight: nums[3], upright: cells[5], fragile: cells[6], stop: cells[7] || null }, index));
    }
  });
  return { boxes, errors };
};

/** A, B, … Z, AA, AB, … */
export const boxId = (index: number): string => {
  let s = "";
  let n = index;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

export const boxesToTsv = (boxes: Box[]): string =>
  boxes.map((b) => [b.label, b.length, b.width, b.height, b.weight, b.upright ? "yes" : "", b.fragile ? "yes" : "", b.stop ?? ""].join("\t")).join("\n");

// --- geometry

const SIDE = { l: "length", w: "width", h: "height" } as const;

/** The size of a box along x, y and z in an orientation. */
export const dims = (box: Box, o: Orientation): [number, number, number] => [box[SIDE[o[0]]], box[SIDE[o[1]]], box[SIDE[o[2]]]];

/** 90° around the vertical axis: what lay along x now lies along y. */
export const turned = (o: Orientation): Orientation => (o[1] + o[0] + o[2]) as Orientation;
/** Tipped over (90° around y): what stood up now lies along x. R and T together reach all six orientations. */
export const tipped = (o: Orientation): Orientation => (o[2] + o[1] + o[0]) as Orientation;

export type Solid = Placed & { box: Box; dx: number; dy: number; dz: number };

export const solidOf = (plan: Plan, p: Placed): Solid | null => {
  const box = plan.boxes.find((b) => b.id === p.id);
  if (!box) return null;
  const [dx, dy, dz] = dims(box, p.o);
  return { ...p, box, dx, dy, dz };
};
export const solidsOf = (plan: Plan, placed: Placed[]): Solid[] => placed.map((p) => solidOf(plan, p)).filter(Boolean) as Solid[];

const overlap1 = (a1: number, a2: number, b1: number, b2: number) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
/** The area two boxes share seen from above, in cm². */
export const footprintOverlap = (a: Solid, b: Solid) => overlap1(a.x, a.x + a.dx, b.x, b.x + b.dx) * overlap1(a.y, a.y + a.dy, b.y, b.y + b.dy);
export const overlaps3d = (a: Solid, b: Solid) =>
  footprintOverlap(a, b) > EPS && overlap1(a.z, a.z + a.dz, b.z, b.z + b.dz) > EPS;

const snap = (v: number, grid: number) => Math.round(v / grid) * grid;

/** On the grid, and within the walls (a box larger than the space lies against the front or left wall). */
export const clampToSpace = (plan: Plan, box: Box, p: Placed, snapToGrid = true): Placed => {
  const [dx, dy] = dims(box, p.o);
  const { length, width, grid } = plan.space;
  const x = snapToGrid ? snap(p.x, grid) : p.x;
  const y = snapToGrid ? snap(p.y, grid) : p.y;
  return { ...p, x: Math.max(0, Math.min(length - dx, x)), y: Math.max(0, Math.min(width - dy, y)) };
};

/** The height a box comes to rest at on the floor and the given boxes. */
const restHeight = (s: Solid, below: Solid[]) => below.reduce((z, q) => (footprintOverlap(s, q) > EPS ? Math.max(z, q.z + q.dz) : z), 0);

/**
 * Gravity: every box falls until it rests on the floor or on a box. The boxes fall in the order of their height
 * (`last`, the box the candidate just put down, after the others at the same height), so a stack keeps its order.
 */
export const settle = (plan: Plan, placed: Placed[], last?: string): Placed[] => {
  const order = placed.map((p, i) => ({ p, i })).sort((a, b) => a.p.z - b.p.z || (a.p.id === last ? 1 : 0) - (b.p.id === last ? 1 : 0) || a.i - b.i);
  const done: Solid[] = [];
  const z = new Map<string, number>();
  for (const { p } of order) {
    const s = solidOf(plan, p);
    if (!s) continue;
    s.z = restHeight(s, done);
    done.push(s);
    z.set(p.id, s.z);
  }
  return placed.filter((p) => z.has(p.id)).map((p) => (p.z === z.get(p.id) ? p : { ...p, z: z.get(p.id)! }));
};

// --- what the candidate does (each returns the new placement, or the same one when nothing changes)

const TOP = 1e7;

/** A box onto the plan (or picked up and put down elsewhere): at (x, y), on top of what is there. */
export const put = (plan: Plan, placed: Placed[], id: string, x: number, y: number, o?: Orientation): Placed[] => {
  const box = plan.boxes.find((b) => b.id === id);
  if (!box) return placed;
  const before = placed.find((p) => p.id === id);
  const orientation = o ?? before?.o ?? "lwh";
  const p = clampToSpace(plan, box, { id, x, y, z: TOP, o: allowed(box, orientation) ? orientation : "lwh" });
  const others = placed.filter((q) => q.id !== id);
  return settle(plan, before ? placed.map((q) => (q.id === id ? p : q)) : [...others, p], id);
};

/** A step with the arrow keys: the box slides at its height; what it slides under or onto settles. */
export const shift = (plan: Plan, placed: Placed[], id: string, dx: number, dy: number): Placed[] => {
  const p = placed.find((q) => q.id === id);
  const box = plan.boxes.find((b) => b.id === id);
  if (!p || !box) return placed;
  const grid = plan.space.grid;
  const next = clampToSpace(plan, box, { ...p, x: p.x + dx * grid, y: p.y + dy * grid });
  if (next.x === p.x && next.y === p.y) return placed;
  return settle(plan, placed.map((q) => (q.id === id ? next : q)), id);
};

/** Dragged in the side view: the box slides to (x, y) at its height, as with the arrow keys. */
export const slide = (plan: Plan, placed: Placed[], id: string, x: number, y: number): Placed[] => {
  const p = placed.find((q) => q.id === id);
  const box = plan.boxes.find((b) => b.id === id);
  if (!p || !box) return placed;
  const next = clampToSpace(plan, box, { ...p, x, y });
  if (next.x === p.x && next.y === p.y) return placed;
  return settle(plan, placed.map((q) => (q.id === id ? next : q)), id);
};

/** Turned on the spot (R, or T for tipping over); against a wall it moves back inside. */
export const reorient = (plan: Plan, placed: Placed[], id: string, how: "turn" | "tip"): Placed[] => {
  const p = placed.find((q) => q.id === id);
  const box = plan.boxes.find((b) => b.id === id);
  if (!p || !box) return placed;
  const o = how === "turn" ? turned(p.o) : tipped(p.o);
  if (!allowed(box, o)) return placed;
  const next = clampToSpace(plan, box, { ...p, o }, false);
  return settle(plan, placed.map((q) => (q.id === id ? next : q)), id);
};

/**
 * A layer up (PgUp): the box goes on top of the next box above it in its stack. A layer down (PgDn): it goes under
 * the box it rests on. The others settle.
 */
export const layer = (plan: Plan, placed: Placed[], id: string, direction: 1 | -1): Placed[] => {
  const me = solidOf(plan, placed.find((q) => q.id === id) ?? ({} as Placed));
  if (!me) return placed;
  const others = solidsOf(plan, placed).filter((s) => s.id !== id && footprintOverlap(s, me) > EPS);
  const target =
    direction === 1
      ? others.filter((s) => s.z > me.z + EPS).sort((a, b) => a.z - b.z)[0]
      : others.filter((s) => s.z < me.z - EPS).sort((a, b) => b.z - a.z)[0];
  if (!target) return placed;
  const z = direction === 1 ? target.z + 0.5 : target.z - 0.5;
  return settle(plan, placed.map((q) => (q.id === id ? { ...q, z } : q)));
};

export const unload = (plan: Plan, placed: Placed[], id: string): Placed[] =>
  placed.some((p) => p.id === id) ? settle(plan, placed.filter((p) => p.id !== id)) : placed;

/**
 * Where a box can go when the candidate loads it without saying where (Enter on the list): the lowest, deepest place
 * where it fits under the roof with enough support and not on a fragile box. Null when there is none.
 */
export const freeSpot = (plan: Plan, placed: Placed[], id: string): Placed | null => {
  const box = plan.boxes.find((b) => b.id === id);
  if (!box) return null;
  const others = solidsOf(plan, placed.filter((p) => p.id !== id));
  const { length, width, height, grid } = plan.space;
  let best: Placed | null = null;
  for (const o of ["lwh", "wlh"] as Orientation[]) {
    const [dx, dy, dz] = dims(box, o);
    if (dx > length || dy > width) continue;
    const xs = new Set<number>(), ys = new Set<number>();
    for (let x = 0; x <= length - dx + EPS; x += grid) xs.add(x);
    xs.add(length - dx);
    for (let y = 0; y <= width - dy + EPS; y += grid) ys.add(y);
    ys.add(width - dy);
    for (const x of xs) for (const y of ys) {
      const s: Solid = { id, x, y, z: 0, o, box, dx, dy, dz };
      s.z = restHeight(s, others);
      if (s.z + dz > height + EPS) continue;
      if (best && (s.z > best.z + EPS || (Math.abs(s.z - best.z) < EPS && (x > best.x + EPS || (Math.abs(x - best.x) < EPS && y >= best.y))))) continue;
      if (supportOf(s, others) * 100 < plan.support - EPS) continue;
      if (others.some((q) => q.box.fragile && footprintOverlap(s, q) > EPS && q.z + q.dz <= s.z + EPS)) continue;
      best = { id, x, y, z: s.z, o };
    }
    if (best) return best;
  }
  return best;
};

// --- metrics

/** The part of the base of a box that rests on the floor or on boxes right under it (0..1). */
export const supportOf = (s: Solid, all: Solid[]): number => {
  if (s.z < EPS) return 1;
  const area = s.dx * s.dy;
  let under = 0;
  for (const q of all) if (q.id !== s.id && Math.abs(q.z + q.dz - s.z) < EPS) under += footprintOverlap(s, q);
  return Math.min(1, under / area);
};

/** The boxes a box stands on directly. */
export const restsOn = (s: Solid, all: Solid[]) => all.filter((q) => q.id !== s.id && Math.abs(q.z + q.dz - s.z) < EPS && footprintOverlap(s, q) > EPS);
/** The boxes anywhere above a box (overlapping it seen from above). */
export const above = (s: Solid, all: Solid[]) => all.filter((q) => q.id !== s.id && q.z >= s.z + s.dz - EPS && footprintOverlap(s, q) > EPS);

export const inside = (plan: Plan, s: Solid) =>
  s.x >= -EPS && s.y >= -EPS && s.z >= -EPS &&
  s.x + s.dx <= plan.space.length + EPS && s.y + s.dy <= plan.space.width + EPS && s.z + s.dz <= plan.space.height + EPS;

export type Metrics = {
  loaded: number;
  /** % of the cargo space the loaded boxes fill */
  volume: number;
  weight: number;
  /** the centre of gravity of the load, in the space's coordinates; null without boxes */
  cog: { x: number; y: number; z: number } | null;
  /** its offset from the middle of the floor: + towards the door (x) and to the right (y) */
  offset: { x: number; y: number } | null;
  /** the payload on each axle, for a van with axles */
  axles: { front: number; rear: number } | null;
};

export const metrics = (plan: Plan, placed: Placed[]): Metrics => {
  const solids = solidsOf(plan, placed);
  const { length, width, height } = plan.space;
  const weight = solids.reduce((sum, s) => sum + s.box.weight, 0);
  const volume = solids.reduce((sum, s) => sum + s.dx * s.dy * s.dz, 0) / (length * width * height) * 100;
  let cog: Metrics["cog"] = null;
  if (solids.length) {
    // boxes without weight still count, all alike, so the marker means something
    const w = (s: Solid) => (weight > 0 ? s.box.weight : 1);
    const total = solids.reduce((sum, s) => sum + w(s), 0);
    cog = {
      x: solids.reduce((sum, s) => sum + w(s) * (s.x + s.dx / 2), 0) / total,
      y: solids.reduce((sum, s) => sum + w(s) * (s.y + s.dy / 2), 0) / total,
      z: solids.reduce((sum, s) => sum + w(s) * (s.z + s.dz / 2), 0) / total,
    };
  }
  const a = plan.space.axles;
  let axles: Metrics["axles"] = null;
  if (a && plan.space.kind === "van") {
    const rear = cog ? (weight * (cog.x - a.front)) / (a.rear - a.front) : 0;
    axles = { front: weight - rear, rear };
  }
  return {
    loaded: solids.length,
    volume,
    weight,
    cog,
    offset: cog ? { x: cog.x - length / 2, y: cog.y - width / 2 } : null,
    axles,
  };
};

// --- the checks

export type CheckResult = { passed: boolean; /** the boxes that fail it */ boxes: string[] };
export type Evaluation = { results: CheckResult[]; score: number; maxscore: number; correct: boolean; metrics: Metrics };

/** The boxes that keep a box from being unloaded at its stop: boxes for a later stop on top of it or between it and the door. */
export const blockers = (plan: Plan, s: Solid, all: Solid[]): Solid[] => {
  if (s.box.stop === null) return [];
  const later = all.filter((q) => q.id !== s.id && q.box.stop !== null && q.box.stop > s.box.stop!);
  const onTop = later.filter((q) => q.z >= s.z + s.dz - EPS && footprintOverlap(s, q) > EPS);
  if (plan.space.kind === "pallet") return onTop; // a pallet is reached from every side: only what is on top counts
  const inFront = later.filter(
    (q) => q.x >= s.x + s.dx - EPS && overlap1(s.y, s.y + s.dy, q.y, q.y + q.dy) > EPS && overlap1(s.z, s.z + s.dz, q.z, q.z + q.dz) > EPS
  );
  return [...new Set([...onTop, ...inFront])];
};

/** The boxes that fail a check (empty when it passes), without the "everything loaded" condition. */
export const failing = (plan: Plan, check: Check, solids: Solid[], m: Metrics): string[] | false => {
  switch (check.type) {
    case "allLoaded":
      return [
        ...plan.boxes.filter((b) => !solids.some((s) => s.id === b.id)).map((b) => b.id),
        ...solids.filter((s) => !inside(plan, s)).map((s) => s.id),
      ];
    case "stable":
      return solids.filter((s) => solids.some((q) => q.id !== s.id && overlaps3d(s, q)) || supportOf(s, solids) * 100 < plan.support - EPS).map((s) => s.id);
    case "upright":
      return solids.filter((s) => s.box.upright && s.o[2] !== "h").map((s) => s.id);
    case "fragile":
      return solids.filter((s) => s.box.fragile && above(s, solids).length > 0).map((s) => s.id);
    case "maxWeight":
      return m.weight <= plan.space.maxPayload + EPS ? [] : false;
    case "cog":
      return m.offset && Math.abs(m.offset.x) <= (check.x ?? 40) + EPS && Math.abs(m.offset.y) <= (check.y ?? 20) + EPS ? [] : false;
    case "unloadOrder":
      return solids.filter((s) => blockers(plan, s, solids).length > 0).map((s) => s.id);
    case "heavyBottom":
      return solids.filter((s) => restsOn(s, solids).some((q) => q.box.weight + EPS < s.box.weight)).map((s) => s.id);
    case "axles": {
      const a = plan.space.axles;
      if (!a || !m.axles) return false;
      const ok = m.axles.front >= -EPS && m.axles.rear >= -EPS && (!a.maxFront || m.axles.front <= a.maxFront + EPS) && (!a.maxRear || m.axles.rear <= a.maxRear + EPS);
      return ok ? [] : false;
    }
  }
};

export const evaluate = (plan: Plan, placed: Placed[]): Evaluation => {
  const solids = solidsOf(plan, placed);
  const m = metrics(plan, placed);
  const all = plan.boxes.length > 0 && plan.boxes.every((b) => solids.some((s) => s.id === b.id));
  const results = plan.checks.map((check): CheckResult => {
    const f = failing(plan, check, solids, m);
    const boxes = f === false ? [] : f;
    let passed = f !== false && f.length === 0;
    // a rule about the load says nothing about an empty van (or, with requireAll, about half a load)
    if (check.type !== "allLoaded" && (solids.length === 0 || (plan.requireAll && !all))) passed = false;
    if (check.type === "allLoaded" && plan.boxes.length === 0) passed = false;
    return { passed, boxes };
  });
  const maxscore = plan.checks.reduce((sum, c) => sum + c.points, 0);
  const score = results.reduce((sum, r, i) => sum + (r.passed ? plan.checks[i].points : 0), 0);
  return { results, score, maxscore, correct: results.length > 0 && results.every((r) => r.passed), metrics: m };
};

/** The placement as a rater reads it: every loaded box with its position, orientation and size. */
export const serializePlacement = (plan: Plan, placed: Placed[]): string =>
  JSON.stringify({
    space: plan.space.kind,
    boxes: solidsOf(plan, placed).map((s) => ({ id: s.id, x: round1(s.x), y: round1(s.y), z: round1(s.z), o: s.o, dx: s.dx, dy: s.dy, dz: s.dz })),
  });

export const samePlacement = (a: Placed[], b: Placed[]) => {
  if (a.length !== b.length) return false;
  const key = (p: Placed) => `${p.id}:${p.x}:${p.y}:${p.z}:${p.o}`;
  const set = new Set(a.map(key));
  return b.every((p) => set.has(key(p)));
};

export { round1 };
