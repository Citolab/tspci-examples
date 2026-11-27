import { Store } from "@citolab/preact-store";
import { Counts, Supply, clean, left } from "./money";

/**
 * The state of the PCI. Every change goes through an action (store.dispatch), and the store keeps the list of actions:
 * getState() saves both, so a session can be restored, and even replayed (store.replay), action by action.
 *
 * - tray: the coins and notes the candidate put on the counter, by value in cents (pay, fewest, change)
 * - answer: the amount the candidate wrote, as typed (count)
 */
export type StateModel = { tray: Counts; answer: string };

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** One coin or note from the supply onto the counter. */
  ADD: { value: number };
  /** One coin or note off the counter, back into the supply. */
  REMOVE: { value: number };
  /** The whole counter at once: a response read back (setResponse, boundTo, status "solution"). */
  SET_TRAY: { tray: Counts };
  SET_ANSWER: { value: string };
};

export const initialState: StateModel = { tray: {}, answer: "" };

/** The store, with the supply: a coin or note that is not in it, or that has run out, is not added. */
export const initStore = (supply: Supply, state: StateModel = initialState) => {
  const store = new Store<StateModel, Actions>(state);
  store.addReducer("ADD", (current, { value }) =>
    left(supply, current.tray, value) > 0 ? { ...current, tray: clean({ ...current.tray, [value]: (current.tray[value] ?? 0) + 1 }) } : current
  );
  store.addReducer("REMOVE", (current, { value }) =>
    (current.tray[value] ?? 0) > 0 ? { ...current, tray: clean({ ...current.tray, [value]: current.tray[value] - 1 }) } : current
  );
  store.addReducer("SET_TRAY", (current, { tray }) => ({ ...current, tray: clean(tray) }));
  store.addReducer("SET_ANSWER", (current, { value }) => ({ ...current, answer: value }));
  return store;
};

/** A saved state of this PCI (an older or foreign one is ignored). */
export const isState = (state: Partial<StateModel> | undefined): state is StateModel =>
  !!state && typeof state.tray === "object" && state.tray !== null && !Array.isArray(state.tray) && typeof state.answer === "string";
