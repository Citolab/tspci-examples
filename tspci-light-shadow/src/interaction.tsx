import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import {
  Axis, Measures, Positions, Range, Scene, View, lampRange, lightMap, measure, moveLamp, moveObject, objectRange,
} from "./optics";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";
import { formatNumber } from "./format";
import Drawing from "./drawing";
import { LightScene, Picked } from "./scene3d";

// The candidate's view: the instruction, the 3D room, the 2D drawing (side or top view), a slider for everything
// that can move, and the shadow as measured. Everything the mouse can drag, the sliders do with the keyboard.

export type Options = {
  mode: "answer" | "tool";
  view: "both" | "3d" | "2d";
  showRays: boolean;
  showMeasurements: boolean;
  language: "en" | "nl";
  readOnly: boolean;
  solution: boolean;
};

/** The light map's cells: about 1.25 cm, coarser while something is being dragged. */
const gridOf = (scene: Scene, coarse: boolean) => {
  const cell = coarse ? 2.5 : 1.25;
  const scale = Math.min(1 / cell, 260 / Math.max(scene.screen.width, scene.screen.height));
  return { columns: Math.max(8, Math.round(scene.screen.width * scale)), rows: Math.max(8, Math.round(scene.screen.height * scale)) };
};

const AXES: Axis[] = ["x", "y", "z"];

