/*
 * The logic of hazard spotting, without imports (tested with node --test, test/hazards.test.ts): the shapes of the
 * spots and hit testing, what a tap or a key does, the settings for which hazards count, the `marks` notation and the
 * response.
 *
 * A scene is SCENE_W × SCENE_H units. A spot is a part of the picture the pupil can mark: a hazard (it counts) or a
 * safe look-alike (a decoy, or a hazard of the scene the author did not count, which the picture then shows safe).
 * A mark is where the pupil tapped, and on which spot (null: on no spot at all).
 */

export const SCENE_W = 800;
export const SCENE_H = 500;
/** At most this many hazards count: the response has the fields h1…h8. */
export const MAX_HAZARDS = 8;
/** The radius of a marker, in scene units: a tap on a marker removes it. */
export const MARKER_RADIUS = 17;

/** A part of a spot: a rectangle [x, y, w, h], an ellipse [cx, cy, rx, ry] or a polygon [x1, y1, x2, y2, …]. */
export type Shape = { rect: number[] } | { ellipse: number[] } | { poly: number[] };

export type Spot = {
  id: string;
  /** the parts of the picture that belong to it (a tap on any of them is on this spot) */
  shapes: Shape[];
  /** where its marker goes when the mark comes from a response or the keyboard; inside one of its shapes */
  at: [number, number];
  /** a hazard that counts; otherwise a mark on it is a mark on a safe spot */
  counts: boolean;
};

export type Mark = { x: number; y: number; on: string | null };

/** A field of the response record. */
export type Field = { name: string; type: "integer" | "boolean" | "string"; value: number | boolean | string };

// ---- shapes ----

export function shapeArea(shape: Shape): number {
  if ("rect" in shape) return Math.abs(shape.rect[2] * shape.rect[3]);
  if ("ellipse" in shape) return Math.PI * Math.abs(shape.ellipse[2] * shape.ellipse[3]);
  const p = shape.poly;
  let sum = 0;
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length;
    sum += p[i] * p[j + 1] - p[j] * p[i + 1];
  }
  return Math.abs(sum) / 2;
}

export function shapeContains(shape: Shape, x: number, y: number): boolean {
  if ("rect" in shape) {
    const [rx, ry, w, h] = shape.rect;
    return x >= rx && x <= rx + w && y >= ry && y <= ry + h;
  }
  if ("ellipse" in shape) {
    const [cx, cy, rx, ry] = shape.ellipse;
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  }
  // even-odd ray casting
  const p = shape.poly;
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [p[i], p[i + 1], p[j], p[j + 1]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const segmentDistance = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
};

/** The distance from a point to a shape (0 inside it). For an ellipse an estimate, good enough for a finger. */
export function shapeDistance(shape: Shape, x: number, y: number): number {
  if (shapeContains(shape, x, y)) return 0;
  if ("rect" in shape) {
    const [rx, ry, w, h] = shape.rect;
    return Math.hypot(Math.max(rx - x, 0, x - rx - w), Math.max(ry - y, 0, y - ry - h));
  }
  if ("ellipse" in shape) {
    const [cx, cy, rx, ry] = shape.ellipse;
    const angle = Math.atan2((y - cy) / ry, (x - cx) / rx);
    return Math.hypot(x - (cx + rx * Math.cos(angle)), y - (cy + ry * Math.sin(angle)));
  }
  const p = shape.poly;
  let best = Infinity;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) best = Math.min(best, segmentDistance(x, y, p[j], p[j + 1], p[i], p[i + 1]));
  return best;
}

export const spotArea = (spot: Spot) => spot.shapes.reduce((sum, shape) => sum + shapeArea(shape), 0);
export const spotContains = (spot: Spot, x: number, y: number) => spot.shapes.some((shape) => shapeContains(shape, x, y));
const spotDistance = (spot: Spot, x: number, y: number) => Math.min(...spot.shapes.map((shape) => shapeDistance(shape, x, y)));

/** The bounding box [x, y, w, h] of a spot. */
export function spotBox(spot: Spot): [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const shape of spot.shapes) {
    if ("rect" in shape) {
      add(shape.rect[0], shape.rect[1]);
      add(shape.rect[0] + shape.rect[2], shape.rect[1] + shape.rect[3]);
    } else if ("ellipse" in shape) {
      const [cx, cy, rx, ry] = shape.ellipse;
      add(cx - rx, cy - ry);
      add(cx + rx, cy + ry);
    } else {
      for (let i = 0; i < shape.poly.length; i += 2) add(shape.poly[i], shape.poly[i + 1]);
    }
  }
  return [x0, y0, x1 - x0, y1 - y0];
}

