// Order picking without a screen: the warehouse (aisles, racks, shelves and the products on them), location codes such
// as A-03-2, the walking distances on the aisle graph and the shortest route along a set of locations, the checks of a
// picked roll cage against the pick list, the response and the correct response. No imports: `npm test` runs it in
// node as it is.

// ---- the warehouse ----

export type Language = "en" | "nl";

/** The pictures a product box can carry (pictures.tsx draws them). */
export const PICTURES = [
  "paper", "pen", "marker", "glue", "notebook", "binder", "scissors", "roll", "towel", "bottle", "spray", "gloves", "bag", "cup", "battery", "tape", "box",
] as const;
export type Picture = (typeof PICTURES)[number];

/** A product on a shelf: one article per location. `stock` only counts with the `stock` setting on. */
export type Product = { loc: string; article: string; name: string; unit: string; picture: Picture; stock: number };
/** A line of the pick list: the location, and how many units (boxes, packs) to take. The article is the one there. */
export type OrderLine = { loc: string; qty: number };
/** What is in the tote of an order line in the roll cage of the check task; null is an empty tote. */
export type Tote = { loc: string; qty: number } | null;

/**
 * The warehouse seen from above: `aisles` aisles (A, B, …) going up from the front corridor, each with `depth` rack
 * positions on both sides (odd rack numbers on the left, even on the right: A-01 and A-02 face each other at the
 * front), `shelves` shelves in every rack (1 at the bottom), and a corridor at the back too when `back` is on.
 */
export type Layout = { aisles: number; depth: number; shelves: number; back: boolean };
export type Warehouse = Layout & {
  products: Product[];
  order: { number: string; for: string; lines: OrderLine[] };
  /** The roll cage of the check task: a tote per order line, in the order of the lines. */
  cart: Tote[];
};

export const LIMITS = { aisles: [1, 6], depth: [1, 8], shelves: [1, 4], lines: 10, qty: 99, stock: 999 } as const;

const LETTERS = "ABCDEF";
export const aisleLetter = (aisle: number) => LETTERS[aisle] ?? "?";
const pad = (n: number) => String(n).padStart(2, "0");

/** A rack's code: "A-03". */
export const rackCode = (aisle: number, rack: number) => `${aisleLetter(aisle)}-${pad(rack)}`;
/** A location's code: "A-03-2" (aisle A, rack 03, shelf 2). */
export const locationCode = (aisle: number, rack: number, shelf: number) => `${rackCode(aisle, rack)}-${shelf}`;

export type Location = { aisle: number; rack: number; shelf: number };

/** "A-03-2" (also "a-3-2", "A032") → aisle 0, rack 3, shelf 2; undefined when it is no location code. */
export function parseLocation(code: string): Location | undefined {
  const match = /^\s*([a-f])\s*-?\s*(\d{1,2})\s*-?\s*(\d)\s*$/i.exec(code ?? "");
  if (!match) return undefined;
  const rack = Number(match[2]);
  const shelf = Number(match[3]);
  if (rack < 1 || shelf < 1) return undefined;
  return { aisle: LETTERS.indexOf(match[1].toUpperCase()), rack, shelf };
}
/** "A-03" → aisle 0, rack 3. */
export function parseRack(code: string): { aisle: number; rack: number } | undefined {
  const match = /^\s*([a-f])\s*-?\s*(\d{1,2})\s*$/i.exec(code ?? "");
  if (!match || Number(match[2]) < 1) return undefined;
  return { aisle: LETTERS.indexOf(match[1].toUpperCase()), rack: Number(match[2]) };
}
/** The location written the way the PCI writes it ("a-3-2" → "A-03-2"). */
export const normalLocation = (code: string) => {
  const l = parseLocation(code);
  return l ? locationCode(l.aisle, l.rack, l.shelf) : code;
};
/** The rack a location is in: "A-03-2" → "A-03". */
export const rackOf = (loc: string) => {
  const l = parseLocation(loc);
  return l ? rackCode(l.aisle, l.rack) : "";
};

