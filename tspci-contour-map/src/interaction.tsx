import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";
import {
  Answer, Band, Contour, Grid, Model, Point, Task, correctAnswer, evaluateTask, formatNumber, lineOf, minLineLength,
  parseNumber, profile, targetOf,
} from "./terrain";
import { ContourMap, Legend, Marker, Projection, linePath } from "./map";
import { ProfileGraph } from "./profile";
import { Overlay, ReliefScene } from "./scene3d";

// The candidate's view: the contour map and the 3D relief model side by side (linked: the pointer on one shows on the
// other), and below them the tasks, each in a tab, with what the task needs (the cross-section graph, the heights).

export type View = {
  interval: number;
  tints: boolean;
  labels: boolean;
  show3d: boolean;
  exaggeration: number;
  showHeight: boolean;
  language: string;
};

export type InteractionProps = {
  prompt: string;
  model: Model;
  grid: Grid;
  contours: Contour[];
  bands: Band[];
  tasks: Task[];
  view: View;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  readOnly: boolean;
  /** review: the correct answers drawn next to the candidate's */
  showTruth: boolean;
};

// colour-blind safe, and every marker also has its own shape and letter
const CANDIDATE = "#1d4ed8"; // blue
const TRUTH = "#0f766e"; // teal, dashed
const GIVEN = "#0f172a"; // the author's points: black
const REGION = "#7c3aed"; // purple, dashed outline

