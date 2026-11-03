import { IStore, useStore } from "@citolab/preact-store";
import MarkerView from "./markerView";
import { Category, Doc, Limits, Snap } from "./marker";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the instruction, the markers, the source text and the list of marks.

const Interaction = (p: {
  prompt: string;
  doc: Doc;
  categories: Category[];
  store: IStore<StateModel, Actions>;
  texts: Texts;
  limits: Limits;
  snap: Snap;
  direction: "ltr" | "rtl";
  textLanguage: string;
  showLabels: boolean;
  maxHeight: number;
  readOnly: boolean;
  solution: boolean;
}) => {
  const { marks } = useStore(p.store);
  const t = p.texts;
  return (
    <div className="tm-root flex max-w-[52rem] flex-col gap-3 font-sans text-slate-800">
      {p.prompt && <p className="m-0 max-w-[70ch] text-[15px] text-slate-700" data-testid="prompt">{p.prompt}</p>}
      <MarkerView doc={p.doc} categories={p.categories} marks={marks} t={t} limits={p.limits} snap={p.snap} readOnly={p.readOnly}
        direction={p.direction} textLanguage={p.textLanguage} showLabels={p.showLabels} maxHeight={p.maxHeight}
        label={p.prompt ? `${t.text}: ${p.prompt}` : t.text} listHeading={p.solution ? t.correctMarks : t.yourMarks}
        onChange={(next) => p.store.dispatch({ type: "SET_MARKS", payload: { marks: next } })} />
    </div>
  );
};

export default Interaction;
