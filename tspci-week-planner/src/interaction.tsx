import { IStore, useStore } from "@citolab/preact-store";
import Agenda from "./agenda";
import { Planner } from "./planner";
import { Rota, RotaMode } from "./rota";
import { RotaTexts } from "./rotaTexts";
import { RotaView } from "./rotaViews";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the instruction, and the week agenda with the task cards, or one of the rota modes.

const Interaction = ({ prompt, mode, planner, rota, store, texts, rotaTexts, feedback, readOnly }: {
  prompt: string;
  mode: "plan" | RotaMode;
  planner: Planner;
  rota: Rota;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  rotaTexts: RotaTexts;
  feedback: boolean;
  readOnly: boolean;
}) => {
  const state = useStore(store);
  return (
    <div className="flex max-w-full flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[75ch] text-[15px] text-slate-700" data-testid="prompt">{prompt}</p>}
      {mode === "plan" ? (
        <Agenda planner={planner} placements={state.placements} texts={texts} feedback={feedback} readOnly={readOnly}
          label={prompt ? `${texts.agenda}: ${prompt}` : texts.agenda}
          onChange={(next) => store.dispatch({ type: "SET_PLACEMENTS", payload: { placements: next } })} />
      ) : (
        <RotaView rota={rota} mode={mode} shifts={state.shifts ?? []} answers={state.answers ?? []} hours={state.hours ?? []} pay={state.pay ?? []}
          texts={rotaTexts} feedback={feedback} readOnly={readOnly} label={prompt ? rotaTexts.rotaOf(prompt) : rotaTexts.rota}
          onShifts={(shifts) => store.dispatch({ type: "SET_SHIFTS", payload: { shifts } })}
          onAnswer={(index, answer) => store.dispatch({ type: "SET_ANSWER", payload: { index, answer } })}
          onBox={(kind, index, text) => store.dispatch({ type: "SET_BOX", payload: { kind, index, text } })} />
      )}
    </div>
  );
};

export default Interaction;
