// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Lentillespci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The model of the graph builder: the settings (data- attributes, all text) with the lentil example as the default,
// the candidate's table and graph, and the checks that score them. No imports: `npm test` runs it in node.

// ─── numbers ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type Language = "en" | "nl" | "fr";

/** "nl", "nl-NL", "FR" → nl, fr; anything else en. */
export const languageOf = (language: unknown): Language => {
  const code = String(language ?? "").slice(0, 2).toLowerCase();
  return code === "nl" || code === "fr" ? code : "en";
};

/** Rounds away floating point noise: 0.1 + 0.2 → 0.3. */
export const clean = (value: number): number => (isFinite(value) ? parseFloat(value.toPrecision(12)) : value);

/** 0.2 → "0.2" (en) or "0,2" (nl, fr); -3 → "−3"; as many decimals as the number has. */
export const formatValue = (value: number, language: Language): string => {
  if (typeof value !== "number" || !isFinite(value)) return "–";
  let text = String(clean(value));
  if (/e/i.test(text)) text = clean(value).toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  if (text === "-0") text = "0";
  text = text.replace("-", "−");
  return language === "en" ? text : text.replace(".", ",");
};

/** A point as the candidate reads it: (2, 0.2) in English, (2 ; 0,2) in French, (2; 0,2) in Dutch. */
export const formatPoint = (x: number, y: number, language: Language): string =>
  language === "en" ? `(${formatValue(x, language)}, ${formatValue(y, language)})`
    : language === "fr" ? `(${formatValue(x, language)} ; ${formatValue(y, language)})`
      : `(${formatValue(x, language)}; ${formatValue(y, language)})`;

/** "0,2", "0.2", " 12 ", "−3", "1e3" → a number; anything else (empty, "2 cm", "a") null. */
export const parseNumber = (text: unknown): number | null => {
  if (typeof text === "number") return isFinite(text) ? text : null;
  if (typeof text !== "string") return null;
  const value = text.trim().replace(/[−–]/g, "-").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(value)) return null;
  const n = Number(value);
  return isFinite(n) ? n : null;
};

// ─── settings ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type Point = { x: number; y: number };
export type AxisKey = "x" | "y";
export type CheckName = "table" | "axes" | "scale" | "points" | "line";
export const CHECKS: CheckName[] = ["table", "axes", "scale", "points", "line"];
export type DataSource = "illustration" | "table" | "both";

/** At most this many measurements, table rows and plotted points. */
export const MAX_POINTS = 30;
/** A scale has at least 1 and at most this many steps. */
export const MAX_STEPS = 50;

/** The lentil sprouts of the original: the day and the length of the sprout in cm. */
export const LENTILS: Point[] = [
  { x: 0, y: 0 }, { x: 2, y: 0.2 }, { x: 3, y: 1 }, { x: 4, y: 2 }, { x: 5, y: 3.8 }, { x: 6, y: 5.3 }, { x: 7, y: 6.4 }, { x: 8, y: 11.7 },
];

/** The texts of the lentil example per language: what an empty setting means. */
export const EXAMPLE: Record<Language, {
  prompt: string; xQuantity: string; xUnit: string; yQuantity: string; yUnit: string;
  quantities: string[]; units: string[]; caption: string;
}> = {
  en: {
    prompt: "Lentils were put to sprout. The pictures show the same sprout next to a ruler on several days. Step 1: make a table of the length of the sprout against time. Step 2: draw a graph of it: choose what goes on each axis and the scale, plot the measurements and draw the line through the points.",
    xQuantity: "Time", xUnit: "days", yQuantity: "Length of the sprout", yUnit: "cm",
    quantities: ["Number of lentils", "Temperature", "Mass"], units: ["h", "mm", "°C", "g"], caption: "Day {x}",
  },
  nl: {
    prompt: "Er zijn linzen te kiemen gelegd. De afbeeldingen laten op een aantal dagen dezelfde kiem naast een liniaal zien. Stap 1: maak een tabel van de lengte van de kiem tegen de tijd. Stap 2: teken er een grafiek van: kies wat er op elke as komt en de schaalverdeling, zet de metingen uit en trek de lijn door de punten.",
    xQuantity: "Tijd", xUnit: "dagen", yQuantity: "Lengte van de kiem", yUnit: "cm",
    quantities: ["Aantal linzen", "Temperatuur", "Massa"], units: ["h", "mm", "°C", "g"], caption: "Dag {x}",
  },
  fr: {
    prompt: "Des lentilles ont été mises à germer. Les images montrent la même pousse à côté d'une règle à différents jours. Étape 1 : construis un tableau de la longueur de la pousse en fonction du temps. Étape 2 : trace le graphique : choisis ce qui va sur chaque axe et l'échelle, place les mesures et trace la courbe qui relie les points.",
    xQuantity: "Temps", xUnit: "jours", yQuantity: "Longueur de la pousse", yUnit: "cm",
    quantities: ["Nombre de lentilles", "Température", "Masse"], units: ["h", "mm", "°C", "g"], caption: "Jour {x}",
  },
};

