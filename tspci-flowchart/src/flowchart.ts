// The flowchart model: cards, blocks (nodes) and arrows (edges); the chart the candidate starts with per mode, the
// canonical graph (the same text for every layout), the checks and the outline a screen reader reads.
// No imports: `npm test` runs this file in node as it is.

export type Shape = "start" | "end" | "step" | "decision" | "io";
export const SHAPES: Shape[] = ["start", "end", "step", "decision", "io"];
export type Label = "yes" | "no";
export const LABELS: Label[] = ["yes", "no"];
export type Mode = "order" | "complete" | "free";
export const MODES: Mode[] = ["order", "complete", "free"];
export type TextSource = "cards" | "typed" | "both";
export const TEXT_SOURCES: TextSource[] = ["cards", "typed", "both"];

/** A card with a text the candidate can put in a block. `distractor`: not in the solution of order mode. */
export type Card = { id: string; text: string; shape?: Shape; distractor?: boolean };

/**
 * A block on the grid (x: column, y: row, from 0). A locked block is part of the question (its id is its name in the
 * graph); a slot is a locked place the candidate fills with a card (or typed text). Other blocks are the candidate's.
 */
export type FNode = { id: string; shape: Shape; x: number; y: number; card?: string; text?: string; locked?: boolean; slot?: boolean };
/** An arrow; the exits of a decision carry yes or no. Locked arrows are part of the question. */
export type Edge = { from: string; to: string; label?: Label; locked?: boolean };
export type Chart = { nodes: FNode[]; edges: Edge[] };

export type Check =
  | { type: "same"; points?: number }
  | { type: "before"; a: string; b: string; points?: number }
  | { type: "branch"; decision: string; label: Label; target: string; direct?: boolean; points?: number }
  | { type: "cards"; cards?: string[]; exact?: boolean; points?: number }
  | { type: "startEnd"; points?: number }
  | { type: "deadEnds"; points?: number }
  | { type: "decisions"; points?: number };
export type CheckType = Check["type"];
export const CHECK_TYPES: CheckType[] = ["same", "before", "branch", "cards", "startEnd", "deadEnds", "decisions"];
export const MAX_CHECKS = 8;
export const MAX_CARDS = 24;
export const MAX_SIZE = 12;
export const MIN_SIZE = 1;

export type Settings = {
  mode: Mode;
  /** Where the text of a block comes from: the cards, typed by the candidate, or both. */
  text: TextSource;
  cards: Card[];
  /** The grid; it grows when blocks lie further out. */
  columns: number;
  rows: number;
  /** The chart the candidate starts with (complete and free mode): locked blocks, slots and locked arrows. */
  chart: Chart;
  /** The answer (complete and free mode); order mode: the cards in their order, without the distractors. */
  solution: Chart | null;
  /** Complete mode: the candidate may draw and remove arrows (besides the locked ones). */
  arrows: boolean;
  /** Show the cards in a mixed order (the same for everyone), so their order gives nothing away. */
  shuffle: boolean;
  checks: Check[];
};

// --- the example: hand hygiene before and after care (complete mode)

