// The table the author builds (data-table), what the candidate may type, how values are normalized and checked.
// No imports: `npm test` runs this file in node (test/table.test.ts).
// Rows and columns keep their id when others are added or removed; a cell is `r2-c3`.

/** A given cell shows `text`; an input cell expects `text` (as the author typed it), within `tolerance` for numbers. */
export type Cell = { kind: "given" | "input"; text: string; tolerance?: string };
export type Column = { id: string };
export type Row = { id: string; cells: Cell[] };
export type Table = {
  columns: Column[];
  /** Every row has one cell per column. */
  rows: Row[];
  /** The first column holds row headers ("time (s)", "height (m)"): never an input. */
  headerColumn: boolean;
  /** The first row is a header row on top: never an input. */
  headerRow: boolean;
};

/** What the candidate may type in an input cell (data-input-mode, data-max-characters, data-decimals, data-allow-negative). */
export type Rules = {
  mode: "number" | "text";
  /** 0: no limit. */
  maxCharacters: number;
  /** The most decimals a number may have; null: any. */
  decimals: number | null;
  negative: boolean;
};

export type Separator = "." | ",";
export const separatorFor = (language: string): Separator => ((language ?? "").slice(0, 2).toLowerCase() === "nl" ? "," : ".");

const given = (text: string): Cell => ({ kind: "given", text });
const input = (text: string, tolerance = ""): Cell => ({ kind: "input", text, tolerance });

/** The example: the height of a ball dropped from 20 m, h = 20 − 4.9·t², rounded to one decimal. */
export const DEFAULT_TABLE: Table = {
  columns: ["c1", "c2", "c3", "c4", "c5", "c6"].map((id) => ({ id })),
  rows: [
    { id: "r1", cells: ["time (s)", "0", "0.5", "1", "1.5", "2"].map(given) },
    { id: "r2", cells: [given("height (m)"), given("20"), input("18.8", "0.1"), given("15.1"), input("9", "0.1"), input("0.4", "0.1")] },
  ],
  headerColumn: true,
  headerRow: false,
};

// ---------------------------------------------------------------------------------------------------------------
// Settings

