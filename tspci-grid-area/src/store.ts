import { Store } from "@citolab/preact-store";
import { EMPTY, type CellValue } from "./grid.ts";
import { emptyCoverWork, type BillField, type CoverWork, type Strip } from "./cover.ts";

/**
 * The state of the PCI. Every change goes through an action (store.dispatch), and the store keeps the list of actions:
 * getState() saves both, so a session can be restored, and even replayed (store.replay), action by action.
 *
 * - cells: the squares the pupil coloured (draw), row by row (grid.ts); the length is columns × rows of the settings
 * - areaAnswer, perimeterAnswer: what the pupil typed (measure), as typed
 * - choice: the shape chosen (compare): "A", "B", "same" or ""
 * - floorArea, strips and the boxes of the bill (cover, cover.ts CoverWork): the area typed, the strips laid (in
 *   squares), and the metres, amounts and total typed, as typed
 */
export type StateModel = { cells: CellValue[]; areaAnswer: string; perimeterAnswer: string; choice: string } & CoverWork;

/** A box the pupil types in. */
export type AnswerField = "areaAnswer" | "perimeterAnswer" | "floorArea" | BillField;

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  SET_CELL: { index: number; value: CellValue };
  /** a whole drawing at once: a response handed back (setResponse, boundTo) or the solution */
  SET_CELLS: { cells: CellValue[] };
  CLEAR: void;
  SET_ANSWER: { field: AnswerField; value: string };
  CHOOSE: { choice: string };
  /** a strip laid (index: the number of strips), moved, turned, longer or shorter */
  SET_STRIP: { index: number; strip: Strip };
  REMOVE_STRIP: { index: number };
  /** a whole plan at once: a response handed back or the solution */
  SET_STRIPS: { strips: Strip[] };
};

export const startState = (size: number): StateModel => ({
  cells: Array<CellValue>(size).fill(EMPTY), areaAnswer: "", perimeterAnswer: "", choice: "", ...emptyCoverWork(),
});

export const initStore = (state: StateModel) => {
  const store = new Store<StateModel, Actions>(state);
  store.addReducer("SET_CELL", (current, { index, value }) =>
    index < 0 || index >= current.cells.length || current.cells[index] === value ? current : { ...current, cells: current.cells.map((v, i) => (i === index ? value : v)) }
  );
  store.addReducer("SET_CELLS", (current, { cells }) => (cells.length === current.cells.length ? { ...current, cells: [...cells] } : current));
  store.addReducer("CLEAR", (current) => ({ ...current, cells: current.cells.map(() => EMPTY) }));
  store.addReducer("SET_ANSWER", (current, { field, value }) => ({ ...current, [field]: value }));
  store.addReducer("CHOOSE", (current, { choice }) => ({ ...current, choice }));
  store.addReducer("SET_STRIP", (current, { index, strip }) =>
    index < 0 || index > current.strips.length ? current : { ...current, strips: [...current.strips.slice(0, index), { ...strip }, ...current.strips.slice(index + 1)] }
  );
  store.addReducer("REMOVE_STRIP", (current, { index }) => ({ ...current, strips: current.strips.filter((_, i) => i !== index) }));
  store.addReducer("SET_STRIPS", (current, { strips }) => ({ ...current, strips: strips.map((s) => ({ ...s })) }));
  return store;
};
