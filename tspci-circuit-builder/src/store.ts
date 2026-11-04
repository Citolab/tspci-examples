import { Store } from "@citolab/preact-store";
import { Placed } from "./circuit";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { SET_PARTS: { parts: Placed[] }; SET_BROKEN: { broken: string[] } };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // placing, moving, turning, removing, undo and clear all set the parts; the log keeps every step
  store.addReducer("SET_PARTS", (state, { parts }) => ({ ...state, parts }));
  // the lamp tool: breaking or repairing a lamp
  store.addReducer("SET_BROKEN", (state, { broken }) => ({ ...state, broken }));
  return store;
};

export type StateModel = {
  /** The candidate's parts: everything on the board except the locked parts of the item. */
  parts: Placed[];
  /** The cells ("x,y") of the lamps the candidate broke (data-lamp-tool); missing in states saved before it existed. */
  broken?: string[];
};
