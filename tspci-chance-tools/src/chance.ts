// The tools, the experiments, the probabilities and the scoring of the chance tools PCI. No imports: node tests this
// file as it is (test/chance.test.ts).

export type ToolType = "dice" | "spinner" | "bag" | "coins";
/** tool: explore (the answer goes elsewhere); design: make a spinner or bag; tree: fill in a probability tree. */
export type Mode = "tool" | "design" | "tree";
/** sequence: the outcomes one after the other ("red,blue"); sum: dice add up, coins count heads. */
export type Combine = "sequence" | "sum";

export const TOOL_TYPES: ToolType[] = ["dice", "spinner", "bag", "coins"];
export const MODES: Mode[] = ["tool", "design", "tree"];
export const COLOR_COUNT = 8;
export const MAX_DICE = 3;
export const MAX_FACES = 20;
export const MAX_ITEMS = 8;
export const MAX_SECTORS = 24;
export const MAX_BALLS = 40;
export const MAX_TARGETS = 4;
/** per stage of a probability tree */
export const MAX_BRANCHES = 4;
export const MAX_TRIALS = 10000;
/** more possible outcomes than this: the table lists only the ones that came up */
export const MAX_ROWS = 36;
export const RUNS = [1, 10, 100];

/** A sector of a spinner (count: its size) or a colour of balls in a bag (count: how many). */
export type Item = { label: string; letter: string; color: number; count: number };

export type Target = { outcome: string; probability: string; points: number };
export type TreeOptions = {
  /** given: the outcomes are on the branches; choose: the candidate chooses them */
  labels: "given" | "choose";
  /** the candidate also writes the probability of every path */
  paths: boolean;
  /** an event to give the probability of, as the paths it is made of ("red,red") */
  event: { text: string; paths: string[] } | null;
};

export type Setup = {
  tool: ToolType;
  dice: { count: number; faces: string[]; combine: Combine };
  coins: { count: number; combine: Combine };
  spinner: { sectors: Item[]; spins: number };
  bag: { balls: Item[]; draws: number; replace: boolean };
  /** design mode: the probabilities the candidate's spinner or bag must have */
  targets: Target[];
  /** design mode: the spinner must have exactly this many sectors, the bag this many balls (0: any) */
  size: number;
  tree: TreeOptions;
  /** design and tree mode: the candidate can also run experiments */
  experiments: boolean;
  /** a decimal or percentage may be this far from the exact probability (a fraction must be exact) */
  margin: number;
};

export type Rat = { n: number; d: number };

// ---------------------------------------------------------------- fractions

export const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
};
export const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;
export const rat = (n: number, d = 1): Rat => {
  if (d < 0) [n, d] = [-n, -d];
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
};
export const add = (a: Rat, b: Rat) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const mul = (a: Rat, b: Rat) => rat(a.n * b.n, a.d * b.d);
export const equal = (a: Rat, b: Rat) => a.n * b.d === b.n * a.d;
export const valueOf = (r: Rat) => r.n / r.d;
export const formatRat = (r: Rat) => (r.d === 1 ? String(r.n) : `${r.n}/${r.d}`);

/** A number for the candidate: a decimal comma in Dutch. */
export const formatNumber = (value: number, language: string, decimals = 2) => {
  const text = (Math.round(value * 10 ** decimals) / 10 ** decimals).toFixed(decimals);
  return language === "nl" ? text.replace(".", ",") : text;
};

/** What a candidate typed as a probability: a fraction (exact), or a decimal or percentage (within the margin). */
export type Entry = { value: Rat; kind: "fraction" | "decimal" };

/** "3/8", "6/16", "0,375", ".375", "37,5%", "1": null for anything else. */
export const parseEntry = (text: string): Entry | null => {
  const t = String(text ?? "").replace(/\s+/g, "").replace(",", ".");
  if (!t) return null;
  let m = /^(\d{1,6})\/(\d{1,6})$/.exec(t);
  if (m) {
    const d = Number(m[2]);
    return d === 0 ? null : { value: rat(Number(m[1]), d), kind: "fraction" };
  }
  m = /^(\d{0,6})(?:\.(\d{1,8}))?(%?)$/.exec(t);
  if (!m || (m[1] === "" && m[2] === undefined)) return null;
  const decimals = m[2] ?? "";
  const scale = 10 ** decimals.length * (m[3] ? 100 : 1);
  const value = rat(Number(m[1] || "0") * 10 ** decimals.length + Number(decimals || "0"), scale);
  // a whole number without a percent sign (0 or 1) is exact
  return { value, kind: decimals || m[3] ? "decimal" : "fraction" };
};

