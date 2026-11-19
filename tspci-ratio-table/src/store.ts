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
/** What the number on an arrow does: multiply by it (×) or divide by it (:). */
export type Operator = "multiply" | "divide";

/**
 * Every text is kept as typed, also when it is not a number yet.
 * - cells[row][column]: the value cells, every row has `columns` of them
 * - labels[row]: the label in front of each row
 * - arrowsTop[i], arrowsBottom[i]: the input on the arrow between value columns i and i + 1 (columns - 1 of each)
 * - operatorsTop[i], operatorsBottom[i]: whether that arrow multiplies or divides, toggled by its button
 */
export type StateModel = {
  columns: number;
  cells: string[][];
  labels: string[];
  arrowsTop: string[];
  arrowsBottom: string[];
  operatorsTop: Operator[];
  operatorsBottom: Operator[];
};
/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  SET_CELL: { row: number; column: number; value: string };
  SET_LABEL: { row: number; value: string };
  SET_ARROW: { side: ArrowSide; index: number; value: string };
  TOGGLE_OPERATOR: { side: ArrowSide; index: number };
  ADD_COLUMN: null;
  REMOVE_COLUMN: null;
};

const emptyCells = (columns: number) => Array.from({ length: ROWS }, () => Array<string>(columns).fill(""));
const emptyArrows = (columns: number) => Array<string>(columns - 1).fill("");
const defaultOperators = (columns: number) => Array<Operator>(columns - 1).fill("multiply");

export const initialState: StateModel = {
  columns: MIN_COLUMNS,
  cells: emptyCells(MIN_COLUMNS),
  labels: Array<string>(ROWS).fill(""),
  arrowsTop: emptyArrows(MIN_COLUMNS),
  arrowsBottom: emptyArrows(MIN_COLUMNS),
  operatorsTop: defaultOperators(MIN_COLUMNS),
  operatorsBottom: defaultOperators(MIN_COLUMNS),
};

/** A state saved before labels, arrows or operators were stored has none: fill them in, so it can still be restored. */
export const withDefaults = (state: Partial<StateModel> & Pick<StateModel, "columns" | "cells">): StateModel => ({
  ...state,
  labels: state.labels ?? Array<string>(ROWS).fill(""),
  arrowsTop: state.arrowsTop ?? emptyArrows(state.columns),
  arrowsBottom: state.arrowsBottom ?? emptyArrows(state.columns),
  operatorsTop: state.operatorsTop ?? defaultOperators(state.columns),
  operatorsBottom: state.operatorsBottom ?? defaultOperators(state.columns),
});

/** The answer is the bottom-right cell: the last value of the last row. */
export const answerCell = ({ columns }: StateModel) => ({ row: ROWS - 1, column: columns - 1 });
export const answerOf = (state: StateModel) => {
  const { row, column } = answerCell(state);
  return state.cells[row]?.[column] ?? "";
};

const setAt = <T,>(list: T[], index: number, value: T) => list.map((item, i) => (i === index ? value : item));
const toggled = (operator: Operator): Operator => (operator === "multiply" ? "divide" : "multiply");

export const initStore = (state: StateModel = initialState) => {
  const store = new Store<StateModel, Actions>(state);
  store.addReducer("SET_CELL", (current, { row, column, value }) => ({
    ...current,
    cells: current.cells.map((cells, r) => (r === row ? setAt(cells, column, value) : cells)),
  }));
  store.addReducer("SET_LABEL", (current, { row, value }) => ({ ...current, labels: setAt(current.labels, row, value) }));
  store.addReducer("SET_ARROW", (current, { side, index, value }) =>
    side === "top"
      ? { ...current, arrowsTop: setAt(current.arrowsTop, index, value) }
      : { ...current, arrowsBottom: setAt(current.arrowsBottom, index, value) }
  );
  store.addReducer("TOGGLE_OPERATOR", (current, { side, index }) =>
    side === "top"
      ? { ...current, operatorsTop: setAt(current.operatorsTop, index, toggled(current.operatorsTop[index])) }
      : { ...current, operatorsBottom: setAt(current.operatorsBottom, index, toggled(current.operatorsBottom[index])) }
  );
  // Increment/decrement: a new column (and the arrows in front of it) starts empty, removing one drops its values.
  // Kept between the minimum and maximum.
  store.addReducer("ADD_COLUMN", (current) =>
    current.columns >= MAX_COLUMNS
      ? current
      : {
          ...current,
          columns: current.columns + 1,
          cells: current.cells.map((cells) => [...cells, ""]),
          arrowsTop: [...current.arrowsTop, ""],
          arrowsBottom: [...current.arrowsBottom, ""],
          operatorsTop: [...current.operatorsTop, "multiply"],
          operatorsBottom: [...current.operatorsBottom, "multiply"],
        }
  );
  store.addReducer("REMOVE_COLUMN", (current) =>
    current.columns <= MIN_COLUMNS
      ? current
      : {
          ...current,
          columns: current.columns - 1,
          cells: current.cells.map((cells) => cells.slice(0, -1)),
          arrowsTop: current.arrowsTop.slice(0, -1),
          arrowsBottom: current.arrowsBottom.slice(0, -1),
          operatorsTop: current.operatorsTop.slice(0, -1),
          operatorsBottom: current.operatorsBottom.slice(0, -1),
        }
  );
  return store;
};
