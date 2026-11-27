import type { PciProperties } from "@citolab/tspci";
import { IStore, useStore } from "@citolab/preact-store";
import configProps from "./config.json";
import { Model, numberPattern } from "./bonds";
import { Drawing } from "./drawings";
import { Actions, StateModel } from "./store";
import { textsFor } from "./texts";

type PropTypes = PciProperties<typeof configProps>;

type Props = {
  config: PropTypes;
  model: Model;
  store: IStore<StateModel, Actions>;
  readOnly: boolean; // review, solution, closed: show the numbers, but do not change them
};

/** The title, the question, and the house or the tree with a box to type in for every number the pupil fills in. */
const Interaction = ({ config, model, store, readOnly }: Props) => {
  const { values, locked } = useStore(store); // re-renders when the store changes
  const t = textsFor(config.language);
  const pattern = numberPattern(model.decimals);
  const hint = model.decimals ? t.notADecimal : t.notANumber;

  const renderBox = (index: number, label: string) =>
    locked[index] ? (
      // a number the author gave: plain text in the box, read as "roof: 7"
      <input id={`box-${index}`} type="text" className="box given" aria-label={label} value={values[index]} readOnly disabled={readOnly} tabIndex={-1} />
    ) : (
      <input
        id={`box-${index}`}
        type="text"
        inputMode={model.decimals ? "decimal" : "numeric"}
        autoComplete="off"
        maxLength={7}
        className="box"
        data-box=""
        aria-label={label}
        pattern={pattern}
        title={hint}
        value={values[index]}
        disabled={readOnly}
        onInput={(e) => store.dispatch({ type: "SET_BOX", payload: { index, value: e.currentTarget.value } })}
      />
    );

  return (
    <div className="font-sans text-ink">
      {config.title?.trim() && <h2 className="text-[1.5em] leading-tight font-bold">{config.title}</h2>}
      <p className="mt-2 leading-relaxed">{config.question?.trim() || t.instruction[model.kind === "tree" ? "tree" : model.task === "allSplits" ? "allSplits" : "house"]}</p>
      <div className="mt-5 flex justify-center overflow-x-auto rounded-xl bg-paper px-4 py-6">
        <Drawing model={model} renderBox={renderBox} t={t} />
      </div>
    </div>
  );
};

export default Interaction;
