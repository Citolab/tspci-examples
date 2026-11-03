// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/multiplematch, © Jeppe Bundsgaard, Aarhus University (openPCI)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import { Answers, Order } from "./matrix";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** A radio choice: this category for this topic and item; choosing the chosen one again takes it back. */
  CHOOSE: { key: string; value: string };
  /** A checkbox (multiple selections): this category on or off. */
  TOGGLE: { key: string; value: string };
  /** All answers at once (setResponse, or the correct response in review). */
  SET: { answers: Answers };
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("CHOOSE", (state, { key, value }) => {
    const answers = { ...state.answers };
    if (answers[key]?.[0] === value) delete answers[key];
    else answers[key] = [value];
    return { ...state, answers };
  });
  store.addReducer("TOGGLE", (state, { key, value }) => {
    const current = state.answers[key] ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    const answers = { ...state.answers, [key]: next };
    if (!next.length) delete answers[key];
    return { ...state, answers };
  });
  store.addReducer("SET", (state, { answers }) => ({ ...state, answers }));
  return store;
};

export type StateModel = {
  /** The chosen category values per "<topic name>_<item name>". */
  answers: Answers;
  /** The order the candidate saw (randomized or not), so a restored item looks the same. */
  order: Order | null;
};