const integer = (value: string, fallback: number) => {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const parseRules = (p: { inputMode?: string; maxCharacters?: string; decimals?: string; allowNegative?: string }): Rules => ({
  mode: String(p.inputMode ?? "").toLowerCase() === "text" ? "text" : "number",
  maxCharacters: integer(p.maxCharacters, 0),
  decimals: String(p.decimals ?? "").trim() === "" ? null : integer(p.decimals, null as unknown as number),
  negative: String(p.allowNegative ?? "").toLowerCase() === "true",
});

/** data-table → a table; empty or broken: the example. Missing or duplicate ids get a new one. */
export const parseTable = (json: string): Table => {
  if (!json) return DEFAULT_TABLE;
  try {
    const raw = JSON.parse(json);
    const valid = (id: unknown, prefix: string, seen: string[]) =>
      typeof id === "string" && new RegExp(`^${prefix}\\d+$`).test(id) && !seen.includes(id);
    const columns: Column[] = [];
    for (const c of raw.columns ?? []) {
      columns.push({ id: valid(c?.id, "c", columns.map((x) => x.id)) ? c.id : nextId("c", columns.map((x) => x.id)) });
    }
    const rows: Row[] = [];
    for (const r of raw.rows ?? []) {
      const id = valid(r?.id, "r", rows.map((x) => x.id)) ? r.id : nextId("r", rows.map((x) => x.id));
      rows.push({
        id,
        cells: columns.map((_, i) => {
          const c = r?.cells?.[i];
          if (typeof c === "string") return given(c);
          return c?.kind === "input" ? input(String(c.text ?? ""), String(c.tolerance ?? "")) : given(String(c?.text ?? ""));
        }),
      });
    }
    if (!columns.length || !rows.length) return DEFAULT_TABLE;
    return { columns, rows, headerColumn: !!raw.headerColumn, headerRow: !!raw.headerRow };
  } catch {
    return DEFAULT_TABLE;
  }
};

/** Compact: a given cell is its text, an input cell an object; no empty tolerances. */
export const serializeTable = (table: Table) =>
  JSON.stringify({
    columns: table.columns,
    rows: table.rows.map((r) => ({
      id: r.id,
      cells: r.cells.map((c) => (c.kind === "given" ? c.text : c.tolerance ? { kind: "input", text: c.text, tolerance: c.tolerance } : { kind: "input", text: c.text })),
    })),
    headerColumn: table.headerColumn,
    headerRow: table.headerRow,
  });

// ---------------------------------------------------------------------------------------------------------------
// The cells

export const cellId = (row: Row, column: Column) => `${row.id}-${column.id}`;

export const isHeader = (table: Table, row: number, column: number) => (table.headerRow && row === 0) || (table.headerColumn && column === 0);

export type InputCell = { id: string; row: number; column: number; cell: Cell };

/** The input cells in reading order (row by row, left to right): the order of the response. */
export const inputCells = (table: Table): InputCell[] => {
  const out: InputCell[] = [];
  table.rows.forEach((r, i) =>
    r.cells.forEach((cell, j) => {
      if (cell.kind === "input" && !isHeader(table, i, j)) out.push({ id: cellId(r, table.columns[j]), row: i, column: j, cell });
    })
  );
  return out;
};

/**
 * What a screen reader hears for a cell, besides its value: its row header and its column header. Without a header
 * row, the first row names the columns when the first column holds the row headers ("time (s) 0.5").
 */
export const cellContext = (table: Table, row: number, column: number): { row: string; column: string } => {
  const text = (r: number, c: number) => table.rows[r]?.cells[c]?.text ?? "";
  const rowHeader = table.headerColumn && column > 0 ? text(row, 0) : "";
  let columnHeader = "";
  if (table.headerRow && row > 0) columnHeader = text(0, column);
  else if (!table.headerRow && table.headerColumn && row > 0 && table.rows[0].cells[column]?.kind === "given") {
    columnHeader = `${text(0, 0)} ${text(0, column)}`.trim();
  }
  return { row: rowHeader, column: columnHeader };
};

export type Direction = "up" | "down" | "left" | "right" | "next" | "previous";

/** The input cell to go to from `id`: the nearest one in that direction; left and right go on in reading order. */
export const move = (table: Table, id: string, direction: Direction): string | null => {
  const cells = inputCells(table);
  const at = cells.findIndex((c) => c.id === id);
  if (at < 0) return null;
  const from = cells[at];
  if (direction === "next") return cells[at + 1]?.id ?? null;
  if (direction === "previous") return cells[at - 1]?.id ?? null;
  if (direction === "left" || direction === "right") {
    const sameRow = cells.filter((c) => c.row === from.row && (direction === "left" ? c.column < from.column : c.column > from.column));
    if (sameRow.length) return (direction === "left" ? sameRow[sameRow.length - 1] : sameRow[0]).id;
    return cells[at + (direction === "left" ? -1 : 1)]?.id ?? null;
  }
  const sameColumn = cells.filter((c) => c.column === from.column && (direction === "up" ? c.row < from.row : c.row > from.row));
  if (!sameColumn.length) return null;
  return (direction === "up" ? sameColumn[sameColumn.length - 1] : sameColumn[0]).id;
};

// ---------------------------------------------------------------------------------------------------------------
// Typing, normalizing and checking values

export type Refusal = "character" | "separator" | "decimals" | "length" | "negative";

/** The decimal separator the candidate typed becomes the one of the language: 3.5 → 3,5 in Dutch. */
export const localizeTyping = (value: string, rules: Rules, separator: Separator) =>
  rules.mode === "number" ? value.replace(/[.,]/g, separator) : value;

/**
 * Why the candidate may not type this (the whole value of the field after the key), or null. A number on its way
 * is fine: "", "-", "3," and ",5".
 */
export const refusal = (value: string, rules: Rules): Refusal | null => {
  if (rules.maxCharacters > 0 && [...value].length > rules.maxCharacters) return "length";
  if (rules.mode === "text") return null;
  if (/[^0-9.,\-]/.test(value)) return "character";
  if (value.includes("-") && !rules.negative) return "negative";
  if (!/^-?[0-9]*([.,][0-9]*)?$/.test(value)) return value.lastIndexOf("-") > 0 ? "character" : "separator";
  const decimals = value.split(/[.,]/)[1];
  if (decimals !== undefined && rules.decimals !== null && (rules.decimals === 0 || decimals.length > rules.decimals)) return "decimals";
  return null;
};

/** A number as a canonical string: point, no leading zeros, no trailing decimal zeros (",50" → "0.5"); else null. */
export const canonicalNumber = (value: string): string | null => {
  const m = /^\s*(-?)\s*([0-9]*)(?:[.,]([0-9]*))?\s*$/.exec(String(value ?? ""));
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) return null;
  const whole = m[2].replace(/^0+(?=\d)/, "") || "0";
  const fraction = (m[3] ?? "").replace(/0+$/, "");
  const text = fraction ? `${whole}.${fraction}` : whole;
  return m[1] && /[1-9]/.test(text) ? `-${text}` : text;
};

