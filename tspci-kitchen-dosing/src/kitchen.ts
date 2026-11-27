// Kitchen and cleaning arithmetic without a screen: the recipes and the cleaning tasks (presets and the author's own),
// scaling a recipe from one number of persons to another, what counts as a sensible rounding per unit, the dose of a
// cleaning product for a bucket of water, the measuring tools and their steps, the margins, the response and the
// correct response. No imports: `npm test` runs it in node as it is.

export type Language = "en" | "nl";
export const languageOf = (language?: string): Language => ((language ?? "").slice(0, 2) === "nl" ? "nl" : "en");

/** A tiny number: two numbers closer than this (relative to 1) are the same. Kitchen amounts never need more. */
const EPS = 1e-6;
/** A number without the noise of floating point: 0.1 + 0.2 is 0.3. */
export const clean = (x: number) => Math.round(x * 1e6) / 1e6;
const same = (a: number, b: number) => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));

// ---- units and tools ----

export type Unit = "g" | "kg" | "ml" | "dl" | "l" | "tbsp" | "tsp" | "piece";
export const UNITS: Unit[] = ["g", "kg", "ml", "dl", "l", "tbsp", "tsp", "piece"];
export const isUnit = (unit: unknown): unit is Unit => UNITS.includes(unit as Unit);

/**
 * How an amount is measured: weighed on a kitchen scale (in grams), poured into a measuring jug (in ml), counted in
 * spoons (tablespoons or teaspoons, in halves) or counted in pieces (eggs, onions: whole). The dosing cup of the cleaning
 * task is a small measuring jug (in ml).
 */
export type Tool = "scale" | "jug" | "spoon" | "pieces" | "cup";

/** The tool for an amount in this unit. */
export function toolOf(unit: Unit): Exclude<Tool, "cup"> {
  if (unit === "g" || unit === "kg") return "scale";
  if (unit === "ml" || unit === "dl" || unit === "l") return "jug";
  if (unit === "tbsp" || unit === "tsp") return "spoon";
  return "pieces";
}

/** One of the unit in the tool's own unit: 1 kg is 1000 g on the scale, 1 dl is 100 ml in the jug. */
export function factorOf(unit: Unit): number {
  if (unit === "kg" || unit === "l") return 1000;
  if (unit === "dl") return 100;
  return 1;
}

/** Amounts that can be weighed or poured: a margin in percent makes sense for them, not for spoons and pieces. */
export const isContinuous = (unit: Unit) => toolOf(unit) === "scale" || toolOf(unit) === "jug";

/**
 * The step of a sensible rounding per unit: whole grams and ml, a hundredth of a kg or litre (10 g, 10 ml), a tenth of
 * a dl (10 ml), half a spoon, a whole piece.
 */
export function roundingStep(unit: Unit): number {
  switch (unit) {
    case "kg":
    case "l":
      return 0.01;
    case "dl":
      return 0.1;
    case "tbsp":
    case "tsp":
      return 0.5;
    default:
      return 1;
  }
}

/**
 * A tool as the pupil uses it: from 0 to `max` in steps of `step` (the arrow keys, the small buttons), `big` for the
 * large buttons and Page Up/Down. A jug or a cup also has its lines: `minor` every so many ml, a number every `major`.
 */
export type ToolSpec = { tool: Tool; max: number; step: number; big: number; minor?: number; major?: number };

/** A round number at or above x: 1, 2, 2.5 or 5 times a power of ten. */
export function niceUp(x: number): number {
  if (x <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * power >= x - EPS) return clean(m * power);
  return clean(10 * power);
}

export const JUG_SIZES = [250, 500, 1000, 2000, 5000];
export const CUP_SIZES = [25, 50, 100, 250];

/**
 * The tool for an amount of `target` in the tool's own unit (grams, ml, spoons, pieces), sized so the target lies well
 * inside it: the scale goes up to at least twice the target, the jug is the smallest that holds it with room to spare.
 */
export function toolSpec(tool: Exclude<Tool, "cup">, target: number): ToolSpec {
  const t = Math.max(0, target);
  switch (tool) {
    case "scale": {
      const [step, big] = t <= 100 ? [1, 10] : t <= 1000 ? [5, 50] : [10, 100];
      return { tool, max: niceUp(Math.max(2 * t, 10 * big)), step, big };
    }
    case "jug": {
      const max = JUG_SIZES.find((size) => size >= 1.2 * t) ?? niceUp(1.2 * t);
      const [step, big, minor, major] =
        max <= 250 ? [5, 25, 10, 50] : max <= 500 ? [5, 50, 25, 100] : max <= 1000 ? [10, 100, 50, 100] : max <= 2000 ? [25, 250, 100, 500] : [50, 500, 250, 1000];
      return { tool, max, step, big, minor, major };
    }
    case "spoon":
      return { tool, max: Math.max(10, Math.ceil(2 * t)), step: 0.5, big: 1 };
    case "pieces":
      return { tool, max: Math.max(12, Math.ceil(2 * t)), step: 1, big: 1 };
  }
}

