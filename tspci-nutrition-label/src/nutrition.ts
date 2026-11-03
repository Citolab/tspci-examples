// The logic of the nutrition label PCI, without imports (tested in node with npm test): the products and their
// nutrition tables, the reference intakes per target group, a meal (product → grams), its totals and the author's
// checks, the plan as JSON (data-plan), products as tab separated text (a spreadsheet paste) and numbers per language.

/** The nutrients of an EU nutrition table (Regulation 1169/2011), in its order, and some vitamins and minerals. */
export const CORE = ["energyKj", "energyKcal", "fat", "saturates", "carbs", "sugars", "fibre", "protein", "salt"] as const;
export const EXTRAS = ["vitaminC", "calcium", "iron"] as const;
export const NUTRIENTS = [...CORE, ...EXTRAS] as const;
export type Nutrient = (typeof NUTRIENTS)[number];

/** The unit of each nutrient. */
export const UNIT: Record<Nutrient, string> = {
  energyKj: "kJ", energyKcal: "kcal", fat: "g", saturates: "g", carbs: "g", sugars: "g", fibre: "g", protein: "g", salt: "g",
  vitaminC: "mg", calcium: "mg", iron: "mg",
};

/** Decimals a total is shown and checked with: what the candidate sees is what is scored. */
export const DECIMALS: Record<Nutrient, number> = {
  energyKj: 0, energyKcal: 0, fat: 1, saturates: 1, carbs: 1, sugars: 1, fibre: 1, protein: 1, salt: 2,
  vitaminC: 0, calcium: 0, iron: 1,
};

/** "of which …" rows of the table: indented under the one before. */
export const SUB: Partial<Record<Nutrient, true>> = { saturates: true, sugars: true };

/** The groups of the Dutch "Schijf van Vijf" (2016), and products outside it. */
export const GROUPS = ["fruitVeg", "fats", "protein", "starch", "drinks", "outside"] as const;
export type Group = (typeof GROUPS)[number];

export type Values = Partial<Record<Nutrient, number>>;

export type Product = {
  /** A QTI identifier: the select mode's response, and the key in the composition. */
  id: string;
  name: string;
  group: Group | null;
  /** grams in a portion; 0: no portion */
  portion: number;
  /** "1 slice", "1 glass (250 ml)" */
  portionLabel: string;
  /** per 100 g */
  per100: Values;
};

export const TARGET_GROUPS = ["adult", "teen", "child", "custom"] as const;
export type TargetGroup = (typeof TARGET_GROUPS)[number];

/**
 * Reference intakes per day. Adults: the EU reference intakes (fibre has none in the EU: 30 g, the Dutch advice for
 * adults). Teenagers (13–18) and children (4–8): approximate values for practice, derived from Dutch advice; check the
 * current advice before using them as facts.
 */
export const REFERENCES: Record<Exclude<TargetGroup, "custom">, Values> = {
  adult: { energyKj: 8400, energyKcal: 2000, fat: 70, saturates: 20, carbs: 260, sugars: 90, fibre: 30, protein: 50, salt: 6, vitaminC: 80, calcium: 800, iron: 14 },
  teen: { energyKj: 10500, energyKcal: 2500, fat: 85, saturates: 25, carbs: 320, sugars: 110, fibre: 35, protein: 60, salt: 6, vitaminC: 75, calcium: 1100, iron: 13 },
  child: { energyKj: 6700, energyKcal: 1600, fat: 55, saturates: 17, carbs: 210, sugars: 70, fibre: 20, protein: 25, salt: 3.5, vitaminC: 40, calcium: 700, iron: 8 },
};

export type Reference = { group: TargetGroup; values: Values };

export type CheckType = "nutrient" | "count" | "groups" | "required" | "forbidden";
export type Check = {
  type: CheckType;
  /** nutrient: the total of this nutrient */
  nutrient?: Nutrient;
  /** nutrient: the bounds in the nutrient's unit, or with `ri` in % of the reference intake; count / groups: products / groups */
  min?: number | null;
  max?: number | null;
  /** nutrient: min and max are percentages of the reference intake */
  ri?: boolean;
  /** required: all of these in the meal; forbidden: none of these */
  products?: string[];
  points?: number;
};
export const MAX_CHECKS = 8;

