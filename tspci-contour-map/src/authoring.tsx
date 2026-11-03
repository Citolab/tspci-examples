import { useMemo, useRef, useState } from "preact/hooks";
import {
  Hill, MAX_TASKS, POINT_TARGETS, Point, PointTarget, Ridge, TASK_TYPES, Task, TaskType, Terrain, allContours, bandsOf, correctAnswer,
  descentPath, formatNumber, lineOf, minLineLength, modelOf, parseNumber, pathLength, sampleGrid, targetOf,
} from "./terrain";
import { ContourMap, Legend, Marker, Projection, linePath } from "./map";
import { Texts, textsFor } from "./texts";

// The authoring mode (index.tsx getAuthoringInstance): the terrain (hills placed by clicking and sized by dragging,
// ridges and valleys, the base height, tilt and the seed's bumps), the map (contour interval, tints, labels) and the
// tasks with their points and margins. The map shows the correct answers as the PCI works them out.

export type Authored = {
  terrain: Terrain;
  tasks: Task[];
  interval: number;
  tints: boolean;
  labels: boolean;
  showHeight: boolean;
};

/** What keeps the item from working (getAuthoringInstance validate()), in the author's language. */
export const authoringProblems = (a: Authored, language: string): string[] => {
  const t = textsFor(language);
  const problems: string[] = [];
  const m = modelOf(a.terrain);
  const outside = (p?: Point) => !!p && (p.x < 0 || p.y < 0 || p.x > a.terrain.width || p.y > a.terrain.depth);
  if (!(a.interval > 0)) problems.push(t.problemInterval);
  if (!a.tasks.length) problems.push(t.problemNoTasks);
  a.tasks.forEach((task, i) => {
    const n = i + 1;
    const regionOnly = task.type === "point" && task.target === "region";
    if (!regionOnly && !(task.margin > 0)) problems.push(t.problemMargin(n));
    const points = [task.a, task.b, task.source, task.region, ...(task.marks ?? [])];
    if (points.some(outside)) problems.push(t.problemOutside(n));
    if (task.type === "profile" && task.a && task.b && Math.hypot(task.b.x - task.a.x, task.b.y - task.a.y) < minLineLength(a.terrain)) problems.push(t.problemLine(n));
    if (regionOnly && !task.region) problems.push(t.problemNoRegion(n));
    if (task.type === "height" && !task.marks?.length) problems.push(t.problemNoMarks(n));
    if ((task.type === "river" || (task.type === "point" && task.target === "flowEnd")) && task.source) {
      if (pathLength(descentPath(a.terrain, m.height, task.source)) < Math.min(a.terrain.width, a.terrain.depth) / 20) problems.push(t.problemShortRiver(n));
    }
  });
  if (a.showHeight && a.tasks.some((k) => k.type === "profile" || k.type === "height")) problems.push(t.problemShowHeight);
  return problems;
};

const button = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600";
const field = "h-8 rounded-md border border-slate-300 bg-white px-2 text-sm tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600";
type Tab = "terrain" | "map" | "tasks";
/** What a click on the map sets in the tasks tab. */
type Pick = "a" | "b" | "region" | "source" | "mark";

/** A number field that keeps what the author types until it is a number. */
const NumberField = ({ label, value, onChange, testid, width = "w-20", language, step }: {
  label: string; value: number | undefined; onChange: (v: number | undefined) => void; testid?: string; width?: string; language: string; step?: string;
}) => {
  const [text, setText] = useState<string | null>(null);
  const shown = value === undefined ? "" : formatNumber(value, Math.abs(value % 1) > 1e-9 ? 1 : 0, language);
  return (
    <label className="flex flex-col gap-0.5 text-xs text-slate-600">
      <span>{label}</span>
      <input type="text" inputMode="decimal" className={`${field} ${width}`} value={text ?? shown} data-testid={testid} step={step}
        onFocus={() => setText(shown)} onBlur={() => setText(null)}
        onInput={(e) => {
          const v = (e.currentTarget as HTMLInputElement).value;
          setText(v);
          if (v.trim() === "") onChange(undefined);
          else {
            const n = parseNumber(v);
            if (n !== null) onChange(n);
          }
        }} />
    </label>
  );
};

