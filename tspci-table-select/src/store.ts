import { Store } from "@citolab/preact-store";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { SELECT: { id: string }; CLEAR: null };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("SELECT", (state, { id }) => ({ ...state, selected: id }));
  store.addReducer("CLEAR", (state) => ({ ...state, selected: null }));
  return store;
};

export type StateModel = {
  /** The id of the chosen row (r2) or cell (r2-c3), or null. */
  selected: string | null;
};