/**
 * Where the number of a hazard goes after answering (and in the authoring mode): on the outline of its first shape, away
 * from where its marker goes: the top left corner of a rectangle, the left of an ellipse, the top of a polygon; never
 * so close to the edge of the scene that it is cut off.
 */
export function badgeAt(spot: Spot, margin = 18): [number, number] {
  const shape = spot.shapes[0];
  let at: [number, number];
  if ("rect" in shape) at = [shape.rect[0], shape.rect[1]];
  else if ("ellipse" in shape) at = [shape.ellipse[0] - shape.ellipse[2], shape.ellipse[1]];
  else {
    const p = shape.poly;
    let top = 0;
    for (let i = 2; i < p.length; i += 2) if (p[i + 1] < p[top + 1]) top = i;
    at = [p[top], p[top + 1]];
  }
  return [clampTo(at[0], margin, SCENE_W - margin), clampTo(at[1], margin, SCENE_H - margin)];
}

const clampTo = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * The spot at a point: of the spots that contain it, the smallest (a person in front of a forklift wins over the
 * forklift); else the nearest within `tolerance` (a finger is less precise than a mouse); else null.
 */
export function spotAt(spots: Spot[], x: number, y: number, tolerance = 0): string | null {
  const inside = spots.filter((spot) => spotContains(spot, x, y));
  if (inside.length) return inside.reduce((best, spot) => (spotArea(spot) < spotArea(best) ? spot : best)).id;
  let nearest: Spot | null = null;
  let distance = tolerance;
  for (const spot of spots) {
    const d = spotDistance(spot, x, y);
    if (d <= distance) {
      nearest = spot;
      distance = d;
    }
  }
  return nearest?.id ?? null;
}

/**
 * The spots in reading order, as the keyboard visits them: in bands from top to bottom (a band is a fifth of the
 * scene), and in a band from left to right, by where their marker goes.
 */
export function readingOrder(spots: Spot[]): Spot[] {
  const band = (spot: Spot) => Math.floor(spot.at[1] / (SCENE_H / 5));
  return [...spots].sort((a, b) => band(a) - band(b) || a.at[0] - b.at[0] || a.at[1] - b.at[1]);
}

/** Where a point is in the scene, for a mark on no spot: row and column 0, 1 or 2 (top left is 0, 0). */
export const placeOf = (x: number, y: number): [number, number] => [
  Math.min(2, Math.max(0, Math.floor((y / SCENE_H) * 3))),
  Math.min(2, Math.max(0, Math.floor((x / SCENE_W) * 3))),
];

// ---- tapping and the keyboard ----

/** What a tap does: add a mark, remove one (by its index), or nothing because every mark is used. */
export type TapResult = { kind: "add"; mark: Mark } | { kind: "remove"; index: number } | { kind: "full" };

/** The mark whose marker is under a point (the nearest within `radius`), or -1. */
export function markerAt(marks: Mark[], x: number, y: number, radius = MARKER_RADIUS): number {
  let found = -1;
  let distance = radius;
  marks.forEach((mark, i) => {
    const d = Math.hypot(mark.x - x, mark.y - y);
    if (d <= distance) {
      found = i;
      distance = d;
    }
  });
  return found;
}

/**
 * A tap at (x, y): on a marker it removes that mark; on a spot that has a mark it removes that mark (a spot has one
 * mark at most); otherwise it adds one, on the spot or on no spot, unless every mark is used (`limit` > 0).
 */
export function tap(marks: Mark[], spots: Spot[], x: number, y: number, { limit = 0, tolerance = 0, radius = MARKER_RADIUS } = {}): TapResult {
  const marker = markerAt(marks, x, y, radius);
  if (marker >= 0) return { kind: "remove", index: marker };
  const on = spotAt(spots, x, y, tolerance);
  const onSpot = on === null ? -1 : marks.findIndex((mark) => mark.on === on);
  if (onSpot >= 0) return { kind: "remove", index: onSpot };
  if (limit > 0 && marks.length >= limit) return { kind: "full" };
  return { kind: "add", mark: { x: Math.round(x), y: Math.round(y), on } };
}

