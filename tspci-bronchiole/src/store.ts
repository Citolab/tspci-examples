// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Broncopci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** The candidate set a pollution level (let go of the slider, a key, a button); start: the level before the first. */
  LEVEL: { level: number; start: number };
  /** The candidate typed an answer. */
  ANSWER: { text: string };
  /** setResponse, review: a whole state at once. */
  RESTORE: StateModel;
};

/** At most this many levels in the response; the log keeps every action. */
export const MAX_LEVELS = 200;

export type StateModel = {
  /** The level the candidate set; null: they did not, so the start level of the settings. */
  level: number | null;
  /** Every level the candidate stopped at, beginning with the start level; the same level twice in a row once. */
  levels: number[];
  /** The answer to the question as typed ("10,5"); "" none. */
  answer: string;
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("LEVEL", (state, { level, start }) => {
    const levels = state.levels.length ? state.levels : [start];
    const last = levels[levels.length - 1];
    return { ...state, level, levels: last === level ? levels : [...levels, level].slice(-MAX_LEVELS) };
  });
  store.addReducer("ANSWER", (state, { text }) => ({ ...state, answer: text }));
  store.addReducer("RESTORE", (_state, next) => next);
  return store;
};

/** A state from getState() checked: a level or null, whole levels, an answer text. */
export const validState = (value: any): StateModel | null => {
  if (!value || typeof value !== "object") return null;
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? Math.round(v) : null);
  const levels = Array.isArray(value.levels) ? value.levels.map(n).filter((v: number | null) => v !== null) : [];
  return { level: n(value.level), levels: levels.slice(-MAX_LEVELS), answer: typeof value.answer === "string" ? value.answer : "" };
};
