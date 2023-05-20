import { Store } from "@citolab/preact-store";

export type Vlak = { id: string; color: string };

export const initStore = (initialState: StateModel, restoreData?: {
  state: StateModel;
  actions: { type: string; payload: any; timestamp?: number }[];
}) => {
  const store = new Store<StateModel>(initialState, restoreData);
  store.addReducer<{ id: string; color: string }>("SET_COLOR", (state, payload) => {
    // add or replace vlak
    if (!state.vlakken.find((v) => v.id === payload.id)) {
      return { ...state, vlakken: [...state.vlakken, payload] };
    }
    // replace color
    return { ...state, vlakken: state.vlakken.map((v) => (v.id === payload.id ? { ...v, color: payload.color } : v)) };
  });
  return store;
}

export type StateModel = {
  vlakken: Vlak[];
};
