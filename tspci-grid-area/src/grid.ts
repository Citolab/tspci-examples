/*
 * Squared paper: a shape of whole and half squares, and what the PCI computes of it (area, perimeter, one piece, holes,
 * rectangle), the rules of the settings, and the response. No DOM, no Preact and no imports: `npm test` runs it in node
 * (test/grid.test.ts), and the authoring mode, the interaction and getCorrectResponse share it, so they cannot disagree.
 *
 * A grid has `columns` × `rows` squares, numbered row by row from the top left (index = row * columns + column). Every
 * square is empty, coloured (whole), or half coloured: cut along a diagonal, one of the four triangles. A half is named
 * after the corner of its right angle, the corner it covers: NW (top left), NE, SE, SW.
 *
 * As text (the `shape` setting and the `shape` field of the response) a shape is its rows, top to bottom, separated by
 * "/", one character per square: "." empty, "#" coloured, and the halves "a" (NW, top left), "b" (NE), "c" (SE) and
 * "d" (SW), clockwise from the top left. Empty squares at the end of a row and empty rows at the end are left out:
 * "//..####/..####/..####" is a rectangle of 4 × 3 from the third column of the third row.
 */

export const EMPTY = 0;
export const FULL = 1;
export const NW = 2;
export const NE = 3;
export const SE = 4;
export const SW = 5;
export type CellValue = 0 | 1 | 2 | 3 | 4 | 5;

export type Shape = { columns: number; rows: number; cells: CellValue[] };

export const MIN_SIZE = 2;
export const MAX_COLUMNS = 24;
export const MAX_ROWS = 16;

const CHARS: Record<CellValue, string> = { 0: ".", 1: "#", 2: "a", 3: "b", 4: "c", 5: "d" };
const VALUES: Record<string, CellValue> = { ".": EMPTY, "-": EMPTY, " ": EMPTY, "0": EMPTY, "#": FULL, x: FULL, X: FULL, "1": FULL, a: NW, b: NE, c: SE, d: SW };

export const isHalf = (value: CellValue) => value >= NW;

/** A whole number from a setting, within bounds; the fallback for anything else. */
export function sizeFrom(text: unknown, fallback: number, max: number): number {
  const n = Number.parseInt(String(text ?? ""), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(MIN_SIZE, n)) : fallback;
}

export const emptyShape = (columns: number, rows: number): Shape => ({ columns, rows, cells: Array<CellValue>(columns * rows).fill(EMPTY) });

/** A shape from its text, on a grid of this size: what does not fit is left out, unknown characters are empty. */
export function parseShape(text: unknown, columns: number, rows: number): Shape {
  const shape = emptyShape(columns, rows);
  const lines = String(text ?? "").trim().split(/[/|\n]/);
  lines.slice(0, rows).forEach((line, row) => {
    Array.from(line.replace(/\r/g, "")).slice(0, columns).forEach((char, column) => {
      shape.cells[row * columns + column] = VALUES[char] ?? EMPTY;
    });
  });
  return shape;
}

/** The text of a shape ("" when it is empty); parseShape reads it back. */
export function serializeShape(shape: Shape): string {
  const lines = Array.from({ length: shape.rows }, (_, row) =>
    shape.cells
      .slice(row * shape.columns, (row + 1) * shape.columns)
      .map((value) => CHARS[value] ?? ".")
      .join("")
      .replace(/\.+$/, "")
  );
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("/");
}

export const isEmptyShape = (shape: Shape) => shape.cells.every((value) => value === EMPTY);

/**
 * What a click (or Space) does to a square: empty → coloured → empty. With halves, a coloured square turns into a half
 * and the click turns the half on, clockwise (NW, NE, SE, SW), and then empties the square.
 */
export function nextValue(value: CellValue, halves: boolean): CellValue {
  if (!halves) return value === EMPTY ? FULL : EMPTY;
  const cycle: CellValue[] = [EMPTY, FULL, NW, NE, SE, SW];
  return cycle[(cycle.indexOf(value) + 1) % cycle.length];
}

// ---- the geometry

/** The four sides of a square, clockwise from the top; also the four quarters a square is cut into by both diagonals. */
type Side = 0 | 1 | 2 | 3; // north, east, south, west
const N: Side = 0, E: Side = 1, S: Side = 2, W: Side = 3;