/** The dosing cup (or cap) of the cleaning task: 25, 50, 100 or 250 ml. */
export function cupSpec(size: number): ToolSpec {
  const max = CUP_SIZES.includes(size) ? size : 50;
  const [step, big, minor, major] = max === 25 ? [1, 5, 1, 5] : max === 50 ? [1, 10, 5, 10] : max === 100 ? [5, 25, 5, 25] : [5, 50, 10, 50];
  return { tool: "cup", max, step, big, minor, major };
}

/** A value of a tool on its steps, between 0 and its max. */
export const snap = (spec: ToolSpec, value: number) => clean(Math.min(spec.max, Math.max(0, Math.round(value / spec.step) * spec.step)));

// ---- numbers as a pupil writes them ----

const FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };

/**
 * A number as a pupil writes it: 375, 37,5 or 37.5, ½, 1½, 1 1/2, 3/4. The comma and the point are both a decimal
 * separator (kitchen amounts have no thousands). Null for anything else (empty, letters, a negative number).
 */
export function parseNumber(text: string | null | undefined): number | null {
  const s = String(text ?? "").trim().replace(/\s+/g, " ");
  if (s === "") return null;
  let m = /^(\d+)(?:[.,](\d+))?$/.exec(s);
  if (m) return Number(`${m[1]}.${m[2] ?? "0"}`);
  m = /^[.,](\d+)$/.exec(s);
  if (m) return Number(`0.${m[1]}`);
  m = /^(?:(\d+) ?)?([½¼¾⅓⅔])$/.exec(s);
  if (m) return clean(Number(m[1] ?? 0) + FRACTIONS[m[2]]);
  m = /^(?:(\d+) )?(\d+) ?\/ ?(\d+)$/.exec(s);
  if (m && Number(m[3]) > 0) return clean(Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]));
  return null;
}

/** A number for the pupil: at most two decimals, a decimal comma in Dutch (37,5), no trailing zeros. */
export function formatNumber(x: number, language: Language): string {
  const text = String(Math.round(x * 100) / 100);
  return language === "nl" ? text.replace(".", ",") : text;
}

/** Spoons and pieces in halves and quarters as a cook writes them: ½, 1½, ¾; other numbers as formatNumber. */
export function formatCount(x: number, language: Language): string {
  const whole = Math.floor(x + EPS);
  const rest = clean(x - whole);
  const glyph = rest === 0.5 ? "½" : rest === 0.25 ? "¼" : rest === 0.75 ? "¾" : null;
  if (rest === 0) return String(whole);
  if (glyph) return whole === 0 ? glyph : `${whole}${glyph}`;
  return formatNumber(x, language);
}

/** An amount in a unit, as the recipe writes it: spoons and pieces with ½, the rest with decimals. */
export const formatAmount = (x: number, unit: Unit, language: Language) =>
  unit === "tbsp" || unit === "tsp" || unit === "piece" ? formatCount(x, language) : formatNumber(x, language);

// ---- scaling and sensible rounding ----

/** The amount for `to` persons of a recipe for `from`: amount × to / from, without rounding. */
export const scaled = (amount: number, from: number, to: number) => clean((amount * to) / from);

/**
 * The sensible roundings of x to a step: the nearest multiple, and both neighbours when x lies exactly halfway
 * (1,5 eggs: 1 or 2). x itself when it is on a step.
 */
export function roundings(x: number, step: number): number[] {
  const q = clean(x / step);
  const lo = Math.floor(q + EPS);
  const hi = Math.ceil(q - EPS);
  if (lo >= hi) return [clean(lo * step)];
  if (same(q - lo, 0.5)) return [clean(lo * step), clean(hi * step)];
  return [clean(Math.round(q) * step)];
}

/**
 * The amounts a pupil may write for an exact scaled amount, besides the exact amount itself:
 * - pieces: a whole number, the nearest (1 or 2 for 1,5); never 0, as a recipe never leaves an egg out;
 * - spoons: the nearest half spoon (½ or 1 for ¾); never 0;
 * - grams, ml: the nearest whole gram or ml; kg, l: the nearest hundredth; dl: the nearest tenth.
 */
export function sensibleAmounts(exact: number, unit: Unit): number[] {
  const step = roundingStep(unit);
  const found = roundings(exact, step).filter((x) => x > 0);
  return found.length ? found : [step];
}

/**
 * Whether a written amount is right for this exact amount: the exact amount (not for pieces: they are whole), a
 * sensible rounding, or (grams, ml and the like) within `marginPercent` of it.
 */
export function amountOk(answer: number | null, exact: number, unit: Unit, marginPercent = 0): boolean {
  if (answer === null || !Number.isFinite(answer) || answer <= 0) return false;
  if (unit === "piece") return Number.isInteger(answer) && sensibleAmounts(exact, unit).some((x) => same(x, answer));
  if (same(answer, exact)) return true;
  if (sensibleAmounts(exact, unit).some((x) => same(x, answer))) return true;
  return isContinuous(unit) && marginPercent > 0 && Math.abs(answer - exact) <= (exact * marginPercent) / 100 + EPS;
}

/**
 * The amount the PCI shows as the correct one (status solution, the author's preview): the exact amount when it has
 * at most two decimals and is not a piece, otherwise its sensible rounding (the larger one when there are two).
 */
