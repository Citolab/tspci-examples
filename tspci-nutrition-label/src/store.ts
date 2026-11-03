import { Store } from "@citolab/preact-store";
import { Entry } from "./nutrition";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  SET_ENTRIES: { entries: Entry[] };
  SELECT: { product: string | null };
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // adding, changing and removing products set the meal; the log keeps every step
  store.addReducer("SET_ENTRIES", (state, { entries }) => ({ ...state, entries }));
  store.addReducer("SELECT", (state, { product }) => ({ ...state, selected: product }));
  return store;
};

export type StateModel = {
  /** compose and tool mode: the meal, as the candidate entered it (grams or portions) */
  entries: Entry[];
  /** select mode: the chosen product */
  selected: string | null;
};
