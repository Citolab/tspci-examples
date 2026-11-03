// The product, its parts and the rules of the order, without imports (tested in node: test/assembly.test.ts).
// A part has an assembled position ("at") and a start position ("start", the exploded view). Its prerequisites
// ("after") make a directed acyclic graph: a part can only be placed after the parts it needs. In disassembly the
// rules turn round: a part can only come off when nothing that needs it is still on.

export type Shape = "box" | "cylinder" | "tube" | "ring" | "hex" | "screw" | "cone" | "sphere";
export const SHAPES: Shape[] = ["box", "cylinder", "tube", "ring", "hex", "screw", "cone", "sphere"];
/** What the numbers of `size` mean, per shape (texts.ts names them). */
export const SIZE_FIELDS: Record<Shape, ("width" | "height" | "depth" | "radius" | "inner" | "length" | "thickness")[]> = {
  box: ["width", "height", "depth"],
  cylinder: ["radius", "length"],
  tube: ["radius", "inner", "length"],
  ring: ["radius", "thickness"],
  hex: ["radius", "length"],
  screw: ["radius", "length"],
  cone: ["radius", "length"],
  sphere: ["radius"],
};
const DEFAULT_SIZE: Record<Shape, number[]> = {
  box: [1, 1, 1], cylinder: [0.3, 1], tube: [0.5, 0.25, 0.2], ring: [0.5, 0.15], hex: [0.4, 0.3], screw: [0.08, 0.6], cone: [0.4, 0.6], sphere: [0.3],
};

/** Materials, not codes: a part is always named in text as well. */
export const COLORS = {
  wood: 0xd6a467, lightWood: 0xecd2ac, darkWood: 0x8f5f36, steel: 0xaab4bf, darkSteel: 0x5f6b78, brass: 0xc9a23f,
  white: 0xf2f1ec, grey: 0x8c939c, black: 0x2c3038, brown: 0x8b5a2b, blue: 0x2f6db5, yellowGreen: 0xa4c21f,
  red: 0xc0392b, orange: 0xe08a1e,
} as const;
export type ColorName = keyof typeof COLORS;
export const COLOR_NAMES = Object.keys(COLORS) as ColorName[];

export type Vec = [number, number, number];
export type Text = string | { en?: string; nl?: string };

export type Part = {
  /** a QTI identifier: it goes into the response */
  id: string;
  name: Text;
  shape: Shape;
  size: number[];
  color: ColorName;
  /** where it is in the assembled product */
  at: Vec;
  /** where it lies before assembly (and after disassembly); without one, pushed out from the middle */
  start?: Vec;
  /** a turn in degrees around x, y and z (the shapes stand along y) */
  turn?: Vec;
  /** more of the same shape, as offsets from `at` (two hinges, four screws) */
  copies?: Vec[];
  /** the parts that must be in place first */
  after: string[];
};

export type Task = "assemble" | "disassemble";
export type Feedback = "block" | "record" | "none";
export type Scoring = "pci" | "list" | "string";
export const TASKS: Task[] = ["assemble", "disassemble"];
export const FEEDBACKS: Feedback[] = ["block", "record", "none"];
export const SCORINGS: Scoring[] = ["pci", "list", "string"];

export type Points = { valid: number; complete: number; first: number; penalty: number };

export type Assembly = {
  /** an example it started from (cabinet, hub, plug), or "" */
  example: string;
  title: Text;
  parts: Part[];
  task: Task;
  feedback: Feedback;
  scoring: Scoring;
  /** the author's correct order, as an assembly order (a disassembly is its reverse); empty: the first valid order */
  order: string[];
  /** check: the first part of the candidate's order ("" for none); in disassembly the first part off */
  first: string;
  points: Points;
  /** an optional glTF file whose meshes (by name: the part id) replace the shapes */
  gltf: string;
};

export const MAX_PARTS = 24;
export const ID = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

