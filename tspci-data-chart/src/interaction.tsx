import { useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import Chart, { ChartSettings } from "./view";
import { ChartData, Mode, findSegment, nextChoice } from "./chart";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the instruction, the chart, and in select mode what they chose. Every look at a segment's
// numbers goes in the store (the response in tool mode); in select mode a click chooses.

const Interaction = ({ prompt, data, settings, mode, maxChoices, store, texts }: {
  prompt: string;
  data: ChartData;
  settings: ChartSettings;
  mode: Mode;
  maxChoices: number;
  store: IStore<StateModel, Actions>;
  texts: Texts;
}) => {
  const { selected } = useStore(store);
  const [message, setMessage] = useState("");
  const select = mode === "select";
  const chosen = selected.map((id) => findSegment(data, id)).filter(Boolean);
  const help = select ? texts.helpSelect(maxChoices) : texts.helpTool;

  return (
    <div className="flex max-w-full flex-col gap-3 font-sans text-slate-800" style={{ width: `${Math.max(320, settings.width) + 34}px` }}>
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] text-slate-700" data-testid="prompt">{prompt}</p>}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Chart data={data} settings={settings} texts={texts} label={settings.title || prompt || texts.chart}
          selected={select ? selected : []} selectable={select} single={maxChoices === 1}
          onView={(id) => store.dispatch({ type: "VIEW", payload: { id } })}
          onChoose={(id) => {
            const next = nextChoice(selected, id, maxChoices);
            if (!next) {
              setMessage(texts.maxReached(maxChoices));
              return;
            }
            setMessage("");
            if (next !== selected) store.dispatch({ type: "CHOOSE", payload: { selected: next } });
          }} />
      </div>
      {settings.showValues !== "never" && <p className="m-0 max-w-[70ch] text-xs text-slate-500" data-testid="help">{help}</p>}
      {select && (
        <p className="m-0 text-sm text-slate-700" aria-live="polite" data-testid="chosen">
          {texts.chosen(chosen.map((c) => `${c.category.label}, ${c.series.name}`))}
          {message && <span className="ml-2 text-amber-700">{message}</span>}
        </p>
      )}
    </div>
  );
};

export default Interaction;
