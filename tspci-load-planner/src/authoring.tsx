import { useEffect, useMemo, useState } from "preact/hooks";
import Interaction from "./interaction";
import {
  Box, CHECK_TYPES, Check, CheckType, MAX_BOXES, MAX_CHECKS, Plan, SPACE_KINDS, SPACE_PRESETS, SpaceKind, boxId, boxesToTsv, dims,
  evaluate, ORIENTATIONS, allowed, ownPlacement, parseBox, parseBoxesTsv, parseCheck, uniqueIds,
} from "./plan";
import { initStore } from "./store";
import { Texts, textsFor } from "./texts";
import { stopColor, stopInk } from "./colors";

// The authoring mode (index.tsx getAuthoringInstance): the cargo space, the boxes (or a table pasted from a
// spreadsheet), the checks with their points, and an example solution the checks are tried on. The result is
// data-plan (plan.ts).

/** What keeps the plan from being used (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (plan: Plan, language: string): string[] => {
  const t = textsFor(language);
  const problems: string[] = [];
  if (!plan.boxes.length) problems.push(t.problemNoBoxes);
  if (!plan.checks.length) problems.push(t.problemNoChecks);
  const { length, width, height } = plan.space;
  for (const b of plan.boxes) {
    const fits = ORIENTATIONS.some((o) => {
      if (!allowed(b, o)) return false;
      const [dx, dy, dz] = dims(b, o);
      return dx <= length && dy <= width && dz <= height;
    });
    if (!fits) problems.push(t.problemTooBig(t.boxName(b)));
  }
  const total = plan.boxes.reduce((s, b) => s + b.weight, 0);
  if (plan.requireAll && total > plan.space.maxPayload && plan.checks.some((c) => c.type !== "allLoaded")) problems.push(t.problemTooHeavy);
  if (plan.checks.some((c) => c.type === "axles") && !plan.space.axles) problems.push(t.problemAxles);
  if (!plan.solution) problems.push(t.problemNoSolution);
  else evaluate(plan, plan.solution).results.forEach((r, i) => !r.passed && problems.push(t.problemCheck(i + 1)));
  return problems;
};

const button = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-600";
const field = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm";
type Tab = "space" | "boxes" | "checks" | "solution";

const newCheck = (type: CheckType): Check => parseCheck({ type, points: 1 })!;

/** A number in an input: no thousands separator, a decimal comma in Dutch. */
const inputText = (n: number, lang: string) => String(Math.round(n * 10) / 10).replace(".", lang === "nl" ? "," : ".");
const parseInput = (text: string) => Number(text.trim().replace(",", "."));

const NumberField = ({ label, value, onChange, min = 0, max = 100000, step = 1, testid, lang }: {
  label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; testid: string; lang: string;
}) => (
  <label class="flex flex-col gap-1 text-xs text-slate-600">
    {label}
    <input type="text" inputMode="decimal" class={`${field} w-28 tabular-nums`} data-testid={testid} value={inputText(value, lang)}
      onChange={(e) => {
        const input = e.target as HTMLInputElement;
        const n = parseInput(input.value);
        if (input.value.trim() && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n / step) * step)));
        else input.value = inputText(value, lang);
      }} />
  </label>
);

