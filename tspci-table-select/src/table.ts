// The table the author builds (data-table) and what the candidate can choose in it.
// Rows and columns keep their id when others are added or removed, so a correct response stays valid.

export type Column = { id: string; label: string };
export type Row = { id: string; cells: string[] };
export type Table = {
  columns: Column[];
  /** Every row has one cell per column. */
  rows: Row[];
  /** The first column holds row headers: in "cell" mode they cannot be chosen. */
  rowHeaders: boolean;
};
export type Mode = "row" | "cell";

const timetable = [
  ["A", "08:12", "09:47", "3"],
  ["B", "08:30", "10:05", "5"],
  ["C", "08:45", "10:20", "3"],
  ["D", "09:02", "10:31", "7"],
];
export const DEFAULT_TABLE: Table = {
  columns: ["Train", "Departs", "Arrives", "Platform"].map((label, i) => ({ id: `c${i + 1}`, label })),
  rows: timetable.map((cells, i) => ({ id: `r${i + 1}`, cells })),
  rowHeaders: true,
};

export const parseMode = (value: string): Mode => (value === "cell" ? "cell" : "row");

/** The next free id: r5 after r1..r4, also when r2 was removed. */
export const nextId = (prefix: "r" | "c", ids: string[]) =>
  `${prefix}${Math.max(0, ...ids.map((id) => Number(id.slice(1))).filter(Number.isFinite)) + 1}`;

/** data-table → a table; empty or broken: the example timetable. Missing or duplicate ids get a new one. */
export const parseTable = (json: string): Table => {
  if (!json) return DEFAULT_TABLE;
  try {
    const raw = JSON.parse(json);
    const valid = (id: unknown, prefix: string, seen: string[]) =>
      typeof id === "string" && new RegExp(`^${prefix}\\d+$`).test(id) && !seen.includes(id);
    const columns: Column[] = [];
    for (const c of raw.columns ?? []) {
      const id = valid(c?.id, "c", columns.map((x) => x.id)) ? c.id : nextId("c", columns.map((x) => x.id));
      columns.push({ id, label: String(c?.label ?? "") });
    }
    const rows: Row[] = [];
    for (const r of raw.rows ?? []) {
      const id = valid(r?.id, "r", rows.map((x) => x.id)) ? r.id : nextId("r", rows.map((x) => x.id));
      rows.push({ id, cells: columns.map((_, i) => String(r?.cells?.[i] ?? "")) });
    }
    if (!columns.length || !rows.length) return DEFAULT_TABLE;
    return { columns, rows, rowHeaders: !!raw.rowHeaders };
  } catch {
    return DEFAULT_TABLE;
  }
};

export const serializeTable = (table: Table) => JSON.stringify(table);

/** The id of a cell, as the response reports it: row and column, r2-c3. */
export const cellId = (row: Row, column: Column) => `${row.id}-${column.id}`;

/** Can the candidate choose this column in "cell" mode? Not the row headers. */
export const selectableColumn = (table: Table, index: number) => !(table.rowHeaders && index === 0);

/** Every id the candidate can choose in this mode. */
export const choices = (table: Table, mode: Mode): string[] =>
  mode === "row"
    ? table.rows.map((r) => r.id)
    : ([] as string[]).concat(...table.rows.map((r) => table.columns.filter((_, i) => selectableColumn(table, i)).map((c) => cellId(r, c))));

export const addRow = (table: Table): Table => ({
  ...table,
  rows: [...table.rows, { id: nextId("r", table.rows.map((r) => r.id)), cells: table.columns.map(() => "") }],
});
export const addColumn = (table: Table): Table => ({
  ...table,
  columns: [...table.columns, { id: nextId("c", table.columns.map((c) => c.id)), label: "" }],
  rows: table.rows.map((r) => ({ ...r, cells: [...r.cells, ""] })),
});
export const removeRow = (table: Table, index: number): Table => ({ ...table, rows: table.rows.filter((_, i) => i !== index) });
export const removeColumn = (table: Table, index: number): Table => ({
  ...table,
  columns: table.columns.filter((_, i) => i !== index),
  rows: table.rows.map((r) => ({ ...r, cells: r.cells.filter((_, i) => i !== index) })),
});
/** Swaps a row with the one above (by -1) or below (by 1). */
export const moveRow = (table: Table, index: number, by: -1 | 1): Table => {
  const to = index + by;
  if (to < 0 || to >= table.rows.length) return table;
  const rows = [...table.rows];
  [rows[index], rows[to]] = [rows[to], rows[index]];
  return { ...table, rows };
};

/** Row -1 is the header row. */
export const setText = (table: Table, row: number, column: number, text: string): Table =>
  row < 0
    ? { ...table, columns: table.columns.map((c, i) => (i === column ? { ...c, label: text } : c)) }
    : { ...table, rows: table.rows.map((r, i) => (i === row ? { ...r, cells: r.cells.map((t, j) => (j === column ? text : t)) } : r)) };

/** Cells copied from a spreadsheet (tabs and new lines), written from (row, column) on; the table grows to fit. */
export const pasteGrid = (table: Table, text: string, row: number, column: number): Table => {
  const grid = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
  let next = table;
  const width = column + Math.max(...grid.map((line) => line.length));
  while (next.columns.length < width) next = addColumn(next);
  while (next.rows.length < row + grid.length) next = addRow(next);
  grid.forEach((line, i) => line.forEach((text, j) => (next = setText(next, row + i, column + j, text.trim()))));
  return next;
};
