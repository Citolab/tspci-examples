// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Trainpci and
// https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Relatempci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { Store } from "@citolab/preact-store";
import { FRAMES, FrameId, POINTS, PointId } from "./model";
import { RATES } from "./settings";

export type StateModel = {
  /** the point of view the candidate chose */
  frame: FrameId;
  /** the points whose trajectory is drawn */
  traced: PointId[];
  /** the time where the animation stopped (pause, step, slider, end): restored with the state */
  time: number;
  rate: number;
  /** "frame:" for every frame the candidate saw move, "frame:point" for every trace they saw in it */
  seen: string[];
  /** question id → the candidate's answer */
  answers: Record<string, string>;
};

/** The actions, as { type: payload }: dispatch and addReducer only accept these. They are the event log too. */
export type Actions = {
  FRAME: { frame: FrameId };
  TRACE: { traced: PointId[] };
  /** play: false when the animation stopped (pause, step, slider, end, reset) */
  TIME: { time: number; how: "pause" | "step" | "seek" | "end" | "reset" | "play" };
  RATE: { rate: number };
  /** something new seen: added to seen */
  SEEN: { entries: string[] };
  ANSWER: { id: string; value: string };
  /** setResponse */
  RESTORE: StateModel;
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  store.addReducer("FRAME", (state, { frame }) => ({ ...state, frame }));
  store.addReducer("TRACE", (state, { traced }) => ({ ...state, traced }));
  store.addReducer("TIME", (state, { time }) => ({ ...state, time }));
  store.addReducer("RATE", (state, { rate }) => ({ ...state, rate }));
  store.addReducer("SEEN", (state, { entries }) => ({ ...state, seen: [...state.seen, ...entries.filter((e) => !state.seen.includes(e))] }));
  store.addReducer("ANSWER", (state, { id, value }) => ({ ...state, answers: { ...state.answers, [id]: value } }));
  store.addReducer("RESTORE", (_state, next) => next);
  return store;
};

/** A state from getState(), checked; null when it is not one. */
export const validState = (value: any, fallback: StateModel): StateModel | null => {
  if (!value || typeof value !== "object") return null;
  const frame = FRAMES.find((f) => f === value.frame) ?? fallback.frame;
  const traced = Array.isArray(value.traced) ? POINTS.filter((p) => value.traced.includes(p)) : fallback.traced;
  const time = typeof value.time === "number" && isFinite(value.time) && value.time >= 0 ? value.time : 0;
  const rate = RATES.find((r) => r === value.rate) ?? fallback.rate;
  const seen = Array.isArray(value.seen) ? value.seen.filter((e: unknown) => typeof e === "string" && /^[a-z]+:[a-z]*$/.test(e)) : [];
  const answers: Record<string, string> = {};
  if (value.answers && typeof value.answers === "object") {
    for (const [k, v] of Object.entries(value.answers)) if (typeof v === "string") answers[k] = v;
  }
  return { frame, traced, time, rate, seen, answers };
};
