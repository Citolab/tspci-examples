import { Store } from "@citolab/preact-store";
import { Placement } from "./planner";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { SET_PLACEMENTS: { placements: Placement[] } };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // placing, moving, resizing, removing, undo and start again all set the placements; the log keeps every step
  store.addReducer("SET_PLACEMENTS", (state, { placements }) => ({ ...state, placements }));
  return store;
};

export type StateModel = {
  /** The tasks the candidate planned: task, resource, day, start and end (minutes since midnight). */
  placements: Placement[];
};
