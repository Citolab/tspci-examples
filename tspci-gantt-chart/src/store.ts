// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/ganttchart, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026
import { Store } from "@citolab/preact-store";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** The slots of one task after a click, a drag or a key. */
  SET_TASK: { task: number; slots: number[] };
  /** All tasks at once (a response handed to the PCI). */
  SET_ALL: { selection: number[][] };
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("SET_TASK", (state, { task, slots }) => {
    const selection = [...state.selection];
    while (selection.length <= task) selection.push([]);
    selection[task] = slots;
    return { ...state, selection };
  });
  store.addReducer("SET_ALL", (state, { selection }) => ({ ...state, selection }));
  return store;
};

export type StateModel = {
  /** Per task the selected time slots, 0-based and sorted. */
  selection: number[][];
};
