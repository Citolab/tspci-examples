// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oatymart/html-template-interaction-pci, © 2024 Martin Nicholson and Open Assessment Technologies SA
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import { Value } from "./template";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { SET: { name: string; value: Value } };

export const initStore = (initialState: StateModel) => {
  // every keystroke is an action: the saved log keeps only the last ones
  const store = new Store<StateModel, Actions>(initialState, undefined, { maxActions: 50 });
  store.addReducer("SET", (state, { name, value }) => ({ ...state, values: { ...state.values, [name]: value } }));
  return store;
};

export type StateModel = {
  /** The value per name the candidate changed; a name that is not here has the value the HTML gives it. */
  values: Record<string, Value>;
};
