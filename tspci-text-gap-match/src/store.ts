// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/textgapmatch, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import { Placed, Rules, Source, Target, move } from "./model";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { MOVE: { from: Source; to: Target } };

export const initStore = (initialState: StateModel, rules: () => Rules) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("MOVE", (state, { from, to }) => ({ ...state, placed: move(state.placed, rules(), from, to) }));
  return store;
};

export type StateModel = {
  /** Per zone id, the labels in it (their index in data-strings), in order. */
  placed: Placed;
};
