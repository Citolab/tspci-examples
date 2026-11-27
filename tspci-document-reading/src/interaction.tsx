import type { PciProperties } from "@citolab/tspci";
import { IStore, useStore } from "@citolab/preact-store";
import { useState } from "preact/hooks";
import configProps from "./config.json";
import { Model, parseNumber } from "./documents";
import { DocumentView, Mark } from "./documentView";
import { Actions, StateModel } from "./store";
import { textsFor } from "./texts";

type PropTypes = PciProperties<typeof configProps>;

type Props = {
  config: PropTypes;
  model: Model;
  store: IStore<StateModel, Actions>;
  readOnly: boolean; // review, solution, closed: show what was done, but do not change it
  /** unique on the page: several instances each get their own ids */
  uid: string;
};

/** The title, the question, the answer box (answer), the document, and what the pupil marked. */
const Interaction = ({ config, model, store, readOnly, uid }: Props) => {
  const { marked, typed } = useStore(store); // re-renders when the store changes
  const t = textsFor(model.language);
  const [message, setMessage] = useState("");
  const { task, doc } = model;
  const mark: Mark = task === "find" ? "chosen" : task === "check" ? "mistake" : "source";
  const tappable = !readOnly && (task !== "answer" || model.markSource);

  const onTap = (id: string) => {
    const field = doc.byId[id];
    const has = marked.includes(id);
    store.dispatch({ type: "TAP", payload: { field: id, many: task === "check" } });
    const label = field?.label ?? id;
    if (task === "find") setMessage(has ? t.unchosen : t.chosen(label));
    else if (task === "check") setMessage(`${has ? t.unmarkedMistake(label) : t.markedMistake(label)}. ${t.markedCount(marked.length + (has ? -1 : 1))}`);
    else setMessage(has ? t.sourceUnmarked : t.sourceMarked(label));
  };

  const invalid = typed.trim() !== "" && parseNumber(typed, model.language) === null;
  const questionId = `${uid}-question`;
  const errorId = `${uid}-error`;

  return (
    <div className="font-sans text-ink">
      {config.title?.trim() && <h2 className="mb-2 text-[1.5em] leading-tight font-bold">{config.title}</h2>}
      <p id={questionId} className="question">
        {model.question}
      </p>
      {task === "answer" && (
        <div className="answer-row">
          <label htmlFor={`${uid}-answer`} className="font-semibold">
            {t.yourAnswer}
            {model.unit && <span className="sr-only">{` (${model.unit})`}</span>}
          </label>
          <span className="answer-box">
            {model.unit && model.unitBefore && <span aria-hidden="true">{model.unit}</span>}
            <input
              id={`${uid}-answer`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="answer-input"
              data-answer=""
              value={typed}
              disabled={readOnly}
              aria-describedby={`${questionId}${invalid ? ` ${errorId}` : ""}`}
              aria-invalid={invalid}
              onInput={(e) => store.dispatch({ type: "TYPE", payload: { text: e.currentTarget.value } })}
            />
            {model.unit && !model.unitBefore && <span aria-hidden="true">{model.unit}</span>}
          </span>
          {invalid && (
            <span id={errorId} className="answer-error">
              <svg viewBox="0 0 20 20" aria-hidden="true" className="h-[1.1em] w-[1.1em] shrink-0">
                <path d="M10 2l9 16H1z" fill="currentColor" />
                <path d="M10 8v4.5" stroke="#fff" stroke-width="2" stroke-linecap="round" />
                <circle cx="10" cy="15" r="1.2" fill="#fff" />
              </svg>
              {t.notANumber}
            </span>
          )}
        </div>
      )}
      {task === "answer" && model.markSource && !readOnly && <p className="hint">{t.markSourceHint}</p>}
      <DocumentView
        doc={doc}
        currency={model.currency}
        markOf={(id) => (marked.includes(id) ? mark : null)}
        onTap={tappable ? onTap : undefined}
        markText={{ chosen: t.stateChosen, mistake: t.stateMistake, source: t.stateSource }}
      />
      {task === "check" && <p className="status">{t.markedCount(marked.length)}</p>}
      <p className="sr-only" aria-live="polite">
        {message}
      </p>
    </div>
  );
};

export default Interaction;
