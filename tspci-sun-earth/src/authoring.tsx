import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  Field, MAX_TARGETS, NUMBER_FIELDS, PRESETS, Place, Setup, Target, controlled, evaluate, identifierOf, placeById,
  responseProcessing, setupProblems,
} from "./setup";
import { clock, dateOfDay } from "./solar";
import { sunAt, valuesOf } from "./model";
import { Texts, textsFor } from "./texts";
import { formatNumber, parseNumber } from "./format";
import { initStore } from "./store";
import Interaction from "./interaction";
import { EarthDiagram } from "./diagrams";

// The authoring mode (index.tsx getAuthoringInstance): the places, what the candidate controls, the start, the
// targets with their margins, and a solution set as a candidate would. The result is data-setup (setup.ts).

/** What keeps the task from working (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (setup: Setup, mode: string, language: string): string[] => {
  const t = textsFor(language);
  return setupProblems(setup, mode, (s) => valuesOf(setup, s)).map((p) => t.problem(p));
};

const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-sky-600";
type Tab = "task" | "targets" | "solution";

/** A number field that takes a decimal comma too; the value goes out as soon as it reads as a number. */
const NumberField = ({ label, value, onChange, language, testid, limits, className = "w-20" }: {
  label: string; value: number; onChange: (v: number) => void; language: "en" | "nl"; testid: string; limits?: [number, number]; className?: string;
}) => {
  const shown = formatNumber(value, Number.isInteger(value) ? 0 : 2, language).replace(/(,|\.)?0+$/, (m) => (m.includes(",") || m.includes(".") ? "" : m)).replace("−", "-");
  const [text, setText] = useState(shown);
  useEffect(() => {
    if (parseNumber(text) !== value) setText(shown);
  }, [value]);
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500">{label}</span>
      <input type="text" inputMode="decimal" className={`${field} ${className}`} value={text} data-testid={testid}
        onInput={(e) => {
          const raw = (e.currentTarget as HTMLInputElement).value;
          setText(raw);
          const n = parseNumber(raw);
          if (n !== null) onChange(n); // kept in its limits when the author leaves the field
        }}
        onBlur={() => {
          const n = limits ? Math.min(limits[1], Math.max(limits[0], value)) : value;
          if (n !== value) onChange(n);
          setText(shown);
        }} />
    </label>
  );
};

/** "04:30" → 270 minutes; anything else null. */
const parseClock = (text: string) => {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(text);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
};

const ClockField = ({ label, minutes, onChange, testid }: { label: string; minutes: number; onChange: (m: number) => void; testid: string }) => {
  const [text, setText] = useState(clock(minutes));
  useEffect(() => {
    if (parseClock(text) !== Math.round(minutes)) setText(clock(minutes));
  }, [minutes]);
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500">{label}</span>
      <input type="text" className={`${field} w-20`} value={text} data-testid={testid}
        onInput={(e) => {
          const raw = (e.currentTarget as HTMLInputElement).value;
          setText(raw);
          const m = parseClock(raw);
          if (m !== null) onChange(m);
        }}
        onBlur={() => setText(clock(minutes))} />
    </label>
  );
};