// ------------------------------------------------------------ the examples

const p = (id: string, en: string, nl: string, shape: Shape, size: number[], color: ColorName, at: Vec, start: Vec, after: string[], extra: Partial<Part> = {}): Part =>
  ({ id, name: { en, nl }, shape, size, color, at, start, after, ...extra });

/** A small cabinet: the base, two sides, the back panel, a shelf, the top, two hinges, the door, its screws and a knob. */
const cabinet: Part[] = [
  p("base", "Base", "Bodem", "box", [6, 0.3, 3.6], "wood", [0, 0.15, 0], [0, -1.6, 1.5], []),
  p("sideLeft", "Left side", "Linkerzijkant", "box", [0.3, 6.4, 3.6], "wood", [-2.85, 3.5, 0], [-7, 3.5, 0], ["base"]),
  p("sideRight", "Right side", "Rechterzijkant", "box", [0.3, 6.4, 3.6], "wood", [2.85, 3.5, 0], [7, 3.5, 0], ["base"]),
  p("back", "Back panel", "Achterwand", "box", [5.4, 6.4, 0.12], "lightWood", [0, 3.5, -1.74], [0, 3.5, -6], ["sideLeft", "sideRight"]),
  p("shelf", "Shelf", "Legplank", "box", [5.4, 0.25, 3.3], "wood", [0, 3.5, 0.1], [-4, 9.5, 2.5], ["sideLeft", "sideRight"]),
  p("top", "Top", "Bovenblad", "box", [6, 0.3, 3.6], "wood", [0, 6.85, 0], [0, 11.5, -1], ["sideLeft", "sideRight", "back"]),
  p("hinges", "Hinges", "Scharnieren", "cylinder", [0.12, 0.8], "darkSteel", [2.9, 1.6, 1.88], [6.5, 1.6, 5], ["sideRight"], { copies: [[0, 3.8, 0]] }),
  p("door", "Door", "Deur", "box", [5.9, 6.4, 0.2], "darkWood", [0, 3.5, 1.92], [0, 3.5, 7.5], ["hinges"]),
  p("screws", "Hinge screws", "Scharnierschroeven", "screw", [0.07, 0.5], "steel", [2.6, 1.3, 2.1], [4.5, 0.8, 9.5], ["door"],
    { turn: [90, 0, 0], copies: [[0, 0.6, 0], [0, 3.8, 0], [0, 4.4, 0]] }),
  p("knob", "Knob", "Knop", "sphere", [0.28], "brass", [-2.3, 3.5, 2.2], [-4.5, 3.5, 9.5], ["door"]),
];

/** A bicycle wheel hub along x: the shell, two bearings, the axle, two cones, two washers and two lock nuts. */
const hub: Part[] = [
  p("shell", "Hub shell", "Naafhuls", "tube", [1.1, 0.62, 4.6], "steel", [0, 0, 0], [0, -3, 0], [], { turn: [0, 0, 90] }),
  p("bearingLeft", "Left bearing", "Linkerlager", "ring", [0.62, 0.17], "darkSteel", [-2.1, 0, 0], [-4.5, -2.6, 0], ["shell"], { turn: [0, 0, 90] }),
  p("bearingRight", "Right bearing", "Rechterlager", "ring", [0.62, 0.17], "darkSteel", [2.1, 0, 0], [4.5, -2.6, 0], ["shell"], { turn: [0, 0, 90] }),
  p("axle", "Axle", "As", "cylinder", [0.22, 8.4], "grey", [0, 0, 0], [0, 3, 0], ["bearingLeft", "bearingRight"], { turn: [0, 0, 90] }),
  p("coneLeft", "Left cone", "Linkerconus", "cone", [0.62, 0.55], "steel", [-2.55, 0, 0], [-5.6, 0.2, 0], ["axle"], { turn: [0, 0, -90] }),
  p("coneRight", "Right cone", "Rechterconus", "cone", [0.62, 0.55], "steel", [2.55, 0, 0], [5.6, 0.2, 0], ["axle"], { turn: [0, 0, 90] }),
  p("washerLeft", "Left washer", "Linkersluitring", "tube", [0.55, 0.24, 0.12], "steel", [-3.0, 0, 0], [-6.8, 1.4, 0], ["coneLeft"], { turn: [0, 0, 90] }),
  p("washerRight", "Right washer", "Rechtersluitring", "tube", [0.55, 0.24, 0.12], "steel", [3.0, 0, 0], [6.8, 1.4, 0], ["coneRight"], { turn: [0, 0, 90] }),
  p("nutLeft", "Left lock nut", "Linkerborgmoer", "hex", [0.55, 0.42], "darkSteel", [-3.3, 0, 0], [-7.8, 2.6, 0], ["washerLeft"], { turn: [0, 0, 90] }),
  p("nutRight", "Right lock nut", "Rechterborgmoer", "hex", [0.55, 0.42], "darkSteel", [3.3, 0, 0], [7.8, 2.6, 0], ["washerRight"], { turn: [0, 0, 90] }),
];

