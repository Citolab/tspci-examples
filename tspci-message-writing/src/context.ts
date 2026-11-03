import { IStore } from "@citolab/preact-store";
import type { Limits, Scenario, WritingLanguage } from "./message";
import type { Actions, StateModel } from "./store";
import type { Texts } from "./texts";

/** What every environment gets from the interaction. */
export type Env = {
  scenario: Scenario;
  store: IStore<StateModel, Actions>;
  state: StateModel;
  t: Texts;
  /** the screen's language (en, nl): dates */
  ui: string;
  /** the language the candidate writes in: lang and spellcheck of the text boxes */
  lang: WritingLanguage;
  limits: Limits;
  /** whether the browser checks the spelling now */
  spellcheck: boolean;
  /** the switch, when the candidate may turn it on and off */
  spell?: { on: boolean; onChange: (on: boolean) => void };
  showCount: boolean;
  readOnly: boolean;
  /** seconds spent so far, over every session */
  elapsed: () => number;
  /** now, as local ISO time */
  now: () => string;
  announce: (message: string) => void;
  chatDelay: number;
  /** the messages of the chat the candidate has seen before (they do not arrive again) */
  seen: number;
};

/** Now as local time without a zone, "2026-11-03T10:15:00": the scenario's dates are local too. */
export const localIso = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
