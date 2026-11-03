// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/oat-sa/extension-tao-itemqti-pci/tree/develop/views/js/pciCreator/ims/mathEntryInteraction,
// © 2016-2022 Open Assessment Technologies SA (Christophe Noël)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { SET_LATEX: { latex: string }; SET_GAPS: { gaps: string[] } };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("SET_LATEX", (state, { latex }) => ({ ...state, latex }));
  store.addReducer("SET_GAPS", (state, { gaps }) => ({ ...state, gaps: [...gaps] }));
  return store;
};

export type StateModel = {
  /** The formula the candidate typed, as LaTeX (free mode). */
  latex: string;
  /** The content of every gap, as LaTeX (gap mode). */
  gaps: string[];
};