/** Whether an entry is this probability: a fraction equivalent to it, or a decimal within the margin. */
export const matches = (entry: Entry | null, correct: Rat, margin: number) => {
  if (!entry) return false;
  if (entry.kind === "fraction") return equal(entry.value, correct);
  return Math.abs(valueOf(entry.value) - valueOf(correct)) <= Math.max(0, margin) + 1e-9;
};

/** The entry the same in every language: a fraction in lowest terms, a decimal with a point ("37.5%" stays a percentage). */
export const normalizeEntry = (text: string) => {
  const t = String(text ?? "").replace(/\s+/g, "").replace(",", ".");
  const e = parseEntry(t);
  if (!e) return t;
  return e.kind === "fraction" ? formatRat(e.value) : t;
};

// ---------------------------------------------------------------- setup

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
/** A label is part of an outcome key ("red,blue"): no commas or bars in it. */
export const cleanLabel = (v: unknown) => String(v ?? "").replace(/[,|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 24);

export const normalizeItem = (v: any, i: number): Item => {
  const label = cleanLabel(v?.label) || `${i + 1}`;
  return {
    label,
    letter: String(v?.letter ?? label.charAt(0).toUpperCase()).trim().slice(0, 2),
    color: clampInt(v?.color, 0, COLOR_COUNT - 1, i % COLOR_COUNT),
    count: clampInt(v?.count, 0, MAX_BALLS, 1),
  };
};

const COLOR_NAMES: Record<string, string[]> = {
  en: ["red", "blue", "yellow", "green", "orange", "light blue", "pink", "grey"],
  nl: ["rood", "blauw", "geel", "groen", "oranje", "lichtblauw", "roze", "grijs"],
};
/** A colour as an item, in the language of the item. */
export const colorItem = (color: number, count: number, language = "en"): Item => {
  const label = (COLOR_NAMES[language] ?? COLOR_NAMES.en)[color];
  return { label, letter: label.charAt(0).toUpperCase(), color, count };
};
export const colorName = (color: number, language = "en") => (COLOR_NAMES[language] ?? COLOR_NAMES.en)[color] ?? "";

const lang = (language: string) => (String(language).toLowerCase().startsWith("nl") ? "nl" : "en");

/** The example for a mode: a spinner to explore, a spinner to design, a bag of balls to draw two from. */
export const exampleSetup = (mode: Mode, language = "en"): Setup => {
  const l = lang(language);
  const base: Setup = {
    tool: "spinner",
    dice: { count: 2, faces: ["1", "2", "3", "4", "5", "6"], combine: "sum" },
    coins: { count: 2, combine: "sequence" },
    spinner: { sectors: [colorItem(0, 3, l), colorItem(1, 2, l), colorItem(2, 3, l)], spins: 1 },
    bag: { balls: [colorItem(0, 3, l), colorItem(1, 2, l)], draws: 1, replace: true },
    targets: [],
    size: 0,
    tree: { labels: "given", paths: true, event: null },
    experiments: true,
    margin: 0.005,
  };
  if (mode === "design") {
    return {
      ...base,
      spinner: { sectors: [colorItem(0, 1, l), colorItem(1, 1, l), colorItem(2, 2, l)], spins: 1 },
      targets: [
        { outcome: colorName(0, l), probability: "3/8", points: 1 },
        { outcome: colorName(1, l), probability: "1/4", points: 1 },
      ],
    };
  }
  if (mode === "tree") {
    const [red, blue] = [colorName(0, l), colorName(1, l)];
    return {
      ...base,
      tool: "bag",
      bag: { balls: [colorItem(0, 3, l), colorItem(1, 2, l)], draws: 2, replace: false },
      tree: {
        labels: "given",
        paths: true,
        event: { text: l === "nl" ? "twee knikkers van dezelfde kleur" : "two balls of the same colour", paths: [`${red},${red}`, `${blue},${blue}`] },
      },
    };
  }
  return base;
};

export const parseMode = (v: unknown): Mode => (MODES.includes(String(v).toLowerCase() as Mode) ? (String(v).toLowerCase() as Mode) : "tool");

/** data-setup (JSON) with the example of the mode for what is missing; empty or broken: the example. */
export const parseSetup = (text: unknown, mode: Mode = "tool", language = "en"): Setup => {
  const example = exampleSetup(mode, language);
  let raw: any = null;
  if (typeof text === "string" && text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      raw = null;
    }
  } else if (text && typeof text === "object") raw = text;
  if (!raw || typeof raw !== "object") return example;
  const tool = TOOL_TYPES.includes(raw.tool) ? raw.tool : example.tool;
  const combine = (v: unknown, fallback: Combine): Combine => (v === "sum" || v === "sequence" ? v : fallback);
  const items = (list: unknown, fallback: Item[]) =>
    Array.isArray(list) && list.length ? list.slice(0, MAX_ITEMS).map(normalizeItem) : fallback;
  const faces = Array.isArray(raw.dice?.faces) ? raw.dice.faces.map(cleanLabel).filter(Boolean).slice(0, MAX_FACES) : [];
  const targets: Target[] = Array.isArray(raw.targets)
    ? raw.targets.slice(0, MAX_TARGETS).map((t: any) => ({
      outcome: cleanLabel(t?.outcome),
      probability: String(t?.probability ?? "").trim(),
      points: clampInt(t?.points, 0, 10, 1),
    }))
    : example.targets;
  const ev = raw.tree?.event;
  const margin = Number(raw.margin);
  return {
    tool,
    dice: {
      count: clampInt(raw.dice?.count, 1, MAX_DICE, example.dice.count),
      faces: faces.length >= 2 ? faces : example.dice.faces,
      combine: combine(raw.dice?.combine, example.dice.combine),
    },
    coins: { count: clampInt(raw.coins?.count, 1, MAX_DICE, example.coins.count), combine: combine(raw.coins?.combine, example.coins.combine) },
    spinner: { sectors: items(raw.spinner?.sectors, example.spinner.sectors), spins: clampInt(raw.spinner?.spins, 1, MAX_DICE, example.spinner.spins) },
    bag: {
      balls: items(raw.bag?.balls, example.bag.balls),
      draws: clampInt(raw.bag?.draws, 1, MAX_DICE, example.bag.draws),
      replace: raw.bag?.replace === undefined ? example.bag.replace : raw.bag.replace === true || raw.bag.replace === "true",
    },
    targets,
    size: clampInt(raw.size, 0, MAX_BALLS, 0),
    tree: {
      labels: raw.tree?.labels === "choose" ? "choose" : raw.tree?.labels === "given" ? "given" : example.tree.labels,
      paths: raw.tree?.paths === undefined ? example.tree.paths : raw.tree.paths === true || raw.tree.paths === "true",
      event: ev === null ? null : ev && Array.isArray(ev.paths)
        ? { text: String(ev.text ?? "").slice(0, 200), paths: ev.paths.map((p: unknown) => String(p)).filter(Boolean) }
        : tool === example.tool ? example.tree.event : null, // the example's event is about the example's balls
    },
    experiments: raw.experiments === undefined ? example.experiments : raw.experiments === true || raw.experiments === "true",
    margin: Number.isFinite(margin) && margin >= 0 ? Math.min(margin, 0.5) : example.margin,
  };
};

