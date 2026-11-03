// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/brainstorm, © openPCI (Aarhus University and Aalborg
// University): Elias J.T. Hansen, Anna Rusmann & Jeppe Bundsgaard
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

import { IStore } from "@citolab/preact-store";
import { BotLine, timestamp } from "./script";
import { Actions, StateModel } from "./store";

/** The bots wait while the candidate types, and go on this long after the last key press (the original: 3 s). */
export const PAUSE_AFTER_TYPING = 3000;
/** A bot "is typing" this long before its message appears. */
export const TYPING_LEAD = 1500;
const TICK = 100;

/**
 * The clock of the brainstorm, as in the original: the time limit runs from the start; a bot's message appears
 * `delay` seconds into the bots' clock, which stops while the candidate types. The clocks are not in the store (it
 * would tell the delivery system ten times a second), but getState() saves them so a resumed attempt goes on.
 */
export class Session {
  elapsed = 0;
  botClock = 0;
  private lastKey = -Infinity;
  private timer: number | undefined;
  private last = 0;
  private listeners = new Set<() => void>();

  constructor(
    private store: IStore<StateModel, Actions>,
    private script: BotLine[],
    private timeLimit: number, // seconds
    private nickname: string
  ) {
    const s = store.getState();
    this.elapsed = s.elapsed ?? 0;
    this.botClock = s.botClock ?? 0;
  }

  get phase() {
    return this.store.getState().phase;
  }

  /** 1 at the start, 0 when the time is up. */
  get remaining() {
    return Math.max(0, 1 - this.elapsed / (this.timeLimit * 1000));
  }

  get secondsLeft() {
    return Math.max(0, Math.ceil(this.timeLimit - this.elapsed / 1000));
  }

  get paused() {
    return this.elapsed - this.lastKey < PAUSE_AFTER_TYPING;
  }

  /** The bots whose message is about to appear. */
  get typing(): BotLine[] {
    if (this.phase !== "running" || this.paused) return [];
    const delivered = this.store.getState().delivered;
    const names = new Set<string>();
    return this.script.filter((b) => {
      const due = b.delay * 1000 - this.botClock;
      if (delivered.includes(b.index) || due > TYPING_LEAD || names.has(b.name)) return false;
      names.add(b.name);
      return true;
    });
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start = () => {
    if (this.phase === "waiting") this.store.dispatch({ type: "START", payload: null });
    this.resume();
  };

  /** Go on after a restore: the clocks continue where they were. */
  resume = () => {
    if (this.phase !== "running" || this.timer !== undefined) return;
    this.last = performance.now();
    this.timer = window.setInterval(this.tick, TICK);
    this.tick();
  };

  stop = () => {
    window.clearInterval(this.timer);
    this.timer = undefined;
  };

  /** A key press in the message box: the bots wait. */
  keyPressed = () => {
    this.lastKey = this.elapsed;
    this.notify();
  };

  say = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || this.phase !== "running") return;
    this.store.dispatch({
      type: "SAY",
      payload: { entry: { time: timestamp(this.elapsed / 1000), name: this.nickname, text: trimmed, player: true } },
    });
  };

  private tick = () => {
    const now = performance.now();
    const dt = Math.min(now - this.last, 1000); // a tab in the background does not jump the clock
    this.last = now;
    this.elapsed += dt;
    if (!this.paused) this.botClock += dt;

    const delivered = this.store.getState().delivered;
    for (const b of this.script) {
      if (b.delay * 1000 <= this.botClock && !delivered.includes(b.index)) {
        // the original stamps a bot message with its scripted time
        this.store.dispatch({
          type: "SAY",
          payload: { entry: { time: timestamp(b.delay), name: b.name, text: b.text, player: false, color: b.color }, bot: b.index },
        });
      }
    }
    if (this.elapsed >= this.timeLimit * 1000) {
      this.elapsed = this.timeLimit * 1000;
      this.stop();
      this.store.dispatch({ type: "END", payload: null });
    }
    this.notify();
  };

  private notify = () => this.listeners.forEach((l) => l());
}