/** A mains plug: the base with the pins, the cable, three wires, the terminal screws, the strain relief, the cover. */
const plug: Part[] = [
  p("base", "Base with pins", "Onderkant met pennen", "box", [3, 0.8, 3.6], "white", [0, 0.4, 0], [0, -2, 2], []),
  p("cable", "Cable", "Snoer", "cylinder", [0.32, 3.4], "black", [0, 0.95, -2.6], [0, 0.95, -7], ["base"], { turn: [90, 0, 0] }),
  p("brownWire", "Brown wire (live)", "Bruine draad (fase)", "cylinder", [0.1, 1.6], "brown", [-0.7, 1.0, 0], [-3.6, 2.2, 0], ["cable"], { turn: [90, 0, 0] }),
  p("blueWire", "Blue wire (neutral)", "Blauwe draad (nul)", "cylinder", [0.1, 1.6], "blue", [0.7, 1.0, 0], [3.6, 2.2, 0], ["cable"], { turn: [90, 0, 0] }),
  p("earthWire", "Yellow-green wire (earth)", "Geelgroene draad (aarde)", "cylinder", [0.1, 1.2], "yellowGreen", [0, 1.0, 0.4], [0, 2.6, 3.4], ["cable"], { turn: [90, 0, 0] }),
  p("terminalScrews", "Terminal screws", "Klemschroeven", "screw", [0.08, 0.45], "brass", [-0.7, 1.2, 0.75], [-3.4, 3.4, 3.2], ["brownWire", "blueWire", "earthWire"],
    { copies: [[1.4, 0, 0], [0.7, 0, 0.25]] }),
  p("strainRelief", "Strain relief clamp", "Trekontlasting", "box", [1.5, 0.22, 0.55], "grey", [0, 1.32, -1.3], [3.6, 3.2, -3], ["cable"]),
  p("clampScrews", "Clamp screws", "Schroefjes trekontlasting", "screw", [0.07, 0.5], "steel", [-0.55, 1.4, -1.3], [3.6, 4.6, -4.4], ["strainRelief"],
    { copies: [[1.1, 0, 0]] }),
  p("cover", "Cover", "Kap", "box", [3, 0.7, 3.6], "white", [0, 1.85, 0], [0, 6.4, 0], ["terminalScrews", "clampScrews"]),
  p("coverScrew", "Cover screw", "Schroef van de kap", "screw", [0.09, 1.6], "steel", [0, 1.6, 0.3], [0, 8.6, 1.6], ["cover"]),
];

export const EXAMPLES: Record<string, { title: Text; parts: Part[] }> = {
  cabinet: { title: { en: "Small cabinet", nl: "Kastje" }, parts: cabinet },
  hub: { title: { en: "Bicycle wheel hub", nl: "Fietsnaaf" }, parts: hub },
  plug: { title: { en: "Mains plug", nl: "Stekker" }, parts: plug },
};
export const EXAMPLE_IDS = Object.keys(EXAMPLES);

