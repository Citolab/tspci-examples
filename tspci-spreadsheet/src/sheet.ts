// The sheet the author sets up (data-sheet): its size, column widths, the cells the candidate starts with, and the
// answer cell. Inputs are canonical (formula.ts): 0.45 and =SUM(A1,B1), also in a Dutch item.

import { MAX_COLUMNS, MAX_ROWS, parseRef, refName } from "./formula";

export type CellDef = {
  input: string;
  /** The candidate cannot change it. */
  locked?: boolean;
  bold?: boolean;
  /** The background colour, one of FILLS. */
  fill?: string;
};
export type Sheet = {
  columns: number;
  rows: number;
  /** One per column, in pixels. */
  widths: number[];
  cells: Record<string, CellDef>;
  /** In answer mode: the cell whose value is the response. */
  answer: string | null;
};
export type Mode = "answer" | "tool";

/** The colours a cell can have: the light ones of Excel, so the text stays readable. */
export const FILLS = {
  yellow: "#fff2cc",
  green: "#e2efda",
  blue: "#ddebf7",
  orange: "#fce4d6",
  purple: "#e4dfec",
  grey: "#ededed",
} as const;
export type FillName = keyof typeof FILLS;
const isFill = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

export const WIDTH = { min: 40, max: 400, standard: 96 };
export const parseMode = (value: string): Mode => (value === "tool" ? "tool" : "answer");

const groceries: [string, string, string?][] = [
  ["Apples", "0.45", "6"],
  ["Bread", "2.19", "2"],
  ["Milk", "1.09", "3"],
  ["Cheese", "4.75", "1"],
];
export const DEFAULT_SHEET: Sheet = {
  columns: 5,
  rows: 8,
  widths: [120, 96, 96, 96, 96],
  cells: {
    ...Object.fromEntries(["Item", "Price (€)", "Quantity", "Total"].map((input, c) => [refName(0, c), { input, locked: true, bold: true }])),
    ...Object.fromEntries(
      groceries.flatMap((row, r) => row.map((input, c) => [refName(r + 1, c), { input, locked: true }])),
    ),
    A6: { input: "Total", locked: true, bold: true },
  },
  answer: "D6",
};

export const inBounds = (sheet: Pick<Sheet, "columns" | "rows">, ref: string) => {
  const p = parseRef(ref);
  return !!p && p.row < sheet.rows && p.col < sheet.columns;
};

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

/** data-sheet → a sheet; empty or broken: the example sheet. */
export const parseSheet = (json: string): Sheet => {
  if (!json) return DEFAULT_SHEET;
  try {
    const raw = JSON.parse(json);
    const columns = clamp(raw.columns, 1, MAX_COLUMNS, 5);
    const rows = clamp(raw.rows, 1, MAX_ROWS, 8);
    const widths = Array.from({ length: columns }, (_, i) => clamp(raw.widths?.[i], WIDTH.min, WIDTH.max, WIDTH.standard));
    const cells: Record<string, CellDef> = {};
    for (const [ref, c] of Object.entries<any>(raw.cells ?? {})) {
      if (!inBounds({ columns, rows }, ref)) continue;
      cells[ref] = { input: String(c?.input ?? ""), ...(c?.locked && { locked: true }), ...(c?.bold && { bold: true }), ...(isFill(c?.fill) && { fill: c.fill }) };
    }
    const answer = typeof raw.answer === "string" && inBounds({ columns, rows }, raw.answer) ? raw.answer : null;
    return { columns, rows, widths, cells, answer };
  } catch {
    return DEFAULT_SHEET;
  }
};

/** Only what is in the sheet: cells outside it (after making it smaller) and empty plain cells go. */
export const serializeSheet = (sheet: Sheet) =>
  JSON.stringify({
    ...sheet,
    cells: Object.fromEntries(Object.entries(sheet.cells).filter(([ref, c]) => inBounds(sheet, ref) && (c.input || c.locked || c.bold || c.fill))),
    answer: sheet.answer && inBounds(sheet, sheet.answer) ? sheet.answer : null,
  });

/** The inputs of the sheet with the candidate's changes over them ("" empties a cell); locked cells keep theirs. */
export const inputsOf = (sheet: Sheet, edits: Record<string, string> = {}) => {
  const inputs: Record<string, string> = {};
  for (const [ref, c] of Object.entries(sheet.cells)) if (c.input && inBounds(sheet, ref)) inputs[ref] = c.input;
  for (const [ref, input] of Object.entries(edits)) {
    if (sheet.cells[ref]?.locked || !inBounds(sheet, ref)) continue;
    if (input) inputs[ref] = input;
    else delete inputs[ref];
  }
  return inputs;
};

/** A1, B1, …, A2: the reading order of the sheet. */
export const byPosition = (a: string, b: string) => {
  const p = parseRef(a);
  const q = parseRef(b);
  return p.row - q.row || p.col - q.col;
};