/** Where a rack stands: its position along the aisle (1 at the front) and its side. */
export const rackPosition = (rack: number) => ({ pos: Math.ceil(rack / 2), side: rack % 2 === 1 ? ("left" as const) : ("right" as const) });

export const inLayout = (layout: Layout, loc: string) => {
  const l = parseLocation(loc);
  return !!l && l.aisle >= 0 && l.aisle < layout.aisles && l.rack <= 2 * layout.depth && l.shelf <= layout.shelves;
};
export const rackInLayout = (layout: Layout, code: string) => {
  const r = parseRack(code);
  return !!r && r.aisle >= 0 && r.aisle < layout.aisles && r.rack <= 2 * layout.depth;
};

/** Every rack of the layout, aisle by aisle, front to back, left before right. */
export const racksOf = (layout: Layout) =>
  Array.from({ length: layout.aisles }, (_, aisle) => Array.from({ length: 2 * layout.depth }, (_, r) => rackCode(aisle, r + 1))).flat();

export const productAt = (w: Warehouse, loc: string) => w.products.find((p) => p.loc === loc);

// ---- walking: the aisle graph ----

/** Steps from dispatch to the foot of aisle A, and between the feet of two aisles (two racks and an aisle wide). */
export const DISPATCH_GAP = 2;
export const AISLE_SPACING = 3;

/**
 * The aisle graph: dispatch, the foot of every aisle in the front corridor, every rack position in an aisle (the two
 * racks that face each other share one: the picker stands between them), and the head of every aisle in the back
 * corridor when there is one. Coordinates in steps: dispatch at (0, 0), the front corridor at y = 0, rack position p
 * at y = p, the back corridor at y = depth + 1. One step is one rack along an aisle.
 */
export type Graph = { ids: string[]; x: number[]; y: number[]; dist: number[][]; next: number[][] };

export const DISPATCH = "dispatch";
const posNode = (aisle: number, pos: number) => `${aisleLetter(aisle)}${pos}`;
const graphs = new Map<string, Graph>();

export function graphOf(layout: Layout): Graph {
  const key = `${layout.aisles}/${layout.depth}/${layout.back}`;
  const known = graphs.get(key);
  if (known) return known;
  const ids: string[] = [];
  const x: number[] = [];
  const y: number[] = [];
  const add = (id: string, nx: number, ny: number) => {
    ids.push(id);
    x.push(nx);
    y.push(ny);
    return ids.length - 1;
  };
  const edges: [number, number, number][] = [];
  const start = add(DISPATCH, 0, 0);
  let previousFoot = start;
  let previousHead = -1;
  for (let aisle = 0; aisle < layout.aisles; aisle++) {
    const ax = DISPATCH_GAP + aisle * AISLE_SPACING;
    const foot = add(`front-${aisleLetter(aisle)}`, ax, 0);
    edges.push([previousFoot, foot, aisle === 0 ? DISPATCH_GAP : AISLE_SPACING]);
    previousFoot = foot;
    let below = foot;
    for (let pos = 1; pos <= layout.depth; pos++) {
      const node = add(posNode(aisle, pos), ax, pos);
      edges.push([below, node, 1]);
      below = node;
    }
    if (layout.back) {
      const head = add(`back-${aisleLetter(aisle)}`, ax, layout.depth + 1);
      edges.push([below, head, 1]);
      if (previousHead >= 0) edges.push([previousHead, head, AISLE_SPACING]);
      previousHead = head;
    }
  }
  // Floyd–Warshall: the graph has at most 1 + 6 × 10 nodes
  const n = ids.length;
  const dist = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  const next = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? j : -1)));
  for (const [a, b, d] of edges) {
    dist[a][b] = dist[b][a] = d;
    next[a][b] = b;
    next[b][a] = a;
  }
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (dist[i][k] + dist[k][j] < dist[i][j]) {
          dist[i][j] = dist[i][k] + dist[k][j];
          next[i][j] = next[i][k];
        }
  const graph = { ids, x, y, dist, next };
  graphs.set(key, graph);
  return graph;
}