export type Scale = { max: number; step: number };

export type Settings = {
  language: Language;
  prompt: string;
  /** The measurements, in the order the author gave them. */
  data: Point[];
  xQuantity: string;
  xUnit: string;
  yQuantity: string;
  yUnit: string;
  /** The choices of the quantity and unit selects: the right ones and the distractors, sorted. */
  quantityOptions: string[];
  unitOptions: string[];
  /** The caption of a picture, "{x}" the x value: "Day {x}". */
  caption: string;
  dataSource: DataSource;
  /** Print the measured value under each picture. */
  showValues: boolean;
  /** Step 1: the candidate fills in a table. */
  tableStep: boolean;
  tableRows: number;
  /** A text field for the title of the graph (not scored). */
  askTitle: boolean;
  /** The scale the graph starts with. */
  start: Record<AxisKey, Scale>;
  /** How far a point may be from a measurement, in % of the axis. */
  tolerance: number;
  /** The measurements fill at least this % of each axis for a suitable scale. */
  scaleUse: number;
  /** Points per check; 0: not scored. */
  points: Record<CheckName, number>;
  /** "all": the table points when every cell is right; "cell": the table points for every right cell. */
  tableScoring: "all" | "cell";
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim());
const isTrue = (value: unknown, fallback: boolean) => {
  const t = text(value).toLowerCase();
  return t === "true" ? true : t === "false" ? false : fallback;
};
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.find((o) => o.toLowerCase() === text(value).toLowerCase()) ?? fallback;
const positive = (value: unknown, fallback: number) => {
  const n = parseNumber(text(value));
  return n !== null && n > 0 ? n : fallback;
};
const whole = (value: unknown, fallback: number, min: number, max: number) => {
  const n = parseNumber(text(value));
  return n === null ? fallback : Math.max(min, Math.min(max, Math.round(n)));
};

/** A list in a setting: one per line or separated by ";". */
export const parseList = (value: unknown): string[] =>
  [...new Set(text(value).split(/[;\n]/).map((s) => s.trim()).filter(Boolean))];

/**
 * The measurements: a line per measurement, "x;y", "x<tab>y" (pasted from a spreadsheet) or "x y"; with ; or a tab
 * a comma is a decimal comma. Lines that are not two numbers are skipped; at most MAX_POINTS.
 */
export const parseData = (value: unknown): Point[] =>
  text(value).split(/\n|\|/).flatMap((line) => {
    const parts = /[;\t]/.test(line) ? line.split(/[;\t]/) : line.trim().split(/[\s,]+/);
    if (parts.length !== 2) return [];
    const x = parseNumber(parts[0]), y = parseNumber(parts[1]);
    return x === null || y === null ? [] : [{ x, y }];
  }).slice(0, MAX_POINTS);

const sortedOptions = (right: string, others: string[], language: Language) =>
  [...new Set([right, ...others].filter(Boolean))].sort((a, b) => a.localeCompare(b, language));

/** A scale in a setting: "max;step" ("12;1"); a step that gives more than MAX_STEPS steps is not taken. */
export const parseScale = (value: unknown, fallback: Scale): Scale => {
  const [max, step] = text(value).split(/[;\s]+/).map((p) => parseNumber(p));
  return validScale(max, step) ? { max: clean(max), step: clean(step) } : fallback;
};

