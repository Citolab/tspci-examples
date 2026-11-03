import { Store } from "@citolab/preact-store";
import type { Built, Measurement } from "./geometry";
import { validMeasurement } from "./geometry";

/** At most this many measurements at a time; the log keeps every step. */
export const MAX_MEASUREMENTS = 40;

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  ADD: { measurement: Measurement };
  REMOVE: { index: number };
  CLEAR: Record<string, never>;
  /** The text in the answer field, as typed ("3,42"). */
  ANSWER: { text: string };
  /** setResponse and the solution: a whole state at once. */
  RESTORE: StateModel;
};

export type StateModel = {
  measurements: Measurement[];
  answer: string;
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("ADD", (state, { measurement }) => ({ ...state, measurements: [...state.measurements, measurement].slice(-MAX_MEASUREMENTS) }));
  store.addReducer("REMOVE", (state, { index }) => ({ ...state, measurements: state.measurements.filter((_, i) => i !== index) }));
  store.addReducer("CLEAR", (state) => ({ ...state, measurements: [] }));
  store.addReducer("ANSWER", (state, { text }) => ({ ...state, answer: text }));
  store.addReducer("RESTORE", (_state, next) => next);
  return store;
};

/** A state from getState() or a response, checked against the scene: only measurements of its points and faces. */
export const validState = (built: Built, value: any): StateModel | null => {
  if (!value || typeof value !== "object") return null;
  const measurements = Array.isArray(value.measurements)
    ? value.measurements.map((m: unknown) => validMeasurement(built, m)).filter(Boolean).slice(-MAX_MEASUREMENTS)
    : [];
  return { measurements, answer: typeof value.answer === "string" ? value.answer.slice(0, 40) : "" };
};
