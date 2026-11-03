// The logic of the circuit builder, without a user interface: the parts and their terminals, the board and the item's
// circuit setting, the netlist the grid makes, the analysis (closed loops, series, parallel, polarity), the canonical
// topology and the author's checks. No imports: `npm test` runs it in node.
//
// A part fills one cell of the board. Its terminals lie on the middle of the cell's edges: N, E, S or W. A rotation
// turns the part clockwise in steps of 90°, so a resistor (W–E) at 90 runs N–S. The conventions are those of the
// Dutch exam interaction: a corner at 0 joins W and N (┘), a T at 0 joins W, E and N (┴), a transistor at 0 has its
// base W, collector N and emitter S.

export type Side = "N" | "E" | "S" | "W";
export type Rotation = 0 | 90 | 180 | 270;
export const SIDES: Side[] = ["N", "E", "S", "W"];

export type Kind = "wire" | "component" | "source";

export type Terminal = { side: Side; name: string };

export type PartDef = {
  kind: Kind;
  /** The terminals at rotation 0. */
  terminals: Terminal[];
  /** Wires only: which terminals are joined inside the piece (default: all of them). */
  groups?: string[][];
  /** Polar parts: the terminal the (conventional) current goes in and the one it comes out, when the part conducts
   *  or, for a source, inside the source (from − to +). */
  polar?: { in: string; out: string };
  /** The terminal pairs the analysis treats as a branch (default: the two terminals). */
  branches?: [string, string][];
};

const two = (a = "a", b = "b"): Terminal[] => [{ side: "W", name: a }, { side: "E", name: b }];
const component = (extra: Partial<PartDef> = {}): PartDef => ({ kind: "component", terminals: two(), ...extra });

export const PARTS = {
  wire: { kind: "wire", terminals: two() },
  corner: { kind: "wire", terminals: [{ side: "W", name: "a" }, { side: "N", name: "b" }] },
  tee: { kind: "wire", terminals: [{ side: "W", name: "a" }, { side: "E", name: "b" }, { side: "N", name: "c" }] },
  cross: { kind: "wire", terminals: [{ side: "N", name: "a" }, { side: "E", name: "b" }, { side: "S", name: "c" }, { side: "W", name: "d" }] },
  crossover: {
    kind: "wire",
    terminals: [{ side: "N", name: "a" }, { side: "E", name: "b" }, { side: "S", name: "c" }, { side: "W", name: "d" }],
    groups: [["a", "c"], ["b", "d"]],
  },
  resistor: component(),
  variableResistor: component(),
  lamp: component(),
  led: component({ terminals: two("anode", "cathode"), polar: { in: "anode", out: "cathode" } }),
  diode: component({ terminals: two("anode", "cathode"), polar: { in: "anode", out: "cathode" } }),
  switch: component(),
  pushButton: component(),
  buzzer: component(),
  motor: component(),
  ldr: component(),
  ntc: component(),
  fuse: component(),
  voltmeter: component(),
  ammeter: component(),
  cell: { kind: "source", terminals: two("plus", "minus"), polar: { in: "minus", out: "plus" } },
  battery: { kind: "source", terminals: two("plus", "minus"), polar: { in: "minus", out: "plus" } },
  dcSource: { kind: "source", terminals: two("plus", "minus"), polar: { in: "minus", out: "plus" } },
  acSource: { kind: "source", terminals: two() },
  transistor: {
    kind: "component",
    terminals: [{ side: "W", name: "base" }, { side: "N", name: "collector" }, { side: "S", name: "emitter" }],
    polar: { in: "collector", out: "emitter" },
    branches: [["collector", "emitter"], ["base", "emitter"]],
  },
} satisfies Record<string, PartDef>;

export type PartType = keyof typeof PARTS;
export const PART_TYPES = Object.keys(PARTS) as PartType[];
export const WIRE_TYPES = PART_TYPES.filter((t) => PARTS[t].kind === "wire");
export const COMPONENT_TYPES = PART_TYPES.filter((t) => PARTS[t].kind !== "wire");
export const SOURCE_TYPES = PART_TYPES.filter((t) => PARTS[t].kind === "source");
export const def = (type: PartType): PartDef => PARTS[type];
export const isPartType = (type: unknown): type is PartType => typeof type === "string" && Object.prototype.hasOwnProperty.call(PARTS, type);
export const isWire = (type: PartType) => def(type).kind === "wire";
export const isSource = (type: PartType) => def(type).kind === "source";

