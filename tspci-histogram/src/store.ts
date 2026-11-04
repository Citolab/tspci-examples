// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/histogramInteraction,
// © 2014-2017 Parcc, Inc. (Sam Sipasseuth, Open Assessment Technologies)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import { HistogramState } from "./histogram";

export type StateModel = HistogramState;

/** The actions, as { type: payload }: dispatch and addReducer only accept these. The log keeps every one. */
export type Actions = {
  /** A bar's new height (already snapped by the interaction); how: drag, key or typed. */
  SET_HEIGHT: { bar: number; height: number; how: "drag" | "key" | "typed" };
  /** Every bar back to its height at the start. */
  RESET_HEIGHTS: { heights: number[] };
  /** setResponse or solution: all heights at once. */
  RESTORE: { heights: number[] };
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("SET_HEIGHT", (state, { bar, height }) =>
    state.heights[bar] === undefined ? state : { heights: state.heights.map((h, i) => (i === bar ? height : h)), touched: true });
  store.addReducer("RESET_HEIGHTS", (_state, { heights }) => ({ heights: [...heights], touched: true }));
  store.addReducer("RESTORE", (_state, { heights }) => ({ heights: [...heights], touched: true }));
  return store;
};
