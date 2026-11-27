/*
 * Floor covering (een kamer stofferen): the floor plan of a room on squared paper, the strips of carpet or vinyl the
 * pupil lays on it, and the bill. No DOM and no Preact: `npm test` runs it in node (test/cover.test.ts), and the
 * interaction, the authoring mode and getCorrectResponse share it, so they cannot disagree.
 *
 * Units. Inside, everything is in squares of the grid: a room is a shape of whole squares (grid.ts), a strip has a
 * position and a length in squares. One square is `scale` metres (1 or 0.5), so a length in metres is squares × scale
 * and an area in m² is squares × scale². Money is in cents.
 *
 * A strip comes off a roll of a fixed width (`rollWidth` metres, a whole number of squares) and is sold per running
 * metre: its length. It lies left to right ("across": as wide as the roll from top to bottom) or top to bottom
 * ("down"), always on the grid, and may stick out over the walls: what lies outside the room, or twice on the floor, is
 * waste. No offcuts are used again: every strip is the full width of the roll.
 *
 * As text (the `strips` setting and the `strips` field of the response) a plan is its strips, separated by ";", each
 * "across x y length" or "down x y length" in metres from the top left of the paper: "down 1 1 5; down 5 1 3".
 */
import { EMPTY, FULL, field, measureShape, parseShape, sizeFrom, MAX_COLUMNS, MAX_ROWS, type CellValue, type RecordField, type Shape } from "./grid.ts";

// ---- numbers as a pupil or an author writes them

/** A length: "8", "8,5", "8.5", "21,2 m". Undefined for anything else. */
export function parseMetres(text: unknown): number | undefined {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(?:m|meter|meters|metre|metres)?\s*$/i.exec(String(text ?? ""));
  return m ? Number(m[1].replace(",", ".")) : undefined;
}

/** An area: "26", "17,25", "26 m²", "26 m2". Undefined for anything else. */
export function parseSquareMetres(text: unknown): number | undefined {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(?:m²|m2|m\^2)?\s*$/i.exec(String(text ?? ""));
  return m ? Number(m[1].replace(",", ".")) : undefined;
}

/**
 * An amount in euros, in cents: "319,60", "319.6", "€ 319,60", "€319.60", "319", "319,-", "1.234,50", "1,234.50".
 * Undefined for anything else ("", "abc", "3,195", "-3").
 */
export function parseEuros(text: unknown): number | undefined {
  const s = String(text ?? "").trim().replace(/^(?:€|eur|euro)\s*/i, "").replace(/\s*(?:€|eur|euro)$/i, "");
  const m = /^(\d{1,3}(?:[.,  ]\d{3})+|\d+)(?:[.,](\d{1,2}|-|–))?$/.exec(s);
  if (!m) return undefined;
  const whole = Number(m[1].replace(/[.,  ]/g, ""));
  const fraction = m[2] && /\d/.test(m[2]) ? Number(m[2].padEnd(2, "0")) : 0;
  return whole * 100 + fraction;
}

/** Rounded to hundredths, without the noise of floats: 21.200000000000003 → 21.2. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** A number as the language writes it: 21.2 → "21,2" in Dutch. */
export const decimal = (n: number, language: string) => (language === "nl" ? String(round2(n)).replace(".", ",") : String(round2(n)));

/** A length in metres: "21.2 m", "21,2 m". */
export const metresText = (metres: number, language: string) => `${decimal(metres, language)} m`;

/** An amount as tspci-money writes it: "€7.35" in English, "€ 7,35" in Dutch. */
export function eurosText(cents: number, language: string): string {
  const text = `${Math.floor(cents / 100)}${language === "nl" ? "," : "."}${String(cents % 100).padStart(2, "0")}`;
  return language === "nl" ? `€ ${text}` : `€${text}`;
}

/** An amount without the sign, for an answer box: "319.60", "319,60". */
export const amountText = (cents: number, language: string) => eurosText(cents, language).replace(/^€\s?/, "");

// ---- the settings

