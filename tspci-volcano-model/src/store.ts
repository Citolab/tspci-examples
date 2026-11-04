// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Volcanismepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import { Experiment, OUTCOMES, Outcome, VISCOSITIES, Viscosity, validExperiment } from "./model";

/** empty: water only; poured: purée in the right branch; erupted: the experiment ran (only "start again" is left). */
export type Phase = "empty" | "poured" | "erupted";

export type StateModel = {
  phase: Phase;
  /** the purée in the tube (poured, erupted) */
  viscosity: Viscosity | null;
  /** the number of tablets the candidate chose */
  tablets: number;
  /** every experiment the candidate ran, oldest first */
  experiments: Experiment[];
  /** the matching task: outcome → viscosity or eruption type */
  answers: Partial<Record<Outcome, string>>;
  /** how often the candidate started again */
  resets: number;
};

export type Actions = {
  /** step 1: pour purée of this viscosity */
  POUR: { viscosity: Viscosity };
  /** the number of tablets */
  TABLETS: { tablets: number };
  /** step 2: tablet in, stopper on; the experiment and its outcome */
  ERUPT: { experiment: Experiment };
  /** back to water only */
  RESET: {};
  /** an answer of the task */
  ANSWER: { outcome: Outcome; value: string };
  /** setState / setResponse */
  RESTORE: StateModel;
};

export const MAX_EXPERIMENTS = 200;

export const initialState = (): StateModel => ({ phase: "empty", viscosity: null, tablets: 1, experiments: [], answers: {}, resets: 0 });

export const initStore = (initial: StateModel) => {
  const store = new Store<StateModel, Actions>(initial);
  store.addReducer("POUR", (state, { viscosity }) => (state.phase === "empty" ? { ...state, phase: "poured", viscosity } : state));
  store.addReducer("TABLETS", (state, { tablets }) => ({ ...state, tablets }));
  store.addReducer("ERUPT", (state, { experiment }) =>
    state.phase === "poured"
      ? { ...state, phase: "erupted", experiments: [...state.experiments, experiment].slice(-MAX_EXPERIMENTS) }
      : state
  );
  store.addReducer("RESET", (state) => ({ ...state, phase: "empty", viscosity: null, resets: state.resets + 1 }));
  store.addReducer("ANSWER", (state, { outcome, value }) => {
    const answers = { ...state.answers };
    if (value) answers[outcome] = value;
    else delete answers[outcome];
    return { ...state, answers };
  });
  store.addReducer("RESTORE", (_state, next) => next);
  return store;
};

/** A state from getState(), checked. */
export const validState = (value: any): StateModel | null => {
  if (!value || typeof value !== "object") return null;
  const experiments = Array.isArray(value.experiments) ? value.experiments.map(validExperiment).filter(Boolean) : [];
  const viscosity = VISCOSITIES.includes(value.viscosity) ? value.viscosity : null;
  let phase: Phase = ["empty", "poured", "erupted"].includes(value.phase) ? value.phase : "empty";
  if (phase !== "empty" && !viscosity) phase = "empty";
  if (phase === "erupted" && !experiments.length) phase = viscosity ? "poured" : "empty";
  const answers: Partial<Record<Outcome, string>> = {};
  if (value.answers && typeof value.answers === "object") {
    for (const o of OUTCOMES) if (typeof value.answers[o] === "string" && value.answers[o]) answers[o] = value.answers[o];
  }
  const tablets = Number.isInteger(value.tablets) && value.tablets >= 1 && value.tablets <= 3 ? value.tablets : 1;
  const resets = Number.isInteger(value.resets) && value.resets >= 0 ? value.resets : 0;
  return { phase, viscosity: phase === "empty" ? null : viscosity, tablets, experiments, answers, resets };
};
