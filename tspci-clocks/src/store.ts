import { Store } from "@citolab/preact-store";

/**
 * The state of the PCI. Every change goes through an action (store.dispatch), and the store keeps the list of actions:
 * getState() saves both, so a session can be restored, and even replayed (store.replay), action by action.
 */
// value: the text in the input, also when it is not a number yet. hour (0-11) and minute (0-59): the time on the
// clock, null until a hand has been moved.
export type StateModel = { value: string; hour: number; minute: number };
/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  SET_VALUE: { value: string };
  SET_TIME: { hour: number; minute: number };
  SET_HOUR: { hour: number };
  SET_MINUTE: { minute: number }
};

export const initialState: StateModel = { value: "", hour: null, minute: null };

export const initStore = (state: StateModel = initialState) => {
  const store = new Store<StateModel, Actions>(state);
  store.addReducer("SET_VALUE", (current, { value }) => ({ ...current, value }));
  store.addReducer("SET_TIME", (current, { hour, minute }) => ({ ...current, hour, minute }));
  store.addReducer("SET_HOUR", (current, { hour }) => ({ ...current, hour }));
  store.addReducer("SET_MINUTE", (current, { minute }) => ({ ...current, minute }))
  return store;
};