/** Names in the original Dutch interaction (schakelbordconfiguration) and other spellings, to our types. */
const ALIASES: Record<string, PartType> = {
  draad: "wire", draadh: "corner", draadt: "tee", draadkruis: "cross", draadhaak: "crossover", kruising: "crossover",
  straight: "wire", t: "tee", junction: "cross",
  weerstand: "resistor", variabeleweerstand: "variableResistor", regelweerstand: "variableResistor", lampje: "lamp",
  schakelaar: "switch", drukschakelaar: "pushButton", drukknop: "pushButton", zoemer: "buzzer", zekering: "fuse",
  batterij: "battery", gelijkspanningsbron: "dcSource", spanningsbron: "dcSource", wisselspanningsbron: "acSource",
  dc: "dcSource", ac: "acSource", voltmeter: "voltmeter", ampèremeter: "ammeter", amperemeter: "ammeter",
};
const LOWER = Object.fromEntries(PART_TYPES.map((t) => [t.toLowerCase(), t])) as Record<string, PartType>;
/** "LED", "draadT", "Resistor" → led, tee, resistor; null for what is not a part. */
export const partType = (name: unknown): PartType | null => {
  if (typeof name !== "string") return null;
  const key = name.trim().toLowerCase().replace(/[\s_-]/g, "");
  return LOWER[key] ?? ALIASES[key] ?? null;
};

export const rotation = (value: unknown): Rotation => {
  const n = Math.round(Number(value) / 90) * 90;
  return ((((Number.isFinite(n) ? n : 0) % 360) + 360) % 360) as Rotation;
};
export const rotateSide = (side: Side, by: Rotation): Side => SIDES[(SIDES.indexOf(side) + by / 90) % 4];

/** The terminals of a part as it lies on the board. */
export const terminalsOf = (type: PartType, turn: Rotation): Terminal[] =>
  def(type).terminals.map((t) => ({ name: t.name, side: rotateSide(t.side, turn) }));

/** Where an edge of a cell is, the same for both cells that share it: "v3,2" is the vertical edge left of cell (3,2). */
export const edgeKey = (x: number, y: number, side: Side) =>
  side === "W" ? `v${x},${y}` : side === "E" ? `v${x + 1},${y}` : side === "N" ? `h${x},${y}` : `h${x},${y + 1}`;

