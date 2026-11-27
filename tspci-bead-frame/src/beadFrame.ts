// The bead frame (rekenrek) and the hundred field (honderdveld) without a screen: the settings, the grid of beads or
// squares, what a click, a drag or a key does to it, the checks (structured, via ten), the response and the correct
// response. No imports: `npm test` runs it in node as it is (test/beadFrame.test.ts).

export type Model = "rekenrek" | "hundred";
/** set: show the number; addition: show a + b, b in the second colour; show: the PCI only shows a number (a tool). */
export type Task = "set" | "show" | "addition";
/** How the hundred field draws its places: squares or dots. */
export type Look = "squares" | "dots";
/** A bead or a square: 0 not pushed / not coloured, 1 the first part (colour), 2 the second part (addition). */
export type Fill = 0 | 1 | 2;
/**
 * The frame, row by row from the top, 10 places per row from the left. On the rekenrek a row's pushed beads are always
 * at its left end (they slide along the rod), so a row there is its filled places first and then zeros: [1,1,1,2,0,…].
 */
export type Grid = Fill[][];

/** Beads on a rod, squares in a row of the hundred field. */
export const PER_ROW = 10;
/** The 5-structure: a gap after every 5, across and down. */
export const FIVE = 5;

export type Settings = {
  model: Model;
  /** 2 (a rekenrek of 20) or 10 (a rekenrek of 100, the hundred field) */
  rows: number;
  task: Task;
  /** the number to show (set), the first number of the sum (addition), the number shown (show); null when unusable */
  number: number | null;
  /** the number added (addition); null when unusable or the sum does not fit */
  add: number | null;
  look: Look;
  /** what the author arranged in the authoring mode (show only); null: the number, the way the frame is read */
  layout: Grid | null;
};

/** A whole number from a setting (they all arrive as text) within min and max, or null. */
export function wholeNumber(text: unknown, min: number, max: number): number | null {
  const trimmed = String(text ?? "").trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= min && n <= max ? n : null;
}

export function parseSettings(p: Partial<Record<string, unknown>>): Settings {
  const model: Model = p.model === "hundred" ? "hundred" : "rekenrek";
  const rows = model === "hundred" || String(p.size ?? "").trim() === "100" ? 10 : 2;
  const task: Task = p.task === "show" || p.task === "addition" ? p.task : "set";
  const capacity = rows * PER_ROW;
  const number = wholeNumber(p.number, 0, capacity);
  let add = wholeNumber(p.add, 0, capacity);
  if (number !== null && add !== null && number + add > capacity) add = null;
  return {
    model,
    rows,
    task,
    number,
    add,
    look: p.cells === "dots" ? "dots" : "squares",
    layout: parseLayout(String(p.layout ?? ""), model, rows),
  };
}

export const capacityOf = (s: Pick<Settings, "rows">) => s.rows * PER_ROW;

/** The number the candidate must show: set N, or a + b; null when the settings do not give one (or for show). */
export function target(s: Settings): number | null {
  if (s.task === "set") return s.number !== null && s.number > 0 ? s.number : null;
  if (s.task === "addition") return s.number !== null && s.add !== null && s.number > 0 && s.add > 0 ? s.number + s.add : null;
  return null;
}

// ---- the grid ----

export const emptyGrid = (rows: number): Grid => Array.from({ length: rows }, () => Array<Fill>(PER_ROW).fill(0));

/** first places in the first colour and then second in the second, in reading order: full rows first, from the top left. */
export function structuredGrid(rows: number, first: number, second = 0): Grid {
  const grid = emptyGrid(rows);
  for (let i = 0; i < Math.min(first + second, rows * PER_ROW); i++) grid[Math.floor(i / PER_ROW)][i % PER_ROW] = i < first ? 1 : 2;
  return grid;
}

/** The grid a frame starts with: what it shows (show), or nothing pushed or coloured. */
export function startGrid(s: Settings): Grid {
  if (s.task !== "show") return emptyGrid(s.rows);
  return s.layout ?? structuredGrid(s.rows, s.number ?? 0);
}

export const rowCount = (row: Fill[]) => row.filter((fill) => fill !== 0).length;

export function counts(grid: Grid) {
  const all = grid.flat();
  const first = all.filter((fill) => fill === 1).length;
  const second = all.filter((fill) => fill === 2).length;
  return { value: first + second, first, second };
}

/**
 * The places are filled the way the frame is read: in reading order (row by row from the top, each from the left)
 * the first `value` places are filled and the rest are empty. On the rekenrek: full rows first, then one row with the
 * rest. 13 is 10 and 3, not 5 and 5 and 3.
 */
export function isStructured(grid: Grid): boolean {
  const all = grid.flat();
  const { value } = counts(grid);
  return all.slice(0, value).every((fill) => fill !== 0);
}