export type CoverParts = "all" | "area" | "strips" | "bill";
export type Material = "carpet" | "vinyl";

export type CoverSettings = {
  columns: number;
  rows: number;
  /** the floor, as whole squares */
  room: Shape;
  /** metres per square: 1 or 0.5 */
  scale: number;
  /** the width of the roll in metres */
  rollWidth: number;
  /** the width of the roll in squares; 0 when it is not a whole number of squares */
  width: number;
  material: Material;
  /** what the pupil does: everything, or only the area, the strips or the bill */
  parts: CoverParts;
  /** the floor covering, in cents per running metre; null when missing */
  price: number | null;
  /** skirting, in cents per metre; null: no skirting on the bill */
  skirtingPrice: number | null;
  /** a threshold strip, in cents; null: none on the bill */
  thresholdPrice: number | null;
  /** the width of the door in metres */
  doorWidth: number;
  /** the wall with the door, from 1, clockwise from the top left (walls()); null: no door */
  door: number | null;
  /** the author's plan (the `strips` setting): the plan of the bill when the pupil only does the bill */
  plan: Strip[];
};

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;

/** The settings of the floor covering task, from the data- properties (strings); a missing or unknown one is its default. */
export function coverSettingsFrom(properties: Record<string, unknown>): CoverSettings {
  const columns = sizeFrom(properties.columns, 12, MAX_COLUMNS);
  const rows = sizeFrom(properties.rows, 8, MAX_ROWS);
  const parsed = parseShape(properties.room, columns, rows);
  // a room is whole squares: a half square in the text counts as a whole one
  const room: Shape = { ...parsed, cells: parsed.cells.map((v) => (v === EMPTY ? EMPTY : FULL)) as CellValue[] };
  const scale = parseMetres(properties.scale) === 0.5 ? 0.5 : 1;
  const rollWidth = parseMetres(properties.rollWidth) ?? 4;
  const squares = rollWidth / scale;
  const width = squares >= 1 && Math.abs(squares - Math.round(squares)) < 1e-9 ? Math.round(squares) : 0;
  const euros = (value: unknown) => parseEuros(value) ?? null;
  const door = Number.parseInt(String(properties.door ?? ""), 10);
  const settings: CoverSettings = {
    columns,
    rows,
    room,
    scale,
    rollWidth,
    width,
    material: oneOf(properties.material, ["carpet", "vinyl"] as const, "carpet"),
    parts: oneOf(properties.coverParts, ["all", "area", "strips", "bill"] as const, "all"),
    price: euros(properties.price),
    skirtingPrice: euros(properties.skirtingPrice),
    thresholdPrice: euros(properties.thresholdPrice),
    doorWidth: parseMetres(properties.doorWidth) ?? 0,
    door: Number.isInteger(door) && door >= 1 ? door : null,
    plan: [],
  };
  settings.plan = parseStrips(properties.strips, settings);
  return settings;
}

export const asksArea = (s: CoverSettings) => s.parts === "all" || s.parts === "area";
export const asksStrips = (s: CoverSettings) => s.parts === "all" || s.parts === "strips";
export const asksBill = (s: CoverSettings) => s.parts === "all" || s.parts === "bill";

// ---- the room

export type Side = "top" | "right" | "bottom" | "left";
/** A wall: a straight piece of the outline, from corner to corner, clockwise; `side` is the side of the room it closes. */
export type Wall = { x1: number; y1: number; x2: number; y2: number; length: number; side: Side };

const isRoom = (room: Shape, x: number, y: number) =>
  x >= 0 && y >= 0 && x < room.columns && y < room.rows && room.cells[y * room.columns + x] !== EMPTY;

/** The squares of the floor. */
export const roomSquares = (room: Shape) => room.cells.filter((v) => v !== EMPTY).length;

/**
 * The walls of a room, clockwise from its top-left corner (the top left of its first square, row by row). Walking
 * clockwise (y down), the floor is on the right: the top side of a square goes east, its right side south, its bottom
 * west, its left north. Only the outline of the first piece: a room is one piece without holes (roomProblem).
 */
