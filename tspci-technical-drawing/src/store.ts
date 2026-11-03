import { Store } from "@citolab/preact-store";
import type { Line } from "./task";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  SET_VALUE: { index: number; text: string };
  SET_LINES: { lines: Line[] };
  CHOOSE: { choice: string | null };
};

export type StateModel = {
  /** what the candidate typed in each asked field, in order (dimensions and read tasks) */
  values: string[];
  /** the candidate's lines on the grid (complete task), in mm of the view */
  lines: Line[];
  /** the view or workpiece the candidate chose (view and model tasks) */
  choice: string | null;
};

export const EMPTY_STATE: StateModel = { values: [], lines: [], choice: null };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("SET_VALUE", (state, { index, text }) => {
    const values = [...state.values];
    while (values.length <= index) values.push("");
    values[index] = text;
    return { ...state, values };
  });
  // drawing, erasing, undo and clear all set the lines; the log keeps every step
  store.addReducer("SET_LINES", (state, { lines }) => ({ ...state, lines }));
  store.addReducer("CHOOSE", (state, { choice }) => ({ ...state, choice }));
  return store;
};
