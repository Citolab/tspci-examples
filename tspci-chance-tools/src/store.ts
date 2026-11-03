import { Store } from "@citolab/preact-store";
import { Design, Experiment, MAX_TRIALS, TreeEntry, trialCount } from "./chance";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** 1, 10 or 100 trials more */
  RUN: { trials: number };
  /** a new experiment: it starts after the trials so far, with the same seed */
  NEW_EXPERIMENT: Record<string, never>;
  /** design mode: the candidate's spinner or bag; the experiment starts again */
  SET_DESIGN: { design: Design };
  /** tree mode: what the candidate filled in */
  SET_TREE: { tree: TreeEntry };
};

const restart = (e: Experiment): Experiment => ({ ...e, start: e.start + trialCount(e), runs: [] });

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("RUN", (state, { trials }) => {
    const room = MAX_TRIALS - trialCount(state.experiment);
    const n = Math.min(room, Math.max(0, Math.round(trials)));
    return n ? { ...state, experiment: { ...state.experiment, runs: [...state.experiment.runs, n] } } : state;
  });
  store.addReducer("NEW_EXPERIMENT", (state) => ({ ...state, experiment: restart(state.experiment) }));
  store.addReducer("SET_DESIGN", (state, { design }) => ({ ...state, design, experiment: restart(state.experiment) }));
  store.addReducer("SET_TREE", (state, { tree }) => ({ ...state, tree }));
  return store;
};

export type StateModel = {
  /** the seed of the session, where the current experiment starts, and its runs: the same history after a restore */
  experiment: Experiment;
  design: Design;
  tree: TreeEntry;
};