export function walls(room: Shape): Wall[] {
  type Edge = { x1: number; y1: number; x2: number; y2: number; side: Side };
  const from = new Map<string, Edge>();
  const key = (x: number, y: number) => `${x},${y}`;
  for (let y = 0; y < room.rows; y++) {
    for (let x = 0; x < room.columns; x++) {
      if (!isRoom(room, x, y)) continue;
      const add = (e: Edge) => from.set(key(e.x1, e.y1), e);
      if (!isRoom(room, x, y - 1)) add({ x1: x, y1: y, x2: x + 1, y2: y, side: "top" });
      if (!isRoom(room, x + 1, y)) add({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1, side: "right" });
      if (!isRoom(room, x, y + 1)) add({ x1: x + 1, y1: y + 1, x2: x, y2: y + 1, side: "bottom" });
      if (!isRoom(room, x - 1, y)) add({ x1: x, y1: y + 1, x2: x, y2: y, side: "left" });
    }
  }
  const first = room.cells.findIndex((v) => v !== EMPTY);
  if (first < 0) return [];
  const start = from.get(key(first % room.columns, Math.floor(first / room.columns)))!;
  const result: Wall[] = [];
  let edge = start;
  for (let guard = 0; guard <= from.size; guard++) {
    const last = result[result.length - 1];
    if (last && last.side === edge.side) {
      last.x2 = edge.x2;
      last.y2 = edge.y2;
      last.length++;
    } else {
      result.push({ ...edge, length: 1 });
    }
    const next = from.get(key(edge.x2, edge.y2));
    if (!next || next === start) break;
    edge = next;
  }
  return result;
}

/** The perimeter of the room in squares: all its walls. */
export const perimeterSquares = (room: Shape) => walls(room).reduce((sum, w) => sum + w.length, 0);

/** What is wrong with a room: nothing drawn, more than one piece, or holes; null when it is fine. */
export function roomProblem(room: Shape): "empty" | "pieces" | "holes" | null {
  const m = measureShape(room);
  return m.empty ? "empty" : !m.connected ? "pieces" : m.holes > 0 ? "holes" : null;
}

/** The door: on wall `wall` (from 1), in the middle, from `from` to `to` squares along it from its start. */
export type Door = { wall: number; from: number; to: number };

/** Where the door is; null without a door, or when it is on no wall or wider than its wall. */
export function doorOf(s: CoverSettings): Door | null {
  if (s.door === null || s.doorWidth <= 0) return null;
  const wall = walls(s.room)[s.door - 1];
  const width = s.doorWidth / s.scale;
  if (!wall || width > wall.length + 1e-9) return null;
  return { wall: s.door, from: (wall.length - width) / 2, to: (wall.length + width) / 2 };
}

// ---- strips

/** A strip: its top-left square, its length in squares, and whether it lies top to bottom (down) or left to right. */
export type Strip = { x: number; y: number; length: number; vertical: boolean };

/** The rectangle a strip covers, in squares. */
export const stripBox = (s: Strip, width: number) =>
  s.vertical ? { x: s.x, y: s.y, w: width, h: s.length } : { x: s.x, y: s.y, w: s.length, h: width };

/** The longest a strip can be on this grid, in squares. */
export const maxLength = (vertical: boolean, columns: number, rows: number) => (vertical ? rows : columns);

/** Whether a strip of this roll fits on the grid this way round. */
export const fitsWay = (vertical: boolean, width: number, columns: number, rows: number) =>
  width >= 1 && (vertical ? width <= columns : width <= rows);

/**
 * A strip moved onto the grid: as long as allowed (1 to the grid's length), and pushed back inside where it sticks out.
 * Null when the roll does not fit on the grid this way round.
 */
