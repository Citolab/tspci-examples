import { Store } from "@citolab/preact-store";

/**
 * The actions, as { type: payload }: dispatch and addReducer only accept these. Every attempt is an action, also a
 * blocked one, so the log of getState() shows every step the candidate tried, in order.
 */
export type Actions = {
  /** a step on a part: placed (assembly) or removed (disassembly); `missing` the parts that should have come first */
  STEP: { id: string; missing: string[] };
  /** a step the PCI did not allow (feedback: block) */
  BLOCKED: { id: string; missing: string[] };
  /** a step taken back (undo, or the part's own button) */
  TAKE_BACK: { id: string };
  /** taking back that was not allowed: other steps still stand on it */
  TAKE_BACK_BLOCKED: { id: string; blockers: string[] };
  /** start again */
  CLEAR: null;
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState, undefined, { maxActions: 1000 });
  store.addReducer("STEP", (state, { id }) => (state.sequence.includes(id) ? state : { ...state, sequence: [...state.sequence, id] }));
  store.addReducer("BLOCKED", (state) => ({ ...state, blocked: state.blocked + 1 }));
  store.addReducer("TAKE_BACK", (state, { id }) => ({ ...state, sequence: state.sequence.filter((s) => s !== id) }));
  store.addReducer("TAKE_BACK_BLOCKED", (state) => state);
  store.addReducer("CLEAR", (state) => ({ ...state, sequence: [] }));
  return store;
};

export type StateModel = {
  /** the part ids in the order of the candidate's steps */
  sequence: string[];
  /** how many steps the PCI blocked (feedback: block) */
  blocked: number;
};