export function correctAmount(exact: number, unit: Unit): number {
  if (unit !== "piece" && same(Math.round(exact * 100) / 100, exact)) return clean(exact);
  const options = sensibleAmounts(exact, unit);
  return options[options.length - 1];
}

/**
 * How far a measured amount may be from the target, in the tool's unit: `marginPercent` of the target on a scale, in a
 * jug or a cup, and always at least half a step of the tool (with steps of 5 g, 37,5 g is 35 or 40 g).
 */
export function measureTolerance(target: number, spec: ToolSpec, marginPercent: number): number {
  const percent = spec.tool === "spoon" || spec.tool === "pieces" ? 0 : (Math.abs(target) * marginPercent) / 100;
  return Math.max(percent, spec.step / 2);
}

/** Whether a measured amount (in the tool's unit) is the target within the tolerance. */
export const measureOk = (measured: number, target: number | null, spec: ToolSpec, marginPercent: number) =>
  target !== null && target > 0 && Math.abs(measured - target) <= measureTolerance(target, spec, marginPercent) + EPS;

// ---- recipes ----

export type Icon = "egg" | "onion" | "apple" | "orange" | "banana" | "cube" | "sausage" | "other";
export const ICONS: Icon[] = ["egg", "onion", "apple", "orange", "banana", "cube", "sausage", "other"];

export type Line = {
  name: string;
  amount: number;
  unit: Unit;
  /** The pupil also measures this amount, with the tool of its unit. */
  measure: boolean;
  /** Pieces: how one looks. */
  icon?: Icon;
  /** The colour of the ingredient on the scale, in the jug or on a spoon (#rrggbb). */
  color?: string;
};
export type Recipe = { preset: string | null; name: string; persons: number; lines: Line[] };

type Named = { en: string; nl: string };
type PresetLine = Omit<Line, "name"> & { name: Named };
type PresetRecipe = { name: Named; persons: number; lines: PresetLine[] };

/** At most this many lines in a recipe (the response has line1 … line10). */
export const MAX_LINES = 10;

export const PRESET_RECIPES: Record<string, PresetRecipe> = {
  pancakes: {
    name: { en: "Pancakes", nl: "Pannenkoeken" },
    persons: 4,
    lines: [
      { name: { en: "flour", nl: "bloem" }, amount: 250, unit: "g", measure: true, color: "#f4ead6" },
      { name: { en: "milk", nl: "melk" }, amount: 500, unit: "ml", measure: true, color: "#efede3" },
      { name: { en: "eggs", nl: "eieren" }, amount: 2, unit: "piece", measure: true, icon: "egg" },
      { name: { en: "sugar", nl: "suiker" }, amount: 2, unit: "tbsp", measure: true, color: "#fbfaf6" },
      { name: { en: "butter for frying", nl: "boter om te bakken" }, amount: 50, unit: "g", measure: false, color: "#f7e08a" },
    ],
  },
  stamppot: {
    name: { en: "Mashed potatoes with kale (stamppot)", nl: "Boerenkoolstamppot" },
    persons: 4,
    lines: [
      { name: { en: "potatoes", nl: "aardappels" }, amount: 1, unit: "kg", measure: true, color: "#e9cf8f" },
      { name: { en: "kale, cut", nl: "boerenkool, gesneden" }, amount: 500, unit: "g", measure: false, color: "#5f8f3a" },
      { name: { en: "smoked sausage", nl: "rookworst" }, amount: 1, unit: "piece", measure: true, icon: "sausage" },
      { name: { en: "milk", nl: "melk" }, amount: 150, unit: "ml", measure: true, color: "#efede3" },
      { name: { en: "butter", nl: "boter" }, amount: 2, unit: "tbsp", measure: true, color: "#f7e08a" },
      { name: { en: "mustard", nl: "mosterd" }, amount: 1, unit: "tsp", measure: false, color: "#d9b21f" },
    ],
  },
  soup: {
    name: { en: "Vegetable soup", nl: "Groentesoep" },
    persons: 4,
    lines: [
      { name: { en: "water", nl: "water" }, amount: 1, unit: "l", measure: true, color: "#cfe8f7" },
      { name: { en: "stock cubes", nl: "bouillonblokjes" }, amount: 2, unit: "piece", measure: true, icon: "cube" },
      { name: { en: "soup vegetables", nl: "soepgroente" }, amount: 300, unit: "g", measure: true, color: "#e59b4c" },
      { name: { en: "onion", nl: "ui" }, amount: 1, unit: "piece", measure: false, icon: "onion" },
      { name: { en: "vermicelli", nl: "vermicelli" }, amount: 50, unit: "g", measure: false, color: "#f0dc9c" },
      { name: { en: "oil", nl: "olie" }, amount: 1, unit: "tbsp", measure: false, color: "#e8c547" },
    ],
  },
  fruitSalad: {
    name: { en: "Fruit salad", nl: "Fruitsalade" },
    persons: 4,
    lines: [
      { name: { en: "apples", nl: "appels" }, amount: 2, unit: "piece", measure: true, icon: "apple" },
      { name: { en: "bananas", nl: "bananen" }, amount: 2, unit: "piece", measure: false, icon: "banana" },
      { name: { en: "oranges", nl: "sinaasappels" }, amount: 2, unit: "piece", measure: false, icon: "orange" },
      { name: { en: "yoghurt", nl: "yoghurt" }, amount: 400, unit: "g", measure: true, color: "#f4f1e6" },
      { name: { en: "honey", nl: "honing" }, amount: 2, unit: "tbsp", measure: true, color: "#e0a526" },
    ],
  },
};
export const RECIPE_PRESETS = Object.keys(PRESET_RECIPES);