const newTask = (type: TaskType, t: Terrain): Task => {
  const mid = { x: Math.round(t.width / 2), y: Math.round(t.depth / 2) };
  switch (type) {
    case "profile": return { type, a: { x: Math.round(t.width * 0.15), y: mid.y }, b: { x: Math.round(t.width * 0.85), y: mid.y }, samples: 9, margin: 15, points: 1 };
    case "point": return { type, target: "highest", margin: Math.round(Math.min(t.width, t.depth) / 25), points: 1 };
    case "height": return { type, marks: [{ ...mid, label: "P1" }], margin: 5, points: 1 };
    case "river": return { type, source: mid, margin: Math.round(Math.min(t.width, t.depth) / 30), points: 1 };
  }
};

const Authoring = ({ initial, language, candidateLanguage, onChange }: { initial: Authored; language: string; candidateLanguage: string; onChange: (a: Authored) => void }) => {
  const t = textsFor(language);
  const [a, setA] = useState<Authored>(initial);
  const [tab, setTab] = useState<Tab>("terrain");
  const [selected, setSelected] = useState<{ kind: "hill" | "ridge"; index: number } | null>(null);
  const [taskIndex, setTaskIndex] = useState(0);
  const [pick, setPick] = useState<Pick>("a");
  const [hover, setHover] = useState<Point | null>(null);
  const [newType, setNewType] = useState<TaskType>("height");
  const dragging = useRef<{ handle: string } | null>(null);
  const update = (next: Authored) => {
    setA(next);
    onChange(next);
  };
  const setTerrain = (terrain: Terrain) => update({ ...a, terrain });
  const terrain = a.terrain;
  const lang = language;
  const n0 = (v: number) => formatNumber(v, 0, lang);

  const map = useMemo(() => {
    const model = modelOf(terrain);
    const grid = sampleGrid(terrain, model.height, 81);
    return { model, grid, contours: allContours(grid, a.interval > 0 ? a.interval : 10), bands: bandsOf(grid.min, grid.max, a.interval > 0 ? a.interval : 10) };
  }, [terrain, a.interval]);

  const task = a.tasks[taskIndex];
  const setTask = (next: Task) => update({ ...a, tasks: a.tasks.map((k, i) => (i === taskIndex ? next : k)) });
  const round = (p: Point) => ({ x: Math.round(p.x), y: Math.round(p.y) });

  // --- the terrain on the map: click to add a hill, drag the handles
  const onPickTerrain = (p: Point) => {
    const hill: Hill = { ...round(p), h: 60, r: Math.round(Math.min(terrain.width, terrain.depth) / 6) };
    setTerrain({ ...terrain, hills: [...terrain.hills, hill] });
    setSelected({ kind: "hill", index: terrain.hills.length });
  };
  const onHandle = (handle: string, p: Point, phase: "start" | "move" | "end") => {
    if (phase === "end") {
      dragging.current = null;
      return;
    }
    dragging.current = { handle };
    const [kind, i, what, j] = handle.split("-");
    const index = Number(i);
    if (kind === "hill") {
      setSelected({ kind: "hill", index });
      const hills = terrain.hills.map((h, k) => {
        if (k !== index) return h;
        if (what === "c") return { ...h, ...round(p) };
        return { ...h, r: Math.max(20, Math.round(Math.hypot(p.x - h.x, p.y - h.y))) };
      });
      setTerrain({ ...terrain, hills });
    } else if (kind === "ridge") {
      setSelected({ kind: "ridge", index });
      const ridges = terrain.ridges.map((r, k) => (k !== index ? r : { ...r, points: r.points.map((q, m) => (m === Number(j) ? [Math.round(p.x), Math.round(p.y)] : q)) as [number, number][] }));
      setTerrain({ ...terrain, ridges });
    }
  };

  const terrainOverlay = (pr: Projection) => (
    <g>
      {terrain.hills.map((h, i) => {
        const c = pr.px(h);
        const on = selected?.kind === "hill" && selected.index === i;
        return (
          <g key={`h${i}`} data-testid={`hill-${i + 1}`}>
            <circle cx={c.x} cy={c.y} r={h.r * pr.k} fill="none" stroke="transparent" stroke-width="12" data-handle={`hill-${i}-r`} style={{ cursor: "ew-resize" }} />
            <circle cx={c.x} cy={c.y} r={h.r * pr.k} fill="none" stroke={on ? "#1d4ed8" : "#334155"} stroke-width={on ? 2.5 : 1.5} stroke-dasharray="5 4" pointer-events="none" />
            <circle cx={c.x} cy={c.y} r="7" fill={h.h >= 0 ? "#ffffff" : "#0f172a"} stroke={on ? "#1d4ed8" : "#0f172a"} stroke-width="2.5" data-handle={`hill-${i}-c`} style={{ cursor: "move" }} />
            <text x={c.x + 10} y={c.y - 8} font-size="11" font-weight="700" fill="#0f172a" pointer-events="none" style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 3 }}>
              {`${h.h >= 0 ? "+" : ""}${n0(h.h)} m`}
            </text>
          </g>
        );
      })}
      {terrain.ridges.map((r, i) => {
        const on = selected?.kind === "ridge" && selected.index === i;
        const pts = r.points.map(([x, y]) => ({ x, y }));
        return (
          <g key={`r${i}`} data-testid={`ridge-${i + 1}`}>
            <path d={linePath(pts, pr)} fill="none" stroke={r.h >= 0 ? "#92400e" : "#1e40af"} stroke-opacity="0.5" stroke-width={Math.max(3, r.w * pr.k * 0.5)} stroke-linecap="round" stroke-linejoin="round" pointer-events="none" />
            <path d={linePath(pts, pr)} fill="none" stroke={on ? "#1d4ed8" : "#0f172a"} stroke-width="1.5" stroke-dasharray="4 3" pointer-events="none" />
            {pts.map((q, j) => {
              const c = pr.px(q);
              return <rect key={j} x={c.x - 6} y={c.y - 6} width="12" height="12" fill="#ffffff" stroke={on ? "#1d4ed8" : "#0f172a"} stroke-width="2.5" data-handle={`ridge-${i}-p-${j}`} style={{ cursor: "move" }} />;
            })}
          </g>
        );
      })}
    </g>
  );

  // --- the tasks on the map: the author's points, and the correct answers
  const onPickTask = (raw: Point) => {
    if (!task) return;
    const p = round(raw);
    if (activePick === "a" && task.type === "profile") return setTask({ ...task, a: p, b: task.b ?? { x: Math.min(terrain.width, p.x + terrain.width / 2), y: p.y } }), setPick("b");
    if (activePick === "b" && task.type === "profile") return setTask({ ...task, b: p, a: task.a ?? { x: Math.max(0, p.x - terrain.width / 2), y: p.y } }), setPick("a");
    if (activePick === "region" && task.type === "point") return setTask({ ...task, region: { ...p, r: task.region?.r ?? Math.round(Math.min(terrain.width, terrain.depth) / 6) } });
    if (activePick === "source") return setTask({ ...task, source: p });
    if (activePick === "mark" && task.type === "height") {
      const marks = task.marks ?? [];
      return setTask({ ...task, marks: [...marks, { ...p, label: `P${marks.length + 1}` }].slice(0, 8) });
    }
  };
  const truth = useMemo(() => (task ? correctAnswer(map.model, task) : null), [task, map]);
  const taskOverlay = (pr: Projection) => {
    if (!task) return null;
    const line = lineOf(task, truth ?? undefined);
    return (
      <g data-testid="task-overlay">
        {task.type === "profile" && line && (
          <>
            <path d={linePath([line.a, line.b], pr)} stroke="#0f172a" stroke-width="2.5" stroke-dasharray={task.a ? "8 5" : "2 4"} fill="none" pointer-events="none" />
            <Marker at={pr.px(line.a)} label="A" />
            <Marker at={pr.px(line.b)} label="B" />
          </>
        )}
        {task.type === "point" && task.region && (
          <circle cx={pr.px(task.region).x} cy={pr.px(task.region).y} r={task.region.r * pr.k} fill="#7c3aed" fill-opacity="0.07" stroke="#7c3aed" stroke-width="2" stroke-dasharray="6 4" pointer-events="none" />
        )}
        {task.type === "point" && <Marker at={pr.px(targetOf(map.model, task))} label="✓" shape="diamond" tone="#0f766e" testid="author-target" />}
        {task.source && <Marker at={pr.px(task.source)} label="S" shape="triangle" />}
        {task.type === "river" && truth?.path && <path d={linePath(truth.path, pr)} stroke="#0f766e" stroke-width="3" stroke-dasharray="7 5" fill="none" pointer-events="none" data-testid="author-river" />}
        {task.type === "point" && task.target === "flowEnd" && task.source && (
          <path d={linePath(descentPath(terrain, map.model.height, task.source), pr)} stroke="#0f766e" stroke-width="2" stroke-dasharray="4 4" fill="none" pointer-events="none" />
        )}
        {task.type === "height" && (task.marks ?? []).map((m, i) => <Marker key={i} at={pr.px(m)} label={m.label} />)}
      </g>
    );
  };

  const truthText = () => {
    if (!task || !truth) return "";
    const fmt = (v: number) => formatNumber(v, 1, lang);
    if (task.type === "profile") return truth.heights!.map(fmt).join(" · ") + " m";
    if (task.type === "point") return `${t.at(n0(truth.p!.x), n0(truth.p!.y))} (${n0(map.model.height(truth.p!.x, truth.p!.y))} m)`;
    if (task.type === "height") return (task.marks ?? []).map((m, i) => `${m.label}: ${fmt(truth.values![i])} m`).join(" · ");
    return `${n0(pathLength(truth.path!))} m → ${t.at(n0(truth.path![truth.path!.length - 1].x), n0(truth.path![truth.path!.length - 1].y))}`;
  };

  const picks: Pick[] = !task ? [] : task.type === "profile" ? (task.a && task.b ? ["a", "b"] : []) : task.type === "point" ? (task.target === "flowEnd" ? ["source", "region"] : ["region"]) : task.type === "height" ? ["mark"] : ["source"];
  const activePick = picks.includes(pick) ? pick : picks[0];
  const pickName: Record<Pick, string> = { a: t.setA, b: t.setB, region: t.setRegion, source: t.setSource, mark: t.addMark };
  const sel = selected?.kind === "hill" ? terrain.hills[selected.index] : null;
  const selRidge = selected?.kind === "ridge" ? terrain.ridges[selected.index] : null;
  const setHill = (h: Hill) => setTerrain({ ...terrain, hills: terrain.hills.map((x, i) => (i === selected!.index ? h : x)) });
  const setRidge = (r: Ridge) => setTerrain({ ...terrain, ridges: terrain.ridges.map((x, i) => (i === selected!.index ? r : x)) });
  const num = (v: number | undefined, fallback: number) => (v === undefined || !Number.isFinite(v) ? fallback : v);

  const mapView = (overlay: (pr: Projection) => any, onPickMap: (p: Point) => void) => (
    <div className="flex flex-col gap-2">
      <div className="rounded-xl border border-slate-200 bg-white p-1.5">
        <ContourMap grid={map.grid} contours={map.contours} bands={map.bands} interval={a.interval > 0 ? a.interval : 10} tints={a.tints} labels={a.labels}
          language={candidateLanguage} texts={t} label={t.map} hover={hover} hoverText={hover ? t.metres(n0(map.model.height(hover.x, hover.y))) : null}
          onHover={setHover} onPick={onPickMap} onHandle={tab === "terrain" ? onHandle : undefined} testid="author-map">
          {overlay}
        </ContourMap>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {a.tints && <Legend bands={map.bands} texts={t} language={candidateLanguage} />}
        <span className="text-xs text-slate-500" data-testid="summary">{t.mapSummary(n0(map.grid.min), n0(map.grid.max))}</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-slate-800" data-testid="authoring">
      <div role="tablist" className="inline-flex self-start rounded-lg bg-slate-100 p-1">
        {([["terrain", t.tabTerrain], ["map", t.tabMap], ["tasks", t.tabTasks]] as [Tab, string][]).map(([id, name]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`tab-${id}`} onClick={() => setTab(id)}
            className="rounded-md px-3 py-1 text-sm text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 aria-selected:bg-white aria-selected:text-slate-900 aria-selected:shadow-sm">{name}</button>
        ))}
      </div>

      {tab === "terrain" && (
        <div role="tabpanel" aria-label={t.tabTerrain} className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-2">
            <p className="m-0 text-xs text-slate-500">{t.terrainHint}</p>
            {mapView(terrainOverlay, onPickTerrain)}
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <NumberField label={t.width} value={terrain.width} language={lang} testid="terrain-width" onChange={(v) => v && v >= 100 && setTerrain({ ...terrain, width: v })} />
              <NumberField label={t.depth} value={terrain.depth} language={lang} testid="terrain-depth" onChange={(v) => v && v >= 100 && setTerrain({ ...terrain, depth: v })} />
              <NumberField label={t.base} value={terrain.base} language={lang} testid="terrain-base" onChange={(v) => setTerrain({ ...terrain, base: num(v, 0) })} />
              <NumberField label={t.tiltX} value={terrain.tiltX} language={lang} testid="terrain-tiltx" onChange={(v) => setTerrain({ ...terrain, tiltX: num(v, 0) })} />
              <NumberField label={t.tiltY} value={terrain.tiltY} language={lang} testid="terrain-tilty" onChange={(v) => setTerrain({ ...terrain, tiltY: num(v, 0) })} />
              <NumberField label={t.bumps} value={terrain.bumps} language={lang} testid="terrain-bumps" onChange={(v) => setTerrain({ ...terrain, bumps: Math.round(Math.min(40, Math.max(0, num(v, 0)))) })} />
              <NumberField label={t.seed} value={terrain.seed} language={lang} testid="terrain-seed" onChange={(v) => setTerrain({ ...terrain, seed: Math.round(Math.max(0, num(v, 1))) })} />
              <button type="button" className={`${button} self-end`} onClick={() => setTerrain({ ...terrain, seed: (terrain.seed * 48271 + 11) % 99991 })}>{t.newSeed}</button>
            </div>
            <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={t.tabTerrain}>
              {terrain.hills.map((h, i) => (
                <li key={`h${i}`}>
                  <button type="button" aria-pressed={selected?.kind === "hill" && selected.index === i} onClick={() => setSelected({ kind: "hill", index: i })}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-left text-xs hover:bg-slate-50 aria-pressed:border-sky-600 aria-pressed:bg-sky-50">
                    {t.hill(i + 1)}: {h.h >= 0 ? "+" : ""}{n0(h.h)} m, r {n0(h.r)} m
                  </button>
                </li>
              ))}
              {terrain.ridges.map((r, i) => (
                <li key={`r${i}`}>
                  <button type="button" aria-pressed={selected?.kind === "ridge" && selected.index === i} onClick={() => setSelected({ kind: "ridge", index: i })}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-left text-xs hover:bg-slate-50 aria-pressed:border-sky-600 aria-pressed:bg-sky-50">
                    {t.ridge(i + 1)}: {r.h >= 0 ? "+" : ""}{n0(r.h)} m, {n0(r.w)} m
                  </button>
                </li>
              ))}
            </ul>
            <div>
              <button type="button" className={button} onClick={() => {
                const y = Math.round(terrain.depth / 2);
                setTerrain({ ...terrain, ridges: [...terrain.ridges, { points: [[Math.round(terrain.width * 0.2), y], [Math.round(terrain.width * 0.8), y]], h: -20, w: Math.round(Math.min(terrain.width, terrain.depth) / 6) }] });
                setSelected({ kind: "ridge", index: terrain.ridges.length });
              }}>+ {t.addRidge}</button>
            </div>
            {sel && (
              <fieldset className="m-0 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-2" data-testid="hill-form">
                <legend className="px-1 text-xs font-semibold">{t.hill(selected!.index + 1)}</legend>
                <NumberField label="x (m)" value={sel.x} language={lang} testid="hill-x" onChange={(v) => setHill({ ...sel, x: num(v, sel.x) })} />
                <NumberField label="y (m)" value={sel.y} language={lang} testid="hill-y" onChange={(v) => setHill({ ...sel, y: num(v, sel.y) })} />
                <NumberField label={t.heightField} value={sel.h} language={lang} testid="hill-h" onChange={(v) => setHill({ ...sel, h: num(v, sel.h) })} />
                <NumberField label={t.radius} value={sel.r} language={lang} testid="hill-r" onChange={(v) => v && v > 0 && setHill({ ...sel, r: v })} />
                <button type="button" className={button} onClick={() => { setTerrain({ ...terrain, hills: terrain.hills.filter((_, i) => i !== selected!.index) }); setSelected(null); }}>{t.removeFeature}</button>
              </fieldset>
            )}
            {selRidge && (
              <fieldset className="m-0 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-2" data-testid="ridge-form">
                <legend className="px-1 text-xs font-semibold">{t.ridge(selected!.index + 1)}</legend>
                <NumberField label={t.heightField} value={selRidge.h} language={lang} testid="ridge-h" onChange={(v) => setRidge({ ...selRidge, h: num(v, selRidge.h) })} />
                <NumberField label={t.ridgeWidth} value={selRidge.w} language={lang} testid="ridge-w" onChange={(v) => v && v > 0 && setRidge({ ...selRidge, w: v })} />
                {selRidge.points.map(([x, y], j) => (
                  <span key={j} className="flex gap-1">
                    <NumberField label={`x${j + 1}`} value={x} language={lang} width="w-16" onChange={(v) => setRidge({ ...selRidge, points: selRidge.points.map((q, k) => (k === j ? [num(v, x), q[1]] : q)) as [number, number][] })} />
                    <NumberField label={`y${j + 1}`} value={y} language={lang} width="w-16" onChange={(v) => setRidge({ ...selRidge, points: selRidge.points.map((q, k) => (k === j ? [q[0], num(v, y)] : q)) as [number, number][] })} />
                  </span>
                ))}
                <button type="button" className={button} onClick={() => {
                  const last = selRidge.points[selRidge.points.length - 1], before = selRidge.points[selRidge.points.length - 2];
                  const next: [number, number] = [Math.max(0, Math.min(terrain.width, Math.round(2 * last[0] - before[0]))), Math.max(0, Math.min(terrain.depth, Math.round(2 * last[1] - before[1])))];
                  setRidge({ ...selRidge, points: [...selRidge.points, next] });
                }}>{t.addBend}</button>
                <button type="button" className={button} onClick={() => { setTerrain({ ...terrain, ridges: terrain.ridges.filter((_, i) => i !== selected!.index) }); setSelected(null); }}>{t.removeFeature}</button>
              </fieldset>
            )}
          </div>
        </div>
      )}

      {tab === "map" && (
        <div role="tabpanel" aria-label={t.tabMap} className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {mapView(() => null, () => {})}
          <div className="flex flex-col gap-3">
            <NumberField label={t.interval} value={a.interval} language={lang} testid="interval" onChange={(v) => v !== undefined && update({ ...a, interval: v })} />
            {([["tints", t.tints], ["labels", t.contourLabels], ["showHeight", t.showHeight]] as ["tints" | "labels" | "showHeight", string][]).map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-2">
                <input type="checkbox" checked={a[key]} onChange={(e) => update({ ...a, [key]: (e.currentTarget as HTMLInputElement).checked })} />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      {tab === "tasks" && (
        <div role="tabpanel" aria-label={t.tabTasks} className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-2">
            <p className="m-0 text-xs text-slate-500">{t.tasksHint}</p>
            {mapView(taskOverlay, onPickTask)}
          </div>
          <div className="flex flex-col gap-3">
            <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={t.tabTasks}>
              {a.tasks.map((k, i) => (
                <li key={i}>
                  <button type="button" aria-pressed={i === taskIndex} data-testid={`author-task-${i + 1}`} onClick={() => setTaskIndex(i)}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1 text-left text-xs hover:bg-slate-50 aria-pressed:border-sky-600 aria-pressed:bg-sky-50">
                    {t.task(i + 1)}: {k.type === "point" ? t.target[k.target ?? "highest"] : t.taskType[k.type]} · {t.points}: {k.points}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <select className={field} value={newType} aria-label={t.type} data-testid="new-task-type" onChange={(e) => setNewType((e.currentTarget as HTMLSelectElement).value as TaskType)}>
                {TASK_TYPES.map((k) => <option key={k} value={k}>{t.taskType[k]}</option>)}
              </select>
              <button type="button" className={button} disabled={a.tasks.length >= MAX_TASKS}
                onClick={() => { update({ ...a, tasks: [...a.tasks, newTask(newType, terrain)] }); setTaskIndex(a.tasks.length); }}>+ {t.addTask}</button>
            </div>
            {task && (
              <fieldset className="m-0 flex flex-col gap-2 rounded-lg border border-slate-200 p-2" data-testid="task-form">
                <legend className="px-1 text-xs font-semibold">{t.task(taskIndex + 1)}: {t.taskType[task.type]}</legend>
                <label className="flex flex-col gap-0.5 text-xs text-slate-600">
                  <span>{t.textField}</span>
                  <textarea rows={2} className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={task.text ?? ""}
                    onInput={(e) => setTask({ ...task, text: (e.currentTarget as HTMLTextAreaElement).value || undefined })} />
                </label>
                <div className="flex flex-wrap items-end gap-2">
                  <NumberField label={t.points} value={task.points} language={lang} width="w-14" testid="task-points" onChange={(v) => v !== undefined && v >= 0 && setTask({ ...task, points: v })} />
                  {!(task.type === "point" && task.target === "region") && (
                    <NumberField label={task.type === "profile" || task.type === "height" ? t.marginHeight : t.marginDistance} value={task.margin} language={lang} testid="task-margin"
                      onChange={(v) => v !== undefined && setTask({ ...task, margin: v })} />
                  )}
                  {task.type === "profile" && (
                    <NumberField label={t.samples} value={task.samples} language={lang} width="w-14" testid="task-samples"
                      onChange={(v) => v !== undefined && setTask({ ...task, samples: Math.round(Math.min(21, Math.max(3, v))) })} />
                  )}
                  {(task.type === "profile" || task.type === "height") && (
                    <NumberField label={t.minCorrect} value={task.minCorrect} language={lang} width="w-14" testid="task-min"
                      onChange={(v) => setTask({ ...task, minCorrect: v === undefined ? undefined : Math.max(0, Math.round(v)) })} />
                  )}
                </div>
                {task.type === "profile" && (
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={!(task.a && task.b)} data-testid="free-line"
                      onChange={(e) => (e.currentTarget as HTMLInputElement).checked ? setTask({ ...task, a: undefined, b: undefined }) : setTask({ ...task, a: newTask("profile", terrain).a, b: newTask("profile", terrain).b })} />
                    {t.freeLine}
                  </label>
                )}
                {task.type === "point" && (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-0.5 text-xs text-slate-600">
                      <span>{t.type}</span>
                      <select className={field} value={task.target} data-testid="task-target" onChange={(e) => {
                        const target = (e.currentTarget as HTMLSelectElement).value as PointTarget;
                        setTask({ ...task, target, source: target === "flowEnd" ? task.source ?? { x: Math.round(terrain.width / 2), y: Math.round(terrain.depth / 2) } : undefined });
                      }}>
                        {POINT_TARGETS.map((k) => <option key={k} value={k}>{t.target[k]}</option>)}
                      </select>
                    </label>
                    {task.region && (
                      <NumberField label={t.regionRadius} value={task.region.r} language={lang} testid="region-r"
                        onChange={(v) => v && v > 0 && setTask({ ...task, region: { ...task.region!, r: v } })} />
                    )}
                    {task.target === "region" && (
                      <label className="flex flex-col gap-0.5 text-xs text-slate-600">
                        <span>{t.regionLabel}</span>
                        <input type="text" className={`${field} w-32`} value={task.regionLabel ?? ""} onInput={(e) => setTask({ ...task, regionLabel: (e.currentTarget as HTMLInputElement).value || undefined })} />
                      </label>
                    )}
                    {task.region && task.target !== "region" && <button type="button" className={button} onClick={() => setTask({ ...task, region: undefined })}>{t.removeFeature}</button>}
                  </div>
                )}
                {task.type === "height" && (
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {(task.marks ?? []).map((m, i) => (
                      <li key={i} className="flex flex-wrap items-end gap-1.5">
                        <label className="flex flex-col gap-0.5 text-xs text-slate-600">
                          <span>{t.markLabel}</span>
                          <input type="text" className={`${field} w-14`} value={m.label} onInput={(e) => setTask({ ...task, marks: task.marks!.map((x, j) => (j === i ? { ...x, label: (e.currentTarget as HTMLInputElement).value } : x)) })} />
                        </label>
                        <NumberField label="x (m)" value={m.x} language={lang} width="w-16" onChange={(v) => v !== undefined && setTask({ ...task, marks: task.marks!.map((x, j) => (j === i ? { ...x, x: v } : x)) })} />
                        <NumberField label="y (m)" value={m.y} language={lang} width="w-16" onChange={(v) => v !== undefined && setTask({ ...task, marks: task.marks!.map((x, j) => (j === i ? { ...x, y: v } : x)) })} />
                        <button type="button" className={button} aria-label={t.removeMark(m.label)} onClick={() => setTask({ ...task, marks: task.marks!.filter((_, j) => j !== i) })}>×</button>
                      </li>
                    ))}
                  </ul>
                )}
                {picks.length > 0 && (
                  <div role="radiogroup" aria-label={t.clickSets} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-600">{t.clickSets}:</span>
                    {picks.map((k) => (
                      <label key={k} className="inline-flex items-center gap-1">
                        <input type="radio" name="pick" checked={activePick === k} onChange={() => setPick(k)} data-testid={`pick-${k}`} />
                        {pickName[k]}
                      </label>
                    ))}
                  </div>
                )}
                <p className="m-0 rounded-md bg-teal-50 px-2 py-1 text-xs text-teal-900" data-testid="truth">
                  <span className="font-semibold">{t.correctIs}:</span> {truthText()}
                </p>
                <div>
                  <button type="button" className={button} onClick={() => { update({ ...a, tasks: a.tasks.filter((_, i) => i !== taskIndex) }); setTaskIndex(Math.max(0, taskIndex - 1)); }}>{t.removeTask}</button>
                </div>
              </fieldset>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Authoring;