export type Plan = {
  products: Product[];
  reference: Reference;
  /** compose: the checks the PCI scores */
  checks: Check[];
  /** compose: the author's model answer (product → grams), shown in solution status */
  solution: Record<string, number> | null;
  /** select: the product that is the answer */
  answer: string | null;
};

export type Mode = "compose" | "select" | "tool";
export const parseMode = (v: unknown): Mode => (v === "select" || v === "tool" ? v : "compose");
export type AmountUnit = "both" | "grams" | "portions";
export const parseAmountUnit = (v: unknown): AmountUnit => (v === "grams" || v === "portions" ? v : "both");
export const parseBoolean = (v: unknown, fallback: boolean) => (v === undefined || v === null || v === "" ? fallback : String(v).toLowerCase() === "true");

// ---------------------------------------------------------------------------------------------------------------
// Numbers

/**
 * Text as a number: 1.5, 1,5, 1 234,5, 1.234,5, -3. With both a point and a comma the last one is the decimal sign;
 * one comma is a decimal comma; a point that groups thousands (1.234) with a decimal comma is a thousands separator.
 * Not a number: null.
 */
export const parseNumber = (text: unknown, decimal?: "." | ","): number | null => {
  let t = String(text ?? "").trim().replace(/[\s  ]/g, "").replace(/[−–]/g, "-").replace(/^\+/, "");
  if (!t) return null;
  const point = t.lastIndexOf(".");
  const comma = t.lastIndexOf(",");
  if (point >= 0 && comma >= 0) t = point > comma ? t.replace(/,/g, "") : t.replace(/\./g, "").replace(",", ".");
  else if (comma >= 0) t = /^-?\d{1,3}(,\d{3}){2,}$/.test(t) || (decimal === "." && /^-?\d{1,3}(,\d{3})+$/.test(t)) ? t.replace(/,/g, "") : t.replace(",", ".");
  else if (point >= 0 && (/^-?\d{1,3}(\.\d{3}){2,}$/.test(t) || (decimal === "," && /^-?\d{1,3}(\.\d{3})+$/.test(t)))) t = t.replace(/\./g, "");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export const round = (n: number, decimals: number) => {
  const f = Math.pow(10, decimals);
  return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
};

/** A number the language's way: 1.5 (en), 1,5 (nl); thousands grouped from 10 000 (nl: 10.000, en: 10,000). */
export const formatNumber = (n: number, language: string, decimals = 1, trim = true) => {
  const nl = String(language ?? "").slice(0, 2).toLowerCase() === "nl";
  let text = round(n, decimals).toFixed(decimals);
  if (trim && text.includes(".")) text = text.replace(/\.?0+$/, "");
  const negative = text.startsWith("-");
  if (negative) text = text.slice(1);
  let [int, frac] = text.split(".");
  if (int.length > 4) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, nl ? "." : ",");
  const out = frac !== undefined ? `${int}${nl ? "," : "."}${frac}` : int;
  return negative && out !== "0" ? `−${out}` : out;
};

/** A value of a nutrient the language's way, with its decimals (a label shows what it has, up to the total's decimals). */
export const formatValue = (n: number, nutrient: Nutrient, language: string) => formatNumber(n, language, Math.max(DECIMALS[nutrient], nutrient === "salt" ? 2 : 1));

// ---------------------------------------------------------------------------------------------------------------
// Products

/** The energy in both units: a missing one from the other (1 kcal = 4.184 kJ). */
export const withEnergy = (v: Values): Values => {
  const out = { ...v };
  if (out.energyKj === undefined && out.energyKcal !== undefined) out.energyKj = round(out.energyKcal * 4.184, 0);
  if (out.energyKcal === undefined && out.energyKj !== undefined) out.energyKcal = round(out.energyKj / 4.184, 0);
  return out;
};