const Interaction = ({ prompt, scene, store, texts: t, options }: {
  prompt: string;
  scene: Scene;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  options: Options;
}) => {
  const state = useStore(store);
  // while the candidate drags or slides: the positions before they go in the store
  const [live, setLive] = useState<Positions | null>(null);
  const [view, setView] = useState<View>("side");
  const [announcement, setAnnouncement] = useState("");
  const [webgl, setWebgl] = useState(true);
  const positions = live ?? state.positions;
  const measures = useMemo(() => measure(scene, positions), [scene, positions]);
  const n = (v: number, d = 1) => formatNumber(v, d, options.language);
  const cm = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${n(v)} cm`);

  const movable = (p: Picked) => {
    if (options.readOnly) return false;
    if (p.kind === "object") return !!scene.object.move;
    return Object.keys(scene.lamps[p.index]?.move ?? {}).length > 0;
  };
  const nameOf = (p: Picked) => (p.kind === "lamp" ? t.lamp(p.index + 1, scene.lamps.length) : t.object[scene.object.type]);
  const axisName = (a: Axis) => (a === "x" ? t.distance : a === "y" ? t.height : t.side);

  const commit = (next: Positions, what: string, value: string) => {
    setLive(null);
    store.dispatch({ type: "MOVE", payload: { positions: next } });
    const m = measure(scene, next);
    setAnnouncement(m ? t.announce(what, value, cm(m.values.shadowHeight), cm(m.values.shadowWidth), cm(m.values.umbraHeight)) : t.announceNoShadow(what, value));
  };
  const liveRef = useRef<Positions | null>(null);
  liveRef.current = live;

  /** A drag (3D or the drawing) moves the item along the axes it may move along. */
  const dragTo = (p: Picked, point: { x?: number; y?: number; z?: number }) => {
    let next = liveRef.current ?? store.getState().positions;
    if (p.kind === "object") {
      if (point.x !== undefined) next = moveObject(scene, next, point.x);
    } else {
      for (const a of AXES) if (point[a] !== undefined && scene.lamps[p.index].move[a]) next = moveLamp(scene, next, p.index, a, point[a]!);
    }
    liveRef.current = next; // the drag may end before the next render
    setLive(next);
  };
  const dragEnd = (p: Picked) => {
    const next = liveRef.current;
    if (!next) return;
    const value = p.kind === "object" ? cm(next.objectX) : cm(next.lamps[p.index].x);
    commit(next, nameOf(p), value);
  };

  // the 3D view: made once, fed with every change, freed when the interaction goes
  const host = useRef<HTMLDivElement>(null);
  const three = useRef<LightScene | null>(null);
  const handlers = useRef({ dragTo, dragEnd });
  handlers.current = { dragTo, dragEnd };
  const show3d = options.view !== "2d" && webgl;
  useEffect(() => {
    if (!show3d || !host.current) return;
    try {
      three.current = new LightScene(host.current, {
        onDrag: (p, point, axes) => handlers.current.dragTo(p, Object.fromEntries(axes.map((a) => [a, point[a]]))),
        onDragEnd: (p) => handlers.current.dragEnd(p),
      });
    } catch {
      setWebgl(false);
      return;
    }
    (host.current as any).__lightScene = three.current; // for tests
    return () => {
      three.current?.dispose();
      three.current = null;
    };
  }, [show3d]);
  const coarse = live !== null;
  const light = useMemo(() => {
    if (!show3d) return null;
    const { columns, rows } = gridOf(scene, coarse);
    return { values: lightMap(scene, positions, columns, rows, coarse ? 1 : 2), columns, rows };
  }, [scene, positions, coarse, show3d]);
  useEffect(() => {
    if (three.current && light) three.current.update({ setup: scene, positions, measures, light, showRays: options.showRays, movable });
  });

  const onKey3d = (e: KeyboardEvent) => {
    const s = three.current;
    if (!s) return;
    const step = e.shiftKey ? 0.3 : 0.1;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => s.turn(step, 0), ArrowRight: () => s.turn(-step, 0), ArrowUp: () => s.turn(0, -step), ArrowDown: () => s.turn(0, step),
      "+": () => s.turn(0, 0, 0.88), "=": () => s.turn(0, 0, 0.88), "-": () => s.turn(0, 0, 1 / 0.88), "0": () => s.resetView(),
    };
    if (keys[e.key]) {
      keys[e.key]();
      e.preventDefault();
    }
  };

  // a slider per thing that can move
  const sliders: { key: string; label: string; what: string; range: Range; value: number; set: (v: number) => Positions; testid: string }[] = [];
  scene.lamps.forEach((lamp, i) => {
    for (const a of AXES) {
      if (!lamp.move[a]) continue;
      const r = lampRange(scene, positions, i, a)!;
      sliders.push({
        key: `lamp${i}${a}`, what: t.lamp(i + 1, scene.lamps.length), label: `${t.lamp(i + 1, scene.lamps.length)}: ${axisName(a).toLowerCase()}`,
        range: r, value: positions.lamps[i][a], set: (v) => moveLamp(scene, liveRef.current ?? store.getState().positions, i, a, v), testid: `lamp${i + 1}-${a}`,
      });
    }
  });
  if (scene.object.move) {
    sliders.push({
      key: "object", what: t.object[scene.object.type], label: `${t.object[scene.object.type]}: ${t.distance.toLowerCase()}`,
      range: objectRange(scene, positions)!, value: positions.objectX, set: (v) => moveObject(scene, liveRef.current ?? store.getState().positions, v), testid: "object-x",
    });
  }
  // the fixed ones, so the candidate knows the whole set-up
  const fixed: string[] = [];
  scene.lamps.forEach((lamp, i) => {
    const l = positions.lamps[i];
    const kind = lamp.size > 0 ? t.roundLamp(cm(lamp.size)) : t.pointLamp;
    const parts = [!lamp.move.x && `${t.distance.toLowerCase()} ${cm(l.x)}`, !lamp.move.y && `${t.height.toLowerCase()} ${cm(l.y)}`, !lamp.move.z && l.z !== 0 && `${t.side.toLowerCase()} ${cm(l.z)}`].filter(Boolean);
    fixed.push(`${t.lamp(i + 1, scene.lamps.length)} (${kind})${parts.length ? `: ${parts.join(", ")}` : ""}`);
  });
  const o = scene.object;
  fixed.push(`${t.object[o.type]} (${t.objectSize(cm(o.width), cm(o.height))})${o.move ? "" : `: ${t.distance.toLowerCase()} ${cm(positions.objectX)}`}`);

  const values = measures?.values;
  return (
    <div className="light-shadow flex w-full max-w-[760px] flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 max-w-[70ch] text-[15px] leading-relaxed text-slate-700" data-testid="prompt">{prompt}</p>}
      {options.solution && (
        <p className="m-0 inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200" data-testid="solution">
          <span aria-hidden="true">✓</span>{t.solution}
        </p>
      )}
      <section aria-label={t.simulation} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {options.view !== "2d" && (
          webgl ? (
            <div className="relative">
              <div ref={host} tabIndex={0} role="application" aria-label={t.view3d} aria-describedby="ls-help" onKeyDown={onKey3d as any}
                data-testid="view3d" className="ls-view3d aspect-[16/9] w-full bg-gradient-to-b from-slate-100 to-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600" />
              <p id="ls-help" className="pointer-events-none absolute bottom-2 left-3 right-[11.5rem] m-0 text-[11px] leading-tight text-slate-500">{t.view3dHelp}</p>
              <div className="absolute bottom-2 right-2 flex gap-1">
                {[["⟲", t.turnLeft, () => three.current?.turn(0.25, 0)], ["⟳", t.turnRight, () => three.current?.turn(-0.25, 0)], ["+", t.zoomIn, () => three.current?.turn(0, 0, 0.8)], ["−", t.zoomOut, () => three.current?.turn(0, 0, 1.25)], ["⌂", t.resetView, () => three.current?.resetView()]].map(([label, name, run]) => (
                  <button key={label as string} type="button" aria-label={name as string} onClick={run as () => void}
                    className="grid size-7 place-items-center rounded-md bg-white/90 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-white focus-visible:outline-2 focus-visible:outline-sky-600">{label}</button>
                ))}
              </div>
            </div>
          ) : (
            <p className="m-0 border-b border-slate-100 bg-amber-50 px-4 py-2 text-sm text-amber-900" role="note" data-testid="no-webgl">{t.noWebgl}</p>
          )
        )}
        {(options.view !== "3d" || !webgl) && (
          <div className="border-t border-slate-100 px-3 pb-2 pt-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.drawing}</h3>
              <div role="radiogroup" aria-label={t.drawing} className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
                {(["side", "top"] as View[]).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} data-testid={`view-${v}`}
                    className={`rounded-md px-2.5 py-1 font-medium focus-visible:outline-2 focus-visible:outline-sky-600 ${view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}>
                    {v === "side" ? t.sideView : t.topView}
                  </button>
                ))}
              </div>
            </div>
            <Drawing scene={scene} positions={positions} measures={measures} view={view} texts={t} language={options.language}
              showRays={options.showRays} showMeasurements={options.showMeasurements} movable={movable} onDrag={dragTo} onDragEnd={dragEnd} />
            <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[11px] text-slate-600" aria-hidden="true">
              <li className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 bg-slate-800" />{t.umbra}</li>
              <li className="inline-flex items-center gap-1.5"><span className="ls-hatch inline-block h-3 w-3 ring-1 ring-slate-700" />{t.penumbra}</li>
              {options.showRays && <li className="inline-flex items-center gap-1.5"><span className="inline-block h-0 w-4 border-t-2 border-amber-600" />{t.rays}</li>}
            </ul>
          </div>
        )}

        <div className="grid gap-4 border-t border-slate-100 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
          <div className="flex flex-col gap-3">
            <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.controls}</h3>
            {sliders.map((s) => (
              <Slider key={s.key} label={s.label} range={s.range} step={scene.step} value={s.value} disabled={options.readOnly} testid={s.testid} t={t}
                display={cm} onLive={(v) => { const next = s.set(v); liveRef.current = next; setLive(next); }}
                onCommit={(v) => { const next = s.set(v); commit(next, s.label, cm(v)); }} />
            ))}
            {options.readOnly && <p className="m-0 text-xs text-slate-500">{t.readOnly}</p>}
            <ul className="m-0 list-none p-0 text-xs leading-relaxed text-slate-500" data-testid="fixed">
              {fixed.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
          {options.showMeasurements && (
            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.measurements}</h3>
              {values ? (
                <table className="w-full border-collapse text-sm tabular-nums" data-testid="measurements">
                  <thead>
                    <tr className="text-xs text-slate-500">
                      <th className="py-1 text-left font-medium" scope="col"><span className="sr-only">{t.measurements}</span></th>
                      <th className="py-1 text-right font-medium" scope="col">{t.heightCol}</th>
                      <th className="py-1 text-right font-medium" scope="col">{t.widthCol}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([["whole", t.whole, values.shadowHeight, values.shadowWidth], ["umbra", t.umbra, values.umbraHeight, values.umbraWidth], ["penumbra", t.penumbra, values.penumbraHeight, values.penumbraWidth]] as const).map(([key, label, h, w]) => (
                      <tr key={key} className="border-t border-slate-100" data-testid={`row-${key}`}>
                        <th scope="row" className="py-1.5 text-left font-medium text-slate-700">
                          <span className={`mr-1.5 inline-block h-2.5 w-2.5 align-middle ${key === "umbra" ? "bg-slate-800" : key === "penumbra" ? "ls-hatch ring-1 ring-slate-700" : "bg-slate-400"}`} aria-hidden="true" />
                          {label}
                        </th>
                        <td className="py-1.5 text-right text-slate-900">{cm(h)}</td>
                        <td className="py-1.5 text-right text-slate-900">{cm(w)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="m-0 text-sm text-rose-700">{t.noShadow}</p>
              )}
              {values && (
                <p className="m-0 flex items-baseline justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm" data-testid="magnification">
                  <span className="text-slate-600">{t.magnification}</span>
                  <span className="font-semibold tabular-nums text-slate-900">{n(values.magnification!, 2)}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </section>
      <div role="status" aria-live="polite" className="sr-only" data-testid="live">{announcement}</div>
    </div>
  );
};

/** A range input with − and + buttons; the value goes in the store when the candidate lets go (change). */
const Slider = ({ label, range, step, value, disabled, testid, t, display, onLive, onCommit }: {
  label: string; range: Range; step: number; value: number; disabled: boolean; testid: string; t: Texts;
  display: (v: number) => string; onLive: (v: number) => void; onCommit: (v: number) => void;
}) => {
  const [lo, hi] = range;
  const button = "grid size-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-lg leading-none text-slate-700 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-sky-600";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <label htmlFor={`ls-${testid}`} className="font-medium text-slate-700">{label}</label>
        <output htmlFor={`ls-${testid}`} className="tabular-nums font-semibold text-slate-900" data-testid={`${testid}-value`}>{display(value)}</output>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className={button} aria-label={t.less(label)} disabled={disabled || value <= lo + 1e-9} onClick={() => onCommit(value - step)}>−</button>
        <input id={`ls-${testid}`} type="range" min={lo} max={hi} step="any" value={value} disabled={disabled} data-testid={testid}
          aria-valuetext={display(value)} className="ls-range h-2 w-full cursor-pointer accent-sky-700"
          onInput={(e) => onLive(Number((e.currentTarget as HTMLInputElement).value))}
          onChange={(e) => onCommit(Number((e.currentTarget as HTMLInputElement).value))}
          onKeyDown={(e) => {
            // the arrow keys step by the scene's step (a native range with step="any" would move in tiny steps)
            const keys: Record<string, number> = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -step * 5, PageUp: step * 5 };
            if (e.key in keys) {
              e.preventDefault();
              onCommit(value + keys[e.key]);
            } else if (e.key === "Home" || e.key === "End") {
              e.preventDefault();
              onCommit(e.key === "Home" ? lo : hi);
            }
          }} />
        <button type="button" className={button} aria-label={t.more(label)} disabled={disabled || value >= hi - 1e-9} onClick={() => onCommit(value + step)}>+</button>
      </div>
    </div>
  );
};

export default Interaction;