export const usePrefersReducedMotion = () => {
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
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600";
const iconButton =
  "grid size-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600";

/** The instruction of a task: the author's, or the standard one for its type. */
export const instructionOf = (task: Task, t: Texts) => {
  if (task.text) return task.text;
  switch (task.type) {
    case "profile": return task.a && task.b ? t.instruction.profileFixed : t.instruction.profileFree;
    case "height": return t.instruction.height;
    case "river": return t.instruction.river;
    case "point": {
      const target = task.target ?? "highest";
      return target === "region" ? t.instruction.region(task.regionLabel ?? "") : t.instruction[target];
    }
  }
};

const Interaction = (props: InteractionProps) => {
  const { model, grid, tasks, view, store, texts: t, readOnly } = props;
  const { answers } = useStore(store);
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<Point | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [exaggeration, setExaggeration] = useState(view.exaggeration);
  const [livePath, setLiveState] = useState<Point[] | null>(null);
  // the stream while dragging, also between two paints
  const liveRef = useRef<Point[] | null>(null);
  const setLivePath = (path: Point[] | null) => {
    liveRef.current = path;
    setLiveState(path);
  };
  const lang = view.language;
  const n0 = (v: number) => formatNumber(v, 0, lang);
  const where = (p: Point) => t.at(n0(p.x), n0(p.y));
  const task = tasks[active];
  const answer: Answer = answers[active] ?? {};
  const set = (a: Answer, message?: string) => {
    store.dispatch({ type: "SET_ANSWER", payload: { index: active, answer: a } });
    if (message) setAnnouncement(message);
  };
  // the correct answers of every task (review, and the region and source points are the author's anyway)
  const truths = useMemo(() => (props.showTruth ? tasks.map((k) => correctAnswer(model, k)) : null), [props.showTruth, tasks, model]);
  const truth = truths?.[active];
  const heightText = (p: Point | null) => (p && view.showHeight ? t.metres(n0(model.height(p.x, p.y))) : null);

  const onHover = (p: Point | null, keyboard?: boolean) => {
    setHover(p);
    if (keyboard && p) setAnnouncement(t.cursor(view.showHeight ? t.hoverHeight(where(p), n0(model.height(p.x, p.y))) : where(p)));
  };

  const pathOf = (a: Answer) => (a.path?.length ? a.path : task?.source ? [task.source] : []);
  const far = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) >= Math.max(grid.width, grid.depth) / 80;
  const round = (p: Point) => ({ x: Math.round(p.x), y: Math.round(p.y) });

  const onPick = (raw: Point, keyboard?: boolean) => {
    if (readOnly || !task) return;
    const p = round(raw);
    switch (task.type) {
      case "profile":
        if (task.a && task.b) return;
        if (!answer.a || answer.b) return set({ ...answer, a: p, b: null }, t.lineA(where(p)));
        return set({ ...answer, b: p }, t.lineB(where(p), n0(Math.hypot(p.x - answer.a.x, p.y - answer.a.y))));
      case "point":
        return set({ p }, t.pointPlaced(where(p)));
      case "river": {
        const path = [...pathOf(answer), p];
        if (!keyboard) setLivePath(path); // a drag goes on from here
        return set({ path }, t.pathAdded(where(p)));
      }
    }
  };
  const onStroke = (raw: Point) => {
    const live = liveRef.current;
    if (readOnly || task?.type !== "river" || !live) return;
    const p = round(raw);
    if (far(live[live.length - 1], p)) setLivePath([...live, p]);
  };
  const onStrokeEnd = () => {
    const live = liveRef.current;
    if (task?.type === "river" && live && live.length !== pathOf(answer).length) set({ path: live }, t.pathAdded(where(live[live.length - 1])));
    setLivePath(null);
  };

  // what the active task shows on the map and in the 3D model
  const line = task?.type === "profile" ? lineOf(task, answer) : null;
  const shownPath = livePath ?? (task?.type === "river" ? pathOf(answer) : []);
  const truePath = task?.type === "river" && truth?.path ? truth.path : null;
  const truePoint = task?.type === "point" && props.showTruth ? targetOf(model, task) : null;

  const overlay: Overlay = { markers: [], lines: [] };
  if (task?.type === "profile") {
    if (line) overlay.lines.push({ points: [line.a, line.b], color: task.a ? GIVEN : CANDIDATE });
    for (const q of [task.a ?? answer.a, task.b ?? answer.b]) if (q) overlay.markers.push({ p: q, color: task.a ? GIVEN : CANDIDATE });
  }
  if (task?.type === "point") {
    if (answer.p) overlay.markers.push({ p: answer.p, color: CANDIDATE, size: 1.3 });
    if (truePoint) overlay.markers.push({ p: truePoint, color: TRUTH });
    if (task.source) overlay.markers.push({ p: task.source, color: GIVEN });
  }
  if (task?.type === "height") for (const m of task.marks ?? []) overlay.markers.push({ p: m, color: GIVEN });
  if (task?.type === "river") {
    if (task.source) overlay.markers.push({ p: task.source, color: GIVEN });
    if (shownPath.length > 1) overlay.lines.push({ points: shownPath, color: CANDIDATE });
    if (truePath) overlay.lines.push({ points: truePath, color: TRUTH });
  }

  const drawOverlay = (pr: Projection) => {
    if (!task) return null;
    const px = pr.px;
    return (
      <g data-testid="map-overlay">
        {task.type === "profile" && line && (
          <path d={linePath([line.a, line.b], pr)} stroke={task.a ? GIVEN : CANDIDATE} stroke-width="2.5" stroke-dasharray={task.a ? "8 5" : undefined} fill="none" pointer-events="none" />
        )}
        {task.type === "profile" && (task.a ?? answer.a) && <Marker at={px((task.a ?? answer.a)!)} label={t.pointA} tone={task.a ? GIVEN : CANDIDATE} testid="marker-a" />}
        {task.type === "profile" && (task.b ?? answer.b) && <Marker at={px((task.b ?? answer.b)!)} label={t.pointB} tone={task.b ? GIVEN : CANDIDATE} testid="marker-b" />}
        {task.type === "point" && task.region && (
          <g pointer-events="none">
            <circle cx={px(task.region).x} cy={px(task.region).y} r={task.region.r * pr.k} fill={REGION} fill-opacity="0.06" stroke={REGION} stroke-width="2" stroke-dasharray="6 4" />
            {task.regionLabel && <text x={px(task.region).x} y={px(task.region).y - task.region.r * pr.k - 5} text-anchor="middle" font-size="12" font-weight="700" fill={REGION}
              style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 3 }}>{task.regionLabel}</text>}
          </g>
        )}
        {(task.type === "river" || (task.type === "point" && task.target === "flowEnd")) && task.source && <Marker at={px(task.source)} label={t.source} shape="triangle" testid="marker-s" />}
        {task.type === "point" && truePoint && <Marker at={px(truePoint)} label="✓" shape="diamond" tone={TRUTH} testid="marker-truth" />}
        {task.type === "point" && answer.p && <Marker at={px(answer.p)} label="×" shape="square" tone={CANDIDATE} testid="marker-p" />}
        {task.type === "height" && (task.marks ?? []).map((m, i) => <Marker key={i} at={px(m)} label={m.label} shape="circle" testid={`marker-${m.label}`} />)}
        {truePath && <path d={linePath(truePath, pr)} stroke={TRUTH} stroke-width="3" stroke-dasharray="7 5" fill="none" pointer-events="none" data-testid="river-truth" />}
        {task.type === "river" && shownPath.length > 1 && (
          <g pointer-events="none" data-testid="river-path">
            <path d={linePath(shownPath, pr)} stroke="#ffffff" stroke-width="5.5" fill="none" stroke-linejoin="round" stroke-linecap="round" />
            <path d={linePath(shownPath, pr)} stroke={CANDIDATE} stroke-width="3" fill="none" stroke-linejoin="round" stroke-linecap="round" />
            {shownPath.slice(1).map((q, i) => <circle key={i} cx={px(q).x} cy={px(q).y} r="2.5" fill={CANDIDATE} />)}
          </g>
        )}
      </g>
    );
  };

  const mapLabel = `${t.map}${task ? `: ${t.task(active + 1)}, ${instructionOf(task, t)}` : ""}`;

  return (
    <div className="contour-map @container flex w-full flex-col gap-3 font-sans text-slate-800">
      {props.prompt && <p className="m-0 max-w-[75ch] text-[15px] leading-relaxed text-slate-700" data-testid="prompt">{props.prompt}</p>}
      <div className={`grid gap-3 ${view.show3d ? "@3xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" : ""}`}>
        <section aria-label={t.map} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <ContourMap grid={grid} contours={props.contours} bands={props.bands} interval={view.interval} tints={view.tints} labels={view.labels}
            language={lang} texts={t} label={mapLabel} description={t.mapHelp.replace("{interval}", n0(view.interval))} hover={hover}
            hoverText={heightText(hover)} onHover={onHover} onPick={onPick} onStroke={onStroke} onStrokeEnd={onStrokeEnd} readOnly={readOnly}>
            {drawOverlay}
          </ContourMap>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
            {view.tints ? <Legend bands={props.bands} texts={t} language={lang} /> : <span />}
            <span className="text-xs tabular-nums text-slate-500" data-testid="readout" aria-hidden="true">
              {hover ? (view.showHeight ? t.hoverHeight(where(hover), n0(model.height(hover.x, hover.y))) : where(hover)) : t.mapHelp.split(".")[0] + "."}
            </span>
          </div>
        </section>
        {view.show3d && (
          <Relief model={model} grid={grid} contours={props.contours} bands={props.bands} tints={view.tints} texts={t} hover={hover}
            hoverText={heightText(hover)} overlay={overlay} exaggeration={exaggeration} setExaggeration={setExaggeration} language={lang}
            onHover={setHover} onPick={(q) => onPick(q, true)} />
        )}
      </div>

      <section aria-label={t.tasks} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {tasks.length > 1 && (
          <div role="tablist" aria-label={t.tasks} className="flex flex-wrap gap-1 border-b border-slate-100 p-2">
            {tasks.map((k, i) => {
              const done = evaluateTask(model, k, answers[i]).answered;
              return (
                <button key={i} type="button" role="tab" id={`task-tab-${i}`} aria-controls="task-panel" aria-selected={i === active}
                  tabIndex={i === active ? 0 : -1} data-testid={`task-tab-${i + 1}`}
                  aria-label={`${t.task(i + 1)}: ${k.type === "point" ? t.target[k.target ?? "highest"] : t.taskType[k.type]}, ${done ? t.answered : t.notAnswered}`}
                  onClick={() => { setActive(i); setLivePath(null); }}
                  onKeyDown={(e) => {
                    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                    if (!d) return;
                    const next = (i + d + tasks.length) % tasks.length;
                    setActive(next);
                    ((e.currentTarget as HTMLElement).parentElement?.children[next] as HTMLElement)?.focus();
                    e.preventDefault();
                  }}
                  className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 aria-selected:bg-sky-50 aria-selected:font-semibold aria-selected:text-sky-900">
                  <span className={`grid size-5 place-items-center rounded-full text-[11px] font-bold ${done ? "bg-sky-700 text-white" : "border border-slate-300 text-slate-500"}`} aria-hidden="true">
                    {done ? "✓" : i + 1}
                  </span>
                  {k.type === "point" ? t.target[k.target ?? "highest"] : t.taskType[k.type]}
                </button>
              );
            })}
          </div>
        )}
        {task && (
          <div id="task-panel" role={tasks.length > 1 ? "tabpanel" : "group"} aria-labelledby={tasks.length > 1 ? `task-tab-${active}` : undefined}
            aria-label={tasks.length > 1 ? undefined : t.task(1)} className="flex flex-col gap-3 p-4" data-testid="task-panel">
            <p className="m-0 text-[15px] font-medium leading-relaxed text-slate-800" data-testid="instruction">
              {tasks.length > 1 && <span className="mr-1.5 text-slate-500">{active + 1}.</span>}
              {instructionOf(task, t)}
            </p>
            {props.showTruth && <p className="m-0 text-sm text-teal-800" data-testid="solution-note">{t.solutionNote}</p>}
            <TaskControls key={active} {...props} task={task} answer={answer} index={active} set={set} truth={truth} where={where}
              setAnnouncement={setAnnouncement} />
          </div>
        )}
      </section>
      <div role="status" aria-live="polite" className="sr-only" data-testid="status">{announcement}</div>
    </div>
  );
};