export function fitStrip(s: Strip, width: number, columns: number, rows: number): Strip | null {
  if (!fitsWay(s.vertical, width, columns, rows)) return null;
  const length = Math.min(maxLength(s.vertical, columns, rows), Math.max(1, Math.round(s.length)));
  const box = stripBox({ ...s, length }, width);
  return {
    x: Math.min(columns - box.w, Math.max(0, Math.round(s.x))),
    y: Math.min(rows - box.h, Math.max(0, Math.round(s.y))),
    length,
    vertical: s.vertical,
  };
}

/** A strip made longer or shorter at its end (right or bottom): its start stays, it stops at the edge of the grid. */
export function resizeStrip(s: Strip, length: number, columns: number, rows: number): Strip {
  const room = s.vertical ? rows - s.y : columns - s.x;
  return { ...s, length: Math.min(room, Math.max(1, Math.round(length))) };
}

/** A strip turned a quarter: its top-left corner stays where it can; null when the roll does not fit the other way. */
export const turnStrip = (s: Strip, width: number, columns: number, rows: number) =>
  fitStrip({ ...s, vertical: !s.vertical }, width, columns, rows);

/** The plan as text: "down 1 1 5; down 5 1 3", in metres, sorted (top to bottom, left to right), so one plan is one text. */
export function serializeStrips(strips: Strip[], scale: number): string {
  return [...strips]
    .sort((a, b) => a.y - b.y || a.x - b.x || Number(a.vertical) - Number(b.vertical) || a.length - b.length)
    .map((s) => `${s.vertical ? "down" : "across"} ${round2(s.x * scale)} ${round2(s.y * scale)} ${round2(s.length * scale)}`)
    .join("; ");
}

/** A plan from its text, fitted on the grid; what cannot be read or does not fit is left out. */
export function parseStrips(text: unknown, s: Pick<CoverSettings, "scale" | "width" | "columns" | "rows">): Strip[] {
  const strips: Strip[] = [];
  for (const part of String(text ?? "").split(";")) {
    const m = /^\s*(across|down|h|v)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s*$/i.exec(part);
    if (!m) continue;
    const [x, y, length] = [m[2], m[3], m[4]].map((n) => Number(n.replace(",", ".")) / s.scale);
    const strip = fitStrip({ x, y, length, vertical: /^(down|v)$/i.test(m[1]) }, s.width, s.columns, s.rows);
    if (strip) strips.push(strip);
  }
  return strips;
}

export type PlanMeasures = {
  /** the squares of the strips together (twice where they overlap) */
  stripSquares: number;
  /** the running length of all strips, in squares */
  runningSquares: number;
  /** the squares of the floor under a strip */
  coveredSquares: number;
  /** every square of the floor is under a strip */
  covered: boolean;
  /** what is bought but not on the floor, or on it twice, in squares */
  wasteSquares: number;
};

/** What a plan covers, and what it wastes. */
export function measurePlan(room: Shape, strips: Strip[], width: number): PlanMeasures {
  const under = new Uint8Array(room.columns * room.rows);
  let stripSquares = 0;
  for (const s of strips) {
    const b = stripBox(s, width);
    stripSquares += b.w * b.h;
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (x < room.columns && y < room.rows) under[y * room.columns + x] = 1;
  }
  const floor = roomSquares(room);
  const coveredSquares = room.cells.reduce((n, v, i) => n + (v !== EMPTY && under[i] ? 1 : 0), 0);
  return {
    stripSquares,
    runningSquares: strips.reduce((n, s) => n + s.length, 0),
    coveredSquares,
    covered: floor > 0 && coveredSquares === floor,
    wasteSquares: stripSquares - coveredSquares,
  };
}

export type LeastPlan = { runningSquares: number; vertical: boolean; strips: Strip[] };

/**
 * The plan with the least running length, with all strips the same way round (as a fitter lays carpet: the pile and the
 * pattern run one way), on the grid. Null when no plan covers the floor.
 *
 * Strips left to right are as wide as the roll from top to bottom, so every column of squares needs its own strips: at
 * least as many as it takes to cover the floor in that column with pieces of the roll's width. That is the least
 * running length (per column, from the top, every next piece starts at the first square not yet covered). Of the plans
 * with that length it lays the one with the fewest strips: bands of the roll's width over the whole room where that is
 * as short, else the columns' own pieces, joined where neighbours start at the same row.
 */