const Authoring = ({ initial, language, onChange }: { initial: Plan; language: string; onChange: (p: Plan) => void }) => {
  const t: Texts = textsFor(language);
  const lang = t.lang;
  const [plan, setPlan] = useState<Plan>(initial);
  const [tab, setTab] = useState<Tab>("space");
  const [tsv, setTsv] = useState(() => boxesToTsv(initial.boxes));
  const [pasteErrors, setPasteErrors] = useState<number[]>([]);
  const commit = (next: Plan) => {
    setPlan(next);
    onChange(next);
  };
  const problems = authoringProblems(plan, language);
  const evaluation = useMemo(() => (plan.solution ? evaluate(plan, plan.solution) : null), [plan]);

  /** The space or the boxes changed: the solution keeps what still fits. */
  const withPlan = (next: Plan) => commit({ ...next, solution: next.solution ? ownPlacement(next, next.solution) : null });
  const setSpace = (patch: Partial<Plan["space"]>) => withPlan({ ...plan, space: { ...plan.space, ...patch } });
  const setBoxes = (boxes: Box[]) => withPlan({ ...plan, boxes: uniqueIds(boxes) });
  const setBox = (i: number, patch: Partial<Box>) => setBoxes(plan.boxes.map((b, k) => (k === i ? parseBox({ ...b, ...patch }, k) : b)));
  const setCheck = (i: number, check: Check | null) => {
    const checks = [...plan.checks];
    if (check) checks[i] = check;
    else checks.splice(i, 1);
    commit({ ...plan, checks });
  };

  // the solution tab: the candidate's interaction on a store of its own
  const store = useMemo(() => initStore({ placed: plan.solution ?? [] }), [tab === "solution"]);
  useEffect(() => {
    if (tab !== "solution") return;
    return store.subscribe(() => {
      const placed = store.getState().placed;
      setPlan((p) => {
        const next = { ...p, solution: placed.length ? placed : null };
        onChange(next);
        return next;
      });
    }, { immediate: false }) as unknown as () => void;
  }, [store, tab]);

  const tabs: [Tab, string][] = [["space", t.tabSpace], ["boxes", t.tabBoxes], ["checks", t.tabChecks], ["solution", t.tabSolution]];
  const s = plan.space;

  return (
    <div class="flex flex-col gap-3 p-1 font-sans text-slate-800">
      <div role="tablist" class="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map(([id, name]) => (
          <button key={id} type="button" role="tab" id={`lp-tab-${id}`} aria-selected={tab === id} aria-controls={`lp-panel-${id}`}
            class={`-mb-px rounded-t-lg border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-sky-600 ${tab === id ? "border-slate-200 border-b-white bg-white font-semibold" : "border-transparent text-slate-600 hover:text-slate-900"}`}
            onClick={() => setTab(id)}>{name}</button>
        ))}
      </div>

      <div role="tabpanel" id={`lp-panel-${tab}`} aria-labelledby={`lp-tab-${tab}`} class="flex flex-col gap-3">
        {tab === "space" && (
          <>
            <p class="m-0 text-sm text-slate-600">{t.spaceHint}</p>
            <div class="flex flex-wrap items-end gap-3">
              <label class="flex flex-col gap-1 text-xs text-slate-600">
                {t.kind}
                <select class={field} data-testid="space-kind" value={s.kind}
                  onChange={(e) => {
                    const kind = (e.target as HTMLSelectElement).value as SpaceKind;
                    withPlan({ ...plan, space: { ...SPACE_PRESETS[kind], grid: s.grid } });
                  }}>
                  {SPACE_KINDS.map((k) => <option key={k} value={k}>{t.space[k]}</option>)}
                </select>
              </label>
              <NumberField label={t.length} value={s.length} min={10} max={2000} testid="space-length" lang={lang} onChange={(n) => setSpace({ length: Math.round(n) })} />
              <NumberField label={t.width} value={s.width} min={10} max={1000} testid="space-width" lang={lang} onChange={(n) => setSpace({ width: Math.round(n) })} />
              <NumberField label={s.kind === "pallet" ? t.heightPallet : t.height} value={s.height} min={10} max={1000} testid="space-height" lang={lang} onChange={(n) => setSpace({ height: Math.round(n) })} />
              <NumberField label={t.maxPayload} value={s.maxPayload} min={1} testid="space-payload" lang={lang} onChange={(n) => setSpace({ maxPayload: n })} step={0.1} />
              <NumberField label={t.grid} value={s.grid} min={1} max={100} testid="space-grid" lang={lang} onChange={(n) => setSpace({ grid: Math.round(n) })} />
            </div>
            {s.kind === "van" && (
              <fieldset class="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-3">
                <legend class="px-1 text-xs font-semibold">
                  <label class="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={!!s.axles} data-testid="space-axles"
                      onChange={(e) => setSpace({ axles: (e.target as HTMLInputElement).checked ? { front: -90, rear: Math.round(s.length * 0.7), maxFront: 0, maxRear: 0 } : null })} />
                    {t.axles}
                  </label>
                </legend>
                {s.axles && (
                  <>
                    <NumberField label={t.axleFrontAt} value={s.axles.front} min={-500} max={2000} testid="axle-front" lang={lang} onChange={(n) => setSpace({ axles: { ...s.axles!, front: n } })} />
                    <NumberField label={t.axleRearAt} value={s.axles.rear} min={-500} max={2000} testid="axle-rear" lang={lang} onChange={(n) => setSpace({ axles: { ...s.axles!, rear: Math.max(s.axles!.front + 10, n) } })} />
                    <NumberField label={t.axleFrontMax} value={s.axles.maxFront} testid="axle-front-max" lang={lang} onChange={(n) => setSpace({ axles: { ...s.axles!, maxFront: n } })} />
                    <NumberField label={t.axleRearMax} value={s.axles.maxRear} testid="axle-rear-max" lang={lang} onChange={(n) => setSpace({ axles: { ...s.axles!, maxRear: n } })} />
                  </>
                )}
              </fieldset>
            )}
            <div class="flex flex-wrap items-end gap-4">
              <NumberField label={t.supportSetting} value={plan.support} min={0} max={100} testid="support" lang={lang} onChange={(n) => commit({ ...plan, support: Math.round(n) })} />
              <label class="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={plan.requireAll} data-testid="require-all" onChange={(e) => commit({ ...plan, requireAll: (e.target as HTMLInputElement).checked })} />
                {t.requireAll}
              </label>
            </div>
          </>
        )}

        {tab === "boxes" && (
          <>
            <div class="overflow-x-auto">
              <table class="w-full border-collapse text-sm" data-testid="box-table">
                <thead>
                  <tr class="text-left text-xs text-slate-500">
                    <th class="p-1 font-medium">{t.id}</th><th class="p-1 font-medium">{t.label}</th><th class="p-1 font-medium">{t.length}</th><th class="p-1 font-medium">{t.width}</th>
                    <th class="p-1 font-medium">{t.height}</th><th class="p-1 font-medium">{t.weight} (kg)</th><th class="p-1 font-medium">{t.upright}</th><th class="p-1 font-medium">{t.fragile}</th>
                    <th class="p-1 font-medium">{t.stopCol}</th><th class="p-1" />
                  </tr>
                </thead>
                <tbody>
                  {plan.boxes.map((b, i) => {
                    const num = (key: "length" | "width" | "height" | "weight") => (
                      <td class="p-1">
                        <input type="text" inputMode="decimal" class={`${field} w-16 tabular-nums`} aria-label={`${t[key === "weight" ? "weight" : key]}: ${b.label}`} value={inputText(b[key], lang)}
                          onChange={(e) => setBox(i, { [key]: parseInput((e.target as HTMLInputElement).value) } as any)} />
                      </td>
                    );
                    return (
                      <tr key={`${b.id}-${i}`} class="border-t border-slate-100" data-testid={`box-row-${i}`}>
                        <td class="p-1"><span class="grid size-7 place-items-center rounded text-xs font-bold" style={{ background: stopColor(b.stop), color: stopInk(b.stop) }}>{b.id}</span></td>
                        <td class="p-1"><input class={`${field} w-36`} aria-label={`${t.label}: ${b.id}`} value={b.label} onChange={(e) => setBox(i, { label: (e.target as HTMLInputElement).value })} /></td>
                        {num("length")}{num("width")}{num("height")}{num("weight")}
                        <td class="p-1 text-center"><input type="checkbox" aria-label={`${t.upright}: ${b.label}`} checked={b.upright} onChange={(e) => setBox(i, { upright: (e.target as HTMLInputElement).checked })} /></td>
                        <td class="p-1 text-center"><input type="checkbox" aria-label={`${t.fragile}: ${b.label}`} checked={b.fragile} onChange={(e) => setBox(i, { fragile: (e.target as HTMLInputElement).checked })} /></td>
                        <td class="p-1"><input type="number" min={1} max={99} class={`${field} w-14`} aria-label={`${t.stopCol}: ${b.label}`} value={b.stop ?? ""}
                          onChange={(e) => setBox(i, { stop: ((e.target as HTMLInputElement).value || null) as any })} /></td>
                        <td class="p-1"><button type="button" class="px-1 text-slate-400 hover:text-rose-600" aria-label={`${t.removeBox}: ${b.label}`} onClick={() => setBoxes(plan.boxes.filter((_, k) => k !== i))}>×</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <button type="button" class={button} disabled={plan.boxes.length >= MAX_BOXES}
                onClick={() => setBoxes([...plan.boxes, parseBox({ id: boxId(plan.boxes.length), label: `${t.boxes.replace(/s$|en$/, "")} ${plan.boxes.length + 1}` }, plan.boxes.length)])}>{t.addBox}</button>
            </div>
            <details class="rounded-lg border border-slate-200 p-3" open>
              <summary class="cursor-pointer text-sm font-semibold">{t.paste}</summary>
              <p class="m-0 my-2 text-xs text-slate-600">{t.pasteHint}</p>
              <textarea class={`${field} h-32 w-full font-mono text-xs`} aria-label={t.paste} data-testid="tsv" value={tsv} onInput={(e) => setTsv((e.target as HTMLTextAreaElement).value)} />
              <div class="mt-2 flex items-center gap-3">
                <button type="button" class={button} data-testid="tsv-apply" onClick={() => {
                  const { boxes, errors } = parseBoxesTsv(tsv);
                  setPasteErrors(errors);
                  if (boxes.length) setBoxes(boxes);
                }}>{t.replace}</button>
                {pasteErrors.length > 0 && <span class="text-xs text-rose-700" role="alert">{t.pasteErrors(pasteErrors)}</span>}
              </div>
            </details>
          </>
        )}

        {tab === "checks" && (
          <>
            <p class="m-0 text-sm text-slate-600">{t.checksHint}</p>
            <ol class="m-0 flex list-none flex-col gap-2 p-0">
              {plan.checks.map((c, i) => {
                const passed = evaluation?.results[i]?.passed;
                return (
                  <li key={i} class="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2" data-testid={`check-${i}`}>
                    <span class={`grid size-6 place-items-center rounded-full text-xs font-bold ${passed === undefined ? "bg-slate-100 text-slate-400" : passed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
                      aria-label={passed === undefined ? t.noSolution : passed ? "✓" : "✗"}>{passed === undefined ? i + 1 : passed ? "✓" : "✗"}</span>
                    <span class="font-mono text-xs text-slate-500">check{i + 1}</span>
                    <select class={field} value={c.type} data-testid={`check-${i}-type`} aria-label={`check${i + 1}`}
                      onChange={(e) => setCheck(i, { ...newCheck((e.target as HTMLSelectElement).value as CheckType), points: c.points })}>
                      {CHECK_TYPES.map((type) => <option key={type} value={type}>{t.checkName[type]}</option>)}
                    </select>
                    {c.type === "cog" && (
                      <>
                        <NumberField label={t.cogX} value={c.x ?? 40} testid={`check-${i}-x`} lang={lang} onChange={(n) => setCheck(i, { ...c, x: n })} />
                        <NumberField label={t.cogY} value={c.y ?? 20} testid={`check-${i}-y`} lang={lang} onChange={(n) => setCheck(i, { ...c, y: n })} />
                      </>
                    )}
                    <label class="ml-auto inline-flex items-center gap-1 text-xs">
                      {t.points}
                      <input type="number" min={0} max={100} class={`${field} w-14`} value={c.points} data-testid={`check-${i}-points`}
                        onChange={(e) => setCheck(i, { ...c, points: Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0)) })} />
                    </label>
                    <button type="button" class="px-1 text-slate-400 hover:text-rose-600" aria-label={`${t.removeCheck}: check${i + 1}`} onClick={() => setCheck(i, null)}>×</button>
                  </li>
                );
              })}
            </ol>
            <div>
              <button type="button" class={button} disabled={plan.checks.length >= MAX_CHECKS}
                onClick={() => commit({ ...plan, checks: [...plan.checks, newCheck(CHECK_TYPES.find((k) => !plan.checks.some((c) => c.type === k)) ?? "allLoaded")] })}>{t.addCheck}</button>
            </div>
          </>
        )}

        {tab === "solution" && (
          <>
            <div class="flex flex-wrap items-center gap-3">
              <p class="m-0 text-sm text-slate-600">{t.solutionHint}</p>
              <button type="button" class={button} disabled={!plan.solution} onClick={() => store.dispatch({ type: "SET_PLACED", payload: { placed: [] } })}>{t.clearSolution}</button>
            </div>
            <Interaction prompt="" plan={plan} store={store} t={t} view="3d" showMetrics showChecks readOnly={false} />
          </>
        )}
      </div>

      <p class="m-0 text-sm font-medium" data-testid="summary">
        {evaluation ? t.summary(evaluation.score, evaluation.maxscore) : t.noSolution}
      </p>
      {problems.length > 0 && (
        <ul class="m-0 list-disc rounded-lg border border-amber-300 bg-amber-50 py-2 pl-6 pr-3 text-sm text-amber-900" data-testid="problems">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
    </div>
  );
};

export default Authoring;
