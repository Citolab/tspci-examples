import { Store } from "@citolab/preact-store";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { SET_VALUE: { id: string; value: string } };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // every accepted change of a field; the log keeps every step
  store.addReducer("SET_VALUE", (state, { id, value }) => ({ ...state, values: { ...state.values, [id]: value } }));
  return store;
};

export type StateModel = {
  /** What the candidate typed per input cell (r2-c3), as they see it (3,5 in Dutch). */
  values: Record<string, string>;
};
