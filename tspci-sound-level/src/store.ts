import { Store } from "@citolab/preact-store";

/** A setting the candidate stopped at: the power and the distance, in the units of the item. */
export type Try = { power: number; distance: number };

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** The candidate changed the power or the distance (and let go of the slider): the new setting, and what changed. */
  TRY: { power?: number; distance?: number; tried: Try };
  /** setResponse: a whole state at once. */
  RESTORE: StateModel;
};

/** At most this many tries in the response; the log keeps them all. */
export const MAX_TRIES = 500;

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("TRY", (state, { power, distance, tried }) => {
    const last = state.tried[state.tried.length - 1];
    const same = last && last.power === tried.power && last.distance === tried.distance;
    return {
      power: power ?? state.power,
      distance: distance ?? state.distance,
      tried: same ? state.tried : [...state.tried, tried].slice(-MAX_TRIES),
    };
  });
  store.addReducer("RESTORE", (_state, next) => next);
  return store;
};

export type StateModel = {
  /** The power the candidate chose; null: they did not, so the setting's. */
  power: number | null;
  /** The distance the candidate chose; null: they did not, so the setting's. */
  distance: number | null;
  /** Every setting the candidate stopped at, in order (the same setting twice in a row once). */
  tried: Try[];
};

/** A state from getState() or a response, checked: numbers or null, tries with two numbers. */
export const validState = (value: any): StateModel | null => {
  if (!value || typeof value !== "object") return null;
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
  const tried = Array.isArray(value.tried)
    ? value.tried
        .map((t: any) => ({ power: n(t?.power), distance: n(t?.distance) }))
        .filter((t: { power: number | null; distance: number | null }) => t.power !== null && t.distance !== null)
    : [];
  return { power: n(value.power), distance: n(value.distance), tried };
};
