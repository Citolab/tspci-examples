import { Store } from "@citolab/preact-store";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { SET_CELLS: { cells: Record<string, string> } };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // typing, deleting, pasting and filling all change cells; the log keeps every step
  store.addReducer("SET_CELLS", (state, { cells }) => ({ ...state, cells: { ...state.cells, ...cells } }));
  return store;
};

export type StateModel = {
  /** The cells the candidate changed, by A1 name: canonical inputs, "" for a cell they emptied. */
  cells: Record<string, string>;
};