/** What a task needs below its instruction. */
const TaskControls = (p: InteractionProps & {
  task: Task; answer: Answer; index: number; truth?: Answer; set: (a: Answer, message?: string) => void; where: (p: Point) => string;
  setAnnouncement: (s: string) => void;
}) => {
  const { task, answer, model, grid, view, texts: t, readOnly, set } = p;
  const lang = view.language;
  const n0 = (v: number) => formatNumber(v, 0, lang);
  if (task.type === "profile") {
    const line = lineOf(task, answer);
    const free = !(task.a && task.b);
    const samples = task.samples ?? 9;
    const heights = Array.from({ length: samples }, (_, i) => answer.heights?.[i] ?? null);
    const length = line ? Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y) : 0;
    const step = view.interval;
    const min = Math.floor(grid.min / step) * step, max = Math.ceil(grid.max / step) * step;
    const truth = p.showTruth && line ? profile(model.height, line.a, line.b, samples) : null;
    return (
      <div className="flex flex-col gap-2">
        {free && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span data-testid="line-hint">{!answer.a ? t.lineHint : !answer.b ? t.lineHintB : length < minLineLength(model.terrain) ? t.lineTooShort : t.profile(t.pointA, t.pointB) + `: ${n0(length)} m`}</span>
            {answer.a && !readOnly && (
              <button type="button" className={button} onClick={() => set({ ...answer, a: null, b: null }, t.lineHint)}>{t.lineAgain}</button>
            )}
          </div>
        )}
        {line && (
          <>
            <p className="m-0 text-xs text-slate-500" id="profile-help">{t.profileHelp}</p>
            <ProfileGraph heights={heights} length={length} min={min} max={max} interval={view.interval} language={lang} texts={t} truth={truth}
              readOnly={readOnly} onChange={(next, i) => set({ ...answer, heights: next }, i !== undefined ? t.heightSet(i + 1, next[i] === null ? t.notSet : n0(next[i]!)) : undefined)} />
            {!readOnly && (
              <div>
                <button type="button" className={button} disabled={heights.every((h) => h === null)}
                  onClick={() => set({ ...answer, heights: heights.map(() => null) })}>{t.clearProfile}</button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }
  if (task.type === "point") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-700" data-testid="point-answer">
          {answer.p ? `${t.yourPoint}: ${p.where(answer.p)}` : t.notAnswered}
          {answer.p && view.showHeight ? ` (${t.heightHere(n0(model.height(answer.p.x, answer.p.y)))})` : ""}
        </span>
        {answer.p && !readOnly && <button type="button" className={button} onClick={() => set({ p: null })}>{t.removePoint}</button>}
      </div>
    );
  }
  if (task.type === "height") {
    return (
      <div className="flex flex-wrap gap-3">
        {(task.marks ?? []).map((m, i) => (
          <HeightInput key={i} label={t.heightOf(m.label)} value={answer.values?.[i] ?? null} language={lang} readOnly={readOnly} texts={t}
            testid={`height-${i + 1}`}
            onChange={(v) => {
              const values = (task.marks ?? []).map((_, j) => answer.values?.[j] ?? null);
              values[i] = v;
              set({ values });
            }} />
        ))}
      </div>
    );
  }
  // river
  const path = answer.path?.length ? answer.path : [];
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-600" data-testid="path-count">{t.pathPoints(Math.max(0, path.length - 1))}</span>
      {!readOnly && (
        <>
          <button type="button" className={button} disabled={path.length < 2}
            onClick={() => set({ path: path.length > 2 ? path.slice(0, -1) : [] }, t.pathUndone)}>{t.undoPoint}</button>
          <button type="button" className={button} disabled={path.length < 2} onClick={() => set({ path: [] }, t.pathCleared)}>{t.clearPath}</button>
        </>
      )}
    </div>
  );
};

