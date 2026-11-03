import { Store } from "@citolab/preact-store";
import { Placed } from "./circuit";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { SET_PARTS: { parts: Placed[] } };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // placing, moving, turning, removing, undo and clear all set the parts; the log keeps every step
  store.addReducer("SET_PARTS", (state, { parts }) => ({ ...state, parts }));
  return store;
};

export type StateModel = {
  /** The candidate's parts: everything on the board except the locked parts of the item. */
  parts: Placed[];
};