const Authoring = ({ initial, mode, timeBase, language, onChange }: {
  initial: Setup; mode: "answer" | "tool"; timeBase: "utc" | "local"; language: string; onChange: (s: Setup) => void;
}) => {
  const t: Texts = textsFor(language);
  const lang: "en" | "nl" = language === "nl" ? "nl" : "en";
  const [setup, setSetup] = useState<Setup>(initial);
  const [tab, setTab] = useState<Tab>("task");
  const [preset, setPreset] = useState("");
  const current = useRef(setup);
  current.current = setup;
  const commit = (next: Setup) => {
    current.current = next;
    setSetup(next);
    onChange(next);
  };
  const problems = authoringProblems(setup, mode, lang);
  const n = (v: number | string | null | undefined, d = 2) => (v === null || v === undefined ? "–" : typeof v === "string" ? v : formatNumber(v, d, lang));
  const dateText = (day: number) => {
    const { month, date } = dateOfDay(day);
    return t.date(date, t.months[month]);
  };

  // ---- places
  const uniqueId = (base: string, except: string | null) => {
    let id = base, k = 2;
    while (setup.places.some((p) => p.id === id && p.id !== except)) id = `${base}${k++}`;
    return id;
  };
  /** A place changed; when its id changes, the start, the solution and the targets follow. */
  const setPlace = (i: number, patch: Partial<Place>) => {
    const old = setup.places[i];
    let next: Place = { ...old, ...patch, name: { ...old.name, ...(patch.name ?? {}) } };
    if (patch.name?.en !== undefined) next = { ...next, id: uniqueId(identifierOf(patch.name.en || "place"), old.id) };
    const rename = (id: string) => (id === old.id ? next.id : id);
    commit({
      ...setup,
      places: setup.places.map((p, k) => (k === i ? next : p)),
      start: { ...setup.start, place: rename(setup.start.place) },
      solution: setup.solution ? { ...setup.solution, place: rename(setup.solution.place) } : null,
      targets: setup.targets.map((x) => (x.field === "place" ? { ...x, value: rename(String(x.value)) } : x)),
    });
  };
  const removePlace = (i: number) => {
    const places = setup.places.filter((_, k) => k !== i);
    const first = places[0]?.id ?? "";
    const keep = (id: string) => (places.some((p) => p.id === id) ? id : first);
    commit({ ...setup, places, start: { ...setup.start, place: keep(setup.start.place) }, solution: setup.solution ? { ...setup.solution, place: keep(setup.solution.place) } : null });
  };
  const addPlace = (p: Place) => commit({ ...setup, places: [...setup.places, { ...p, id: uniqueId(p.id, null) }] });
  const available = PRESETS.filter((p) => !setup.places.some((q) => q.id === p.id));

  // ---- the solution: the candidate's own view, without the 3D (an authoring system's frame may have no WebGL to spare)
  const solutionStore = useMemo(() => {
    const store = initStore({ setting: setup.solution ?? setup.start, moved: false, tried: [] });
    // subscribed right away (not in an effect after the paint): the author may change something at once
    store.subscribe((state) => commit({ ...current.current, solution: state.setting }), { immediate: false });
    return store;
  }, [tab === "solution"]);
  useEffect(() => () => solutionStore.unsubscribeAll(), [solutionStore]);

  const solutionValues = setup.solution ? valuesOf(setup, setup.solution) : null;
  const evaluation = solutionValues ? evaluate(setup, solutionValues) : null;
  const setTarget = (i: number, target: Target | null) => {
    const targets = [...setup.targets];
    if (target) targets[i] = target;
    else targets.splice(i, 1);
    commit({ ...setup, targets });
  };
  const newTarget = (f: Field): Target => {
    if (f === "place") return { field: f, value: setup.solution?.place ?? setup.places[0]?.id ?? "", margin: 0, points: 1 };
    const v = solutionValues?.[f];
    return { field: f, value: typeof v === "number" ? v : 0, margin: f === "day" ? 3 : f.endsWith("ime") || f === "sunrise" || f === "sunset" || f === "dayLength" ? 0.25 : 1, points: 1 };
  };

  const startPlace = placeById(setup, setup.start.place);
  const startSun = startPlace ? sunAt(controlled(setup, setup.start), startPlace.lat, startPlace.lon) : null;
  const tabs: [Tab, string][] = [["task", t.tabTask], ["targets", t.tabTargets], ["solution", t.tabSolution]];
  return (
    <div className="flex w-full max-w-[1060px] flex-col gap-3 p-3 font-sans text-slate-800">
      <div role="tablist" aria-label="Authoring" className="flex gap-1 border-b border-slate-200">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`se-tab-${id}`} aria-selected={tab === id} aria-controls={`se-panel-${id}`} onClick={() => setTab(id)}
            className={`-mb-px rounded-t-lg border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-sky-600 ${tab === id ? "border-slate-200 border-b-white bg-white text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "task" && (
        <div role="tabpanel" id="se-panel-task" aria-labelledby="se-tab-task" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="flex flex-col gap-4">
            <fieldset className="m-0 flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.places}</legend>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {setup.places.map((p, i) => (
                  <li key={i} className="flex flex-wrap items-end gap-2 rounded-md bg-slate-50 p-2" data-testid={`place-row-${i}`}>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-xs text-slate-500">{t.name}</span>
                      <input type="text" className={`${field} w-36`} value={p.name.en} data-testid={`place-${i}-name`}
                        onInput={(e) => setPlace(i, { name: { ...p.name, en: (e.currentTarget as HTMLInputElement).value } })} />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-xs text-slate-500">{t.nameNl}</span>
                      <input type="text" className={`${field} w-36`} value={p.name.nl} data-testid={`place-${i}-name-nl`}
                        onInput={(e) => setPlace(i, { name: { ...p.name, nl: (e.currentTarget as HTMLInputElement).value } })} />
                    </label>
                    <NumberField label={t.latitude} value={p.lat} onChange={(v) => setPlace(i, { lat: v })} language={lang} testid={`place-${i}-lat`} limits={[-90, 90]} className="w-24" />
                    <NumberField label={t.longitude} value={p.lon} onChange={(v) => setPlace(i, { lon: v })} language={lang} testid={`place-${i}-lon`} limits={[-180, 180]} className="w-24" />
                    <code className="mb-1.5 text-xs text-slate-500">{p.id}</code>
                    <button type="button" className="mb-1 ml-auto rounded-md px-2 text-slate-400 hover:text-rose-700" aria-label={t.removePlace(p.name[lang])} onClick={() => removePlace(i)}>×</button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-500">{t.presets}</span>
                  <select className={field} value={preset} data-testid="preset" onChange={(e) => setPreset((e.currentTarget as HTMLSelectElement).value)}>
                    <option value="">–</option>
                    {available.map((p) => <option key={p.id} value={p.id}>{p.name[lang]}</option>)}
                  </select>
                </label>
                <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-40" disabled={!preset} data-testid="add-preset"
                  onClick={() => { const p = PRESETS.find((q) => q.id === preset); if (p) addPlace(p); setPreset(""); }}>{t.addPreset}</button>
                <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm hover:bg-slate-50" data-testid="add-place"
                  onClick={() => addPlace({ id: "place", name: { en: lang === "nl" ? "Plaats" : "Place", nl: "Plaats" }, lat: 0, lon: 0 })}>{t.customPlace}</button>
              </div>
            </fieldset>
            <fieldset className="m-0 flex flex-wrap gap-4 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.candidateControls}</legend>
              {([["day", t.controlDay], ["time", t.controlTime], ["place", t.controlPlace]] as const).map(([k, label]) => (
                <label key={k} className="inline-flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={setup.controls[k]} data-testid={`control-${k}`}
                    onChange={(e) => commit({ ...setup, controls: { ...setup.controls, [k]: (e.currentTarget as HTMLInputElement).checked } })} />
                  {label}
                </label>
              ))}
            </fieldset>
            <fieldset className="m-0 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.start}</legend>
              <NumberField label={t.startDay} value={setup.start.day} onChange={(v) => commit({ ...setup, start: { ...setup.start, day: Math.round(v) } })} language={lang} testid="start-day" limits={[1, 365]} />
              <span className="mb-1.5 text-sm text-slate-600" data-testid="start-date">{dateText(setup.start.day)}</span>
              <ClockField label={t.startTime} minutes={setup.start.minutes} onChange={(m) => commit({ ...setup, start: { ...setup.start, minutes: m } })} testid="start-time" />
              <label className="flex flex-col gap-0.5">
                <span className="text-xs text-slate-500">{t.startPlace}</span>
                <select className={field} value={setup.start.place} data-testid="start-place" onChange={(e) => commit({ ...setup, start: { ...setup.start, place: (e.currentTarget as HTMLSelectElement).value } })}>
                  {setup.places.map((p) => <option key={p.id} value={p.id}>{p.name[lang]}</option>)}
                </select>
              </label>
              <NumberField label={t.timeStep} value={setup.timeStep} onChange={(v) => commit({ ...setup, timeStep: Math.max(1, Math.min(120, Math.round(v))) })} language={lang} testid="time-step" limits={[1, 120]} />
            </fieldset>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2">
            {startSun && startPlace && (
              <EarthDiagram declination={startSun.declination} hourAngle={startSun.position.hourAngle} place={startPlace} t={t}
                label={t.diagramLabel(dateText(setup.start.day), t.latLon(startSun.declination, startSun.subsolarLongitude, lang), startPlace.name[lang], startSun.position.elevation >= 0 ? t.daySide : t.nightSide)} />
            )}
          </div>
        </div>
      )}

      {tab === "targets" && (
        <div role="tabpanel" id="se-panel-targets" aria-labelledby="se-tab-targets" className="flex flex-col gap-3">
          <p className="m-0 text-sm text-slate-600">{t.targetsHint}</p>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {setup.targets.map((target, i) => {
              const result = evaluation?.results[i];
              return (
                <li key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-2" data-testid={`target-${i}`}>
                  <span className="mb-1 font-mono text-xs text-slate-500">check{i + 1}</span>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-xs text-slate-500">{t.tabTargets}</span>
                    <select className={field} value={target.field} data-testid={`target-${i}-field`}
                      onChange={(e) => setTarget(i, newTarget((e.currentTarget as HTMLSelectElement).value as Field))}>
                      {[...NUMBER_FIELDS, "place" as const].map((f) => <option key={f} value={f}>{t.field[f]}</option>)}
                    </select>
                  </label>
                  {target.field === "place" ? (
                    <label className="flex flex-col gap-0.5">
                      <span className="text-xs text-slate-500">{t.value}</span>
                      <select className={field} value={String(target.value)} data-testid={`target-${i}-place`}
                        onChange={(e) => setTarget(i, { ...target, value: (e.currentTarget as HTMLSelectElement).value })}>
                        {setup.places.map((p) => <option key={p.id} value={p.id}>{p.name[lang]}</option>)}
                      </select>
                    </label>
                  ) : (
                    <>
                      <NumberField label={t.value} value={Number(target.value)} onChange={(v) => setTarget(i, { ...target, value: v })} language={lang} testid={`target-${i}-value`} />
                      <NumberField label={t.margin} value={target.margin} onChange={(v) => setTarget(i, { ...target, margin: Math.max(0, v) })} language={lang} testid={`target-${i}-margin`} />
                    </>
                  )}
                  <NumberField label={t.points} value={target.points} onChange={(v) => setTarget(i, { ...target, points: Math.max(0, Math.round(v)) })} language={lang} testid={`target-${i}-points`} className="w-14" />
                  <span className={`mb-1 rounded-full px-2 py-0.5 text-xs font-medium ${!result ? "bg-slate-100 text-slate-500" : result.passed ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`} data-testid={`target-${i}-result`}>
                    {result ? `${result.passed ? "✓" : "✗"} ${t.solutionValue}: ${target.field === "place" ? placeById(setup, String(result.value))?.name[lang] ?? result.value : n(result.value as number)} (${result.passed ? t.met : t.notMet})` : t.problem({ code: "noSolution" })}
                  </span>
                  <button type="button" className="mb-1 ml-auto rounded-md px-2 text-slate-400 hover:text-rose-700" aria-label={`${t.removeTarget} ${i + 1}`} onClick={() => setTarget(i, null)}>×</button>
                </li>
              );
            })}
          </ol>
          {setup.targets.length < MAX_TARGETS && (
            <button type="button" className="w-fit rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50" data-testid="add-target"
              onClick={() => commit({ ...setup, targets: [...setup.targets, newTarget("day")] })}>
              {t.addTarget}
            </button>
          )}
          {evaluation && setup.targets.length > 0 && <p className="m-0 text-sm font-medium" data-testid="summary">{t.summary(evaluation.score, evaluation.maxscore)}</p>}
          <details className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
            <summary className="cursor-pointer font-medium">{t.responseProcessing}</summary>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre text-[11px] leading-snug" data-testid="response-processing">{responseProcessing(setup)}</pre>
          </details>
        </div>
      )}

      {tab === "solution" && (
        <div role="tabpanel" id="se-panel-solution" aria-labelledby="se-tab-solution" className="flex flex-col gap-3">
          <p className="m-0 text-sm text-slate-600">{t.solutionHint}</p>
          <Interaction prompt="" setup={setup} store={solutionStore} texts={t}
            options={{ mode: "answer", view: "2d", timeBase, showInfo: true, language: lang, readOnly: false, solution: false }} />
          {evaluation && setup.targets.length > 0 && <p className="m-0 text-sm font-medium" data-testid="summary">{t.summary(evaluation.score, evaluation.maxscore)}</p>}
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

