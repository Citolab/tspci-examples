import { IStore, useStore } from "@citolab/preact-store";
import Agenda from "./agenda";
import { Planner } from "./planner";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the instruction, the task cards and the week agenda.

const Interaction = ({ prompt, planner, store, texts, feedback, readOnly }: {
  prompt: string;
  planner: Planner;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  feedback: boolean;
  readOnly: boolean;
}) => {
  const { placements } = useStore(store);
  return (
    <div className="flex max-w-full flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[75ch] text-[15px] text-slate-700" data-testid="prompt">{prompt}</p>}
      <Agenda planner={planner} placements={placements} texts={texts} feedback={feedback} readOnly={readOnly}
        label={prompt ? `${texts.agenda}: ${prompt}` : texts.agenda}
        onChange={(next) => store.dispatch({ type: "SET_PLACEMENTS", payload: { placements: next } })} />
    </div>
  );
};

export default Interaction;
