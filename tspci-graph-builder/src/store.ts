// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Lentillespci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import { AxisKey, GraphState, MAX_POINTS, Point, clean } from "./graph";

export type StateModel = GraphState;

/** The actions, as { type: payload }: dispatch and addReducer only accept these. The log keeps every one. */
export type Actions = {
  /** A cell of the table: row (0-based), column 0 (x) or 1 (y), the text typed. */
  SET_CELL: { row: number; column: 0 | 1; value: string };
  /** A heading of the table. */
  SET_HEADER: { column: 0 | 1; value: string };
  SET_TITLE: { value: string };
  /** The quantity, the unit or the scale of an axis. */
  SET_AXIS: { axis: AxisKey; quantity?: string; unit?: string; max?: number; step?: number };
  ADD_POINT: Point;
  MOVE_POINT: { index: number; x: number; y: number };
  REMOVE_POINT: { index: number };
  CLEAR_POINTS: Record<string, never>;
  SET_LINE: { line: boolean };
  /** setResponse or review: a whole state at once. */
  RESTORE: GraphState;
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("SET_CELL", (state, { row, column, value }) => {
    if (!state.table.rows[row]) return state;
    const rows = state.table.rows.map((r, i) => (i === row ? (column === 0 ? [value, r[1]] : [r[0], value]) as [string, string] : r));
    return { ...state, table: { ...state.table, rows } };
  });
  store.addReducer("SET_HEADER", (state, { column, value }) => {
    const headers: [string, string] = column === 0 ? [value, state.table.headers[1]] : [state.table.headers[0], value];
    return { ...state, table: { ...state.table, headers } };
  });
  store.addReducer("SET_TITLE", (state, { value }) => ({ ...state, title: value }));
  store.addReducer("SET_AXIS", (state, { axis, ...change }) => {
    const next = { ...state[axis] };
    for (const key of ["quantity", "unit", "max", "step"] as const) {
      if (change[key] !== undefined) (next as Record<string, unknown>)[key] = change[key];
    }
    return { ...state, [axis]: next };
  });
  store.addReducer("ADD_POINT", (state, { x, y }) =>
    state.points.length >= MAX_POINTS ? state : { ...state, points: [...state.points, { x: clean(x), y: clean(y) }] });
  store.addReducer("MOVE_POINT", (state, { index, x, y }) =>
    ({ ...state, points: state.points.map((p, i) => (i === index ? { x: clean(x), y: clean(y) } : p)) }));
  store.addReducer("REMOVE_POINT", (state, { index }) => ({ ...state, points: state.points.filter((_, i) => i !== index) }));
  store.addReducer("CLEAR_POINTS", (state) => ({ ...state, points: [], line: false }));
  store.addReducer("SET_LINE", (state, { line }) => ({ ...state, line }));
  store.addReducer("RESTORE", (_state, next) => next);
  return store;
};