export function leastPlan(room: Shape, width: number): LeastPlan | null {
  if (roomSquares(room) === 0 || width < 1) return null;
  const across = leastOneWay(room, width);
  // top to bottom: the same, on the room turned over its diagonal
  const flipped: Shape = { columns: room.rows, rows: room.columns, cells: room.cells.map((_, i) => room.cells[(i % room.rows) * room.columns + Math.floor(i / room.rows)]) };
  const downFlipped = leastOneWay(flipped, width);
  const down = downFlipped && { runningSquares: downFlipped.runningSquares, vertical: true, strips: downFlipped.strips.map((s) => ({ x: s.y, y: s.x, length: s.length, vertical: true })) };
  const options = [across, down].filter((p): p is LeastPlan => p !== null);
  options.sort((a, b) => a.runningSquares - b.runningSquares || a.strips.length - b.strips.length);
  return options[0] ?? null;
}

/** The least plan with strips left to right (leastPlan). */
function leastOneWay(room: Shape, width: number): LeastPlan | null {
  const { columns, rows } = room;
  if (width > rows) return null;
  // per column: the rows where its pieces start, from the top
  const starts: number[][] = [];
  for (let x = 0; x < columns; x++) {
    const list: number[] = [];
    let coveredTo = -1;
    for (let y = 0; y < rows; y++) {
      if (isRoom(room, x, y) && y > coveredTo) {
        const start = Math.min(y, rows - width);
        list.push(start);
        coveredTo = start + width - 1;
      }
    }
    starts.push(list);
  }
  const least = starts.reduce((n, list) => n + list.length, 0);
  const columnStrips: Strip[] = [];
  for (const start of new Set(starts.flat())) {
    for (let x = 0; x < columns; x++) {
      if (!starts[x].includes(start)) continue;
      let end = x;
      while (end + 1 < columns && starts[end + 1].includes(start)) end++;
      columnStrips.push({ x, y: start, length: end - x + 1, vertical: false });
      x = end;
    }
  }
  const bands = bandPlan(room, width);
  const strips = bands && bands.runningSquares === least && bands.strips.length <= columnStrips.length ? bands.strips : columnStrips;
  return { runningSquares: least, vertical: false, strips };
}

/** Bands of the roll's width over the whole room, from the top (each band as short as the floor in it allows). */
function bandPlan(room: Shape, width: number): LeastPlan | null {
  const { columns, rows } = room;
  type Best = { runningSquares: number; strips: Strip[] } | null;
  const memo = new Map<number, Best>();
  const runs = (from: number, to: number): [number, number][] => {
    const result: [number, number][] = [];
    for (let x = 0; x < columns; x++) {
      let used = false;
      for (let y = from; y < to; y++) used ||= isRoom(room, x, y);
      if (!used) continue;
      if (result.length && result[result.length - 1][1] === x - 1) result[result.length - 1][1] = x;
      else result.push([x, x]);
    }
    return result;
  };
  const best = (r: number): Best => {
    if (memo.has(r)) return memo.get(r)!;
    let first = r;
    while (first < rows && runs(first, first + 1).length === 0) first++;
    let result: Best = first >= rows ? { runningSquares: 0, strips: [] } : null;
    if (first < rows) {
      // a band at the first row not yet covered first: a band shifted up over the floor already covered only where shorter
      for (let k = width; k >= 1; k--) {
        const start = first + k - width;
        if (start < 0 || start + width > rows) continue;
        const rest = best(first + k);
        if (!rest) continue;
        const band = runs(first, first + k).map(([a, b]) => ({ x: a, y: start, length: b - a + 1, vertical: false }));
        const total = band.reduce((n, s) => n + s.length, 0) + rest.runningSquares;
        const strips = [...band, ...rest.strips];
        if (!result || total < result.runningSquares || (total === result.runningSquares && strips.length < result.strips.length)) {
          result = { runningSquares: total, strips };
        }
      }
    }
    memo.set(r, result);
    return result;
  };
  const found = best(0);
  return found && { ...found, vertical: false };
}

