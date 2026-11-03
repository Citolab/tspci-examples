import { Store } from "@citolab/preact-store";
import type { Placed } from "./plan";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { SET_PLACED: { placed: Placed[] } };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // loading, moving, turning, layers, unloading, undo and start again all set the placement; the log keeps every step
  store.addReducer("SET_PLACED", (state, { placed }) => ({ ...state, placed }));
  return store;
};

export type StateModel = {
  /** The boxes the candidate loaded, where and how. */
  placed: Placed[];
};