/**
 * Whether a square covers one of its sides (a grid line) all along. A coloured square covers all four; a half the two
 * sides at its right angle (NW: north and west). The same holds for the quarter of the square on that side, so this is
 * also whether that quarter is coloured.
 */
export function covers(value: CellValue, side: Side): boolean {
  switch (value) {
    case FULL: return true;
    case NW: return side === N || side === W;
    case NE: return side === N || side === E;
    case SE: return side === S || side === E;
    case SW: return side === S || side === W;
    default: return false;
  }
}

/** A piece of the outline, in squares from the top left of the grid: a side of a square, or a diagonal. */
export type Segment = { x1: number; y1: number; x2: number; y2: number; diagonal: boolean };

/**
 * The outline of a shape: every grid line with the shape on one side only, and the diagonal of every half square (the
 * other half of that square is always empty). A grid line between two coloured parts is inside the shape.
 */
export function outline(shape: Shape): Segment[] {
  const { columns, rows, cells } = shape;
  const at = (row: number, column: number): CellValue =>
    row < 0 || column < 0 || row >= rows || column >= columns ? EMPTY : cells[row * columns + column];
  const segments: Segment[] = [];
  // horizontal grid lines: y = 0 … rows, between the square above and the one below
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x < columns; x++) {
      if (covers(at(y - 1, x), S) !== covers(at(y, x), N)) segments.push({ x1: x, y1: y, x2: x + 1, y2: y, diagonal: false });
    }
  }
  // vertical grid lines: x = 0 … columns, between the square on the left and the one on the right
  for (let x = 0; x <= columns; x++) {
    for (let y = 0; y < rows; y++) {
      if (covers(at(y, x - 1), E) !== covers(at(y, x), W)) segments.push({ x1: x, y1: y, x2: x, y2: y + 1, diagonal: false });
    }
  }
  cells.forEach((value, index) => {
    const x = index % columns, y = Math.floor(index / columns);
    // NW and SE are cut from the top right to the bottom left, NE and SW from the top left to the bottom right
    if (value === NW || value === SE) segments.push({ x1: x + 1, y1: y, x2: x, y2: y + 1, diagonal: true });
    if (value === NE || value === SW) segments.push({ x1: x, y1: y, x2: x + 1, y2: y + 1, diagonal: true });
  });
  return segments;
}

/** The corners of the coloured part of a square, in squares, clockwise: four for a whole square, three for a half. */
export function cellPolygon(value: CellValue, x: number, y: number): [number, number][] {
  const tl: [number, number] = [x, y], tr: [number, number] = [x + 1, y], br: [number, number] = [x + 1, y + 1], bl: [number, number] = [x, y + 1];
  switch (value) {
    case FULL: return [tl, tr, br, bl];
    case NW: return [tl, tr, bl];
    case NE: return [tl, tr, br];
    case SE: return [tr, br, bl];
    case SW: return [tl, br, bl];
    default: return [];
  }
}

export type Measures = {
  /** nothing coloured */
  empty: boolean;
  /** in squares: a whole square counts 1, a half 0.5 */
  area: number;
  /** the grid lines on the outline (a side of a square is 1) */
  gridEdges: number;
  /** the slanting sides: one per half square */
  diagonalEdges: number;
  /** the perimeter in grid units: the grid edges, only when there are no slanting sides; null with slanting sides */
  perimeter: number | null;
  /** the separate pieces: parts that share a side are one piece, parts that only touch at a corner are not */
  pieces: number;
  /** one piece */
  connected: boolean;
  /** empty areas enclosed by the shape (also when enclosed by parts that only touch at a corner) */
  holes: number;
  /** an upright rectangle of whole squares (a square too) */
  rectangle: boolean;
};

/** Everything the PCI computes of a shape. */
export function measureShape(shape: Shape): Measures {
  const { columns, cells } = shape;
  const area = cells.reduce((sum, value) => sum + (value === EMPTY ? 0 : value === FULL ? 1 : 0.5), 0);
  const edges = outline(shape);
  const diagonalEdges = edges.filter((s) => s.diagonal).length;
  const gridEdges = edges.length - diagonalEdges;
  const pieces = countPieces(shape);
  const filled = cells.map((value, index) => (value === EMPTY ? -1 : index)).filter((index) => index >= 0);
  let rectangle = false;
  if (filled.length && filled.every((index) => cells[index] === FULL)) {
    const xs = filled.map((index) => index % columns), ys = filled.map((index) => Math.floor(index / columns));
    const width = Math.max(...xs) - Math.min(...xs) + 1, height = Math.max(...ys) - Math.min(...ys) + 1;
    rectangle = width * height === filled.length;
  }
  return {
    empty: filled.length === 0,
    area,
    gridEdges,
    diagonalEdges,
    perimeter: diagonalEdges === 0 ? gridEdges : null,
    pieces,
    connected: pieces === 1,
    holes: countHoles(shape),
    rectangle,
  };
}