/**
 * The plan of the solution: the author's plan when it covers the floor (and, when the pupil lays the strips, with the
 * least running length), else the least plan. Null when no plan covers the floor.
 */
export function solutionPlan(s: CoverSettings): Strip[] | null {
  const least = s.width ? leastPlan(s.room, s.width) : null;
  const own = measurePlan(s.room, s.plan, s.width);
  if (s.plan.length && own.covered && (!asksStrips(s) || (least && own.runningSquares <= least.runningSquares))) return s.plan;
  return least?.strips ?? null;
}

/** The plan the bill is about when the pupil does not lay the strips: the author's, or else the least one. */
export const givenPlan = (s: CoverSettings): Strip[] => (s.plan.length ? s.plan : (leastPlan(s.room, s.width)?.strips ?? []));

// ---- the bill

export type LineId = "covering" | "skirting" | "threshold";
/** A line of the bill: the metres (none for a threshold strip: one piece), the price and the amount, in cents. */
export type BillLine = { id: LineId; metres: number | null; price: number; amount: number };

/** An amount: metres × price, rounded to the cent. */
const times = (metres: number, price: number) => Math.round((Math.round(metres * 100) * price) / 100);

/** The skirting in metres: around all walls, without the door. */
export function skirtingMetres(s: CoverSettings): number {
  const door = doorOf(s);
  return round2(perimeterSquares(s.room) * s.scale - (door ? s.doorWidth : 0));
}

/** The lines of the bill for a plan, and the total; null without a price for the floor covering. */
export function billFor(s: CoverSettings, plan: Strip[]): { lines: BillLine[]; total: number } | null {
  if (s.price === null) return null;
  const running = round2(plan.reduce((n, strip) => n + strip.length, 0) * s.scale);
  const lines: BillLine[] = [{ id: "covering", metres: running, price: s.price, amount: times(running, s.price) }];
  if (s.skirtingPrice !== null) {
    const metres = skirtingMetres(s);
    lines.push({ id: "skirting", metres, price: s.skirtingPrice, amount: times(metres, s.skirtingPrice) });
  }
  if (s.thresholdPrice !== null) lines.push({ id: "threshold", metres: null, price: s.thresholdPrice, amount: s.thresholdPrice });
  return { lines, total: lines.reduce((n, line) => n + line.amount, 0) };
}

// ---- the response

/** The boxes of the bill: per line the metres and the amount (a threshold strip only the amount), and the total. */
export const BILL_FIELDS = ["coveringMetres", "coveringAmount", "skirtingMetres", "skirtingAmount", "thresholdAmount", "total"] as const;
export type BillField = (typeof BILL_FIELDS)[number];

/** What the pupil did: the floor area typed, the strips laid, and the boxes of the bill, as typed. */
export type CoverWork = { floorArea: string; strips: Strip[] } & Record<BillField, string>;

export const emptyCoverWork = (): CoverWork => ({
  floorArea: "", strips: [], coveringMetres: "", coveringAmount: "", skirtingMetres: "", skirtingAmount: "", thresholdAmount: "", total: "",
});

/** The boxes on the bill for these settings. */
export function billFields(s: CoverSettings): BillField[] {
  const fields: BillField[] = ["coveringMetres", "coveringAmount"];
  if (s.skirtingPrice !== null) fields.push("skirtingMetres", "skirtingAmount");
  if (s.thresholdPrice !== null) fields.push("thresholdAmount");
  fields.push("total");
  return fields;
}

const isMetres = (f: BillField) => f.endsWith("Metres");
/** A box of the bill as a number: metres, or an amount in cents. */
const billValue = (f: BillField, text: string) => (isMetres(f) ? parseMetres(text) : parseEuros(text));

