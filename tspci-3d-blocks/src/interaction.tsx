import { Store } from "@citolab/preact-store";

export type ActionType = "ADD_ACTION" | "REMOVE_ACTION";

export type StateModel = {
  cubes: {x:number, y:number, z:number}[];
};

export const initStore = (initialState: StateModel, restoreData?: {
  state: StateModel;
  actions: { type: string; payload: any; timestamp?: number }[];
}) => {
  const store = new Store<StateModel>(initialState, restoreData);
  store.addReducer<{ x: number; y: number; z: number }>("ADDED_CUBE", (state, payload) => {
    const newCubes = [...state.cubes, payload];
    return { ...state, cubes: newCubes };
  });
  store.addReducer<{ x: number; y: number; z: number }>("REMOVED_CUBE", (state, payload) => {
    const newCubes = state.cubes.filter((c) => !(c.x === payload.x && c.y === payload.y && c.z === payload.z));
    return { ...state, cubes: newCubes };
  });
  return store;
}
