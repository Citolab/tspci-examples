import { IStore, useStore } from "@citolab/preact-store";
import Board from "./board";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";
import { Timeline } from "./timeline";

// The candidate's view: the instruction and the timeline, with the placements in the store.

const Interaction = ({ prompt, timeline, store, texts, language, readOnly, showValue, minHeight, idPrefix }: {
  prompt: string;
  timeline: Timeline;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  language: "en" | "nl";
  readOnly: boolean;
  showValue: boolean;
  minHeight: number;
  idPrefix: string;
}) => {
  const { placed } = useStore(store);
  return (
    <div className="flex w-full max-w-full flex-col gap-3 font-sans text-slate-800" lang={language}>
      {prompt && <p className="m-0 max-w-[75ch] text-[15px] text-slate-700" data-testid="prompt">{prompt}</p>}
      <Board timeline={timeline} placed={placed} texts={texts} language={language} readOnly={readOnly} showValue={showValue} minHeight={minHeight}
        label={prompt ? `${texts.timeline}: ${prompt}` : texts.timeline} idPrefix={idPrefix}
        onPlace={(id, value) => store.dispatch({ type: "PLACE", payload: { id, value } })}
        onSetPlaced={(next) => store.dispatch({ type: "SET_PLACED", payload: { placed: next } })}
        onRemove={(id) => store.dispatch({ type: "REMOVE", payload: { id } })}
        onClear={() => store.dispatch({ type: "SET_PLACED", payload: { placed: {} } })} />
    </div>
  );
};

export default Interaction;
