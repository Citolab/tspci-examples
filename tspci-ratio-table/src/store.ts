import { Store } from "@citolab/preact-store";

/**
 * The state of the PCI. Every change goes through an action (store.dispatch), and the store keeps the list of actions:
 * getState() saves both, so a session can be restored, and even replayed (store.replay), action by action.
 */
export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 5;
export const ROWS = 2;

/** Above the table (top) or below it (bottom): each has one arrow between every two value columns. */
export type ArrowSide = "top" | "bottom";
/** What the number on an arrow does: multiply by it (×) or divide by it (:). Empty until the student picks one. */
export type Operator = "multiply" | "divide" | "";

/**
 * Every text is kept as typed, also when it is not a number (yet), such as "?" or "1,20".
 * - cells[row][column]: the value cells, every row has `columns` of them; given[row][column]: set by the author, locked
 * - labels[row]: the label in front of each row; labelsGiven[row]: set by the author, locked
 * - arrowsTop[i], arrowsBottom[i]: the number on the arrow from value column i to i + 1 (columns - 1 of each)
 * - operatorsTop[i], operatorsBottom[i]: whether that arrow multiplies or divides
 * - answerAt: the cell whose number is the answer, when the author marked it with "?" (it moves with the columns);
 *   null: the bottom-right cell, as in the worked examples (store.ts answerCell)
 */
export type StateModel = {
  columns: number;
  cells: string[][];
  given: boolean[][];
  labels: string[];
  labelsGiven: boolean[];
  arrowsTop: string[];
  arrowsBottom: string[];
  operatorsTop: Operator[];
  operatorsBottom: Operator[];
  answerAt: Cell | null;
};
export type Cell = { row: number; column: number };
/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  SET_CELL: { row: number; column: number; value: string };
  SET_LABEL: { row: number; value: string };
  SET_ARROW: { side: ArrowSide; index: number; value: string };
  SET_OPERATOR: { side: ArrowSide; index: number; operator: Operator };
  /** A new, empty column at index `at` (1 up to columns: between two columns, or after the last). */
  INSERT_COLUMN: { at: number };
  REMOVE_COLUMN: { at: number };
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** What the author gives (the settings): the labels and numbers already in the table, locked for the student. */
export type Givens = { columns?: number; labels?: string[]; values?: string[][] };

/**
 * The table at the start: the givens in place, the rest empty. The first "?" the author gives is the answer cell: it
 * starts empty, with "?" as its placeholder, and the student writes the answer in it.
 */
export function startState({ columns = MIN_COLUMNS, labels = [], values = [] }: Givens = {}): StateModel {
  const count = clamp(Math.max(columns, ...values.map((row) => row.length)), MIN_COLUMNS, MAX_COLUMNS);
  const rows = Array.from({ length: ROWS }, (_, row) => Array.from({ length: count }, (_, column) => (values[row]?.[column] ?? "").trim()));
  const rowLabels = Array.from({ length: ROWS }, (_, row) => (labels[row] ?? "").trim());
  let answerAt: Cell | null = null;
  rows.forEach((cells, row) =>
    cells.forEach((value, column) => {
      if (value === "?" && !answerAt) {
        answerAt = { row, column };
        cells[column] = "";
      }
    })
  );
  return {
    columns: count,
    cells: rows,
    given: rows.map((row) => row.map((value) => value !== "")),
    labels: rowLabels,
    labelsGiven: rowLabels.map((label) => label !== ""),
    arrowsTop: Array<string>(count - 1).fill(""),
    arrowsBottom: Array<string>(count - 1).fill(""),
    operatorsTop: Array<Operator>(count - 1).fill(""),
    operatorsBottom: Array<Operator>(count - 1).fill(""),
    answerAt,
  };
}

/** The cell whose number is the response: the one the author marked with "?", or else the bottom-right one. */
export const answerCell = (state: StateModel): Cell => state.answerAt ?? { row: ROWS - 1, column: state.columns - 1 };
export const answerOf = (state: StateModel) => {
  const { row, column } = answerCell(state);
  return state.cells[row]?.[column] ?? "";
};

export const initialState = startState();

/** A setting such as "3; 7" or "6; ?" as cells: split on ";", empty parts are empty cells. */
export const parseValues = (setting = "") => (setting.trim() === "" ? [] : setting.split(";").map((part) => part.trim()));

