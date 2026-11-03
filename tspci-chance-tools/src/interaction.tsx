import { IStore, useStore } from "@citolab/preact-store";
import { useMemo, useState } from "preact/hooks";
import { Mode, Setup, designedSetup, treeSetup } from "./chance";
import { DesignEditor } from "./design";
import { ExperimentPanel } from "./experiment";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";
import { TreeView } from "./tree";
import { Patterns } from "./view";

// The candidate's view: the instruction, then per mode the experiment (tool), the design and a try-out (design), or
// the probability tree with an optional experiment (tree); a live region tells what changed.

const Interaction = ({ prompt, mode, setup, store, t, language, showTheory, readOnly, solution }: {
  prompt: string;
  mode: Mode;
  setup: Setup;
  store: IStore<StateModel, Actions>;
  t: Texts;
  language: string;
  showTheory: boolean;
  readOnly: boolean;
  solution: boolean;
}) => {
  const { experiment, design, tree } = useStore(store);
  const [message, setMessage] = useState("");
  const say = (m: string) => setMessage(m);
  const designed = useMemo(() => designedSetup(setup, design), [setup, design]);
  const twoSteps = useMemo(() => treeSetup(setup), [setup]);
  const panel = (tool: Setup, title?: string) => (
    <ExperimentPanel setup={tool} experiment={experiment} t={t} language={language} showTheory={showTheory} readOnly={readOnly} say={say} title={title}
      onRun={(n) => store.dispatch({ type: "RUN", payload: { trials: n } })}
      onNew={() => store.dispatch({ type: "NEW_EXPERIMENT", payload: {} })} />
  );
  return (
    <div className="cp-root flex flex-col gap-4 font-sans text-slate-900" lang={language} data-mode={mode}>
      <Patterns />
      {prompt && <p className="text-base leading-relaxed whitespace-pre-line text-slate-800">{prompt}</p>}
      {solution && <p className="self-start rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 ring-1 ring-emerald-600">{t.solution}</p>}
      {mode === "tool" && panel(setup)}
      {mode === "design" && (
        <>
          <DesignEditor setup={setup} design={design} latest={() => store.getState().design} t={t} readOnly={readOnly} say={say}
            onChange={(d) => { store.dispatch({ type: "SET_DESIGN", payload: { design: d } }); }} />
          {setup.experiments && !solution && panel(designed, t.tryIt)}
        </>
      )}
      {mode === "tree" && (
        <>
          <TreeView setup={setup} entry={tree} latest={() => store.getState().tree} t={t} readOnly={readOnly} onChange={(e) => store.dispatch({ type: "SET_TREE", payload: { tree: e } })} />
          {setup.experiments && !solution && panel(twoSteps)}
        </>
      )}
      <div role="status" aria-live="polite" className="sr-only" data-testid="status">{message}</div>
    </div>
  );
};

export default Interaction;
