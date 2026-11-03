// SPDX-License-Identifier: GPL-3.0-only
// Based on https://github.com/openPCI/openPCIs/tree/master/svgmap, © OpenPCI (Aarhus University and Aalborg University):
// Elias J.T. Hansen, Anna Rusmann and Jeppe Bundsgaard.
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026.

// The map: the author's SVG, the points the candidate can walk along, and the route rules. The numbering of the points
// is the one of the original svgmap, so its points of interest and responses keep their meaning:
// - every <path> in the path layer, in document order, gets a point every `dotresolution` units along its length,
//   from its start, plus one at its very end;
// - consecutive points of a path are connected;
// - path ends closer than dotresolution / 2 to each other are one crossing, and that crossing keeps the highest number.

import { EXAMPLE_MAP, EXAMPLE_POI } from "./example-map";

export type MapNode = {
  id: number;
  x: number;
  y: number;
  neighbours: number[];
  /** The first or last point of a path: a crossing, a bend between two paths, or the end of a road. */
  endpoint: boolean;
  /** Merged into another path end: not a point of its own. */
  mergedInto?: number;
};

export type ViewBox = { x: number; y: number; width: number; height: number };

export type MapProblem = { kind: "invalidSvg" } | { kind: "noLayer"; layer: string } | { kind: "noPaths"; layer: string };

export type MapModel = {
  /** The (cleaned) SVG of the map, to show as it is. */
  svg: SVGSVGElement | null;
  viewBox: ViewBox;
  nodes: MapNode[];
  /** The ids of the points the candidate can use (not merged into another one). */
  active: number[];
  /** Crossings, road ends and points of interest: the stops of the keyboard. */
  stops: number[];
  problem: MapProblem | null;
  isExample: boolean;
};

export type Poi = Record<string, number>;

const SVG_NS = "http://www.w3.org/2000/svg";

/** The distance between the points: parseInt of the setting, 5 when that is not a positive number (as the original). */
export const parseResolution = (value: unknown) => {
  const n = parseInt(String(value), 10);
  return n > 0 ? n : 5;
};

/** No scripts, event handlers or embedded documents from the author's SVG in the item. */
const clean = (root: Element) => {
  root.querySelectorAll("script, foreignObject, iframe, object, embed").forEach((e) => e.remove());
  [root, ...Array.from(root.querySelectorAll("*"))].forEach((e) => {
    Array.from(e.attributes).forEach((a) => {
      const name = a.name.toLowerCase();
      if (name.startsWith("on")) e.removeAttribute(a.name);
      if ((name === "href" || name.endsWith(":href")) && /^\s*javascript:/i.test(a.value)) e.removeAttribute(a.name);
    });
  });
};

const parseViewBox = (svg: Element): ViewBox => {
  const parts = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  }
  const width = parseFloat(svg.getAttribute("width") ?? "") || 400;
  const height = parseFloat(svg.getAttribute("height") ?? "") || 300;
  return { x: 0, y: 0, width, height };
};