/** data-setup as the authoring mode writes it: only the chosen tool, and the parts of the mode. */
export const serializeSetup = (s: Setup, mode: Mode): string => {
  const out: Record<string, unknown> = { tool: s.tool, [s.tool]: s[s.tool] };
  if (mode === "design") {
    out.targets = s.targets;
    if (s.size) out.size = s.size;
  }
  if (mode === "tree") {
    out.tree = s.tree;
    out.margin = s.margin;
  }
  if (mode !== "tool") out.experiments = s.experiments;
  return JSON.stringify(out);
};

// ---------------------------------------------------------------- the tool as a random experiment

/** How many steps a trial has: dice or coins at once, spins, draws. A tree always has two. */
export const stepsOf = (s: Setup) =>
  s.tool === "dice" ? s.dice.count : s.tool === "coins" ? s.coins.count : s.tool === "spinner" ? s.spinner.spins : s.bag.draws;

/** The setup with this many steps per trial (a probability tree: two). */
export const withSteps = (s: Setup, steps: number): Setup => {
  switch (s.tool) {
    case "dice": return { ...s, dice: { ...s.dice, count: steps } };
    case "coins": return { ...s, coins: { ...s.coins, count: steps } };
    case "spinner": return { ...s, spinner: { ...s.spinner, spins: steps } };
    case "bag": return { ...s, bag: { ...s.bag, draws: steps } };
  }
};

export const combineOf = (s: Setup): Combine => (s.tool === "dice" ? s.dice.combine : s.tool === "coins" ? s.coins.combine : "sequence");
const numericFaces = (s: Setup) => s.dice.faces.every((f) => /^-?\d+$/.test(f));

/** The different outcomes of one step, in order, with the items they look like. */
export const labelsOf = (s: Setup): Item[] => {
  const seen = new Map<string, Item>();
  const add = (item: Item) => !seen.has(item.label) && seen.set(item.label, item);
  if (s.tool === "dice") s.dice.faces.forEach((f) => add({ label: f, letter: f, color: -1, count: 1 }));
  if (s.tool === "coins") ["H", "T"].forEach((f) => add({ label: f, letter: f, color: -1, count: 1 }));
  if (s.tool === "spinner") s.spinner.sectors.forEach(add);
  if (s.tool === "bag") s.bag.balls.forEach(add);
  return [...seen.values()];
};

