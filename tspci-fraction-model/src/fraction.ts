// The models, the fractions and the scoring of the fraction model PCI. No imports: node tests this file as it is
// (test/fraction.test.ts).

/** A bar (strip, "strook"), a circle (pie), a grid of rows × columns, or a set of separate objects. */
export type ModelType = "bar" | "circle" | "grid" | "set";
/** shade: the candidate shades parts; name: the shading is given, the candidate writes the fraction. */
export type Task = "shade" | "name";
/** How the candidate writes a fraction in a name task: numerator over denominator, or a percentage. */
export type Entry = "fraction" | "percent";

export const MODEL_TYPES: ModelType[] = ["bar", "circle", "grid", "set"];
export const MAX_MODELS = 4;
/** Parts of a bar, a circle or a set; rows and columns of a grid. */
export const MAX_PARTS = 36;
export const MAX_SIDE = 12;

export type Model = {
  type: ModelType;
  /** bar, circle, set: the number of parts at the start (a grid has rows × columns) */
  parts: number;
  /** grid only */
  rows: number;
  columns: number;
  /** bar, circle: the candidate chooses the number of parts, from min to max */
  divide: boolean;
  min: number;
  max: number;
  /** parts shaded at the start (shade), or the given shading (name); 0-based, a grid in reading order */
  shaded: number[];
  task: Task;
  entry: Entry;
  /** bar: a percentage scale underneath */
  scale: boolean;
  /** the answer: "3/8", "35%", "=1" (the same fraction as model 1); "" for none */
  target: string;
  /** PCI scoring: the model must have exactly this many parts (0: any number) */
  requireParts: number;
  /** PCI scoring, name with a fraction: the fraction must be in lowest terms */
  simplest: boolean;
  /** shown above the model and in its accessible name ("A"); "" for none */
  label: string;
};

export type Setup = { models: Model[] };

/** What the candidate did with one model. */
export type ModelState = {
  parts: number;
  shaded: number[];
  /** name task: what the candidate typed, as typed ("3", "8", "37,5") */
  numerator: string;
  denominator: string;
  percent: string;
};

export type Fraction = { n: number; d: number };

// ---------------------------------------------------------------- fractions

export const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
};

export const simplify = (f: Fraction): Fraction => {
  const g = gcd(f.n, f.d);
  return { n: f.n / g, d: f.d / g };
};

export const equivalent = (a: Fraction | null, b: Fraction | null) => !!a && !!b && a.n * b.d === b.n * a.d;

/** "3/8" */
export const format = (f: Fraction | null) => (f ? `${f.n}/${f.d}` : "");

/** In lowest terms, as text: 6/16 → "3/8", 0/5 → "0/1", 4/4 → "1/1". */
export const simplest = (f: Fraction | null) => (f ? format(simplify(f)) : "");

/** A number with a decimal point or comma (no sign) as a fraction: "37,5" → 375/10. */
const decimal = (text: string): Fraction | null => {
  const m = /^(\d+)(?:[.,](\d+))?$/.exec(text.trim());
  if (!m) return null;
  const decimals = m[2] ?? "";
  if (m[1].length + decimals.length > 12) return null;
  return { n: Number(m[1] + decimals), d: 10 ** decimals.length };
};

/**
 * A fraction, a percentage or a whole number as written by an author (or in a response): "3/8", "35%", "37,5%", "1",
 * "0.375". Not in lowest terms: "6/16" stays 6/16. Null for anything else, or a zero denominator.
 */
export const parseFraction = (text: unknown): Fraction | null => {
  if (typeof text !== "string" && typeof text !== "number") return null;
  const t = String(text).trim().replace(/\s+/g, "");
  if (!t) return null;
  const f = /^(\d{1,9})\/(\d{1,9})$/.exec(t);
  if (f) return Number(f[2]) > 0 ? { n: Number(f[1]), d: Number(f[2]) } : null;
  if (t.endsWith("%")) {
    const p = decimal(t.slice(0, -1));
    return p ? { n: p.n, d: p.d * 100 } : null;
  }
  return decimal(t);
};

/** What the candidate typed in a name task, or null when it is not (yet) a fraction. */
export const typedFraction = (model: Model, state: ModelState): Fraction | null => {
  if (model.entry === "percent") {
    const p = decimal(state.percent);
    return p ? { n: p.n, d: p.d * 100 } : null;
  }
  if (!/^\d{1,9}$/.test(state.numerator.trim()) || !/^\d{1,9}$/.test(state.denominator.trim())) return null;
  const d = Number(state.denominator);
  return d > 0 ? { n: Number(state.numerator), d } : null;
};

