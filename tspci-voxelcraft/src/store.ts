// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/voxelcraft, © OpenPCI (Aarhus University and Aalborg
// University: Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import { Voxel, inBounds, key, sortVoxels } from "./voxels";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** Place one cube, or a line of them (Shift + drag); cells that are taken stay as they are. */
  ADD: { voxels: Voxel[] };
  REMOVE: { key: string };
  /** Give a cube another colour (the original's palette tool). */
  PAINT: { key: string; c: number };
  /** Back to the preset figure (the original's "start over"). */
  RESET: { voxels: Voxel[] };
  UNDO: null;
};

export type StateModel = {
  voxels: Voxel[];
  /** The candidate did something: from then on getResponse() reports the building. */
  changed: boolean;
  /** The buildings before the last actions, for undo (not saved). */
  past: Voxel[][];
};

const MAX_UNDO = 50;

const step = (state: StateModel, voxels: Voxel[]): StateModel => ({
  voxels: sortVoxels(voxels),
  changed: true,
  past: [...state.past, state.voxels].slice(-MAX_UNDO),
});

export const initStore = (initialState: StateModel) => {
  // the log is saved with the state: keep it bounded
  const store = new Store<StateModel, Actions>(initialState, undefined, { maxActions: 500 });
  store.addReducer("ADD", (state, { voxels }) => {
    const taken = new Set(state.voxels.map((v) => key(v.p)));
    const added = voxels.filter((v) => inBounds(v.p) && !taken.has(key(v.p)) && (taken.add(key(v.p)), true));
    return added.length ? step(state, [...state.voxels, ...added]) : state;
  });
  store.addReducer("REMOVE", (state, { key: k }) =>
    state.voxels.some((v) => key(v.p) === k) ? step(state, state.voxels.filter((v) => key(v.p) !== k)) : state
  );
  store.addReducer("PAINT", (state, { key: k, c }) =>
    state.voxels.some((v) => key(v.p) === k && v.c !== c)
      ? step(state, state.voxels.map((v) => (key(v.p) === k ? { ...v, c } : v)))
      : state
  );
  store.addReducer("RESET", (state, { voxels }) => step(state, voxels));
  store.addReducer("UNDO", (state) =>
    state.past.length ? { voxels: state.past[state.past.length - 1], changed: true, past: state.past.slice(0, -1) } : state
  );
  return store;
};