/** A preset recipe in a language. */
export function presetRecipe(id: string, language: Language): Recipe {
  const p = PRESET_RECIPES[id] ?? PRESET_RECIPES.pancakes;
  return {
    preset: PRESET_RECIPES[id] ? id : "pancakes",
    name: p.name[language],
    persons: p.persons,
    lines: p.lines.map((line) => ({ ...line, name: line.name[language] })),
  };
}

export type Problem =
  | "badRecipe"
  | "noLines"
  | "tooManyLines"
  | "badLine"
  | "badPersons"
  | "badRecipePersons"
  | "badCleaning"
  | "badVolume"
  | "badDosage"
  | "noProduct";

const isColor = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);

/** One line of the author's JSON, or null when it can not be read. */
function lineFrom(raw: unknown): Line | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const amount = typeof r.amount === "number" ? r.amount : parseNumber(String(r.amount ?? ""));
  if (!name || amount === null || !(amount > 0) || !isUnit(r.unit)) return null;
  const line: Line = { name, amount: clean(amount), unit: r.unit, measure: r.measure === true };
  if (ICONS.includes(r.icon as Icon)) line.icon = r.icon as Icon;
  if (isColor(r.color)) line.color = r.color;
  return line;
}

/**
 * The recipe from the `recipe` setting: a preset (`pancakes`, `stamppot`, `soup`, `fruitSalad`), a preset with other
 * lines measured (`{ "preset": "pancakes", "measure": [true, false, …] }`), or the author's own:
 * `{ "name": "Omelette", "persons": 2, "lines": [{ "name": "eggs", "amount": 4, "unit": "piece", "measure": true }] }`.
 * What can not be read gives the pancakes and a problem.
 */
export function recipeFrom(setting: string | undefined, language: Language): { recipe: Recipe; problems: Problem[] } {
  const text = String(setting ?? "").trim();
  if (text === "" || PRESET_RECIPES[text]) return { recipe: presetRecipe(text || "pancakes", language), problems: [] };
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
  } catch {
    return { recipe: presetRecipe("pancakes", language), problems: ["badRecipe"] };
  }
  const problems: Problem[] = [];
  if (typeof raw.preset === "string" && PRESET_RECIPES[raw.preset] && !Array.isArray(raw.lines)) {
    const recipe = presetRecipe(raw.preset, language);
    if (Array.isArray(raw.measure)) recipe.lines = recipe.lines.map((line, i) => ({ ...line, measure: raw.measure[i] === true }));
    return { recipe, problems };
  }
  const rawLines = Array.isArray(raw.lines) ? raw.lines : [];
  let lines = rawLines.map(lineFrom);
  if (lines.some((line) => line === null)) problems.push("badLine");
  lines = lines.filter((line) => line !== null);
  if (lines.length > MAX_LINES) {
    problems.push("tooManyLines");
    lines = lines.slice(0, MAX_LINES);
  }
  if (lines.length === 0) problems.push("noLines");
  const persons = Number(raw.persons);
  const goodPersons = Number.isInteger(persons) && persons >= 1 && persons <= 100;
  if (!goodPersons) problems.push("badRecipePersons");
  return {
    recipe: { preset: null, name: typeof raw.name === "string" ? raw.name.trim() : "", persons: goodPersons ? persons : 4, lines: lines as Line[] },
    problems,
  };
}

/** The recipe as the `recipe` setting: the preset's id, a preset with other lines measured, or JSON of the author's own. */
export function recipeSetting(recipe: Recipe): string {
  if (recipe.preset && PRESET_RECIPES[recipe.preset]) {
    const preset = PRESET_RECIPES[recipe.preset];
    const measure = recipe.lines.map((line) => line.measure);
    if (measure.every((m, i) => m === preset.lines[i].measure)) return recipe.preset;
    return JSON.stringify({ preset: recipe.preset, measure });
  }
  return JSON.stringify({
    name: recipe.name,
    persons: recipe.persons,
    lines: recipe.lines.map((line) => {
      const out: Record<string, unknown> = { name: line.name, amount: line.amount, unit: line.unit, measure: line.measure };
      if (line.icon) out.icon = line.icon;
      if (line.color) out.color = line.color;
      return out;
    }),
  });
}

// ---- cleaning ----

export type Surface = "floor" | "worktop" | "sanitary" | "window";
export const SURFACES: Surface[] = ["floor", "worktop", "sanitary", "window"];
/** The GHS hazard pictograms the labels use (drawn by the PCI): GHS02, GHS05, GHS07, GHS09. */
export type Hazard = "flame" | "corrosive" | "exclamation" | "environment";
export const HAZARDS: Hazard[] = ["flame", "corrosive", "exclamation", "environment"];

