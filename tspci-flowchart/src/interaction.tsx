import { IStore, useStore } from "@citolab/preact-store";
import Canvas, { Outline, Perms } from "./canvas";
import { Settings, baseChart, canAddBlocks, canDrawArrows, usesCards, usesTyping } from "./flowchart";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the instruction, the cards (and blocks), the chart and the flow as text.

export const candidatePerms = (s: Settings): Perms => ({ addBlocks: canAddBlocks(s), arrows: canDrawArrows(s), cards: usesCards(s), typed: usesTyping(s) });

const Interaction = ({ prompt, settings, store, texts, readOnly, showOutline }: {
  prompt: string;
  settings: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  readOnly: boolean;
  showOutline: boolean;
}) => {
  const { chart } = useStore(store);
  return (
    <div className="inline-flex max-w-full flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] text-slate-700" data-testid="prompt">{prompt}</p>}
      <Canvas settings={settings} chart={chart} start={baseChart(settings)} texts={texts} perms={candidatePerms(settings)} readOnly={readOnly}
        label={prompt ? `${texts.chart}: ${prompt}` : texts.chart}
        onChange={(next) => store.dispatch({ type: "SET_CHART", payload: { chart: next } })} />
      {showOutline && <Outline chart={chart} settings={settings} texts={texts} />}
    </div>
  );
};

export default Interaction;