/** What goes in the response: a number canonical (3,50 → 3.5), text trimmed with single spaces; "" for nothing. */
export const normalizeValue = (value: string, rules: Rules): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (rules.mode === "text" || text === "") return text;
  return canonicalNumber(text) ?? text.replace(/,/g, ".");
};

/** A normalized value as the candidate sees it: 3.5 → 3,5 in Dutch. */
export const displayValue = (value: string, rules: Rules, separator: Separator) =>
  rules.mode === "number" && canonicalNumber(value) !== null ? value.replace(".", separator) : value;

/** The tolerance of a cell as a number: absolute, 0 when there is none. Null when it is not a number. */
export const toleranceOf = (cell: Cell): number | null => {
  const text = String(cell.tolerance ?? "").trim();
  if (!text) return 0;
  const n = canonicalNumber(text);
  return n === null || n.startsWith("-") ? null : Number(n);
};

/** Is the candidate's value right for this input cell? Numbers within the tolerance, text the same after normalizing. */
export const isCorrect = (value: string, cell: Cell, rules: Rules): boolean => {
  const given = normalizeValue(value, rules);
  const expected = normalizeValue(cell.text, rules);
  if (given === "" || expected === "") return false;
  if (rules.mode === "text") return given === expected;
  const a = canonicalNumber(given);
  const b = canonicalNumber(expected);
  if (a === null || b === null) return false;
  const tolerance = toleranceOf(cell) ?? 0;
  return Math.abs(Number(a) - Number(b)) <= tolerance + 1e-9 * Math.max(1, Math.abs(Number(b)));
};

export type Score = { correct: number; errors: number; score: number; maxscore: number };

/**
 * Scoring as the exam rule says: `penalty` points off for each missing or wrong value, never below 0, out of
 * `maxScore` points. `values` in the order of inputCells().
 */
export const scoreValues = (values: string[], table: Table, rules: Rules, maxScore: number, penalty: number): Score => {
  const cells = inputCells(table);
  const correct = cells.filter((c, i) => isCorrect(values[i] ?? "", c.cell, rules)).length;
  const errors = cells.length - correct;
  return { correct, errors, score: Math.max(0, maxScore - penalty * errors), maxscore: maxScore };
};

/** The expected values in response order, normalized: the correct response. */
export const expectedValues = (table: Table, rules: Rules) => inputCells(table).map((c) => normalizeValue(c.cell.text, rules));

// ---------------------------------------------------------------------------------------------------------------
// Authoring

export type Problem =
  | { code: "noInputs" }
  | { code: "noExpected" | "notNumber" | "tooLong" | "tooManyDecimals" | "negative" | "badTolerance"; cells: string[] };

/** "row 2, column 3" is the author's name of a cell: 1-based [row, column]. */
const where = (c: InputCell) => `${c.row + 1}:${c.column + 1}`;