/** A height in metres, typed with a comma or a point (as the language has it). */
const HeightInput = ({ label, value, language, readOnly, onChange, texts, testid }: {
  label: string; value: number | null; language: string; readOnly: boolean; onChange: (v: number | null) => void; texts: Texts; testid: string;
}) => {
  const shown = value === null ? "" : formatNumber(value, value % 1 ? 1 : 0, language);
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  const invalid = text.trim() !== "" && parseNumber(text) === null;
  useEffect(() => {
    if (!focused) setText(shown);
  }, [shown, focused]);
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-700">
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        <input type="text" inputMode="decimal" className="h-10 w-28 rounded-lg border border-slate-300 bg-white px-3 text-right tabular-nums text-slate-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 aria-invalid:border-rose-600"
          value={text} readOnly={readOnly} aria-label={label} aria-invalid={invalid || undefined} data-testid={testid} autoComplete="off"
          onBeforeInput={(e: InputEvent) => {
            if (e.data && !/^[\d.,\-−\s]+$/.test(e.data)) e.preventDefault();
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setText(shown); }}
          onInput={(e) => {
            const next = (e.currentTarget as HTMLInputElement).value;
            setText(next);
            const v = parseNumber(next);
            if (next.trim() === "") onChange(null);
            else if (v !== null && v !== value) onChange(Math.round(v * 10) / 10);
          }} />
        <span aria-hidden="true">m</span>
      </span>
      {invalid && <span className="text-xs text-rose-700">{texts.notANumber}</span>}
    </label>
  );
};

