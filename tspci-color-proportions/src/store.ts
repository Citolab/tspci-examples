import { Store } from "@citolab/preact-store";

export type Vlak = { id: string; color: string };
/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = { SET_COLOR: Vlak; CLEAR_COLOR: { id: string }; CLEAR_ALL: null };

export const initStore = (initialState: StateModel, restoreData?: {
  state: StateModel;
  actions: { type: string; payload: any; timestamp?: number }[];
}) => {
  const store = new Store<StateModel, Actions>(initialState, restoreData);
  store.addReducer("SET_COLOR", (state, payload) => {
    // add or replace vlak
    if (!state.vlakken.find((v) => v.id === payload.id)) {
      return { ...state, vlakken: [...state.vlakken, payload] };
    }
    // replace color
    return { ...state, vlakken: state.vlakken.map((v) => (v.id === payload.id ? { ...v, color: payload.color } : v)) };
  });
  // the eraser: the shape is white again (not coloured, so it is not in the response)
  store.addReducer("CLEAR_COLOR", (state, payload) => ({ ...state, vlakken: state.vlakken.filter((v) => v.id !== payload.id) }));
  store.addReducer("CLEAR_ALL", (state) => ({ ...state, vlakken: [] }));
  return store;
}

export type StateModel = {
  vlakken: Vlak[];
};
