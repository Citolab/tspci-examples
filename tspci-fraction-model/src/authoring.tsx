import { useState } from "preact/hooks";
import {
  MAX_MODELS, MAX_PARTS, MAX_SIDE, MODEL_TYPES, Model, ModelType, Setup, Task, correctValues, normalizeModel, partsOf, problems, startState, toggle,
} from "./fraction";
import { ModelView } from "./model";
import { textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the models side by side, each with its type, parts, task,
// given shading (click the preview) and answer. The result is data-models (fraction.ts).

/** What keeps the setup from being used, in the author's language (getAuthoringInstance validate()). */
export const authoringProblems = (setup: Setup, language: string): string[] => {
  const t = textsFor(language);
  return problems(setup).map(t.problem);
};

const button = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[#e69f00]";
const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";
const small = "flex items-center gap-1.5 text-xs text-slate-600";

const Authoring = ({ initial, language, onChange }: { initial: Setup; language: string; onChange: (s: Setup) => void }) => {
  const t = textsFor(language);
  const [setup, setSetup] = useState<Setup>(initial);
  const commit = (next: Setup) => {
    setSetup(next);
    onChange(next);
  };
  const update = (i: number, change: Partial<Model>) =>
    commit({ models: setup.models.map((m, j) => (j === i ? normalizeModel({ ...m, ...change }) : m)) });
  const number = (e: Event) => Math.round(Number((e.target as HTMLInputElement).value));
  const list = problems(setup);
  const correct = correctValues(setup);

  const editor = (m: Model, i: number) => {
    const name = t.model(m.type, m.label || String(i + 1));
    const mine = list.filter((p) => "model" in p && p.model === i).map(t.problem);
    return (
      <li key={i} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3" data-testid={`model-editor-${i}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-slate-400">{i + 1}</span>
          <label className={small}>{t.modelType}
            <select className={field} value={m.type} data-testid={`type-${i}`}
              onChange={(e) => update(i, { type: (e.target as HTMLSelectElement).value as ModelType, shaded: [] })}>
              {MODEL_TYPES.map((ty) => <option key={ty} value={ty}>{t.type[ty]}</option>)}
            </select>
          </label>
          <label className={small}>{t.label}
            <input className={`${field} w-14`} value={m.label} data-testid={`label-${i}`} onInput={(e) => update(i, { label: (e.target as HTMLInputElement).value })} />
          </label>
          {m.type === "grid" ? (
            <>
              <label className={small}>{t.rows}
                <input type="number" min={1} max={MAX_SIDE} className={`${field} w-16`} value={m.rows} data-testid={`rows-${i}`}
                  onChange={(e) => update(i, { rows: number(e), shaded: [] })} />
              </label>
              <label className={small}>{t.columns}
                <input type="number" min={1} max={MAX_SIDE} className={`${field} w-16`} value={m.columns} data-testid={`columns-${i}`}
                  onChange={(e) => update(i, { columns: number(e), shaded: [] })} />
              </label>
            </>
          ) : (
            <label className={small}>{t.partsField}
              <input type="number" min={1} max={MAX_PARTS} className={`${field} w-16`} value={m.parts} data-testid={`parts-${i}`}
                onChange={(e) => update(i, { parts: number(e), shaded: [] })} />
            </label>
          )}
          <button type="button" className="ml-auto rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-700"
            disabled={setup.models.length < 2} data-testid={`remove-${i}`}
            onClick={() => commit({ models: setup.models.filter((_, j) => j !== i) })}>{t.removeModel}</button>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className={small}>{t.task}
            <select className={field} value={m.task} data-testid={`task-${i}`} onChange={(e) => update(i, { task: (e.target as HTMLSelectElement).value as Task })}>
              {(["shade", "name"] as Task[]).map((k) => <option key={k} value={k}>{t.taskName[k]}</option>)}
            </select>
          </label>
          {m.task === "name" && (
            <select className={field} value={m.entry} data-testid={`entry-${i}`} aria-label={`${t.task}: ${t.entryName.fraction} / ${t.entryName.percent}`}
              onChange={(e) => update(i, { entry: (e.target as HTMLSelectElement).value as Model["entry"] })}>
              <option value="fraction">{t.entryName.fraction}</option>
              <option value="percent">{t.entryName.percent}</option>
            </select>
          )}
          {(m.type === "bar" || m.type === "circle") && m.task === "shade" && (
            <label className={small}>
              <input type="checkbox" checked={m.divide} data-testid={`divide-${i}`} onChange={(e) => update(i, { divide: (e.target as HTMLInputElement).checked })} />
              {t.divide}
            </label>
          )}
          {m.divide && (
            <span className={small}>
              {t.from}
              <input type="number" min={1} max={MAX_PARTS} className={`${field} w-14`} value={m.min} aria-label={`${t.partsField} ${t.from}`} data-testid={`min-${i}`}
                onChange={(e) => update(i, { min: number(e) })} />
              {t.to}
              <input type="number" min={1} max={MAX_PARTS} className={`${field} w-14`} value={m.max} aria-label={`${t.partsField} ${t.to}`} data-testid={`max-${i}`}
                onChange={(e) => update(i, { max: number(e) })} />
            </span>
          )}
          {m.type === "bar" && (
            <label className={small}>
              <input type="checkbox" checked={m.scale} data-testid={`scale-${i}`} onChange={(e) => update(i, { scale: (e.target as HTMLInputElement).checked })} />
              {t.scale}
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className={small}>{t.target}
            <input className={`${field} w-24 font-mono`} value={m.target} placeholder="3/8" data-testid={`target-${i}`}
              onInput={(e) => update(i, { target: (e.target as HTMLInputElement).value })} />
          </label>
          <span className="text-xs text-slate-400">{t.targetHint}</span>
          {m.task === "shade" && (
            <label className={small}>
              <input type="number" min={0} max={MAX_SIDE * MAX_SIDE} className={`${field} w-14`} value={m.requireParts} data-testid={`require-${i}`}
                onChange={(e) => update(i, { requireParts: number(e) })} />
              {t.requireParts}
            </label>
          )}
          {m.task === "name" && m.entry === "fraction" && (
            <label className={small}>
              <input type="checkbox" checked={m.simplest} data-testid={`simplest-${i}`} onChange={(e) => update(i, { simplest: (e.target as HTMLInputElement).checked })} />
              {t.simplest}
            </label>
          )}
        </div>

        <p className="m-0 text-xs text-slate-500">{t.shadingHint(m.task)}</p>
        <div className="flex justify-center rounded-lg bg-slate-50 p-2">
          <ModelView model={m} state={startState(m)} texts={t} name={name} interactive testid={`preview-${i}`}
            onToggle={(part, on) => update(i, { shaded: toggle({ ...startState(m), parts: partsOf(m) }, part, on).shaded })} />
        </div>
        {mine.map((p) => <p key={p} className="m-0 text-xs text-rose-700" data-testid="problem">{p}</p>)}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800">
      <ol className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(440px,1fr))] gap-3 p-0">{setup.models.map(editor)}</ol>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={button} disabled={setup.models.length >= MAX_MODELS} data-testid="add-model"
          onClick={() => commit({ models: [...setup.models, normalizeModel({ type: "bar", parts: 4, label: String.fromCharCode(65 + setup.models.length) })] })}>
          + {t.addModel}
        </button>
        <p className="m-0 text-slate-600" data-testid="correct">
          {t.correct}: {correct ? <code className="rounded bg-slate-100 px-1 py-0.5">{correct.join(", ")}</code> : <span className="text-slate-400">{t.noCorrect}</span>}
        </p>
      </div>
      {list.filter((p) => !("model" in p)).map((p) => <p key={p.code} className="m-0 text-rose-700" data-testid="problem">{t.problem(p)}</p>)}
    </div>
  );
};

export default Authoring;