/** The node of a rack ("A-03") or a location ("A-03-2"); the node of dispatch for anything else. */
export function nodeOf(layout: Layout, code: string): number {
  const graph = graphOf(layout);
  const r = parseRack(code) ?? parseLocation(code);
  if (!r) return 0;
  const index = graph.ids.indexOf(posNode(r.aisle, rackPosition(r.rack).pos));
  return index < 0 ? 0 : index;
}

/** The steps from one rack or location to another (or to "dispatch"). */
export const distance = (layout: Layout, from: string, to: string) => graphOf(layout).dist[nodeOf(layout, from)][nodeOf(layout, to)];

/** The nodes of the shortest way from one node to another, both included. */
export function pathBetween(graph: Graph, from: number, to: number): number[] {
  if (from === to) return [from];
  const path = [from];
  let at = from;
  while (at !== to && path.length <= graph.ids.length) {
    at = graph.next[at][to];
    if (at < 0) break;
    path.push(at);
  }
  return path;
}

/** The steps of a walk from dispatch along the racks in `walk`, and back to dispatch. */
export function walkLength(layout: Layout, walk: string[]): number {
  if (!walk.length) return 0;
  const graph = graphOf(layout);
  const nodes = [0, ...walk.map((code) => nodeOf(layout, code)), 0];
  let steps = 0;
  for (let i = 1; i < nodes.length; i++) steps += graph.dist[nodes[i - 1]][nodes[i]];
  return steps;
}

/** The points (in steps) of a walk from dispatch along the racks in `walk`; `home` adds the way back to dispatch. */
export function walkPoints(layout: Layout, walk: string[], home = false): { x: number; y: number }[] {
  const graph = graphOf(layout);
  const nodes = [0, ...walk.map((code) => nodeOf(layout, code)), ...(home && walk.length ? [0] : [])];
  const points: number[] = [nodes[0]];
  for (let i = 1; i < nodes.length; i++) points.push(...pathBetween(graph, nodes[i - 1], nodes[i]).slice(1));
  return points.map((node) => ({ x: graph.x[node], y: graph.y[node] }));
}

/**
 * The shortest walk from dispatch along every rack or location in `codes` and back (Held–Karp over the distinct rack
 * positions; at most 10 order lines, so at most 2^10 sets). Returns its length and the racks in walking order.
 */
export function shortestTour(layout: Layout, codes: string[]): { length: number; order: string[] } {
  const graph = graphOf(layout);
  const byNode = new Map<number, string>();
  for (const code of codes) {
    const node = nodeOf(layout, code);
    if (node !== 0 && !byNode.has(node)) byNode.set(node, rackOf(code) || code);
  }
  const nodes = [...byNode.keys()];
  const k = nodes.length;
  if (k === 0) return { length: 0, order: [] };
  const d = graph.dist;
  const full = (1 << k) - 1;
  const cost = Array.from({ length: 1 << k }, () => new Array<number>(k).fill(Infinity));
  const parent = Array.from({ length: 1 << k }, () => new Array<number>(k).fill(-1));
  for (let j = 0; j < k; j++) cost[1 << j][j] = d[0][nodes[j]];
  for (let mask = 1; mask <= full; mask++)
    for (let j = 0; j < k; j++) {
      if (!(mask & (1 << j)) || cost[mask][j] === Infinity) continue;
      for (let m = 0; m < k; m++) {
        if (mask & (1 << m)) continue;
        const next = mask | (1 << m);
        const c = cost[mask][j] + d[nodes[j]][nodes[m]];
        if (c < cost[next][m]) {
          cost[next][m] = c;
          parent[next][m] = j;
        }
      }
    }
  let best = Infinity;
  let last = 0;
  for (let j = 0; j < k; j++) {
    const c = cost[full][j] + d[nodes[j]][0];
    if (c < best) {
      best = c;
      last = j;
    }
  }
  const order: string[] = [];
  let mask = full;
  while (last >= 0) {
    order.unshift(byNode.get(nodes[last])!);
    const before = parent[mask][last];
    mask &= ~(1 << last);
    last = before;
  }
  return { length: best, order };
}

