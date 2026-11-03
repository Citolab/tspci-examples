import { IStore, useStore } from "@citolab/preact-store";
import { useState } from "preact/hooks";
import { Drawing, AskedField } from "./drawing";
import { GridLayer, lineText } from "./grid";
import { Dim, Feature, LineKind, PlacedDim, View, ViewName, VIEW_NAMES, segKey } from "./model";
import { Actions, StateModel } from "./store";
import { Drawing as DrawingSettings, LETTERS, TaskType, allowedInput } from "./task";
import { Texts, dimLabel } from "./texts";
import { ModelViewer } from "./viewer";

// The candidate's view: the instruction, the drawing (with the fields, the grid or the view to name) and the 3D model,
// and below it what the task needs: questions, drawing tools, or the choices.

export type Prepared = {
  task: TaskType;
  drawing: DrawingSettings;
  features: Feature[];
  views: Record<ViewName, View>;
  /** the dimensions on the drawing, placed */
  placed: PlacedDim[];
  /** what the candidate answers with numbers, in order */
  asked: { dim: Dim; question?: string }[];
  /** complete: the keys of the lines left out */
  missing: Set<string>;
  /** model: the workpieces to choose from */
  options: Feature[][];
};

const button = "td-focus rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40";
const pressed = "td-focus rounded-md border-2 border-blue-700 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-900";