/** A maximum and a step the graph can be drawn with: both positive, 1 to MAX_STEPS steps. */
export const validScale = (max: number | null | undefined, step: number | null | undefined): boolean =>
  typeof max === "number" && typeof step === "number" && isFinite(max) && isFinite(step) && max > 0 && step > 0 &&
  stepCount({ max, step }) >= 1 && stepCount({ max, step }) <= MAX_STEPS;

/** The number of whole steps up to the maximum. */
export const stepCount = ({ max, step }: Scale) => Math.floor(clean(max / step) + 1e-9);

export const parseSettings = (properties: Record<string, unknown>): Settings => {
  const p = properties ?? {};
  const language = languageOf(p.language);
  const example = EXAMPLE[language];
  const data = text(p.data) ? parseData(p.data) : [];
  const xQuantity = text(p.xQuantity) || example.xQuantity;
  const xUnit = text(p.xUnit) || example.xUnit;
  const yQuantity = text(p.yQuantity) || example.yQuantity;
  const yUnit = text(p.yUnit) || example.yUnit;
  const quantities = text(p.quantityOptions) ? parseList(p.quantityOptions) : example.quantities;
  const units = text(p.unitOptions) ? parseList(p.unitOptions) : example.units;
  const measured = data.length ? data : LENTILS;
  return {
    language,
    prompt: text(p.prompt) || example.prompt,
    data: measured,
    xQuantity, xUnit, yQuantity, yUnit,
    quantityOptions: sortedOptions("", [xQuantity, yQuantity, ...quantities], language),
    unitOptions: sortedOptions("", [xUnit, yUnit, ...units], language),
    caption: text(p.caption) || example.caption,
    dataSource: oneOf(p.dataSource, ["illustration", "table", "both"] as const, "illustration"),
    showValues: isTrue(p.showValues, true),
    tableStep: isTrue(p.tableStep, true),
    tableRows: whole(p.tableRows, measured.length, 1, MAX_POINTS) || measured.length,
    askTitle: isTrue(p.askTitle, true),
    start: { x: parseScale(p.xScale, { max: 10, step: 1 }), y: parseScale(p.yScale, { max: 10, step: 1 }) },
    tolerance: positive(p.tolerance, 2),
    scaleUse: Math.min(100, positive(p.scaleUse, 50)),
    points: {
      table: whole(p.pointsTable, 1, 0, 100),
      axes: whole(p.pointsAxes, 1, 0, 100),
      scale: whole(p.pointsScale, 1, 0, 100),
      points: whole(p.pointsPoints, 2, 0, 100),
      line: whole(p.pointsLine, 1, 0, 100),
    },
    tableScoring: oneOf(p.tableScoring, ["all", "cell"] as const, "all"),
  };
};

/** The caption of the picture of a measurement: "Day 3". */
export const captionOf = (s: Settings, x: number) => s.caption.replace(/\{x\}/g, formatValue(x, s.language));

// ─── the candidate's work ───────────────────────────────────────────────────────────────────────────────────────────

export type AxisState = { quantity: string; unit: string; max: number; step: number };

export type GraphState = {
  /** Step 1: the headings and the cells as typed, [x, y] per row. */
  table: { headers: [string, string]; rows: [string, string][] };
  title: string;
  x: AxisState;
  y: AxisState;
  /** The plotted points, in data units, in the order they were placed. */
  points: Point[];
  /** The line through the points (sorted by x). */
  line: boolean;
};

export const initialState = (s: Settings): GraphState => ({
  table: { headers: ["", ""], rows: Array.from({ length: s.tableStep ? s.tableRows : 0 }, () => ["", ""] as [string, string]) },
  title: "",
  x: { quantity: "", unit: "", ...s.start.x },
  y: { quantity: "", unit: "", ...s.start.y },
  points: [],
  line: false,
});

/** A scale for the data: a step of 1, 2, 2.5 or 5 × 10^k, at most 10 steps, the maximum a whole number of steps. */
export const niceScale = (dataMax: number): Scale => {
  if (!(dataMax > 0)) return { max: 10, step: 1 };
  const power = Math.pow(10, Math.floor(Math.log10(dataMax)) - 1);
  for (const k of [1, 10, 100]) {
    for (const f of [1, 2, 2.5, 5]) {
      const step = clean(f * k * power);
      const count = Math.ceil(clean(dataMax / step));
      if (count <= 10) return { max: clean(count * step), step };
    }
  }
  return { max: dataMax, step: dataMax / 10 };
};

