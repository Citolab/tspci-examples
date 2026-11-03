import { Store } from "@citolab/preact-store";
import type { Positions } from "./optics";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** the candidate moved a lamp or the object (and let go) */
  MOVE: { positions: Positions };
  /** a response or a solution put back: the positions without a step in the log */
  RESTORE: { positions: Positions; moved: boolean };
};

/** Tool mode keeps at most this many positions the candidate stopped at. */
export const MAX_TRIED = 50;

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState, undefined, { maxActions: 500 });
  store.addReducer("MOVE", (state, { positions }) => ({
    positions,
    moved: true,
    tried: [...state.tried, positions].slice(-MAX_TRIED),
  }));
  store.addReducer("RESTORE", (state, { positions, moved }) => ({ ...state, positions, moved }));
  return store;
};

export type StateModel = {
  positions: Positions;
  /** whether the candidate moved anything: no response before that */
  moved: boolean;
  /** every position the candidate stopped at, oldest first (the tool mode's response) */
  tried: Positions[];
};
