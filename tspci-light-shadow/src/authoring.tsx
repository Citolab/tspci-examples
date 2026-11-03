import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  Axis, Field, LIMITS, Lamp, MAX_TARGETS, ObjectType, Range, Scene, Target, evaluate, fieldsOf, measure, ownPositions,
  responseProcessing, sceneProblems, startPositions,
} from "./optics";
import { Texts, textsFor } from "./texts";
import { formatNumber, parseNumber } from "./format";
import { initStore } from "./store";
import Interaction from "./interaction";
import Drawing from "./drawing";

// The authoring mode (index.tsx getAuthoringInstance): the scene (screen, object, lamps, what moves and how far), the
// targets with their margins, and a solution placed as a candidate would. The result is data-scene (optics.ts).

/** What keeps the scene from working (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (scene: Scene, mode: string, language: string): string[] => {
  const t = textsFor(language);
  return sceneProblems(scene, mode).map((p) => t.problem(p));
};

const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-sky-600";
type Tab = "scene" | "targets" | "solution";

/** A number field that takes a decimal comma too; the value goes out as soon as it reads as a number. */
const NumberField = ({ label, value, onChange, language, testid, limits, className = "w-20" }: {
  label: string; value: number; onChange: (v: number) => void; language: "en" | "nl"; testid: string; limits?: Range; className?: string;
}) => {
  const shown = formatNumber(value, Number.isInteger(value) ? 0 : 2, language).replace(/(,|\.)?0+$/, (m) => (m.includes(",") || m.includes(".") ? "" : m));
  const [text, setText] = useState(shown);
  useEffect(() => {
    if (parseNumber(text.replace("−", "-")) !== value) setText(shown);
  }, [value]);
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500">{label}</span>
      <input type="text" inputMode="decimal" className={`${field} ${className}`} value={text} data-testid={testid} aria-label={label}
        onInput={(e) => {
          const raw = (e.currentTarget as HTMLInputElement).value;
          setText(raw);
          const n = parseNumber(raw);
          if (n !== null) onChange(n); // kept in its limits when the author leaves the field: "1" is on its way to "100"
        }}
        onBlur={() => {
          const n = limits ? Math.min(limits[1], Math.max(limits[0], value)) : value;
          if (n !== value) onChange(n);
          setText(shown);
        }} />
    </label>
  );
};

