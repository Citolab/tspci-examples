// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/svgmap, © OpenPCI (Aarhus University and Aalborg University):
// Elias J.T. Hansen, Anna Rusmann and Jeppe Bundsgaard.
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026.

import { IStore, useStore } from "@citolab/preact-store";
import { useMemo, useRef, useState } from "preact/hooks";
import { MapCanvas, MapPoint, pointsOf } from "./canvas";
import { MapModel, Poi, nearestNode, octant, poisOn, roadsFrom, routeTo, startOf, wayTo } from "./map";
import { Actions, StateModel } from "./store";
import { Texts } from "./texts";

// The candidate draws a route along the roads of the map:
// - click or tap a point: the route goes there along the shortest way (as the original); a point on the route takes
//   the route back to it;
// - drag: the route follows the pointer; dragging back over what this drag drew takes it back;
// - keyboard: the arrow keys go along the roads from crossing to crossing, Enter or Space draws the route there.

export type ShowPoi = "markers" | "labels" | "none";

/** How close (CSS pixels) the pointer has to be to a point of a road. */
const REACH = { mouse: 16, pen: 16, touch: 28 };
/** A drag starts after the pointer moved this far (CSS pixels); less is a click. */
const DRAG = 6;

const sameRoute = (a: number[], b: number[]) => a.length === b.length && a.every((id, i) => id === b[i]);

