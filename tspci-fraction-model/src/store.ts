import { Store } from "@citolab/preact-store";
import { ModelState } from "./fraction";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** shading, unshading, dividing, typing and clearing one model; the log keeps every step */
  SET_MODEL: { index: number; model: ModelState };
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("SET_MODEL", (state, { index, model }) => ({
    ...state,
    models: state.models.map((m, i) => (i === index ? model : m)),
  }));
  return store;
};

export type StateModel = {
  /** per model: its parts, the shaded parts and what the candidate typed */
  models: ModelState[];
};
