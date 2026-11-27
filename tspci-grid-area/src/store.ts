import { Store } from "@citolab/preact-store";
import { EMPTY, type CellValue } from "./grid";

/**
 * The state of the PCI. Every change goes through an action (store.dispatch), and the store keeps the list of actions:
 * getState() saves both, so a session can be restored, and even replayed (store.replay), action by action.
 *
 * - cells: the squares the pupil coloured (draw), row by row (grid.ts); the length is columns × rows of the settings
 * - areaAnswer, perimeterAnswer: what the pupil typed (measure), as typed
 * - choice: the shape chosen (compare): "A", "B", "same" or ""
 */
export type StateModel = { cells: CellValue[]; areaAnswer: string; perimeterAnswer: string; choice: string };

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  SET_CELL: { index: number; value: CellValue };
  /** a whole drawing at once: a response handed back (setResponse, boundTo) or the solution */
  SET_CELLS: { cells: CellValue[] };
  CLEAR: void;
  SET_ANSWER: { field: "areaAnswer" | "perimeterAnswer"; value: string };
  CHOOSE: { choice: string };
};

export const startState = (size: number): StateModel => ({ cells: Array<CellValue>(size).fill(EMPTY), areaAnswer: "", perimeterAnswer: "", choice: "" });

export const initStore = (state: StateModel) => {
  const store = new Store<StateModel, Actions>(state);
  store.addReducer("SET_CELL", (current, { index, value }) =>
    index < 0 || index >= current.cells.length || current.cells[index] === value ? current : { ...current, cells: current.cells.map((v, i) => (i === index ? value : v)) }
  );
  store.addReducer("SET_CELLS", (current, { cells }) => (cells.length === current.cells.length ? { ...current, cells: [...cells] } : current));
  store.addReducer("CLEAR", (current) => ({ ...current, cells: current.cells.map(() => EMPTY) }));
  store.addReducer("SET_ANSWER", (current, { field, value }) => ({ ...current, [field]: value }));
  store.addReducer("CHOOSE", (current, { choice }) => ({ ...current, choice }));
  return store;
};
