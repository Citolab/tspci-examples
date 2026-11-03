import { useMemo, useState } from "preact/hooks";
import { useStore } from "@citolab/preact-store";
import Interaction, { NumberField } from "./interaction";
import { DEFAULT_DIMS, DIMENSIONS, Model, PlaneParams, SOLID_TYPES, SolidType, ShapeCode, reachableKinds, sectionOf } from "./geometry";
import { CONTROLS, TARGETS, evaluate, formatNumber, parseSettings, planeText } from "./settings";
import { initStore } from "./store";
import { textsFor } from "./texts";
import { modelOf } from "./response";

// The authoring mode (index.tsx getAuthoringInstance): the solid and its dimensions, the controls the candidate gets,
// the target and the planes (start and solution), set in a live preview. The result is the data- attributes.

const reachable = new Map<string, Set<ShapeCode>>();
const reachableFor = (m: Model) => {
  const key = JSON.stringify(m.spec);
  if (!reachable.has(key)) reachable.set(key, reachableKinds(m));
  return reachable.get(key)!;
};

/** What keeps the settings from making a good item (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (properties: Record<string, string>, language: string): string[] => {
  const t = textsFor(language);
  const s = parseSettings(properties);
  const m = modelOf(s);
  const problems: string[] = [];
  if (s.mode !== "answer") return problems;
  const { target } = s;
  if (!target.shape && !target.lengths.length && target.area === null) problems.push(t.problemNoTarget);
  if (!target.shape && target.lengths.length) problems.push(t.problemLengths);
  if (target.shape && target.shape !== "curved" && !reachableFor(m).has(target.shape))
    problems.push(t.problemImpossible(t.solid[s.solid], t.shape[target.shape]));
  const scored = target.shape || target.lengths.length || target.area !== null;
  if (scored) {
    if (!s.solution) problems.push(t.problemNoSolution);
    else if (!evaluate(target, sectionOf(m, s.solution, s.tolerance)).correct) problems.push(t.problemSolution);
    if (evaluate(target, sectionOf(m, s.start, s.tolerance)).correct) problems.push(t.problemStart);
  }
  if (!["move", "tilt", "turn", "handles", "points"].some((c) => s.controls.has(c as any))) problems.push(t.problemNoControls);
  return problems;
};

const input = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-sky-600";
const button = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-600";
type Tab = "solid" | "controls" | "target";

const Authoring = ({ initial, language, onChange }: { initial: Record<string, string>; language: string; onChange: (p: Record<string, string>) => void }) => {
  const t = textsFor(language);
  const [props, setProps] = useState(initial);
  const [tab, setTab] = useState<Tab>("solid");
  const commit = (patch: Record<string, string>) => {
    const next = { ...props, ...patch };
    setProps(next);
    onChange(next);
  };
  const s = parseSettings(props);
  const model = useMemo(() => modelOf(s), [s.solid, s.dims.join(" "), s.baseSides]);
  const n = (x: number) => formatNumber(x, language);
  // the preview: every control, the author's language, its own store (a new one for a new solid)
  const preview = useMemo(
    () => initStore({ plane: s.solution ?? s.start, changed: false, hide: "none", input: "sliders", points: [null, null, null], found: [] }),
    [model],
  );
  const { plane } = useStore(preview);
  const previewSettings = { ...s, language: language === "nl" ? "nl" : "en", controls: new Set(CONTROLS), showName: true, showMeasures: true } as typeof s;
  const section = sectionOf(model, plane, s.tolerance);
  const evaluation = evaluate(s.target, section);
  const problems = authoringProblems(props, language);

  const dims = DIMENSIONS[s.solid].map((_, i) => model.spec.dims[i] ?? DEFAULT_DIMS[s.solid][i]);
  const setDim = (i: number, v: number) => commit({ dimensions: dims.map((d, j) => (j === i ? v : d)).join(" ") });
  const controls = new Set(s.controls);
  const toggle = (c: string, on: boolean) => {
    if (on) controls.add(c as any);
    else controls.delete(c as any);
    commit({ controls: CONTROLS.filter((x) => controls.has(x)).join(" ") });
  };
  const check = (label: string, key: string, value: boolean) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={value} onChange={(e) => commit({ [key]: String((e.target as HTMLInputElement).checked) })} />
      {label}
    </label>
  );
  const numberProp = (label: string, key: string, value: number | null, min = 0, max = 1000) => (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      {value === null ? (
        <input type="text" className={`${input} w-20`} aria-label={label} value="" onChange={(e) => commit({ [key]: (e.target as HTMLInputElement).value.replace(",", ".") })} />
      ) : (
        <NumberField value={value} min={min} max={max} language={language} label={label} onCommit={(v) => commit({ [key]: String(v) })} />
      )}
    </label>
  );
  const planeLabel = (p: PlaneParams | null) => (p ? `${n(p.offset)} cm · ${n(p.tilt)}° · ${n(p.turn)}°` : t.noSolution);
  const uniqueMeasures = section.measures.map((x) => Math.round(x * 10) / 10).filter((x, i, all) => all.findIndex((y) => Math.abs(y - x) < 1e-9) === i);

  const tabs: [Tab, string][] = [["solid", t.tabSolid], ["controls", t.tabControls], ["target", t.tabTarget]];
  return (
    <div className="cross-section-authoring flex flex-col gap-3 p-1 font-sans text-slate-800">
      <div role="tablist" className="flex gap-1 border-b border-slate-200">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} aria-controls={`cs-tab-${id}`}
            className={`-mb-px rounded-t-lg border px-3 py-1.5 text-sm ${tab === id ? "border-slate-200 border-b-white bg-white font-semibold" : "border-transparent text-slate-500"}`}
            onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div id={`cs-tab-${tab}`} role="tabpanel" className="grid gap-3 sm:grid-cols-2">
        {tab === "solid" && (
          <>
            <div className="flex flex-col gap-2">
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>{t.solidType}</span>
                <select className={input} value={s.solid} data-testid="solid"
                  onChange={(e) => {
                    const solid = (e.target as HTMLSelectElement).value as SolidType;
                    commit({ solid, dimensions: DEFAULT_DIMS[solid].join(" "), plane: "0 0 0", solutionPlane: "" });
                  }}>
                  {SOLID_TYPES.map((x) => <option key={x} value={x}>{t.capital(t.solid[x])}</option>)}
                </select>
              </label>
              {DIMENSIONS[s.solid].map((d, i) => (
                <label key={`${s.solid}-${d}`} className="flex items-center justify-between gap-2 text-sm">
                  <span>{t.capital(t.dim[d])} (cm)</span>
                  <NumberField value={dims[i]} min={0.5} max={100} language={language} label={`${t.capital(t.dim[d])} (cm)`} onCommit={(v) => setDim(i, v)} testid={`dim-${d}`} />
                </label>
              ))}
              {(s.solid === "prism" || s.solid === "pyramid") && (
                <label className="flex items-center justify-between gap-2 text-sm">
                  <span>{t.baseSides}</span>
                  <select className={input} value={String(s.baseSides)} onChange={(e) => commit({ baseSides: (e.target as HTMLSelectElement).value })}>
                    {[3, 4, 5, 6, 7, 8].map((k) => <option key={k} value={String(k)}>{k}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-sm">
                <span>{t.prompt}</span>
                <textarea className={`${input} min-h-[64px]`} value={props.prompt ?? ""} onChange={(e) => commit({ prompt: (e.target as HTMLTextAreaElement).value })} />
              </label>
              <fieldset className="m-0 flex flex-col gap-1 border-0 p-0 text-sm">
                <legend className="mb-1">{t.mode}</legend>
                {(["answer", "tool"] as const).map((m) => (
                  <label key={m} className="flex items-center gap-2">
                    <input type="radio" name="cs-mode" checked={s.mode === m} onChange={() => commit({ mode: m })} />
                    {m === "answer" ? t.modeAnswer : t.modeTool}
                  </label>
                ))}
              </fieldset>
              {check(t.showLabelsLabel, "showLabels", s.showLabels)}
            </div>
          </>
        )}
        {tab === "controls" && (
          <>
            <div className="flex flex-col gap-1.5">
              {CONTROLS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={s.controls.has(c)} onChange={(e) => toggle(c, (e.target as HTMLInputElement).checked)} />
                  {t.controlNames[c]}
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {check(t.showNameLabel, "showName", s.showName)}
              {check(t.showMeasuresLabel, "showMeasures", s.showMeasures)}
              <p className="m-0 text-sm"><span className="text-slate-500">{t.startPlane}:</span> <span data-testid="start-plane">{planeLabel(s.start)}</span></p>
              <button type="button" className={button} onClick={() => commit({ plane: planeText(plane) })}>{t.useAsStart}</button>
            </div>
          </>
        )}
        {tab === "target" && (
          <>
            <div className="flex flex-col gap-2">
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>{t.targetShape}</span>
                <select className={input} value={s.target.shape ?? ""} data-testid="target-shape" onChange={(e) => commit({ targetShape: (e.target as HTMLSelectElement).value })}>
                  <option value="">{t.noTarget}</option>
                  {TARGETS.map((x) => <option key={x} value={x}>{t.capital(t.shape[x])}</option>)}
                </select>
              </label>
              {check(t.exactShape, "exactShape", s.target.exact)}
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>{t.targetLengths}</span>
                <input type="text" className={`${input} w-28`} value={props.targetLengths ?? ""} data-testid="target-lengths"
                  onChange={(e) => commit({ targetLengths: (e.target as HTMLInputElement).value })} />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>{t.targetArea}</span>
                <input type="text" className={`${input} w-28`} value={props.targetArea ?? ""} data-testid="target-area"
                  onChange={(e) => commit({ targetArea: (e.target as HTMLInputElement).value })} />
              </label>
              {numberProp(t.margin, "margin", s.target.margin)}
              {numberProp(t.areaMargin, "areaMargin", s.target.areaMargin)}
              {numberProp(t.tolerance, "tolerance", s.tolerance.angle, 0, 20)}
            </div>
            <div className="flex flex-col gap-2">
              <button type="button" className={button} onClick={() => commit({
                targetShape: section.shape === "none" ? "" : section.shape, targetLengths: uniqueMeasures.map(String).join(" "), solutionPlane: planeText(plane),
              })}>{t.useAsTarget}</button>
              <button type="button" className={button} onClick={() => commit({ solutionPlane: planeText(plane) })}>{t.useAsSolution}</button>
              <p className="m-0 text-sm"><span className="text-slate-500">{t.solutionPlane}:</span> <span data-testid="solution-plane">{planeLabel(s.solution)}</span></p>
              {evaluation.maxscore > 0 && <p className="m-0 text-sm font-medium" data-testid="summary">{t.scores(evaluation.score, evaluation.maxscore)}</p>}
            </div>
          </>
        )}
      </div>
      {problems.length > 0 && (
        <ul className="m-0 list-disc rounded-lg bg-rose-50 py-2 pl-6 pr-3 text-sm text-rose-800 ring-1 ring-rose-200" data-testid="problems">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <p className="m-0 text-xs text-slate-500">{t.preview}</p>
      <Interaction key={JSON.stringify(model.spec)} prompt="" settings={previewSettings} model={model} store={preview} texts={t} readOnly={false} />
    </div>
  );
};

export default Authoring;