/** The model's fraction: shaded parts over parts, or the typed fraction of a name task. Not in lowest terms. */
export const valueOf = (model: Model, state: ModelState): Fraction | null =>
  model.task === "name" ? typedFraction(model, state) : { n: state.shaded.length, d: state.parts };

/** A percentage of a fraction, rounded to at most 2 decimals: 3/8 → 37.5. */
export const percentOf = (f: Fraction) => Math.round((f.n / f.d) * 10000) / 100;

/** A number with the decimal separator of the language (nl: comma). */
export const formatNumber = (value: number, language = "en") => {
  const text = String(Math.round(value * 100) / 100);
  return language === "nl" ? text.replace(".", ",") : text;
};

// ---------------------------------------------------------------- models

export const partsOf = (model: Model) => (model.type === "grid" ? model.rows * model.columns : model.parts);
export const canDivide = (model: Model) => model.divide && (model.type === "bar" || model.type === "circle") && model.task === "shade";

const whole = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && value !== "" && value !== null && value !== undefined ? Math.min(max, Math.max(min, n)) : fallback;
};

const indices = (value: unknown, parts: number) =>
  Array.isArray(value) ? [...new Set(value.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < parts))].sort((a, b) => a - b) : [];

/** A model with every field in range; what an author left out gets its default. */
export const normalizeModel = (raw: any): Model => {
  const type: ModelType = MODEL_TYPES.includes(raw?.type) ? raw.type : "bar";
  const rows = whole(raw?.rows, 10, 1, MAX_SIDE);
  const columns = whole(raw?.columns, 10, 1, MAX_SIDE);
  const task: Task = raw?.task === "name" ? "name" : "shade";
  const divide = !!raw?.divide && (type === "bar" || type === "circle") && task === "shade";
  const min = whole(raw?.min, 1, 1, MAX_PARTS);
  const max = Math.max(min, whole(raw?.max, 24, 1, MAX_PARTS));
  let parts = type === "grid" ? rows * columns : whole(raw?.parts, type === "set" ? 10 : 4, 1, MAX_PARTS);
  if (divide) parts = Math.min(max, Math.max(min, parts));
  return {
    type, parts, rows, columns, divide, min, max,
    shaded: indices(raw?.shaded, parts),
    task,
    entry: raw?.entry === "percent" ? "percent" : "fraction",
    scale: type === "bar" && !!raw?.scale,
    target: typeof raw?.target === "string" ? raw.target.trim() : typeof raw?.target === "number" ? String(raw.target) : "",
    requireParts: whole(raw?.requireParts, 0, 0, MAX_SIDE * MAX_SIDE),
    simplest: !!raw?.simplest,
    label: typeof raw?.label === "string" ? raw.label.slice(0, 20) : "",
  };
};

/** The example: shade 2/3 of a circle and 4/6 of a bar, side by side. */
export const EXAMPLE: Setup = {
  models: [
    normalizeModel({ type: "circle", parts: 3, target: "2/3", label: "A" }),
    normalizeModel({ type: "bar", parts: 6, target: "4/6", label: "B" }),
  ],
};

/** data-models (JSON from the authoring mode, or an array of models); empty or unreadable: the example. */
export const parseSetup = (text: unknown): Setup => {
  if (typeof text !== "string" || !text.trim()) return EXAMPLE;
  try {
    const raw = JSON.parse(text);
    const list = Array.isArray(raw) ? raw : raw?.models;
    if (!Array.isArray(list) || !list.length) return EXAMPLE;
    return { models: list.slice(0, MAX_MODELS).map(normalizeModel) };
  } catch {
    return EXAMPLE;
  }
};

/** data-models: only what differs from the defaults, so the attribute stays short. */
export const serializeSetup = (setup: Setup) => {
  const plain = normalizeModel({});
  return JSON.stringify({
    models: setup.models.map((m) => {
      const out: Record<string, unknown> = { type: m.type };
      for (const key of Object.keys(m) as (keyof Model)[]) {
        if (key === "type") continue;
        if (key === "parts" && m.type === "grid") continue;
        if ((key === "rows" || key === "columns") && m.type !== "grid") continue;
        if ((key === "min" || key === "max") && !m.divide) continue;
        if (key === "entry" && m.task !== "name") continue;
        if (JSON.stringify(m[key]) !== JSON.stringify(plain[key]) || key === "parts") out[key] = m[key];
      }
      return out;
    }),
  });
};

export const startState = (model: Model): ModelState => ({
  parts: partsOf(model), shaded: [...model.shaded], numerator: "", denominator: "", percent: "",
});
export const startStates = (setup: Setup) => setup.models.map(startState);

export const sameStates = (a: ModelState[], b: ModelState[]) => JSON.stringify(a) === JSON.stringify(b);

