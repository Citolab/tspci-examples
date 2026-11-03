import { useMemo, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { Measurement, PointRef, Target, Tool, Vec3, positionOf } from "./geometry";
import { acceptableNumberText, decimalsOf, formatNumber, parseNumber } from "./format";
import { Settings, toolFactor } from "./settings";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";
import { COLOURS, answerUnit, describe, faceName, pointName } from "./describe";
import { Drawn, Pick } from "./scene3d";
import { Viewport, usePrefersReducedMotion } from "./viewport";

// The candidate's view: the instruction, the tools, the 3D scene with the measurements, the same measuring with
// lists (no pointer needed), the list of measurements and, in answer mode, the answer field.

const needs: Record<Tool, number> = { tape: 2, protractor: 3, area: 1 };

/** The task as a measurement, to draw in review. */
export const targetMeasurement = (target: Target | null): Measurement | null =>
  !target || target.kind === "volume" ? null
  : target.kind === "area" ? { tool: "area", face: target.face }
  : target.kind === "length" ? { tool: "tape", points: [{ id: target.points[0] }, { id: target.points[1] }] }
  : { tool: "protractor", points: [{ id: target.points[0] }, { id: target.points[1] }, { id: target.points[2] }] };

/** A measurement as the 3D view draws it. */
export const drawnOf = (s: Settings, t: Texts, m: Measurement, label: string, solution = false): Drawn | null => {
  const colour = solution ? COLOURS.solution : COLOURS[m.tool];
  const ticks = s.reading !== "ruler" ? undefined : m.tool === "tape" && s.tickStep > 0 ? s.tickStep / toolFactor(s) : m.tool === "protractor" && s.angleStep > 0 ? s.angleStep : undefined;
  if (m.tool === "area") return { tool: "area", face: m.face, points: [], label, colour, solution };
  const points = m.points.map((r) => positionOf(s.built, r));
  if (points.some((p) => !p)) return null;
  return { tool: m.tool, points: points as Vec3[], label, colour, ticks, solution };
};

const ToolIcon = ({ tool }: { tool: Tool }) => (
  <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {tool === "tape" && <path d="M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2" />}
    {tool === "protractor" && <path d="M4 20h16M4 20L15 6M9 20a5 5 0 0 0-2-4" />}
    {tool === "area" && <path d="M4 7l8-4 8 4-8 4zM4 7v10l8 4 8-4V7" />}
  </svg>
);

const field = "h-9 min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 disabled:bg-slate-50";

const Interaction = ({ prompt, settings: s, store, texts: t, readOnly, correctText }: {
  prompt: string;
  settings: Settings;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  readOnly: boolean;
  /** In review: the correct answer as text, and the task drawn in the scene. */
  correctText: string | null;
}) => {
  const state = useStore(store);
  const [tool, setTool] = useState<Tool>(s.tools[0]);
  const current = s.tools.includes(tool) ? tool : s.tools[0];
  const [pending, setPending] = useState<PointRef[]>([]);
  const [chosen, setChosen] = useState<string[]>(["", "", ""]);
  const [announcement, setAnnouncement] = useState("");
  const [message, setMessage] = useState("");
  const reducedMotion = usePrefersReducedMotion();
  const built = s.built;

  const points = built.points;
  const groups = (["vertex", "mid", "centre"] as const).map((kind) => ({ kind, points: points.filter((p) => p.kind === kind) })).filter((g) => g.points.length);

  const add = (m: Measurement) => {
    store.dispatch({ type: "ADD", payload: { measurement: m } });
    setPending([]);
    setAnnouncement(t.measured(describe(s, t, m)));
  };

  const choose = (ref: PointRef) => {
    if (readOnly) return;
    const next = [...pending, ref];
    const last = pending[pending.length - 1];
    if (last && "id" in last && "id" in ref && last.id === ref.id) return setAnnouncement(t.samePoint);
    if (next.length === needs[current]) {
      add(current === "tape" ? { tool: "tape", points: next as [PointRef, PointRef] } : { tool: "protractor", points: next as [PointRef, PointRef, PointRef] });
    } else {
      setPending(next);
      const name = "id" in ref ? pointName(t, built, points.find((p) => p.id === ref.id)!) : t.onFace(faceName(t, built, built.faces.find((f) => f.id === ref.face)!));
      setAnnouncement(t.picked(name, t.steps[current][next.length]));
    }
  };

  const onPick = (pick: Pick) => {
    if (readOnly) return;
    if (current === "area") {
      if ("face" in pick) add({ tool: "area", face: pick.face });
      return;
    }
    choose("point" in pick ? { id: pick.point } : { face: pick.face, pos: pick.pos });
  };

  const selectTool = (next: Tool) => {
    setTool(next);
    setPending([]);
    setMessage("");
  };

  const measureFromLists = (e: Event) => {
    e.preventDefault();
    const ids = chosen.slice(0, needs[current]);
    if (ids.some((id) => !id)) return setMessage(t.incomplete);
    if (current === "area") {
      setMessage("");
      return add({ tool: "area", face: ids[0] });
    }
    if (ids.some((id, i) => i > 0 && id === ids[i - 1])) return setMessage(t.samePoint);
    setMessage("");
    const refs = ids.map((id) => ({ id }));
    add(current === "tape" ? { tool: "tape", points: refs as [PointRef, PointRef] } : { tool: "protractor", points: refs as [PointRef, PointRef, PointRef] });
  };

  const drawn = useMemo(() => {
    const list = state.measurements.map((m, i) => drawnOf(s, t, m, `${i + 1} · ${describe(s, t, m).replace(/^.*?(=|:) /, "")}`)).filter(Boolean) as Drawn[];
    const target = correctText ? targetMeasurement(s.target) : null;
    const solution = target ? drawnOf(s, t, target, `✓ ${correctText}`, true) : null;
    return solution ? [...list, solution] : list;
  }, [state.measurements, s, t, correctText]);
  const pendingAt = pending.map((r) => positionOf(built, r)).filter(Boolean) as Vec3[];

  const n = (v: number) => formatNumber(v, Math.max(decimalsOf(s.scale), 0), s.language);
  const badge = s.showScale || !s.toolScale ? t.scale(s.unit, n(s.scale)) : undefined;
  const typed = state.answer;
  const invalid = typed.trim() !== "" && parseNumber(typed) === null;
  const step = t.steps[current][Math.min(pending.length, needs[current] - 1)];

  const selectLabels = current === "tape" ? [t.from, t.to] : current === "protractor" ? [t.armA, t.vertex, t.armB] : [t.face];

  return (
    <div className="measure-3d flex w-full max-w-[860px] flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[75ch] text-[15px] leading-relaxed text-slate-700">{prompt}</p>}
      <section aria-label={t.region} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label={t.tools} className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {s.tools.map((x) => (
              <label key={x} className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-sky-700 ${current === x ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900"}`}>
                <input type="radio" name="tool" className="sr-only" checked={current === x} disabled={readOnly} onChange={() => selectTool(x)} />
                <span style={{ color: COLOURS[x] }}><ToolIcon tool={x} /></span>
                {t.tool[x]}
              </label>
            ))}
          </div>
          <p className="m-0 text-sm text-slate-600" data-testid="step">{readOnly ? t.readOnly : step}</p>
          {pending.length > 0 && (
            <button type="button" onClick={() => { setPending([]); setAnnouncement(t.cancelled); }}
              className="ml-auto h-8 cursor-pointer rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-700">
              {t.cancel}
            </button>
          )}
        </div>

        <Viewport built={built} drawn={drawn} pending={pendingAt} picking={readOnly ? "none" : current === "area" ? "face" : "point"}
          showPointLabels={s.showPointLabels} height={s.height} texts={t} onPick={onPick} label={`${t.scene}. ${t.sceneHelp}`} badge={badge}
          reducedMotion={reducedMotion} />

        <div className="grid gap-3 md:grid-cols-2">
          <form onSubmit={measureFromLists} aria-label={t.lists} className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <h3 className="m-0 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <span style={{ color: COLOURS[current] }}><ToolIcon tool={current} /></span>{t.lists}: {t.tool[current].toLowerCase()}
            </h3>
            <div className={`grid gap-2 ${selectLabels.length === 3 ? "sm:grid-cols-3" : selectLabels.length === 2 ? "sm:grid-cols-2" : ""}`}>
              {selectLabels.map((label, i) => (
                <label key={`${current}-${i}`} className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">
                  {label}
                  <select className={field} value={chosen[i]} disabled={readOnly} data-testid={`select-${i}`}
                    onChange={(e) => { const next = [...chosen]; next[i] = (e.target as HTMLSelectElement).value; setChosen(next); }}>
                    <option value="">{t.choose}</option>
                    {current === "area"
                      ? <optgroup label={t.groups.faces}>{built.faces.map((f) => <option key={f.id} value={f.id}>{faceName(t, built, f)}</option>)}</optgroup>
                      : groups.map((g) => (
                        <optgroup key={g.kind} label={t.groups[g.kind]}>
                          {g.points.map((p) => <option key={p.id} value={p.id}>{pointName(t, built, p)}</option>)}
                        </optgroup>
                      ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" disabled={readOnly}
                className="h-9 cursor-pointer rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-default disabled:opacity-50">
                {t.measure}
              </button>
              {message && <span className="text-sm text-rose-700" data-testid="list-message">{message}</span>}
            </div>
          </form>

          <div className="flex flex-col gap-2 rounded-xl p-3 ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-2">
              <h3 className="m-0 text-sm font-semibold text-slate-700">{t.measurements}</h3>
              {state.measurements.length > 0 && !readOnly && (
                <button type="button" onClick={() => { store.dispatch({ type: "CLEAR", payload: {} }); setAnnouncement(t.cleared); }}
                  className="cursor-pointer rounded-md px-2 py-1 text-xs text-slate-600 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-sky-700">
                  {t.clear}
                </button>
              )}
            </div>
            {state.measurements.length === 0 ? (
              <p className="m-0 text-sm text-slate-500">{t.none}</p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-1 p-0" data-testid="measurements">
                {state.measurements.map((m, i) => {
                  const text = describe(s, t, m);
                  return (
                    <li key={i} className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-sm hover:bg-slate-50">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: COLOURS[m.tool] }} aria-hidden="true">{i + 1}</span>
                      <span style={{ color: COLOURS[m.tool] }}><ToolIcon tool={m.tool} /></span>
                      <span className="min-w-0 flex-1 tabular-nums" data-testid="measurement">{text}</span>
                      {!readOnly && (
                        <button type="button" aria-label={t.remove(text)} onClick={() => { store.dispatch({ type: "REMOVE", payload: { index: i } }); setAnnouncement(t.removed(text)); }}
                          className="grid size-7 cursor-pointer place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-sky-700">
                          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        {s.mode === "answer" && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-sky-50 px-3 py-2.5 ring-1 ring-sky-200">
            <label htmlFor="m3d-answer" className="text-sm font-semibold text-slate-800">{t.answer}</label>
            <div className="flex items-center gap-1.5">
              <input id="m3d-answer" type="text" inputMode="decimal" autoComplete="off" data-testid="answer"
                className={`${field} w-32 text-right tabular-nums ${invalid ? "border-rose-500" : ""}`} value={typed} readOnly={readOnly}
                aria-invalid={invalid} aria-describedby="m3d-answer-hint"
                onBeforeInput={(e: InputEvent) => {
                  const el = e.target as HTMLInputElement;
                  if (!e.data || !e.inputType.startsWith("insert")) return;
                  const next = el.value.slice(0, el.selectionStart ?? el.value.length) + e.data + el.value.slice(el.selectionEnd ?? el.value.length);
                  if (!acceptableNumberText(next, true)) e.preventDefault();
                }}
                onInput={(e) => store.dispatch({ type: "ANSWER", payload: { text: (e.target as HTMLInputElement).value } })} />
              <span className="text-sm font-medium text-slate-700">{answerUnit(s, s.target)}</span>
            </div>
            <span id="m3d-answer-hint" className={`text-xs ${invalid ? "text-rose-700" : "text-slate-500"}`}>{invalid ? t.notANumber : t.answerHint}</span>
            {correctText && <span data-testid="correct" className="w-full text-sm font-medium text-fuchsia-900">✓ {t.correctAnswer(correctText)}</span>}
          </div>
        )}
        <div role="status" aria-live="polite" className="sr-only" data-testid="status">{announcement}</div>
      </section>
    </div>
  );
};

export default Interaction;