const Interaction = ({ prompt, prepared, store, texts: t, language, showModel, showLabels, modelView, readOnly }: {
  prompt: string;
  prepared: Prepared;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  language: string;
  showModel: boolean;
  showLabels: boolean;
  modelView: "3d" | "2d";
  readOnly: boolean;
}) => {
  const state = useStore(store);
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<LineKind>("visible");
  const [erase, setErase] = useState(false);
  const announce = (m: string) => setMessage((prev) => (prev === m ? `${m} ` : m));
  const { task, drawing, features, views, placed, asked } = prepared;

  const fields: Record<string, AskedField> = {};
  if (task === "dimensions") asked.forEach((a, index) => (fields[a.dim.id] = { index, value: state.values[index] ?? "", label: dimLabel(t, a.dim, features) }));
  const setValue = (index: number, text: string) => store.dispatch({ type: "SET_VALUE", payload: { index, text } });
  const onBeforeInput = (e: InputEvent) => {
    if (!e.data) return;
    const field = e.target as HTMLInputElement;
    const next = field.value.slice(0, field.selectionStart ?? field.value.length) + e.data + field.value.slice(field.selectionEnd ?? field.value.length);
    if (!allowedInput(next)) {
      e.preventDefault();
      announce(t.notANumber);
    }
  };
  const onValue = (index: number, text: string) => setValue(index, text);

  const show: ViewName[] = task === "view" ? [drawing.identify.view] : VIEW_NAMES;
  const dims = task === "view" ? [] : placed;
  const completeView = task === "complete" ? drawing.complete.view : undefined;
  const grid = drawing.complete.grid;
  const setLines = (lines: typeof state.lines) => store.dispatch({ type: "SET_LINES", payload: { lines } });

  const label = task === "view" ? t.unlabelledView : t.drawingOf(VIEW_NAMES.map((v) => t.view[v].toLowerCase()).join(", "));
  const choose = (choice: string, what: string) => {
    if (readOnly) return;
    store.dispatch({ type: "CHOOSE", payload: { choice } });
    announce(t.chosen(what));
  };
  const optionLabels = task === "model" ? prepared.options.map((_, i) => LETTERS[i]) : [];
  const selectedOption = task === "model" && state.choice ? LETTERS.indexOf(state.choice) : null;

  return (
    <div className="flex max-w-full flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] text-slate-700" data-testid="prompt">{prompt}</p>}
      {task === "complete" && <p className="m-0 text-sm text-slate-600">{t.completeHelp(t.view[drawing.complete.view])}</p>}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-[280px] flex-[3_1_420px] flex-col gap-1">
          <Drawing features={features} views={views} dims={dims} show={show} labels={task !== "view" && showLabels} texts={t} language={language}
            asked={fields} onValue={onValue} onBeforeInput={onBeforeInput} readOnly={readOnly} label={label}
            gridView={completeView} hiddenSegs={prepared.missing}
            grid={(view, X, Y, k) => (
              <GridLayer view={view} X={X} Y={Y} k={k} step={grid} lines={state.lines} kind={kind} erase={erase} readOnly={readOnly}
                texts={t} language={language} viewLabel={t.view[drawing.complete.view]} announce={announce}
                onAdd={(line) => setLines([...state.lines, line])} onRemove={(i) => setLines(state.lines.filter((_, j) => j !== i))} />
            )} />
          {task !== "view" && <p className="m-0 text-xs text-slate-500">{t.projection}</p>}
        </div>
        {(showModel || task === "view" || task === "model") && (
          <div className="flex min-w-[260px] flex-[2_1_300px] flex-col">
            <ModelViewer workpieces={task === "model" ? prepared.options : [features]} labels={optionLabels} selected={selectedOption}
              onPick={task === "model" ? (i) => choose(LETTERS[i], t.workpiece(LETTERS[i])) : undefined}
              texts={t} announce={announce} mode={modelView} height={task === "model" ? 380 : 300} />
          </div>
        )}
      </div>

      {task === "read" && (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-sm font-semibold text-slate-700">{t.questions}</legend>
          {asked.map((a, i) => {
            const text = a.question || t.askDim(dimLabel(t, a.dim, features));
            return (
              <label key={i} className="flex flex-wrap items-center gap-2 text-[15px]">
                <span>{text}</span>
                <input type="text" inputMode="decimal" autoComplete="off" spellcheck={false} value={state.values[i] ?? ""} readOnly={readOnly}
                  data-testid={`question-${i}`} aria-label={`${text} (${t.unit})`}
                  className="td-focus w-24 rounded-md border border-slate-400 px-2 py-1 text-right"
                  onBeforeInput={(e) => onBeforeInput(e as unknown as InputEvent)} onInput={(e) => setValue(i, (e.target as HTMLInputElement).value)} />
                <span aria-hidden="true">{t.unit}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      {task === "complete" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label={t.yourLines} className="flex gap-1">
              {(["visible", "hidden"] as LineKind[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={!erase && kind === k} disabled={readOnly} data-testid={`kind-${k}`}
                  className={!erase && kind === k ? pressed : button} onClick={() => { setKind(k); setErase(false); }}>
                  <svg width="28" height="10" aria-hidden="true" className="mr-1 inline-block align-middle">
                    <line x1="1" y1="5" x2="27" y2="5" className="stroke-current" stroke-width={k === "visible" ? 3 : 1.5} stroke-dasharray={k === "hidden" ? "5 3" : undefined} />
                  </svg>
                  {t.lineKind[k]}
                </button>
              ))}
              <button type="button" role="radio" aria-checked={erase} disabled={readOnly} data-testid="erase" className={erase ? pressed : button} onClick={() => setErase(true)}>{t.erase}</button>
            </div>
            <button type="button" className={button} disabled={readOnly || !state.lines.length} data-testid="undo"
              onClick={() => { const last = state.lines[state.lines.length - 1]; setLines(state.lines.slice(0, -1)); announce(t.lineRemoved(lineText(t, last, language))); }}>{t.undo}</button>
            <button type="button" className={button} disabled={readOnly || !state.lines.length} data-testid="clear"
              onClick={() => { setLines([]); announce(t.cleared); }}>{t.clear}</button>
          </div>
          <details className="text-sm">
            <summary className="td-focus cursor-pointer text-slate-700">{t.yourLines} ({state.lines.length})</summary>
            {state.lines.length ? (
              <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0" data-testid="line-list">
                {state.lines.map((l, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span>{lineText(t, l, language)}</span>
                    {!readOnly && <button type="button" className="td-focus rounded border border-slate-300 px-2 text-xs" aria-label={t.removeLine(lineText(t, l, language))}
                      onClick={() => { setLines(state.lines.filter((_, j) => j !== i)); announce(t.lineRemoved(lineText(t, l, language))); }}>×</button>}
                  </li>
                ))}
              </ul>
            ) : <p className="m-0 mt-1 text-slate-500">{t.noLines}</p>}
          </details>
        </div>
      )}

      {task === "view" && (
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-[15px] font-semibold text-slate-800">{t.whichView}</legend>
          <div className="flex flex-wrap gap-2">
            {VIEW_NAMES.map((v) => (
              <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${state.choice === v ? "border-2 border-blue-700 bg-blue-50" : "border-slate-300 bg-white"}`}>
                <input type="radio" name="td-view" value={v} checked={state.choice === v} disabled={readOnly} data-testid={`choice-${v}`}
                  className="td-focus h-4 w-4 accent-blue-700" onChange={() => choose(v, t.view[v])} />
                {t.view[v]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {task === "model" && (
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-[15px] font-semibold text-slate-800">{t.whichModel}</legend>
          <div className="flex flex-wrap gap-2">
            {prepared.options.map((_, i) => (
              <label key={i} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${state.choice === LETTERS[i] ? "border-2 border-blue-700 bg-blue-50" : "border-slate-300 bg-white"}`}>
                <input type="radio" name="td-model" value={LETTERS[i]} checked={state.choice === LETTERS[i]} disabled={readOnly} data-testid={`choice-${LETTERS[i]}`}
                  className="td-focus h-4 w-4 accent-blue-700" onChange={() => choose(LETTERS[i], t.workpiece(LETTERS[i]))} />
                {t.workpiece(LETTERS[i])}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <p className="td-sr" role="status" aria-live="polite" data-testid="status">{message}</p>
    </div>
  );
};

export default Interaction;
export { segKey };
