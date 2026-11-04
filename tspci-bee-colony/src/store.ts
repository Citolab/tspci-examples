// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Abeillepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";

/** The level of each factor (pesticide, hornet, varroa); a factor that is not in it is at 0. */
export type LevelMap = Record<string, number>;

/** A row of the results table: the levels and the population the candidate saw. */
export type Trial = { levels: LevelMap; population: number };

export type StateModel = {
  /** The sliders now. */
  levels: LevelMap;
  /** The rows the candidate recorded, in order. */
  trials: Trial[];
  /** The levels after every slider move, oldest first (the original's log of slider positions). */
  history: LevelMap[];
  /** The answer to the question: a choice (pesticide, hornet, varroa, equal) or the text the candidate typed. */
  answer: string;
};

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** The candidate moved a slider to a level. */
  MOVE: { factor: string; level: number };
  /** The candidate recorded the current levels as a trial. */
  RECORD: Trial;
  /** The candidate removed a row of the table. */
  REMOVE: { index: number };
  /** The candidate chose or typed an answer. */
  ANSWER: { answer: string };
  /** setResponse, review: a whole state at once. */
  RESTORE: StateModel;
};

/** At most this many moves in the response; the log keeps them all. */
export const MAX_HISTORY = 500;

export const emptyState = (): StateModel => ({ levels: {}, trials: [], history: [], answer: "" });

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("MOVE", (state, { factor, level }) => {
    if ((state.levels[factor] ?? 0) === level) return state;
    const levels = { ...state.levels, [factor]: level };
    return { ...state, levels, history: [...state.history, levels].slice(-MAX_HISTORY) };
  });
  store.addReducer("RECORD", (state, trial) => ({ ...state, trials: [...state.trials, trial] }));
  store.addReducer("REMOVE", (state, { index }) => ({ ...state, trials: state.trials.filter((_, i) => i !== index) }));
  store.addReducer("ANSWER", (state, { answer }) => ({ ...state, answer }));
  store.addReducer("RESTORE", (_state, next) => next);
  return store;
};

const levelMap = (value: any): LevelMap => {
  const result: LevelMap = {};
  if (!value || typeof value !== "object") return result;
  for (const [key, level] of Object.entries(value)) {
    if (/^[a-z]+$/.test(key) && typeof level === "number" && isFinite(level) && level >= 0) result[key] = Math.round(level);
  }
  return result;
};

/** A state from getState() or a response, checked: levels as whole numbers, trials with a population. */
export const validState = (value: any): StateModel | null => {
  if (!value || typeof value !== "object") return null;
  const trials = Array.isArray(value.trials)
    ? value.trials
        .filter((t: any) => t && typeof t.population === "number" && isFinite(t.population))
        .map((t: any) => ({ levels: levelMap(t.levels), population: Math.round(t.population) }))
    : [];
  const history = Array.isArray(value.history) ? value.history.map(levelMap).slice(-MAX_HISTORY) : [];
  return {
    levels: levelMap(value.levels),
    trials,
    history,
    answer: typeof value.answer === "string" ? value.answer.slice(0, 200) : "",
  };
};
