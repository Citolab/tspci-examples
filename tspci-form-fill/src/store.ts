import { Store } from "@citolab/preact-store";
import type { Values } from "./form";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  SET_VALUE: { id: string; value: string };
  SET_VALUES: { values: Values };
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // typing in a field, choosing an option, signing: one field; a response or the solution: all of them
  store.addReducer("SET_VALUE", (state, { id, value }) => {
    const values = { ...state.values };
    if (value === "") delete values[id];
    else values[id] = value;
    return { ...state, values };
  });
  store.addReducer("SET_VALUES", (state, { values }) => ({ ...state, values: { ...values } }));
  return store;
};

export type StateModel = {
  /** What the candidate typed or chose, by field id (as typed: "12,50", "9721bg"); empty fields left out. */
  values: Values;
};
