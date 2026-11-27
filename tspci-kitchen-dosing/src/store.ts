import { Store } from "@citolab/preact-store";
import { Work, clean } from "./kitchen";

/**
 * The state of the PCI is the pupil's work (kitchen.ts Work): the amounts written, what is in each tool, the tare of
 * each scale, the chosen product, the pours into the bucket. Every change goes through an action (store.dispatch), and
 * the store keeps the list of actions: getState() saves both, so a session can be restored, and even replayed.
 */
export type StateModel = Work;

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** What the pupil wrote for a line of the recipe (dosing: line 0, the ml of product). */
  SET_AMOUNT: { line: number; value: string };
  /** What is in the tool of a line (grams, ml, spoons, pieces; dosing: ml in the cup). */
  SET_CONTENT: { line: number; value: number };
  /** The tare button: the scale subtracts what it weighs now, so it shows 0. */
  TARE: { line: number; offset: number };
  /** The product chosen (dosing). */
  CHOOSE: { product: string };
  /** The cup into the bucket (dosing). */
  POUR: Record<string, never>;
  /** The bucket emptied: clean water, no product (dosing). */
  EMPTY: Record<string, never>;
  /** The whole work at once: a response read back (setResponse, boundTo, status "solution"). */
  SET_WORK: { work: Work };
};

const replace = <T,>(list: T[], at: number, value: T) => list.map((x, i) => (i === at ? value : x));

export const initStore = (initial: Work) => {
  const store = new Store<StateModel, Actions>(initial);
  store.addReducer("SET_AMOUNT", (s, { line, value }) => ({ ...s, amounts: replace(s.amounts, line, value) }));
  store.addReducer("SET_CONTENT", (s, { line, value }) => ({ ...s, content: replace(s.content, line, clean(Math.max(0, value))) }));
  store.addReducer("TARE", (s, { line, offset }) => ({ ...s, tare: replace(s.tare, line, clean(offset)) }));
  store.addReducer("CHOOSE", (s, { product }) => ({ ...s, product }));
  store.addReducer("POUR", (s) => (s.content[0] > 0 ? { ...s, pours: [...s.pours, s.content[0]], content: replace(s.content, 0, 0) } : s));
  store.addReducer("EMPTY", (s) => ({ ...s, pours: [] }));
  store.addReducer("SET_WORK", (_, { work }) => work);
  return store;
};
