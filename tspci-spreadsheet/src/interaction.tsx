import { useMemo, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import Grid from "./grid";
import { Locale } from "./formula";
import { Mode, Sheet, inputsOf } from "./sheet";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate's view: the instruction and the sheet with their changes over it. Locked cells stay as the author
// made them; in answer mode the answer cell is marked.

const Interaction = ({ prompt, sheet, mode, showFormulaBar, store, locale, texts }: {
  prompt: string;
  sheet: Sheet;
  mode: Mode;
  showFormulaBar: boolean;
  store: IStore<StateModel, Actions>;
  locale: Locale;
  texts: Texts;
}) => {
  const { cells } = useStore(store);
  const inputs = useMemo(() => inputsOf(sheet, cells), [sheet, cells]);
  const [selected, setSelected] = useState("A1");

  return (
    <div className="inline-flex max-w-full flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] text-slate-700">{prompt}</p>}
      <Grid sheet={sheet} inputs={inputs} locale={locale} texts={texts} selected={selected} onSelect={setSelected}
        editable={(ref) => !sheet.cells[ref]?.locked}
        onChange={(changes) => store.dispatch({ type: "SET_CELLS", payload: { cells: changes } })}
        answer={mode === "answer" ? sheet.answer : null} showFormulaBar={showFormulaBar} label={prompt || texts.sheet} />
    </div>
  );
};

export default Interaction;
