import { Store } from "@citolab/preact-store";
import type { Face } from "./net";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  SET_FACES: { faces: Face[] };
  SET_CHOSEN: { chosen: string[] };
  SET_LABELS: { labels: Record<string, string> };
};

export type StateModel = {
  /** build: the candidate's net */
  faces: Face[];
  /** opposite, adjacent, folds: the chosen faces (f3) or nets (n2) */
  chosen: string[];
  /** complete: the labels the candidate gave the empty faces, by face id */
  labels: Record<string, string>;
};

export const emptyState = (): StateModel => ({ faces: [], chosen: [], labels: {} });

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // every step of the candidate sets one of these; the log keeps them all
  store.addReducer("SET_FACES", (state, { faces }) => ({ ...state, faces }));
  store.addReducer("SET_CHOSEN", (state, { chosen }) => ({ ...state, chosen }));
  store.addReducer("SET_LABELS", (state, { labels }) => ({ ...state, labels }));
  return store;
};