/**
 * The sum is shown via ten: structured, both parts there, and the second part goes on where the first stops. 8 + 5 on
 * a rekenrek: 8 on the top row, 2 more to fill it to ten, 3 on the next row.
 */
export function isViaTen(grid: Grid): boolean {
  const { first, second } = counts(grid);
  return first > 0 && second > 0 && isStructured(grid) && grid.flat().slice(0, first).every((fill) => fill === 1);
}

const replaceRow = (grid: Grid, r: number, row: Fill[]): Grid => grid.map((current, i) => (i === r ? row : current));

/**
 * The rekenrek: `count` beads of row r pushed to the left. The beads already there stay as they are; beads pushed now
 * get `part`; beads pushed back are taken from the right of the group, as on a rod.
 */
export function pushRow(grid: Grid, r: number, count: number, part: 1 | 2): Grid {
  const row = grid[r];
  if (!row) return grid;
  const pushed = rowCount(row);
  const next = Math.max(0, Math.min(PER_ROW, Math.round(count)));
  if (next === pushed) return grid;
  return replaceRow(grid, r, Array.from({ length: PER_ROW }, (_, i): Fill => (i >= next ? 0 : i < pushed ? row[i] : part)));
}

/** The hundred field: a square coloured with `fill` (0 takes the colour off). */
export function paintCell(grid: Grid, r: number, c: number, fill: Fill): Grid {
  if (grid[r]?.[c] === undefined || grid[r][c] === fill) return grid;
  return replaceRow(grid, r, grid[r].map((current, i) => (i === c ? fill : current)));
}

/** A click on a square: its colour on, or off when it has that colour already. */
export const toggleFill = (current: Fill, part: 1 | 2): Fill => (current === part ? 0 : part);

// ---- the rekenrek: clicks, drags and keys ----

/**
 * A click on bead i of a row with `pushed` beads at the left: a bead on the right goes left and takes the beads to
 * its left along (i + 1 pushed); a bead on the left goes back and takes the beads to its right along (i pushed).
 */
export const clickCount = (i: number, pushed: number) => (i < pushed ? i : i + 1);

/**
 * Dragging bead i by dx (in the units of beadX) from where it was, with `pushed` beads at the left when the drag began:
 * half a bead to the left pushes it (and the beads to its left), half a bead to the right takes it back (and the beads
 * to its right); in between it stays as it was.
 */
export function dragCount(i: number, pushed: number, dx: number): number {
  const threshold = BEAD / 2;
  if (i >= pushed) return dx <= -threshold ? i + 1 : pushed;
  return dx >= threshold ? i : pushed;
}

/**
 * A key on a row (a slider of the number of beads pushed). The beads move to the left, so ← (and ↑) pushes one more
 * and → (and ↓) takes one back; Page Up and Page Down five at a time (the 5-structure); Home none, End all ten.
 * null: not a key of the slider.
 */
export function sliderKey(key: string, pushed: number): number | null {
  const clamp = (n: number) => Math.max(0, Math.min(PER_ROW, n));
  switch (key) {
    case "ArrowLeft":
    case "ArrowUp":
      return clamp(pushed + 1);
    case "ArrowRight":
    case "ArrowDown":
      return clamp(pushed - 1);
    case "PageUp":
      return clamp(pushed + FIVE);
    case "PageDown":
      return clamp(pushed - FIVE);
    case "Home":
      return 0;
    case "End":
      return PER_ROW;
    default:
      return null;
  }
}

/** A key in the hundred field: the square that gets the focus (arrows, Home and End in the row), or null. */
export function gridKey(key: string, r: number, c: number, rows: number): [number, number] | null {
  const clamp = (n: number, max: number) => Math.max(0, Math.min(max - 1, n));
  switch (key) {
    case "ArrowLeft":
      return [r, clamp(c - 1, PER_ROW)];
    case "ArrowRight":
      return [r, clamp(c + 1, PER_ROW)];
    case "ArrowUp":
      return [clamp(r - 1, rows), c];
    case "ArrowDown":
      return [clamp(r + 1, rows), c];
    case "Home":
      return [r, 0];
    case "End":
      return [r, PER_ROW - 1];
    default:
      return null;
  }
}

// ---- the rekenrek drawn: where each bead is ----

/** The width of a bead (its diameter and a little room), the extra gap after five beads, the room on the rod. */
export const BEAD = 30;
export const GAP = 10;
export const FREE = 5 * BEAD;
const MARGIN = BEAD / 2 + 3;
/** The length of a rod: ten beads, the gap after five, and room for them to move. */
export const ROD = 2 * MARGIN + 9 * BEAD + GAP + FREE;

