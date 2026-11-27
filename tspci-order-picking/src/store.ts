import { Store } from "@citolab/preact-store";
import { PickState, Verdict } from "./picking";

/**
 * The state of the PCI: what the pupil did (picking.ts PickState) and the warehouse it belongs to. Every change goes
 * through an action (store.dispatch), and the store keeps the list of actions: getState() saves both, so a session can
 * be restored, and even replayed (store.replay), action by action.
 * - key: the warehouse and task the state belongs to (picking.ts layoutKey); a saved state of another is not restored
 */
export type StateModel = PickState & { key: string };

/** The actions, as { type: payload }: dispatch and addReducer only accept these. */
export type Actions = {
  /** Walk to a rack ("A-03"). */
  GO: { rack: string };
  /** Take one (+1) from a location into the roll cage, or put one back (−1); `max` is what the shelf holds. */
  TAKE: { loc: string; delta: 1 | -1; max: number };
  TICK: { line: number; on: boolean };
  SHORT: { line: number; on: boolean };
  /** The pupil's check of a tote (check task). */
  VERDICT: { line: number; verdict: Verdict | "" };
  /** The answer of a response read back (setResponse, boundTo, status "solution"). */
  SET: Partial<PickState>;
};

const toggle = (list: number[], line: number, on: boolean) =>
  on ? (list.includes(line) ? list : [...list, line].sort((a, b) => a - b)) : list.filter((l) => l !== line);

export const initStore = (state: StateModel) => {
  const store = new Store<StateModel, Actions>(state);
  store.addReducer("GO", (current, { rack }) =>
    current.walk[current.walk.length - 1] === rack ? current : { ...current, walk: [...current.walk, rack] }
  );
  store.addReducer("TAKE", (current, { loc, delta, max }) => {
    const now = current.cart[loc] ?? 0;
    const next = Math.max(0, Math.min(max, now + delta));
    if (next === now) return current;
    const cart = { ...current.cart, [loc]: next };
    if (next === 0) delete cart[loc];
    return { ...current, cart };
  });
  store.addReducer("TICK", (current, { line, on }) => ({ ...current, ticked: toggle(current.ticked, line, on) }));
  store.addReducer("SHORT", (current, { line, on }) => ({ ...current, short: toggle(current.short, line, on) }));
  store.addReducer("VERDICT", (current, { line, verdict }) => ({
    ...current,
    verdicts: current.verdicts.map((v, i) => (i === line - 1 ? verdict : v)),
  }));
  store.addReducer("SET", (current, payload) => ({ ...current, ...payload }));
  return store;
};
