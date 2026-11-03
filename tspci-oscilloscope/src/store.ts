import { Store } from "@citolab/preact-store";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { SET_SIGNAL: { frequency?: number; amplitude?: number } };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // every turn of a knob; the log keeps every step
  store.addReducer("SET_SIGNAL", (state, { frequency, amplitude }) => ({
    frequency: frequency ?? state.frequency,
    amplitude: amplitude ?? state.amplitude,
    touched: true,
  }));
  return store;
};

export type StateModel = {
  /** The candidate's frequency, in the unit of the settings (vibrations on the screen or Hz). */
  frequency: number;
  /** The candidate's amplitude, in divisions or volts. */
  amplitude: number;
  /** The candidate turned a knob: from then on there is a response. */
  touched: boolean;
};