/** The x of the middle of bead i (0 at the left) on a rod with `pushed` beads at the left. */
export const beadX = (i: number, pushed: number) => MARGIN + i * BEAD + (i >= FIVE ? GAP : 0) + (i < pushed ? 0 : FREE);

// ---- the layout of the authoring mode: "1111111111/1110000000" ----

/** A grid as text: a row per "/", a digit per place (0, 1, 2). Nothing filled: "". */
export function serializeLayout(grid: Grid): string {
  return counts(grid).value === 0 ? "" : grid.map((row) => row.join("")).join("/");
}

/**
 * The layout setting as a grid of this frame, or null when it fills nothing. Missing places are empty, extra ones are
 * left out; on the rekenrek the beads of a row slide to its left end.
 */
export function parseLayout(text: string, model: Model, rows: number): Grid | null {
  const trimmed = text.trim();
  if (!/^[012/\s]+$/.test(trimmed)) return null;
  const parts = trimmed.replace(/\s/g, "").split("/");
  const grid = Array.from({ length: rows }, (_, r) => {
    const row = Array.from({ length: PER_ROW }, (_, c) => Number((parts[r] ?? "")[c] ?? 0) as Fill);
    if (model !== "rekenrek") return row;
    const filled = row.filter((fill) => fill !== 0);
    return [...filled, ...Array<Fill>(PER_ROW - filled.length).fill(0)];
  });
  return counts(grid).value === 0 ? null : grid;
}

// ---- the response ----

export type Field = { name: string; base: { integer?: number; boolean?: boolean } };
export type RecordResponse = { record: Field[] };

const integer = (name: string, value: number): Field => ({ name, base: { integer: value } });
const boolean = (name: string, value: boolean): Field => ({ name, base: { boolean: value } });

/**
 * The response: undefined while nothing is pushed or coloured, and for a frame that only shows a number (show). Otherwise
 * a record: value (how many), for a sum first and second (per colour), structured, for a sum viaTen, and correct when
 * the settings give the number to show.
 */
export function responseOf(grid: Grid, s: Settings): RecordResponse | undefined {
  const { value, first, second } = counts(grid);
  if (s.task === "show" || value === 0) return undefined;
  const record: Field[] = [integer("value", value)];
  if (s.task === "addition") record.push(integer("first", first), integer("second", second));
  record.push(boolean("structured", isStructured(grid)));
  if (s.task === "addition") record.push(boolean("viaTen", isViaTen(grid)));
  if (target(s) !== null) record.push(boolean("correct", s.task === "addition" ? first === s.number && second === s.add : value === s.number));
  return { record };
}

/**
 * The correct response from the settings (getCorrectResponse): the number shown the way the frame is read, a sum via
 * ten. What responseOf reports for structuredGrid(target), so setResponse of it shows exactly that.
 */
export function correctResponseOf(s: Settings): RecordResponse | undefined {
  if (target(s) === null) return undefined;
  return responseOf(structuredGrid(s.rows, s.number, s.task === "addition" ? s.add : 0), s);
}

export type Counts = { value: number; first: number; second: number };

/** The numbers in a response (a record, or a plain integer), as given to setResponse, boundTo or as a correct response. */
export function countsOf(response: unknown): Counts | null {
  if (Array.isArray(response)) return countsOf(response[0]);
  if (typeof response === "number") return Number.isInteger(response) && response >= 0 ? { value: response, first: response, second: 0 } : null;
  if (!response || typeof response !== "object") return null;
  const { record, base } = response as { record?: Field[]; base?: { integer?: unknown } };
  if (!Array.isArray(record)) return base && "integer" in base ? countsOf(Number(base.integer)) : null;
  const field = (name: string) => {
    const value = record.find((f) => f?.name === name)?.base?.integer;
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
  };
  const value = field("value");
  const first = field("first");
  const second = field("second");
  if (first !== null && second !== null) return { value: first + second, first, second };
  return value === null ? null : { value, first: value, second: 0 };
}

/**
 * The grid for the numbers of a response, the way the frame is read (a response does not say where the beads were).
 * In a sum without parts, the first number comes first.
 */
export function gridFromCounts(s: Settings, { value, first, second }: Counts): Grid {
  const capacity = capacityOf(s);
  if (s.task !== "addition") return structuredGrid(s.rows, Math.min(value, capacity));
  if (first + second !== value || (second === 0 && s.number !== null)) {
    const one = Math.min(value, s.number ?? value);
    return structuredGrid(s.rows, Math.min(one, capacity), Math.min(value - one, capacity - one));
  }
  return structuredGrid(s.rows, Math.min(first, capacity), Math.min(second, capacity - Math.min(first, capacity)));
}

/** The same numbers: a response that says what the grid already shows does not move its beads. */
export const sameCounts = (a: Counts, b: Counts) => a.value === b.value && a.first === b.first && a.second === b.second;
