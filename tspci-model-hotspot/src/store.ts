import { Store } from "@citolab/preact-store";
import type { Answer } from "./hotspot";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { SET_ANSWER: { answer: Answer } };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // choosing a part, placing or taking off a label and start again all set the answer; the log keeps every step
  store.addReducer("SET_ANSWER", (state, { answer }) => ({ ...state, answer }));
  return store;
};

export type StateModel = {
  /** The chosen parts (click mode) and which label is on which part (label mode). */
  answer: Answer;
};