/** Some turns look the same: a straight wire at 180 is the one at 0. The rotations worth offering for a type. */
export const distinctRotations = (type: PartType): Rotation[] => {
  const seen = new Set<string>();
  return ([0, 90, 180, 270] as Rotation[]).filter((r) => {
    const d = def(type);
    const key = d.kind === "wire" && !d.groups ? terminalsOf(type, r).map((t) => t.side).sort().join("") : `${r}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// --- the board and the circuit setting (data-circuit)


/** A part on the board. Locked parts (preset by the author) cannot be moved, turned or removed by the candidate. */
export type Placed = { type: PartType; x: number; y: number; rotation: Rotation; locked?: boolean };
/** A part in the palette; count null: as many as the candidate likes. */
export type PaletteItem = { type: PartType; count: number | null };

export type Circuit = {
  columns: number;
  rows: number;
  /** What is on the board at the start: locked parts stay, the others the candidate may change. */
  preset: Placed[];
  palette: PaletteItem[];
  /** The author's solution: the parts on the board besides the locked ones (as a candidate would leave them). */
  solution: Placed[] | null;
  checks: Check[];
};

export const MIN_SIZE = 2;
export const MAX_SIZE = 16;
const size = (value: unknown, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, n)) : fallback;
};

export const key = (x: number, y: number) => `${x},${y}`;
export const inBounds = (c: { columns: number; rows: number }, x: number, y: number) => x >= 0 && y >= 0 && x < c.columns && y < c.rows;

/** A part from what an item or a response holds: ours ({x, y, type}) or the original's ({gridx, gridy, id}). */
const parsePlaced = (p: any): Placed | null => {
  if (!p || typeof p !== "object") return null;
  const type = partType(p.type ?? p.id);
  const x = Math.round(Number(p.x ?? p.gridx));
  const y = Math.round(Number(p.y ?? p.gridy));
  if (!type || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const placed: Placed = { type, x, y, rotation: rotation(p.rotation ?? 0) };
  if (p.locked) placed.locked = true;
  return placed;
};

/** Parts on a board of this size, one per cell (the first one wins), in reading order. */
export const parseParts = (list: unknown, bounds: { columns: number; rows: number }, locked?: boolean): Placed[] => {
  const items = Array.isArray(list) ? list : Array.isArray((list as any)?.Preset) ? (list as any).Preset : Array.isArray((list as any)?.parts) ? (list as any).parts : [];
  const seen = new Set<string>();
  const parts: Placed[] = [];
  for (const item of items) {
    const p = parsePlaced(item);
    if (!p || !inBounds(bounds, p.x, p.y) || seen.has(key(p.x, p.y))) continue;
    seen.add(key(p.x, p.y));
    if (locked !== undefined) {
      if (locked) p.locked = true;
      else delete p.locked;
    }
    parts.push(p);
  }
  return sortParts(parts);
};

export const sortParts = (parts: Placed[]) => [...parts].sort((a, b) => a.y - b.y || a.x - b.x);

/** "led:1 switch:1 wire corner" or [{type, count}] → palette items. */
export const parsePalette = (value: unknown): PaletteItem[] => {
  const items: unknown[] = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,;]+/).filter(Boolean) : [];
  const palette: PaletteItem[] = [];
  for (const item of items) {
    let type: PartType | null = null;
    let count: number | null = null;
    if (typeof item === "string") {
      const [name, n] = item.split(":");
      type = partType(name);
      count = n === undefined || n === "" ? null : Number(n);
    } else if (item && typeof item === "object") {
      type = partType((item as any).type);
      const n = (item as any).count;
      count = n === undefined || n === null || n === "" ? null : Number(n);
    }
    if (!type || palette.some((p) => p.type === type)) continue;
    palette.push({ type, count: count !== null && Number.isFinite(count) && count >= 0 ? Math.floor(count) : null });
  }
  return palette;
};
export const serializePalette = (palette: PaletteItem[]) => palette.map((p) => (p.count === null ? p.type : `${p.type}:${p.count}`)).join(" ");

/** The example: a DC source with wires; the candidate adds a switch in series and an LED and a buzzer in parallel. */
export const DEFAULT_CIRCUIT: Circuit = {
  columns: 7,
  rows: 5,
  preset: sortParts([
    { type: "corner", x: 1, y: 0, rotation: 180, locked: true },
    { type: "wire", x: 2, y: 0, rotation: 0, locked: true },
    { type: "corner", x: 1, y: 4, rotation: 90, locked: true },
    { type: "dcSource", x: 1, y: 2, rotation: 90, locked: true },
    { type: "wire", x: 2, y: 4, rotation: 0, locked: true },
  ]),
  palette: parsePalette("switch:1 led:1 buzzer:1 lamp:1 resistor:1 wire corner tee"),
  solution: sortParts([
    { type: "wire", x: 1, y: 1, rotation: 90 },
    { type: "wire", x: 1, y: 3, rotation: 90 },
    { type: "switch", x: 3, y: 0, rotation: 0 },
    { type: "tee", x: 4, y: 0, rotation: 180 },
    { type: "corner", x: 5, y: 0, rotation: 270 },
    { type: "led", x: 4, y: 2, rotation: 90 },
    { type: "buzzer", x: 5, y: 2, rotation: 90 },
    { type: "wire", x: 4, y: 1, rotation: 90 },
    { type: "wire", x: 5, y: 1, rotation: 90 },
    { type: "wire", x: 4, y: 3, rotation: 90 },
    { type: "wire", x: 5, y: 3, rotation: 90 },
    { type: "wire", x: 3, y: 4, rotation: 0 },
    { type: "tee", x: 4, y: 4, rotation: 0 },
    { type: "corner", x: 5, y: 4, rotation: 0 },
  ]),
  checks: [
    { type: "parts", count: { switch: 1, led: 1, buzzer: 1 }, exact: true, points: 1 },
    { type: "series", parts: ["switch", "source"], points: 1 },
    { type: "parallel", parts: ["led", "buzzer"], points: 1 },
    { type: "forward", parts: ["led"], points: 1 },
    { type: "closed", points: 1 },
  ],
};

/** data-circuit → the circuit; empty or unreadable: the example. */
export const parseCircuit = (text: string | undefined | null): Circuit => {
  if (!text || !String(text).trim()) return DEFAULT_CIRCUIT;
  let raw: any;
  try {
    raw = JSON.parse(String(text));
  } catch {
    return DEFAULT_CIRCUIT;
  }
  if (Array.isArray(raw)) raw = { preset: raw[0]?.Preset ? raw[0].Preset : raw }; // the original's configuration
  if (!raw || typeof raw !== "object") return DEFAULT_CIRCUIT;
  const columns = size(raw.columns, DEFAULT_CIRCUIT.columns);
  const rows = size(raw.rows, DEFAULT_CIRCUIT.rows);
  const bounds = { columns, rows };
  // a preset without any lock marks (the original's format) is locked as a whole
  const rawPreset = raw.preset ?? raw.Preset;
  const marked = Array.isArray(rawPreset) && rawPreset.some((p: any) => p && typeof p === "object" && "locked" in p);
  const presetParts = parseParts(rawPreset, bounds).map((p) => (marked ? p : { ...p, locked: true }));
  const lockedCells = new Set(presetParts.filter((p) => p.locked).map((p) => key(p.x, p.y)));
  const solution = raw.solution ? parseParts(raw.solution, bounds, false).filter((p) => !lockedCells.has(key(p.x, p.y))) : null;
  const palette = raw.palette === undefined ? parsePalette([...COMPONENT_TYPES, ...WIRE_TYPES]) : parsePalette(raw.palette);
  return { columns, rows, preset: presetParts, palette, solution, checks: parseChecks(raw.checks) };
};

const compact = (p: Placed) => ({ type: p.type, x: p.x, y: p.y, rotation: p.rotation, ...(p.locked ? { locked: true } : {}) });
export const serializeCircuit = (c: Circuit) =>
  JSON.stringify({
    columns: c.columns,
    rows: c.rows,
    preset: sortParts(c.preset).map(compact),
    palette: serializePalette(c.palette),
    ...(c.solution ? { solution: sortParts(c.solution).map(compact) } : {}),
    checks: c.checks,
  });

// --- the board the candidate works on: the locked parts of the item and their own parts

export const lockedParts = (c: Circuit) => c.preset.filter((p) => p.locked);
/** The parts the candidate starts with (the preset parts they may change). */
export const startParts = (c: Circuit) => c.preset.filter((p) => !p.locked).map(({ locked, ...p }) => p);
export const boardOf = (c: Circuit, parts: Placed[]): Placed[] => sortParts([...lockedParts(c), ...parts.filter((p) => !lockedParts(c).some((l) => l.x === p.x && l.y === p.y))]);

/** The candidate's parts from a board (a response or a saved state): what is in bounds and not on a locked cell. */
export const ownParts = (c: Circuit, board: unknown): Placed[] => {
  const locked = new Set(lockedParts(c).map((p) => key(p.x, p.y)));
  return parseParts(board, c, false).filter((p) => !locked.has(key(p.x, p.y)));
};

export const partAt = (parts: Placed[], x: number, y: number) => parts.find((p) => p.x === x && p.y === y);

/** How many more of a type the candidate may place: null for no limit. */
export const remaining = (c: Circuit, parts: Placed[], type: PartType): number | null => {
  const item = c.palette.find((p) => p.type === type);
  if (!item) return 0;
  if (item.count === null) return null;
  return Math.max(0, item.count - parts.filter((p) => p.type === type).length);
};

/** The response's board: every part, the locked ones marked, as JSON. Its size goes along so a rater can draw it. */
export const serializeBoard = (c: Circuit, parts: Placed[]) =>
  JSON.stringify({ columns: c.columns, rows: c.rows, parts: boardOf(c, parts).map(compact) });

/** Places, moves, turns and removes the candidate's parts; null when that cannot be done. */
export const place = (c: Circuit, parts: Placed[], type: PartType, x: number, y: number, turn: Rotation = 0, ignoreLimit = false): Placed[] | null => {
  if (!inBounds(c, x, y) || partAt(lockedParts(c), x, y)) return null;
  const rest = parts.filter((p) => !(p.x === x && p.y === y));
  if (!ignoreLimit) {
    const left = remaining(c, rest, type);
    if (left !== null && left < 1) return null;
  }
  return sortParts([...rest, { type, x, y, rotation: turn }]);
};
export const move = (c: Circuit, parts: Placed[], from: { x: number; y: number }, to: { x: number; y: number }): Placed[] | null => {
  const part = partAt(parts, from.x, from.y);
  if (!part || !inBounds(c, to.x, to.y) || partAt(lockedParts(c), to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y) return parts;
  const other = partAt(parts, to.x, to.y);
  // onto another part: they swap places
  return sortParts(parts.map((p) => (p === part ? { ...p, x: to.x, y: to.y } : p === other ? { ...p, x: from.x, y: from.y } : p)));
};
export const rotate = (parts: Placed[], x: number, y: number, by: Rotation = 90): Placed[] | null => {
  const part = partAt(parts, x, y);
  if (!part) return null;
  return parts.map((p) => (p === part ? { ...p, rotation: rotation(p.rotation + by) } : p));
};
export const remove = (parts: Placed[], x: number, y: number): Placed[] | null => {
  const part = partAt(parts, x, y);
  return part ? parts.filter((p) => p !== part) : null;
};

export const sameParts = (a: Placed[], b: Placed[]) => JSON.stringify(sortParts(a).map(compact)) === JSON.stringify(sortParts(b).map(compact));

// --- the netlist: from the grid to nodes and branches

/** A component on the board with the node of each of its terminals. */
export type Element = { index: number; type: PartType; x: number; y: number; nodes: Record<string, number> };
/** A terminal (a wire end or a component's) with nothing on the other side of its edge. */
export type OpenEnd = { x: number; y: number; side: Side };
export type Netlist = {
  elements: Element[];
  /** How many nodes: the elements' terminals use 0 … nodes-1; wires only join them and are no element. */
  nodes: number;
  openEnds: OpenEnd[];
  /** Edges of cells (edgeKey) where two terminals meet. */
  joints: string[];
  /** The node of every terminal edge (edgeKey), -1 for a wire network no component touches. */
  edgeNode: Record<string, number>;
};

export const buildNetlist = (parts: Placed[]): Netlist => {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = k;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const add = (k: string) => { if (!parent.has(k)) parent.set(k, k); };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  const uses = new Map<string, number>();
  const ends: { x: number; y: number; side: Side; edge: string }[] = [];
  for (const p of parts) {
    const terminals = terminalsOf(p.type, p.rotation);
    const at = (name: string) => edgeKey(p.x, p.y, terminals.find((t) => t.name === name)!.side);
    for (const t of terminals) {
      const edge = edgeKey(p.x, p.y, t.side);
      add(edge);
      uses.set(edge, (uses.get(edge) ?? 0) + 1);
      ends.push({ x: p.x, y: p.y, side: t.side, edge });
    }
    const d = def(p.type);
    if (d.kind === "wire") {
      const groups = d.groups ?? [d.terminals.map((t) => t.name)];
      for (const g of groups) for (const name of g.slice(1)) union(at(g[0]), at(name));
    }
  }
  const nodeOf = new Map<string, number>();
  const elements: Element[] = [];
  for (const p of parts) {
    if (isWire(p.type)) continue;
    const nodes: Record<string, number> = {};
    for (const t of terminalsOf(p.type, p.rotation)) {
      const root = find(edgeKey(p.x, p.y, t.side));
      if (!nodeOf.has(root)) nodeOf.set(root, nodeOf.size);
      nodes[t.name] = nodeOf.get(root)!;
    }
    elements.push({ index: elements.length, type: p.type, x: p.x, y: p.y, nodes });
  }
  const edgeNode: Record<string, number> = {};
  for (const e of ends) edgeNode[e.edge] = nodeOf.get(find(e.edge)) ?? -1;
  return {
    elements,
    nodes: nodeOf.size,
    openEnds: ends.filter((e) => uses.get(e.edge) === 1).map(({ x, y, side }) => ({ x, y, side })),
    joints: [...uses.entries()].filter(([, n]) => n > 1).map(([k]) => k),
    edgeNode,
  };
};

// --- the analysis: which branches carry current, what is in series and parallel, polarity

/** A two-terminal path through an element (a transistor has two: collector–emitter and base–emitter). */
type Branch = { id: number; element: number; a: number; b: number };

const branchesOf = (net: Netlist): Branch[] => {
  const list: Branch[] = [];
  for (const e of net.elements) {
    const d = def(e.type);
    const pairs = d.branches ?? [[d.terminals[0].name, d.terminals[1].name] as [string, string]];
    for (const [p, q] of pairs) list.push({ id: list.length, element: e.index, a: e.nodes[p], b: e.nodes[q] });
  }
  return list;
};
/** The main branch of an element: the one series, parallel and polarity are about. */
const mainBranch = (branches: Branch[], element: number) => branches.find((b) => b.element === element)!;

/** Biconnected blocks (Hopcroft–Tarjan, on branch ids so parallel branches count): block number per branch. */
const blocks = (nodes: number, branches: Branch[]): number[] => {
  const adj: { to: number; id: number }[][] = Array.from({ length: nodes }, () => []);
  for (const br of branches) {
    if (br.a === br.b) continue; // short-circuited: in no loop with anything
    adj[br.a].push({ to: br.b, id: br.id });
    adj[br.b].push({ to: br.a, id: br.id });
  }
  const block = branches.map(() => -1);
  const disc = new Array(nodes).fill(-1);
  const low = new Array(nodes).fill(0);
  const stack: number[] = [];
  let time = 0;
  let count = 0;
  const visit = (u: number, viaEdge: number) => {
    disc[u] = low[u] = time++;
    for (const { to, id } of adj[u]) {
      if (id === viaEdge) continue;
      if (disc[to] === -1) {
        stack.push(id);
        visit(to, id);
        low[u] = Math.min(low[u], low[to]);
        if (low[to] >= disc[u]) {
          let e: number;
          do {
            e = stack.pop()!;
            block[e] = count;
          } while (e !== id);
          count++;
        }
      } else if (disc[to] < disc[u]) {
        stack.push(id);
        low[u] = Math.min(low[u], disc[to]);
      }
    }
  };
  for (let u = 0; u < nodes; u++) if (disc[u] === -1) visit(u, -1);
  return block;
};

/** Whether a and b are connected over the branches, leaving out some branches and some nodes. */
const connected = (nodes: number, branches: Branch[], a: number, b: number, skip: Set<number>, avoid: Set<number> = new Set()) => {
  if (a === b) return true;
  const seen = new Set<number>([a]);
  const queue = [a];
  while (queue.length) {
    const u = queue.shift()!;
    for (const br of branches) {
      if (skip.has(br.id)) continue;
      const v = br.a === u ? br.b : br.b === u ? br.a : -1;
      if (v < 0 || seen.has(v) || avoid.has(v)) continue;
      if (v === b) return true;
      seen.add(v);
      queue.push(v);
    }
  }
  return false;
};

export type Analysis = {
  net: Netlist;
  /** Elements that are sources. */
  sources: number[];
  /** Sources whose terminals are joined by wires only (short circuit). */
  shorted: number[];
  /** Per element: in a closed loop with a source, so current can flow through it (switches closed). */
  live: boolean[];
  /** Whether two elements are in series: all the current through one goes through the other. */
  series: (i: number, j: number) => boolean;
  /** Whether two elements are connected across the same two nodes. */
  parallel: (i: number, j: number) => boolean;
  /** For a polar element: does it point with the current of the source (the main source by default)? null: no loop
   *  through both, or the source is not polar. */
  forward: (i: number, source?: number) => boolean | null;
  /** The source the polarity is measured against: the first polar source on the board (DC source first). */
  mainSource: number | null;
};

const SOURCE_ORDER: PartType[] = ["dcSource", "battery", "cell", "acSource"];

export const analyze = (parts: Placed[]): Analysis => {
  const net = buildNetlist(parts);
  const branches = branchesOf(net);
  const block = blocks(net.nodes, branches);
  const sources = net.elements.filter((e) => isSource(e.type)).map((e) => e.index);
  const shorted = sources.filter((s) => { const b = mainBranch(branches, s); return b.a === b.b; });
  const sourceBlocks = new Set(sources.filter((s) => !shorted.includes(s)).map((s) => block[mainBranch(branches, s).id]));
  const live = net.elements.map((e) => {
    if (sources.includes(e.index)) return !shorted.includes(e.index) && branches.some((b) => b.element !== e.index && block[b.id] === block[mainBranch(branches, e.index).id]);
    return branches.some((b) => b.element === e.index && b.a !== b.b && sourceBlocks.has(block[b.id]));
  });

  const series = (i: number, j: number) => {
    if (i === j) return false;
    const e = mainBranch(branches, i), f = mainBranch(branches, j);
    if (e.a === e.b || f.a === f.b || block[e.id] !== block[f.id] || block[e.id] < 0) return false;
    // every loop through e also goes through f: without e, f is a bridge
    const skip = new Set(branches.filter((b) => b.element === i || b.id === f.id).map((b) => b.id));
    return !connected(net.nodes, branches, f.a, f.b, skip);
  };
  const parallel = (i: number, j: number) => {
    if (i === j) return false;
    const e = mainBranch(branches, i), f = mainBranch(branches, j);
    return e.a !== e.b && ((e.a === f.a && e.b === f.b) || (e.a === f.b && e.b === f.a));
  };
  const polarSources = SOURCE_ORDER.flatMap((t) => sources.filter((s) => net.elements[s].type === t && def(t).polar));
  const mainSource = polarSources.find((s) => !shorted.includes(s)) ?? polarSources[0] ?? null;

  const forward = (i: number, source: number | null = mainSource) => {
    if (source === null || source === i) return null;
    const pe = def(net.elements[i].type).polar, ps = def(net.elements[source].type).polar;
    if (!pe || !ps) return null;
    const plus = net.elements[source].nodes[ps.out], minus = net.elements[source].nodes[ps.in];
    const inNode = net.elements[i].nodes[pe.in], outNode = net.elements[i].nodes[pe.out];
    const skip = new Set(branches.filter((b) => b.element === i || b.element === source).map((b) => b.id));
    if (plus === minus || inNode === outNode) return null;
    // a simple loop + … from → to … − (and through the source back to +): a path + … from that keeps clear of to
    // and −, and then a path to … − that keeps clear of the first one
    const loop = (from: number, to: number) =>
      findPath(branches, plus, from, skip, new Set([to, minus]), (path) => connected(net.nodes, branches, to, minus, skip, path));
    if (loop(inNode, outNode)) return true;
    if (loop(outNode, inNode)) return false;
    return null;
  };
  return { net, sources, shorted, live, series, parallel, forward, mainSource };
};

/** Looks for a simple path from a to b over the branches (not the skipped ones, not through the forbidden nodes) for
 *  which test() holds; stops at the first, or after a limit (a board has a few dozen nodes at most). */
const findPath = (branches: Branch[], a: number, b: number, skip: Set<number>, forbidden: Set<number>, test: (path: Set<number>) => boolean) => {
  if (forbidden.has(a) || forbidden.has(b)) return false;
  let budget = 20000;
  const path = new Set<number>([a]);
  const walk = (u: number): boolean => {
    if (budget-- < 0) return false;
    if (u === b) return test(path);
    for (const br of branches) {
      if (skip.has(br.id)) continue;
      const v = br.a === u ? br.b : br.b === u ? br.a : -1;
      if (v < 0 || path.has(v) || forbidden.has(v)) continue;
      path.add(v);
      if (walk(v)) return true;
      path.delete(v);
    }
    return false;
  };
  return walk(a);
};

// --- the topology: the circuit without its layout, the same wherever and however the parts lie

/** How a component is written in the topology: polar as in>out, others with their nodes sorted. */
const termsOf = (e: Element, label: (n: number) => number) => {
  const d = def(e.type);
  if (e.type === "transistor") return `b${label(e.nodes.base)},c${label(e.nodes.collector)},e${label(e.nodes.emitter)}`;
  if (d.polar) return `${label(e.nodes[d.polar.in])}>${label(e.nodes[d.polar.out])}`;
  return d.terminals.map((t) => label(e.nodes[t.name])).sort((x, y) => x - y).join("-");
};

/**
 * The canonical netlist: every component as type(nodes), sorted, with the nodes numbered so the text is the smallest
 * possible. "buzzer(1-2) dcSource(3>1) led(1>2) switch(2-3)". Wires are no part of it: they only make nodes. Two
 * boards with the same circuit give the same text, wherever the parts lie and however the wires run.
 */
export const topology = (parts: Placed[]): string => {
  const net = buildNetlist(parts);
  const { elements, nodes } = net;
  if (!elements.length) return "";
  // colour refinement: a node's colour is what touches it, then what touches that, …
  const incident: { e: Element; role: string }[][] = Array.from({ length: nodes }, () => []);
  for (const e of elements) {
    const d = def(e.type);
    for (const t of d.terminals) {
      incident[e.nodes[t.name]].push({ e, role: t.name });
    }
  }
  let colour = new Array(nodes).fill(0);
  for (let round = 0; round <= nodes; round++) {
    const signature = incident.map((list, n) =>
      `${colour[n]}|` + list.map(({ e, role: at }) => `${e.type}.${roleName(e, at)}:` +
        Object.entries(e.nodes).filter(([name]) => name !== at).map(([name, m]) => `${roleName(e, name)}${colour[m]}`).sort().join(",")).sort().join(";"));
    const order = [...new Set(signature)].sort();
    const next = signature.map((s) => order.indexOf(s));
    const stable = new Set(next).size === new Set(colour).size;
    colour = next;
    if (stable && round > 0) break;
  }
  // order the nodes by colour; within a colour every order is tried (as long as there are not too many)
  const classes = new Map<number, number[]>();
  for (let n = 0; n < nodes; n++) classes.set(colour[n], [...(classes.get(colour[n]) ?? []), n]);
  const groups = [...classes.entries()].sort((a, b) => a[0] - b[0]).map(([, members]) => members);
  const write = (order: number[]) => {
    const label = new Array(nodes);
    order.forEach((n, i) => (label[n] = i + 1));
    return elements.map((e) => `${e.type}(${termsOf(e, (n) => label[n])})`).sort().join(" ");
  };
  let best: string | null = null;
  let budget = 40320;
  // a class too big to try every order of keeps the order it has (the text is then still the same for the same board)
  let tries = 1;
  const options = groups.map((g) => {
    const f = factorial(g.length);
    if (g.length > 8 || tries * f > budget) return [g];
    tries *= f;
    return permutations(g);
  });
  const permute = (g: number, prefix: number[]) => {
    if (budget <= 0) return;
    if (g === groups.length) {
      budget--;
      const text = write(prefix);
      if (best === null || text < best) best = text;
      return;
    }
    for (const p of options[g]) permute(g + 1, [...prefix, ...p]);
  };
  permute(0, []);
  return best ?? "";
};

const roleName = (e: Element, terminal: string) => (def(e.type).polar || e.type === "transistor" ? terminal : "t");
const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
const permutations = (list: number[]): number[][] =>
  list.length <= 1 ? [list] : list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((p) => [x, ...p]));

// --- the checks: what the author wants of the circuit, each worth points

/** A part in a check: a type, or "source" for any source. */
export type PartRef = PartType | "source";
export type Check =
  /** The board has these components (locked ones included); exact: no more of them, and no other components than
   *  these and the locked ones. The rubric's "right symbols". */
  | { type: "parts"; count: Partial<Record<PartRef, number>>; exact?: boolean; points?: number }
  /** A closed, working circuit: a source that is not short-circuited, every component in a loop with a source (switches
   *  closed), none short-circuited; and no open wire ends, unless allowOpenEnds. */
  | { type: "closed"; allowOpenEnds?: boolean; points?: number }
  /** These parts are in series with each other (all the current through one goes through the others). */
  | { type: "series"; parts: PartRef[]; points?: number }
  /** These parts are connected across the same two points. */
  | { type: "parallel"; parts: PartRef[]; points?: number }
  /** Every one of these polar parts (LED, diode, battery, cell) points with the current of the source. */
  | { type: "forward"; parts: PartRef[]; points?: number }
  /** The same circuit as the author's solution, however it is laid out. */
  | { type: "solution"; points?: number };
export type CheckType = Check["type"];
export const CHECK_TYPES: CheckType[] = ["parts", "closed", "series", "parallel", "forward", "solution"];
/** The response has a field per check, check1 … check8. */
export const MAX_CHECKS = 8;

const partRef = (value: unknown): PartRef | null => {
  if (typeof value === "string" && value.trim().toLowerCase() === "source") return "source";
  return partType(value);
};
const points = (value: unknown) => {
  const n = Math.round(Number(value ?? 1));
  return Number.isFinite(n) && n >= 0 ? n : 1;
};
export const pointsOf = (check: Check) => points(check.points);

/** data-circuit's checks → checks; what cannot be read is left out, at most MAX_CHECKS. */
export const parseChecks = (value: unknown): Check[] => {
  const list = Array.isArray(value) ? value : [];
  const checks: Check[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const p = points(raw.points);
    const refs = (Array.isArray(raw.parts) ? raw.parts : typeof raw.parts === "string" ? raw.parts.split(/[\s,]+/) : []).map(partRef).filter(Boolean) as PartRef[];
    switch (raw.type) {
      case "parts": {
        const source = raw.count ?? raw.parts ?? {};
        const count: Partial<Record<PartRef, number>> = {};
        if (Array.isArray(source) || typeof source === "string") {
          for (const r of refs) count[r] = (count[r] ?? 0) + 1;
        } else if (typeof source === "object") {
          for (const [name, n] of Object.entries(source)) {
            const r = partRef(name);
            const k = Math.round(Number(n));
            if (r && Number.isFinite(k) && k >= 0) count[r] = k;
          }
        }
        checks.push({ type: "parts", count, ...(raw.exact ? { exact: true } : {}), points: p });
        break;
      }
      case "closed":
        checks.push({ type: "closed", ...(raw.allowOpenEnds ? { allowOpenEnds: true } : {}), points: p });
        break;
      case "series":
      case "parallel":
      case "forward":
        checks.push({ type: raw.type, parts: refs, points: p });
        break;
      case "solution":
        checks.push({ type: "solution", points: p });
        break;
    }
  }
  return checks.slice(0, MAX_CHECKS);
};

const matches = (type: PartType, ref: PartRef) => (ref === "source" ? isSource(type) : type === ref);

/** Distinct elements for the refs (one each) for which every pair holds; backtracking over the few there are. */
const assign = (elements: Element[], refs: PartRef[], pair: (i: number, j: number) => boolean) => {
  const chosen: number[] = [];
  const go = (k: number): boolean => {
    if (k === refs.length) return true;
    for (const e of elements) {
      if (!matches(e.type, refs[k]) || chosen.includes(e.index)) continue;
      if (!chosen.every((c) => pair(c, e.index))) continue;
      chosen.push(e.index);
      if (go(k + 1)) return true;
      chosen.pop();
    }
    return false;
  };
  return go(0);
};

export type CheckResult = { check: Check; passed: boolean };
export type Evaluation = {
  results: CheckResult[];
  /** The points of the passed checks; maxscore: of all checks. */
  score: number;
  maxscore: number;
  /** Every check passed (and there is at least one). */
  correct: boolean;
  topology: string;
  analysis: Analysis;
  /** The circuit is closed and working (as the closed check sees it, open ends allowed). */
  closed: boolean;
};

const isClosed = (a: Analysis, allowOpenEnds: boolean) =>
  a.sources.length > 0 &&
  a.shorted.length === 0 &&
  a.net.elements.length > a.sources.length &&
  a.live.every(Boolean) &&
  (allowOpenEnds || a.net.openEnds.length === 0);

export const runCheck = (check: Check, c: Circuit, board: Placed[], a: Analysis, topo: () => string): boolean => {
  const elements = a.net.elements;
  switch (check.type) {
    case "parts": {
      const entries = Object.entries(check.count) as [PartRef, number][];
      if (!entries.length) return false;
      const counts = entries.map(([ref, n]) => [elements.filter((e) => matches(e.type, ref)).length, n]);
      if (!check.exact) return counts.every(([have, want]) => have >= want);
      const lockedTypes = new Set(lockedParts(c).map((p) => p.type));
      const others = elements.filter((e) => !entries.some(([ref]) => matches(e.type, ref)) && !lockedTypes.has(e.type));
      return counts.every(([have, want]) => have === want) && others.length === 0;
    }
    case "closed":
      return isClosed(a, !!check.allowOpenEnds);
    case "series":
      return check.parts.length >= 2 && assign(elements, check.parts, a.series);
    case "parallel":
      return check.parts.length >= 2 && assign(elements, check.parts, a.parallel);
    case "forward": {
      if (!check.parts.length) return false;
      return check.parts.every((ref) => {
        const found = elements.filter((e) => matches(e.type, ref) && e.index !== a.mainSource);
        return found.length > 0 && found.every((e) => a.forward(e.index) === true);
      });
    }
    case "solution":
      return !!c.solution && topo() === topology(boardOf(c, c.solution));
  }
};

/** The checks of the circuit on a board (the locked parts and the candidate's), with the score. */
export const evaluate = (c: Circuit, parts: Placed[]): Evaluation => {
  const board = boardOf(c, parts);
  const analysis = analyze(board);
  const topo = topology(board);
  const results = c.checks.map((check) => ({ check, passed: runCheck(check, c, board, analysis, () => topo) }));
  const score = results.reduce((s, r) => s + (r.passed ? pointsOf(r.check) : 0), 0);
  const maxscore = c.checks.reduce((s, check) => s + pointsOf(check), 0);
  return { results, score, maxscore, correct: results.length > 0 && results.every((r) => r.passed), topology: topo, analysis, closed: isClosed(analysis, true) };
};
