// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/EffetDeSerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import type { Prediction } from "./settings";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** The candidate set a greenhouse gas level (let go of the slider, or a − / + button). */
  SET_LEVEL: { level: number };
  /** The candidate chose a prediction (direction question). */
  PREDICT: { prediction: Prediction };
  /** setResponse: a whole state at once. */
  RESTORE: StateModel;
};

/** At most this many levels in the response; the log keeps every action. */
export const MAX_TRIED = 200;

export type StateModel = {
  /** The level the candidate set; null: they did not, so the start level. */
  level: number | null;
  /** Every level the candidate stopped at, in order (the same level twice in a row once). */
  tried: number[];
  /** The direction question's prediction; null: none yet. */
  prediction: Prediction | null;
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("SET_LEVEL", (state, { level }) => {
    const same = state.tried[state.tried.length - 1] === level;
    return { ...state, level, tried: same ? state.tried : [...state.tried, level].slice(-MAX_TRIED) };
  });
  store.addReducer("PREDICT", (state, { prediction }) => ({ ...state, prediction }));
  store.addReducer("RESTORE", (_state, next) => next);
  return store;
};

const PREDICTIONS: Prediction[] = ["up", "same", "down"];

/** A state from getState() or a response, checked: levels 0 … 100, a known prediction. */
export const validState = (value: any): StateModel | null => {
  if (!value || typeof value !== "object") return null;
  const level = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 && v <= 100 ? v : null);
  const tried = Array.isArray(value.tried) ? value.tried.map(level).filter((v: number | null): v is number => v !== null) : [];
  return {
    level: level(value.level),
    tried: tried.slice(-MAX_TRIED),
    prediction: PREDICTIONS.includes(value.prediction) ? value.prediction : null,
  };
};
