import { Store } from "@citolab/preact-store";
import { Chart } from "./flowchart";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { SET_CHART: { chart: Chart } };

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // placing, moving, connecting, removing, undo and start again all set the chart; the log keeps every step
  store.addReducer("SET_CHART", (state, { chart }) => ({ ...state, chart }));
  return store;
};

export type StateModel = {
  /** The whole chart: the author's locked blocks and arrows, the filled slots and the candidate's own. */
  chart: Chart;
};
