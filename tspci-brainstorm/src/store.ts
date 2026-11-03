// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/brainstorm, © openPCI (Aarhus University and Aalborg
// University): Elias J.T. Hansen, Anna Rusmann & Jeppe Bundsgaard
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import { Entry } from "./script";

export type Phase = "waiting" | "running" | "ended";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  START: null;
  /** A message: from a bot (`bot`: its line in the script) or from the candidate. */
  SAY: { entry: Entry; bot?: number };
  END: null;
  /** A response handed over by the delivery system: shown, read-only. */
  SHOW: { log: Entry[] };
};

export type StateModel = {
  phase: Phase;
  log: Entry[];
  /** The script lines (their line index) that are in the chat already. */
  delivered: number[];
  /** ms since the start, and ms of the bots' clock (it stops while the candidate types); saved by getState(). */
  elapsed: number;
  botClock: number;
};

export const initialState: StateModel = { phase: "waiting", log: [], delivered: [], elapsed: 0, botClock: 0 };

export const initStore = (state: StateModel = initialState) => {
  const store = new Store<StateModel, Actions>(state);
  store.addReducer("START", (s) => ({ ...s, phase: "running" }));
  store.addReducer("SAY", (s, { entry, bot }) => ({
    ...s,
    log: [...s.log, entry],
    delivered: bot === undefined ? s.delivered : [...s.delivered, bot],
  }));
  store.addReducer("END", (s) => ({ ...s, phase: "ended" }));
  store.addReducer("SHOW", (s, { log }) => ({ ...s, phase: "ended", log, delivered: [] }));
  return store;
};
