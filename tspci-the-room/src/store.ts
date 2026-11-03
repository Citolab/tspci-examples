// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/theroom, © openPCI: Elias J.T. Hansen, Anna Rusmann and
// Jeppe Bundsgaard (Aarhus University and Aalborg University)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import { Placed } from "./exercise";

/** Every change carries the layout after it, so the log can be replayed; `uid` is the piece of furniture. */
type Change = { objects: Placed[]; uid: string };

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  ADD: Change;
  MOVE: Change;
  ROTATE: Change;
  REMOVE: Change;
  UNDO: null;
  START_OVER: null;
};

export type StateModel = {
  /** The furniture in the room; null: the exercise's layout at the start. */
  objects: Placed[] | null;
  /** earlier layouts, for undo (at most UNDO_DEPTH) */
  past: (Placed[] | null)[];
  /** The candidate changed something: from then on there is a response. */
  changed: boolean;
};

const UNDO_DEPTH = 30;

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState, undefined, { maxActions: 100 }); // every action carries a layout: keep the saved state bounded
  const change = (state: StateModel, { objects }: Change): StateModel => ({
    objects,
    past: [...state.past, state.objects].slice(-UNDO_DEPTH),
    changed: true,
  });
  store.addReducer("ADD", change);
  store.addReducer("MOVE", change);
  store.addReducer("ROTATE", change);
  store.addReducer("REMOVE", change);
  store.addReducer("UNDO", (state) =>
    state.past.length ? { ...state, objects: state.past[state.past.length - 1], past: state.past.slice(0, -1) } : state
  );
  store.addReducer("START_OVER", (state) =>
    state.objects === null ? state : { objects: null, past: [...state.past, state.objects].slice(-UNDO_DEPTH), changed: true }
  );
  return store;
};