/** What keeps the table from being scored: the texts are in texts.ts. */
export const tableProblems = (table: Table, rules: Rules): Problem[] => {
  const cells = inputCells(table);
  if (!cells.length) return [{ code: "noInputs" }];
  const list = (code: Exclude<Problem["code"], "noInputs">, test: (c: InputCell) => boolean): Problem[] => {
    const hits = cells.filter(test).map(where);
    return hits.length ? [{ code, cells: hits }] : [];
  };
  const expected = (c: InputCell) => c.cell.text.trim();
  return [
    ...list("noExpected", (c) => expected(c) === ""),
    ...(rules.mode === "number" ? list("notNumber", (c) => expected(c) !== "" && canonicalNumber(expected(c)) === null) : []),
    ...(rules.mode === "number" ? list("negative", (c) => !rules.negative && /^\s*-/.test(expected(c)) && canonicalNumber(expected(c)) !== "0") : []),
    ...(rules.mode === "number" && rules.decimals !== null
      ? list("tooManyDecimals", (c) => ((canonicalNumber(expected(c)) ?? "").split(".")[1] ?? "").length > rules.decimals)
      : []),
    ...list("tooLong", (c) => rules.maxCharacters > 0 && [...normalizeValue(expected(c), rules)].length > rules.maxCharacters),
    ...(rules.mode === "number" ? list("badTolerance", (c) => toleranceOf(c.cell) === null) : []),
  ];
};

/** The next free id: r5 after r1..r4, also when r2 was removed. */
export const nextId = (prefix: "r" | "c", ids: string[]) =>
  `${prefix}${Math.max(0, ...ids.map((id) => Number(id.slice(1))).filter(Number.isFinite)) + 1}`;

export const addRow = (table: Table): Table => ({
  ...table,
  rows: [...table.rows, { id: nextId("r", table.rows.map((r) => r.id)), cells: table.columns.map(() => given("")) }],
});
export const addColumn = (table: Table): Table => ({
  ...table,
  columns: [...table.columns, { id: nextId("c", table.columns.map((c) => c.id)) }],
  rows: table.rows.map((r) => ({ ...r, cells: [...r.cells, given("")] })),
});
export const removeRow = (table: Table, index: number): Table =>
  table.rows.length < 2 ? table : { ...table, rows: table.rows.filter((_, i) => i !== index) };
export const removeColumn = (table: Table, index: number): Table =>
  table.columns.length < 2
    ? table
    : {
        ...table,
        columns: table.columns.filter((_, i) => i !== index),
        rows: table.rows.map((r) => ({ ...r, cells: r.cells.filter((_, i) => i !== index) })),
      };

export const updateCell = (table: Table, row: number, column: number, change: Partial<Cell>): Table => ({
  ...table,
  rows: table.rows.map((r, i) => (i === row ? { ...r, cells: r.cells.map((c, j) => (j === column ? { ...c, ...change } : c)) } : r)),
});

/**
 * A pasted value: `[18,8]` is an input cell that expects 18,8, `[18,8 ± 0,1]` (or `+-`) one with a tolerance, `[]` one
 * without an expected value yet; anything else is a given cell.
 */
export const parsePasted = (text: string): Cell => {
  const m = /^\s*\[(.*)\]\s*$/.exec(text);
  if (!m) return given(text.trim());
  const [value, tolerance = ""] = m[1].split(/±|\+-|\+\/-/);
  return input(value.trim(), tolerance.trim());
};

/** Cells copied from a spreadsheet (tabs and new lines), written from (row, column) on; the table grows to fit. */
export const pasteGrid = (table: Table, text: string, row: number, column: number): Table => {
  const grid = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
  let next = table;
  const width = column + Math.max(...grid.map((line) => line.length));
  while (next.columns.length < width) next = addColumn(next);
  while (next.rows.length < row + grid.length) next = addRow(next);
  grid.forEach((line, i) => line.forEach((t, j) => (next = updateCell(next, row + i, column + j, parsePasted(t)))));
  return next;
};