const Authoring = ({ initial, mode, language, onChange }: { initial: Scene; mode: "answer" | "tool"; language: string; onChange: (s: Scene) => void }) => {
  const t: Texts = textsFor(language);
  const lang: "en" | "nl" = language === "nl" ? "nl" : "en";
  const [scene, setScene] = useState<Scene>(initial);
  const [tab, setTab] = useState<Tab>("scene");
  const [view, setView] = useState<"side" | "top">("side");
  const commit = (next: Scene) => {
    // the solution follows the scene: what is fixed now stays put, what moves stays in its range
    const fixed = { ...next, solution: next.solution ? ownPositions(next, next.solution) : null };
    setScene(fixed);
    onChange(fixed);
  };
  const problems = sceneProblems(scene, mode).map((p) => t.problem(p));
  const n = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "–" : formatNumber(v, d, lang));

  const o = scene.object;
  const setObject = (patch: Partial<Scene["object"]>) => {
    const object = { ...o, ...patch };
    if (object.type === "ball") object.height = object.depth = object.width;
    if (object.type === "figure") object.depth = 0;
    if (object.type === "block" && object.depth <= 0) object.depth = object.width;
    commit({ ...scene, object });
  };
  const setLamp = (i: number, patch: Partial<Lamp>) => commit({ ...scene, lamps: scene.lamps.map((l, k) => (k === i ? { ...l, ...patch } : l)) });
  const setLampCount = (count: number) => {
    if (count === scene.lamps.length) return;
    const lamps = count === 1 ? scene.lamps.slice(0, 1) : [{ ...scene.lamps[0], z: -40 }, { ...scene.lamps[0], z: 40, move: { ...scene.lamps[0].move } }];
    const targets = count === 1 ? scene.targets.filter((x) => !x.field.startsWith("lamp2")) : scene.targets;
    commit({ ...scene, lamps, targets, solution: scene.solution ? { ...scene.solution, lamps: lamps.map(({ x, y, z }) => ({ x, y, z })) } : null });
  };

  const axisLabel = (a: Axis) => (a === "x" ? t.distance : a === "y" ? t.height : t.side);
  const limitsOf = (a: Axis) => (a === "x" ? LIMITS.distance : a === "y" ? LIMITS.height : LIMITS.side);
  /** A start value, a "can move" checkbox and its range. */
  const moveRow = (id: string, label: string, start: number, setStart: (v: number) => void, r: Range | null | undefined, setRange: (r: Range | null) => void, limits: Range) => (
    <div className="flex flex-wrap items-end gap-2" data-testid={`row-${id}`}>
      <NumberField label={`${label}: ${t.start.toLowerCase()}`} value={start} onChange={setStart} language={lang} testid={`${id}-start`} limits={limits} />
      <label className="mb-1 inline-flex items-center gap-1.5 text-sm">
        <input type="checkbox" checked={!!r} data-testid={`${id}-movable`} aria-label={`${t.movable}: ${label}`}
          onChange={(e) => setRange((e.currentTarget as HTMLInputElement).checked ? [Math.max(limits[0], start - 50), Math.min(limits[1], start + 50)] : null)} />
        {t.movable}
      </label>
      {r && (
        <>
          <NumberField label={t.from} value={r[0]} onChange={(v) => setRange([v, r[1]])} language={lang} testid={`${id}-from`} limits={limits} />
          <NumberField label={t.to} value={r[1]} onChange={(v) => setRange([r[0], v])} language={lang} testid={`${id}-to`} limits={limits} />
        </>
      )}
    </div>
  );

  // the solution: the candidate's own view, without the 3D (an authoring system's frame may have no WebGL to spare)
  const current = useRef(scene);
  current.current = scene;
  const solutionStore = useMemo(() => {
    const store = initStore({ positions: scene.solution ?? startPositions(scene), moved: false, tried: [] });
    // subscribed right away (not in an effect after the paint): the author may move something at once
    store.subscribe((state) => {
      const next = { ...current.current, solution: state.positions };
      current.current = next;
      setScene(next);
      onChange(next);
    }, { immediate: false });
    return store;
  }, [tab === "solution"]);
  useEffect(() => () => solutionStore.unsubscribeAll(), [solutionStore]);

  const evaluation = scene.solution ? evaluate(scene, scene.solution) : null;
  const solutionValues = scene.solution ? measure(scene, scene.solution)?.values : null;
  const fields = fieldsOf(scene);
  const setTarget = (i: number, target: Target | null) => {
    const targets = [...scene.targets];
    if (target) targets[i] = target;
    else targets.splice(i, 1);
    commit({ ...scene, targets });
  };

  const tabs: [Tab, string][] = [["scene", t.tabScene], ["targets", t.tabTargets], ["solution", t.tabSolution]];
  return (
    <div className="flex w-full max-w-[1060px] flex-col gap-3 p-3 font-sans text-slate-800">
      <div role="tablist" aria-label="Authoring" className="flex gap-1 border-b border-slate-200">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`ls-tab-${id}`} aria-selected={tab === id} aria-controls={`ls-panel-${id}`} onClick={() => setTab(id)}
            className={`-mb-px rounded-t-lg border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-sky-600 ${tab === id ? "border-slate-200 border-b-white bg-white text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "scene" && (
        <div role="tabpanel" id="ls-panel-scene" aria-labelledby="ls-tab-scene" className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <fieldset className="m-0 flex flex-wrap gap-2 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.screenSize}</legend>
              <NumberField label={`${t.width} (cm)`} value={scene.screen.width} onChange={(v) => commit({ ...scene, screen: { ...scene.screen, width: v } })} language={lang} testid="screen-width" limits={[20, 600]} />
              <NumberField label={`${t.height} (cm)`} value={scene.screen.height} onChange={(v) => commit({ ...scene, screen: { ...scene.screen, height: v } })} language={lang} testid="screen-height" limits={[20, 400]} />
              <NumberField label={`${t.step} (cm)`} value={scene.step} onChange={(v) => commit({ ...scene, step: v })} language={lang} testid="step" limits={[0.1, 100]} />
            </fieldset>
            <fieldset className="m-0 flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.object[o.type]}</legend>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-500">{t.type}</span>
                  <select className={field} value={o.type} data-testid="object-type" onChange={(e) => setObject({ type: (e.currentTarget as HTMLSelectElement).value as ObjectType })}>
                    {(["figure", "ball", "block"] as ObjectType[]).map((k) => <option key={k} value={k}>{t.object[k]}</option>)}
                  </select>
                </label>
                <NumberField label={`${o.type === "ball" ? t.diameter : t.width} (cm)`} value={o.width} onChange={(v) => setObject({ width: v })} language={lang} testid="object-width" limits={LIMITS.object} />
                {o.type !== "ball" && <NumberField label={`${t.height} (cm)`} value={o.height} onChange={(v) => setObject({ height: v })} language={lang} testid="object-height" limits={LIMITS.object} />}
                {o.type === "block" && <NumberField label={`${t.depth} (cm)`} value={o.depth} onChange={(v) => setObject({ depth: v })} language={lang} testid="object-depth" limits={LIMITS.object} />}
                <NumberField label={`${t.elevation} (cm)`} value={o.elevation} onChange={(v) => setObject({ elevation: v })} language={lang} testid="object-elevation" limits={LIMITS.height} className="w-24" />
              </div>
              {moveRow("object-x", t.distance, o.x, (v) => setObject({ x: v }), o.move, (r) => setObject({ move: r }), LIMITS.distance)}
            </fieldset>
            <fieldset className="m-0 flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.lamps}</legend>
              <div role="radiogroup" aria-label={t.lamps} className="flex gap-3 text-sm">
                {[1, 2].map((c) => (
                  <label key={c} className="inline-flex items-center gap-1.5">
                    <input type="radio" name="ls-lamps" checked={scene.lamps.length === c} onChange={() => setLampCount(c)} data-testid={`lamps-${c}`} />
                    {c === 1 ? t.oneLamp : t.twoLamps}
                  </label>
                ))}
              </div>
              {scene.lamps.map((lamp, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-md bg-slate-50 p-2" data-testid={`lamp-${i + 1}`}>
                  <div className="flex items-end gap-2">
                    <span className="mb-1 text-sm font-semibold">{t.lamp(i + 1, scene.lamps.length)}</span>
                    <NumberField label={`${t.size} (cm)`} value={lamp.size} onChange={(v) => setLamp(i, { size: v })} language={lang} testid={`lamp${i + 1}-size`} limits={LIMITS.size} className="w-24" />
                  </div>
                  {(["x", "y", "z"] as Axis[]).map((a) =>
                    moveRow(`lamp${i + 1}-${a}`, axisLabel(a), lamp[a], (v) => setLamp(i, { [a]: v } as Partial<Lamp>), lamp.move[a],
                      (r) => {
                        const move = { ...lamp.move };
                        if (r) move[a] = r;
                        else delete move[a];
                        setLamp(i, { move });
                      }, limitsOf(a))
                  )}
                </div>
              ))}
            </fieldset>
          </div>
          <div className="flex flex-col gap-2">
            <div role="radiogroup" aria-label={t.drawing} className="inline-flex w-fit rounded-lg bg-slate-100 p-0.5 text-xs">
              {(["side", "top"] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)}
                  className={`rounded-md px-2.5 py-1 font-medium ${view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}>{v === "side" ? t.sideView : t.topView}</button>
              ))}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-2">
              <Drawing scene={scene} positions={startPositions(scene)} measures={measure(scene, startPositions(scene))} view={view} texts={t} language={lang}
                showRays showMeasurements movable={() => false} onDrag={() => {}} onDragEnd={() => {}} />
            </div>
          </div>
        </div>
      )}

      {tab === "targets" && (
        <div role="tabpanel" id="ls-panel-targets" aria-labelledby="ls-tab-targets" className="flex flex-col gap-3">
          <p className="m-0 text-sm text-slate-600">{t.targetsHint}</p>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {scene.targets.map((target, i) => {
              const result = evaluation?.results[i];
              return (
                <li key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-2" data-testid={`target-${i}`}>
                  <span className="mb-1 font-mono text-xs text-slate-500">check{i + 1}</span>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-xs text-slate-500">{t.tabTargets}</span>
                    <select className={field} value={target.field} data-testid={`target-${i}-field`}
                      onChange={(e) => setTarget(i, { ...target, field: (e.currentTarget as HTMLSelectElement).value as Field })}>
                      {fields.map((f) => <option key={f} value={f}>{t.field[f]}</option>)}
                    </select>
                  </label>
                  <NumberField label={t.value} value={target.value} onChange={(v) => setTarget(i, { ...target, value: v })} language={lang} testid={`target-${i}-value`} />
                  <NumberField label={t.margin} value={target.margin} onChange={(v) => setTarget(i, { ...target, margin: Math.max(0, v) })} language={lang} testid={`target-${i}-margin`} />
                  <NumberField label={t.points} value={target.points} onChange={(v) => setTarget(i, { ...target, points: Math.max(0, Math.round(v)) })} language={lang} testid={`target-${i}-points`} className="w-14" />
                  <span className={`mb-1 rounded-full px-2 py-0.5 text-xs font-medium ${!result ? "bg-slate-100 text-slate-500" : result.passed ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`} data-testid={`target-${i}-result`}>
                    {result ? `${result.passed ? "✓" : "✗"} ${t.solutionValue}: ${n(result.value, target.field === "magnification" ? 2 : 1)} (${result.passed ? t.met : t.notMet})` : t.problem({ code: "noSolution" })}
                  </span>
                  <button type="button" className="mb-1 ml-auto rounded-md px-2 text-slate-400 hover:text-rose-700" aria-label={`${t.removeTarget} ${i + 1}`} onClick={() => setTarget(i, null)}>×</button>
                </li>
              );
            })}
          </ol>
          {scene.targets.length < MAX_TARGETS && (
            <button type="button" className="w-fit rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50" data-testid="add-target"
              onClick={() => commit({ ...scene, targets: [...scene.targets, { field: "shadowHeight", value: Math.round(solutionValues?.shadowHeight ?? 50), margin: 1, points: 1 }] })}>
              {t.addTarget}
            </button>
          )}
          {evaluation && scene.targets.length > 0 && <p className="m-0 text-sm font-medium" data-testid="summary">{t.summary(evaluation.score, evaluation.maxscore)}</p>}
          <details className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
            <summary className="cursor-pointer font-medium">{t.responseProcessing}</summary>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre text-[11px] leading-snug" data-testid="response-processing">{responseProcessing(scene)}</pre>
          </details>
        </div>
      )}

      {tab === "solution" && (
        <div role="tabpanel" id="ls-panel-solution" aria-labelledby="ls-tab-solution" className="flex flex-col gap-3">
          <p className="m-0 text-sm text-slate-600">{t.solutionHint}</p>
          <Interaction prompt="" scene={scene} store={solutionStore} texts={t}
            options={{ mode: "answer", view: "2d", showRays: true, showMeasurements: true, language: lang, readOnly: false, solution: false }} />
          {evaluation && scene.targets.length > 0 && <p className="m-0 text-sm font-medium" data-testid="summary">{t.summary(evaluation.score, evaluation.maxscore)}</p>}
        </div>
      )}

      <section aria-label={t.problems} className={`rounded-lg p-2 text-sm ${problems.length ? "bg-rose-50 text-rose-900" : "bg-emerald-50 text-emerald-900"}`} data-testid="problems">
        {problems.length ? (
          <ul className="m-0 list-disc pl-5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        ) : (
          <p className="m-0">{t.noProblems}</p>
        )}
      </section>
    </div>
  );
};

export default Authoring;
