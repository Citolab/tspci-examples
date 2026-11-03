import { useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { Assembly, assembledAfter, blockersOfTakeBack, checkStep, nameOf, textIn, violationsOf } from "./assembly";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";
import View3D from "./view";

// The candidate's view: the 3D view of the product, the parts list (everything the view does, by keyboard and screen
// reader), the order so far and a live status line. Also the "Try it" tab of the authoring mode.

const button =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40 disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600";

const Warning = () => (
  <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden="true">
    <path d="M8 1.8 15 14H1z" fill="currentColor" />
    <path d="M8 6v4" stroke="#fff" stroke-width="1.6" stroke-linecap="round" />
    <circle cx="8" cy="12" r=".9" fill="#fff" />
  </svg>
);

const Interaction = ({ prompt, assembly: a, store, texts: t, language, readOnly, testid = "assembly" }: {
  prompt: string;
  assembly: Assembly;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  language: string;
  readOnly: boolean;
  testid?: string;
}) => {
  const { sequence } = useStore(store);
  const [status, setStatus] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const task = a.task;
  const name = (id: string) => {
    const part = a.parts.find((x) => x.id === id);
    return part ? nameOf(part, language) : id;
  };
  const names = (ids: string[]) => t.list(ids.map(name));
  const assembled = assembledAfter(a.parts, task, sequence);
  // in "record" mode the steps that broke a rule are marked (with a sign and a text, not by colour alone)
  const wrong = new Set(a.feedback === "record" ? violationsOf(a.parts, task, sequence).map((v) => v.id) : []);
  const complete = a.parts.length > 0 && sequence.length === a.parts.length;

  const step = (id: string) => {
    const { allowed, missing } = checkStep(a.parts, task, sequence, id);
    if (!allowed && a.feedback === "block") {
      store.dispatch({ type: "BLOCKED", payload: { id, missing } });
      setStatus(t.blocked(task, name(id), names(missing)));
      return;
    }
    store.dispatch({ type: "STEP", payload: { id, missing } });
    const n = sequence.length + 1;
    let message = !allowed && a.feedback === "record" ? t.doneWrong(task, name(id), n, names(missing)) : t.done(task, name(id), n);
    if (n === a.parts.length) message += ` ${t.finished(task)}`;
    setStatus(message);
  };

  const takeBack = (id: string) => {
    const blockers = blockersOfTakeBack(a.parts, task, sequence, id);
    if (blockers.length && a.feedback === "block") {
      store.dispatch({ type: "TAKE_BACK_BLOCKED", payload: { id, blockers } });
      setStatus(t.takeBackBlocked(task, name(id), names(blockers)));
      return;
    }
    store.dispatch({ type: "TAKE_BACK", payload: { id } });
    setStatus(t.takenBack(task, name(id)));
  };

  const act = (id: string) => {
    if (readOnly) return;
    if (sequence.includes(id)) takeBack(id);
    else step(id);
  };

  const undo = () => {
    if (readOnly) return;
    const last = sequence[sequence.length - 1];
    if (!last) return setStatus(t.nothingToUndo);
    store.dispatch({ type: "TAKE_BACK", payload: { id: last } });
    setStatus(`${t.undone} ${t.takenBack(task, name(last))}`);
  };

  const clear = () => {
    store.dispatch({ type: "CLEAR", payload: null });
    setStatus(t.cleared);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    }
  };

  const title = textIn(a.title, language);
  return (
    <div className="asm flex w-full max-w-[1040px] flex-col gap-3 font-sans text-slate-800" onKeyDown={onKeyDown as any} data-testid={testid}>
      {prompt && <p className="m-0 max-w-[75ch] text-[15px] leading-relaxed text-slate-700" data-testid="prompt">{prompt}</p>}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[300px] flex-[1_1_480px]">
          <View3D parts={a.parts} assembled={assembled} highlight={hover} gltf={a.gltf} interactive={!readOnly} texts={t} onPick={act} onHover={setHover}
            testid={`${testid}-view`} />
        </div>

        <section className="flex min-w-[260px] flex-[1_1_280px] flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm" aria-labelledby={`${testid}-parts`}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h2 id={`${testid}-parts`} className="m-0 text-base font-semibold text-slate-900">
              {t.taskTitle[task]}{title ? `: ${title}` : ""}
            </h2>
            <span className="text-xs text-slate-500" data-testid="progress">{t.progress(task, sequence.length, a.parts.length)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <div className="asm-bar h-full rounded-full bg-sky-600" style={{ width: `${a.parts.length ? (100 * sequence.length) / a.parts.length : 0}%` }} />
          </div>
          <ul className="m-0 flex max-h-[420px] list-none flex-col gap-1 overflow-y-auto p-0" aria-label={t.parts}>
            {a.parts.map((part) => {
              const n = sequence.indexOf(part.id) + 1;
              const done = n > 0;
              const label = nameOf(part, language);
              const flagged = wrong.has(part.id);
              return (
                <li key={part.id} data-part={part.id} data-state={done ? "done" : "loose"}
                  onMouseEnter={() => setHover(part.id)} onMouseLeave={() => setHover(null)}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${hover === part.id ? "border-sky-400 bg-sky-50" : done ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}>
                  <span aria-hidden="true"
                    className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${done ? (flagged ? "bg-amber-500 text-white" : "bg-sky-700 text-white") : "border-2 border-dashed border-slate-300 text-slate-400"}`}>
                    {done ? n : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{label}</span>
                    <span className="flex items-center gap-1 text-xs text-slate-500" data-testid={`state-${part.id}`}>
                      {done ? t.stateDone(task, n) : t.stateLoose[task]}
                      {flagged && (
                        <span className="inline-flex items-center gap-0.5 font-medium text-amber-700"> · <Warning />{t.notAllowed}</span>
                      )}
                    </span>
                  </span>
                  {!readOnly && (
                    <button type="button" className={`${button} px-2 py-1 text-xs`} onClick={() => act(part.id)}
                      onFocus={() => setHover(part.id)} onBlur={() => setHover(null)}
                      aria-label={`${done ? t.undoStep[task] : t.doStep[task]}: ${label}`}>
                      {done ? t.undoStep[task] : t.doStep[task]}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-600" id={`${testid}-steps`}>{t.steps}:</span>
        {sequence.length === 0 ? (
          <span className="text-sm text-slate-400">{t.noSteps}</span>
        ) : (
          <ol className="m-0 flex list-none flex-wrap gap-1 p-0" aria-labelledby={`${testid}-steps`} data-testid="steps">
            {sequence.map((id, i) => (
              <li key={id} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${wrong.has(id) ? "border-amber-400 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700"}`}>
                <span className="font-semibold">{i + 1}.</span> {name(id)}
                {wrong.has(id) && <><Warning /><span className="sr-only">({t.notAllowed})</span></>}
              </li>
            ))}
          </ol>
        )}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={button} onClick={undo} disabled={!sequence.length}>
            <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true"><path d="M7 4 3 8l4 4M3.5 8H12a5 5 0 0 1 0 10H9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
            {t.undo}
          </button>
          <button type="button" className={button} onClick={clear} disabled={!sequence.length}>{t.clear}</button>
          <button type="button" className={`${button} ml-auto`} aria-expanded={showHelp} onClick={() => setShowHelp(!showHelp)}>{t.showHelp}</button>
        </div>
      )}
      {showHelp && !readOnly && <p className="m-0 max-w-[75ch] rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{t.help(task)}</p>}
      {readOnly && <p className="m-0 text-sm text-slate-600">{t.readOnly}</p>}
      <p role="status" aria-live="polite" className={`m-0 min-h-5 text-sm ${complete ? "font-medium text-slate-900" : "text-slate-700"}`} data-testid="status">{status}</p>
    </div>
  );
};

export default Interaction;
