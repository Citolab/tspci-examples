import { Store } from "@citolab/preact-store";
import { Fill, Grid, paintCell, pushRow } from "./beadFrame";

/**
 * The state of the PCI. Every change goes through an action (store.dispatch), and the store keeps the list of actions:
 * getState() saves both, so a session can be restored, and even replayed (store.replay), action by action.
 *
 * grid: the frame row by row, 10 places per row, 0 empty, 1 the first part (colour), 2 the second (beadFrame.ts).
 */
export type StateModel = { grid: Grid };
/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** The rekenrek: `count` beads of a row pushed to the left; beads pushed now get `part`. */
  PUSH: { row: number; count: number; part: 1 | 2 };
  /** The hundred field: a square coloured (1, 2) or not (0). */
  PAINT: { row: number; column: number; fill: Fill };
  /** All beads back, every square empty. */
  CLEAR: Record<string, never>;
  /** A response shown on the frame (setResponse, boundTo, status "solution"). */
  SET_GRID: { grid: Grid };
};

export const initStore = (state: StateModel) => {
  const store = new Store<StateModel, Actions>(state);
  store.addReducer("PUSH", (current, { row, count, part }) => ({ ...current, grid: pushRow(current.grid, row, count, part) }));
  store.addReducer("PAINT", (current, { row, column, fill }) => ({ ...current, grid: paintCell(current.grid, row, column, fill) }));
  store.addReducer("CLEAR", (current) => ({ ...current, grid: current.grid.map((row) => row.map((): Fill => 0)) }));
  store.addReducer("SET_GRID", (current, { grid }) => ({ ...current, grid }));
  return store;
};