/**
 * The response for what the pupil did, as record fields; undefined while nothing is answered (no area, no strip, no
 * number on the bill). Only the fields of the parts the pupil does (`coverParts`):
 * - area: `area` (the number typed, m²) and `areaCorrect`;
 * - strips: `covered`, `waste` (m²), `runningMetres`, `leastWaste` and `strips` (the plan as text);
 * - bill: `billCorrect` (every line right for the plan and the prices), `total` (typed), `totalCorrect` (the sum of the
 *   pupil's own amounts) and `bill` (the boxes typed, as text);
 * - `correct`: every part right.
 */
export function coverResponseFields(s: CoverSettings, work: CoverWork): RecordField[] | undefined {
  const area = parseSquareMetres(work.floorArea);
  const typed = Object.fromEntries(billFields(s).map((f) => [f, billValue(f, work[f])])) as Partial<Record<BillField, number | undefined>>;
  const answered = (asksArea(s) && area !== undefined) || (asksStrips(s) && work.strips.length > 0) || (asksBill(s) && Object.values(typed).some((v) => v !== undefined));
  if (!answered) return undefined;

  const fields: RecordField[] = [];
  let correct = true;
  if (asksArea(s)) {
    const areaCorrect = area !== undefined && roomProblem(s.room) === null && Math.abs(area - roomSquares(s.room) * s.scale * s.scale) < 1e-6;
    if (area !== undefined) fields.push(field("area", "float", area));
    fields.push(field("areaCorrect", "boolean", areaCorrect));
    correct &&= areaCorrect;
  }
  if (asksStrips(s)) {
    const m = measurePlan(s.room, work.strips, s.width);
    const least = leastPlan(s.room, s.width);
    const leastWaste = m.covered && least !== null && m.runningSquares <= least.runningSquares;
    fields.push(field("covered", "boolean", m.covered));
    if (work.strips.length) {
      fields.push(field("waste", "float", round2(m.wasteSquares * s.scale * s.scale)), field("runningMetres", "float", round2(m.runningSquares * s.scale)));
    }
    fields.push(field("leastWaste", "boolean", leastWaste));
    if (work.strips.length) fields.push(field("strips", "string", serializeStrips(work.strips, s.scale)));
    correct &&= m.covered && leastWaste;
  }
  if (asksBill(s)) {
    const bill = billFor(s, asksStrips(s) ? work.strips : givenPlan(s));
    const line = (id: LineId) => bill?.lines.find((l) => l.id === id);
    const metresRight = (f: BillField, id: LineId) => typed[f] !== undefined && Math.abs(typed[f]! - (line(id)?.metres ?? NaN)) < 0.005;
    const amountRight = (f: BillField, id: LineId) => typed[f] !== undefined && typed[f] === line(id)?.amount;
    const billCorrect =
      bill !== null &&
      (!asksStrips(s) || work.strips.length > 0) &&
      metresRight("coveringMetres", "covering") &&
      amountRight("coveringAmount", "covering") &&
      (s.skirtingPrice === null || (metresRight("skirtingMetres", "skirting") && amountRight("skirtingAmount", "skirting"))) &&
      (s.thresholdPrice === null || amountRight("thresholdAmount", "threshold"));
    const amounts = billFields(s).filter((f) => f.endsWith("Amount"));
    const totalCorrect = typed.total !== undefined && amounts.every((f) => typed[f] !== undefined) && typed.total === amounts.reduce((n, f) => n + typed[f]!, 0);
    fields.push(field("billCorrect", "boolean", billCorrect));
    if (typed.total !== undefined) fields.push(field("total", "float", typed.total / 100));
    fields.push(field("totalCorrect", "boolean", totalCorrect));
    const lines = billFields(s).filter((f) => f !== "total" && typed[f] !== undefined);
    if (lines.length) fields.push(field("bill", "string", lines.map((f) => `${f}=${isMetres(f) ? round2(typed[f]!) : typed[f]! / 100}`).join("; ")));
    correct &&= billCorrect && totalCorrect;
  }
  fields.push(field("correct", "boolean", correct));
  return fields;
}

