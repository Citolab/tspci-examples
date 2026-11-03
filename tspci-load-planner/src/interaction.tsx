import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { IStore, useStore } from "@citolab/preact-store";
import {
  Box, Plan, Placed, Solid, dims, evaluate, freeSpot, layer, put, reorient, samePlacement, shift, slide, solidsOf, unload, allowed, tipped, turned,
} from "./plan";
import { Actions, StateModel } from "./store";
import { Texts, formatNumber } from "./texts";
import { stopColor, stopInk } from "./colors";
import { SideView, TopView } from "./views";
import { LoadScene, Pick } from "./scene3d";

// The candidate's view: the boxes to load, the 3D view, the top and side view, the buttons for the chosen box, the
// live metrics (volume, weight, centre of gravity, axle loads) and, when the item wants it, the checks.

export type InteractionProps = {
  prompt: string;
  plan: Plan;
  store: IStore<StateModel, Actions>;
  t: Texts;
  view: "3d" | "2d";
  showMetrics: boolean;
  showChecks: boolean;
  readOnly: boolean;
};

const usePrefersReducedMotion = () => {
  const query = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const [reduced, setReduced] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const on = () => setReduced(query.matches);
    query.addEventListener?.("change", on);
    return () => query.removeEventListener?.("change", on);
  }, []);
  return reduced;
};

const button =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600";

const primary =
  "inline-flex items-center gap-1.5 rounded-lg border border-sky-800 bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white shadow-xs hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-600";

/** A bar with a value and a limit; over the limit it turns striped and says so in its text. */
const Meter = ({ label, value, max, text, testid }: { label: string; value: number; max: number; text: string; testid: string }) => {
  const over = max > 0 && value > max + 1e-6;
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div class="flex flex-col gap-1" data-testid={testid}>
      <div class="flex justify-between gap-2 text-xs"><span class="font-medium text-slate-600">{label}</span><span class={`tabular-nums ${over ? "font-bold text-rose-700" : "text-slate-800"}`}>{over ? `⚠ ${text}` : text}</span></div>
      <div class="h-2.5 overflow-hidden rounded-full bg-slate-200" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value * 10) / 10} aria-valuetext={text}>
        <div class={`h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none ${over ? "lp-over bg-rose-600" : "bg-sky-700"}`} style={{ width: `${over ? 100 : pct}%` }} />
      </div>
    </div>
  );
};

