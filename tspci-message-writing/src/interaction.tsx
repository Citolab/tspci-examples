import { IStore, useStore } from "@citolab/preact-store";
import { useState } from "preact/hooks";
import { ChatApp } from "./chat";
import { Env, localIso } from "./context";
import { EmailClient } from "./email";
import { Environment, Scenario, WritingLanguage } from "./message";
import { PostBoard } from "./post";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the task, the environment (email, chat or post), and a status line for screen readers.

export type InteractionProps = {
  prompt: string;
  environment: Environment;
  scenario: Scenario;
  store: IStore<StateModel, Actions>;
  t: Texts;
  ui: string;
  lang: WritingLanguage;
  spellcheckMode: string;
  showCount: boolean;
  readOnly: boolean;
  chatDelay: number;
  seen: number;
  elapsed: () => number;
  model?: boolean;
};

const Interaction = (props: InteractionProps) => {
  const { prompt, environment, scenario, store, t } = props;
  const state = useStore(store);
  const [status, setStatus] = useState("");
  const part = scenario[environment];
  const task = prompt.trim() || part.task;
  const mode = props.spellcheckMode;
  const env: Env = {
    scenario, store, state, t, ui: props.ui, lang: props.lang, limits: part.limits,
    spellcheck: mode === "on" || (mode === "toggle" && state.spellcheck),
    spell: mode === "toggle" && !props.readOnly
      ? { on: state.spellcheck, onChange: (on) => { store.dispatch({ type: "SPELLCHECK", payload: { on } }); setStatus(on ? t.spellcheckOn : t.spellcheckOff); } }
      : undefined,
    showCount: props.showCount, readOnly: props.readOnly, elapsed: props.elapsed, now: () => localIso(), chatDelay: props.chatDelay, seen: props.seen,
    // the same text twice is not announced again: add an invisible change
    announce: (message) => setStatus((old) => (old === message ? `${message} ` : message)),
  };
  return (
    <div className="flex w-full max-w-[60rem] flex-col gap-3 font-sans text-slate-800" lang={props.ui} data-environment={environment}>
      {task && (
        <section aria-labelledby="task-title" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span aria-hidden="true" className="text-xl leading-6">📝</span>
          <div className="flex flex-col gap-1">
            <h2 id="task-title" className="m-0 text-[13px] font-semibold uppercase tracking-wide text-amber-900">{props.model ? `${t.task} · ${t.model}` : t.task}</h2>
            <p className="m-0 max-w-[75ch] text-[15px] leading-relaxed text-slate-800" data-testid="prompt">{task}</p>
          </div>
        </section>
      )}
      {environment === "email" ? <EmailClient env={env} /> : environment === "chat" ? <ChatApp env={env} /> : <PostBoard env={env} />}
      <p role="status" className="sr-only" data-testid="status">{status}</p>
    </div>
  );
};

export default Interaction;