/** A dosage on a label: 1 part to `parts` parts of water ("1 : 100"), or `ml` per litre of water ("20 ml per litre"). */
export type Dosage = { kind: "ratio"; parts: number } | { kind: "perLitre"; ml: number };

export type Product = { id: string; surfaces: Surface[]; dosage: Dosage; hazards: Hazard[]; color: string; ink: string };

/** The built-in products: stylised, no brand. Names and the texts on the label are in texts.ts. */
export const PRESET_PRODUCTS: Record<string, Product> = {
  floor: { id: "floor", surfaces: ["floor"], dosage: { kind: "ratio", parts: 100 }, hazards: ["exclamation"], color: "#0072b2", ink: "#ffffff" },
  allPurpose: { id: "allPurpose", surfaces: ["worktop"], dosage: { kind: "perLitre", ml: 20 }, hazards: ["exclamation"], color: "#009e73", ink: "#0b1f17" },
  sanitary: { id: "sanitary", surfaces: ["sanitary"], dosage: { kind: "ratio", parts: 50 }, hazards: ["corrosive", "environment"], color: "#cc79a7", ink: "#2a0f1f" },
  glass: { id: "glass", surfaces: ["window"], dosage: { kind: "ratio", parts: 200 }, hazards: ["flame"], color: "#56b4e9", ink: "#0b2233" },
};
export const PRODUCT_IDS = Object.keys(PRESET_PRODUCTS);

export type Cleaning = {
  /** The preset the task started from, if any. */
  preset: string | null;
  surface: Surface;
  /** Litres of water in the bucket. */
  volume: number;
  /** The products on the shelf, in order. */
  products: Product[];
  /** The pupil chooses the product (otherwise only the right one is shown). */
  choose: boolean;
  /** Size of the dosing cup in ml: 25, 50, 100 or 250. */
  cup: number;
};

type PresetTask = { surface: Surface; volume: number; products: string[]; cup: number };
export const PRESET_TASKS: Record<string, PresetTask> = {
  floor: { surface: "floor", volume: 5, products: ["floor", "allPurpose", "sanitary"], cup: 100 },
  worktop: { surface: "worktop", volume: 2, products: ["floor", "allPurpose", "glass"], cup: 50 },
  sanitary: { surface: "sanitary", volume: 4, products: ["allPurpose", "sanitary", "floor"], cup: 50 },
  window: { surface: "window", volume: 3, products: ["sanitary", "allPurpose", "glass"], cup: 25 },
};
export const TASK_PRESETS = Object.keys(PRESET_TASKS);

/** A dosage as the author writes it: "1:100", "1 : 50", "1 op 100", "20 ml/l", "20 ml per litre". Null otherwise. */
export function parseDosage(text: unknown): Dosage | null {
  const s = String(text ?? "").trim().toLowerCase();
  let m = /^1\s*(?::|op|in|to)\s*(\d+(?:[.,]\d+)?)$/.exec(s);
  if (m) {
    const parts = parseNumber(m[1]);
    return parts && parts > 0 ? { kind: "ratio", parts } : null;
  }
  m = /^(\d+(?:[.,]\d+)?)\s*ml\s*(?:\/|per)\s*(?:l|liter|litre)$/.exec(s);
  if (m) {
    const ml = parseNumber(m[1]);
    return ml && ml > 0 ? { kind: "perLitre", ml } : null;
  }
  return null;
}

/** A dosage as the `cleaning` setting writes it: "1:100" or "20 ml/l". */
export const dosageSetting = (d: Dosage) => (d.kind === "ratio" ? `1:${d.parts}` : `${d.ml} ml/l`);

/** A dosage as the label shows it: "1 : 100", "20 ml per litre" (Dutch: "20 ml per liter"). */
export const dosageText = (d: Dosage, language: Language) =>
  d.kind === "ratio" ? `1 : ${formatNumber(d.parts, language)}` : `${formatNumber(d.ml, language)} ml per ${language === "nl" ? "liter" : "litre"}`;

/** The ml of product for a bucket of `volume` litres: 5 l at 1 : 100 is 50 ml, 5 l at 20 ml per litre is 100 ml. */
export const doseFor = (d: Dosage, volume: number) => clean(d.kind === "ratio" ? (volume * 1000) / d.parts : volume * d.ml);

/** A preset task. */
export function presetCleaning(id: string): Cleaning {
  const p = PRESET_TASKS[id] ?? PRESET_TASKS.floor;
  return { preset: PRESET_TASKS[id] ? id : "floor", surface: p.surface, volume: p.volume, products: p.products.map((pid) => PRESET_PRODUCTS[pid]), choose: true, cup: p.cup };
}

/**
 * The cleaning task from the `cleaning` setting: a preset (`floor`, `worktop`, `sanitary`, `window`) or JSON:
 * `{ "surface": "floor", "volume": 5, "products": ["floor", "allPurpose"], "dosages": { "floor": "1:100" }, "choose": true, "cup": 100 }`.
 * Products are the built-in ones; `dosages` gives one another dosage. What can not be read gives the floor and a problem.
 */