const Interaction = ({ prompt, plan, store, t, view, showMetrics, showChecks, readOnly }: InteractionProps) => {
  const { placed } = useStore(store);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const history = useRef<Placed[][]>([]);
  const lang = t.lang;
  const fmt = (n: number, d = 0) => formatNumber(n, lang, d);
  const solids = useMemo(() => solidsOf(plan, placed), [plan, placed]);
  const evaluation = useMemo(() => evaluate(plan, placed), [plan, placed]);
  const m = evaluation.metrics;
  const reduced = usePrefersReducedMotion();

  const boxById = (id: string) => plan.boxes.find((b) => b.id === id)!;
  const nameOf = (id: string) => t.boxName(boxById(id));
  const solidOfId = (id: string | null) => (id ? solids.find((s) => s.id === id) ?? null : null);
  const where = (p: { x: number; y: number; z: number }) => t.at(fmt(p.x), fmt(p.y), fmt(p.z));
  const sizeOf = (s: { dx: number; dy: number; dz: number }) => t.size(fmt(s.dx), fmt(s.dy), fmt(s.dz));

  const commit = (next: Placed[], message: (after: Placed[]) => string, fallback?: string) => {
    if (readOnly) return;
    if (samePlacement(next, placed)) {
      if (fallback) setStatus(fallback);
      return;
    }
    history.current.push(placed);
    if (history.current.length > 100) history.current.shift();
    store.dispatch({ type: "SET_PLACED", payload: { placed: next } });
    setStatus(message(next));
  };
  const posOf = (list: Placed[], id: string) => list.find((p) => p.id === id)!;

  const select = (id: string) => {
    setSelected(id);
    setStatus(t.chosen(nameOf(id), placed.some((p) => p.id === id)));
  };
  const loadBox = (id: string) => {
    const spot = freeSpot(plan, placed, id);
    if (spot) commit(put(plan, placed, id, spot.x, spot.y, spot.o), (n) => t.placed(nameOf(id), where(posOf(n, id))));
    else commit(put(plan, placed, id, 0, 0), () => t.noSpot(nameOf(id)));
    setSelected(id);
  };
  const putAt = (id: string, x: number, y: number) => {
    const was = placed.some((p) => p.id === id);
    commit(put(plan, placed, id, x, y), (n) => (was ? t.moved : t.placed)(nameOf(id), where(posOf(n, id))));
  };
  const onFloor = (x: number, y: number) => {
    if (!selected) return setStatus(t.chooseFirst);
    const s = solidOfId(selected);
    const box = boxById(selected);
    const [dx, dy] = s ? [s.dx, s.dy] : dims(box, "lwh");
    putAt(selected, x - dx / 2, y - dy / 2);
  };
  const act = (what: "turn" | "tip" | "up" | "down" | "unload" | { dx: number; dy: number }) => {
    if (!selected) return setStatus(t.chooseFirst);
    const id = selected;
    const name = nameOf(id);
    if (!placed.some((p) => p.id === id)) {
      if (what === "unload") return;
      return setStatus(t.chosen(name, false));
    }
    if (what === "turn" || what === "tip") {
      const p = posOf(placed, id);
      if (what === "tip" && !allowed(boxById(id), tipped(p.o))) return setStatus(t.cantTip(name));
      const next = reorient(plan, placed, id, what);
      const s = solidsOf(plan, next).find((q) => q.id === id)!;
      return commit(next, () => t.turned(name, sizeOf(s)), t.cantMove(name));
    }
    if (what === "up" || what === "down") return commit(layer(plan, placed, id, what === "up" ? 1 : -1), (n) => t.moved(name, where(posOf(n, id))), t.noLayer(name, what === "up"));
    if (what === "unload") return commit(unload(plan, placed, id), () => t.unloaded(name));
    commit(shift(plan, placed, id, what.dx, what.dy), (n) => t.moved(name, where(posOf(n, id))), t.cantMove(name));
  };
  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    store.dispatch({ type: "SET_PLACED", payload: { placed: previous } });
    setStatus(t.undone);
  };
  const clear = () => {
    if (!placed.length) return;
    history.current.push(placed);
    store.dispatch({ type: "SET_PLACED", payload: { placed: [] } });
    setStatus(t.cleared);
  };

  /** The keys of the top view and the side view. */
  const onKey = (side: boolean) => (e: KeyboardEvent) => {
    if (readOnly) return;
    const key = e.key;
    const steps: Record<string, { dx: number; dy: number } | "up" | "down"> = side
      ? { ArrowLeft: { dx: -1, dy: 0 }, ArrowRight: { dx: 1, dy: 0 }, ArrowUp: "up", ArrowDown: "down" }
      : { ArrowLeft: { dx: -1, dy: 0 }, ArrowRight: { dx: 1, dy: 0 }, ArrowUp: { dx: 0, dy: 1 }, ArrowDown: { dx: 0, dy: -1 } };
    let handled = true;
    if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === "z") undo();
    else if (steps[key]) act(steps[key]);
    else if (key === "PageUp") act("up");
    else if (key === "PageDown") act("down");
    else if (key === "r" || key === "R") act("turn");
    else if (key === "t" || key === "T") act("tip");
    else if (key === "Delete" || key === "Backspace") act("unload");
    else if (key === "Enter" && selected && !placed.some((p) => p.id === selected)) loadBox(selected);
    else handled = false;
    if (handled) e.preventDefault();
  };

  const chosen = solidOfId(selected);
  const chosenText = chosen ? `${nameOf(chosen.id)}, ${sizeOf(chosen)}, ${where(chosen)}` : selected ? `${nameOf(selected)}, ${t.notLoaded}` : "";
  const viewLabel = (name: string) => [name, prompt ? "" : "", chosenText].filter(Boolean).join(". ");
  const toLoad = plan.boxes.filter((b) => !placed.some((p) => p.id === b.id)).length;
  const cog = showMetrics ? m.cog : null;
  const offsetText = (v: number, minus: string, plus: string) => (Math.abs(v) < 0.5 ? t.centred : t.offsetX(fmt(Math.abs(v)), v < 0 ? minus : plus));
  const a = plan.space.axles;

  const boxInfo = (b: Box) => {
    const parts = [t.size(fmt(b.length), fmt(b.width), fmt(b.height)), t.kg(fmt(b.weight, 1))];
    if (b.upright) parts.push(t.upright);
    if (b.fragile) parts.push(t.fragile);
    if (b.stop !== null) parts.push(t.stop(b.stop));
    return parts;
  };

  return (
    <div class="@container flex max-w-full flex-col gap-3 font-sans text-slate-800" data-reduced-motion={reduced ? "true" : undefined}>
      {prompt && <p class="m-0 max-w-[75ch] text-[15px] text-slate-700" data-testid="prompt">{prompt}</p>}
      <div class="grid gap-3 @3xl:grid-cols-[270px_minmax(0,1fr)]">
        {/* the boxes */}
        <section class="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-labelledby="lp-boxes">
          <div class="flex items-baseline justify-between gap-2">
            <h3 id="lp-boxes" class="m-0 text-sm font-semibold">{t.boxes}</h3>
            <span class="text-xs text-slate-500" data-testid="to-load">{toLoad ? t.toLoad(toLoad) : t.allIn}</span>
          </div>
          {!readOnly && <p class="m-0 text-xs text-slate-500">{t.boxesHint}</p>}
          <ul class="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="box-list">
            {plan.boxes.map((b) => {
              const isLoaded = placed.some((p) => p.id === b.id);
              const info = boxInfo(b);
              return (
                <li key={b.id}>
                  <button type="button" aria-pressed={selected === b.id} data-testid={`box-${b.id}`} disabled={readOnly}
                    aria-label={`${t.boxName(b)}, ${info.join(", ")}, ${isLoaded ? t.loaded : t.notLoaded}`}
                    class={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-sky-600 disabled:cursor-default ${selected === b.id ? "border-slate-900 bg-white ring-2 ring-slate-900" : "border-slate-200 bg-white hover:border-slate-400"}`}
                    onClick={() => select(b.id)}
                    onDblClick={() => !isLoaded && loadBox(b.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && selected === b.id && !isLoaded) { e.preventDefault(); loadBox(b.id); }
                    }}>
                    <span class="grid size-8 shrink-0 place-items-center rounded-md border border-slate-500/40 text-xs font-bold" style={{ background: stopColor(b.stop), color: stopInk(b.stop) }} aria-hidden="true">
                      {b.id}
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-medium">{b.label}</span>
                      <span class="block truncate text-xs text-slate-500">{info.slice(0, 2).join(" · ")}{b.stop !== null ? ` · ${t.stop(b.stop)}` : ""}{b.upright ? " · ↑↑" : ""}{b.fragile ? " · ⚠" : ""}</span>
                    </span>
                    <span class={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${isLoaded ? "bg-emerald-100 text-emerald-800" : "border border-dashed border-slate-400 text-slate-400"}`}
                      aria-hidden="true" title={isLoaded ? t.loaded : t.notLoaded} data-loaded={isLoaded ? "true" : "false"}>
                      {isLoaded ? "✓" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <div class="flex min-w-0 flex-col gap-3">
          {view === "3d" && <View3D plan={plan} solids={solids} selected={selected} cog={cog} t={t} readOnly={readOnly}
            onPick={(pick) => ("id" in pick ? select(pick.id) : onFloor(pick.floor.x, pick.floor.y))} />}
          <div class="grid gap-3 @2xl:grid-cols-2">
            <figure class="m-0 flex flex-col gap-1">
              <figcaption class="text-xs font-semibold text-slate-600">{t.topView}</figcaption>
              <TopView plan={plan} solids={solids} selected={selected} cog={cog} t={t} readOnly={readOnly} testid="top-view"
                label={viewLabel(t.topView)} describedBy="lp-help-top" onKeyDown={onKey(false)} onSelect={select} onDrop={putAt} onFloor={onFloor} />
            </figure>
            <figure class="m-0 flex flex-col gap-1">
              <figcaption class="text-xs font-semibold text-slate-600">{t.sideView}</figcaption>
              <SideView plan={plan} solids={solids} selected={selected} cog={cog} t={t} readOnly={readOnly} testid="side-view"
                label={viewLabel(t.sideView)} describedBy="lp-help-side" onKeyDown={onKey(true)} onSelect={select}
                onDrop={(id, x) => { const p = posOf(placed, id); commit(slide(plan, placed, id, x, p.y), (n) => t.moved(nameOf(id), where(posOf(n, id)))); }} />
            </figure>
          </div>
          <p id="lp-help-top" class="sr-only">{t.viewHelp}</p>
          <p id="lp-help-side" class="sr-only">{t.sideViewHelp}</p>

          {!readOnly && (
            <div class="flex flex-wrap items-center gap-2" role="toolbar" aria-label={chosenText || t.chooseFirst}>
              {selected && !placed.some((p) => p.id === selected)
                ? <button type="button" class={primary} onClick={() => loadBox(selected)}>{t.load}</button>
                : <button type="button" class={button} disabled={!chosen} onClick={() => act("unload")}>{t.unload}</button>}
              <button type="button" class={button} disabled={!chosen} onClick={() => act("turn")}>⟳ {t.turn}</button>
              <button type="button" class={button} disabled={!chosen || chosen.box.upright} onClick={() => act("tip")}>⤵ {t.tip}</button>
              <button type="button" class={button} disabled={!chosen} onClick={() => act("up")}>▲ {t.layerUp}</button>
              <button type="button" class={button} disabled={!chosen} onClick={() => act("down")}>▼ {t.layerDown}</button>
              <span class="mx-1 h-6 w-px bg-slate-200" aria-hidden="true" />
              <button type="button" class={button} disabled={!history.current.length} onClick={undo}>↶ {t.undo}</button>
              <button type="button" class={button} disabled={!placed.length} onClick={clear}>{t.clear}</button>
              <details class="text-sm">
                <summary class="cursor-pointer rounded-md px-2 py-1 text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-600">{t.help}</summary>
                <p class="m-0 mt-1 max-w-[70ch] text-xs text-slate-600">{t.boxesHint} {t.viewHelp} {view === "3d" ? t.view3dHelp : ""}</p>
              </details>
            </div>
          )}
          <p role="status" aria-live="polite" class="m-0 min-h-5 text-sm text-slate-700" data-testid="status">{status}</p>
        </div>
      </div>

      {showMetrics && (
        <section class="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 @2xl:grid-cols-3" aria-label={t.metrics} data-testid="metrics">
          <Meter label={t.volume} value={m.volume} max={100} text={`${fmt(m.volume, 1)} %`} testid="metric-volume" />
          <Meter label={t.weight} value={m.weight} max={plan.space.maxPayload} text={t.ofMax(fmt(m.weight, 1), fmt(plan.space.maxPayload))} testid="metric-weight" />
          <div class="flex flex-col gap-0.5 text-xs" data-testid="metric-cog">
            <span class="font-medium text-slate-600"><span aria-hidden="true" style={{ color: "#be185d" }}>⊕ </span>{t.cogOffset}</span>
            {m.offset ? (
              <span class="tabular-nums text-slate-800">
                {offsetText(m.offset.x, t.forward, t.backward)}; {offsetText(m.offset.y, t.toLeft, t.toRight)}
              </span>
            ) : <span class="text-slate-400">–</span>}
          </div>
          {m.axles && a && (
            <>
              <Meter label={t.axleFront} value={m.axles.front} max={a.maxFront || Math.max(1, plan.space.maxPayload)} testid="metric-front-axle"
                text={t.axleLoad(fmt(m.axles.front), a.maxFront ? fmt(a.maxFront) : null)} />
              <Meter label={t.axleRear} value={m.axles.rear} max={a.maxRear || Math.max(1, plan.space.maxPayload)} testid="metric-rear-axle"
                text={t.axleLoad(fmt(m.axles.rear), a.maxRear ? fmt(a.maxRear) : null)} />
            </>
          )}
        </section>
      )}

      {showChecks && plan.checks.length > 0 && (
        <section class="rounded-xl border border-slate-200 bg-white p-3" aria-labelledby="lp-checks" data-testid="checks">
          <h3 id="lp-checks" class="m-0 mb-2 text-sm font-semibold">{t.checks}</h3>
          <ul class="m-0 flex list-none flex-col gap-1 p-0">
            {plan.checks.map((c, i) => {
              const r = evaluation.results[i];
              return (
                <li key={i} class="flex items-start gap-2 text-sm" data-testid={`check-${i + 1}`} data-passed={r.passed ? "true" : "false"}>
                  <span class={`grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold ${r.passed ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{r.passed ? "✓" : "✗"}</span>
                  <span>{t.describe(c, plan.support)}{r.boxes.length > 0 && <span class="text-xs text-slate-500"> ({r.boxes.join(", ")})</span>}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
};

/** The 3D view, or a message without WebGL. */
const View3D = ({ plan, solids, selected, cog, t, readOnly, onPick }: {
  plan: Plan; solids: Solid[]; selected: string | null; cog: { x: number; y: number; z: number } | null; t: Texts; readOnly: boolean; onPick: (p: Pick) => void;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<LoadScene | null>(null);
  const [webgl, setWebgl] = useState(true);
  const pick = useRef(onPick);
  pick.current = readOnly ? () => {} : onPick;
  useEffect(() => {
    if (!webgl || !host.current) return;
    try {
      scene.current = new LoadScene(host.current, (p) => pick.current(p));
      scene.current.canvas.addEventListener("webglcontextlost", () => setWebgl(false));
      (host.current as any).__scene = scene.current; // for tests
    } catch {
      setWebgl(false);
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, [webgl]);
  useEffect(() => {
    scene.current?.update({ plan, solids, selected, cog, labels: { door: t.door, front: t.front, stop: t.stopShort } });
  }, [plan, solids, selected, cog, t, webgl]);

  const onKeyDown = (e: KeyboardEvent) => {
    const s = scene.current;
    if (!s) return;
    const turn = Math.PI / 18;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => s.orbit(-turn, 0), ArrowRight: () => s.orbit(turn, 0), ArrowUp: () => s.orbit(0, -turn), ArrowDown: () => s.orbit(0, turn),
      "+": () => s.zoom(0.85), "=": () => s.zoom(0.85), "-": () => s.zoom(1 / 0.85), "0": () => s.resetCamera(), Home: () => s.resetCamera(),
    };
    if (keys[e.key]) {
      e.preventDefault();
      keys[e.key]();
    }
  };

  return webgl ? (
    <div ref={host} role="application" aria-roledescription={t.view3d} aria-label={`${t.view3d}. ${t.view3dHelp}`} tabIndex={0} data-testid="view-3d" data-view="3d"
      class="h-[300px] w-full overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-sky-50 to-white outline-none focus-visible:ring-2 focus-visible:ring-sky-600 @3xl:h-[340px]"
      onKeyDown={onKeyDown} />
  ) : (
    <p class="m-0 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="view-3d" data-view="none">{t.noWebgl}</p>
  );
};

export default Interaction;