/** Space or Enter on a spot (the keyboard): removes its mark, or adds one where its marker goes. */
export function toggle(marks: Mark[], spot: Spot, limit = 0): TapResult {
  const index = marks.findIndex((mark) => mark.on === spot.id);
  if (index >= 0) return { kind: "remove", index };
  if (limit > 0 && marks.length >= limit) return { kind: "full" };
  return { kind: "add", mark: { x: spot.at[0], y: spot.at[1], on: spot.id } };
}

// ---- the settings ----

/** How many marks the pupil may place: the `maxMarks` setting, 0 (or nothing sensible) is no limit. */
export function parseLimit(value: unknown): number {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 99) : 0;
}

/**
 * The hazards of a scene that count, from the `hazards` setting: "all" (or empty) for all of them, "none", or their
 * ids separated by commas. A list without any id of this scene (it was made for another scene) is all of them.
 */
export function parseSelection(value: unknown, hazardIds: string[]): Set<string> {
  const text = String(value ?? "").trim();
  if (text === "" || text.toLowerCase() === "all") return new Set(hazardIds);
  if (text.toLowerCase() === "none") return new Set();
  const listed = text.split(/[\s,;]+/).filter((id) => hazardIds.includes(id));
  return new Set(listed.length ? listed : hazardIds);
}

/** The `hazards` setting for a selection: "all", "none" or the ids in the order of the scene. */
export function selectionSetting(selected: Set<string>, hazardIds: string[]): string {
  const ids = hazardIds.filter((id) => selected.has(id));
  if (ids.length === hazardIds.length) return "all";
  return ids.length ? ids.join(", ") : "none";
}

/** An area the author added: a rectangle with a name and an explanation (shown after answering), and a neutral label. */
export type ExtraArea = { name: string; label: string; why: string; x: number; y: number; w: number; h: number };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** An area that fits the scene, at least 10 × 10 units, in whole units. */
export function fitArea(area: ExtraArea): ExtraArea {
  const w = clamp(Math.round(area.w), 10, SCENE_W);
  const h = clamp(Math.round(area.h), 10, SCENE_H);
  return { ...area, x: clamp(Math.round(area.x), 0, SCENE_W - w), y: clamp(Math.round(area.y), 0, SCENE_H - h), w, h };
}