export const DEFAULT_POINTS: Points = { valid: 2, complete: 1, first: 1, penalty: 0 };

export const exampleAssembly = (example: string): Assembly => {
  const id = EXAMPLES[example] ? example : "cabinet";
  return {
    example: id, title: EXAMPLES[id].title, parts: EXAMPLES[id].parts.map((x) => clonePart(x)), task: "assemble", feedback: "block", scoring: "pci",
    order: [], first: "", points: { ...DEFAULT_POINTS }, gltf: "",
  };
};

export const clonePart = (x: Part): Part => JSON.parse(JSON.stringify(x));

// ------------------------------------------------------------ parsing

const num = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const vec = (v: unknown, fallback: Vec): Vec => (Array.isArray(v) ? [num(v[0], fallback[0]), num(v[1], fallback[1]), num(v[2], fallback[2])] : fallback);
const oneOf = <T extends string>(v: unknown, options: T[], fallback: T): T => {
  const s = String(v ?? "").trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === s) ?? fallback;
};
const text = (v: unknown): Text => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const out: { en?: string; nl?: string } = {};
    if (typeof o.en === "string") out.en = o.en;
    if (typeof o.nl === "string") out.nl = o.nl;
    return out;
  }
  return "";
};

export const parsePart = (raw: any, index: number): Part | null => {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id ?? `part${index + 1}`).trim();
  const shape = oneOf(raw.shape, SHAPES, "box");
  const size = SIZE_FIELDS[shape].map((_, i) => Math.max(0.01, num(Array.isArray(raw.size) ? raw.size[i] : undefined, DEFAULT_SIZE[shape][i])));
  const part: Part = {
    id,
    name: text(raw.name) || id,
    shape,
    size,
    color: oneOf(raw.color, COLOR_NAMES, "wood"),
    at: vec(raw.at, [0, 0, 0]),
    after: Array.isArray(raw.after) ? [...new Set(raw.after.map((a: unknown) => String(a)).filter((a: string) => a && a !== id))] as string[] : [],
  };
  if (Array.isArray(raw.start)) part.start = vec(raw.start, part.at);
  if (Array.isArray(raw.turn) && raw.turn.some((t: unknown) => num(t, 0) !== 0)) part.turn = vec(raw.turn, [0, 0, 0]);
  if (Array.isArray(raw.copies)) {
    const copies = raw.copies.filter(Array.isArray).map((c: unknown) => vec(c, [0, 0, 0]));
    if (copies.length) part.copies = copies.slice(0, 11);
  }
  return part;
};

/**
 * data-assembly as JSON (written by the authoring mode); empty or unreadable: the example of data-example. Fields
 * left out get their defaults; parts with an id used before, and prerequisites that name no part, are dropped.
 */
