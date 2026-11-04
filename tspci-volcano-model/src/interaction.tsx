// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Volcanismepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The candidate's view: the instruction, the U-tube, the steps as buttons, what happened (an aria-live narration), the
// outcome with the eruption type it models, the experiments so far and, optionally, the matching task.
import { useEffect, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { ERUPTIONS, OUTCOMES, Outcome, STAGES, Settings, Viscosity, runExperiment } from "./model";
import { Actions, StateModel } from "./store";
import { Texts, formatInteger } from "./texts";
import { Scene } from "./scene";

/** Durations of the smooth animation, in ms. */
export const POUR_MS = 900;
export const ERUPT_MS = 3600;

const usePrefersReducedMotion = () => {
  const query = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const [reduced, setReduced] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const listener = () => setReduced(query.matches);
    query.addEventListener?.("change", listener);
    return () => query.removeEventListener?.("change", listener);
  }, []);
  return reduced;
};

const button =
  "min-h-11 rounded-lg border-2 px-4 py-2 font-semibold text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed " +
  "focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400";
const primary = `${button} border-orange-700 bg-orange-700 text-white hover:bg-orange-800`;
const secondary = `${button} border-slate-400 bg-white text-slate-800 hover:bg-slate-50`;

const Interaction = ({ prompt, settings: s, store, texts: t, readOnly }: {
  prompt: string;
  settings: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  readOnly: boolean;
}) => {
  const state = useStore(store);
  const reduced = usePrefersReducedMotion();
  const stepMode = s.animation === "steps" || reduced;
  // what the picture shows: the pour (0…1) and the eruption (0…1); a restored state shows the end of both
  const [pour, setPour] = useState(1);
  // the eruption the candidate started here: for the experiment with this number, how far it is (0…1); any other
  // erupted state (restored, or set by the delivery system) shows its end
  const [anim, setAnim] = useState<{ count: number; progress: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const frame = useRef(0);

  const last = state.experiments[state.experiments.length - 1];
  const outcome = state.phase === "erupted" && last ? last.outcome : null;
  const tablets = Math.min(state.tablets, s.maxTablets);
  const progress = state.phase !== "erupted" ? 0 : anim && anim.count === state.experiments.length ? anim.progress : 1;
  const stage = STAGES.findIndex((p) => progress <= p + 1e-9); // 0…3 while running
  const running = state.phase === "erupted" && progress < 1;

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const animate = (ms: number, set: (v: number) => void, done?: () => void) => {
    cancelAnimationFrame(frame.current);
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      set(p);
      if (p < 1) frame.current = requestAnimationFrame(tick);
      else done?.();
    };
    frame.current = requestAnimationFrame(tick);
  };

  const onPour = (viscosity: Viscosity) => {
    store.dispatch({ type: "POUR", payload: { viscosity } });
    const said = t.narrate.poured(t.viscosity[viscosity]);
    if (stepMode) {
      setPour(1);
      setAnnouncement(said);
    } else {
      setPour(0);
      animate(POUR_MS, setPour, () => setAnnouncement(said));
    }
  };

  const outcomeText = (o: Outcome) => {
    const eruption = s.eruptionOf[o];
    return `${t.outcome[o]}: ${t.outcomeLong[o]}` + (s.showEruption ? ` ${t.eruption[eruption]}.` : "");
  };

  const onStart = () => {
    if (!state.viscosity) return;
    const experiment = runExperiment(s, state.viscosity, tablets);
    store.dispatch({ type: "ERUPT", payload: { experiment } });
    const count = store.getState().experiments.length;
    const setProgress = (progress: number) => setAnim({ count, progress });
    if (stepMode) {
      setProgress(STAGES[0]);
      setAnnouncement(`${t.stage(1, 4)}. ${t.narrate.tablet(tablets)}`);
    } else {
      setProgress(0.001);
      setAnnouncement(`${t.narrate.tablet(tablets)} ${t.narrate.gas} ${t.narrate.rise}`);
      animate(ERUPT_MS, (p) => setProgress(Math.max(0.001, p)), () => setAnnouncement(outcomeText(experiment.outcome)));
    }
  };

  const onNext = () => {
    const next = Math.min(3, stage + 1);
    setAnim({ count: state.experiments.length, progress: STAGES[next] });
    const said = [t.narrate.tablet(tablets), t.narrate.gas, t.narrate.rise, outcome ? outcomeText(outcome) : ""][next];
    setAnnouncement(`${t.stage(next + 1, 4)}. ${said}`);
  };

  const onReset = () => {
    cancelAnimationFrame(frame.current);
    store.dispatch({ type: "RESET", payload: {} });
    setPour(1);
    setAnim(null);
    setAnnouncement(t.narrate.reset);
  };

  const label = t.picture(
    state.phase === "empty" || !state.viscosity
      ? t.pictureEmpty
      : outcome && progress >= 1
        ? t.pictureDone(t.viscosity[state.viscosity], t.outcome[outcome])
        : t.picturePoured(t.viscosity[state.viscosity])
  );

  const taskOutcomes = OUTCOMES.filter((o) => s.key[o]);
  const answerOptions: { value: string; label: string }[] =
    s.task === "viscosity"
      ? s.viscosities.map((v) => ({ value: v, label: t.viscosityName[v] }))
      : ERUPTIONS.map((e) => ({ value: e, label: t.eruption[e] }));

  return (
    <div class="font-sans text-slate-900 flex flex-col gap-4" lang={s.language}>
      {prompt && <div class="text-base" dangerouslySetInnerHTML={{ __html: prompt }} />}
      <section aria-label={t.simulation} class="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
        <div class="rounded-xl border border-slate-200 bg-sky-50/40 p-2">
          <Scene viscosity={state.phase === "empty" ? null : state.viscosity} pour={pour} progress={state.phase === "erupted" ? progress : 0}
            tablets={tablets} outcome={outcome} label={label} />
        </div>
        <div class="flex flex-col gap-4">
          {readOnly && <p class="text-sm text-slate-600">{t.readOnly}</p>}
          <div role="group" aria-labelledby="step1" class="flex flex-col gap-2">
            <h3 id="step1" class="font-semibold">{t.step1}</h3>
            <p class="text-sm text-slate-600">{t.step1Hint}</p>
            <div class="flex flex-wrap gap-2">
              {s.viscosities.map((v) => (
                <button type="button" class={state.viscosity === v && state.phase !== "empty" ? `${primary} disabled:opacity-100` : secondary} key={v}
                  aria-pressed={state.viscosity === v && state.phase !== "empty"}
                  disabled={readOnly || state.phase !== "empty"} onClick={() => onPour(v)}>
                  {t.pour(t.viscosity[v])}
                </button>
              ))}
            </div>
          </div>
          <div role="group" aria-labelledby="step2" class="flex flex-col gap-2">
            <h3 id="step2" class="font-semibold">{t.step2}</h3>
            {s.maxTablets > 1 && (
              <fieldset class="flex flex-wrap gap-3" disabled={readOnly || state.phase !== "poured"}>
                <legend class="text-sm text-slate-600 mb-1">{t.tabletsLegend}</legend>
                {Array.from({ length: s.maxTablets }, (_, i) => i + 1).map((n) => (
                  <label key={n} class="flex items-center gap-2 min-h-11 cursor-pointer">
                    <input type="radio" name="tablets" class="size-5 accent-orange-700" value={String(n)} checked={tablets === n}
                      onChange={() => store.dispatch({ type: "TABLETS", payload: { tablets: n } })} />
                    {t.tablets(n)}
                  </label>
                ))}
              </fieldset>
            )}
            <div class="flex flex-wrap gap-2">
              <button type="button" class={primary} disabled={readOnly || state.phase !== "poured"} onClick={onStart}>
                {t.start(tablets)}
              </button>
              {stepMode && running && (
                <button type="button" class={primary} disabled={readOnly} onClick={onNext}>
                  {t.next} ({t.stage(stage + 2, 4)})
                </button>
              )}
            </div>
          </div>
          <div>
            <button type="button" class={secondary} disabled={readOnly || state.phase === "empty"} onClick={onReset}>{t.again}</button>
          </div>
          <p role="status" aria-live="polite" class="min-h-6 text-sm text-slate-700">{announcement}</p>
          {outcome && progress >= 1 && (
            <div class="rounded-lg border-l-4 border-orange-700 bg-orange-50 p-3" data-testid="outcome">
              <p class="font-semibold">{t.outcome[outcome]}</p>
              <p class="text-sm">{t.outcomeLong[outcome]}</p>
              {s.showEruption && (
                <p class="text-sm mt-2" data-testid="reality">
                  <span class="font-semibold">{t.models} {t.eruption[s.eruptionOf[outcome]]}. </span>
                  {t.reality[s.eruptionOf[outcome]]}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="log">
        <h3 id="log" class="font-semibold mb-1">{t.log}</h3>
        {state.experiments.length === 0 ? (
          <p class="text-sm text-slate-600">{t.noExperiments}</p>
        ) : (
          <table class="text-sm border-collapse" data-testid="experiments">
            <thead>
              <tr class="text-left border-b border-slate-300">
                <th scope="col" class="pr-4 py-1">#</th>
                <th scope="col" class="pr-4 py-1">{t.logColumns.viscosity}</th>
                <th scope="col" class="pr-4 py-1">{t.logColumns.tablets}</th>
                <th scope="col" class="pr-4 py-1">{t.logColumns.outcome}</th>
                {s.showEruption && <th scope="col" class="pr-4 py-1">{t.logColumns.eruption}</th>}
              </tr>
            </thead>
            <tbody>
              {state.experiments.map((x, i) => {
                const shown = i < state.experiments.length - 1 || state.phase !== "erupted" || progress >= 1;
                return (
                  <tr key={i} class="border-b border-slate-100">
                    <td class="pr-4 py-1">{formatInteger(i + 1, s.language)}</td>
                    <td class="pr-4 py-1">{t.viscosityName[x.viscosity]}</td>
                    <td class="pr-4 py-1">{formatInteger(x.tablets, s.language)}</td>
                    <td class="pr-4 py-1">{shown ? t.outcome[x.outcome] : "…"}</td>
                    {s.showEruption && <td class="pr-4 py-1">{shown ? t.eruptionShort[x.eruption] : "…"}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {s.task !== "none" && taskOutcomes.length > 0 && (
        <section aria-labelledby="task" class="rounded-xl border border-slate-200 p-3">
          <h3 id="task" class="font-semibold">{t.task}</h3>
          <p class="text-sm text-slate-700 mb-2">{s.task === "viscosity" ? t.taskViscosity : t.taskEruption}</p>
          <div class="grid gap-2 sm:grid-cols-[max-content_minmax(0,16rem)] items-center">
            {taskOutcomes.map((o) => (
              <>
                <label for={`answer-${o}`} class="font-medium">{t.outcome[o]}</label>
                <select id={`answer-${o}`} class="min-h-11 rounded-lg border-2 border-slate-400 bg-white px-2 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400"
                  disabled={readOnly} value={state.answers[o] ?? ""}
                  onChange={(e) => store.dispatch({ type: "ANSWER", payload: { outcome: o, value: (e.target as HTMLSelectElement).value } })}>
                  <option value="">{t.choose}</option>
                  {answerOptions.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default Interaction;
