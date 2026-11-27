import { Store } from "@citolab/preact-store";

/**
 * The state of the PCI: the fields the pupil tapped and the number they typed. Every change goes through an action
 * (store.dispatch), and the store keeps the list of actions: getState() saves both, so a session can be restored.
 * - layout: the document and task the state belongs to (index.tsx layoutKey); a saved state of another one is not restored
 * - marked: the fields the pupil tapped, in the order they tapped them (find: one; check: the mistakes they saw;
 *   answer: where they found it)
 * - typed: the text in the answer box, as typed
 */
export type StateModel = {
  layout: string;
  marked: string[];
  typed: string;
};

export type Actions = {
  /** a tap on a field: find and answer choose it (or take it back), check marks it (or takes the mark away) */
  TAP: { field: string; many: boolean };
  TYPE: { text: string };
  /** everything at once: a response the player hands back, or the correct response to show */
  SET_ALL: { marked: string[]; typed: string };
};

export const initStore = (state: StateModel) => {
  const store = new Store<StateModel, Actions>(state);
  store.addReducer("TAP", (current, { field, many }) => {
    const has = current.marked.includes(field);
    const marked = has ? current.marked.filter((id) => id !== field) : many ? [...current.marked, field] : [field];
    return { ...current, marked };
  });
  store.addReducer("TYPE", (current, { text }) => ({ ...current, typed: text }));
  store.addReducer("SET_ALL", (current, { marked, typed }) => ({ ...current, marked: [...marked], typed }));
  return store;
};
