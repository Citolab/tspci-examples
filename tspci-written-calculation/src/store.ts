import { Store } from "@citolab/preact-store";
import { ChunkRow, MAX_CHUNKS, MIN_CHUNKS, Work } from "./calculation";

/**
 * The state of the PCI: the pupil's working, every box as typed. Every change goes through an action
 * (store.dispatch), and the store keeps the list of actions: getState() saves both, so a session can be restored.
 */
export type StateModel = { work: Work };

/** The boxes outside the rows. */
export type Field = "factorTotal" | "total" | "answer" | "remainder";

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  SET_CHUNK: { index: number; field: keyof ChunkRow; value: string };
  ADD_CHUNK: Record<string, never>;
  REMOVE_CHUNK: Record<string, never>;
  SET_PARTIAL: { index: number; value: string };
  SET_FIELD: { field: Field; value: string };
};

const setAt = <T,>(list: T[], index: number, value: T) => list.map((item, i) => (i === index ? value : item));

export const initStore = (state: StateModel) => {
  const store = new Store<StateModel, Actions>(state);
  const work = (current: StateModel, change: Partial<Work>): StateModel => ({ work: { ...current.work, ...change } });
  store.addReducer("SET_CHUNK", (current, { index, field, value }) =>
    index < 0 || index >= current.work.chunks.length
      ? current
      : work(current, { chunks: setAt(current.work.chunks, index, { ...current.work.chunks[index], [field]: value }) })
  );
  store.addReducer("ADD_CHUNK", (current) =>
    current.work.chunks.length >= MAX_CHUNKS ? current : work(current, { chunks: [...current.work.chunks, { bite: "", factor: "", rest: "" }] })
  );
  store.addReducer("REMOVE_CHUNK", (current) =>
    current.work.chunks.length <= MIN_CHUNKS ? current : work(current, { chunks: current.work.chunks.slice(0, -1) })
  );
  store.addReducer("SET_PARTIAL", (current, { index, value }) =>
    index < 0 || index >= current.work.partials.length ? current : work(current, { partials: setAt(current.work.partials, index, value) })
  );
  store.addReducer("SET_FIELD", (current, { field, value }) => work(current, { [field]: value }));
  return store;
};
