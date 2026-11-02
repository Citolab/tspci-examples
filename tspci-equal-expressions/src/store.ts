import { Store } from "@citolab/preact-store";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { TRY: { value: number } };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // A number tried again moves to the front: the table shows every number once, the log keeps every try
  store.addReducer("TRY", (state, { value }) => ({ ...state, tries: [...state.tries.filter((t) => t !== value), value] }));
  return store;
};

export type StateModel = {
  /** The numbers tried, the oldest first. */
  tries: number[];
};