/** The 3D relief model, or a message without WebGL; its controls for the keyboard. */
const Relief = (p: {
  model: Model; grid: Grid; contours: Contour[]; bands: Band[]; tints: boolean; texts: Texts; hover: Point | null; hoverText: string | null;
  overlay: Overlay; exaggeration: number; setExaggeration: (e: number) => void; language: string;
  onHover: (p: Point | null) => void; onPick: (p: Point) => void;
}) => {
  const { texts: t } = p;
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReliefScene | null>(null);
  const [failed, setFailed] = useState(false);
  const handlers = useRef({ onHover: p.onHover, onPick: p.onPick });
  handlers.current = { onHover: p.onHover, onPick: p.onPick };

  useEffect(() => {
    if (!host.current) return;
    try {
      scene.current = new ReliefScene(host.current, {
        grid: p.grid, contours: p.contours, bands: p.bands, tints: p.tints, height: p.model.height,
        onHover: (q) => handlers.current.onHover(q), onPick: (q) => handlers.current.onPick(q),
      });
      scene.current.setExaggeration(p.exaggeration);
      (host.current as any).__relief = scene.current; // for tests
    } catch {
      setFailed(true);
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, [p.grid, p.contours, p.bands, p.tints]);
  useEffect(() => scene.current?.setExaggeration(p.exaggeration), [p.exaggeration]);
  useEffect(() => scene.current?.setOverlay(p.overlay), [JSON.stringify(p.overlay)]);
  useEffect(() => scene.current?.setHover(p.hover), [p.hover?.x, p.hover?.y]);

  const onKeyDown = (e: KeyboardEvent) => {
    const s = scene.current;
    if (!s) return;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => s.rotate(0.15, 0), ArrowRight: () => s.rotate(-0.15, 0), ArrowUp: () => s.rotate(0, -0.1), ArrowDown: () => s.rotate(0, 0.1),
      "+": () => s.zoom(1 / 1.15), "=": () => s.zoom(1 / 1.15), "-": () => s.zoom(1.15), "0": () => s.reset(), Home: () => s.reset(),
    };
    if (keys[e.key]) {
      keys[e.key]();
      e.preventDefault();
    }
  };
  const control = (label: string, icon: string, action: (s: ReliefScene) => void, testid: string) => (
    <button type="button" className={iconButton} aria-label={label} title={label} data-testid={testid} disabled={failed}
      onClick={() => scene.current && action(scene.current)}>
      <span aria-hidden="true" className="text-base leading-none">{icon}</span>
    </button>
  );
  const e = p.exaggeration;

  return (
    <section aria-label={t.view3d} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-gradient-to-b from-sky-100 to-slate-50 outline-none focus-visible:ring-4 focus-visible:ring-sky-500/60"
        ref={host} tabIndex={failed ? -1 : 0} role="application" aria-roledescription={t.view3d} aria-label={t.view3d} aria-description={t.view3dHelp}
        onKeyDown={onKeyDown as any} data-testid="relief">
        {failed && <p className="absolute inset-0 m-0 grid place-items-center p-6 text-center text-sm text-slate-600" data-testid="no-webgl">{t.no3d}</p>}
        {p.hoverText && !failed && (
          <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-slate-900/85 px-2 py-0.5 text-xs font-semibold tabular-nums text-white" data-testid="relief-height">{p.hoverText}</div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1">
        {control(t.turnLeft, "↺", (s) => s.rotate(0.3, 0), "turn-left")}
        {control(t.turnRight, "↻", (s) => s.rotate(-0.3, 0), "turn-right")}
        {control(t.tiltUp, "▲", (s) => s.rotate(0, -0.15), "tilt-up")}
        {control(t.tiltDown, "▼", (s) => s.rotate(0, 0.15), "tilt-down")}
        {control(t.zoomIn, "+", (s) => s.zoom(1 / 1.2), "zoom-in")}
        {control(t.zoomOut, "−", (s) => s.zoom(1.2), "zoom-out")}
        {control(t.resetView, "⟲", (s) => s.reset(), "reset-view")}
        <label className="ml-auto flex min-w-[10rem] flex-1 items-center gap-2 text-xs text-slate-600">
          <span className="whitespace-nowrap">{t.exaggeration}</span>
          <input type="range" min="1" max="6" step="0.5" value={e} className="w-full accent-sky-700" data-testid="exaggeration"
            aria-valuetext={t.times(formatNumber(e, e % 1 ? 1 : 0, p.language))}
            onInput={(ev) => p.setExaggeration(Number((ev.currentTarget as HTMLInputElement).value))} />
          <span className="w-8 text-right font-semibold tabular-nums text-slate-800" aria-hidden="true">{t.times(formatNumber(e, e % 1 ? 1 : 0, p.language))}</span>
        </label>
      </div>
    </section>
  );
};

export default Interaction;