/** What `grams` of a product contain. */
export const amountOf = (product: Product, grams: number): Values => {
  const v = withEnergy(product.per100);
  const out: Values = {};
  for (const n of NUTRIENTS) if (v[n] !== undefined) out[n] = (v[n]! * grams) / 100;
  return out;
};

export const perPortion = (product: Product): Values | null => (product.portion > 0 ? amountOf(product, product.portion) : null);

/** A QTI identifier: a letter or _, then letters, digits, -, _ or . */
export const isIdentifier = (id: string) => /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(id);

/** An id from a name: "Volkoren brood" → "volkorenBrood". */
export const idFrom = (name: string) => {
  const words = String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const id = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join("");
  return id ? (/^[0-9]/.test(id) ? `p${id}` : id) : "product";
};

const GROUP_ALIASES: Record<string, Group> = {
  fruitveg: "fruitVeg", fruit: "fruitVeg", vegetables: "fruitVeg", groente: "fruitVeg", "groenteenfruit": "fruitVeg", "1": "fruitVeg",
  fats: "fats", fat: "fats", vetten: "fats", "smeerenkookvetten": "fats", "2": "fats",
  protein: "protein", dairy: "protein", zuivel: "protein", eiwit: "protein", "3": "protein",
  starch: "starch", bread: "starch", brood: "starch", graan: "starch", "4": "starch",
  drinks: "drinks", dranken: "drinks", drink: "drinks", "5": "drinks",
  outside: "outside", buiten: "outside", "buitendeschijf": "outside", none: "outside", "0": "outside",
};
export const parseGroup = (v: unknown): Group | null => {
  const key = String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key) return null;
  return (GROUPS as readonly string[]).includes(String(v)) ? (v as Group) : GROUP_ALIASES[key] ?? null;
};

/** Column headers of a product table, in English and Dutch (lower case, without spaces and punctuation). */
const COLUMNS: Record<string, string[]> = {
  id: ["id", "code", "identifier"],
  name: ["name", "product", "naam"],
  group: ["group", "groep", "schijfvanvijf", "schijf", "vak"],
  portion: ["portion", "portiong", "portiongram", "portie", "portieg", "portiegram"],
  portionLabel: ["portionlabel", "portionname", "portieomschrijving", "portienaam", "omschrijving"],
  energyKj: ["energykj", "kj", "energiekj", "energy"],
  energyKcal: ["energykcal", "kcal", "energiekcal"],
  fat: ["fat", "vet", "vetten"],
  saturates: ["saturates", "saturatedfat", "ofwhichsaturates", "verzadigd", "verzadigdevetzuren", "waarvanverzadigdevetzuren", "waarvanverzadigd"],
  carbs: ["carbs", "carbohydrate", "carbohydrates", "koolhydraten"],
  sugars: ["sugars", "sugar", "ofwhichsugars", "suikers", "waarvansuikers"],
  fibre: ["fibre", "fiber", "vezels", "voedingsvezel", "voedingsvezels"],
  protein: ["protein", "proteins", "eiwit", "eiwitten"],
  salt: ["salt", "zout"],
  vitaminC: ["vitaminc", "vitc", "vitaminecmg", "vitaminec", "vitaminc_mg", "vitamincmg"],
  calcium: ["calcium", "calciummg", "ca"],
  iron: ["iron", "ironmg", "ijzer", "ijzermg", "fe"],
};
/** The columns of a product table without headers, and of the copy (toTSV). */
export const TSV_COLUMNS = ["id", "name", "group", "portion", "portionLabel", ...NUTRIENTS] as const;

const headerKey = (cell: string) => {
  const k = String(cell ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const per = k.replace(/(per100g|per100|100g)$/, "");
  const tries = [k, per, per.replace(/(mg|g)$/, "")];
  for (const t of tries) for (const [col, names] of Object.entries(COLUMNS)) if (names.includes(t)) return col;
  return null;
};

/** Tab separated text (from a spreadsheet) → rows of cells. Empty lines go. */
export const parseTSV = (text: string): string[][] =>
  String(text ?? "").replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "").map((line) => (line.includes("\t") ? line.split("\t") : line.split(";")));

