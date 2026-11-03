// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/wordrank, © OpenPCI, Aarhus University and Aalborg University
// (Elias J.T. Hansen, Anna Rusmann, Jeppe Bundsgaard)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";

/** The pre-sort piles: not sorted yet, then the low, neutral and high pile. */
export const UNSORTED = 0;
export const PILES = [1, 2, 3];

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** Put a statement in a place of the grid; a statement already there takes the place the moved one came from. */
  PLACE: { statement: number; slot: number };
  /** Take a statement out of the grid, back to the pile it was in. */
  REMOVE: { statement: number };
  /** Put a statement on a pile (UNSORTED, or one of PILES), out of the grid. */
  PILE: { statement: number; pile: number };
};

export type StateModel = {
  /** The statements the candidate got (indexes into the statements), in the order shown: shuffled once. */
  presented: number[];
  /** Per place, column by column (lowest value first), the statement in it or null. */
  slots: (number | null)[];
  /** Per statement (index into the statements), the pile it is on; kept while it is in the grid. */
  piles: number[];
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("PLACE", (state, { statement, slot }) => {
    const slots = [...state.slots];
    const from = slots.indexOf(statement);
    const other = slots[slot];
    if (from === slot) return state;
    if (from >= 0) slots[from] = other ?? null; // swap; from a pile an occupant goes back to its pile
    slots[slot] = statement;
    return { ...state, slots };
  });
  store.addReducer("REMOVE", (state, { statement }) => ({
    ...state,
    slots: state.slots.map((s) => (s === statement ? null : s)),
  }));
  store.addReducer("PILE", (state, { statement, pile }) => {
    const piles = [...state.piles];
    piles[statement] = pile;
    return { ...state, piles, slots: state.slots.map((s) => (s === statement ? null : s)) };
  });
  return store;
};

/** A saved state fitted to the statements and places there are now (the author may have changed them). */
export const fitState = (
  state: Partial<StateModel> | undefined,
  statementCount: number,
  places: number
): StateModel | null => {
  if (!state || !Array.isArray(state.presented) || !Array.isArray(state.slots)) return null;
  const presented = state.presented.filter((s) => Number.isInteger(s) && s >= 0 && s < statementCount);
  // a statement that was added since gets in too, at the end
  for (let s = 0; s < statementCount; s++) if (!presented.includes(s)) presented.push(s);
  const seen = new Set<number>();
  const slots = Array.from({ length: places }, (_, i) => {
    const s = state.slots[i];
    if (s === null || s === undefined || !presented.includes(s) || seen.has(s)) return null;
    seen.add(s);
    return s;
  });
  const piles = Array.from({ length: statementCount }, (_, s) => {
    const pile = Array.isArray(state.piles) ? state.piles[s] : UNSORTED;
    return PILES.includes(pile) ? pile : UNSORTED;
  });
  return { presented, slots, piles };
};
