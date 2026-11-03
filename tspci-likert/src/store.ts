// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oat-sa/extension-tao-itemqti-pci/tree/develop/views/js/pciCreator/ims/likertScoreInteraction,
// © 2016-2024 Open Assessment Technologies SA
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { CHOOSE: { level: number }; CLEAR: null };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("CHOOSE", (state, { level }) => ({ ...state, chosen: level }));
  store.addReducer("CLEAR", (state) => ({ ...state, chosen: null }));
  return store;
};

export type StateModel = {
  /** The chosen level, 1 to the number of levels, or null. */
  chosen: number | null;
};