export const parseAssembly = (value: string | undefined | null, example = "cabinet"): Assembly => {
  const base = exampleAssembly(example);
  let raw: any;
  try {
    raw = value && String(value).trim() ? JSON.parse(String(value)) : null;
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== "object") return base;
  const fromExample = typeof raw.example === "string" && EXAMPLES[raw.example] ? exampleAssembly(raw.example) : null;
  let parts: Part[] = Array.isArray(raw.parts)
    ? raw.parts.map(parsePart).filter((x: Part | null): x is Part => !!x)
    : (fromExample ?? base).parts;
  const seen = new Set<string>();
  parts = parts.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))).slice(0, MAX_PARTS);
  const ids = new Set(parts.map((x) => x.id));
  parts.forEach((x) => (x.after = x.after.filter((a) => ids.has(a))));
  const rawPoints = raw.points && typeof raw.points === "object" ? raw.points : {};
  const points: Points = {
    valid: Math.max(0, Math.round(num(rawPoints.valid, DEFAULT_POINTS.valid))),
    complete: Math.max(0, Math.round(num(rawPoints.complete, DEFAULT_POINTS.complete))),
    first: Math.max(0, Math.round(num(rawPoints.first, DEFAULT_POINTS.first))),
    penalty: Math.max(0, Math.round(num(rawPoints.penalty, DEFAULT_POINTS.penalty))),
  };
  const order = Array.isArray(raw.order) ? ownSequence(parts, raw.order) : [];
  return {
    example: fromExample ? fromExample.example : typeof raw.example === "string" ? raw.example : "",
    title: raw.title !== undefined ? text(raw.title) : fromExample?.title ?? "",
    parts,
    task: oneOf(raw.task, TASKS, "assemble"),
    feedback: oneOf(raw.feedback, FEEDBACKS, "block"),
    scoring: oneOf(raw.scoring, SCORINGS, "pci"),
    order,
    first: typeof raw.first === "string" && ids.has(raw.first) ? raw.first : "",
    points,
    gltf: typeof raw.gltf === "string" ? raw.gltf.trim() : "",
  };
};

/** data-assembly for an assembly (what getProperties of the authoring mode writes). */
export const serializeAssembly = (a: Assembly): string =>
  JSON.stringify({
    ...(a.example ? { example: a.example } : {}),
    ...(a.title ? { title: a.title } : {}),
    task: a.task, feedback: a.feedback, scoring: a.scoring,
    parts: a.parts,
    order: a.order,
    ...(a.first ? { first: a.first } : {}),
    points: a.points,
    ...(a.gltf ? { gltf: a.gltf } : {}),
  });

export const textIn = (t: Text, language: string): string => {
  if (typeof t === "string") return t;
  const lang = language === "nl" ? "nl" : "en";
  return t[lang] ?? t.en ?? t.nl ?? "";
};
export const nameOf = (part: Part, language: string) => textIn(part.name, language) || part.id;

// ------------------------------------------------------------ the rules

/** Part ids that exist, each once, in the given order. */
export const ownSequence = (parts: Part[], ids: unknown[]): string[] => {
  const known = new Set(parts.map((x) => x.id));
  const out: string[] = [];
  for (const id of ids) {
    const s = String(id).trim();
    if (known.has(s) && !out.includes(s)) out.push(s);
  }
  return out;
};

/** The parts that need this one (the other way round of `after`). */
export const dependents = (parts: Part[], id: string) => parts.filter((x) => x.after.includes(id)).map((x) => x.id);

/** What must have been done before this part's step: its prerequisites (assembly), or the parts that need it (disassembly). */
export const requiredBefore = (parts: Part[], id: string, task: Task): string[] =>
  task === "assemble" ? parts.find((x) => x.id === id)?.after ?? [] : dependents(parts, id);

/** Whether a step on this part is allowed after these steps, and which required steps are still missing. */
export const checkStep = (parts: Part[], task: Task, sequence: string[], id: string): { allowed: boolean; missing: string[] } => {
  const done = new Set(sequence);
  const missing = requiredBefore(parts, id, task).filter((r) => !done.has(r));
  return { allowed: missing.length === 0, missing };
};

/**
 * Taking a step back (a placed part off again, a removed part back on): the steps that still depend on it, which
 * would lose what they stand on. Empty: it can be taken back.
 */
export const blockersOfTakeBack = (parts: Part[], task: Task, sequence: string[], id: string): string[] => {
  const done = new Set(sequence);
  return parts.filter((x) => done.has(x.id) && x.id !== id && requiredBefore(parts, x.id, task).includes(id)).map((x) => x.id);
};

