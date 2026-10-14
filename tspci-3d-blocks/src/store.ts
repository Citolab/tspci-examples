import { Store } from "@citolab/preact-store";
import { Cube } from "./utils";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { ADDED_CUBE: Cube; REMOVED_CUBE: Cube };

export type StateModel = {
  cubes: Cube[];
};

export const initStore = (initialState: StateModel, restoreData?: {
  state: StateModel;
  actions: { type: string; payload: any; timestamp?: number }[];
}) => {
  const store = new Store<StateModel, Actions>(initialState, restoreData);
  store.addReducer("ADDED_CUBE", (state, payload) => {
    const newCubes = [...state.cubes, payload];
    return { ...state, cubes: newCubes };
  });
  store.addReducer("REMOVED_CUBE", (state, payload) => {
    const newCubes = state.cubes.filter((c) => !(c.x === payload.x && c.y === payload.y && c.z === payload.z));
    return { ...state, cubes: newCubes };
  });
  return store;
}