/** The probability of each outcome of the next step, after the steps before it (a bag without putting back). */
export const stepDistribution = (s: Setup, before: string[] = []): { label: string; p: Rat }[] => {
  const counts = new Map<string, number>();
  const bump = (label: string, n: number) => counts.set(label, (counts.get(label) ?? 0) + n);
  if (s.tool === "dice") s.dice.faces.forEach((f) => bump(f, 1));
  if (s.tool === "coins") ["H", "T"].forEach((f) => bump(f, 1));
  if (s.tool === "spinner") s.spinner.sectors.forEach((x) => bump(x.label, x.count));
  if (s.tool === "bag") {
    s.bag.balls.forEach((x) => bump(x.label, x.count));
    if (!s.bag.replace) before.forEach((l) => counts.has(l) && counts.set(l, Math.max(0, counts.get(l)! - 1)));
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (!total) return [];
  return [...counts].filter(([, n]) => n > 0).map(([label, n]) => ({ label, p: rat(n, total) }));
};

/** The key of a trial: the steps one after the other, or their sum (dice) or the number of heads (coins). */
export const outcomeKey = (s: Setup, steps: string[]) => {
  if (combineOf(s) === "sum") {
    if (s.tool === "coins") return String(steps.filter((x) => x === "H").length);
    if (s.tool === "dice" && numericFaces(s)) return String(steps.reduce((a, x) => a + Number(x), 0));
  }
  return steps.join(",");
};

/** Every possible outcome of a trial with its probability, in order (sums from small to large). */
export const distribution = (s: Setup): { key: string; p: Rat }[] => {
  const steps = stepsOf(s);
  const out = new Map<string, Rat>();
  const walk = (before: string[], p: Rat) => {
    if (before.length === steps) {
      const key = outcomeKey(s, before);
      out.set(key, out.has(key) ? add(out.get(key)!, p) : p);
      return;
    }
    for (const o of stepDistribution(s, before)) walk([...before, o.label], mul(p, o.p));
  };
  if (stepDistribution(s).length) walk([], rat(1));
  const list = [...out].map(([key, p]) => ({ key, p }));
  if (combineOf(s) === "sum" && (s.tool === "coins" || numericFaces(s))) list.sort((a, b) => Number(a.key) - Number(b.key));
  return list;
};

/** The probability of one outcome of a single step (a sector colour, a ball colour, a face). */
export const probabilityOf = (s: Setup, label: string): Rat => stepDistribution(s).find((o) => o.label === label)?.p ?? rat(0);

// ---------------------------------------------------------------- randomness: seeded, the same trial every time

const fmix = (h: number) => {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};
/** A number from 0 to 1 for one step of one trial: the same seed, trial and step give the same number. */
export const random = (seed: number, trial: number, step: number) =>
  fmix(fmix((seed >>> 0) ^ Math.imul(trial + 1, 0x9e3779b1)) ^ Math.imul(step + 1, 0x7feb352d)) / 4294967296;

/** A new seed for a session. */
export const newSeed = () => Math.floor(Math.random() * 4294967296) >>> 0;

export type Trial = {
  /** the outcome of every step */
  steps: string[];
  key: string;
  /** spinner: where the pointer stopped, degrees clockwise from the top, per spin */
  angles: number[];
  /** dice: the face index per die (faces may share a label) */
  faces: number[];
};

/** Trial number `index` of the experiment with this seed. */
export const trialAt = (s: Setup, seed: number, index: number): Trial => {
  const steps: string[] = [];
  const angles: number[] = [];
  const faces: number[] = [];
  const n = stepsOf(s);
  const balls = s.tool === "bag" ? s.bag.balls.map((b) => ({ ...b })) : [];
  for (let k = 0; k < n; k++) {
    const r = random(seed, index, k);
    if (s.tool === "dice") {
      const f = Math.min(s.dice.faces.length - 1, Math.floor(r * s.dice.faces.length));
      faces.push(f);
      steps.push(s.dice.faces[f]);
    } else if (s.tool === "coins") steps.push(r < 0.5 ? "H" : "T");
    else if (s.tool === "spinner") {
      const total = s.spinner.sectors.reduce((a, x) => a + x.count, 0);
      const angle = r * 360;
      angles.push(angle);
      let at = 0;
      let label = s.spinner.sectors[0]?.label ?? "";
      for (const x of s.spinner.sectors) {
        if (!x.count) continue;
        at += (x.count / total) * 360;
        label = x.label;
        if (angle < at) break;
      }
      steps.push(label);
    } else {
      const total = balls.reduce((a, x) => a + x.count, 0);
      let pick = Math.floor(r * total);
      const ball = balls.find((x) => (pick -= x.count) < 0) ?? balls[balls.length - 1];
      steps.push(ball?.label ?? "");
      if (ball && !s.bag.replace) ball.count -= 1;
    }
  }
  return { steps, key: outcomeKey(s, steps), angles, faces };
};

/** An experiment: the seed, where this experiment starts in it, and the runs (1, 10 or 100 trials) so far. */
export type Experiment = { seed: number; start: number; runs: number[] };

export const trialCount = (e: Experiment) => e.runs.reduce((a, b) => a + b, 0);

/** The trials of the experiment, the first `count` of them. */
export const trialsOf = (s: Setup, e: Experiment, count = trialCount(e)): Trial[] =>
  Array.from({ length: Math.min(count, trialCount(e)) }, (_, i) => trialAt(s, e.seed, e.start + i));

export type Row = { key: string; count: number; relative: number; p: Rat | null };

/**
 * The frequency table: every possible outcome (or, with more than MAX_ROWS, only those that came up) with how often
 * it came up and its relative frequency.
 */
export const frequencies = (s: Setup, trials: Trial[]): Row[] => {
  const counts = new Map<string, number>();
  trials.forEach((t) => counts.set(t.key, (counts.get(t.key) ?? 0) + 1));
  const dist = distribution(s);
  const total = trials.length;
  const rows = dist.length <= MAX_ROWS ? dist : dist.filter((d) => counts.has(d.key));
  const known = new Set(rows.map((r) => r.key));
  const extra = [...counts.keys()].filter((k) => !known.has(k)); // a setting changed under the experiment
  return [
    ...rows.map((d) => ({ key: d.key, count: counts.get(d.key) ?? 0, relative: total ? (counts.get(d.key) ?? 0) / total : 0, p: d.p })),
    ...extra.map((key) => ({ key, count: counts.get(key)!, relative: counts.get(key)! / total, p: null })),
  ];
};

/** The experiment log of tool mode, as JSON: what an item can show a rater or a later interaction. */
export const experimentLog = (s: Setup, e: Experiment) => {
  const trials = trialsOf(s, e);
  const outcomes: Record<string, number> = {};
  frequencies(s, trials).forEach((r) => r.count && (outcomes[r.key] = r.count));
  return JSON.stringify({ tool: s.tool, trials: trials.length, outcomes, runs: e.runs, seed: e.seed, start: e.start });
};

// ---------------------------------------------------------------- design mode

/** The outcomes the candidate can use in a design: the different items of the author's spinner or bag. */
export const paletteOf = (s: Setup): Item[] => {
  const list = s.tool === "bag" ? s.bag.balls : s.spinner.sectors;
  const seen = new Map<string, Item>();
  list.forEach((x) => !seen.has(x.label) && seen.set(x.label, x));
  return [...seen.values()];
};

/** The candidate's design: a spinner of equal sectors (a label each), or a bag (a count per palette item). */
export type Design = { sectors: string[]; counts: number[] };

/** The design the candidate starts with: the author's spinner in equal sectors, or the author's bag. */
export const startDesign = (s: Setup): Design => {
  const palette = paletteOf(s);
  if (s.tool === "bag") return { sectors: [], counts: palette.map((p) => s.bag.balls.filter((b) => b.label === p.label).reduce((a, b) => a + b.count, 0)) };
  const sectors: string[] = [];
  s.spinner.sectors.forEach((x) => { for (let i = 0; i < x.count && sectors.length < MAX_SECTORS; i++) sectors.push(x.label); });
  return { sectors: sectors.length ? sectors : [palette[0]?.label ?? ""], counts: [] };
};

/** A design from a state or a response, kept to the palette and the limits. */
export const ownDesign = (s: Setup, d: any): Design => {
  const start = startDesign(s);
  const palette = paletteOf(s).map((p) => p.label);
  if (s.tool === "bag") {
    const counts = palette.map((_, i) => clampInt(d?.counts?.[i], 0, MAX_BALLS, start.counts[i] ?? 0));
    return { sectors: [], counts };
  }
  const sectors = Array.isArray(d?.sectors) ? d.sectors.map(String).filter((l: string) => palette.includes(l)).slice(0, MAX_SECTORS) : [];
  return { sectors: sectors.length ? sectors : start.sectors, counts: [] };
};

export const sameDesign = (a: Design, b: Design) => JSON.stringify(a) === JSON.stringify(b);
export const designSize = (s: Setup, d: Design) => (s.tool === "bag" ? d.counts.reduce((a, b) => a + b, 0) : d.sectors.length);

/** The tool the candidate made: a spinner of equal sectors or the bag, one spin or draw per trial. */
export const designedSetup = (s: Setup, d: Design): Setup => {
  const palette = paletteOf(s);
  const item = (label: string) => palette.find((p) => p.label === label)!;
  if (s.tool === "bag") {
    return { ...s, bag: { ...s.bag, balls: palette.map((p, i) => ({ ...p, count: d.counts[i] ?? 0 })), draws: 1 } };
  }
  return { ...s, tool: "spinner", spinner: { sectors: d.sectors.map((l) => ({ ...item(l), count: 1 })), spins: 1 } };
};

/** The design as the response's `design` field: the labels with their counts. */
export const designJson = (s: Setup, d: Design) =>
  JSON.stringify(s.tool === "bag"
    ? { tool: "bag", balls: paletteOf(s).map((p, i) => ({ label: p.label, count: d.counts[i] ?? 0 })) }
    : { tool: "spinner", sectors: d.sectors });

/** A design back from the `design` field (or a state). */
export const readDesign = (s: Setup, json: string): Design | null => {
  try {
    const v = JSON.parse(json);
    if (s.tool === "bag" && Array.isArray(v?.balls)) {
      return ownDesign(s, { counts: paletteOf(s).map((p) => v.balls.find((b: any) => b?.label === p.label)?.count ?? 0) });
    }
    if (s.tool !== "bag" && Array.isArray(v?.sectors)) return ownDesign(s, v);
    if (Array.isArray(v?.counts) || Array.isArray(v?.sectors)) return ownDesign(s, v);
  } catch {
    // not a design
  }
  return null;
};

export type DesignResult = {
  score: number;
  maxscore: number;
  correct: boolean;
  /** per target: the probability the design gives it, and whether that is the target */
  targets: { p: Rat; passed: boolean }[];
  size: number;
  /** the size check, when the author set a size */
  sizePassed: boolean | null;
};

export const evaluateDesign = (s: Setup, d: Design): DesignResult => {
  const made = designedSetup(s, d);
  const size = designSize(s, d);
  const targets = s.targets.map((t) => {
    const p = size ? probabilityOf(made, t.outcome) : rat(0);
    const want = parseEntry(t.probability);
    return { p, passed: !!want && size > 0 && equal(p, want.value) };
  });
  const sizePassed = s.size ? size === s.size : null;
  let score = 0, maxscore = 0;
  s.targets.forEach((t, i) => { maxscore += t.points; if (targets[i].passed) score += t.points; });
  if (sizePassed !== null) { maxscore += 1; if (sizePassed) score += 1; }
  return { score, maxscore, correct: maxscore > 0 && score === maxscore, targets, size, sizePassed };
};

/**
 * A design that meets every target (and the size): the least common multiple of the denominators as the size (or
 * the author's size), the rest for an outcome without a target. Null when there is none.
 */
export const solutionDesign = (s: Setup): Design | null => {
  const palette = paletteOf(s);
  const wants = s.targets.map((t) => ({ index: palette.findIndex((p) => p.label === t.outcome), p: parseEntry(t.probability)?.value }));
  if (!wants.length || wants.some((w) => w.index < 0 || !w.p)) return null;
  if (new Set(wants.map((w) => w.index)).size !== wants.length) return null;
  const sum = wants.reduce((a, w) => add(a, w.p!), rat(0));
  if (valueOf(sum) > 1) return null;
  const base = wants.reduce((a, w) => lcm(a, w.p!.d), 1);
  const max = s.tool === "bag" ? MAX_BALLS : MAX_SECTORS;
  const size = s.size || base;
  if (size % base || size > max) return null;
  const counts = palette.map(() => 0);
  wants.forEach((w) => (counts[w.index] = (w.p!.n * size) / w.p!.d));
  const rest = size - counts.reduce((a, b) => a + b, 0);
  if (rest > 0) {
    const free = palette.findIndex((_, i) => !wants.some((w) => w.index === i));
    if (free < 0) return null;
    counts[free] = rest;
  }
  if (s.tool === "bag") return { sectors: [], counts };
  const sectors: string[] = [];
  palette.forEach((p, i) => { for (let k = 0; k < counts[i]; k++) sectors.push(p.label); });
  return { sectors, counts: [] };
};

// ---------------------------------------------------------------- probability tree

/** The two-step experiment of a tree: the tool with two steps. */
export const treeSetup = (s: Setup): Setup => {
  const t = withSteps(s, 2);
  return { ...t, dice: { ...t.dice, combine: "sequence" }, coins: { ...t.coins, combine: "sequence" } };
};

/**
 * What the candidate filled in: per first-stage slot ("0") and second-stage slot ("0.1") an outcome (when they
 * choose them) and a probability; per path ("0.1") a probability; the probability of the event.
 */
export type TreeEntry = {
  labels: Record<string, string>;
  probs: Record<string, string>;
  paths: Record<string, string>;
  answer: string;
};
export const emptyTree = (): TreeEntry => ({ labels: {}, probs: {}, paths: {}, answer: "" });
export const isEmptyTree = (t: TreeEntry) =>
  ![...Object.values(t.labels), ...Object.values(t.probs), ...Object.values(t.paths), t.answer].some((v) => String(v ?? "").trim());

export const ownTree = (v: any): TreeEntry => {
  const map = (m: any) => {
    const out: Record<string, string> = {};
    if (m && typeof m === "object") for (const k of Object.keys(m)) if (/^\d(\.\d)?$/.test(k)) out[k] = String(m[k] ?? "").slice(0, 24);
    return out;
  };
  return { labels: map(v?.labels), probs: map(v?.probs), paths: map(v?.paths), answer: String(v?.answer ?? "").slice(0, 24) };
};

/** A slot of the tree as the candidate sees it: its outcome (given or chosen), and whether it may be judged. */
export type Slot = { id: string; label: string; parent: string | null };

/**
 * The slots of the tree: the first stage in the order of the outcomes; under each the second stage, its number of
 * slots following the outcome the candidate gave the first slot (a bag without putting back can have fewer).
 */
export const treeSlots = (s: Setup, entry: TreeEntry) => {
  const t = treeSetup(s);
  const given = s.tree.labels === "given";
  const firstTrue = stepDistribution(t);
  const first: Slot[] = firstTrue.map((o, i) => ({ id: `${i}`, label: given ? o.label : entry.labels[`${i}`] ?? "", parent: null }));
  const second: Slot[][] = first.map((slot, i) => {
    const valid = firstTrue.some((o) => o.label === slot.label);
    const under = stepDistribution(t, [valid ? slot.label : firstTrue[i].label]);
    return under.map((o, j) => ({ id: `${i}.${j}`, label: given ? o.label : entry.labels[`${i}.${j}`] ?? "", parent: slot.label }));
  });
  return { first, second, outcomes: labelsOf(t).map((x) => x.label) };
};

export type TreeResult = {
  score: number;
  maxscore: number;
  correct: boolean;
  /** per branch, the first stage first, then the second stage top to bottom */
  branches: boolean[];
  /** per path, top to bottom; empty when the candidate does not write them */
  paths: boolean[];
  /** the event; null without one */
  answer: boolean | null;
  answerValue: number | null;
};

const unique = (list: Slot[], slot: Slot) => list.filter((x) => x.label === slot.label).length === 1;

/** The correct probability of the event: the sum of its paths. */
export const eventProbability = (s: Setup): Rat | null => {
  const ev = s.tree.event;
  if (!ev || !ev.paths.length) return null;
  const t = treeSetup(s);
  return ev.paths.reduce((a, key) => {
    const [x, y] = key.split(",");
    const p1 = stepDistribution(t).find((o) => o.label === x)?.p ?? rat(0);
    const p2 = stepDistribution(t, [x]).find((o) => o.label === y)?.p ?? rat(0);
    return add(a, mul(p1, p2));
  }, rat(0));
};

export const evaluateTree = (s: Setup, entry: TreeEntry): TreeResult => {
  const t = treeSetup(s);
  const { first, second } = treeSlots(s, entry);
  const firstDist = stepDistribution(t);
  const margin = s.margin;
  const firstOk = first.map((slot) => {
    const o = firstDist.find((x) => x.label === slot.label);
    return { labelOk: !!o && unique(first, slot), p: o?.p ?? null };
  });
  const branches: boolean[] = first.map((slot, i) => firstOk[i].labelOk && matches(parseEntry(entry.probs[slot.id]), firstOk[i].p!, margin));
  const paths: boolean[] = [];
  second.forEach((row, i) => {
    const parentOk = firstOk[i].labelOk;
    const dist = parentOk ? stepDistribution(t, [first[i].label]) : [];
    row.forEach((slot) => {
      const o = dist.find((x) => x.label === slot.label);
      const ok = parentOk && !!o && unique(row, slot);
      branches.push(ok && matches(parseEntry(entry.probs[slot.id]), o!.p, margin));
      if (s.tree.paths) paths.push(ok && matches(parseEntry(entry.paths[slot.id]), mul(firstOk[i].p!, o!.p), margin));
    });
  });
  const event = eventProbability(s);
  const typed = parseEntry(entry.answer);
  const answer = event ? matches(typed, event, margin) : null;
  // the true tree's size: a wrong outcome can change the number of slots, never the points there are
  const trueBranches = firstDist.length + firstDist.reduce((a, o) => a + stepDistribution(t, [o.label]).length, 0);
  const truePaths = s.tree.paths ? trueBranches - firstDist.length : 0;
  const maxscore = trueBranches + truePaths + (event ? 1 : 0);
  const score = Math.min(maxscore, branches.filter(Boolean).length + paths.filter(Boolean).length + (answer ? 1 : 0));
  return { score, maxscore, correct: maxscore > 0 && score === maxscore, branches, paths, answer, answerValue: typed ? valueOf(typed.value) : null };
};

/** The tree filled in correctly: the outcomes in order, every probability as a fraction in lowest terms. */
export const solutionTree = (s: Setup): TreeEntry => {
  const t = treeSetup(s);
  const entry = emptyTree();
  stepDistribution(t).forEach((o, i) => {
    entry.labels[`${i}`] = o.label;
    entry.probs[`${i}`] = formatRat(o.p);
    stepDistribution(t, [o.label]).forEach((o2, j) => {
      entry.labels[`${i}.${j}`] = o2.label;
      entry.probs[`${i}.${j}`] = formatRat(o2.p);
      if (s.tree.paths) entry.paths[`${i}.${j}`] = formatRat(mul(o.p, o2.p));
    });
  });
  const ev = eventProbability(s);
  if (ev) entry.answer = formatRat(ev);
  return entry;
};

/** Every path of the two-step experiment ("red,blue"), for the event in the authoring mode. */
export const treePaths = (s: Setup) => {
  const t = treeSetup(s);
  return stepDistribution(t).flatMap((o) => stepDistribution(t, [o.label]).map((o2) => `${o.label},${o2.label}`));
};

/** The tree as the response's `tree` field: the entries the same in every language. */
export const treeJson = (s: Setup, entry: TreeEntry) => {
  const norm = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).filter(([, v]) => String(v).trim()).map(([k, v]) => [k, normalizeEntry(v)]));
  const { first, second } = treeSlots(s, entry);
  const labels = Object.fromEntries([...first, ...second.flat()].filter((x) => x.label).map((x) => [x.id, x.label]));
  return JSON.stringify({ labels, probs: norm(entry.probs), paths: norm(entry.paths), answer: normalizeEntry(entry.answer) });
};