/** The steps that broke a rule: for each, the parts it needed that came later or not at all. */
export const violationsOf = (parts: Part[], task: Task, sequence: string[]): { id: string; missing: string[] }[] => {
  const out: { id: string; missing: string[] }[] = [];
  sequence.forEach((id, i) => {
    const before = new Set(sequence.slice(0, i));
    const missing = requiredBefore(parts, id, task).filter((r) => !before.has(r));
    if (missing.length) out.push({ id, missing });
  });
  return out;
};

/** A cycle in the prerequisites (ids, the first again at the end), or null: a valid order exists only without one. */
export const findCycle = (parts: Part[]): string[] | null => {
  const byId = new Map(parts.map((x) => [x.id, x]));
  const state = new Map<string, number>(); // 1 visiting, 2 done
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    state.set(id, 1);
    stack.push(id);
    for (const a of byId.get(id)?.after ?? []) {
      if (!byId.has(a)) continue;
      if (state.get(a) === 1) return [...stack.slice(stack.indexOf(a)), a];
      if (!state.get(a)) {
        const found = visit(a);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const x of parts) {
    if (!state.get(x.id)) {
      const found = visit(x.id);
      if (found) return found.reverse();
    }
  }
  return null;
};

/** The first valid assembly order: every time the first part in the list whose prerequisites are in place. */
export const firstValidOrder = (parts: Part[]): string[] | null => {
  if (findCycle(parts)) return null;
  const out: string[] = [];
  while (out.length < parts.length) {
    const next = parts.find((x) => !out.includes(x.id) && x.after.every((a) => out.includes(a)));
    if (!next) return null;
    out.push(next.id);
  }
  return out;
};

/** How many valid assembly orders there are (the same number of disassembly orders); stops counting at `limit`. */
export const countOrders = (parts: Part[], limit = 1_000_000): number => {
  if (findCycle(parts)) return 0;
  const n = parts.length;
  if (n === 0) return 1;
  const index = new Map(parts.map((x, i) => [x.id, i]));
  if (n > 20) {
    // too many for the table below: count by trying, until the limit
    let count = 0;
    const done = new Set<string>();
    const walk = () => {
      if (count >= limit) return;
      if (done.size === n) return void count++;
      for (const x of parts) {
        if (done.has(x.id) || !x.after.every((a) => done.has(a))) continue;
        done.add(x.id);
        walk();
        done.delete(x.id);
        if (count >= limit) return;
      }
    };
    walk();
    return count;
  }
  const need = parts.map((x) => x.after.reduce((m, a) => m | (1 << (index.get(a) ?? 0)), 0));
  // ways[mask]: orders of the parts in mask that respect the rules (subset dynamic programming)
  const ways = new Float64Array(1 << n);
  ways[0] = 1;
  for (let mask = 0; mask < 1 << n; mask++) {
    const w = ways[mask];
    if (!w) continue;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i) || (need[i] & mask) !== need[i]) continue;
      ways[mask | (1 << i)] += w;
    }
  }
  return Math.min(limit, ways[(1 << n) - 1]);
};

/** The author's order if it is a valid assembly order, else the first valid one. */
export const assemblyOrder = (a: Assembly): string[] | null => {
  const own = ownSequence(a.parts, a.order);
  if (own.length === a.parts.length && violationsOf(a.parts, "assemble", own).length === 0) return own;
  return firstValidOrder(a.parts);
};

/** The correct sequence of steps for the task: the assembly order, or its reverse for a disassembly. */
export const correctSequence = (a: Assembly): string[] | null => {
  const order = assemblyOrder(a);
  return order ? (a.task === "assemble" ? order : [...order].reverse()) : null;
};

export type Evaluation = {
  score: number;
  maxscore: number;
  correct: boolean;
  valid: boolean;
  complete: boolean;
  /** null without a first part set */
  first: boolean | null;
  violations: number;
  steps: number;
};

/**
 * The checks on a sequence: valid (every part, no rule broken), complete (every part), first (the right first part,
 * when the author set one) and the number of violations (per step, per required part that came later or not at all).
 * The score: the points of the checks that pass, minus the penalty per violation, never below 0.
 */
