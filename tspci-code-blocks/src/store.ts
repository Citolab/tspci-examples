// SPDX-License-Identifier: MIT
// Based on https://github.com/rdncuee/CBP (Code Block Programming Interaction),
// © 2022 The National Center for University Entrance Examinations
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import {
  type CodeState, type Position, type Settings, addBlock, indent, moveBy, moveNode, outdent, removeNode, runProgram, setValue,
} from "./blocks";

export type StateModel = CodeState;

/** The actions, as { type: payload }: dispatch and addReducer only accept these. The log keeps every one. */
export type Actions = {
  /** A block of the palette into the program. */
  ADD: { block: string; position: Position };
  /** A block of the program to another position (drag and drop). */
  MOVE: { id: string; position: Position };
  /** One line up (-1) or down (+1): the arrow keys. */
  MOVE_BY: { id: string; delta: -1 | 1 };
  INDENT: { id: string };
  OUTDENT: { id: string };
  REMOVE: { id: string };
  /** What the candidate typed or chose in a blank. */
  SET_VALUE: { id: string; slot: number; value: string };
  SET_INPUTS: { value: string };
  /** Runs the program with the input; the output (or the error) is kept until the next change. */
  RUN: Record<string, never>;
  /** Back to the starting program. */
  RESET: Record<string, never>;
  /** setResponse or review: a whole state at once. */
  RESTORE: CodeState;
};

/** A change to the program: the last run no longer belongs to it. */
const program = (state: CodeState, next: CodeState["program"] | null, extra: Partial<CodeState> = {}): CodeState =>
  next ? { ...state, ...extra, program: next, run: null } : state;

export const initStore = (initialState: StateModel, settings: () => Settings) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("ADD", (state, { block, position }) =>
    program(state, addBlock(settings(), state.program, block, position, `n${state.next}`), { next: state.next + 1 }));
  store.addReducer("MOVE", (state, { id, position }) => program(state, moveNode(settings(), state.program, id, position)));
  store.addReducer("MOVE_BY", (state, { id, delta }) => program(state, moveBy(settings(), state.program, id, delta)));
  store.addReducer("INDENT", (state, { id }) => program(state, indent(settings(), state.program, id)));
  store.addReducer("OUTDENT", (state, { id }) => program(state, outdent(settings(), state.program, id)));
  store.addReducer("REMOVE", (state, { id }) => program(state, removeNode(state.program, id)));
  store.addReducer("SET_VALUE", (state, { id, slot, value }) => program(state, setValue(state.program, id, slot, String(value).slice(0, 200))));
  store.addReducer("SET_INPUTS", (state, { value }) => ({ ...state, inputs: String(value).slice(0, 2000), run: null }));
  store.addReducer("RUN", (state) => ({ ...state, run: { inputs: state.inputs, ...runProgram(settings(), state.program, state.inputs) } }));
  store.addReducer("RESET", () => initialState);
  store.addReducer("RESTORE", (_state, next) => next);
  return store;
};
