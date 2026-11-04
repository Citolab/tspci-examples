// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/MaraisSalantpci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import { Container, Result } from "./model";
import { Settings, checkContainer, num } from "./settings";

export type Phase = "setup" | "running" | "paused" | "done";
export const SPEEDS = [1, 2, 4] as const;

/** A run of the experiment: the containers, how long it ran and what it showed. */
export type Run = {
  containers: Container[];
  /** hours on the clock when it ended */
  hours: number;
  /** true: it ran to the end (the duration, or every container dry); false: reset before that */
  completed: boolean;
  results: Result[];
};

export type StateModel = {
  containers: Container[];
  phase: Phase;
  /** hours on the clock; while running only committed at a pause, the end or a reset (the live value is the clock's) */
  elapsed: number;
  speed: number;
  /** every run, completed or reset halfway, oldest first */
  runs: Run[];
  /** the candidate changed a setting or started the experiment */
  touched: boolean;
};

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** The candidate changed a setting of a container. */
  SET: { index: number; key: keyof Container; value: number | boolean };
  START: {};
  PAUSE: { elapsed: number };
  RESUME: {};
  /** The clock reached the end (or every container is dry). */
  FINISH: { elapsed: number; results: Result[] };
  /** Back to the start; a run that had started is logged as not completed. */
  RESET: { elapsed: number; results: Result[] | null };
  SPEED: { speed: number };
  /** setResponse / a state: a whole state at once. */
  RESTORE: StateModel;
};

/** At most this many runs in the state and the response; the log keeps every action. */
export const MAX_RUNS = 100;

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("SET", (state, { index, key, value }) => {
    if (state.phase !== "setup" || !state.containers[index]) return state;
    const containers = state.containers.map((c, i) => (i === index ? { ...c, [key]: value } : c));
    return { ...state, containers, touched: true };
  });
  store.addReducer("START", (state) => (state.phase === "setup" ? { ...state, phase: "running", elapsed: 0, touched: true } : state));
  store.addReducer("PAUSE", (state, { elapsed }) => (state.phase === "running" ? { ...state, phase: "paused", elapsed } : state));
  store.addReducer("RESUME", (state) => (state.phase === "paused" ? { ...state, phase: "running" } : state));
  store.addReducer("FINISH", (state, { elapsed, results }) => {
    if (state.phase !== "running" && state.phase !== "paused") return state;
    const run: Run = { containers: state.containers, hours: elapsed, completed: true, results };
    return { ...state, phase: "done", elapsed, runs: [...state.runs, run].slice(-MAX_RUNS) };
  });
  store.addReducer("RESET", (state, { elapsed, results }) => {
    const unfinished = (state.phase === "running" || state.phase === "paused") && elapsed > 0 && results;
    const runs = unfinished ? [...state.runs, { containers: state.containers, hours: elapsed, completed: false, results }].slice(-MAX_RUNS) : state.runs;
    return { ...state, phase: "setup", elapsed: 0, runs };
  });
  store.addReducer("SPEED", (state, { speed }) => ({ ...state, speed }));
  store.addReducer("RESTORE", (_state, next) => next);
  return store;
};

export const initialState = (s: Settings): StateModel => ({
  containers: s.start.map((c) => ({ ...c })),
  phase: "setup",
  elapsed: 0,
  speed: 1,
  runs: [],
  touched: false,
});

const validResult = (r: any): Result => {
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
  return { dryAfter: n(r?.dryAfter), crystalsFrom: n(r?.crystalsFrom), volumeLeft: n(r?.volumeLeft) ?? 0, crystals: n(r?.crystals) ?? 0 };
};

/**
 * Containers from a state or a response, checked against the settings: as many as the settings have, each value on a
 * step of its range, and the fixed value where the candidate cannot change it (the author's start value there).
 */
export const validContainers = (s: Settings, list: unknown): Container[] =>
  s.start.map((start, i) => {
    const c = Array.isArray(list) ? list[i] : null;
    const checked = checkContainer(c, s, start, true);
    // what the candidate cannot change stays at the author's start value
    for (const key of ["temperature", "width", "salt", "volume", "wind"] as const) {
      const variable = key === "width" ? "area" : key;
      if (!s.canChange[variable]) (checked as any)[key] = start[key];
    }
    return checked;
  });

/** A state from getState() or a response, checked; null when it is not one of this PCI. */
export const validState = (s: Settings, value: any): StateModel | null => {
  if (!value || typeof value !== "object" || !Array.isArray(value.containers)) return null;
  const phase: Phase = ["setup", "running", "paused", "done"].includes(value.phase) ? value.phase : "setup";
  const elapsed = Math.min(s.duration, Math.max(0, num(value.elapsed) ?? 0));
  const runs: Run[] = Array.isArray(value.runs)
    ? value.runs
        .filter((r: any) => r && Array.isArray(r.containers))
        .map((r: any) => ({
          containers: r.containers.map((c: any) => checkContainer(c, s, s.fixed, true)),
          hours: Math.max(0, num(r.hours) ?? 0),
          completed: r.completed === true,
          results: Array.isArray(r.results) ? r.results.map(validResult) : [],
        }))
        .slice(-MAX_RUNS)
    : [];
  return {
    containers: validContainers(s, value.containers),
    // a run that was going when the candidate left comes back paused
    phase: phase === "running" ? "paused" : phase,
    elapsed: phase === "setup" ? 0 : elapsed,
    speed: (SPEEDS as readonly number[]).includes(value.speed) ? value.speed : 1,
    runs,
    touched: value.touched === true || runs.length > 0,
  };
};