/** The transform from an element's own coordinates to those of the map (the transforms of its groups included). */
const matrixTo = (element: Element, root: Element) => {
  let m = new DOMMatrix();
  for (let e: Element | null = element; e && e !== root; e = e.parentElement) {
    const t = (e as SVGGraphicsElement).transform?.baseVal?.consolidate();
    if (t) m = DOMMatrix.fromMatrix(t.matrix).multiply(m);
  }
  return m;
};

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** The points along the paths of the layer, connected, with the path ends that meet joined into one. */
const buildNodes = (svg: SVGSVGElement, layer: Element, resolution: number): MapNode[] => {
  const nodes: MapNode[] = [];
  layer.querySelectorAll("path").forEach((path: SVGPathElement) => {
    let length: number;
    try {
      length = path.getTotalLength();
    } catch {
      return;
    }
    if (!Number.isFinite(length)) return;
    const m = matrixTo(path, svg);
    let first: MapNode | null = null;
    let last: MapNode | null = null;
    let i = 0;
    while (i <= length) {
      const p = m.transformPoint(path.getPointAtLength(i));
      const node: MapNode = { id: nodes.length, x: p.x, y: p.y, neighbours: [], endpoint: false };
      if (last) {
        node.neighbours.push(last.id);
        last.neighbours.push(node.id);
      }
      first = first ?? node;
      last = node;
      nodes.push(node);
      if (i === length) break;
      i += resolution;
      if (i > length) i = length;
    }
    if (first) first.endpoint = last.endpoint = true;
  });

  // path ends that meet: one crossing, the highest number (the point the original kept)
  const ends = nodes.filter((n) => n.endpoint);
  const parent = new Map<number, number>();
  const find = (id: number): number => {
    const p = parent.get(id) ?? id;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  for (let a = 0; a < ends.length; a++) {
    for (let b = a + 1; b < ends.length; b++) {
      if (distance(ends[a], ends[b]) < resolution / 2) {
        const ra = find(ends[a].id);
        const rb = find(ends[b].id);
        if (ra !== rb) parent.set(Math.min(ra, rb), Math.max(ra, rb));
      }
    }
  }
  const canonical = (id: number) => (parent.has(id) ? find(id) : id);
  nodes.forEach((n) => {
    const c = canonical(n.id);
    if (c !== n.id) n.mergedInto = c;
  });
  nodes.forEach((n) => {
    if (n.mergedInto !== undefined) {
      nodes[n.mergedInto].neighbours.push(...n.neighbours);
      n.neighbours = [];
    }
  });
  nodes.forEach((n) => {
    n.neighbours = Array.from(new Set(n.neighbours.map(canonical))).filter((id) => id !== n.id);
  });
  return nodes;
};

/**
 * Reads the map setting (SVG text; empty: the example map) and finds its points. `scratch` is an element in the
 * document: an SVG has to be in a document to measure its paths. The SVG stays there until it is shown.
 */
export const loadMap = (backdrop: string, layerId: string, resolutionSetting: unknown, scratch: Element): MapModel => {
  const isExample = !(backdrop ?? "").trim();
  const text = isExample ? EXAMPLE_MAP : backdrop;
  const resolution = parseResolution(resolutionSetting);
  // data-pathlayer names the layer of the author's own map; the example map's is "path"
  const layerName = (!isExample && (layerId ?? "").trim()) || "path";
  const empty: MapModel = { svg: null, viewBox: { x: 0, y: 0, width: 400, height: 300 }, nodes: [], active: [], stops: [], problem: null, isExample };

  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "svg" || root.namespaceURI !== SVG_NS || doc.getElementsByTagName("parsererror").length) {
    return { ...empty, problem: { kind: "invalidSvg" } };
  }
  clean(root);
  const svg = document.importNode(root, true) as unknown as SVGSVGElement;
  const viewBox = parseViewBox(svg);
  // shown inside the PCI's own <svg> with the same viewBox: one coordinate system for the map and the route
  svg.setAttribute("x", String(viewBox.x));
  svg.setAttribute("y", String(viewBox.y));
  svg.setAttribute("width", String(viewBox.width));
  svg.setAttribute("height", String(viewBox.height));
  svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
  svg.setAttribute("aria-hidden", "true");
  svg.style.removeProperty("width");
  svg.style.removeProperty("height");
  scratch.replaceChildren(svg);

  const layer = Array.from(svg.querySelectorAll("[id]")).find((e) => e.id === layerName);
  if (!layer) return { ...empty, svg, viewBox, problem: { kind: "noLayer", layer: layerName } };
  const nodes = buildNodes(svg, layer, resolution);
  if (!nodes.length) return { ...empty, svg, viewBox, problem: { kind: "noPaths", layer: layerName } };
  const active = nodes.filter((n) => n.mergedInto === undefined).map((n) => n.id);
  const stops = active.filter((id) => nodes[id].endpoint);
  return { svg, viewBox, nodes, active, stops, problem: null, isExample };
};

/** The point a number refers to: a path end that was joined into a crossing refers to that crossing. */
export const canonicalId = (map: MapModel, id: number): number | null => {
  const node = map.nodes[id];
  if (!node) return null;
  return node.mergedInto ?? node.id;
};

/** The nearest point of the map to (x, y), within maxDistance. */
export const nearestNode = (map: MapModel, x: number, y: number, maxDistance = Infinity, among = map.active): number | null => {
  let best: number | null = null;
  let bestDistance = maxDistance;
  for (const id of among) {
    const d = distance(map.nodes[id], { x, y });
    if (d < bestDistance) {
      best = id;
      bestDistance = d;
    }
  }
  return best;
};

/**
 * The poi setting: JSON { name: point number }, as the original. On the example map without a setting of its own:
 * the example's points of interest.
 */