export const evaluate = (a: Assembly, sequence: string[]): Evaluation => {
  const seq = ownSequence(a.parts, sequence);
  const violations = violationsOf(a.parts, a.task, seq).reduce((n, v) => n + v.missing.length, 0);
  const complete = a.parts.length > 0 && seq.length === a.parts.length;
  const valid = complete && violations === 0;
  const first = a.first ? seq[0] === a.first : null;
  const maxscore = a.points.valid + a.points.complete + (a.first ? a.points.first : 0);
  const earned = (valid ? a.points.valid : 0) + (complete ? a.points.complete : 0) + (first ? a.points.first : 0);
  const score = Math.max(0, earned - violations * a.points.penalty);
  return { score, maxscore, correct: valid && first !== false, valid, complete, first, violations, steps: seq.length };
};

// ------------------------------------------------------------ responses

/** The part ids in a response, a correct response or a saved value: a list, a string ("a,b c"), a record's order field. */
export const sequenceIn = (value: any): string[] | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const s = value.trim();
    if (s.startsWith("[")) {
      try {
        return sequenceIn(JSON.parse(s));
      } catch {
        return null;
      }
    }
    return s ? s.split(/[\s,;]+/).filter(Boolean) : [];
  }
  if (Array.isArray(value)) {
    // a declaration's values with field identifiers: the order field
    const field = value.find((v) => v && typeof v === "object" && (v.fieldIdentifier === "order" || v.name === "order"));
    if (field) return sequenceIn(field.value ?? field.base?.string ?? field.base);
    return value.map((v) => (typeof v === "object" && v !== null ? v.identifier ?? v.value ?? v.string ?? "" : v)).map(String).filter(Boolean);
  }
  if (Array.isArray(value.record)) return sequenceIn(value.record.find((f: any) => f?.name === "order")?.base?.string ?? null);
  if (value.list) return sequenceIn(value.list.identifier ?? value.list.string ?? null);
  if (value.base) return sequenceIn(value.base.string ?? value.base.identifier ?? null);
  if (typeof value.order === "string") return sequenceIn(value.order);
  return null;
};

// ------------------------------------------------------------ positions

/** Where each part lies before it is placed: its own start, or pushed out from the middle of the product. */
export const startPositions = (parts: Part[], explode = 1): Vec[] => {
  if (!parts.length) return [];
  const centre = [0, 1, 2].map((k) => parts.reduce((s, x) => s + x.at[k], 0) / parts.length);
  const radius = Math.max(1, ...parts.map((x) => Math.hypot(x.at[0] - centre[0], x.at[1] - centre[1], x.at[2] - centre[2]) + Math.max(...x.size)));
  const fallbacks: Vec[] = [[0, 1, 0.7], [0.7, 1, 0], [0, 1, -0.7], [-0.7, 1, 0]];
  let k = 0;
  return parts.map((x) => {
    if (x.start) return x.start;
    let d = [x.at[0] - centre[0], x.at[1] - centre[1], x.at[2] - centre[2]];
    let len = Math.hypot(d[0], d[1], d[2]);
    if (len < radius * 0.15) {
      d = fallbacks[k++ % fallbacks.length];
      len = Math.hypot(d[0], d[1], d[2]);
    }
    const push = radius * 0.9 * explode;
    return [x.at[0] + (d[0] / len) * push, x.at[1] + (d[1] / len) * push, x.at[2] + (d[2] / len) * push] as Vec;
  });
};

/** Which parts are in the product after these steps: the placed ones, or in a disassembly the ones not yet removed. */
export const assembledAfter = (parts: Part[], task: Task, sequence: string[]): Set<string> => {
  const done = new Set(sequence);
  return new Set(parts.filter((x) => (task === "assemble" ? done.has(x.id) : !done.has(x.id))).map((x) => x.id));
};
