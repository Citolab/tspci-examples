import { Store } from "@citolab/preact-store";
import { Placement } from "./planner";
import { RawAnswer, Shift } from "./rota";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  SET_PLACEMENTS: { placements: Placement[] };
  SET_SHIFTS: { shifts: Shift[] };
  SET_ANSWER: { index: number; answer: RawAnswer | null };
  SET_BOX: { kind: "hours" | "pay"; index: number; text: string };
};

export const initStore = (initialState: StateModel) => {
  const store = new Store<StateModel, Actions>(initialState);
  // placing, moving, resizing, removing, undo and start again all set the placements; the log keeps every step
  store.addReducer("SET_PLACEMENTS", (state, { placements }) => ({ ...state, placements }));
  // the rota modes: the shifts, an answer to a question, a box of hours or pay
  store.addReducer("SET_SHIFTS", (state, { shifts }) => ({ ...state, shifts }));
  store.addReducer("SET_ANSWER", (state, { index, answer }) => {
    const answers = Array.from({ length: Math.max(index + 1, state.answers?.length ?? 0) }, (_, i) => state.answers?.[i] ?? null);
    answers[index] = answer;
    return { ...state, answers };
  });
  store.addReducer("SET_BOX", (state, { kind, index, text }) => {
    const list = Array.from({ length: Math.max(index + 1, state[kind]?.length ?? 0) }, (_, i) => state[kind]?.[i] ?? "");
    list[index] = text;
    return { ...state, [kind]: list };
  });
  return store;
};

export type StateModel = {
  /** The tasks the candidate planned: task, resource, day, start and end (minutes since midnight). */
  placements: Placement[];
  /** The rota modes: the shifts the candidate made (makeRota, an own rota in hoursAndPay). */
  shifts?: Shift[];
  /** readRota: what the candidate typed or tapped per question. */
  answers?: (RawAnswer | null)[];
  /** hoursAndPay: what the candidate typed per employee. */
  hours?: string[];
  pay?: string[];
};