export const parsePoi = (setting: unknown, map: MapModel): Poi => {
  if ((setting === undefined || setting === null || String(setting).trim() === "") && map.isExample) {
    const poi: Poi = {};
    Object.entries(EXAMPLE_POI).forEach(([name, [x, y]]) => {
      const id = nearestNode(map, x, y);
      if (id !== null) poi[name] = id;
    });
    return poi;
  }
  let raw: unknown = setting;
  if (typeof setting === "string") {
    try {
      raw = JSON.parse(setting);
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const poi: Poi = {};
  Object.entries(raw as Record<string, unknown>).forEach(([name, value]) => {
    const id = canonicalId(map, parseInt(String(value), 10));
    if (id !== null) poi[name] = id;
  });
  return poi;
};

/** The poi setting as text, in the order the author added them ("{}": none, also on the example map). */
export const serializePoi = (poi: Poi) => JSON.stringify(poi);

/** Where a route starts: the "start" point of interest, if any. */
export const startOf = (poi: Poi): number[] => (poi.start !== undefined ? [poi.start] : []);

/**
 * The shortest way along the roads from the end of the route to `target`, without going back over the route (a road
 * between two points of the route), as the original. Crossing the route is allowed. null: there is no such way.
 */
export const wayTo = (map: MapModel, route: number[], target: number): number[] | null => {
  const from = route[route.length - 1];
  if (from === undefined || from === target) return null;
  const onRoute = new Set(route);
  const previous = new Map<number, number>([[from, from]]);
  const queue = [from];
  while (queue.length) {
    const u = queue.shift();
    for (const c of map.nodes[u].neighbours) {
      if (previous.has(c)) continue;
      if (onRoute.has(c) && onRoute.has(u)) continue;
      previous.set(c, u);
      if (c === target) {
        const way = [c];
        for (let n = u; n !== from; n = previous.get(n)) way.unshift(n);
        return way;
      }
      queue.push(c);
    }
  }
  return null;
};

/**
 * The route after choosing point `target`: the first point; back to it when it is on the route already (the last
 * time the route passed it); else extended along the shortest way. null: nothing changes.
 */
export const routeTo = (map: MapModel, route: number[], target: number): number[] | null => {
  if (!route.length) return [target];
  if (route[route.length - 1] === target) return null;
  const at = route.lastIndexOf(target);
  if (at >= 0) return route.slice(0, at + 1);
  const way = wayTo(map, route, target);
  return way ? [...route, ...way] : null;
};

/** The names of the points of interest on the route, without the start (the original's "poi"). */
export const poisOn = (route: number[], poi: Poi) =>
  Object.keys(poi).filter((name) => name !== "start" && route.includes(poi[name]));

/**
 * The scoring settings, instead of the original's JavaScript scoring function (no author code is run):
 * - required: names of points of interest the route must all pass (data-requiredpoi, comma separated);
 * - end: the point of interest the route must end at (data-endpoi);
 * - shortest: the route may be no longer than the shortest way from the start, past every required point (in any
 *   order), to the end (or to where the route ends, without an end point).
 */
export type Scoring = { required: string[]; end: string | null; shortest: boolean };

export const parseScoring = (requiredpoi: unknown, endpoi: unknown, shortest: unknown): Scoring => ({
  required: Array.from(new Set(String(requiredpoi ?? "").split(/[\s,;]+/).map((n) => n.trim()).filter((n) => n && n !== "start"))),
  end: String(endpoi ?? "").trim() || null,
  shortest: String(shortest ?? "").trim().toLowerCase() === "true",
});

export const serializeScoring = (scoring: Scoring) => ({
  requiredpoi: scoring.required.join(","),
  endpoi: scoring.end ?? "",
});

/** Scoring is on when at least one of the settings is set. */
export const hasScoring = (s: Scoring) => s.required.length > 0 || s.end !== null || s.shortest;

/** The length of a route along the roads, in SVG units. */
export const routeLength = (map: MapModel, route: number[]) =>
  route.slice(1).reduce((sum, id, i) => sum + distance(map.nodes[route[i]], map.nodes[id]), 0);

/** The distances along the roads from one point to all points (Dijkstra), remembered per map and point. */
const distanceCache = new WeakMap<MapModel, Map<number, Map<number, number>>>();
const distancesFrom = (map: MapModel, source: number) => {
  const cache = distanceCache.get(map) ?? new Map<number, Map<number, number>>();
  distanceCache.set(map, cache);
  if (cache.has(source)) return cache.get(source);
  const dist = new Map<number, number>([[source, 0]]);
  // a binary heap of [distance, point]
  const heap: [number, number][] = [[0, source]];
  const push = (item: [number, number]) => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, u] = pop();
    if (d > (dist.get(u) ?? Infinity)) continue;
    for (const v of map.nodes[u].neighbours) {
      const next = d + distance(map.nodes[u], map.nodes[v]);
      if (next < (dist.get(v) ?? Infinity)) {
        dist.set(v, next);
        push([next, v]);
      }
    }
  }
  cache.set(source, dist);
  return dist;
};

