import { Store } from "@citolab/preact-store";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  SET_TEXT: { text: string };
  SET_VALUE: { value: number };
  SET_RANGE: { range: number };
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("SET_TEXT", (state, { text }) => ({ ...state, text }));
  store.addReducer("SET_VALUE", (state, { value }) => ({ ...state, value }));
  store.addReducer("SET_RANGE", (state, { range }) => ({ ...state, range }));
  return store;
};

export type StateModel = {
  /** Read mode: what the candidate typed, as typed (with a decimal comma in Dutch). */
  text: string;
  /** Set mode: the value the candidate set; null until they moved it. */
  value: number | null;
  /** Range mode: the range the candidate chose; null until they chose one. */
  range: number | null;
};

export const EMPTY: StateModel = { text: "", value: null, range: null };
