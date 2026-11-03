import { Store } from "@citolab/preact-store";
import type { Molecule } from "./molecule";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { SET_MOLECULE: { molecule: Molecule } };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // adding, bonding, moving, removing, undo and start again all set the molecule; the log keeps every step
  store.addReducer("SET_MOLECULE", (state, { molecule }) => ({ ...state, molecule }));
  return store;
};

export type StateModel = {
  /** The candidate's atoms (with their place in the structural formula) and bonds. */
  molecule: Molecule;
};
