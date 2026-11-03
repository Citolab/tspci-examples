import { Store } from "@citolab/preact-store";
import type { Answer } from "./numberline";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** Every change (placing, moving, an end, a jump, typing): the new answer; the log keeps every step. */
  SET_ANSWER: { answer: Answer };
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState, undefined, { maxActions: 1000 });
  store.addReducer("SET_ANSWER", (state, { answer }) => ({ ...state, answer }));
  return store;
};

export type StateModel = {
  /** What the candidate did (numberline.ts); only the item's mode counts. */
  answer: Answer;
};