/** Where a click or a key puts a point: a tenth of the step. */
export const snapOf = (axis: Scale) => clean(axis.step / 10);
export const snap = (value: number, axis: Scale) => {
  const unit = snapOf(axis);
  return clean(Math.round(value / unit) * unit);
};

/** The finished graph of the data: what review with the solution shows. */
export const solutionState = (s: Settings): GraphState => {
  const xs = s.data.map((d) => d.x), ys = s.data.map((d) => d.y);
  const rows = s.tableStep
    ? [...s.data].sort((a, b) => a.x - b.x).map((d) => [formatValue(d.x, s.language), formatValue(d.y, s.language)] as [string, string])
    : [];
  while (s.tableStep && rows.length < s.tableRows) rows.push(["", ""]);
  return {
    table: { headers: [`${s.xQuantity} (${s.xUnit})`, `${s.yQuantity} (${s.yUnit})`], rows },
    title: "",
    x: { quantity: s.xQuantity, unit: s.xUnit, ...niceScale(Math.max(...xs)) },
    y: { quantity: s.yQuantity, unit: s.yUnit, ...niceScale(Math.max(...ys)) },
    points: s.data.map((d) => ({ ...d })),
    line: true,
  };
};

/** The points in the order the line goes through them: by x, then by y. */
export const linePoints = (points: Point[]) => [...points].sort((a, b) => a.x - b.x || a.y - b.y);

/** A state from getState(), a response or anything else, checked against the settings; null when it is not one. */
export const validState = (value: any, s: Settings): GraphState | null => {
  if (!value || typeof value !== "object") return null;
  const start = initialState(s);
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 200) : typeof v === "number" ? String(v) : "");
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : parseNumber(v));
  const axis = (v: any, fallback: AxisState): AxisState => {
    const max = num(v?.max), step = num(v?.step);
    const scale = validScale(max, step) ? { max, step } : { max: fallback.max, step: fallback.step };
    return { quantity: str(v?.quantity), unit: str(v?.unit), ...scale };
  };
  const rows: [string, string][] = Array.isArray(value.table?.rows)
    ? value.table.rows.slice(0, MAX_POINTS).map((r: any) => [str(r?.[0] ?? r?.x), str(r?.[1] ?? r?.y)] as [string, string])
    : start.table.rows;
  while (rows.length < start.table.rows.length) rows.push(["", ""]);
  const headers = Array.isArray(value.table?.headers) ? [str(value.table.headers[0]), str(value.table.headers[1])] as [string, string] : start.table.headers;
  const points = Array.isArray(value.points)
    ? value.points.map((p: any) => ({ x: num(p?.x ?? p?.[0]), y: num(p?.y ?? p?.[1]) }))
      .filter((p: { x: number | null; y: number | null }) => p.x !== null && p.y !== null).slice(0, MAX_POINTS)
    : [];
  return {
    table: { headers, rows },
    title: str(value.title),
    x: axis(value.x, start.x),
    y: axis(value.y, start.y),
    points,
    line: value.line === true || value.line === "true",
  };
};

/** The same work: what decides that there is no response yet. */
export const sameState = (a: GraphState, b: GraphState) => JSON.stringify(a) === JSON.stringify(b);

/** The graph in the response: axes with their scale, the points and the line. */
export const serializeGraph = (state: GraphState) =>
  JSON.stringify({ title: state.title, x: state.x, y: state.y, points: state.points, line: state.line });

/** The table in the response: the headings and the rows that are not empty. */
export const serializeTable = (state: GraphState) =>
  JSON.stringify({ headers: state.table.headers, rows: state.table.rows.filter((r) => r[0].trim() || r[1].trim()) });

// ─── checks ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const EPSILON = 1e-6;
const equal = (a: number | null, b: number) => a !== null && Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(b));

/**
 * The table: a row is a measurement when its x is the x of a measurement not matched yet (in any order); its y cell
 * is right when that measurement's y is in it. Rows with something in them that are not a measurement are wrong.
 */
