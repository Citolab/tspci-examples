import { Store } from "@citolab/preact-store";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { ADD: { x: number }; REMOVE: { x: number } };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("ADD", (state, { x }) => (state.values.includes(x) ? state : { ...state, values: [...state.values, x] }));
  store.addReducer("REMOVE", (state, { x }) => ({ ...state, values: state.values.filter((v) => v !== x) }));
  return store;
};

export type StateModel = {
  /** The x values in the table, the oldest first (the start values, then what the candidate added). */
  values: number[];
};
