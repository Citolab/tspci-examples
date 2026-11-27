import { IStore, useStore } from "@citolab/preact-store";
import { NumberLine, View } from "./board";
import { EmptyLine } from "./emptyLine";
import { DoubleLine } from "./doubleLine";
import { Actions, StateModel } from "./store";

// The candidate's view: the instruction and the number line (or the empty or the double number line), bound to the store.

const Interaction = ({ prompt, view, store }: { prompt: string; view: View; store: IStore<StateModel, Actions> }) => {
  const { answer } = useStore(store);
  return (
    <div class="inline-flex max-w-full flex-col gap-3 font-sans text-slate-800">
      {prompt && <p class="m-0 max-w-[70ch] text-[15px] text-slate-700" data-testid="prompt">{prompt}</p>}
      {view.mode === "empty" ? (
        <EmptyLine view={view} answer={answer} onChange={(next) => store.dispatch({ type: "SET_ANSWER", payload: { answer: next } })} />
      ) : view.mode === "double" ? (
        <DoubleLine view={view} answer={answer} onChange={(next) => store.dispatch({ type: "SET_ANSWER", payload: { answer: next } })} />
      ) : (
        <NumberLine view={view} answer={answer} onChange={(next) => store.dispatch({ type: "SET_ANSWER", payload: { answer: next } })} />
      )}
    </div>
  );
};

export default Interaction;
