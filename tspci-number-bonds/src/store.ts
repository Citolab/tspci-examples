import { Store } from "@citolab/preact-store";

/**
 * The state of the PCI: the text in every box, as typed (also when it is not a number yet). Every change goes through
 * an action (store.dispatch), and the store keeps the list of actions: getState() saves both, so a session can be
 * restored, and even replayed (store.replay), action by action.
 * - layout: the layout the texts belong to (index.tsx layoutKey); a saved state of another layout is not restored
 * - values[box]: the text of each box, in the order of the model (bonds.ts Model); the given ones as the author gave them
 * - locked[box]: given by the author, the pupil cannot change it
 */
export type StateModel = {
  layout: string;
  values: string[];
  locked: boolean[];
};

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  SET_BOX: { index: number; value: string };
  /** All the pupil's boxes at once: a response the player hands back, or a correct response to show. */
  SET_ALL: { values: string[] };
};

export const initStore = (state: StateModel) => {
  const store = new Store<StateModel, Actions>(state);
  store.addReducer("SET_BOX", (current, { index, value }) =>
    current.locked[index] || index < 0 || index >= current.values.length
      ? current
      : { ...current, values: current.values.map((text, i) => (i === index ? value : text)) }
  );
  store.addReducer("SET_ALL", (current, { values }) => ({
    ...current,
    values: current.values.map((text, i) => (current.locked[i] ? text : (values[i] ?? ""))),
  }));
  return store;
};