const Interaction = ({ map, poi, store, texts, prompt, showPoi, history, problem }: {
  map: MapModel;
  poi: Poi;
  store: IStore<StateModel, Actions>;
  texts: Texts;
  prompt: string;
  showPoi: ShowPoi;
  /** The routes before each step, for Undo (kept by the PCI, so a redraw keeps them). */
  history: number[][];
  problem: string | null;
}) => {
  const { path } = useStore(store);
  const start = startOf(poi);
  const [draft, setDraft] = useState<number[] | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [message, setMessage] = useState("");
  const gesture = useRef<{ pointer: number; x: number; y: number; moved: boolean; before: number[]; current: number[] } | null>(null);

  const route = draft ?? path;
  const end = route[route.length - 1];

  // the stops of the keyboard: crossings, road ends and points of interest; named for a screen reader
  const { isStop, names } = useMemo(() => {
    const stops = new Set([...map.stops, ...Object.values(poi)]);
    const names = new Map<number, string>();
    const byPlace = Array.from(stops).sort((a, b) => map.nodes[a].y - map.nodes[b].y || map.nodes[a].x - map.nodes[b].x);
    byPlace.forEach((id, i) => names.set(id, texts.point(i + 1)));
    Object.entries(poi).forEach(([name, id]) => names.set(id, name === "start" ? texts.start : name));
    return { isStop: (id: number) => stops.has(id), names };
  }, [map, poi, texts]);
  const nameOf = (id: number) => names.get(id) ?? texts.point(id);

  const commit = (next: number[], announce: string) => {
    if (sameRoute(next, path)) return;
    history.push(path);
    store.dispatch({ type: "ROUTE", payload: { path: next } });
    setMessage(`${announce} ${texts.passed(showPoi === "none" ? [] : poisOn(next, poi))}`);
  };

  /** Click, tap, Enter: the route to `target`, or back to it. */
  const choose = (target: number) => {
    const next = routeTo(map, path, target);
    if (!next) {
      if (!path.includes(target)) setMessage(texts.noRoad);
      return;
    }
    commit(next, next.length < path.length ? texts.backTo(nameOf(target)) : texts.routeTo(nameOf(target)));
  };

  const undo = () => {
    const previous = history.pop();
    if (!previous) return;
    store.dispatch({ type: "UNDO", payload: { path: previous } });
    setMessage(texts.undone);
  };

  const clear = () => {
    if (sameRoute(path, start)) return;
    history.push(path);
    store.dispatch({ type: "CLEAR", payload: { path: start } });
    setMessage(texts.cleared);
  };

  const reach = (e: PointerEvent, px: number) => (REACH[e.pointerType] ?? REACH.mouse) * px;
  const nodeAt = (e: PointerEvent, at: MapPoint | null, px: number) => (at ? nearestNode(map, at.x, at.y, reach(e, px)) : null);

  const onPointerDown = (e: PointerEvent, at: MapPoint | null) => {
    if (e.button > 0 || !at || map.problem) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setKeyboard(false);
    gesture.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, moved: false, before: path, current: path };
  };

  const onPointerMove = (e: PointerEvent, at: MapPoint | null, px: number) => {
    const g = gesture.current;
    const node = nodeAt(e, at, px);
    if (!g || g.pointer !== e.pointerId) {
      if (e.pointerType === "mouse") setHover(node);
      return;
    }
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < DRAG) return;
    g.moved = true;
    setHover(null);
    if (node === null || node === g.current[g.current.length - 1]) return;
    const at_ = g.current.lastIndexOf(node);
    if (at_ >= 0) {
      // back over what this drag drew (or to where it started): take it back; older parts of the route stay
      if (at_ >= g.before.length - 1) g.current = g.current.slice(0, at_ + 1);
    } else {
      g.current = routeTo(map, g.current, node) ?? g.current;
    }
    setDraft(g.current);
  };

  const onPointerUp = (e: PointerEvent, at: MapPoint | null, px: number) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    gesture.current = null;
    setDraft(null);
    if (!g.moved) {
      const node = nodeAt(e, at, px);
      if (node !== null) choose(node);
      return;
    }
    const last = g.current[g.current.length - 1];
    if (last !== undefined) commit(g.current, texts.routeTo(nameOf(last)));
  };

  const onPointerCancel = () => {
    gesture.current = null;
    setDraft(null);
  };

  /** Where the keyboard is: the stop it went to, else the end of the route, else the first stop. */
  const here = () => focus ?? end ?? map.stops[0] ?? null;

  const describe = (id: number) => {
    const status = id === end ? `, ${texts.routeEnd}` : path.includes(id) ? `, ${texts.onRoute}` : "";
    const directions = Array.from(new Set(roadsFrom(map, id, isStop).map((r) => texts.directions[octant(r.angle)])));
    return `${nameOf(id)}${status}. ${texts.roadsTo(directions)}`;
  };

  const move = (angle: number) => {
    const from = here();
    if (from === null) return;
    const score = (a: number) => Math.cos(a - angle);
    // along a road first; else the nearest stop in that direction
    const roads = roadsFrom(map, from, isStop).filter((r) => score(r.angle) > 0.38).sort((a, b) => score(b.angle) - score(a.angle));
    let to = roads[0]?.to ?? null;
    if (to === null) {
      const f = map.nodes[from];
      const candidates = [...map.stops, ...Object.values(poi)].filter((id) => {
        const n = map.nodes[id];
        return id !== from && score(Math.atan2(n.y - f.y, n.x - f.x)) > 0.7;
      });
      to = nearestNode(map, f.x, f.y, Infinity, candidates);
    }
    if (to === null) return;
    setFocus(to);
    setMessage(describe(to));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (map.problem) return;
    const arrows: Record<string, number> = { ArrowRight: 0, ArrowDown: Math.PI / 2, ArrowLeft: Math.PI, ArrowUp: -Math.PI / 2 };
    if (e.key in arrows) {
      e.preventDefault();
      setKeyboard(true);
      move(arrows[e.key]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setKeyboard(true);
      const target = here();
      if (target !== null) choose(target);
    } else if (e.key === "Backspace" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z")) {
      e.preventDefault();
      undo();
    }
  };

  const onFocus = () => {
    const at = here();
    if (at !== null) setMessage(describe(at));
  };

  // the dashed way the route would take to the point under the pointer, or to the keyboard's stop
  const target = keyboard ? focus : hover;
  const preview = target !== null && !draft && end !== undefined && !route.includes(target) ? wayTo(map, route, target) : null;

  const poiEntries = Object.entries(poi).filter(([name]) => name !== "start");
  const passed = poisOn(route, poi);

  return (
    <div className="flex max-w-full flex-col gap-3 font-sans text-slate-800">
      {prompt && <p className="m-0 text-[15px] text-slate-700" id="prompt">{prompt}</p>}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.06)]">
        <MapCanvas map={map} data-testid="map" tabIndex={0} role="application"
          aria-label={prompt || texts.map} aria-describedby="instructions keyboard"
          className="mx-auto block h-auto cursor-crosshair touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-inset"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
          onPointerLeave={() => setHover(null)} onKeyDown={onKeyDown} onFocus={onFocus} onBlur={() => setKeyboard(false)}
          overlay={(px) => (
            <g pointer-events="none">
              {/* crossings and road ends: where the roads meet */}
              {map.stops.map((id) => (
                <circle key={id} cx={map.nodes[id].x} cy={map.nodes[id].y} r={3 * px} fill="#fff" stroke="#94a3b8" stroke-width={1.25 * px} />
              ))}
              {preview && (
                <polyline points={pointsOf(map, [end, ...preview])} fill="none" stroke="#0284c7" stroke-opacity="0.7"
                  stroke-width={4 * px} stroke-dasharray={`${2 * px} ${7 * px}`} stroke-linecap="round" stroke-linejoin="round" />
              )}
              {route.length > 1 && (
                <g data-testid="route">
                  <polyline points={pointsOf(map, route)} fill="none" stroke="#fff" stroke-width={10 * px} stroke-linecap="round" stroke-linejoin="round" />
                  <polyline points={pointsOf(map, route)} fill="none" stroke="#0369a1" stroke-width={6 * px} stroke-linecap="round" stroke-linejoin="round" />
                </g>
              )}
              {showPoi !== "none" && poiEntries.map(([name, id]) => {
                const n = map.nodes[id];
                const on = passed.includes(name);
                return (
                  <g key={name} data-testid={`poi-${name}`} data-passed={on}>
                    <circle cx={n.x} cy={n.y} r={7 * px} fill={on ? "#059669" : "#f59e0b"} stroke="#fff" stroke-width={2.5 * px} />
                    {on && <path d={`M ${n.x - 3 * px} ${n.y} l ${2 * px} ${2.2 * px} l ${4 * px} ${-4.4 * px}`} fill="none" stroke="#fff" stroke-width={1.8 * px} stroke-linecap="round" stroke-linejoin="round" />}
                    {showPoi === "labels" && (
                      <text x={n.x + 11 * px} y={n.y + 4 * px} font-size={12 * px} font-weight="600" fill="#1e293b" stroke="#fff"
                        stroke-width={3 * px} paint-order="stroke" font-family="system-ui, sans-serif">{name}</text>
                    )}
                  </g>
                );
              })}
              {start.map((id) => (
                <g key="start" data-testid="start">
                  <circle cx={map.nodes[id].x} cy={map.nodes[id].y} r={8 * px} fill="#15803d" stroke="#fff" stroke-width={2.5 * px} />
                  <circle cx={map.nodes[id].x} cy={map.nodes[id].y} r={2.5 * px} fill="#fff" />
                </g>
              ))}
              {end !== undefined && (route.length > 1 || !start.length) && (
                <circle data-testid="end" cx={map.nodes[end].x} cy={map.nodes[end].y} r={6 * px} fill="#0369a1" stroke="#fff" stroke-width={2.5 * px} />
              )}
              {target !== null && (
                <circle cx={map.nodes[target].x} cy={map.nodes[target].y} r={(keyboard ? 11 : 9) * px} fill="none"
                  stroke={keyboard ? "#0f172a" : "#0284c7"} stroke-width={2 * px} />
              )}
            </g>
          )} />
      </div>
      {problem && <p className="m-0 text-sm text-red-700" role="alert">{problem}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-testid="undo" onClick={undo} disabled={!history.length}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-40">
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true"><path d="M7 4 3 8l4 4M3.5 8H12a5 5 0 0 1 0 10H9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          {texts.undo}
        </button>
        <button type="button" data-testid="clear" onClick={clear} disabled={sameRoute(path, start)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-40">
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          {texts.clear}
        </button>
        <p className="m-0 ml-auto text-sm text-slate-600" data-testid="status">
          {route.length < 2 ? texts.empty : showPoi === "none" ? texts.drawn : texts.passed(passed)}
        </p>
      </div>
      <p className="m-0 text-xs text-slate-500" id="instructions">{texts.instructions}</p>
      <p className="m-0 text-xs text-slate-500" id="keyboard">{texts.keyboard}</p>
      <p className="sr-only" aria-live="polite" data-testid="live">{message}</p>
    </div>
  );
};

export default Interaction;
