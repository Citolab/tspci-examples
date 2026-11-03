import { Store } from "@citolab/preact-store";
import type { Answer } from "./terrain";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** the candidate changed the answer of one task */
  SET_ANSWER: { index: number; answer: Answer };
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // every click, drag and typed height sets the answer of its task; the log keeps every step
  store.addReducer("SET_ANSWER", (state, { index, answer }) => {
    const answers = state.answers.slice();
    answers[index] = answer;
    return { ...state, answers };
  });
  return store;
};

export type StateModel = {
  /** per task, in the order of data-tasks */
  answers: Answer[];
};
