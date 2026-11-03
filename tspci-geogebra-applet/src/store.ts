import { Store } from "@citolab/preact-store";
import { AppletValues, EMPTY_VALUES } from "./ggb";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { CHANGED: { values: AppletValues; applet: string | null } };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // the applet changed (debounced): what it reports now, and the applet itself
  store.addReducer("CHANGED", (state, { values, applet }) => ({ ...state, values, applet }));
  return store;
};

export type StateModel = {
  /** What the applet's objects correct, answer, score and maxscore said at the last change. */
  values: AppletValues;
  /** The candidate's applet (base64 .ggb) at the last change; null: not changed yet. */
  applet: string | null;
};

export const INITIAL_STATE: StateModel = { values: EMPTY_VALUES, applet: null };