const EXAMPLE_CARDS: Card[] = [
  { id: "c1", text: "Clean your hands with hand alcohol" },
  { id: "c2", text: "Put on disposable gloves" },
  { id: "c3", text: "Write down what you did in the care file" },
  { id: "c4", text: "Put on your coat", distractor: true },
];
const EXAMPLE_CHART: Chart = {
  nodes: [
    { id: "start", shape: "start", x: 0, y: 0, locked: true, text: "Start" },
    { id: "s1", shape: "step", x: 0, y: 1, locked: true, slot: true },
    { id: "contact", shape: "decision", x: 0, y: 2, locked: true, text: "Contact with body fluids possible?" },
    { id: "s2", shape: "step", x: 0, y: 3, locked: true, slot: true },
    { id: "care", shape: "step", x: 0, y: 4, locked: true, text: "Give the care" },
    { id: "s3", shape: "step", x: 0, y: 5, locked: true, slot: true },
    { id: "end", shape: "end", x: 0, y: 6, locked: true, text: "End" },
  ],
  edges: [
    { from: "start", to: "s1", locked: true },
    { from: "s1", to: "contact", locked: true },
    { from: "contact", to: "s2", label: "yes", locked: true },
    { from: "contact", to: "care", label: "no", locked: true },
    { from: "s2", to: "care", locked: true },
    { from: "care", to: "s3", locked: true },
    { from: "s3", to: "end", locked: true },
  ],
};
const fill = (chart: Chart, cards: Record<string, string>): Chart => ({
  nodes: chart.nodes.map((n) => (cards[n.id] ? { ...n, card: cards[n.id] } : n)),
  edges: chart.edges,
});

export const DEFAULT_SETTINGS: Settings = {
  mode: "complete",
  text: "cards",
  cards: EXAMPLE_CARDS,
  columns: 2,
  rows: 7,
  chart: EXAMPLE_CHART,
  solution: fill(EXAMPLE_CHART, { s1: "c1", s2: "c2", s3: "c3" }),
  arrows: false,
  shuffle: true,
  checks: [
    { type: "before", a: "c1", b: "care", points: 1 },
    { type: "branch", decision: "contact", label: "yes", target: "c2", points: 1 },
    { type: "before", a: "care", b: "c3", points: 1 },
  ],
};

// --- reading the settings

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
export const isShape = (v: unknown): v is Shape => SHAPES.includes(v as Shape);
const label = (v: unknown): Label | undefined => {
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "yes" || s === "ja" || s === "y" || s === "true") return "yes";
  if (s === "no" || s === "nee" || s === "n" || s === "false") return "no";
  return undefined;
};
const idOf = (v: unknown) => String(v ?? "").trim().replace(/[^\w.-]/g, "").slice(0, 40);
const textOf = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 120) : "");

export const parseCards = (value: unknown): Card[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const cards: Card[] = [];
  value.forEach((c: any, i) => {
    const raw = typeof c === "string" ? { text: c } : c ?? {};
    let id = idOf(raw.id) || `c${i + 1}`;
    while (seen.has(id)) id = `${id}_`;
    const text = textOf(raw.text);
    if (!text || cards.length >= MAX_CARDS) return;
    seen.add(id);
    const card: Card = { id, text };
    if (isShape(raw.shape) && raw.shape !== "step") card.shape = raw.shape;
    if (raw.distractor) card.distractor = true;
    cards.push(card);
  });
  return cards;
};

/** Blocks and arrows as given: unknown shapes become steps, arrows need two different, existing blocks. */
export const parseChart = (value: any, cards: Card[], locked = false): Chart => {
  const nodes: FNode[] = [];
  const ids = new Set<string>();
  const cells = new Set<string>();
  const used = new Set<string>();
  for (const raw of Array.isArray(value?.nodes) ? value.nodes : []) {
    const id = idOf(raw?.id);
    const x = clampInt(raw?.x, 0, MAX_SIZE * 2, -1), y = clampInt(raw?.y, 0, MAX_SIZE * 2, -1);
    if (!id || ids.has(id) || x < 0 || y < 0 || cells.has(`${x},${y}`)) continue;
    const node: FNode = { id, shape: isShape(raw.shape) ? raw.shape : "step", x, y };
    const card = cards.find((c) => c.id === raw.card);
    if (card && !used.has(card.id)) {
      node.card = card.id;
      used.add(card.id);
    } else if (textOf(raw.text)) node.text = textOf(raw.text);
    if (raw.slot) node.slot = true;
    if (raw.locked || raw.slot || locked) node.locked = true;
    ids.add(id);
    cells.add(`${x},${y}`);
    nodes.push(node);
  }
  const edges: Edge[] = [];
  for (const raw of Array.isArray(value?.edges) ? value.edges : []) {
    const from = idOf(raw?.from), to = idOf(raw?.to);
    if (!ids.has(from) || !ids.has(to) || from === to || edges.some((e) => e.from === from && e.to === to)) continue;
    const edge: Edge = { from, to };
    const l = label(raw.label);
    if (l) edge.label = l;
    if (raw.locked || locked) edge.locked = true;
    edges.push(edge);
  }
  return { nodes, edges };
};

