import { Store } from "@citolab/preact-store";
import type { Mark } from "./marker";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { SET_MARKS: { marks: Mark[] } };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // marking, removing and clearing all set the marks; the log keeps every step
  store.addReducer("SET_MARKS", (state, { marks }) => ({ ...state, marks }));
  return store;
};

export type StateModel = {
  /** The candidate's marks: word ranges with a category, sorted, without overlaps. */
  marks: Mark[];
};