export type ParsedProducts = { products: Product[]; problems: { line: number; what: string; detail?: string }[] };

/**
 * A product table pasted from a spreadsheet: a header row (English or Dutch names, in any order) or the columns of
 * TSV_COLUMNS. Numbers per 100 g, with a decimal point or comma. A missing id comes from the name; empty cells are
 * not on the label.
 */
export const parseProducts = (text: string): ParsedProducts => {
  const rows = parseTSV(text);
  const problems: ParsedProducts["problems"] = [];
  if (!rows.length) return { products: [], problems };
  const header = rows[0].map(headerKey);
  const hasHeader = header.filter(Boolean).length >= 2 && header.includes("name");
  const columns: (string | null)[] = hasHeader ? header : [...TSV_COLUMNS];
  const products: Product[] = [];
  const seen = new Set<string>();
  rows.slice(hasHeader ? 1 : 0).forEach((cells, i) => {
    const line = i + (hasHeader ? 2 : 1);
    const cell = (col: string) => {
      const at = columns.indexOf(col);
      return at >= 0 ? String(cells[at] ?? "").trim() : "";
    };
    const name = cell("name");
    if (!name) return problems.push({ line, what: "noName" });
    let id = cell("id") || idFrom(name);
    if (!isIdentifier(id)) {
      problems.push({ line, what: "badId", detail: id });
      id = idFrom(id);
    }
    let unique = id;
    for (let k = 2; seen.has(unique); k++) unique = `${id}${k}`;
    if (unique !== id) problems.push({ line, what: "duplicateId", detail: id });
    seen.add(unique);
    const per100: Values = {};
    for (const n of NUTRIENTS) {
      const raw = cell(n);
      if (!raw || raw === "-" || raw === "–") continue;
      const v = parseNumber(raw);
      if (v === null || v < 0) problems.push({ line, what: "badNumber", detail: raw });
      else per100[n] = v;
    }
    if (per100.energyKj === undefined && per100.energyKcal === undefined) problems.push({ line, what: "noEnergy", detail: name });
    const portion = parseNumber(cell("portion"));
    if (cell("portion") && (portion === null || portion < 0)) problems.push({ line, what: "badNumber", detail: cell("portion") });
    const groupText = cell("group");
    const group = parseGroup(groupText);
    if (groupText && !group) problems.push({ line, what: "badGroup", detail: groupText });
    products.push({ id: unique, name, group, portion: portion && portion > 0 ? portion : 0, portionLabel: cell("portionLabel"), per100: withEnergy(per100) });
  });
  return { products, problems };
};

/** The products as tab separated text with a header row, to copy into a spreadsheet. Numbers with a point. */
export const toTSV = (products: Product[]) =>
  [TSV_COLUMNS.join("\t"), ...products.map((p) =>
    TSV_COLUMNS.map((c) => {
      if (c === "id" || c === "name" || c === "portionLabel") return p[c];
      if (c === "group") return p.group ?? "";
      if (c === "portion") return p.portion ? String(p.portion) : "";
      const v = p.per100[c as Nutrient];
      return v === undefined ? "" : String(v);
    }).join("\t"))].join("\n");

// ---------------------------------------------------------------------------------------------------------------
// The example (own, approximate values per 100 g, rounded; not from a food composition table)