const parseCheck = (raw: any): Check | null => {
  const points = clampInt(raw?.points ?? 1, 0, 100, 1);
  switch (raw?.type) {
    case "same": case "startEnd": case "deadEnds": case "decisions":
      return { type: raw.type, points };
    case "before": {
      const a = idOf(raw.a), b = idOf(raw.b);
      return a && b ? { type: "before", a, b, points } : null;
    }
    case "branch": {
      const decision = idOf(raw.decision), target = idOf(raw.target);
      if (!decision || !target) return null;
      const check: Check = { type: "branch", decision, label: label(raw.label) ?? "yes", target, points };
      if (raw.direct === false) check.direct = false;
      return check;
    }
    case "cards": {
      const check: Check = { type: "cards", points };
      if (Array.isArray(raw.cards)) check.cards = raw.cards.map(idOf).filter(Boolean);
      if (raw.exact) check.exact = true;
      return check;
    }
  }
  return null;
};
export const parseChecks = (value: unknown): Check[] =>
  (Array.isArray(value) ? value : []).map(parseCheck).filter((c): c is Check => !!c).slice(0, MAX_CHECKS);

/** data-flowchart: JSON written by the authoring mode; empty or broken: the example. */
export const parseSettings = (text: unknown): Settings => {
  if (typeof text !== "string" || !text.trim()) return DEFAULT_SETTINGS;
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
  const cards = parseCards(raw.cards);
  const mode: Mode = MODES.includes(raw.mode) ? raw.mode : cards.length && !raw.chart ? "order" : "complete";
  const chart = parseChart(raw.chart, cards, true);
  const solution = raw.solution ? parseChart(raw.solution, cards) : null;
  return {
    mode,
    text: TEXT_SOURCES.includes(raw.text) ? raw.text : "cards",
    cards,
    columns: clampInt(raw.columns, MIN_SIZE, MAX_SIZE, mode === "free" ? 3 : 2),
    rows: clampInt(raw.rows, 2, MAX_SIZE, 7),
    chart,
    solution: solution && solution.nodes.length ? alignSolution(chart, solution) : null,
    arrows: mode === "free" ? true : !!raw.arrows,
    shuffle: raw.shuffle !== false,
    checks: parseChecks(raw.checks),
  };
};

