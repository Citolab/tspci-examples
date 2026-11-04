import { IStore, useStore } from "@citolab/preact-store";
import Board from "./board";
import { Circuit, lockedParts, startParts } from "./circuit";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the instruction, the palette and the board with the item's locked parts and their own.

const Interaction = ({ prompt, circuit, store, texts, showOpenEnds, showCurrent, lampTool, readOnly }: {
  prompt: string;
  circuit: Circuit;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  showOpenEnds: boolean;
  showCurrent: boolean;
  lampTool: boolean;
  readOnly: boolean;
}) => {
  const { parts, broken } = useStore(store);
  return (
    <div className="inline-flex max-w-full flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] text-slate-700" data-testid="prompt">{prompt}</p>}
      <Board circuit={circuit} locked={lockedParts(circuit)} parts={parts} start={startParts(circuit)} texts={texts}
        showOpenEnds={showOpenEnds} showCurrent={showCurrent} readOnly={readOnly} label={prompt ? `${texts.board}: ${prompt}` : texts.board}
        onChange={(next) => store.dispatch({ type: "SET_PARTS", payload: { parts: next } })}
        lampTool={lampTool} broken={broken ?? []} onBrokenChange={(next) => store.dispatch({ type: "SET_BROKEN", payload: { broken: next } })} />
    </div>
  );
};

export default Interaction;
