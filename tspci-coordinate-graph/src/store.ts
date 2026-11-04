// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/graphLineAndPointInteraction,
// © 2014-2017 Parcc, Inc. (Open Assessment Technologies, for Parcc, Inc.)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import { GraphState, Point, Settings, addPoint, clearElement, movePoint, removePoint, setDashed, toggleRegion } from "./model";

export type StateModel = GraphState;

/** The actions, as { type: payload }: dispatch and addReducer only accept these. The log keeps every one. */
export type Actions = {
  /** A point for an element; when it has all its points, its last point moves there. */
  ADD_POINT: { id: string } & Point;
  MOVE_POINT: { id: string; index: number } & Point;
  REMOVE_POINT: { id: string; index: number };
  CLEAR: { id: string };
  /** A line, segment or ray: solid or dashed. */
  SET_DASHED: { id: string; dashed: boolean };
  /** A solution set: shade or unshade the area around this point. */
  TOGGLE_REGION: { id: string } & Point;
  /** setResponse or review: a whole state at once. */
  RESTORE: GraphState;
};

export type Action = { [K in keyof Actions]: { type: K; payload: Actions[K] } }[keyof Actions];
export type Dispatch = <K extends keyof Actions>(type: K, payload: Actions[K]) => void;

/** What an action does to a state, with the model (model.ts): the store's reducers, and the authoring mode's. */
export const applyAction = (s: Settings, state: GraphState, action: Action): GraphState => {
  const p = action.payload as any;
  switch (action.type) {
    case "ADD_POINT": return addPoint(s, state, p.id, { x: p.x, y: p.y })?.state ?? state;
    case "MOVE_POINT": return movePoint(s, state, p.id, p.index, { x: p.x, y: p.y }) ?? state;
    case "REMOVE_POINT": return removePoint(s, state, p.id, p.index);
    case "CLEAR": return clearElement(s, state, p.id);
    case "SET_DASHED": return setDashed(s, state, p.id, p.dashed);
    case "TOGGLE_REGION": return toggleRegion(s, state, p.id, { x: p.x, y: p.y })?.state ?? state;
    case "RESTORE": return p;
  }
};

export const initStore = (initialState: StateModel, settings: () => Settings) => {
  const store = new Store<StateModel, Actions>(initialState);
  for (const type of ["ADD_POINT", "MOVE_POINT", "REMOVE_POINT", "CLEAR", "SET_DASHED", "TOGGLE_REGION", "RESTORE"] as (keyof Actions)[]) {
    store.addReducer(type, (state, payload) => applyAction(settings(), state, { type, payload } as Action));
  }
  return store;
};