export function cleaningFrom(setting: string | undefined): { cleaning: Cleaning; problems: Problem[] } {
  const text = String(setting ?? "").trim();
  if (text === "" || PRESET_TASKS[text]) return { cleaning: presetCleaning(text || "floor"), problems: [] };
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
  } catch {
    return { cleaning: presetCleaning("floor"), problems: ["badCleaning"] };
  }
  const problems: Problem[] = [];
  const base = presetCleaning(typeof raw.preset === "string" ? raw.preset : String(raw.surface ?? "floor"));
  const surface = SURFACES.includes(raw.surface as Surface) ? (raw.surface as Surface) : base.surface;
  const volume = typeof raw.volume === "number" ? raw.volume : raw.volume === undefined ? base.volume : parseNumber(String(raw.volume));
  const goodVolume = volume !== null && volume > 0 && volume <= 100;
  if (!goodVolume) problems.push("badVolume");
  const dosages = raw.dosages && typeof raw.dosages === "object" ? (raw.dosages as Record<string, unknown>) : {};
  const ids = Array.isArray(raw.products) ? raw.products.filter((id): id is string => typeof id === "string" && !!PRESET_PRODUCTS[id]) : base.products.map((p) => p.id);
  const products = [...new Set(ids)].map((id) => {
    if (dosages[id] === undefined) return PRESET_PRODUCTS[id];
    const dosage = parseDosage(dosages[id]);
    if (!dosage) problems.push("badDosage");
    return { ...PRESET_PRODUCTS[id], dosage: dosage ?? PRESET_PRODUCTS[id].dosage };
  });
  const cup = CUP_SIZES.includes(Number(raw.cup)) ? Number(raw.cup) : base.cup;
  return {
    cleaning: { preset: typeof raw.preset === "string" && PRESET_TASKS[raw.preset] ? raw.preset : null, surface, volume: goodVolume ? clean(volume!) : base.volume, products, choose: raw.choose !== false, cup },
    problems: [...new Set(problems)],
  };
}

/** The task as the `cleaning` setting: JSON, with the dosages that differ from the built-in ones. */
export function cleaningSetting(c: Cleaning): string {
  const dosages: Record<string, string> = {};
  for (const p of c.products) if (dosageSetting(p.dosage) !== dosageSetting(PRESET_PRODUCTS[p.id].dosage)) dosages[p.id] = dosageSetting(p.dosage);
  const out: Record<string, unknown> = { surface: c.surface, volume: c.volume, products: c.products.map((p) => p.id) };
  if (Object.keys(dosages).length) out.dosages = dosages;
  out.choose = c.choose;
  out.cup = c.cup;
  if (c.preset) out.preset = c.preset;
  return JSON.stringify(out);
}

/** The right product for the surface: the first on the shelf that is for it. */
export const rightProduct = (c: Cleaning) => c.products.find((p) => p.surfaces.includes(c.surface)) ?? null;

// ---- the task from the settings ----

/** The settings as the PCI receives them (strings). */
export type Settings = Partial<Record<"mode" | "recipe" | "persons" | "bowl" | "cleaning" | "amountMargin" | "measureMargin" | "language", string>>;

/** A line of the recipe with what the PCI needs to check it. */
export type LineModel = {
  line: Line;
  /** The amount for the asked persons, unrounded. */
  exact: number;
  /** The amount shown as the correct one. */
  correct: number;
  /** The tool, when the pupil measures this line. */
  spec: ToolSpec | null;
};

export type RecipeModel = {
  mode: "recipe";
  language: Language;
  recipe: Recipe;
  /** The persons the pupil cooks for. */
  persons: number;
  /** The weight of the bowl on the scale (0: no bowl, nothing to tare). */
  bowl: number;
  lines: LineModel[];
  amountMargin: number;
  measureMargin: number;
  problems: Problem[];
};

export type DosingModel = {
  mode: "dosing";
  language: Language;
  cleaning: Cleaning;
  /** The products the pupil sees: all of them, or only the right one. */
  shelf: Product[];
  right: Product | null;
  /** The right dose in ml, unrounded. */
  dose: number;
  /** The dose shown as the correct one. */
  correct: number;
  spec: ToolSpec;
  amountMargin: number;
  measureMargin: number;
  problems: Problem[];
};

export type Model = RecipeModel | DosingModel;

/** The weight of the bowl on the kitchen scale. */
export const BOWL_GRAMS = 150;

const percent = (text: string | undefined, fallback: number) => {
  const n = parseNumber(text);
  return n === null || n > 100 ? fallback : n;
};