/** A saved or restored state, made to fit the models (other settings since, a hand-edited response). */
export const ownStates = (setup: Setup, saved: unknown): ModelState[] =>
  setup.models.map((model, i) => {
    const s: any = Array.isArray(saved) ? saved[i] : null;
    const start = startState(model);
    if (!s || typeof s !== "object") return start;
    if (model.task === "name") {
      const text = (v: unknown) => (typeof v === "string" ? v.slice(0, 12) : "");
      return { ...start, numerator: text(s.numerator), denominator: text(s.denominator), percent: text(s.percent) };
    }
    const parts = canDivide(model) ? whole(s.parts, start.parts, model.min, model.max) : start.parts;
    return { ...start, parts, shaded: indices(s.shaded, parts) };
  });

/** Shade or unshade one part. */
export const toggle = (state: ModelState, part: number, on = !state.shaded.includes(part)): ModelState => {
  if (part < 0 || part >= state.parts || on === state.shaded.includes(part)) return state;
  const shaded = on ? [...state.shaded, part].sort((a, b) => a - b) : state.shaded.filter((i) => i !== part);
  return { ...state, shaded };
};

/**
 * A new number of parts. The shading stays where it can: 2 of 3 becomes 4 of 6 (every part split), 4 of 6 becomes 2 of 3
 * (whole groups shaded); otherwise it is cleared. `kept` tells which.
 */
export const resize = (state: ModelState, parts: number): { state: ModelState; kept: boolean } => {
  const old = state.parts;
  if (parts === old) return { state, kept: true };
  if (!state.shaded.length) return { state: { ...state, parts, shaded: [] }, kept: true };
  if (parts % old === 0) {
    const k = parts / old;
    return { state: { ...state, parts, shaded: state.shaded.flatMap((i) => Array.from({ length: k }, (_, j) => i * k + j)) }, kept: true };
  }
  if (old % parts === 0) {
    const k = old / parts;
    const set = new Set(state.shaded);
    const groups = Array.from({ length: parts }, (_, g) => Array.from({ length: k }, (_, j) => set.has(g * k + j)));
    if (groups.every((g) => g.every(Boolean) || g.every((x) => !x))) {
      return { state: { ...state, parts, shaded: groups.flatMap((g, i) => (g[0] ? [i] : [])) }, kept: true };
    }
  }
  return { state: { ...state, parts, shaded: [] }, kept: false };
};

// ---------------------------------------------------------------- targets and scoring

/** The target of model i as a fraction: "=2" follows model 2's target (in the correct response). */
export const targetOf = (setup: Setup, i: number, seen: number[] = []): Fraction | null => {
  const t = setup.models[i]?.target ?? "";
  const ref = /^=\s*(\d+)$/.exec(t);
  if (ref) {
    const j = Number(ref[1]) - 1;
    return j === i || seen.includes(j) ? null : targetOf(setup, j, [...seen, i]);
  }
  return parseFraction(t);
};

/** "=2": the number (0-based) of the model this model's target refers to, or null. */
export const targetRef = (model: Model) => {
  const ref = /^=\s*(\d+)$/.exec(model.target);
  return ref ? Number(ref[1]) - 1 : null;
};

/** The number of parts a shade model gets to show this fraction: its own if it can, else the first in range that can. */
export const partsFor = (model: Model, f: Fraction, current = partsOf(model)): number | null => {
  const fits = (n: number) => (f.n * n) % f.d === 0 && f.n * n <= f.d * n;
  if (f.n > f.d) return null;
  if (fits(current)) return current;
  if (!canDivide(model)) return null;
  for (let n = model.min; n <= model.max; n++) if (fits(n)) return n;
  return null;
};

export type ModelResult = {
  /** the fraction, not in lowest terms; null for an empty or unreadable entry */
  value: Fraction | null;
  /** null when the model has no target */
  passed: boolean | null;
  /** what passed: the fraction, the number of parts, lowest terms */
  fraction: boolean;
  parts: boolean;
  lowest: boolean;
};

export type Evaluation = { results: ModelResult[]; score: number; maxscore: number; correct: boolean };

/**
 * PCI scoring: a model with a target passes when its fraction is equivalent to the target (2/3 = 4/6 = 8/12), it has
 * requireParts parts when set, and (name, simplest) the typed fraction is in lowest terms. A target "=k" compares with
 * what the candidate did in model k. One point per model with a target.
 */