type ExampleRow = [string, string, string, Group, number, string, string, number, number, number, number, number, number, number, number, Values?];
//   id, English name, Dutch name, group, portion, portion en, portion nl, kcal, fat, saturates, carbs, sugars, fibre, protein, salt, extras
const EXAMPLE: ExampleRow[] = [
  ["bread", "Wholemeal bread", "Volkorenbrood", "starch", 35, "1 slice", "1 snee", 239, 3, 0.6, 41, 3, 6.5, 10, 1, { iron: 2.4 }],
  ["cheese", "Gouda cheese 48+", "Goudse kaas 48+", "protein", 20, "1 slice", "1 plak", 360, 29, 19, 0, 0, 0, 24, 2, { calcium: 750 }],
  ["chicken", "Sliced chicken breast", "Kipfilet (beleg)", "protein", 15, "1 slice", "1 plak", 106, 1.5, 0.5, 1, 0.5, 0, 22, 2.2],
  ["peanutButter", "Peanut butter", "Pindakaas", "protein", 15, "1 tablespoon", "1 eetlepel", 625, 50, 9, 13, 6, 7, 25, 1.1],
  ["sprinkles", "Chocolate sprinkles", "Hagelslag (puur)", "outside", 15, "for 1 slice", "voor 1 snee", 480, 20, 12, 68, 62, 4, 5, 0.05],
  ["egg", "Boiled egg", "Gekookt ei", "protein", 55, "1 egg", "1 ei", 141, 10, 2.8, 0.5, 0.5, 0, 12.5, 0.35, { iron: 1.8 }],
  ["milk", "Semi-skimmed milk", "Halfvolle melk", "protein", 250, "1 glass (250 ml)", "1 glas (250 ml)", 46, 1.5, 1, 4.8, 4.8, 0, 3.5, 0.1, { calcium: 120 }],
  ["yoghurt", "Low-fat yoghurt", "Magere yoghurt", "protein", 150, "1 bowl", "1 schaaltje", 36, 0.1, 0.1, 4.2, 4.2, 0, 4.2, 0.1, { calcium: 140 }],
  ["apple", "Apple", "Appel", "fruitVeg", 135, "1 apple", "1 appel", 52, 0.2, 0, 12, 10, 2, 0.3, 0, { vitaminC: 7 }],
  ["tomatoes", "Cherry tomatoes", "Cherrytomaatjes", "fruitVeg", 75, "1 handful", "1 handje", 20, 0.3, 0.1, 3, 2.6, 1.3, 0.9, 0.01, { vitaminC: 20 }],
  ["soup", "Instant tomato soup (prepared)", "Kop-soep tomaat (bereid)", "outside", 175, "1 mug", "1 beker", 36, 1, 0.4, 6, 3, 0.4, 0.6, 0.85],
  ["croissant", "Croissant", "Croissant", "outside", 45, "1 croissant", "1 croissant", 406, 21, 13, 45, 8, 2, 8, 1],
  ["crisps", "Paprika crisps", "Paprikachips", "outside", 25, "1 small bag", "1 zakje", 530, 33, 3, 52, 3, 4.5, 6, 1.4],
  ["cola", "Cola", "Cola", "outside", 250, "1 glass (250 ml)", "1 glas (250 ml)", 42, 0, 0, 10.6, 10.6, 0, 0, 0],
];

export const exampleProducts = (language: string): Product[] => {
  const nl = String(language ?? "").slice(0, 2).toLowerCase() === "nl";
  return EXAMPLE.map(([id, en, nlName, group, portion, pen, pnl, kcal, fat, saturates, carbs, sugars, fibre, protein, salt, extras]) => ({
    id, name: nl ? nlName : en, group, portion, portionLabel: nl ? pnl : pen,
    per100: { energyKj: round(kcal * 4.184, 0), energyKcal: kcal, fat, saturates, carbs, sugars, fibre, protein, salt, ...(extras ?? {}) },
  }));
};

/** The example's task: a lunch with at most 2500 kJ, at least 15 g protein, at most 2 g salt, 3 groups of the Schijf van Vijf. */
export const EXAMPLE_CHECKS: Check[] = [
  { type: "nutrient", nutrient: "energyKj", max: 2500, points: 1 },
  { type: "nutrient", nutrient: "protein", min: 15, points: 1 },
  { type: "nutrient", nutrient: "salt", max: 2, points: 1 },
  { type: "groups", min: 3, points: 1 },
];
export const EXAMPLE_SOLUTION: Record<string, number> = { bread: 70, cheese: 20, milk: 250, apple: 135 };

