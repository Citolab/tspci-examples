import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import {
  EdgePoint, Model, PlaneParams, Section, Vec, edgeLength, edgeName, edgeOrder, isRound, planeThrough, pointOnEdge, sectionOf,
} from "./geometry";
import { Settings, formatNumber, parseNumber } from "./settings";
import { Actions, Hide, StateModel } from "./store";
import { Texts } from "./texts";
import { CrossSectionScene } from "./scene3d";
import { Section2D, describeSection } from "./section2d";

// The candidate's view: the instruction, the 3D view of the solid and the plane, the cross-section flat with its
// measures, and the controls: sliders and number fields for the plane, or three points on edges, and which part shows.

const field = "w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-sky-600 disabled:bg-slate-50 disabled:text-slate-400";
const button = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-40";
/** A choice in a radio group: the chosen one filled and with a check mark, so it does not depend on colour. */
const choice = (on: boolean, tone: "sky" | "orange" = "sky") =>
  `rounded-lg border px-3 py-1.5 text-sm shadow-sm focus-visible:outline-2 focus-visible:outline-sky-600 ${
    on ? (tone === "sky" ? "border-sky-700 bg-sky-700 font-semibold text-white" : "border-orange-800 bg-orange-800 font-semibold text-white") : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;
const Check = ({ on }: { on: boolean }) => (on ? <span aria-hidden="true">✓ </span> : null);

/** A number field in the candidate's language: a point or a comma, taken on Enter or when it loses focus. */
export const NumberField = ({ value, onCommit, label, language, min, max, disabled, testid }: {
  value: number;
  onCommit: (v: number) => void;
  label: string;
  language: string;
  min: number;
  max: number;
  disabled?: boolean;
  testid?: string;
}) => {
  const shown = formatNumber(value, language, 2);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    const n = parseNumber(text);
    if (n === null) return setText(shown);
    const v = Math.max(min, Math.min(max, n));
    setText(formatNumber(v, language, 2));
    if (Math.abs(v - value) > 1e-9) onCommit(v);
  };
  return (
    <input type="text" inputMode="decimal" className={field} value={text} aria-label={label} disabled={disabled} data-testid={testid}
      onBeforeInput={(e) => {
        const data = (e as InputEvent).data;
        if (data && !/^[0-9.,\-]+$/.test(data)) e.preventDefault();
      }}
      onInput={(e) => setText((e.target as HTMLInputElement).value)}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      onBlur={commit} />
  );
};

const SliderRow = ({ name, help, value, min, max, step, unit, language, disabled, onLive, onCommit, testid }: {
  name: string; help: string; value: number; min: number; max: number; step: number; unit: string; language: string; disabled: boolean;
  onLive: (v: number) => void; onCommit: (v: number) => void; testid: string;
}) => (
  <div className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-x-3 gap-y-0.5">
    <label className="text-sm font-medium text-slate-700" htmlFor={`${testid}-range`}>{name}</label>
    <input id={`${testid}-range`} type="range" min={min} max={max} step={step} value={value} disabled={disabled} data-testid={`${testid}-range`}
      aria-valuetext={`${formatNumber(value, language, 2)} ${unit}`} aria-describedby={`${testid}-help`} className="cs-range w-full"
      onInput={(e) => onLive(Number((e.target as HTMLInputElement).value))}
      onChange={(e) => onCommit(Number((e.target as HTMLInputElement).value))} />
    <span className="flex items-center gap-1 text-sm text-slate-500">
      <NumberField value={value} min={min} max={max} language={language} label={`${name} (${unit})`} disabled={disabled} onCommit={onCommit} testid={testid} />
      <span className="w-4">{unit}</span>
    </span>
    <span />
    <span id={`${testid}-help`} className="text-xs text-slate-500">{help}</span>
  </div>
);

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

/** The 3D view, or a message without WebGL. */
const View3D = ({ model, plane, section, hide, handles, pickEdges, labels, points, texts: t, label, onPlane, onPickEdge, onScene }: {
  model: Model; plane: PlaneParams; section: Section; hide: Hide; handles: boolean; pickEdges: boolean; labels: boolean; points: (Vec | null)[];
  texts: Texts; label: string;
  onPlane: (p: PlaneParams, done: boolean) => void; onPickEdge: (p: EdgePoint) => void; onScene?: (s: CrossSectionScene | null) => void;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<CrossSectionScene | null>(null);
  const callbacks = useRef({ onPlane, onPickEdge });
  callbacks.current = { onPlane, onPickEdge };
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    try {
      scene.current = new CrossSectionScene(host.current!, model, {
        onPlane: (p, done) => callbacks.current.onPlane(p, done),
        onPickEdge: (p) => callbacks.current.onPickEdge(p),
      });
      onScene?.(scene.current);
    } catch {
      setFailed(true);
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
      onScene?.(null);
    };
  }, [model]);
  useEffect(() => {
    scene.current?.update({ plane, section, hide, handles, pickEdges, labels, points });
  }, [plane, section, hide, handles, pickEdges, labels, points]);

  const keys = (e: KeyboardEvent) => {
    const s = scene.current;
    if (!s) return;
    const step = (10 * Math.PI) / 180;
    const map: Record<string, () => void> = {
      ArrowLeft: () => s.orbit(step, 0), ArrowRight: () => s.orbit(-step, 0), ArrowUp: () => s.orbit(0, step), ArrowDown: () => s.orbit(0, -step),
      "+": () => s.zoom(1 / 1.15), "=": () => s.zoom(1 / 1.15), "-": () => s.zoom(1.15), Home: () => s.resetView(),
    };
    const f = map[e.key];
    if (f) {
      e.preventDefault();
      f();
    }
  };

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-gradient-to-b from-slate-50 to-sky-50 ring-1 ring-slate-200">
      {failed ? (
        <p className="m-0 flex h-full items-center p-6 text-sm text-slate-600" role="note" data-testid="no-webgl">{t.noWebgl}</p>
      ) : (
        <div ref={host} className="h-full w-full cursor-grab focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-sky-600" tabIndex={0}
          role="application" aria-roledescription={t.viewRole} aria-label={label} aria-describedby="cs-help" onKeyDown={keys} data-testid="view" />
      )}
      {!failed && (
        <div className="absolute right-2 top-2 flex gap-1.5">
          <button type="button" className={`${button} bg-white/90 px-2 py-1 text-xs`} onClick={() => scene.current?.resetView()}>{t.resetView}</button>
        </div>
      )}
      {!failed && handles && (
        <p className="pointer-events-none absolute bottom-2 left-2 m-0 rounded-md bg-white/85 px-2 py-1 text-[11px] text-slate-600" aria-hidden="true">
          {t.handleMove} · {t.handleTilt} · {t.handleTurn}
        </p>
      )}
    </div>
  );
};

/** Snaps a picked point: to the ends, to the midpoint, else to 0.1 cm. */
const snap = (at: number, len: number) => {
  if (at < 0.04 * len) return 0;
  if (len - at < 0.04 * len) return len;
  if (Math.abs(at - len / 2) < 0.04 * len) return len / 2;
  return Math.min(len, Math.max(0, Math.round(at * 10) / 10));
};

const Interaction = ({ prompt, settings: s, model, store, texts: t, readOnly, onScene }: {
  prompt: string;
  settings: Settings;
  model: Model;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  readOnly: boolean;
  onScene?: (scene: CrossSectionScene | null) => void;
}) => {
  const state = useStore(store);
  const [live, setLive] = useState<PlaneParams | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [help, setHelp] = useState(false);
  const [active, setActive] = useState(0);
  const [warning, setWarning] = useState("");
  const reducedMotion = usePrefersReducedMotion();
  const lang = s.language;
  const n = (x: number) => formatNumber(x, lang);
  const allow = (c: string) => !readOnly && s.controls.has(c as any);
  const round = isRound(model);
  const pointsAllowed = allow("points") && !round;
  const input = pointsAllowed ? state.input : "sliders";
  const plane = live ?? state.plane;
  const section = useMemo(() => sectionOf(model, plane, s.tolerance), [model, plane.offset, plane.tilt, plane.turn, s.tolerance.length]);
  const description = describeSection(section, t, lang, s.showName, s.showMeasures);
  const R = Math.ceil(model.radius * 10) / 10;
  const anyControl = ["move", "tilt", "turn", "handles", "points"].some(allow);

  const commitPlane = (p: PlaneParams) => {
    setLive(null);
    const sec = sectionOf(model, p, s.tolerance);
    store.dispatch({ type: "SET_PLANE", payload: { plane: p, shape: sec.shape } });
    setAnnouncement(t.changed(describeSection(sec, t, lang, s.showName, s.showMeasures)));
  };
  const setPart = (key: keyof PlaneParams) => (v: number) => commitPlane({ ...state.plane, [key]: v });
  const livePart = (key: keyof PlaneParams) => (v: number) => setLive({ ...state.plane, [key]: v });

  const setPoints = (points: (EdgePoint | null)[], said: string) => {
    const full = points.every(Boolean);
    const p = full ? planeThrough(model, points as EdgePoint[], state.plane.turn) : null;
    const sec = p ? sectionOf(model, p, s.tolerance) : null;
    store.dispatch({ type: "SET_POINTS", payload: { points, plane: p, shape: sec?.shape ?? "" } });
    setWarning(full && !p ? t.collinear : "");
    setAnnouncement([said, full && !p ? t.collinear : "", sec ? t.changed(describeSection(sec, t, lang, s.showName, s.showMeasures)) : ""].filter(Boolean).join(" "));
  };
  const placePoint = (i: number, p: EdgePoint) => {
    const len = edgeLength(model, p.edge);
    const q = { edge: p.edge, at: snap(p.at, len) };
    const next = [...state.points];
    next[i] = q;
    setPoints(next, t.pointPlaced("PQR"[i], edgeName(model, q.edge), n(q.at)));
  };
  const pickEdge = (p: EdgePoint) => {
    if (input !== "points") return;
    placePoint(active, p);
    setActive((active + 1) % 3);
  };

  const points3d = input === "points" ? state.points.map((p) => (p ? pointOnEdge(model, p) : null)) : [null, null, null];
  const order = useMemo(() => edgeOrder(model), [model]);
  const solidName = `${t.solidName(model.spec.type, model.spec.baseSides)}`;
  const planeText = t.planeState(n(plane.offset), n(plane.tilt), n(plane.turn));
  const hideOptions: [Hide, string][] = [["none", t.whole], ["above", t.below], ["below", t.above]];

  return (
    <div className={`cross-section flex w-full max-w-[980px] flex-col gap-3 font-sans text-slate-800 ${reducedMotion ? "cs-reduced" : ""}`}>
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-slate-700" data-testid="prompt">{prompt}</p>}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <View3D model={model} plane={plane} section={section} hide={state.hide} handles={allow("handles")} pickEdges={input === "points"}
          labels={s.showLabels} points={points3d} texts={t} label={`${t.viewLabel(solidName, planeText)} ${t.changed(description)}`}
          onPlane={(p, done) => (done ? commitPlane(p) : setLive(p))} onPickEdge={pickEdge} onScene={onScene} />
        <section aria-labelledby="cs-section-title" className="flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <h3 id="cs-section-title" className="m-0 flex items-baseline justify-between gap-2 text-sm font-semibold text-slate-900">
            <span>{t.section}</span>
            {s.showName && section.shape !== "none" && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-300" data-testid="shape-name">
                {t.capital(t.shape[section.shape])}
              </span>
            )}
          </h3>
          <Section2D section={section} texts={t} language={lang} showName={s.showName} showMeasures={s.showMeasures} tolerance={s.tolerance.length} />
          {s.showMeasures && section.shape !== "none" && (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm" data-testid="measures">
              <dt className="text-slate-500">
                {section.shape === "circle" ? t.diameter : section.shape === "ellipse" ? t.axes : section.curved ? t.straight : t.sides}
              </dt>
              <dd className="m-0 tabular-nums" data-testid="lengths">
                {section.measures.length ? `${section.measures.map(n).join(" · ")} cm` : "–"}
              </dd>
              <dt className="text-slate-500">{t.area}</dt>
              <dd className="m-0 tabular-nums" data-testid="area">{n(section.area)} cm²</dd>
            </dl>
          )}
        </section>
      </div>

      <section aria-label={t.plane} className="flex flex-col gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
        {!anyControl && <p className="m-0 text-sm text-slate-600">{t.fixed}</p>}
        {pointsAllowed && (
          <div role="radiogroup" aria-label={t.setWith} className="flex items-center gap-2 text-sm">
            <span className="text-slate-500" aria-hidden="true">{t.setWith}:</span>
            {(["sliders", "points"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={input === m}
                className={choice(input === m)}
                onClick={() => store.dispatch({ type: "SET_INPUT", payload: { input: m } })}>
                <Check on={input === m} />{m === "sliders" ? t.sliders : t.threePoints}
              </button>
            ))}
          </div>
        )}
        {input === "sliders" && (
          <div className="flex flex-col gap-2">
            <SliderRow name={t.move} help={t.moveHelp} value={plane.offset} min={-R} max={R} step={0.1} unit="cm" language={lang} disabled={!allow("move")}
              onLive={livePart("offset")} onCommit={setPart("offset")} testid="offset" />
            <SliderRow name={t.tilt} help={t.tiltHelp} value={plane.tilt} min={0} max={90} step={0.5} unit="°" language={lang} disabled={!allow("tilt")}
              onLive={livePart("tilt")} onCommit={setPart("tilt")} testid="tilt" />
            <SliderRow name={t.turn} help={t.turnHelp} value={plane.turn} min={0} max={360} step={1} unit="°" language={lang} disabled={!allow("turn")}
              onLive={livePart("turn")} onCommit={(v) => setPart("turn")(v % 360)} testid="turn" />
          </div>
        )}
        {input === "points" && (
          <div className="flex flex-col gap-2" data-testid="points">
            <p className="m-0 text-xs text-slate-500">{t.pointsHelp}</p>
            <div role="radiogroup" aria-label={t.clickSets} className="flex items-center gap-2 text-sm">
              <span className="text-slate-500" aria-hidden="true">{t.clickSets}:</span>
              {[0, 1, 2].map((i) => (
                <button key={i} type="button" role="radio" aria-checked={active === i}
                  className={choice(active === i, "orange")}
                  onClick={() => setActive(i)}><Check on={active === i} />{"PQR"[i]}</button>
              ))}
            </div>
            {[0, 1, 2].map((i) => {
              const p = state.points[i];
              const len = p ? edgeLength(model, p.edge) : 0;
              const first = p ? model.labels[model.edges[p.edge][0]] : "";
              return (
                <fieldset key={i} className="m-0 flex flex-wrap items-center gap-2 border-0 p-0 text-sm">
                  <legend className="float-left mr-1 w-16 font-medium text-orange-900">{t.point("PQR"[i])}</legend>
                  <label className="flex items-center gap-1.5">
                    <span className="text-slate-500">{t.onEdge}</span>
                    <select className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm" value={p ? String(p.edge) : ""} data-testid={`point-${i}-edge`} aria-label={`${t.point("PQR"[i])} ${t.onEdge}`}
                      onChange={(e) => {
                        const edge = Number((e.target as HTMLSelectElement).value);
                        placePoint(i, { edge, at: edgeLength(model, edge) / 2 });
                      }}>
                      {!p && <option value="">–</option>}
                      {order.map((e) => <option key={e} value={String(e)}>{edgeName(model, e)}</option>)}
                    </select>
                  </label>
                  {p && (
                    <>
                      <NumberField value={p.at} min={0} max={len} language={lang} label={`${t.point("PQR"[i])}: ${t.from(first)}`} testid={`point-${i}-at`}
                        onCommit={(v) => placePoint(i, { edge: p.edge, at: v })} />
                      <span className="text-slate-500">{t.from(first)}</span>
                      <button type="button" className={`${button} px-2 py-1 text-xs`} onClick={() => placePoint(i, { edge: p.edge, at: len / 2 })}>
                        {t.midpoint}
                      </button>
                    </>
                  )}
                </fieldset>
              );
            })}
            {warning && <p className="m-0 text-sm font-medium text-rose-700" role="alert">{warning}</p>}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {allow("hide") ? (
            <div role="radiogroup" aria-label={t.show} className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-slate-500" aria-hidden="true">{t.show}:</span>
              {hideOptions.map(([h, label]) => (
                <button key={h} type="button" role="radio" aria-checked={state.hide === h}
                  className={choice(state.hide === h)}
                  onClick={() => {
                    store.dispatch({ type: "SET_HIDE", payload: { hide: h } });
                    setAnnouncement(t.shown(label));
                  }}><Check on={state.hide === h} />{label}</button>
              ))}
            </div>
          ) : <span />}
          <div className="flex gap-1.5">
            {!readOnly && (
              <button type="button" className={button} onClick={() => {
                setLive(null);
                store.reset();
                setAnnouncement(t.resetDone);
              }}>{t.reset}</button>
            )}
            <button type="button" className={button} aria-expanded={help} aria-controls="cs-help" onClick={() => setHelp(!help)}>{t.help}</button>
          </div>
        </div>
        <p id="cs-help" className={help ? "m-0 text-sm text-slate-600" : "sr-only"}>{t.helpText}</p>
      </section>
      <div role="status" aria-live="polite" className="sr-only" data-testid="status">{announcement}</div>
    </div>
  );
};

export default Interaction;
