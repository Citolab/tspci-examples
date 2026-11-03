// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/paint, © Jeppe Bundsgaard, openPCI (Aarhus University and Aalborg University)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";

/**
 * One stroke: a colour (null: the eraser), the brush size and the points as a flat list x, y, pressure (0..1),
 * in canvas pixels.
 */
export type Stroke = { kind: "stroke"; color: string | null; size: number; points: number[] };
/** Clearing the canvas is an operation too, so it can be undone. */
export type Operation = Stroke | { kind: "clear" };

export type StateModel = {
  /** A drawing handed over as a response (a PNG data URL) that the operations are drawn on top of, or null. */
  base: string | null;
  /** What the candidate did, in order. */
  operations: Operation[];
  /** What undo took back, the last one first to redo. */
  undone: Operation[];
};

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  ADD: { operation: Operation };
  UNDO: null;
  REDO: null;
  CLEAR: null;
  SET_BASE: { base: string | null };
};

export const emptyState: StateModel = { base: null, operations: [], undone: [] };

/** After a clear, only what comes after it (and no base) is visible. */
export const isEmpty = (state: StateModel) => {
  const lastClear = state.operations.map((o) => o.kind).lastIndexOf("clear");
  const visible = state.operations.slice(lastClear + 1);
  return visible.length === 0 && (lastClear >= 0 || !state.base);
};

export const initStore = (initialState: StateModel) => {
  // the operations are in the state already: no need to keep them twice in the log
  const store = new Store<StateModel, Actions>(initialState, undefined, { maxActions: 50 });
  store.addReducer("ADD", (state, { operation }) => ({ ...state, operations: [...state.operations, operation], undone: [] }));
  store.addReducer("UNDO", (state) =>
    state.operations.length === 0
      ? state
      : { ...state, operations: state.operations.slice(0, -1), undone: [state.operations[state.operations.length - 1], ...state.undone] }
  );
  store.addReducer("REDO", (state) =>
    state.undone.length === 0
      ? state
      : { ...state, operations: [...state.operations, state.undone[0]], undone: state.undone.slice(1) }
  );
  store.addReducer("CLEAR", (state) =>
    isEmpty(state) ? state : { ...state, operations: [...state.operations, { kind: "clear" }], undone: [] }
  );
  store.addReducer("SET_BASE", (_state, { base }) => ({ base, operations: [], undone: [] }));
  return store;
};