export function modelFrom(settings: Settings): Model {
  const language = languageOf(settings.language);
  const amountMargin = percent(settings.amountMargin, 0);
  const measureMargin = percent(settings.measureMargin, 5);
  if (settings.mode === "dosing") {
    const { cleaning, problems } = cleaningFrom(settings.cleaning);
    const right = rightProduct(cleaning);
    if (!right) problems.push("noProduct");
    const dose = right ? doseFor(right.dosage, cleaning.volume) : 0;
    return {
      mode: "dosing",
      language,
      cleaning,
      shelf: cleaning.choose ? cleaning.products : right ? [right] : [],
      right,
      dose,
      correct: correctAmount(dose, "ml"),
      spec: cupSpec(cleaning.cup),
      amountMargin,
      measureMargin,
      problems,
    };
  }
  const { recipe, problems } = recipeFrom(settings.recipe, language);
  const n = Number(String(settings.persons ?? "").trim());
  const goodPersons = Number.isInteger(n) && n >= 1 && n <= 100;
  if (!goodPersons) problems.push("badPersons");
  const persons = goodPersons ? n : 6;
  const lines = recipe.lines.map((line) => {
    const exact = scaled(line.amount, recipe.persons, persons);
    const correct = correctAmount(exact, line.unit);
    const spec = line.measure ? toolSpec(toolOf(line.unit), correct * factorOf(line.unit)) : null;
    return { line, exact, correct, spec };
  });
  return { mode: "recipe", language, recipe, persons, bowl: settings.bowl === "false" ? 0 : BOWL_GRAMS, lines, amountMargin, measureMargin, problems };
}

// ---- the pupil's work, the response ----

/**
 * The pupil's work (the state of the PCI):
 * - amounts: what the pupil wrote per line of the recipe (dosing: one, the ml of product), as typed;
 * - content: per line, what is in its tool, in the tool's unit (grams on the scale, ml in the jug, spoons, pieces;
 *   dosing: ml in the cup);
 * - tare: per line, what the scale subtracts (the tare button): the display shows bowl + content − tare;
 * - product: the chosen product (dosing), "" for none;
 * - pours: the ml poured into the bucket, one entry per pour (dosing).
 */
export type Work = { amounts: string[]; content: number[]; tare: number[]; product: string; pours: number[] };

export const emptyWork = (model: Model): Work => {
  const n = model.mode === "recipe" ? model.lines.length : 1;
  return { amounts: Array(n).fill(""), content: Array(n).fill(0), tare: Array(n).fill(0), product: "", pours: [] };
};

/** What the scale shows: the bowl and the ingredient, minus what the tare took off. */
export const scaleDisplay = (bowl: number, content: number, tare: number) => clean(bowl + content - tare);

/** The ml poured into the bucket. */
export const pouredOf = (work: Work) => clean(work.pours.reduce((sum, ml) => sum + ml, 0));

/** The pupil did something that counts: wrote an amount, measured, chose a product or poured. */
export const answered = (work: Work) =>
  work.amounts.some((a) => a.trim() !== "") || work.content.some((c) => c > 0) || work.product !== "" || work.pours.length > 0;

/** The checks of the work, per line and in all. */
export type Checks = {
  /** Per line: the amount is right, and (when measured) the measured amount is the amount the pupil wrote. */
  lines: boolean[];
  amountsCorrect: boolean;
  /** Undefined when nothing is measured. */
  measuredCorrect: boolean | undefined;
  /** Dosing with a choice: the chosen product ("" for none). */
  product: string | undefined;
  productCorrect: boolean;
  correct: boolean;
};

export function checksOf(model: Model, work: Work): Checks {
  if (model.mode === "dosing") {
    const written = parseNumber(work.amounts[0]);
    const amountRight = model.right !== null && amountOk(written, model.dose, "ml", model.amountMargin);
    const measuredRight = measureOk(pouredOf(work), written, model.spec, model.measureMargin);
    const productCorrect = !model.cleaning.choose || (model.right !== null && work.product === model.right.id);
    return {
      lines: [amountRight && measuredRight],
      amountsCorrect: amountRight,
      measuredCorrect: measuredRight,
      product: model.cleaning.choose ? work.product : undefined,
      productCorrect,
      correct: amountRight && measuredRight && productCorrect,
    };
  }
  const amounts = model.lines.map((l, i) => amountOk(parseNumber(work.amounts[i]), l.exact, l.line.unit, model.amountMargin));
  const measured = model.lines.map((l, i) => {
    if (!l.spec) return true;
    const written = parseNumber(work.amounts[i]);
    return measureOk(work.content[i] ?? 0, written === null ? null : written * factorOf(l.line.unit), l.spec, model.measureMargin);
  });
  const anyMeasured = model.lines.some((l) => l.spec);
  const amountsCorrect = amounts.every(Boolean);
  const measuredCorrect = anyMeasured ? measured.every(Boolean) : undefined;
  return {
    lines: amounts.map((ok, i) => ok && measured[i]),
    amountsCorrect,
    measuredCorrect,
    product: undefined,
    productCorrect: true,
    correct: amountsCorrect && measuredCorrect !== false,
  };
}

/** The work as the `work` field: the amounts written, the amounts measured (in the line's unit), the product, the pours. */
export function workText(model: Model, work: Work): string {
  if (model.mode === "dosing") {
    const out: Record<string, unknown> = { amounts: [work.amounts[0] ?? ""], measured: [pouredOf(work)] };
    if (model.cleaning.choose) out.product = work.product;
    out.pours = work.pours;
    return JSON.stringify(out);
  }
  return JSON.stringify({
    amounts: model.lines.map((_, i) => work.amounts[i] ?? ""),
    measured: model.lines.map((l, i) => (l.spec ? clean((work.content[i] ?? 0) / factorOf(l.line.unit)) : null)),
  });
}