/** At most this many required points for the shortest check (every order is tried). */
const MAX_PERMUTED = 7;

/** The shortest length from `from`, past all of `via` (any order), to `to`; Infinity when there is no way. */
export const shortestLength = (map: MapModel, from: number, via: number[], to: number) => {
  const stops = Array.from(new Set([from, ...via, to]));
  const table = new Map(stops.map((id) => [id, distancesFrom(map, id)]));
  const d = (a: number, b: number) => table.get(a).get(b) ?? Infinity;
  let best = Infinity;
  const walk = (at: number, left: number[], sum: number) => {
    if (sum >= best) return;
    if (!left.length) {
      best = Math.min(best, sum + d(at, to));
      return;
    }
    left.forEach((next, i) => walk(next, [...left.slice(0, i), ...left.slice(i + 1)], sum + d(at, next)));
  };
  walk(from, via.filter((id) => id !== from && id !== to), 0);
  return best;
};

/** 1 when the route meets every scoring setting, else 0; undefined without scoring settings. */
export const scoreRoute = (map: MapModel, route: number[], poi: Poi, scoring: Scoring): number | undefined => {
  if (!hasScoring(scoring)) return undefined;
  if (route.length < 2) return 0;
  const passed = poisOn(route, poi);
  if (!scoring.required.every((name) => passed.includes(name))) return 0;
  const last = route[route.length - 1];
  if (scoring.end !== null && poi[scoring.end] !== last) return 0;
  if (scoring.shortest) {
    const via = scoring.required.map((name) => poi[name]);
    const from = poi.start ?? route[0];
    if (route[0] !== from) return 0;
    if (via.length <= MAX_PERMUTED) {
      const shortest = shortestLength(map, from, via, last);
      if (routeLength(map, route) > shortest * (1 + 1e-9) + 1e-6) return 0;
    }
  }
  return 1;
};

/** The response, as the original: { path, poi, score }; score only when there are scoring settings. */
export const routeResult = (map: MapModel, route: number[], poi: Poi, scoring: Scoring) => {
  const result: { path: number[]; poi: string[]; score?: number } = { path: route, poi: poisOn(route, poi) };
  const score = scoreRoute(map, route, poi, scoring);
  if (score !== undefined) result.score = score;
  return result;
};

/** A route from a response or a saved state: point numbers that are on the map (a joined path end: its crossing). */
export const validRoute = (map: MapModel, path: unknown): number[] => {
  if (!Array.isArray(path)) return [];
  const route = path.map((id) => canonicalId(map, parseInt(String(id), 10)));
  return route.every((id) => id !== null) ? route : [];
};

/** The stops reached from `stop` along each of its roads (keyboard), with the direction of that road. */
export const roadsFrom = (map: MapModel, stop: number, isStop: (id: number) => boolean) =>
  map.nodes[stop].neighbours.map((first) => {
    let previous = stop;
    let current = first;
    let steps = 0;
    // the direction of the road where it leaves: a few points along it
    let towards = map.nodes[first];
    while (!isStop(current) && steps < 100000) {
      const next = map.nodes[current].neighbours.find((n) => n !== previous);
      if (next === undefined) break;
      previous = current;
      current = next;
      steps++;
      if (steps <= 3) towards = map.nodes[current];
    }
    const from = map.nodes[stop];
    return { to: current, angle: Math.atan2(towards.y - from.y, towards.x - from.x) };
  }).filter((road) => road.to !== stop);

/** One of eight directions (0: right, 2: down, 4: left, 6: up) for an angle in screen coordinates. */
export const octant = (angle: number) => ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