export const evaluate = (setup: Setup, states: ModelState[]): Evaluation => {
  const values = setup.models.map((m, i) => valueOf(m, states[i] ?? startState(m)));
  const results = setup.models.map((m, i): ModelResult => {
    const value = values[i];
    const ref = targetRef(m);
    const target = ref !== null ? (ref !== i ? values[ref] ?? null : null) : parseFraction(m.target);
    const hasTarget = ref !== null ? ref !== i && ref < setup.models.length : !!target;
    const fraction = equivalent(value, target);
    const parts = !m.requireParts || (states[i]?.parts ?? partsOf(m)) === m.requireParts;
    const lowest = !(m.simplest && m.task === "name" && m.entry === "fraction") || (!!value && gcd(value.n, value.d) === 1);
    return { value, passed: hasTarget ? fraction && parts && lowest : null, fraction, parts, lowest };
  });
  const scored = results.filter((r) => r.passed !== null);
  const score = scored.filter((r) => r.passed).length;
  return { results, score, maxscore: scored.length, correct: scored.length > 0 && score === scored.length };
};

/** The response for MATCH_CORRECT: per model the fraction in lowest terms ("3/8"), "" for an empty entry. */
export const matchValues = (setup: Setup, states: ModelState[]) =>
  setup.models.map((m, i) => simplest(valueOf(m, states[i] ?? startState(m))));

/** The correct response of the settings (lowest terms, in model order), or null when a model has no target. */
export const correctValues = (setup: Setup): string[] | null => {
  const values = setup.models.map((_, i) => simplest(targetOf(setup, i)));
  return values.every(Boolean) ? values : null;
};

/**
 * Model states that show these values (a response, a correct response): a shade model shades the first parts, with
 * as many parts as it needs when the candidate may divide; a name model gets the fraction typed in. A value that does
 * not fit a model leaves that model as it was.
 */
export const statesFor = (setup: Setup, values: unknown[], current: ModelState[] = startStates(setup)): ModelState[] =>
  setup.models.map((model, i) => {
    const before = current[i] ?? startState(model);
    const f = parseFraction(values[i]);
    if (!f) return model.task === "name" && values[i] === "" ? { ...before, numerator: "", denominator: "", percent: "" } : before;
    if (model.task === "name") {
      return model.entry === "percent"
        ? { ...before, percent: String(percentOf(f)) }
        : { ...before, numerator: String(f.n), denominator: String(f.d) };
    }
    const parts = partsFor(model, f, before.parts);
    if (parts === null) return before;
    const k = (f.n * parts) / f.d;
    return { ...before, parts, shaded: Array.from({ length: k }, (_, j) => j) };
  });

/** Every model with a target from the settings shaded or filled in as the answer (solution status without a declaration). */
export const solutionStates = (setup: Setup) => {
  const values = setup.models.map((_, i) => simplest(targetOf(setup, i)));
  return statesFor(setup, values);
};

/** The record field `shading`: the parts and shaded parts (or the typed text) per model, for a rater and for setResponse. */
export const shadingJson = (setup: Setup, states: ModelState[]) =>
  JSON.stringify(
    setup.models.map((m, i) => {
      const s = states[i] ?? startState(m);
      if (m.task === "name") return m.entry === "percent" ? { percent: s.percent } : { numerator: s.numerator, denominator: s.denominator };
      return { parts: s.parts, shaded: s.shaded };
    })
  );

// ---------------------------------------------------------------- authoring

export type Problem =
  | { code: "noModels" }
  | { code: "badTarget"; model: number }
  | { code: "badRef"; model: number }
  | { code: "notShadable"; model: number }
  | { code: "nameNoTarget"; model: number }
  | { code: "nameMismatch"; model: number }
  | { code: "partsRange"; model: number }
  | { code: "partsTarget"; model: number };

/** What keeps the setup from working as the author meant (the texts are in texts.ts). */
export const problems = (setup: Setup): Problem[] => {
  const out: Problem[] = [];
  if (!setup.models.length) out.push({ code: "noModels" });
  setup.models.forEach((m, i) => {
    const ref = targetRef(m);
    if (ref !== null) {
      if (ref === i || ref < 0 || ref >= setup.models.length || !targetOf(setup, i)) out.push({ code: "badRef", model: i });
    } else if (m.target && !parseFraction(m.target)) out.push({ code: "badTarget", model: i });
    const target = targetOf(setup, i);
    if (m.task === "name") {
      if (!m.target) out.push({ code: "nameNoTarget", model: i });
      else if (target && !equivalent(target, { n: m.shaded.length, d: partsOf(m) })) out.push({ code: "nameMismatch", model: i });
    } else if (target && partsFor(m, target) === null) out.push({ code: "notShadable", model: i });
    if (m.requireParts && m.task === "shade") {
      if (canDivide(m) ? m.requireParts < m.min || m.requireParts > m.max : m.requireParts !== partsOf(m)) out.push({ code: "partsRange", model: i });
      else if (target && (target.n * m.requireParts) % target.d !== 0) out.push({ code: "partsTarget", model: i });
    }
  });
  return out;
};