/** The pieces of a shape: two squares are one piece when the grid line between them is covered on both sides. */
function countPieces({ columns, rows, cells }: Shape): number {
  const parent = cells.map((_, index) => index);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => (parent[find(a)] = find(b));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const i = y * columns + x;
      if (x + 1 < columns && covers(cells[i], E) && covers(cells[i + 1], W)) join(i, i + 1);
      if (y + 1 < rows && covers(cells[i], S) && covers(cells[i + columns], N)) join(i, i + columns);
    }
  }
  return new Set(cells.map((value, i) => (value === EMPTY ? -1 : find(i))).filter((root) => root >= 0)).size;
}

/**
 * The holes of a shape. Every square is cut into four quarters by its diagonals, so a half square is two quarters. The
 * empty quarters that can be reached from outside the grid, through sides (not corners), are outside the shape; every
 * other group of empty quarters is a hole.
 */
function countHoles({ columns, rows, cells }: Shape): number {
  const count = columns * rows * 4;
  const empty = (q: number) => !covers(cells[q >> 2], (q & 3) as Side);
  const neighbours = (q: number): number[] => {
    const cell = q >> 2, side = q & 3, x = cell % columns, y = Math.floor(cell / columns);
    const result = [(cell << 2) | ((side + 1) & 3), (cell << 2) | ((side + 3) & 3)]; // the quarters next to it in the square
    if (side === N && y > 0) result.push(((cell - columns) << 2) | S);
    if (side === S && y < rows - 1) result.push(((cell + columns) << 2) | N);
    if (side === W && x > 0) result.push(((cell - 1) << 2) | E);
    if (side === E && x < columns - 1) result.push(((cell + 1) << 2) | W);
    return result;
  };
  const onEdge = (q: number) => {
    const cell = q >> 2, side = q & 3, x = cell % columns, y = Math.floor(cell / columns);
    return (side === N && y === 0) || (side === S && y === rows - 1) || (side === W && x === 0) || (side === E && x === columns - 1);
  };
  const seen = new Uint8Array(count);
  const flood = (start: number) => {
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      for (const next of neighbours(stack.pop()!)) {
        if (!seen[next] && empty(next)) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
  };
  for (let q = 0; q < count; q++) if (!seen[q] && empty(q) && onEdge(q)) flood(q); // outside
  let holes = 0;
  for (let q = 0; q < count; q++) {
    if (!seen[q] && empty(q)) {
      holes++;
      flood(q);
    }
  }
  return holes;
}

// ---- the settings

/** cover: the floor covering task, whose own settings and response are in cover.ts */
export type Task = "draw" | "measure" | "compare" | "cover";
export type Ask = "area" | "perimeter" | "both";
export type CompareBy = "area" | "perimeter";
export type Rules = { targetArea: number | null; targetPerimeter: number | null; mustBeRectangle: boolean };

export type Settings = {
  task: Task;
  columns: number;
  rows: number;
  halves: boolean;
  rules: Rules;
  ask: Ask;
  compareBy: CompareBy;
  /** draw: the author's example (the solution); measure: the shape to measure; compare: shape A */
  shape: Shape;
  /** compare: shape B */
  shapeB: Shape;
};

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;
const isTrue = (value: unknown) => String(value ?? "").trim().toLowerCase() === "true";

/** The settings, from the data- properties (strings); a missing or unknown one is its default. */
export function settingsFrom(properties: Record<string, unknown>): Settings {
  const columns = sizeFrom(properties.columns, 12, MAX_COLUMNS);
  const rows = sizeFrom(properties.rows, 8, MAX_ROWS);
  const number = (value: unknown) => {
    const n = parseNumber(String(value ?? ""));
    return n === undefined ? null : n;
  };
  return {
    task: oneOf(properties.task, ["draw", "measure", "compare", "cover"] as const, "draw"),
    columns,
    rows,
    halves: isTrue(properties.halves),
    rules: { targetArea: number(properties.targetArea), targetPerimeter: number(properties.targetPerimeter), mustBeRectangle: isTrue(properties.mustBeRectangle) },
    ask: oneOf(properties.ask, ["area", "perimeter", "both"] as const, "both"),
    compareBy: oneOf(properties.compareBy, ["area", "perimeter"] as const, "area"),
    shape: parseShape(properties.shape, columns, rows),
    shapeB: parseShape(properties.shapeB, columns, rows),
  };
}

/**
 * A number as a pupil writes it: "12", "7,5", "7.5", "7½", "7 ½", "7 1/2" or "½". Undefined for anything else ("",
 * "12 cm", "-3").
 */
export function parseNumber(text: string): number | undefined {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (/^\d+([.,]\d+)?$/.test(trimmed)) return Number(trimmed.replace(",", "."));
  const half = /^(?:(\d+) ?½|(?:(\d+) )?1\/2|½)$/.exec(trimmed);
  if (half) return Number(half[1] ?? half[2] ?? 0) + 0.5;
  return undefined;
}

export type RuleCheck = { meetsRules: boolean; area: boolean; perimeter: boolean; rectangle: boolean; oneShape: boolean };

/**
 * The rules of a drawing task: something is drawn, as one piece without holes (one shape), with the target area and
 * perimeter (when the settings give them), and a rectangle when that is asked. A shape with slanting sides has no
 * perimeter in grid units, so it never meets a target perimeter.
 */
export function checkRules(measures: Measures, rules: Rules): RuleCheck {
  const area = rules.targetArea === null || measures.area === rules.targetArea;
  const perimeter = rules.targetPerimeter === null || (measures.perimeter !== null && measures.perimeter === rules.targetPerimeter);
  const rectangle = !rules.mustBeRectangle || measures.rectangle;
  const oneShape = !measures.empty && measures.connected && measures.holes === 0;
  return { meetsRules: oneShape && area && perimeter && rectangle, area, perimeter, rectangle, oneShape };
}

/**
 * Whether the rules can be met at all on this grid, for the authoring mode: a rectangle of whole squares that fits, when a
 * rectangle is asked; otherwise only that the area fits and the perimeter is not odd without halves.
 */
export function rulesPossible(rules: Rules, columns: number, rows: number, halves: boolean): boolean {
  const { targetArea: area, targetPerimeter: perimeter } = rules;
  if (rules.mustBeRectangle) {
    for (let w = 1; w <= columns; w++) {
      for (let h = 1; h <= rows; h++) {
        if ((area === null || w * h === area) && (perimeter === null || 2 * (w + h) === perimeter)) return true;
      }
    }
    return false;
  }
  if (area !== null && (area <= 0 || area > columns * rows || (!halves && !Number.isInteger(area)) || !Number.isInteger(area * 2))) return false;
  // the grid edges of a shape of squares always add up to an even number (every row and column is crossed twice)
  if (perimeter !== null && (perimeter < 4 || !Number.isInteger(perimeter) || perimeter % 2 === 1)) return false;
  if (area !== null && perimeter !== null) {
    // a perimeter needs whole squares (a half has a slanting side); n squares in one piece without holes have a
    // perimeter from 2 * ceil(2 * sqrt(n)) (close to a square) to 2n + 2 (a strip)
    if (!Number.isInteger(area)) return false;
    if (perimeter < 2 * Math.ceil(2 * Math.sqrt(area)) || perimeter > 2 * area + 2) return false;
  }
  return true;
}

/** Which shape is larger by area or perimeter: "A", "B" or "same"; null when it cannot be said (no perimeter, nothing). */
export function compareShapes(a: Shape, b: Shape, by: CompareBy): "A" | "B" | "same" | null {
  const ma = measureShape(a), mb = measureShape(b);
  if (ma.empty || mb.empty) return null;
  const va = by === "area" ? ma.area : ma.perimeter, vb = by === "area" ? mb.area : mb.perimeter;
  if (va === null || vb === null) return null;
  return va > vb ? "A" : vb > va ? "B" : "same";
}

// ---- the response

/** A field of a record response, as QTI JSON: { name, base: { float: 12 } }. */
export type RecordField = { name: string; base: Record<string, number | boolean | string> };
export const field = (name: string, type: string, value: number | boolean | string): RecordField => ({ name, base: { [type]: value } });

/** What the pupil did: the squares drawn (draw), the numbers typed (measure), the shape chosen (compare). */
export type Work = { cells: CellValue[]; areaAnswer: string; perimeterAnswer: string; choice: string };

export const asksArea = (ask: Ask) => ask !== "perimeter";
export const asksPerimeter = (ask: Ask) => ask !== "area";

/**
 * The response for what the pupil did, as record fields; undefined while nothing is answered (nothing drawn, no number
 * typed, nothing chosen).
 * - draw: area, perimeter (left out with slanting sides), connected, noHoles, rectangle, meetsRules and the shape;
 * - measure: areaAnswer and perimeterAnswer, the ones asked that hold a number;
 * - compare: choice ("A", "B" or "same").
 */
export function responseFields(settings: Settings, work: Work): RecordField[] | undefined {
  if (settings.task === "cover") return undefined; // cover.ts coverResponseFields
  if (settings.task === "draw") {
    const shape: Shape = { columns: settings.columns, rows: settings.rows, cells: work.cells };
    const m = measureShape(shape);
    if (m.empty) return undefined;
    const fields = [field("area", "float", m.area)];
    if (m.perimeter !== null) fields.push(field("perimeter", "float", m.perimeter));
    fields.push(
      field("connected", "boolean", m.connected),
      field("noHoles", "boolean", m.holes === 0),
      field("rectangle", "boolean", m.rectangle),
      field("meetsRules", "boolean", checkRules(m, settings.rules).meetsRules),
      field("shape", "string", serializeShape(shape))
    );
    return fields;
  }
  if (settings.task === "measure") {
    const fields: RecordField[] = [];
    const area = parseNumber(work.areaAnswer), perimeter = parseNumber(work.perimeterAnswer);
    if (asksArea(settings.ask) && area !== undefined) fields.push(field("areaAnswer", "float", area));
    if (asksPerimeter(settings.ask) && perimeter !== undefined) fields.push(field("perimeterAnswer", "float", perimeter));
    return fields.length ? fields : undefined;
  }
  return ["A", "B", "same"].includes(work.choice) ? [field("choice", "identifier", work.choice)] : undefined;
}

/**
 * The correct response from the settings (getCorrectResponse), as record fields:
 * - measure: the area and/or perimeter of the shape (undefined without a shape, or for a perimeter with slanting sides);
 * - compare: the larger shape (undefined when it cannot be said);
 * - draw: many shapes are right, so only the fields that must be true: connected, noHoles, meetsRules, and rectangle when
 *   a rectangle is asked. This is not a full response: score a drawing with a rule on these fields (README, "Scoring").
 */
export function correctFields(settings: Settings): RecordField[] | undefined {
  if (settings.task === "cover") return undefined; // cover.ts coverCorrectFields
  if (settings.task === "draw") {
    const yes = (name: string) => field(name, "boolean", true);
    return [yes("connected"), yes("noHoles"), ...(settings.rules.mustBeRectangle ? [yes("rectangle")] : []), yes("meetsRules")];
  }
  if (settings.task === "measure") {
    const m = measureShape(settings.shape);
    if (m.empty || (asksPerimeter(settings.ask) && m.perimeter === null)) return undefined;
    return [
      ...(asksArea(settings.ask) ? [field("areaAnswer", "float", m.area)] : []),
      ...(asksPerimeter(settings.ask) ? [field("perimeterAnswer", "float", m.perimeter!)] : []),
    ];
  }
  const larger = compareShapes(settings.shape, settings.shapeB, settings.compareBy);
  return larger === null ? undefined : [field("choice", "identifier", larger)];
}

/**
 * The fields of a response as a plain object ({ area: 12, shape: "##" }), from what a player hands the PCI: a record
 * ({ record: [{ name, base }] }), a list of fields, or such an object itself. Undefined for anything else.
 */
export function fieldsOf(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const items = Array.isArray(value) ? value : (value as { record?: unknown }).record;
  if (Array.isArray(items)) {
    const result: Record<string, unknown> = {};
    for (const item of items) {
      if (!item || typeof item !== "object" || typeof (item as RecordField).name !== "string") continue;
      const { name, base, value: plain } = item as RecordField & { value?: unknown };
      result[name] = base && typeof base === "object" ? Object.values(base)[0] : plain;
    }
    return result;
  }
  return Array.isArray(value) ? undefined : (value as Record<string, unknown>);
}

/** A number as the pupil's language writes it: 7.5 → "7,5" in Dutch. */
export const formatNumber = (n: number, language: string) => (language === "nl" ? String(n).replace(".", ",") : String(n));