type Field = { name: string; base: { boolean: boolean } | { identifier: string } | { string: string } };
export type RecordResponse = { record: Field[] };

const fieldsOf = (model: Model, checks: Checks): Field[] => {
  const fields: Field[] = checks.lines.map((ok, i) => ({ name: `line${i + 1}`, base: { boolean: ok } }));
  fields.push({ name: "amountsCorrect", base: { boolean: checks.amountsCorrect } });
  if (checks.measuredCorrect !== undefined) fields.push({ name: "measuredCorrect", base: { boolean: checks.measuredCorrect } });
  if (model.mode === "dosing" && checks.product) fields.push({ name: "product", base: { identifier: checks.product } });
  fields.push({ name: "correct", base: { boolean: checks.correct } });
  return fields;
};

/** The response: undefined until the pupil did something. */
export function responseFor(model: Model, work: Work): RecordResponse | undefined {
  if (!answered(work)) return undefined;
  return { record: [...fieldsOf(model, checksOf(model, work)), { name: "work", base: { string: workText(model, work) } }] };
}

/** The work of a pupil who does everything right: the correct amounts written and measured, the right product. */
export function correctWork(model: Model): Work {
  const work = emptyWork(model);
  if (model.mode === "dosing") {
    work.amounts[0] = formatNumber(model.correct, model.language);
    work.product = model.right?.id ?? "";
    let left = model.correct;
    while (left > EPS) {
      const pour = snap(model.spec, Math.min(left, model.spec.max));
      if (pour <= 0) break;
      work.pours.push(pour);
      left = clean(left - pour);
    }
    return work;
  }
  model.lines.forEach((l, i) => {
    work.amounts[i] = formatAmount(l.correct, l.line.unit, model.language);
    if (l.spec) {
      work.content[i] = snap(l.spec, l.correct * factorOf(l.line.unit));
      if (l.spec.tool === "scale") work.tare[i] = model.bowl;
    }
  });
  return work;
}

/**
 * The correct response from the settings: every check true and the right product. Without `work`, which differs from
 * pupil to pupil: score with `custom` on the fields. Undefined when the settings have a problem.
 */
export function correctFor(model: Model): RecordResponse | undefined {
  if (model.problems.length) return undefined;
  if (model.mode === "dosing" && !model.right) return undefined;
  return { record: fieldsOf(model, checksOf(model, correctWork(model))) };
}

/** The fields of a response a player hands back: a record, as { name: value }. */
export function readResponse(value: unknown): Record<string, unknown> {
  const record = (value as { record?: { name?: string; base?: Record<string, unknown> }[] } | undefined)?.record;
  if (!Array.isArray(record)) return {};
  return Object.fromEntries(record.filter((f) => typeof f?.name === "string").map((f) => [f.name!, f.base ? Object.values(f.base)[0] : undefined]));
}

/**
 * The work from a `work` field (setResponse, boundTo): amounts, measured amounts, product and pours. A measured amount
 * goes back into its tool, with the scale tared, so the scale shows it. Null when it can not be read.
 */
export function workFrom(model: Model, text: unknown): Work | null {
  if (typeof text !== "string") return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.amounts)) return null;
  const work = emptyWork(model);
  work.amounts = work.amounts.map((_, i) => (typeof raw.amounts[i] === "string" ? raw.amounts[i] : ""));
  const measured = Array.isArray(raw.measured) ? raw.measured : [];
  if (model.mode === "dosing") {
    work.product = typeof raw.product === "string" ? raw.product : "";
    work.pours = Array.isArray(raw.pours) ? raw.pours.filter((ml): ml is number => typeof ml === "number" && ml > 0) : [];
    if (!work.pours.length && typeof measured[0] === "number" && measured[0] > 0) work.pours = [measured[0]];
    return work;
  }
  model.lines.forEach((l, i) => {
    const m = measured[i];
    if (!l.spec || typeof m !== "number" || !(m >= 0)) return;
    work.content[i] = clean(m * factorOf(l.line.unit));
    if (l.spec.tool === "scale") work.tare[i] = model.bowl;
  });
  return work;
}

/** A saved work of this PCI for this model (an older or foreign one is not). */
export function isWork(work: unknown, model: Model): work is Work {
  const w = work as Partial<Work> | undefined;
  const n = model.mode === "recipe" ? model.lines.length : 1;
  const numbers = (a: unknown) => Array.isArray(a) && a.every((x) => typeof x === "number" && Number.isFinite(x));
  return (
    !!w &&
    Array.isArray(w.amounts) &&
    w.amounts.length === n &&
    w.amounts.every((a) => typeof a === "string") &&
    numbers(w.content) &&
    w.content!.length === n &&
    numbers(w.tare) &&
    w.tare!.length === n &&
    typeof w.product === "string" &&
    numbers(w.pours)
  );
}
