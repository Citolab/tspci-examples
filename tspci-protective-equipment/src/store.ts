import { Store } from "@citolab/preact-store";
import { HazardId, ItemId, Reasons, WorkerId, Worn, cleanReasons, isHazardId, isItemId, isWorkerId, putOn, takeOff, toggle, wearable } from "./equipment";

/**
 * The state of the PCI. Every change goes through an action (store.dispatch), and the store keeps the list of actions:
 * getState() saves both, so a session can be restored, and even replayed (store.replay), action by action.
 *
 * - worn: what the worker wears, item ids in rack order
 * - reasons: why, per item worn (explain)
 * - worker: the figure the pupil chose (with the worker setting "choice"); not part of the response
 */
export type StateModel = { worn: Worn; reasons: Reasons; worker: WorkerId };

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** A tap on an item in the rack, or Enter or Space on it: on when it is off, off when it is on. */
  TOGGLE: { id: ItemId };
  /** Dragged onto the worker: on (it takes off another of its slot: one pair of gloves). */
  PUT_ON: { id: ItemId };
  /** Dragged off the worker, or tapped on the worker: off. */
  TAKE_OFF: { id: ItemId };
  /** Why the pupil wears it (explain); "" for none. */
  SET_REASON: { id: ItemId; reason: HazardId | "" };
  /** Everything at once: a response read back (setResponse, boundTo, status "solution"). */
  SET_DRESSING: { worn: Worn; reasons: Reasons };
  SET_WORKER: { worker: WorkerId };
};

export const initialState: StateModel = { worn: [], reasons: {}, worker: 1 };

const dressed = (state: StateModel, worn: Worn): StateModel => ({ ...state, worn, reasons: cleanReasons(worn, state.reasons) });

export const initStore = (worker: WorkerId = 1) => {
  const store = new Store<StateModel, Actions>({ ...initialState, worker });
  store.addReducer("TOGGLE", (state, { id }) => (isItemId(id) ? dressed(state, toggle(state.worn, id)) : state));
  store.addReducer("PUT_ON", (state, { id }) => (isItemId(id) && !state.worn.includes(id) ? dressed(state, putOn(state.worn, id)) : state));
  store.addReducer("TAKE_OFF", (state, { id }) => (state.worn.includes(id) ? dressed(state, takeOff(state.worn, id)) : state));
  store.addReducer("SET_REASON", (state, { id, reason }) => {
    if (!state.worn.includes(id)) return state;
    const reasons = { ...state.reasons };
    if (reason) reasons[id] = reason;
    else delete reasons[id];
    return { ...state, reasons: cleanReasons(state.worn, reasons) };
  });
  store.addReducer("SET_DRESSING", (state, { worn, reasons }) => {
    const clean = wearable(worn);
    return { ...state, worn: clean, reasons: cleanReasons(clean, reasons) };
  });
  store.addReducer("SET_WORKER", (state, { worker }) => (isWorkerId(worker) ? { ...state, worker } : state));
  return store;
};

/** A saved state of this PCI (an older or foreign one is ignored). */
export const isState = (state: Partial<StateModel> | undefined): state is StateModel =>
  !!state &&
  Array.isArray(state.worn) &&
  state.worn.every(isItemId) &&
  typeof state.reasons === "object" &&
  state.reasons !== null &&
  !Array.isArray(state.reasons) &&
  Object.values(state.reasons).every(isHazardId) &&
  isWorkerId(state.worker);
