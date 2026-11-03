// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/svgmap, © OpenPCI (Aarhus University and Aalborg University):
// Elias J.T. Hansen, Anna Rusmann and Jeppe Bundsgaard.
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026.

import { Store } from "@citolab/preact-store";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { ROUTE: { path: number[] }; UNDO: { path: number[] }; CLEAR: { path: number[] } };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("ROUTE", (state, { path }) => ({ ...state, path }));
  store.addReducer("UNDO", (state, { path }) => ({ ...state, path }));
  store.addReducer("CLEAR", (state, { path }) => ({ ...state, path }));
  return store;
};

export type StateModel = {
  /** The route: the numbers of the points it passes, in order (the original's "path"). */
  path: number[];
};
