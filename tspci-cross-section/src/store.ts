import { Store } from "@citolab/preact-store";
import type { EdgePoint, PlaneParams } from "./geometry";

export type Hide = "none" | "above" | "below";
export type InputMode = "sliders" | "points";

export type StateModel = {
  /** the plane the candidate set */
  plane: PlaneParams;
  /** true once the candidate moved the plane: before that there is no response */
  changed: boolean;
  hide: Hide;
  input: InputMode;
  /** the three points on edges (P, Q, R), when the candidate set the plane with them */
  points: (EdgePoint | null)[];
  /** the shapes the candidate made, in order (tool mode reports them) */
  found: string[];
};

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  SET_PLANE: { plane: PlaneParams; shape: string };
  SET_POINTS: { points: (EdgePoint | null)[]; plane: PlaneParams | null; shape: string };
  SET_HIDE: { hide: Hide };
  SET_INPUT: { input: InputMode };
};

const remember = (found: string[], shape: string) => (shape && shape !== "none" && !found.includes(shape) ? [...found, shape] : found);

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // a plane set with the sliders or the handles: the three points no longer lie in it
  store.addReducer("SET_PLANE", (state, { plane, shape }) => ({ ...state, plane, points: [null, null, null], changed: true, found: remember(state.found, shape) }));
  store.addReducer("SET_POINTS", (state, { points, plane, shape }) =>
    plane ? { ...state, points, plane, changed: true, found: remember(state.found, shape) } : { ...state, points });
  store.addReducer("SET_HIDE", (state, { hide }) => ({ ...state, hide }));
  store.addReducer("SET_INPUT", (state, { input }) => ({ ...state, input }));
  return store;
};

const num = (x: unknown) => typeof x === "number" && isFinite(x);

/** A saved state, checked: null when it is not one of this PCI. */
export const validState = (s: any): StateModel | null => {
  if (!s || typeof s !== "object" || !s.plane || ![s.plane.offset, s.plane.tilt, s.plane.turn].every(num)) return null;
  const points = Array.isArray(s.points) ? s.points.slice(0, 3).map((p: any) => (p && num(p.edge) && num(p.at) ? { edge: p.edge, at: p.at } : null)) : [];
  while (points.length < 3) points.push(null);
  return {
    plane: { offset: s.plane.offset, tilt: s.plane.tilt, turn: s.plane.turn },
    changed: s.changed !== false,
    hide: ["none", "above", "below"].includes(s.hide) ? s.hide : "none",
    input: s.input === "points" ? "points" : "sliders",
    points,
    found: Array.isArray(s.found) ? s.found.filter((x: unknown) => typeof x === "string") : [],
  };
};