// ---------------------------------------------------------------- the author's problems

export type Problem =
  | { type: "faces" } | { type: "empty" } | { type: "noTargets" } | { type: "target"; index: number }
  | { type: "targetOutcome"; index: number } | { type: "targetsTwice" } | { type: "targetsOverOne" } | { type: "noSolution" }
  | { type: "tooManyBranches" } | { type: "eventPath"; path: string } | { type: "toolForDesign" };

export const problems = (s: Setup, mode: Mode): Problem[] => {
  const out: Problem[] = [];
  if (s.tool === "dice" && s.dice.faces.length < 2) out.push({ type: "faces" });
  if ((s.tool === "spinner" || s.tool === "bag") && !stepDistribution(s).length) out.push({ type: "empty" });
  if (mode === "design") {
    if (s.tool !== "spinner" && s.tool !== "bag") out.push({ type: "toolForDesign" });
    else {
      const palette = paletteOf(s).map((p) => p.label);
      if (!s.targets.length) out.push({ type: "noTargets" });
      s.targets.forEach((t, i) => {
        const e = parseEntry(t.probability);
        if (!e || e.kind !== "fraction" || valueOf(e.value) > 1) out.push({ type: "target", index: i });
        if (!palette.includes(t.outcome)) out.push({ type: "targetOutcome", index: i });
      });
      if (new Set(s.targets.map((t) => t.outcome)).size !== s.targets.length) out.push({ type: "targetsTwice" });
      const sum = s.targets.reduce((a, t) => a + (parseEntry(t.probability) ? valueOf(parseEntry(t.probability)!.value) : 0), 0);
      if (sum > 1 + 1e-9) out.push({ type: "targetsOverOne" });
      else if (s.targets.length && !out.length && !solutionDesign(s)) out.push({ type: "noSolution" });
    }
  }
  if (mode === "tree") {
    const t = treeSetup(s);
    const first = stepDistribution(t);
    if (first.length > MAX_BRANCHES || first.some((o) => stepDistribution(t, [o.label]).length > MAX_BRANCHES)) out.push({ type: "tooManyBranches" });
    const paths = treePaths(s);
    s.tree.event?.paths.forEach((p) => !paths.includes(p) && out.push({ type: "eventPath", path: p }));
  }
  return out;
};