export const examplePlan = (language: string): Plan => ({
  products: exampleProducts(language),
  reference: { group: "adult", values: { ...REFERENCES.adult } },
  checks: EXAMPLE_CHECKS.map((c) => ({ ...c })),
  solution: { ...EXAMPLE_SOLUTION },
  answer: "soup",
});

// ---------------------------------------------------------------------------------------------------------------
// The plan (data-plan)

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" ? parseNumber(v) : null);

const parseValues = (raw: any): Values => {
  const out: Values = {};
  if (raw && typeof raw === "object") for (const n of NUTRIENTS) {
    const v = finite(raw[n]);
    if (v !== null && v >= 0) out[n] = v;
  }
  return out;
};

const parseProduct = (raw: any): Product | null => {
  if (!raw || typeof raw !== "object" || typeof raw.name !== "string" || !raw.name.trim()) return null;
  const id = typeof raw.id === "string" && isIdentifier(raw.id) ? raw.id : idFrom(raw.name);
  const portion = finite(raw.portion);
  return { id, name: raw.name.trim(), group: parseGroup(raw.group), portion: portion && portion > 0 ? portion : 0, portionLabel: String(raw.portionLabel ?? ""), per100: withEnergy(parseValues(raw.per100)) };
};

export const parseReference = (raw: any): Reference => {
  const group = (TARGET_GROUPS as readonly string[]).includes(raw?.group) ? (raw.group as TargetGroup) : "adult";
  if (group !== "custom") return { group, values: { ...REFERENCES[group] } };
  return { group, values: parseValues(raw?.values) };
};

const bounds = (min: number | null, max: number | null) => ({ ...(min !== null ? { min } : {}), ...(max !== null ? { max } : {}) });

export const parseCheck = (raw: any): Check | null => {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type as CheckType;
  const points = Math.max(0, Math.round(finite(raw.points) ?? 1));
  const min = finite(raw.min);
  const max = finite(raw.max);
  const products = Array.isArray(raw.products) ? raw.products.map(String).filter(isIdentifier) : [];
  switch (type) {
    case "nutrient":
      if (!(NUTRIENTS as readonly string[]).includes(raw.nutrient)) return null;
      return { type, nutrient: raw.nutrient, ...bounds(min, max), ...(raw.ri ? { ri: true } : {}), points };
    case "count":
    case "groups":
      return { type, ...bounds(min === null ? null : Math.round(min), max === null ? null : Math.round(max)), points };
    case "required":
    case "forbidden":
      return { type, products, points };
    default:
      return null;
  }
};

const parseComposition = (raw: any): Record<string, number> | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [id, g] of Object.entries(raw)) {
    const v = finite(g);
    if (isIdentifier(id) && v !== null && v > 0) out[id] = v;
  }
  return out;
};

/** data-plan: the author's products, reference intakes, checks, model answer and select answer; empty: the example. */
export const parsePlan = (text: unknown, language = "en"): Plan => {
  const t = String(text ?? "").trim();
  if (!t) return examplePlan(language);
  try {
    const raw = JSON.parse(t);
    const products: Product[] = [];
    for (const p of Array.isArray(raw?.products) ? raw.products : []) {
      const product = parseProduct(p);
      if (product && !products.some((q) => q.id === product.id)) products.push(product);
    }
    const checks = (Array.isArray(raw?.checks) ? raw.checks : []).map(parseCheck).filter(Boolean).slice(0, MAX_CHECKS) as Check[];
    const solution = parseComposition(raw?.solution);
    return {
      products,
      reference: parseReference(raw?.reference),
      checks,
      solution: solution && Object.keys(solution).length ? solution : null,
      answer: typeof raw?.answer === "string" && products.some((p) => p.id === raw.answer) ? raw.answer : null,
    };
  } catch {
    return examplePlan(language);
  }
};