// ---- the settings, the state and the checks ----

export type Task = "pick" | "check";
export type Settings = { task: Task; route: boolean; stock: boolean; routeMargin: number };

export function settingsFrom(properties: Record<string, unknown>): Settings {
  const margin = Number(String(properties.routeMargin ?? "0").replace(",", "."));
  return {
    task: properties.task === "check" ? "check" : "pick",
    route: String(properties.route) === "true",
    stock: String(properties.stock) === "true",
    routeMargin: Number.isFinite(margin) && margin > 0 ? margin : 0,
  };
}

/** The pupil's judgement of a tote in the check task. */
export const VERDICTS = ["ok", "article", "quantity", "missing"] as const;
export type Verdict = (typeof VERDICTS)[number];

/**
 * What the pupil did:
 * - cart: what they took, by location ("A-03-2": 2) (pick)
 * - walk: the racks they went to, in order ("A-03"); the walk starts and ends at dispatch (pick)
 * - ticked: the order lines they ticked off (1 is the first), short: the lines they reported a shortage for (pick)
 * - verdicts: their judgement of every tote, "" when not judged yet (check)
 */
export type PickState = { cart: Record<string, number>; walk: string[]; ticked: number[]; short: number[]; verdicts: (Verdict | "")[] };

export const emptyState = (w: Warehouse): PickState => ({ cart: {}, walk: [], ticked: [], short: [], verdicts: w.order.lines.map(() => "") });

/** The pupil did something that answers: took something, ticked or reported a line, or judged a tote. */
export const answered = (settings: Settings, state: PickState) =>
  settings.task === "check"
    ? state.verdicts.some((v) => v !== "")
    : Object.values(state.cart).some((qty) => qty > 0) || state.ticked.length > 0 || state.short.length > 0;

/** The stock that counts: what is on the shelf with the `stock` setting on, else plenty. */
export const stockOf = (settings: Settings, product: Product | undefined) =>
  !product ? 0 : settings.stock ? product.stock : LIMITS.qty;

/** A line the shelf cannot fill (only with the `stock` setting on). */
export const isShort = (w: Warehouse, settings: Settings, line: OrderLine) => settings.stock && (productAt(w, line.loc)?.stock ?? 0) < line.qty;

/** The quantity a line must end up with in the roll cage: what was ordered, or all there is when it is short. */
export const rightQuantity = (w: Warehouse, settings: Settings, line: OrderLine) =>
  isShort(w, settings, line) ? (productAt(w, line.loc)?.stock ?? 0) : line.qty;

/** The units of every article in the roll cage, by article number (one article can lie at two locations). */
export function cartByArticle(w: Warehouse, cart: Record<string, number>): Map<string, number> {
  const byArticle = new Map<string, number>();
  for (const [loc, qty] of Object.entries(cart)) {
    const product = productAt(w, loc);
    if (product && qty > 0) byArticle.set(product.article, (byArticle.get(product.article) ?? 0) + qty);
  }
  return byArticle;
}

/** What is wrong with a tote of the check task: the truth the pupil's verdict is compared with. */
export function toteVerdict(w: Warehouse, line: number): Verdict {
  const order = w.order.lines[line];
  const tote = w.cart[line];
  if (!order || !tote || tote.qty <= 0) return "missing";
  if (productAt(w, tote.loc)?.article !== productAt(w, order.loc)?.article) return "article";
  return tote.qty === order.qty ? "ok" : "quantity";
}

export type LineCheck = { line: number; qty: number; right: number; short: boolean; reported: boolean; ok: boolean };

/** Every order line of the pick task: how many of its article are in the roll cage, and whether the line is right. */
export function lineChecks(w: Warehouse, settings: Settings, state: PickState): LineCheck[] {
  const byArticle = cartByArticle(w, state.cart);
  return w.order.lines.map((line, i) => {
    const article = productAt(w, line.loc)?.article ?? "";
    const qty = byArticle.get(article) ?? 0;
    const short = isShort(w, settings, line);
    const right = rightQuantity(w, settings, line);
    const reported = state.short.includes(i + 1);
    return { line: i + 1, qty, right, short, reported, ok: qty === right && reported === short };
  });
}