/**
 * A number as a student writes it: "8,40", "8.40" or " 14 ". Undefined for anything else ("?", "", "14 min").
 * Thousands separators are not accepted: "1.200" is 1.2, as a decimal point.
 */
export function parseNumber(text: string): number | undefined {
  const trimmed = text.trim().replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : undefined;
}

const setAt = <T,>(list: T[], index: number, value: T) => list.map((item, i) => (i === index ? value : item));

/**
 * The arrows when a column is inserted at `at`: the arrow that ran across that spot now ends on the new column and
 * would mean something else, so it starts empty, as does the new one.
 */
function insertArrow<T>(arrows: T[], at: number, columns: number, empty: T): T[] {
  if (at >= columns) return [...arrows, empty];
  return [...arrows.slice(0, at - 1), empty, empty, ...arrows.slice(at)];
}
/** The arrows when column `at` is removed: the arrows on both sides of it become one empty arrow. */
function removeArrow<T>(arrows: T[], at: number, columns: number, empty: T): T[] {
  if (at === 0) return arrows.slice(1);
  if (at === columns - 1) return arrows.slice(0, -1);
  return [...arrows.slice(0, at - 1), empty, ...arrows.slice(at + 1)];
}
const insertAt = <T,>(list: T[], at: number, value: T) => [...list.slice(0, at), value, ...list.slice(at)];
const removeAt = <T,>(list: T[], at: number) => list.filter((_, i) => i !== at);

/** A column with a given number or the author's answer cell can not be removed: the author put it there. */
export const columnIsFixed = (state: StateModel, column: number) => state.given.some((row) => row[column]) || state.answerAt?.column === column;

export const initStore = (state: StateModel = initialState) => {
  const store = new Store<StateModel, Actions>(state);
  store.addReducer("SET_CELL", (current, { row, column, value }) =>
    current.given[row]?.[column] ? current : { ...current, cells: current.cells.map((cells, r) => (r === row ? setAt(cells, column, value) : cells)) }
  );
  store.addReducer("SET_LABEL", (current, { row, value }) => (current.labelsGiven[row] ? current : { ...current, labels: setAt(current.labels, row, value) }));
  store.addReducer("SET_ARROW", (current, { side, index, value }) =>
    side === "top" ? { ...current, arrowsTop: setAt(current.arrowsTop, index, value) } : { ...current, arrowsBottom: setAt(current.arrowsBottom, index, value) }
  );
  store.addReducer("SET_OPERATOR", (current, { side, index, operator }) =>
    side === "top"
      ? { ...current, operatorsTop: setAt(current.operatorsTop, index, operator) }
      : { ...current, operatorsBottom: setAt(current.operatorsBottom, index, operator) }
  );
  store.addReducer("INSERT_COLUMN", (current, { at }) => {
    const { columns } = current;
    if (columns >= MAX_COLUMNS || at < 1 || at > columns) return current;
    return {
      ...current,
      columns: columns + 1,
      cells: current.cells.map((cells) => insertAt(cells, at, "")),
      given: current.given.map((given) => insertAt(given, at, false)),
      arrowsTop: insertArrow(current.arrowsTop, at, columns, ""),
      arrowsBottom: insertArrow(current.arrowsBottom, at, columns, ""),
      operatorsTop: insertArrow<Operator>(current.operatorsTop, at, columns, ""),
      operatorsBottom: insertArrow<Operator>(current.operatorsBottom, at, columns, ""),
      answerAt: current.answerAt && at <= current.answerAt.column ? { ...current.answerAt, column: current.answerAt.column + 1 } : current.answerAt,
    };
  });
  store.addReducer("REMOVE_COLUMN", (current, { at }) => {
    const { columns } = current;
    if (columns <= MIN_COLUMNS || at < 0 || at >= columns || columnIsFixed(current, at)) return current;
    return {
      ...current,
      columns: columns - 1,
      cells: current.cells.map((cells) => removeAt(cells, at)),
      given: current.given.map((given) => removeAt(given, at)),
      arrowsTop: removeArrow(current.arrowsTop, at, columns, ""),
      arrowsBottom: removeArrow(current.arrowsBottom, at, columns, ""),
      operatorsTop: removeArrow<Operator>(current.operatorsTop, at, columns, ""),
      operatorsBottom: removeArrow<Operator>(current.operatorsBottom, at, columns, ""),
      answerAt: current.answerAt && at < current.answerAt.column ? { ...current.answerAt, column: current.answerAt.column - 1 } : current.answerAt,
    };
  });
  return store;
};
