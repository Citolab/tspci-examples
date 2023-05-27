import { Store } from "@citolab/preact-store";
import { Cube } from "./utils";

export type ActionType = "ADD_ACTION" | "REMOVE_ACTION" | "RESTORE_STATE";

export type StateModel = {
  cubes: Cube[];
};

export const initStore = (initialState: StateModel, restoreData?: {
  state: StateModel;
  actions: { type: string; payload: any; timestamp?: number }[];
}) => {
  const store = new Store<StateModel>(initialState, restoreData);
  store.addReducer<Cube>("ADDED_CUBE", (state, payload) => {
    const newCubes = [...state.cubes, payload];
    return { ...state, cubes: newCubes };
  });
  store.addReducer<Cube>("REMOVED_CUBE", (state, payload) => {
    const newCubes = state.cubes.filter((c) => !(c.x === payload.x && c.y === payload.y && c.z === payload.z));
    return { ...state, cubes: newCubes };
  });
  return store;
}