export const serializePlan = (plan: Plan) =>
  JSON.stringify({
    products: plan.products.map((p) => ({ id: p.id, name: p.name, ...(p.group ? { group: p.group } : {}), ...(p.portion ? { portion: p.portion, portionLabel: p.portionLabel } : {}), per100: p.per100 })),
    reference: plan.reference.group === "custom" ? plan.reference : { group: plan.reference.group },
    checks: plan.checks,
    ...(plan.solution ? { solution: plan.solution } : {}),
    ...(plan.answer ? { answer: plan.answer } : {}),
  });

// ---------------------------------------------------------------------------------------------------------------
// A meal

/** A line of the meal as the candidate entered it: an amount in grams or in portions. */
export type Entry = { product: string; amount: number; unit: "g" | "portion" };

export const gramsOf = (entry: Entry, product: Product | undefined) =>
  !product ? 0 : entry.unit === "portion" ? round(entry.amount * product.portion, 1) : round(entry.amount, 1);

/** Only the products there are, with an amount above 0; the same product twice adds up. */
export const ownEntries = (products: Product[], entries: unknown): Entry[] => {
  if (!Array.isArray(entries)) return [];
  const out: Entry[] = [];
  for (const e of entries as any[]) {
    const product = products.find((p) => p.id === e?.product);
    const amount = finite(e?.amount);
    if (!product || amount === null || amount <= 0) continue;
    const unit = e.unit === "portion" && product.portion > 0 ? "portion" : "g";
    out.push({ product: product.id, amount, unit });
  }
  return mergeEntries(out, products);
};

const mergeEntries = (entries: Entry[], products: Product[]): Entry[] => {
  const out: Entry[] = [];
  for (const e of entries) {
    const at = out.findIndex((x) => x.product === e.product);
    if (at < 0) out.push(e);
    else out[at] = merge(out[at], e, products);
  }
  return out;
};

const merge = (a: Entry, b: Entry, products: Product[]): Entry => {
  if (a.unit === b.unit) return { ...a, amount: round(a.amount + b.amount, 2) };
  const product = products.find((p) => p.id === a.product);
  return { product: a.product, amount: round(gramsOf(a, product) + gramsOf(b, product), 1), unit: "g" };
};

/** Adds an amount of a product: a product already in the meal gets more (in its own unit, or else in grams). */
export const addEntry = (entries: Entry[], products: Product[], entry: Entry): Entry[] => {
  const at = entries.findIndex((e) => e.product === entry.product);
  if (at < 0) return [...entries, entry];
  return entries.map((e, i) => (i === at ? merge(e, entry, products) : e));
};

/** The meal as product → grams, sorted by product id: the same meal, however it was entered, gives the same composition. */
export const composition = (entries: Entry[], products: Product[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const e of entries) {
    const g = gramsOf(e, products.find((p) => p.id === e.product));
    if (g > 0) out[e.product] = round((out[e.product] ?? 0) + g, 1);
  }
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
};

/** A composition back as entries (in grams), for setResponse and the model answer. */
export const entriesFrom = (comp: Record<string, number> | null, products: Product[]): Entry[] =>
  Object.entries(comp ?? {}).filter(([id, g]) => g > 0 && products.some((p) => p.id === id)).map(([product, amount]) => ({ product, amount, unit: "g" as const }));

/** The totals of a composition, rounded as they are shown (DECIMALS); a nutrient no product has stays out. */
export const totals = (comp: Record<string, number>, products: Product[]): Values => {
  const sum: Values = {};
  for (const [id, grams] of Object.entries(comp)) {
    const product = products.find((p) => p.id === id);
    if (!product) continue;
    const v = amountOf(product, grams);
    for (const n of NUTRIENTS) if (v[n] !== undefined) sum[n] = (sum[n] ?? 0) + v[n]!;
  }
  const out: Values = {};
  for (const n of NUTRIENTS) {
    if (sum[n] !== undefined) out[n] = round(sum[n]!, DECIMALS[n]);
    else if ((CORE as readonly string[]).includes(n)) out[n] = 0;
  }
  return out;
};

