// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/graphFunctionInteraction,
// © 2014-2017 Parcc, Inc., by Sam Sipasseuth (Open Assessment Technologies)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import { Family, FunctionState, Point, clean } from "./functions";

export type StateModel = FunctionState;

/** The actions, as { type: payload }: dispatch and addReducer only accept these. The log keeps every one. */
export type Actions = {
  /** The candidate chooses a family; the points stay where they are. */
  SET_FAMILY: { family: Family };
  /** A point placed on the grid (while there are fewer than two). */
  ADD_POINT: Point;
  MOVE_POINT: { index: number; x: number; y: number };
  /** Start again: the points of the start. */
  RESET: { points: Point[] };
  /** setResponse, review or solution: a whole state at once. */
  RESTORE: FunctionState;
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("SET_FAMILY", (state, { family }) => ({ ...state, family }));
  store.addReducer("ADD_POINT", (state, { x, y }) =>
    state.points.length >= 2 ? state : { ...state, points: [...state.points, { x: clean(x), y: clean(y) }] });
  store.addReducer("MOVE_POINT", (state, { index, x, y }) =>
    ({ ...state, points: state.points.map((p, i) => (i === index ? { x: clean(x), y: clean(y) } : p)) }));
  store.addReducer("RESET", (state, { points }) => ({ ...state, points }));
  store.addReducer("RESTORE", (_state, next) => next);
  return store;
};
