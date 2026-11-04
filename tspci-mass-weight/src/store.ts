// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/ForceGravitepci and
// https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Delorpci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import {
  AnswerField, Bench, Location, MAX_READINGS, PlaceId, Reading, Settings, initialBench, move, newReadings, readingsOf, scaleLoad,
} from "./model";

export type StateModel = Bench & {
  /** What the candidate typed in each answer field. */
  answers: Partial<Record<AnswerField, string>>;
  /** Every reading the candidate saw, in order. */
  readings: Reading[];
};

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  PLACE: { place: PlaceId };
  MOVE: { object: string; to: Location };
  /** The water the candidate poured (on letting go of the slider). */
  WATER: { water: number };
  /** The on/off button of the scale. */
  POWER: Record<string, never>;
  TARE: Record<string, never>;
  ANSWER: { field: AnswerField; text: string };
  /** setResponse, the solution: a whole state at once. */
  RESTORE: StateModel;
};

export const initialState = (s: Settings): StateModel => ({ ...initialBench(s), answers: {}, readings: [] });

/** The reducers need the settings of now (trigger() may change them), so they get a function. */
export const initStore = (initial: StateModel, settings: () => Settings) => {
  const store = new Store<StateModel, Actions>(initial);
  /** The next state of the bench, with the readings it gives added to the log. */
  const next = (state: StateModel, bench: Bench): StateModel => {
    const added = newReadings(settings(), state, bench);
    const readings = added.length ? [...state.readings, ...added].slice(-MAX_READINGS) : state.readings;
    return { ...state, ...bench, readings };
  };
  const bench = (state: StateModel): Bench => ({
    place: state.place, placements: state.placements, water: state.water, scaleOn: state.scaleOn, tare: state.tare,
  });
  store.addReducer("PLACE", (state, { place }) => next(state, { ...bench(state), place }));
  store.addReducer("MOVE", (state, { object, to }) => next(state, move(settings(), bench(state), object, to)));
  store.addReducer("WATER", (state, { water }) => next(state, { ...bench(state), water }));
  store.addReducer("POWER", (state) =>
    next(state, settings().scaleOnOff ? { ...bench(state), scaleOn: !state.scaleOn, tare: 0 } : bench(state)));
  store.addReducer("TARE", (state) => {
    if (!state.scaleOn || readingsOf(settings(), state).scale.note === "overload") return state;
    return next(state, { ...bench(state), tare: scaleLoad(settings(), state) });
  });
  store.addReducer("ANSWER", (state, { field, text }) => ({ ...state, answers: { ...state.answers, [field]: text } }));
  store.addReducer("RESTORE", (_state, restored) => restored);
  return store;
};