/** A field of the response record. */
export type Field = { name: string; type: "boolean" | "integer" | "float" | "string"; value: boolean | number | string };

/** The response fields (config.tspci.response in package.json), only those of the task and its settings. */
export function responseFields(w: Warehouse, settings: Settings, state: PickState): Field[] {
  const total = w.order.lines.length;
  if (settings.task === "check") {
    const truths = w.order.lines.map((_, i) => toteVerdict(w, i));
    const verdicts = truths.map((_, i) => state.verdicts[i] ?? "");
    const right = truths.filter((truth, i) => verdicts[i] === truth).length;
    const found = (kind: Verdict) => truths.filter((truth, i) => truth === kind && verdicts[i] === kind).length;
    return [
      { name: "correct", type: "boolean", value: right === total },
      { name: "lines", type: "integer", value: right },
      { name: "linesTotal", type: "integer", value: total },
      { name: "wrongItems", type: "integer", value: found("article") },
      { name: "quantityErrors", type: "integer", value: found("quantity") },
      { name: "picked", type: "string", value: serializeChecks(verdicts) },
    ];
  }
  const checks = lineChecks(w, settings, state);
  const ordered = new Set(w.order.lines.map((line) => productAt(w, line.loc)?.article));
  const wrongItems = [...cartByArticle(w, state.cart).keys()].filter((article) => !ordered.has(article)).length;
  const lines = checks.filter((c) => c.ok).length;
  const quantityErrors = checks.filter((c) => c.qty > 0 && c.qty !== c.right).length;
  const routeLength = walkLength(w, state.walk);
  const shortest = shortestRoute(w);
  const routeOk = !settings.route || routeLength <= shortest + settings.routeMargin;
  const fields: Field[] = [
    { name: "correct", type: "boolean", value: lines === total && wrongItems === 0 && routeOk },
    { name: "lines", type: "integer", value: lines },
    { name: "linesTotal", type: "integer", value: total },
    { name: "wrongItems", type: "integer", value: wrongItems },
    { name: "quantityErrors", type: "integer", value: quantityErrors },
  ];
  if (settings.stock) fields.push({ name: "shortagesReported", type: "integer", value: checks.filter((c) => c.short && c.reported).length });
  if (settings.route) {
    fields.push({ name: "routeLength", type: "float", value: routeLength });
    fields.push({ name: "shortestRoute", type: "float", value: shortest });
  }
  fields.push({ name: "picked", type: "string", value: serializePicked(state) });
  return fields;
}

/** The shortest walk from dispatch along the location of every order line and back, in steps. */
export const shortestRoute = (w: Warehouse) => shortestTour(w, w.order.lines.map((line) => line.loc)).length;

/** The state of the right answer: every line picked (all there is of a short one, reported), the shortest route, every tote judged. */
export function correctState(w: Warehouse, settings: Settings): PickState {
  const cart: Record<string, number> = {};
  w.order.lines.forEach((line) => {
    const qty = rightQuantity(w, settings, line);
    if (qty > 0) cart[line.loc] = qty;
  });
  return {
    cart,
    walk: shortestTour(w, w.order.lines.map((line) => line.loc)).order,
    ticked: w.order.lines.map((_, i) => i + 1),
    short: w.order.lines.flatMap((line, i) => (isShort(w, settings, line) ? [i + 1] : [])),
    verdicts: w.order.lines.map((_, i) => toteVerdict(w, i)),
  };
}

// ---- `picked`: the answer as text, and back ----

/** "cart: A-02-1=3, B-05-2=2; short: 3": the roll cage sorted by location, and the lines reported short. */
export function serializePicked(state: Pick<PickState, "cart" | "short">): string {
  const cart = Object.entries(state.cart)
    .filter(([, qty]) => qty > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([loc, qty]) => `${loc}=${qty}`)
    .join(", ");
  const short = [...state.short].sort((a, b) => a - b);
  return `cart: ${cart}` + (short.length ? `; short: ${short.join(", ")}` : "");
}