/**
 * What the pupil would have done for the correct response: the floor area, the solution plan and the bill for it.
 * Undefined when the settings have no answer (no room, no plan that covers it, no price).
 */
export function solutionWork(s: CoverSettings, language: string): CoverWork | undefined {
  if (roomProblem(s.room) !== null) return undefined;
  const work = emptyCoverWork();
  if (asksArea(s)) work.floorArea = decimal(roomSquares(s.room) * s.scale * s.scale, language);
  const plan = asksStrips(s) ? solutionPlan(s) : givenPlan(s);
  if (!plan || !plan.length) return undefined;
  if (asksStrips(s)) work.strips = plan;
  if (asksBill(s)) {
    const bill = billFor(s, plan);
    if (!bill) return undefined;
    for (const line of bill.lines) {
      if (line.metres !== null) work[`${line.id}Metres` as BillField] = decimal(line.metres, language);
      work[`${line.id}Amount` as BillField] = amountText(line.amount, language);
    }
    work.total = amountText(bill.total, language);
  }
  return work;
}

/** The correct response from the settings (getCorrectResponse): the response of the solution (solutionWork). */
export function coverCorrectFields(s: CoverSettings): RecordField[] | undefined {
  const work = solutionWork(s, "en");
  return work && coverResponseFields(s, work);
}

/**
 * What a response says the pupil did, to show it again (setResponse, boundTo, the solution): the area, the plan, and the
 * boxes of the bill (the `bill` field "coveringMetres=8; coveringAmount=319.6; …" and `total`), as the language writes
 * them. Only what the response holds.
 */
export function workFromFields(fields: Record<string, unknown>, s: CoverSettings, language: string): Partial<CoverWork> {
  const work: Partial<CoverWork> = {};
  const number = (value: unknown) => (typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value.replace(",", ".")) : NaN);
  if ("area" in fields && Number.isFinite(number(fields.area))) work.floorArea = decimal(number(fields.area), language);
  if (typeof fields.strips === "string") work.strips = parseStrips(fields.strips, s);
  if (typeof fields.bill === "string") {
    for (const part of fields.bill.split(";")) {
      const [name, value] = part.split("=").map((p) => p.trim());
      const n = number(value);
      if (!(BILL_FIELDS as readonly string[]).includes(name) || name === "total" || !Number.isFinite(n)) continue;
      work[name as BillField] = isMetres(name as BillField) ? decimal(n, language) : amountText(Math.round(n * 100), language);
    }
  }
  if ("total" in fields && Number.isFinite(number(fields.total))) work.total = amountText(Math.round(number(fields.total) * 100), language);
  return work;
}

// ---- the authoring mode

export type CoverProblem =
  | "noRoom" | "roomPieces" | "roomHoles" | "rollWidth" | "noPlan" | "noDoorWall" | "doorTooWide" | "noPrice" | "planNotCovering" | "planNotLeast";

/** What keeps the settings from making a working item (the authoring mode's validate()). */
export function coverProblems(s: CoverSettings): CoverProblem[] {
  const problems: CoverProblem[] = [];
  const room = roomProblem(s.room);
  if (room) return [room === "empty" ? "noRoom" : room === "pieces" ? "roomPieces" : "roomHoles"];
  if (!s.width) problems.push("rollWidth");
  else if ((asksStrips(s) || asksBill(s)) && !leastPlan(s.room, s.width)) problems.push("noPlan");
  if (s.door !== null) {
    const wall = walls(s.room)[s.door - 1];
    if (!wall) problems.push("noDoorWall");
    else if (s.doorWidth / s.scale > wall.length + 1e-9) problems.push("doorTooWide");
  }
  if (asksBill(s) && s.price === null) problems.push("noPrice");
  if (s.width && s.plan.length) {
    const own = measurePlan(s.room, s.plan, s.width);
    const least = leastPlan(s.room, s.width);
    if (!own.covered) problems.push("planNotCovering");
    else if (asksStrips(s) && least && own.runningSquares > least.runningSquares) problems.push("planNotLeast");
  }
  return problems;
}
