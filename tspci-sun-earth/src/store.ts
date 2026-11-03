import { Store } from "@citolab/preact-store";
import type { Setting } from "./setup";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** the candidate changed the date, the time or the place (and let go) */
  SET: { setting: Setting };
  /** a response or a solution put back: the setting without a step in the log */
  RESTORE: { setting: Setting; moved: boolean };
};

/** Tool mode keeps at most this many settings the candidate stopped at. */
export const MAX_TRIED = 50;

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState, undefined, { maxActions: 500 });
  store.addReducer("SET", (state, { setting }) => ({
    setting,
    moved: true,
    tried: [...state.tried, setting].slice(-MAX_TRIED),
  }));
  store.addReducer("RESTORE", (state, { setting, moved }) => ({ ...state, setting, moved }));
  return store;
};

export type StateModel = {
  /** day of the year, minutes UTC and the place */
  setting: Setting;
  /** whether the candidate changed anything: no response before that */
  moved: boolean;
  /** every setting the candidate stopped at, oldest first (the tool mode's response) */
  tried: Setting[];
};