/** "check: 1=article, 2=ok, 3=?": the judgement of every tote, ? when not judged. */
export const serializeChecks = (verdicts: (Verdict | "")[]) => `check: ${verdicts.map((v, i) => `${i + 1}=${v || "?"}`).join(", ")}`;

/** `picked` read back: the roll cage and the shortages, or the judgements; undefined when it is not such a text. */
export function parsePicked(text: string): { cart?: Record<string, number>; short?: number[]; verdicts?: Record<number, Verdict> } | undefined {
  if (typeof text !== "string") return undefined;
  const parts = Object.fromEntries(
    text
      .split(";")
      .map((part) => part.split(":"))
      .filter((pair) => pair.length === 2)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()])
  ) as Record<string, string>;
  const items = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
  if ("check" in parts) {
    const verdicts: Record<number, Verdict> = {};
    for (const item of items(parts.check)) {
      const [line, verdict] = item.split("=").map((s) => s.trim());
      if (Number(line) >= 1 && (VERDICTS as readonly string[]).includes(verdict)) verdicts[Number(line)] = verdict as Verdict;
    }
    return { verdicts };
  }
  if (!("cart" in parts)) return undefined;
  const cart: Record<string, number> = {};
  for (const item of items(parts.cart)) {
    const [loc, qty] = item.split("=").map((s) => s.trim());
    const count = Number(qty);
    if (parseLocation(loc) && Number.isInteger(count) && count > 0) cart[normalLocation(loc)] = count;
  }
  const short = items(parts.short ?? "")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1);
  return { cart, short };
}

// ---- the warehouse as a setting (JSON), and the example ----

