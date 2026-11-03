import { Store } from "@citolab/preact-store";
import type { Placed } from "./timeline";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  PLACE: { id: string; value: number | string };
  REMOVE: { id: string };
  SET_PLACED: { placed: Placed };
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // the log keeps every step: which card went where, and which went back
  store.addReducer("PLACE", (state, { id, value }) => ({ ...state, placed: { ...state.placed, [id]: value } }));
  store.addReducer("REMOVE", (state, { id }) => {
    const placed = { ...state.placed };
    delete placed[id];
    return { ...state, placed };
  });
  store.addReducer("SET_PLACED", (state, { placed }) => ({ ...state, placed }));
  return store;
};

export type StateModel = {
  /** per event id: the year (date and order mode) or the period id (period mode) where the candidate put it */
  placed: Placed;
};
