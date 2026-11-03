import { Store } from "@citolab/preact-store";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** The candidate looked at a segment: its numbers were shown long enough to read. */
  VIEW: { id: string };
  /** Select mode: the chosen segments after a click. */
  CHOOSE: { selected: string[] };
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // the log keeps every look and every choice, with its time
  store.addReducer("VIEW", (state, { id }) => ({ ...state, viewed: { ...state.viewed, [id]: (state.viewed[id] ?? 0) + 1 } }));
  store.addReducer("CHOOSE", (state, { selected }) => ({ ...state, selected }));
  return store;
};

export type StateModel = {
  /** How often the candidate looked at each segment (c3-s2), in the order of the first look. */
  viewed: Record<string, number>;
  /** Select mode: the chosen segments. */
  selected: string[];
};