const clamp = (value: unknown, [min, max]: readonly [number, number], fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const text = (value: unknown, max = 60) => String(value ?? "").trim().slice(0, max);

/** The warehouse of the `warehouse` setting (JSON); undefined when it cannot be read or has no order lines. */
export function parseWarehouse(json: string): Warehouse | undefined {
  let raw: any;
  try {
    raw = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== "object") return undefined;
  const w = normalizeWarehouse(raw);
  return w.order.lines.length ? w : undefined;
}

/** A warehouse made sound: numbers within limits, locations in the layout, one product per location, lines with a product. */
export function normalizeWarehouse(raw: any): Warehouse {
  const layout: Layout = {
    aisles: clamp(raw.aisles, LIMITS.aisles, 3),
    depth: clamp(raw.depth, LIMITS.depth, 4),
    shelves: clamp(raw.shelves, LIMITS.shelves, 3),
    back: raw.back !== false,
  };
  const products: Product[] = [];
  for (const p of Array.isArray(raw.products) ? raw.products : []) {
    const loc = normalLocation(String(p?.loc ?? ""));
    if (!inLayout(layout, loc) || products.some((other) => other.loc === loc)) continue;
    products.push({
      loc,
      article: text(p.article, 20),
      name: text(p.name),
      unit: text(p.unit, 30),
      picture: (PICTURES as readonly string[]).includes(p.picture) ? p.picture : "box",
      stock: clamp(p.stock, [0, LIMITS.stock], 0),
    });
  }
  const w: Warehouse = { ...layout, products, order: { number: text(raw.order?.number, 20), for: text(raw.order?.for), lines: [] }, cart: [] };
  const lines = Array.isArray(raw.order?.lines) ? raw.order.lines : [];
  for (const line of lines.slice(0, LIMITS.lines)) {
    const loc = normalLocation(String(line?.loc ?? ""));
    if (productAt(w, loc)) w.order.lines.push({ loc, qty: clamp(line.qty, [1, LIMITS.qty], 1) });
  }
  const cart = Array.isArray(raw.cart) ? raw.cart : [];
  w.cart = w.order.lines.map((_, i) => {
    const tote = cart[i];
    const loc = normalLocation(String(tote?.loc ?? ""));
    return tote && productAt(w, loc) && Number(tote.qty) > 0 ? { loc, qty: clamp(tote.qty, [1, LIMITS.qty], 1) } : null;
  });
  return w;
}

/** The warehouse as the setting stores it. */
export const serializeWarehouse = (w: Warehouse) =>
  JSON.stringify({
    aisles: w.aisles,
    depth: w.depth,
    shelves: w.shelves,
    back: w.back,
    products: w.products,
    order: w.order,
    cart: w.cart,
  });

/** The warehouse of the settings: the author's, or else the example of a school warehouse in the PCI's language. */
export const warehouseFrom = (json: string | undefined, language: Language) => (json?.trim() && parseWarehouse(json)) || exampleWarehouse(language);

type ExampleProduct = [loc: string, article: string, en: string, nl: string, unitEn: string, unitNl: string, picture: Picture, stock: number];

/** A school warehouse (schoolmagazijn): office supplies in aisle A, cleaning and hygiene in B, canteen and spare parts in C. */
const EXAMPLE_PRODUCTS: ExampleProduct[] = [
  ["A-01-1", "10110", "Copy paper A4", "Kopieerpapier A4", "pack of 500", "pak van 500", "paper", 40],
  ["A-01-2", "10111", "Copy paper A3", "Kopieerpapier A3", "pack of 500", "pak van 500", "paper", 12],
  ["A-02-1", "10230", "Ballpoint pens, blue", "Balpennen blauw", "box of 10", "doos van 10", "pen", 25],
  ["A-02-2", "10231", "Ballpoint pens, red", "Balpennen rood", "box of 10", "doos van 10", "pen", 18],
  ["A-03-1", "10340", "Whiteboard markers", "Whiteboardstiften", "pack of 4", "pak van 4", "marker", 15],
  ["A-04-3", "10420", "Glue sticks", "Lijmstiften", "box of 12", "doos van 12", "glue", 8],
  ["A-05-2", "10510", "Notebooks A5", "Schriften A5", "pack of 10", "pak van 10", "notebook", 30],
  ["A-06-1", "10620", "Ring binders A4", "Ordners A4", "box of 5", "doos van 5", "binder", 10],
  ["A-07-2", "10750", "Scissors", "Scharen", "piece", "stuk", "scissors", 6],
  ["B-01-1", "20110", "Toilet paper", "Toiletpapier", "pack of 8 rolls", "pak van 8 rollen", "roll", 24],
  ["B-02-2", "20220", "Paper towels", "Papieren handdoekjes", "box of 20 packs", "doos van 20 pakjes", "towel", 14],
  ["B-03-1", "20310", "Hand soap 500 ml", "Handzeep 500 ml", "bottle", "fles", "bottle", 9],
  ["B-03-2", "20311", "Hand soap refill 1 l", "Handzeep navulling 1 l", "bottle", "fles", "bottle", 6],
  ["B-04-1", "20450", "Cleaning spray", "Schoonmaakspray", "bottle", "fles", "spray", 7],
  ["B-05-2", "20510", "Gloves, size M", "Handschoenen maat M", "box of 100", "doos van 100", "gloves", 11],
  ["B-05-3", "20511", "Gloves, size L", "Handschoenen maat L", "box of 100", "doos van 100", "gloves", 3],
  ["B-06-1", "20620", "Bin bags 60 l", "Vuilniszakken 60 l", "roll of 20", "rol van 20", "bag", 16],
  ["C-01-2", "30120", "Coffee cups", "Koffiebekers", "sleeve of 50", "slof van 50", "cup", 20],
  ["C-02-1", "30210", "Batteries AA", "Batterijen AA", "pack of 4", "pak van 4", "battery", 12],
  ["C-02-2", "30211", "Batteries AAA", "Batterijen AAA", "pack of 4", "pak van 4", "battery", 2],
  ["C-04-1", "30430", "Sticky tape", "Plakband", "pack of 8 rolls", "pak van 8 rollen", "tape", 10],
  ["C-06-2", "30630", "Toner, black", "Toner zwart", "box", "doos", "box", 4],
];

/**
 * The example: order 2041 for room 12. With the `stock` setting on, the batteries AAA run short (2 of 3 packs). The
 * roll cage of the check task has a wrong article (gloves L for M), a wrong quantity (2 packs of AAA for 3) and an
 * empty tote (the notebooks).
 */
export function exampleWarehouse(language: Language): Warehouse {
  const nl = language === "nl";
  return normalizeWarehouse({
    aisles: 3,
    depth: 4,
    shelves: 3,
    back: true,
    products: EXAMPLE_PRODUCTS.map(([loc, article, en, nlName, unitEn, unitNl, picture, stock]) => ({
      loc, article, name: nl ? nlName : en, unit: nl ? unitNl : unitEn, picture, stock,
    })),
    order: {
      number: "2041",
      for: nl ? "Lokaal 12" : "Room 12",
      lines: [
        { loc: "B-05-2", qty: 2 },
        { loc: "A-02-1", qty: 3 },
        { loc: "C-02-2", qty: 3 },
        { loc: "B-03-1", qty: 4 },
        { loc: "A-05-2", qty: 1 },
        { loc: "C-01-2", qty: 2 },
      ],
    },
    cart: [{ loc: "B-05-3", qty: 2 }, { loc: "A-02-1", qty: 3 }, { loc: "C-02-2", qty: 2 }, { loc: "B-03-1", qty: 4 }, null, { loc: "C-01-2", qty: 2 }],
  });
}

// ---- what is wrong with an author's warehouse ----

export type Problem =
  | { code: "noLines" }
  | { code: "emptyLocation"; line: number }
  | { code: "sameArticle"; line: number }
  | { code: "noArticle"; loc: string }
  | { code: "outside"; count: number }
  | { code: "emptyTote"; line: number }
  | { code: "nothingShort" }
  | { code: "noMistake" };

/**
 * What keeps the author's warehouse from working (the first five), and two notes: no line runs short with the
 * `stock` setting on, a check task whose roll cage has no mistakes. `raw` is the warehouse as the author made it,
 * before normalizeWarehouse drops what does not fit.
 */
export function warehouseProblems(raw: Warehouse, settings?: Settings): Problem[] {
  const problems: Problem[] = [];
  const outside = raw.products.filter((p) => !inLayout(raw, p.loc)).length;
  if (outside) problems.push({ code: "outside", count: outside });
  for (const p of raw.products) if (inLayout(raw, p.loc) && (!p.article.trim() || !p.name.trim())) problems.push({ code: "noArticle", loc: p.loc });
  if (!raw.order.lines.length) problems.push({ code: "noLines" });
  const seen = new Set<string>();
  raw.order.lines.forEach((line, i) => {
    const product = inLayout(raw, line.loc) ? productAt(raw, line.loc) : undefined;
    if (!product) return problems.push({ code: "emptyLocation", line: i + 1 });
    if (seen.has(product.article)) problems.push({ code: "sameArticle", line: i + 1 });
    seen.add(product.article);
  });
  raw.cart.forEach((tote, i) => {
    if (tote && i < raw.order.lines.length && !(inLayout(raw, tote.loc) && productAt(raw, tote.loc))) problems.push({ code: "emptyTote", line: i + 1 });
  });
  if (settings?.task === "pick" && settings.stock && !raw.order.lines.some((line) => isShort(raw, settings, line))) problems.push({ code: "nothingShort" });
  if (settings?.task === "check" && raw.order.lines.every((_, i) => toteVerdict(raw, i) === "ok")) problems.push({ code: "noMistake" });
  return problems;
}

/** Notes only inform the author; the other problems keep Done from finishing. */
export const isNote = (problem: Problem) => problem.code === "nothingShort" || problem.code === "noMistake";

/** A short fingerprint of the warehouse and the task: a saved state is only restored for the same one. */
export function layoutKey(w: Warehouse, settings: Settings): string {
  const source = `${settings.task}|${settings.stock}|${serializeWarehouse(w)}`;
  let hash = 5381;
  for (let i = 0; i < source.length; i++) hash = ((hash << 5) + hash + source.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}
