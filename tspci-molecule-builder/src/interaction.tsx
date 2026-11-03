import { IStore, useStore } from "@citolab/preact-store";
import Builder, { View } from "./builder";
import { ElementSymbol, FormulaOrder } from "./molecule";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the instruction and the builder with the item's palette; every change goes to the store.

const Interaction = ({ prompt, store, texts, elements, showFormula, showValence, view, maxAtoms, readOnly, formulaOrder }: {
  prompt: string;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  elements: ElementSymbol[];
  showFormula: boolean;
  showValence: boolean;
  view: View;
  maxAtoms: number;
  readOnly: boolean;
  formulaOrder: FormulaOrder;
}) => {
  const { molecule } = useStore(store);
  return (
    <div className="flex w-full max-w-[900px] flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] text-slate-700" data-testid="prompt">{prompt}</p>}
      <Builder molecule={molecule} onChange={(next) => store.dispatch({ type: "SET_MOLECULE", payload: { molecule: next } })}
        elements={elements} texts={texts} showFormula={showFormula} showValence={showValence} view={view} maxAtoms={maxAtoms}
        readOnly={readOnly} prompt={prompt} formulaOrder={formulaOrder} />
    </div>
  );
};

export default Interaction;