/** A total as a percentage of the reference intake (rounded to a whole percent); null without a reference. */
export const percentOf = (value: number, nutrient: Nutrient, reference: Values) => {
  const ri = reference[nutrient];
  return ri && ri > 0 ? Math.round((value / ri) * 100) : null;
};

/** The groups of the Schijf van Vijf in a composition (not "outside", not unknown), sorted. */
export const groupsIn = (comp: Record<string, number>, products: Product[]): Group[] =>
  [...new Set(Object.keys(comp).map((id) => products.find((p) => p.id === id)?.group).filter((g): g is Group => !!g && g !== "outside"))].sort();

// ---------------------------------------------------------------------------------------------------------------
// Checks and the score

export type CheckResult = { check: Check; passed: boolean; value: number | null };
export type Evaluation = { results: CheckResult[]; score: number; maxscore: number; correct: boolean; totals: Values; composition: Record<string, number> };

const within = (v: number, min: number | null | undefined, max: number | null | undefined) =>
  (min === null || min === undefined || v >= min - 1e-9) && (max === null || max === undefined || v <= max + 1e-9);

export const evaluateCheck = (check: Check, comp: Record<string, number>, plan: Plan, sums = totals(comp, plan.products)): CheckResult => {
  const ids = Object.keys(comp);
  switch (check.type) {
    case "nutrient": {
      const n = check.nutrient!;
      const total = sums[n] ?? 0;
      const value = check.ri ? (plan.reference.values[n] ? round((total / plan.reference.values[n]!) * 100, 1) : null) : total;
      return { check, value, passed: value !== null && within(value, check.min, check.max) };
    }
    case "count":
      return { check, value: ids.length, passed: within(ids.length, check.min, check.max) };
    case "groups": {
      const g = groupsIn(comp, plan.products).length;
      return { check, value: g, passed: within(g, check.min, check.max) };
    }
    case "required": {
      const list = check.products ?? [];
      const n = list.filter((id) => ids.includes(id)).length;
      return { check, value: n, passed: list.length > 0 && n === list.length };
    }
    case "forbidden": {
      const n = (check.products ?? []).filter((id) => ids.includes(id)).length;
      return { check, value: n, passed: n === 0 };
    }
  }
};

export const evaluate = (plan: Plan, comp: Record<string, number>): Evaluation => {
  const sums = totals(comp, plan.products);
  const results = plan.checks.map((c) => evaluateCheck(c, comp, plan, sums));
  const points = (c: Check) => c.points ?? 1;
  const score = results.reduce((s, r) => s + (r.passed ? points(r.check) : 0), 0);
  const maxscore = plan.checks.reduce((s, c) => s + points(c), 0);
  return { results, score, maxscore, correct: results.length > 0 && results.every((r) => r.passed), totals: sums, composition: comp };
};

/** Select mode: the product with the most (or least) of a nutrient per portion or per 100 g; null on a tie or without data. */
export const extremeProduct = (products: Product[], nutrient: Nutrient, basis: "portion" | "100g", which: "max" | "min" = "max"): string | null => {
  const values = products
    .map((p) => ({ id: p.id, v: (basis === "portion" ? perPortion(p) : withEnergy(p.per100))?.[nutrient] }))
    .filter((x): x is { id: string; v: number } => x.v !== undefined);
  if (!values.length) return null;
  const best = which === "max" ? Math.max(...values.map((x) => x.v)) : Math.min(...values.map((x) => x.v));
  const winners = values.filter((x) => Math.abs(x.v - best) < 1e-9);
  return winners.length === 1 ? winners[0].id : null;
};

/** The nutrients any of the products has: the rows of the labels and the totals (the core ones always). */
export const nutrientsOf = (products: Product[], extras = true): Nutrient[] =>
  NUTRIENTS.filter((n) => (CORE as readonly string[]).includes(n) || (extras && products.some((p) => p.per100[n] !== undefined)));
