import { useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import FormView, { Theme } from "./formView";
import { Form, say } from "./form";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

/** The situation or letter with the information to use, as a note above the form. */
export const Situation = ({ text, texts, paper }: { text: string; texts: Texts; paper: boolean }) =>
  text ? (
    <aside aria-label={texts.information} data-testid="situation"
      className={`max-w-[75ch] border-l-4 px-4 py-3 text-[15px] leading-relaxed ${paper ? "border-amber-600 bg-amber-50 text-stone-800" : "rounded-r-xl border-sky-600 bg-sky-50 text-slate-800"}`}>
      {text.split("\n").map((line, i) => <p key={i} className="m-0">{line}</p>)}
    </aside>
  ) : null;

// The candidate's view: the instruction, the situation and the form; a live status line for what changed.
const Interaction = ({ prompt, form, store, texts, language, theme, columns, validation, readOnly }: {
  prompt: string;
  form: Form;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  language: string;
  theme: Theme;
  columns: 1 | 2;
  validation: boolean;
  readOnly: boolean;
}) => {
  const { values } = useStore(store);
  const [status, setStatus] = useState("");
  return (
    <div className="flex max-w-[960px] flex-col gap-3 font-sans text-slate-800" lang={language}>
      {prompt && <p className="m-0 max-w-[75ch] text-[15px] text-slate-700" data-testid="prompt">{prompt}</p>}
      <Situation text={say(form.situation, language)} texts={texts} paper={theme === "paper"} />
      <FormView form={form} values={values} language={language} texts={texts} theme={theme} columns={columns} validation={validation} readOnly={readOnly}
        onChange={(id, value) => store.dispatch({ type: "SET_VALUE", payload: { id, value } })} announce={setStatus} />
      <p role="status" aria-live="polite" className="sr-only" data-testid="status">{status}</p>
    </div>
  );
};

export default Interaction;