/** The `extraHazards` setting: a JSON list of areas. Anything that cannot be read is no area; at most MAX_HAZARDS. */
export function parseExtras(value: unknown): ExtraArea[] {
  let list: unknown;
  try {
    list = JSON.parse(String(value ?? "").trim() || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const areas: ExtraArea[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    const [x, y, w, h] = [a.x, a.y, a.w, a.h].map(Number);
    if (![x, y, w, h].every(Number.isFinite)) continue;
    const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    areas.push(fitArea({ name: text(a.name), label: text(a.label), why: text(a.why), x, y, w, h }));
  }
  return areas.slice(0, MAX_HAZARDS);
}

/** The `extraHazards` setting for a list of areas ("" for none). */
export const extrasSetting = (areas: ExtraArea[]) =>
  areas.length ? JSON.stringify(areas.map(({ name, label, why, x, y, w, h }) => ({ name, label, why, x, y, w, h }))) : "";

export const extraId = (i: number) => `extra${i + 1}`;

/**
 * The spots of a scene for the settings: its own spots (a hazard counts when it is selected), then the author's areas,
 * which count, as long as no more than MAX_HAZARDS hazards count (the areas after that are left out).
 */
export function buildSpots(sceneSpots: { id: string; hazard: boolean; shapes: Shape[]; at: [number, number] }[], selected: Set<string>, extras: ExtraArea[]): Spot[] {
  const spots: Spot[] = sceneSpots.map((s) => ({ id: s.id, shapes: s.shapes, at: s.at, counts: s.hazard && selected.has(s.id) }));
  let counted = spots.filter((s) => s.counts).length;
  extras.forEach((area, i) => {
    if (counted >= MAX_HAZARDS) return;
    counted++;
    spots.push({ id: extraId(i), shapes: [{ rect: [area.x, area.y, area.w, area.h] }], at: [Math.round(area.x + area.w / 2), Math.round(area.y + area.h / 2)], counts: true });
  });
  return spots;
}

/** The hazards that count, in the order of the response (h1, h2, …): the scene's order, then the author's areas. */
export const countedSpots = (spots: Spot[]) => spots.filter((spot) => spot.counts).slice(0, MAX_HAZARDS);

// ---- the marks notation and the response ----

/**
 * The marks as a string, the same for the same answer whatever the order of tapping: the ids of the marked spots in
 * reading order, then the marks on no spot as "x,y" (top to bottom, left to right), separated by "; ".
 * "railing; helmet; 412,233"
 */
export function marksString(marks: Mark[], spots: Spot[]): string {
  const ids = readingOrder(spots).map((spot) => spot.id).filter((id) => marks.some((mark) => mark.on === id));
  const free = marks
    .filter((mark) => mark.on === null || !spots.some((spot) => spot.id === mark.on))
    .map((mark) => [Math.round(mark.x), Math.round(mark.y)])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .map(([x, y]) => `${x},${y}`);
  return [...ids, ...free].join("; ");
}

/**
 * The marks of a `marks` string: an id is a mark where that spot's marker goes, "x,y" a mark there, on the spot at
 * that point (or none). Unknown ids, points outside the scene and repeats are left out.
 */
export function parseMarks(text: string, spots: Spot[]): Mark[] {
  const marks: Mark[] = [];
  for (const token of String(text ?? "").split(/[;\n]+/).map((t) => t.trim()).filter(Boolean)) {
    const point = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(token);
    if (point) {
      const [x, y] = [Number(point[1]), Number(point[2])];
      if (x < 0 || y < 0 || x > SCENE_W || y > SCENE_H) continue;
      const on = spotAt(spots, x, y);
      if (on !== null && marks.some((mark) => mark.on === on)) continue;
      marks.push({ x: Math.round(x), y: Math.round(y), on });
      continue;
    }
    const spot = spots.find((s) => s.id === token);
    if (spot && !marks.some((mark) => mark.on === spot.id)) marks.push({ x: spot.at[0], y: spot.at[1], on: spot.id });
  }
  return marks;
}

/** Whether a mark is on a hazard that counts. */
export const markIsHit = (mark: Mark, spots: Spot[]) => mark.on !== null && spots.some((spot) => spot.id === mark.on && spot.counts);

/** What the marks come to: the hazards found (by id), how many there are, the marks on a safe spot. */
export function score(marks: Mark[], spots: Spot[]) {
  const counted = countedSpots(spots);
  const found = counted.map((spot) => marks.some((mark) => mark.on === spot.id));
  const wrong = marks.filter((mark) => !markIsHit(mark, spots)).length;
  return { counted, found, total: counted.length, foundCount: found.filter(Boolean).length, wrong };
}

/**
 * The response record: found, total, wrong, correct, h1…hN (one per hazard that counts) and marks. `correct` is every
 * hazard found and no mark on a safe spot; with `penalty` off a mark on a safe spot costs nothing, so then `correct`
 * is every hazard found.
 */
export function responseFields(marks: Mark[], spots: Spot[], penalty = true): Field[] {
  const { found, total, foundCount, wrong } = score(marks, spots);
  return [
    { name: "found", type: "integer", value: foundCount },
    { name: "total", type: "integer", value: total },
    { name: "wrong", type: "integer", value: wrong },
    { name: "correct", type: "boolean", value: total > 0 && foundCount === total && (wrong === 0 || !penalty) },
    ...found.map((hit, i): Field => ({ name: `h${i + 1}`, type: "boolean", value: hit })),
    { name: "marks", type: "string", value: marksString(marks, spots) },
  ];
}

/** The marks of the correct answer: one on every hazard that counts, where its marker goes. */
export const correctMarks = (spots: Spot[]): Mark[] => countedSpots(spots).map((spot) => ({ x: spot.at[0], y: spot.at[1], on: spot.id }));

/** The `marks` of a response: a record (its field `marks`), a string, or nothing. */
export function marksIn(value: unknown): string | undefined {
  if (Array.isArray(value)) return marksIn(value[0]);
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const { record, base } = value as { record?: { name: string }[]; base?: { string?: unknown } };
    if (Array.isArray(record)) return marksIn(record.find((field) => field?.name === "marks"));
    if (typeof base?.string === "string") return base.string;
  }
  return undefined;
}
