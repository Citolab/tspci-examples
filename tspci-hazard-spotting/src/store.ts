import { Store } from "@citolab/preact-store";
import type { Mark } from "./hazards";

/**
 * The state of the PCI: the pupil's marks, in the order they were placed (the number on a marker). Every change goes
 * through an action (store.dispatch), and the store keeps the list of actions: getState() saves both, so a session can
 * be restored, and even replayed (store.replay), action by action.
 * - layout: the scene and hazards the marks belong to (model.ts); a saved state of another layout is not restored
 * - marks: where the pupil tapped (scene units), and on which spot (null: on no spot)
 */
export type StateModel = {
  layout: string;
  marks: Mark[];
};

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  ADD_MARK: { mark: Mark };
  REMOVE_MARK: { index: number };
  /** All marks at once: a response the player hands back, or a correct response to show. */
  SET_MARKS: { marks: Mark[] };
};

export const initStore = (state: StateModel) => {
  const store = new Store<StateModel, Actions>(state);
  store.addReducer("ADD_MARK", (current, { mark }) => ({ ...current, marks: [...current.marks, mark] }));
  store.addReducer("REMOVE_MARK", (current, { index }) =>
    index < 0 || index >= current.marks.length ? current : { ...current, marks: current.marks.filter((_, i) => i !== index) }
  );
  store.addReducer("SET_MARKS", (current, { marks }) => ({ ...current, marks }));
  return store;
};
