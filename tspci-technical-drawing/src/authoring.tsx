import { useMemo, useState } from "preact/hooks";
import { Drawing as DrawingSheet } from "./drawing";
import {
  CHAMFER_EDGES, Feature, FeatureType, HOLE_FACES, STEP_EDGES, VIEW_NAMES, ViewName, computeViews, dimensionsOf, featureProblems, parseFeature,
  placeDims, segKey, variantsOf, viewSignature,
} from "./model";
import { DimState, Drawing, LETTERS, TASK_TYPES, TaskType, askedOf, completeProblems, dimState, missingSegs, optionsOf } from "./task";
import { Texts, dimLabel, textsFor } from "./texts";
import { ModelViewer } from "./viewer";

// The authoring mode (index.tsx getAuthoringInstance): the workpiece from features, and per task what it needs —
// which dimensions are shown, hidden or asked, the questions, the view to complete and the lines left out, the view
// to name, the other workpieces. The result is data-drawing (task.ts) and data-task.

/** What keeps the item from working (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (d: Drawing, task: TaskType, language: string): string[] => {
  const t = textsFor(language);
  const problems: string[] = featureProblems(d.features).map((p) => (t.problem as any)[p.code](p.feature));
  const dims = dimensionsOf(d.features);
  if (task === "dimensions" && !askedOf(task, d, dims).length) problems.push(t.problem.noAsk);
  if (task === "read") {
    if (!d.questions.length) problems.push(t.problem.noQuestion);
    d.questions.forEach((q, i) => !dims.some((dim) => dim.id === q.dim) && problems.push(t.problem.questionDim(i + 1)));
  }
  if (task === "complete") {
    const view = computeViews(d.features)[d.complete.view];
    const missing = missingSegs(view.segs, d.complete.remove, segKey);
    for (const code of completeProblems(missing, false, d.complete.grid)) problems.push(t.problem[code] as string);
  }
  if (task === "model") {
    if (!d.options.length) problems.push(t.problem.fewOptions);
    const own = viewSignature(d.features);
    optionsOf(d).forEach((o, i) => {
      if (i !== Math.min(d.correct, d.options.length) && viewSignature(o) === own) problems.push(t.problem.sameOption(LETTERS[i]));
    });
  }
  return problems;
};

const field = "td-focus rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";
const button = "td-focus rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40";

const NEW_FEATURE: Record<Exclude<FeatureType, "block">, Feature> = {
  step: { type: "step", edge: "left", width: 10, depth: 10 },
  slot: { type: "slot", along: "y", offset: 10, width: 10, depth: 5 },
  hole: { type: "hole", face: "front", a: 15, b: 15, diameter: 6, depth: 0 },
  chamfer: { type: "chamfer", edge: "top-front", size: 3 },
  box: { type: "box", op: "add", x: 0, y: 0, z: 30, w: 10, d: 10, h: 10 },
};

const NumberField = ({ label, value, onChange, testid, help }: { label: string; value: number; onChange: (v: number) => void; testid: string; help?: string }) => (
  <label className="flex flex-col text-xs text-slate-500" title={help}>
    {label}
    <input type="number" step="0.5" value={value} data-testid={testid} className={`${field} w-20`}
      onInput={(e) => { const raw = (e.target as HTMLInputElement).value; const v = Number(raw); if (raw !== "" && Number.isFinite(v)) onChange(v); }} />
  </label>
);
const SelectField = ({ label, value, options, onChange, testid, t }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void; testid: string; t: Texts }) => (
  <label className="flex flex-col text-xs text-slate-500">
    {label}
    <select value={value} data-testid={testid} className={field} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
      {options.map((o) => <option key={o} value={o}>{o.split("-").map((p) => t.option[p] ?? p).join(" – ")}</option>)}
    </select>
  </label>
);

const FeatureEditor = ({ features, onChange, t }: { features: Feature[]; onChange: (f: Feature[]) => void; t: Texts }) => {
  const [adding, setAdding] = useState<Exclude<FeatureType, "block">>("hole");
  const set = (i: number, patch: Record<string, unknown>) => onChange(features.map((f, j) => (j === i ? parseFeature({ ...f, ...patch })! : f)));
  return (
    <div className="flex flex-col gap-2">
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {features.map((f, i) => {
          const num = (key: string, help?: string) => <NumberField key={key} label={t.fields[key]} help={help} value={(f as any)[key]} testid={`f${i}-${key}`} onChange={(v) => set(i, { [key]: v })} />;
          const sel = (key: string, options: readonly string[]) => <SelectField key={key} label={t.fields[key]} value={(f as any)[key]} options={options} t={t} testid={`f${i}-${key}`} onChange={(v) => set(i, { [key]: v })} />;
          return (
            <li key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-2" data-testid={`feature-${i}`}>
              <span className="w-24 self-center text-sm font-semibold text-slate-700">{i + 1}. {t.feature[f.type]}</span>
              {f.type === "block" && [num("w"), num("d"), num("h")]}
              {f.type === "box" && [sel("op", ["add", "cut"]), num("x"), num("y"), num("z"), num("w"), num("d"), num("h")]}
              {f.type === "step" && [sel("edge", STEP_EDGES), num("width"), num("depth")]}
              {f.type === "slot" && [sel("along", ["x", "y"]), num("offset", t.slotOffsetHelp[f.along]), num("width"), num("depth")]}
              {f.type === "hole" && [sel("face", HOLE_FACES), num("a", t.holeAB[f.face]), num("b", t.holeAB[f.face]), num("diameter"), num("depth", t.holeDepthHelp)]}
              {f.type === "chamfer" && [sel("edge", CHAMFER_EDGES), num("size")]}
              {f.type === "hole" && <span className="self-center text-xs text-slate-500">{t.holeAB[f.face]}; {t.holeDepthHelp}</span>}
              {i > 0 && <button type="button" className={`${button} ml-auto`} data-testid={`remove-${i}`} onClick={() => onChange(features.filter((_, j) => j !== i))}>{t.removeFeature}</button>}
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-2">
        <select value={adding} className={field} data-testid="add-type" aria-label={t.addFeature} onChange={(e) => setAdding((e.target as HTMLSelectElement).value as any)}>
          {(Object.keys(NEW_FEATURE) as (keyof typeof NEW_FEATURE)[]).map((k) => <option key={k} value={k}>{t.feature[k]}</option>)}
        </select>
        <button type="button" className={button} data-testid="add-feature" onClick={() => onChange([...features, { ...NEW_FEATURE[adding] }])}>{t.addFeature}</button>
      </div>
    </div>
  );
};

const Authoring = ({ initial, task: initialTask, language, candidateLanguage, onChange }: {
  initial: Drawing; task: TaskType; language: string; candidateLanguage: string; onChange: (d: Drawing, task: TaskType) => void;
}) => {
  const t = textsFor(language);
  const [drawing, setDrawing] = useState<Drawing>(initial);
  const [task, setTask] = useState<TaskType>(initialTask);
  const [tab, setTab] = useState<"workpiece" | "task">("workpiece");
  const [editing, setEditing] = useState(-1); // -1: the drawn workpiece, else a distractor
  const commit = (next: Drawing, nextTask = task) => {
    setDrawing(next);
    setTask(nextTask);
    onChange(next, nextTask);
  };
  const features = drawing.features;
  const views = useMemo(() => computeViews(features), [JSON.stringify(features)]);
  const dims = useMemo(() => dimensionsOf(features), [JSON.stringify(features)]);
  const problems = authoringProblems(drawing, task, language);
  const shown = dims.filter((d) => { const s = dimState(drawing, d); return s === "show" || (s === "ask" && task === "dimensions"); });
  const remove = drawing.complete.remove;
  const completeView = views[drawing.complete.view];
  const marked = new Set(task === "complete" ? missingSegs(completeView.segs, remove, segKey).map(segKey) : []);
  const setComplete = (patch: Partial<Drawing["complete"]>) => commit({ ...drawing, complete: { ...drawing.complete, ...patch } });
  const editFeatures = editing < 0 ? features : drawing.options[editing] ?? features;
  const setFeatures = (next: Feature[]) =>
    editing < 0 ? commit({ ...drawing, features: next }) : commit({ ...drawing, options: drawing.options.map((o, i) => (i === editing ? next : o)) });

  const tabButton = (id: "workpiece" | "task", label: string) => (
    <button type="button" role="tab" aria-selected={tab === id} data-testid={`tab-${id}`} onClick={() => setTab(id)}
      className={`td-focus rounded-t-lg border-b-2 px-4 py-2 text-sm ${tab === id ? "border-blue-700 font-semibold text-blue-900" : "border-transparent text-slate-600"}`}>{label}</button>
  );

  return (
    <div className="flex flex-col gap-3 bg-slate-50 p-3 font-sans text-slate-800">
      <div role="tablist" className="flex gap-1 border-b border-slate-200">
        {tabButton("workpiece", t.tabWorkpiece)}
        {tabButton("task", t.tabTask)}
      </div>

      {tab === "workpiece" && (
        <div role="tabpanel" className="flex flex-col gap-2">
          {task === "model" && drawing.options.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              {t.editing}
              <select className={field} value={editing} data-testid="editing" onChange={(e) => setEditing(Number((e.target as HTMLSelectElement).value))}>
                <option value={-1}>{t.correctWorkpiece}</option>
                {drawing.options.map((_, i) => <option key={i} value={i}>{t.distractor(i + 1)}</option>)}
              </select>
            </label>
          )}
          <FeatureEditor features={editFeatures} onChange={setFeatures} t={t} />
        </div>
      )}

      {tab === "task" && (
        <div role="tabpanel" className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            {t.taskLabel}
            <select className={field} value={task} data-testid="task" onChange={(e) => commit(drawing, (e.target as HTMLSelectElement).value as TaskType)}>
              {TASK_TYPES.map((k) => <option key={k} value={k}>{t.task[k]}</option>)}
            </select>
          </label>
          {(task === "dimensions" || task === "read") && (
            <table className="w-full max-w-3xl border-collapse text-sm" data-testid="dims">
              <caption className="text-left font-semibold">{t.dims}</caption>
              <thead><tr className="text-left text-xs text-slate-500">
                <th className="py-1">{t.dimColumns.dim}</th><th>{t.dimColumns.view}</th><th>{t.dimColumns.value}</th><th>{t.dimColumns.state}</th>
              </tr></thead>
              <tbody>
                {dims.map((d) => (
                  <tr key={d.id} className="border-t border-slate-200">
                    <td className="py-1">{dimLabel(t, d, features)}</td>
                    <td>{t.view[d.view]}</td>
                    <td>{d.value}</td>
                    <td>
                      <select className={field} value={dimState(drawing, d)} data-testid={`state-${d.id}`} aria-label={`${dimLabel(t, d, features)}: ${t.dimColumns.state}`}
                        onChange={(e) => commit({ ...drawing, dims: { ...drawing.dims, [d.id]: (e.target as HTMLSelectElement).value as DimState } })}>
                        {(task === "dimensions" ? ["show", "hide", "ask"] : ["show", "hide"]).map((s) => <option key={s} value={s}>{t.dimState[s]}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {task === "read" && (
            <div className="flex flex-col gap-2">
              {drawing.questions.map((q, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col text-xs text-slate-500">{t.questionText}
                    <input type="text" value={q.text} className={`${field} w-80`} data-testid={`question-text-${i}`}
                      onInput={(e) => commit({ ...drawing, questions: drawing.questions.map((x, j) => (j === i ? { ...x, text: (e.target as HTMLInputElement).value } : x)) })} />
                  </label>
                  <label className="flex flex-col text-xs text-slate-500">{t.answerDim}
                    <select className={field} value={q.dim} data-testid={`question-dim-${i}`}
                      onChange={(e) => commit({ ...drawing, questions: drawing.questions.map((x, j) => (j === i ? { ...x, dim: (e.target as HTMLSelectElement).value } : x)) })}>
                      <option value="">–</option>
                      {dims.map((d) => <option key={d.id} value={d.id}>{dimLabel(t, d, features)} ({d.value})</option>)}
                    </select>
                  </label>
                  <button type="button" className={button} onClick={() => commit({ ...drawing, questions: drawing.questions.filter((_, j) => j !== i) })}>{t.removeFeature}</button>
                </div>
              ))}
              <button type="button" className={`${button} self-start`} data-testid="add-question"
                onClick={() => commit({ ...drawing, questions: [...drawing.questions, { text: "", dim: dims[0]?.id ?? "" }] })}>{t.addQuestion}</button>
            </div>
          )}
          {task === "complete" && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-3">
                <SelectField label={t.completeView} value={drawing.complete.view} options={VIEW_NAMES} t={{ ...t, option: t.view as any }} testid="complete-view"
                  onChange={(v) => setComplete({ view: v as ViewName, remove: [] })} />
                <NumberField label={t.grid} value={drawing.complete.grid} testid="grid-step" onChange={(v) => v > 0 && setComplete({ grid: v })} />
                {(["visible", "hidden", "extra"] as const).map((k) => (
                  <NumberField key={k} label={t.points[k]} value={drawing.complete.points[k]} testid={`points-${k}`}
                    onChange={(v) => setComplete({ points: { ...drawing.complete.points, [k]: Math.max(0, Math.round(v)) } })} />
                ))}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={remove === "all"} data-testid="remove-all" onChange={(e) => setComplete({ remove: (e.target as HTMLInputElement).checked ? "all" : [] })} />
                  {t.removeAll}
                </label>
              </div>
              <p className="m-0 text-xs text-slate-600">{t.removeHelp}</p>
            </div>
          )}
          {task === "view" && (
            <SelectField label={t.identifyView} value={drawing.identify.view} options={VIEW_NAMES} t={{ ...t, option: t.view as any }} testid="identify-view"
              onChange={(v) => commit({ ...drawing, identify: { view: v as ViewName } })} />
          )}
          {task === "model" && (
            <div className="flex flex-wrap items-end gap-3">
              <SelectField label={t.optionCount} value={String(drawing.options.length + 1)} options={["2", "3", "4"]} t={t} testid="option-count"
                onChange={(v) => {
                  const n = Number(v) - 1;
                  const extra = variantsOf(features, 6).filter((o) => !drawing.options.some((x) => viewSignature(x) === viewSignature(o)));
                  const options = drawing.options.slice(0, n).concat(extra).slice(0, n);
                  commit({ ...drawing, options, correct: Math.min(drawing.correct, options.length) });
                }} />
              <SelectField label={t.correctPosition} value={LETTERS[Math.min(drawing.correct, drawing.options.length)]} options={LETTERS.slice(0, drawing.options.length + 1)} t={t}
                testid="correct-position" onChange={(v) => commit({ ...drawing, correct: LETTERS.indexOf(v) })} />
              <button type="button" className={button} data-testid="regenerate"
                onClick={() => commit({ ...drawing, options: variantsOf(features, Math.max(2, drawing.options.length || 2)) })}>{t.regenerate}</button>
            </div>
          )}
        </div>
      )}

      <section className="flex flex-wrap items-start gap-3" aria-label={t.preview}>
        <div className="min-w-[300px] flex-[3_1_420px]">
          <DrawingSheet features={features} views={views} dims={task === "view" ? [] : placeDims(shown)} show={task === "view" && tab === "task" ? [drawing.identify.view] : VIEW_NAMES}
            labels texts={textsFor(candidateLanguage)} language={candidateLanguage === "nl" ? "nl" : "en"} label={t.preview}
            asked={Object.fromEntries(task === "dimensions" ? askedOf(task, drawing, dims).map((a, index) => [a.dim.id, { index, value: "", label: dimLabel(t, a.dim, features) }]) : [])}
            readOnly marked={marked} gridView={task === "complete" ? drawing.complete.view : undefined}
            onSegClick={task === "complete" && tab === "task" ? (s) => {
              if (!completeView.segs.includes(s)) return;
              const key = segKey(s);
              const list = remove === "all" ? completeView.segs.map(segKey) : remove;
              setComplete({ remove: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] });
            } : undefined} />
        </div>
        <div className="min-w-[260px] flex-[2_1_280px]">
          <ModelViewer workpieces={task === "model" ? optionsOf(drawing) : [editFeatures]} labels={task === "model" ? optionsOf(drawing).map((_, i) => LETTERS[i]) : []}
            selected={task === "model" ? Math.min(drawing.correct, drawing.options.length) : null} texts={t} announce={() => {}} mode="3d" height={260} />
        </div>
      </section>

      <section aria-live="polite" data-testid="problems" className={`rounded-lg border p-2 text-sm ${problems.length ? "border-amber-400 bg-amber-50" : "border-emerald-300 bg-emerald-50"}`}>
        <strong>{t.problems}: </strong>
        {problems.length ? <ul className="m-0 pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul> : t.noProblems}
      </section>
    </div>
  );
};

export default Authoring;