/** The locked blocks and arrows of a solution are those of the chart (the author may have changed the chart later). */
export const alignSolution = (chart: Chart, solution: Chart): Chart => {
  const fills = new Map(solution.nodes.map((n) => [n.id, n]));
  const nodes = chart.nodes.map((n) => {
    if (!n.slot) return n;
    const f = fills.get(n.id);
    return f && (f.card || f.text) ? { ...n, ...(f.card ? { card: f.card } : { text: f.text }) } : n;
  });
  const cells = new Set(nodes.map((n) => `${n.x},${n.y}`));
  for (const n of solution.nodes) {
    if (nodes.some((m) => m.id === n.id) || cells.has(`${n.x},${n.y}`)) continue;
    const { locked: _l, slot: _s, ...rest } = n;
    nodes.push(rest);
    cells.add(`${n.x},${n.y}`);
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges = [...chart.edges];
  for (const e of solution.edges) {
    if (!ids.has(e.from) || !ids.has(e.to) || edges.some((x) => x.from === e.from && x.to === e.to)) continue;
    const { locked: _, ...rest } = e;
    edges.push(rest);
  }
  return { nodes, edges };
};

export const serializeSettings = (s: Settings): string => {
  const out: any = { mode: s.mode, text: s.text, cards: s.cards, columns: s.columns, rows: s.rows };
  if (s.mode !== "order") {
    out.chart = s.chart;
    if (s.solution) out.solution = s.solution;
  }
  if (s.mode === "complete" && s.arrows) out.arrows = true;
  if (!s.shuffle) out.shuffle = false;
  out.checks = s.checks;
  return JSON.stringify(out);
};

// --- the chart per mode

/** Order mode: start, a slot per card of the solution, end, one under the other (a new column after `rows`). */
export const orderChart = (s: Settings): Chart => {
  const count = s.cards.filter((c) => !c.distractor).length;
  const ids = ["start", ...Array.from({ length: count }, (_, i) => `s${i + 1}`), "end"];
  const rows = Math.max(2, s.rows);
  const nodes: FNode[] = ids.map((id, i) => ({
    id, x: Math.floor(i / rows), y: i % rows, locked: true,
    shape: id === "start" ? "start" : id === "end" ? "end" : "step",
    ...(id === "start" || id === "end" ? {} : { slot: true }),
  }));
  const edges: Edge[] = ids.slice(1).map((id, i) => ({ from: ids[i], to: id, locked: true }));
  return { nodes, edges };
};

/** What the candidate sees at the start. */
export const baseChart = (s: Settings): Chart => (s.mode === "order" ? orderChart(s) : s.chart);

/** The author's answer: order mode fills the slots with the cards in their order. */
export const solutionChart = (s: Settings): Chart | null => {
  if (s.mode !== "order") return s.solution;
  const base = orderChart(s);
  const cards = s.cards.filter((c) => !c.distractor);
  if (!cards.length) return null;
  return fill(base, Object.fromEntries(cards.map((c, i) => [`s${i + 1}`, c.id])));
};

/** The candidate may add blocks (free mode) and draw arrows (free mode, complete mode with arrows). */
export const canAddBlocks = (s: Settings) => s.mode === "free";
export const canDrawArrows = (s: Settings) => s.mode === "free" || (s.mode === "complete" && s.arrows);
export const usesCards = (s: Settings) => s.text !== "typed" && s.cards.length > 0;
export const usesTyping = (s: Settings) => s.text !== "cards" || s.cards.length === 0;

/**
 * A chart from a state, a response or anywhere else, made to fit the item: the locked blocks and arrows as the author
 * made them, the slots filled as saved, the candidate's own blocks and arrows only where the mode allows them, every
 * card at most once.
 */
export const ownChart = (s: Settings, saved: any): Chart => {
  const base = baseChart(s);
  const parsed = parseChart(saved, s.cards);
  // a slot's fill needs only the id (a response may leave the place out)
  const fills = new Map<string, FNode>();
  for (const raw of Array.isArray(saved?.nodes) ? saved.nodes : []) {
    const id = idOf(raw?.id);
    if (!id || fills.has(id)) continue;
    const card = s.cards.some((c) => c.id === raw.card) ? raw.card : undefined;
    fills.set(id, { id, shape: "step", x: 0, y: 0, ...(card ? { card } : textOf(raw.text) ? { text: textOf(raw.text) } : {}) });
  }
  const used = new Set<string>();
  const take = (n: FNode | undefined) => {
    if (!n) return {};
    if (n.card && usesCards(s) && !used.has(n.card)) {
      used.add(n.card);
      return { card: n.card };
    }
    return n.text && usesTyping(s) ? { text: n.text } : {};
  };
  const nodes: FNode[] = base.nodes.map((n) => {
    if (!n.slot) return n;
    const { card: _c, text: _t, ...rest } = n;
    return { ...rest, ...take(fills.get(n.id)) };
  });
  if (canAddBlocks(s)) {
    const cells = new Set(nodes.map((n) => `${n.x},${n.y}`));
    for (const n of parsed.nodes) {
      if (nodes.some((m) => m.id === n.id) || cells.has(`${n.x},${n.y}`)) continue;
      nodes.push({ id: n.id, shape: n.shape, x: n.x, y: n.y, ...take(n) });
      cells.add(`${n.x},${n.y}`);
    }
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges = [...base.edges];
  if (canDrawArrows(s)) {
    for (const e of parsed.edges) {
      if (!ids.has(e.from) || !ids.has(e.to) || edges.some((x) => x.from === e.from && x.to === e.to)) continue;
      edges.push({ from: e.from, to: e.to, ...(e.label ? { label: e.label } : {}) });
    }
  }
  return { nodes, edges };
};

/** The chart as JSON with its layout, the same for the same chart (the chart field of the response, the state). */
export const serializeChart = (c: Chart): string =>
  JSON.stringify({
    nodes: [...c.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((n) => {
      const out: any = { id: n.id, shape: n.shape, x: n.x, y: n.y };
      if (n.card) out.card = n.card;
      else if (n.text) out.text = n.text;
      if (n.slot) out.slot = true;
      if (n.locked) out.locked = true;
      return out;
    }),
    edges: [...c.edges].sort((a, b) => edgeOrder(a).localeCompare(edgeOrder(b))).map((e) => {
      const out: any = { from: e.from, to: e.to };
      if (e.label) out.label = e.label;
      if (e.locked) out.locked = true;
      return out;
    }),
  });
const edgeOrder = (e: Edge) => `${e.from}>${e.to}`;
export const sameChart = (a: Chart, b: Chart) => serializeChart(a) === serializeChart(b);

// --- the graph without its layout

/** Text as it counts in the graph: lower case, single spaces, without quotes and the characters the format uses. */
export const normText = (text: string) => text.toLowerCase().replace(/["|,;>:/]/g, "").replace(/\s+/g, " ").trim();

/**
 * The name of a block in the graph: its card's id, the id of a locked block, its typed text in quotes, start or end
 * for an empty start or end block, ? for an empty block.
 */
export const nodeRef = (n: FNode): string => {
  if (n.card) return n.card;
  if (n.locked && !n.slot) return n.id;
  if (n.text && normText(n.text)) return `"${normText(n.text)}"`;
  if (n.shape === "start" || n.shape === "end") return n.shape;
  return "?";
};

/** The name with its shape when that is not the expected one (a card's shape, else a step; start and end are names). */
export const nodeKey = (s: Settings, n: FNode): string => {
  const ref = nodeRef(n);
  if (n.locked && !n.slot) return ref;
  if (ref === "start" || ref === "end") return ref;
  const expected = n.card ? s.cards.find((c) => c.id === n.card)?.shape ?? "step" : "step";
  return n.shape === expected ? ref : `${ref}/${n.shape}`;
};

/**
 * The canonical graph: the blocks by name, sorted, then the arrows as from>to (with :yes or :no), sorted.
 * "c1,c2,care,contact,end,start|c1>contact;contact>c2:yes;…". The same for every layout of the same chart.
 */
export const canonical = (s: Settings, c: Chart): string => {
  const key = new Map(c.nodes.map((n) => [n.id, nodeKey(s, n)]));
  const nodes = c.nodes.map((n) => key.get(n.id)!).sort();
  const edges = c.edges
    .filter((e) => key.has(e.from) && key.has(e.to))
    .map((e) => `${key.get(e.from)}>${key.get(e.to)}${e.label ? `:${e.label}` : ""}`)
    .sort();
  return `${nodes.join(",")}|${edges.join(";")}`;
};

export type ParsedGraph = { nodes: { key: string; ref: string; shape?: Shape }[]; edges: { from: string; to: string; label?: Label }[] };

/** A canonical graph back as names and arrows (null when it is not one). */
export const parseCanonical = (text: unknown): ParsedGraph | null => {
  if (typeof text !== "string" || !text.includes("|")) return null;
  const [left, right = ""] = text.split("|");
  const nodes = left.split(",").map((k) => k.trim()).filter(Boolean).map((key) => {
    const slash = key.lastIndexOf("/");
    const shape = slash > 0 && isShape(key.slice(slash + 1)) ? (key.slice(slash + 1) as Shape) : undefined;
    return { key, ref: shape ? key.slice(0, slash) : key, ...(shape ? { shape } : {}) };
  });
  const edges = right.split(";").map((e) => e.trim()).filter(Boolean).flatMap((e) => {
    const m = /^(.+?)>(.+?)(?::(yes|no))?$/.exec(e);
    return m ? [{ from: m[1], to: m[2], ...(m[3] ? { label: m[3] as Label } : {}) }] : [];
  });
  return { nodes, edges };
};

/**
 * A canonical graph (a correct response, a MATCH_CORRECT response) as a chart of this item: locked blocks by their
 * id, slots filled with the card that fits their arrows best, the rest as new blocks (free mode) placed by `place`.
 */
export const chartFromCanonical = (s: Settings, text: string, place: (c: Chart) => Chart): Chart | null => {
  const g = parseCanonical(text);
  if (!g) return null;
  const base = baseChart(s);
  const nodes = base.nodes.map((n) => ({ ...n }));
  const lockedKeys = new Set(nodes.filter((n) => n.locked && !n.slot).map((n) => n.id));
  const free = g.nodes.filter((n) => !lockedKeys.has(n.key) && n.ref !== "?");
  const refOfNode = (id: string) => {
    const n = nodes.find((m) => m.id === id);
    return n && n.locked && !n.slot ? n.id : n?.card ?? (n?.text ? `"${normText(n.text)}"` : null);
  };
  const assign = (slot: FNode, ref: string) => {
    if (s.cards.some((c) => c.id === ref)) slot.card = ref;
    else if (/^".*"$/.test(ref)) slot.text = ref.slice(1, -1);
  };
  const slots = nodes.filter((n) => n.slot);
  // fill the slots in passes: each time the slot and the name whose arrows agree best with the arrows of the slot
  for (let pass = 0; pass < slots.length; pass++) {
    let best: { slot: FNode; ref: string; score: number } | null = null;
    for (const slot of slots.filter((n) => !n.card && !n.text)) {
      for (const cand of free) {
        if (nodes.some((n) => n.card === cand.ref || (n.text && `"${normText(n.text)}"` === cand.ref))) continue;
        let score = 0;
        for (const e of base.edges) {
          if (e.from === slot.id) {
            const other = refOfNode(e.to);
            if (other && g.edges.some((x) => x.from.replace(/\/\w+$/, "") === cand.ref && x.to.replace(/\/\w+$/, "") === other)) score += 2;
          }
          if (e.to === slot.id) {
            const other = refOfNode(e.from);
            if (other && g.edges.some((x) => x.to.replace(/\/\w+$/, "") === cand.ref && x.from.replace(/\/\w+$/, "") === other)) score += 2;
          }
        }
        if (!best || score > best.score) best = { slot, ref: cand.ref, score };
      }
    }
    if (!best || best.score <= 0) break;
    assign(best.slot, best.ref);
  }
  const chart: Chart = { nodes, edges: [...base.edges] };
  // the names not in a slot or a locked block: new blocks (where the mode allows them)
  const idOfKey = new Map<string, string>();
  for (const n of nodes) if (nodeRef(n) !== "?") idOfKey.set(nodeKey(s, n), n.id);
  if (canAddBlocks(s)) {
    let i = 1;
    const fresh: FNode[] = [];
    for (const n of g.nodes) {
      if (idOfKey.has(n.key) || n.ref === "?") continue;
      while (nodes.some((m) => m.id === `n${i}`) || fresh.some((m) => m.id === `n${i}`)) i++;
      const card = s.cards.find((c) => c.id === n.ref);
      const node: FNode = {
        id: `n${i}`, x: -1, y: -1,
        shape: n.shape ?? (n.ref === "start" || n.ref === "end" ? n.ref : card?.shape ?? "step"),
      };
      if (card) node.card = card.id;
      else if (/^".*"$/.test(n.ref)) node.text = n.ref.slice(1, -1);
      fresh.push(node);
      idOfKey.set(n.key, node.id);
    }
    chart.nodes = [...nodes, ...fresh];
  }
  for (const e of g.edges) {
    const from = idOfKey.get(e.from), to = idOfKey.get(e.to);
    if (!from || !to || from === to || chart.edges.some((x) => x.from === from && x.to === to)) continue;
    if (!canDrawArrows(s)) continue;
    chart.edges.push({ from, to, ...(e.label ? { label: e.label } : {}) });
  }
  return chart.nodes.some((n) => n.x < 0) ? place(chart) : chart;
};

// --- the checks

export type CheckResult = { check: Check; passed: boolean };
export type Evaluation = { results: CheckResult[]; score: number; maxscore: number; correct: boolean; graph: string };

const startsOf = (c: Chart) => {
  const starts = c.nodes.filter((n) => n.shape === "start");
  return starts.length ? starts : c.nodes.filter((n) => !c.edges.some((e) => e.to === n.id)).slice(0, 1);
};
/** The blocks reachable from `from` (included), not passing `without`. */
export const reachable = (c: Chart, from: string[], without: string[] = []): Set<string> => {
  const seen = new Set<string>();
  const queue = from.filter((id) => !without.includes(id));
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of c.edges) if (e.from === id && !without.includes(e.to) && !seen.has(e.to)) queue.push(e.to);
  }
  return seen;
};
const byRef = (c: Chart, ref: string) => c.nodes.filter((n) => nodeRef(n) === ref);

/** Card or block `a` comes before `b`: `b` can be reached from the start, and every way there passes `a`. */
const before = (c: Chart, a: string, b: string) => {
  const as = byRef(c, a), bs = byRef(c, b);
  if (!as.length || !bs.length || a === b) return false;
  const starts = startsOf(c).map((n) => n.id);
  const all = reachable(c, starts);
  const without = reachable(c, starts, as.map((n) => n.id));
  return bs.every((nb) => all.has(nb.id) && !without.has(nb.id));
};

const passes = (s: Settings, c: Chart, check: Check, solution: Chart | null): boolean => {
  switch (check.type) {
    case "same":
      return !!solution && canonical(s, c) === canonical(s, solution);
    case "before":
      return before(c, check.a, check.b);
    case "branch": {
      const ds = byRef(c, check.decision);
      return ds.some((d) => c.edges.some((e) => {
        if (e.from !== d.id || e.label !== check.label) return false;
        const target = c.nodes.find((n) => n.id === e.to);
        if (!target) return false;
        if (check.direct !== false) return nodeRef(target) === check.target;
        return [...reachable(c, [target.id], [d.id])].some((id) => nodeRef(c.nodes.find((n) => n.id === id)!) === check.target);
      }));
    }
    case "cards": {
      const required = check.cards?.length ? check.cards : s.cards.filter((x) => !x.distractor).map((x) => x.id);
      const used = new Set(c.nodes.map((n) => n.card).filter(Boolean));
      if (!required.every((id) => used.has(id))) return false;
      return !check.exact || [...used].every((id) => required.includes(id!));
    }
    case "startEnd": {
      const starts = c.nodes.filter((n) => n.shape === "start"), ends = c.nodes.filter((n) => n.shape === "end");
      if (starts.length !== 1 || ends.length !== 1) return false;
      const [st, en] = [starts[0].id, ends[0].id];
      return !c.edges.some((e) => e.to === st) && c.edges.some((e) => e.from === st) && !c.edges.some((e) => e.from === en) && c.edges.some((e) => e.to === en);
    }
    case "deadEnds": {
      const ends = c.nodes.filter((n) => n.shape === "end").map((n) => n.id);
      const starts = c.nodes.filter((n) => n.shape === "start").map((n) => n.id);
      if (!ends.length || !starts.length) return false;
      const fromStart = reachable(c, starts);
      return c.nodes.every((n) => {
        if (!fromStart.has(n.id)) return false;
        if (n.shape !== "end" && !c.edges.some((e) => e.from === n.id)) return false;
        return ends.some((end) => reachable(c, [n.id]).has(end));
      });
    }
    case "decisions":
      return c.nodes.filter((n) => n.shape === "decision").every((d) => {
        const out = c.edges.filter((e) => e.from === d.id);
        return out.length === 2 && out.some((e) => e.label === "yes") && out.some((e) => e.label === "no");
      });
  }
};

/** The checks of the item for a chart; without checks of its own: the same graph as the solution. */
export const effectiveChecks = (s: Settings): Check[] => (s.checks.length ? s.checks : solutionChart(s) ? [{ type: "same", points: 1 }] : []);

export const evaluate = (s: Settings, c: Chart): Evaluation => {
  const solution = solutionChart(s);
  const results = effectiveChecks(s).map((check) => ({ check, passed: passes(s, c, check, solution) }));
  const score = results.reduce((sum, r) => sum + (r.passed ? r.check.points ?? 1 : 0), 0);
  const maxscore = results.reduce((sum, r) => sum + (r.check.points ?? 1), 0);
  return { results, score, maxscore, correct: results.length > 0 && results.every((r) => r.passed), graph: canonical(s, c) };
};

// --- the flow as text

export type OutlineItem = {
  id: string;
  /** Number of the block in reading order (1, 2, …). */
  n: number;
  label?: Label;
  /** Already read: the outline goes on there ("continues at 4"). */
  ref?: boolean;
  children: OutlineItem[];
};

/**
 * The flow as a tree for reading aloud: from each start block, depth first, the yes exit before the no exit. A block
 * is read once; when an arrow comes back to it, the item only refers to it. Blocks no arrow from a start reaches come
 * last, each as a start of its own.
 */
export const outline = (c: Chart): OutlineItem[] => {
  const numbers = new Map<string, number>();
  const exits = (id: string) => {
    const out = c.edges.filter((e) => e.from === id);
    const rank = (e: Edge) => (e.label === "yes" ? 0 : e.label === "no" ? 1 : 2);
    return out.sort((a, b) => rank(a) - rank(b));
  };
  const visit = (id: string, label?: Label): OutlineItem => {
    if (numbers.has(id)) return { id, n: numbers.get(id)!, ref: true, children: [], ...(label ? { label } : {}) };
    numbers.set(id, numbers.size + 1);
    const item: OutlineItem = { id, n: numbers.get(id)!, children: [], ...(label ? { label } : {}) };
    item.children = exits(id).map((e) => visit(e.to, e.label));
    return item;
  };
  const roots: OutlineItem[] = [];
  const order = [...c.nodes].sort((a, b) => a.x - b.x || a.y - b.y);
  for (const n of startsOf(c)) if (!numbers.has(n.id)) roots.push(visit(n.id));
  for (const n of order.filter((m) => !c.edges.some((e) => e.to === m.id))) if (!numbers.has(n.id)) roots.push(visit(n.id));
  for (const n of order) if (!numbers.has(n.id)) roots.push(visit(n.id));
  return roots;
};

/** A seeded mix of the cards, the same every time for the same cards; never the original order when there is another. */
export const mixed = <T extends { id: string }>(items: T[]): T[] => {
  if (items.length < 2) return items;
  let seed = 0;
  for (const ch of items.map((i) => i.id).join("|")) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.every((x, i) => x === items[i])) out.push(out.shift()!);
  return out;
};