export const checkTable = (s: Settings, state: GraphState) => {
  const used = new Set<number>();
  let cells = 0, wrongRows = 0;
  for (const [xText, yText] of state.table.rows) {
    if (!xText.trim() && !yText.trim()) continue;
    const x = parseNumber(xText), y = parseNumber(yText);
    // prefer a measurement with that x and that y (two measurements may share an x)
    let i = s.data.findIndex((d, k) => !used.has(k) && equal(x, d.x) && equal(y, d.y));
    if (i < 0) i = s.data.findIndex((d, k) => !used.has(k) && equal(x, d.x));
    if (i < 0) {
      wrongRows++;
      continue;
    }
    used.add(i);
    cells += equal(y, s.data[i].y) ? 2 : 1;
  }
  return { cells, total: s.data.length * 2, passed: cells === s.data.length * 2 && wrongRows === 0 };
};

/** Both axes have the right quantity and unit. */
export const checkAxes = (s: Settings, state: GraphState) =>
  same(state.x.quantity, s.xQuantity) && same(state.x.unit, s.xUnit) && same(state.y.quantity, s.yQuantity) && same(state.y.unit, s.yUnit);

/**
 * A suitable scale on one axis: every measurement fits (from 0 to the maximum), the measurements fill at least
 * scaleUse % of it, and it has 2 to 25 steps.
 */
export const suitableScale = (s: Settings, axis: AxisKey, scale: Scale) => {
  const values = s.data.map((d) => d[axis]);
  const top = Math.max(...values);
  if (Math.min(...values) < 0) return false;
  const steps = stepCount(scale);
  return scale.max >= top - EPSILON && (top <= 0 || top >= (s.scaleUse / 100) * scale.max - EPSILON) && steps >= 2 && steps <= 25;
};
export const checkScale = (s: Settings, state: GraphState) => suitableScale(s, "x", state.x) && suitableScale(s, "y", state.y);

/**
 * The points: every measurement has a point of its own at most tolerance % of the axis away (in x and in y), and there
 * are no other points. Each measurement takes the nearest point that is left.
 */
export const matchPoints = (s: Settings, state: GraphState) => {
  const tx = (s.tolerance / 100) * state.x.max + EPSILON, ty = (s.tolerance / 100) * state.y.max + EPSILON;
  const used = new Set<number>();
  let matched = 0;
  for (const d of s.data) {
    let best = -1, bestDistance = Infinity;
    state.points.forEach((p, k) => {
      if (used.has(k)) return;
      const dx = Math.abs(p.x - d.x), dy = Math.abs(p.y - d.y);
      if (dx > tx || dy > ty) return;
      const distance = (dx / tx) ** 2 + (dy / ty) ** 2;
      if (distance < bestDistance) [best, bestDistance] = [k, distance];
    });
    if (best >= 0) {
      used.add(best);
      matched++;
    }
  }
  return { matched, passed: matched === s.data.length && state.points.length === s.data.length };
};

export const checkLine = (state: GraphState) => state.line && state.points.length >= 2;

export type Evaluation = {
  results: Record<CheckName, boolean>;
  /** The checks that count: points above 0 (and the table only with a table step). */
  scored: CheckName[];
  tableCells: number;
  pointsMatched: number;
  score: number;
  maxscore: number;
  correct: boolean;
};

export const evaluate = (s: Settings, state: GraphState): Evaluation => {
  const table = checkTable(s, state);
  const points = matchPoints(s, state);
  const results: Record<CheckName, boolean> = {
    table: s.tableStep && table.passed,
    axes: checkAxes(s, state),
    scale: checkScale(s, state),
    points: points.passed,
    line: checkLine(state),
  };
  const scored = CHECKS.filter((c) => s.points[c] > 0 && (c !== "table" || s.tableStep));
  let score = 0, maxscore = 0;
  for (const c of scored) {
    if (c === "table" && s.tableScoring === "cell") {
      score += s.points.table * table.cells;
      maxscore += s.points.table * table.total;
    } else {
      score += results[c] ? s.points[c] : 0;
      maxscore += s.points[c];
    }
  }
  return {
    results, scored, tableCells: s.tableStep ? table.cells : 0, pointsMatched: points.matched, score, maxscore,
    correct: scored.every((c) => results[c]),
  };
};
