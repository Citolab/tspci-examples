// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/NouvelleTerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import { VARIABLES, Variable } from "./settings";

/** The values of the three sliders: distance (millions of km), mass (10²³ kg), radius (km). */
export type Values = Record<Variable, number>;
/** A recorded measurement: the values and the force (N, rounded as shown). */
export type Measurement = Values & { force: number };

export type StateModel = {
  /** What the candidate set; null: not yet, so the setting's start value. */
  values: Record<Variable, number | null>;
  /** The variables the candidate changed at least once (the original logged only this). */
  changed: Variable[];
  /** The measurements the candidate recorded, in order. */
  records: Measurement[];
  /** The variables the candidate ticked in the question. */
  answer: Variable[];
};

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** The candidate let go of a slider (or used a key or a ± button). */
  SET: { variable: Variable; value: number };
  /** "Record measurement": the measurement, made by the interaction (it knows the force); max: the table's size. */
  RECORD: { measurement: Measurement; max: number };
  /** Removes one recorded row. */
  REMOVE: { index: number };
  /** Ticks or unticks a variable in the question. */
  TOGGLE: { variable: Variable };
  /** setResponse: a whole state at once. */
  RESTORE: StateModel;
};

export const emptyState = (): StateModel => ({ values: { distance: null, mass: null, radius: null }, changed: [], records: [], answer: [] });

const ordered = (list: Variable[]) => VARIABLES.filter((v) => list.includes(v));

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("SET", (state, { variable, value }) => ({
    ...state,
    values: { ...state.values, [variable]: value },
    changed: ordered([...state.changed, variable]),
  }));
  store.addReducer("RECORD", (state, { measurement, max }) => ({ ...state, records: [...state.records, measurement].slice(-max) }));
  store.addReducer("REMOVE", (state, { index }) => ({ ...state, records: state.records.filter((_, i) => i !== index) }));
  store.addReducer("TOGGLE", (state, { variable }) => ({
    ...state,
    answer: state.answer.includes(variable) ? state.answer.filter((v) => v !== variable) : ordered([...state.answer, variable]),
  }));
  store.addReducer("RESTORE", (_state, next) => next);
  return store;
};

const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
const variables = (list: unknown): Variable[] => (Array.isArray(list) ? ordered(list.filter((v) => VARIABLES.includes(v))) : []);

/** A recorded measurement from JSON, checked: four numbers, or null. */
export const validMeasurement = (m: any): Measurement | null => {
  const [distance, mass, radius, force] = [n(m?.distance), n(m?.mass), n(m?.radius), n(m?.force)];
  return distance !== null && mass !== null && radius !== null && force !== null ? { distance, mass, radius, force } : null;
};

/** A state from getState() or a response, checked. */
export const validState = (value: any): StateModel | null => {
  if (!value || typeof value !== "object") return null;
  return {
    values: { distance: n(value.values?.distance), mass: n(value.values?.mass), radius: n(value.values?.radius) },
    changed: variables(value.changed),
    records: Array.isArray(value.records) ? value.records.map(validMeasurement).filter((m: Measurement | null) => m !== null) : [],
    answer: variables(value.answer),
  };
};
