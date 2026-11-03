import { Store } from "@citolab/preact-store";
import { Vector } from "./vector";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** An arrow drawn, changed (null: removed). */
  SET_ARROW: { index: number; vector: Vector | null };
  /** "Start again": every arrow removed. */
  CLEAR: null;
  UNDO: null;
};

const MAX_UNDO = 50;

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState, undefined, { maxActions: 1000 });
  const remember = (state: StateModel) => [...state.past, state.arrows].slice(-MAX_UNDO);
  store.addReducer("SET_ARROW", (state, { index, vector }) => ({
    arrows: state.arrows.map((v, i) => (i === index ? vector : v)),
    past: remember(state),
  }));
  store.addReducer("CLEAR", (state) =>
    state.arrows.some(Boolean) ? { arrows: state.arrows.map(() => null), past: remember(state) } : state
  );
  store.addReducer("UNDO", (state) =>
    state.past.length ? { arrows: state.past[state.past.length - 1], past: state.past.slice(0, -1) } : state
  );
  return store;
};

export type StateModel = {
  /** One per arrow of data-arrows, in cm and degrees (vector.ts); null: not drawn. */
  arrows: (Vector | null)[];
  /** Earlier arrows, for undo. */
  past: (Vector | null)[][];
};
