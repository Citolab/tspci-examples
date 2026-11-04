// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/parcc/extension-parcc-tei/tree/master/views/js/pciCreator/dev/histogramInteraction,
// © 2014-2017 Parcc, Inc. (Sam Sipasseuth, Open Assessment Technologies)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The model of the histogram: the settings (data- attributes, all text) with the travel time example as the default,
// the heights the candidate sets (snapped to the author's grid), and the comparison with the correct heights.
// No imports: `npm test` runs it in node.

// ─── numbers ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type Language = "en" | "nl" | "fr";

/** "nl", "nl-NL", "FR" → nl, fr; anything else en. */
export const languageOf = (language: unknown): Language => {
  const code = String(language ?? "").slice(0, 2).toLowerCase();
  return code === "nl" || code === "fr" ? code : "en";
};

/** Rounds away floating point noise: 0.1 + 0.2 → 0.3. */
export const clean = (value: number): number => (isFinite(value) ? parseFloat(value.toPrecision(12)) : value);

/** 2.5 → "2.5" (en) or "2,5" (nl, fr); as many decimals as the number has. */
export const formatValue = (value: number, language: Language): string => {
  if (typeof value !== "number" || !isFinite(value)) return "–";
  let text = String(clean(value));
  if (/e/i.test(text)) text = clean(value).toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  if (text === "-0") text = "0";
  text = text.replace("-", "−");
  return language === "en" ? text : text.replace(".", ",");
};

/** "2,5", " 2.5 ", "−3" → a number; anything else (also "") null. */
export const parseNumber = (text: unknown): number | null => {
  const t = String(text ?? "").trim().replace("−", "-").replace(",", ".");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
};

/** "a; b\nc" → ["a", "b", "c"]: separated by ; or new lines, trimmed, empty items left out. */
export const parseList = (text: unknown): string[] =>
  String(text ?? "").split(/[;\n|]/).map((t) => t.trim()).filter((t) => t !== "");

/** "4; 9;;8" → [4, 9, null, 8], keeping the positions (an empty item is null). */
export const parseNumberList = (text: unknown): (number | null)[] => {
  const t = String(text ?? "").trim();
  if (t === "") return [];
  return t.split(/[;\n|]/).map((v) => parseNumber(v));
};

// ─── settings ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type ChartType = "histogram" | "bar";
export type DataDisplay = "none" | "table" | "list";
export type Scoring = "match" | "pci";
export type PciScore = "all" | "bar";

export type Bar = {
  label: string;
  /** The height at the start. */
  start: number;
  /** The candidate cannot change it (it is given). */
  locked: boolean;
  color: string;
};

export type Settings = {
  language: Language;
  prompt: string;
  chartType: ChartType;
  bars: Bar[];
  /** The class boundaries (bars + 1 numbers) when the bars are classes, or null: the bars have labels. */
  classes: number[] | null;
  title: string;
  valueTitle: string;
  categoryTitle: string;
  max: number;
  /** A gridline and a tick label every step. */
  step: number;
  /** The heights snap to multiples of this. */
  snap: number;
  showValues: boolean;
  dataDisplay: DataDisplay;
  /** "table": a value per bar; "list": the observations the candidate tallies. */
  table: (number | null)[];
  observations: string[];
  /** The correct height of every bar, or null when there is none for these settings. */
  correct: number[] | null;
  tolerance: number;
  scoring: Scoring;
  pciScore: PciScore;
};

export const MAX_BARS = 20;
export const MAX_SNAPS = 1000;
export const DEFAULT_COLOR = "#2563eb";

/** The example of each language: the time 30 students travel to school. */
export const EXAMPLE: Record<Language, { prompt: string; valueTitle: string; categoryTitle: string; title: string }> = {
  en: {
    prompt: "The table shows how long 30 students travel to school. Draw the histogram: set every bar to the right height.",
    valueTitle: "Number of students",
    categoryTitle: "Travel time (minutes)",
    title: "Travel time to school",
  },
  nl: {
    prompt: "De tabel laat zien hoe lang 30 leerlingen naar school reizen. Teken het histogram: zet elke staaf op de goede hoogte.",
    valueTitle: "Aantal leerlingen",
    categoryTitle: "Reistijd (minuten)",
    title: "Reistijd naar school",
  },
  fr: {
    prompt: "Le tableau montre combien de temps 30 élèves mettent pour aller à l'école. Trace l'histogramme : mets chaque barre à la bonne hauteur.",
    valueTitle: "Nombre d'élèves",
    categoryTitle: "Temps de trajet (minutes)",
    title: "Temps de trajet jusqu'à l'école",
  },
};
export const EXAMPLE_CLASSES = [0, 10, 20, 30, 40, 50];
export const EXAMPLE_TABLE = [4, 9, 8, 6, 3];

const text = (v: unknown) => String(v ?? "").trim();
const bool = (v: unknown, fallback: boolean) => {
  const t = text(v).toLowerCase();
  return t === "" ? fallback : t === "true" || t === "1" || t === "yes";
};
const positive = (v: unknown, fallback: number) => {
  const n = parseNumber(v);
  return n !== null && n > 0 ? n : fallback;
};
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => {
  const t = text(v).toLowerCase() as T;
  return options.includes(t) ? t : fallback;
};
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "0;10;20" → [0, 10, 20] when they go up and there are 2 to MAX_BARS + 1 of them; otherwise null. */
export const parseClasses = (value: unknown): number[] | null => {
  const list = parseNumberList(value);
  if (list.length < 2 || list.length > MAX_BARS + 1 || list.some((n) => n === null)) return null;
  const numbers = list as number[];
  return numbers.every((n, i) => i === 0 || n > numbers[i - 1]) ? numbers : null;
};

/** The label of a class: "10–20". */
export const classLabel = (lo: number, hi: number, language: Language) => `${formatValue(lo, language)}–${formatValue(hi, language)}`;

/** Rounds a height to the grid: a multiple of snap, from 0 to max. */
export const snapValue = (value: number, s: Pick<Settings, "snap" | "max">): number => {
  if (typeof value !== "number" || !isFinite(value)) return 0;
  const snapped = clean(Math.round(value / s.snap) * s.snap);
  if (snapped > s.max) return clean(Math.floor(s.max / s.snap + 1e-9) * s.snap);
  return snapped < 0 ? 0 : snapped;
};

/**
 * The observations of a list: separated by ;, new lines or a comma (not a decimal comma: "12,5" is one number); numbers
 * (for a histogram) also by spaces.
 */
export const parseObservations = (value: unknown, numbers: boolean): string[] =>
  String(value ?? "").replace(/,(?!\d)/g, ";").split(numbers ? /[;\n|\s]+/ : /[;\n|]+/).map((t) => t.trim()).filter((t) => t !== "");

/** The number of observations in each bar: a number in a class [lo, hi) (the last one [lo, hi]), or a label (not case sensitive). */
export const tally = (observations: string[], s: Pick<Settings, "classes" | "bars">): number[] => {
  const counts = s.bars.map(() => 0);
  for (const o of observations) {
    if (s.classes) {
      const n = parseNumber(o);
      if (n === null) continue;
      const c = s.classes;
      for (let i = 0; i < c.length - 1; i++) {
        if (n >= c[i] && (n < c[i + 1] || (i === c.length - 2 && n === c[i + 1]))) {
          counts[i]++;
          break;
        }
      }
    } else {
      const i = s.bars.findIndex((b) => b.label.toLowerCase() === o.toLowerCase());
      if (i >= 0) counts[i]++;
    }
  }
  return counts;
};

/** The settings from the properties (strings); what is missing or unreadable is the example in the candidate's language. */
export const parseSettings = (p: Record<string, unknown> = {}): Settings => {
  const language = languageOf(p.language);
  const example = EXAMPLE[language];
  const chartType = oneOf(p.chartType, ["histogram", "bar"] as const, "histogram");
  const custom = text(p.bars) !== "" || text(p.classes) !== "";

  // the bars: the classes of a histogram, or a label per line (a bar chart with classes and no labels: the classes)
  const labelsOf = (c: number[]) => c.slice(1).map((hi, i) => classLabel(c[i], hi, language));
  let source = custom ? parseClasses(p.classes) : EXAMPLE_CLASSES;
  let labels = custom ? parseList(text(p.bars).replace(/;/g, "\n")).slice(0, MAX_BARS) : [];
  let fromClasses = false;
  if ((chartType === "histogram" || labels.length === 0) && source) {
    labels = labelsOf(source);
    fromClasses = true;
  }
  if (labels.length === 0) {
    source = EXAMPLE_CLASSES;
    labels = labelsOf(source);
    fromClasses = true;
  }
  const classes = fromClasses ? source : null;

  const max = positive(p.max, 10);
  let step = positive(p.step, 1);
  if (max / step > 50) step = max / 10;
  let snap = positive(p.snap, step);
  if (max / snap > MAX_SNAPS) snap = step;

  const colors = String(p.colors ?? "").split(/[,;\s]+/).map((c) => c.trim()).filter((c) => HEX.test(c));
  const lockedBars = new Set(parseNumberList(p.locked).filter((n): n is number => n !== null).map((n) => Math.round(n) - 1));
  const starts = parseNumberList(p.startHeights);
  const grid = { snap, max };
  const bars: Bar[] = labels.map((label, i) => ({
    label,
    start: snapValue(starts[i] ?? 0, grid),
    locked: lockedBars.has(i),
    color: colors.length ? colors[i % colors.length] : DEFAULT_COLOR,
  }));

  const dataDisplay = oneOf(p.dataDisplay, ["none", "table", "list"] as const, "table");
  const table = text(p.data) === "" && !custom ? EXAMPLE_TABLE : parseNumberList(p.data).slice(0, bars.length);
  const observations = dataDisplay === "list" ? parseObservations(p.data, !!classes) : [];

  const s: Settings = {
    language,
    prompt: text(p.prompt) || (custom ? "" : example.prompt),
    chartType,
    bars,
    classes,
    title: text(p.title) || (custom ? "" : example.title),
    valueTitle: text(p.valueTitle) || (custom ? "" : example.valueTitle),
    categoryTitle: text(p.categoryTitle) || (custom ? "" : example.categoryTitle),
    max,
    step,
    snap,
    showValues: bool(p.showValues, true),
    dataDisplay,
    table,
    observations,
    correct: null,
    tolerance: Math.max(0, parseNumber(p.tolerance) ?? 0),
    scoring: oneOf(p.scoring, ["match", "pci"] as const, "match"),
    pciScore: oneOf(p.pciScore, ["all", "bar"] as const, "all"),
  };
  s.correct = correctHeights(s, p.correct);
  return s;
};

/**
 * The correct heights: the author's list (a value for every bar), or else what the data says (the table, or the
 * tally of the observations); locked bars keep their start height. Null when there is nothing to go by.
 */
export const correctHeights = (s: Settings, correct: unknown): number[] | null => {
  const given = parseNumberList(correct);
  let heights: (number | null)[] | null = null;
  if (given.length) heights = given;
  else if (s.dataDisplay === "list" && s.observations.length) heights = tally(s.observations, s);
  else if (s.table.length) heights = s.table;
  if (!heights) return null;
  const out = s.bars.map((b, i) => (b.locked ? b.start : heights![i]));
  return out.every((h) => h !== null && h !== undefined) ? out.map((h) => snapValue(h as number, s)) : null;
};

// ─── the candidate's heights ────────────────────────────────────────────────────────────────────────────────────────

export type HistogramState = {
  heights: number[];
  /** The candidate changed something (getResponse reports nothing before). */
  touched: boolean;
};

export const initialState = (s: Settings): HistogramState => ({ heights: s.bars.map((b) => b.start), touched: false });

/** A height for a bar: snapped, and a locked bar keeps its start height. */
export const heightFor = (s: Settings, bar: number, value: number): number => (s.bars[bar]?.locked ? s.bars[bar].start : snapValue(value, s));

/** Heights from a response or a saved state, fitted to these settings; null when they are not heights. */
export const validHeights = (raw: unknown, s: Settings): number[] | null => {
  if (!Array.isArray(raw)) return null;
  const values = raw.map((v) => (typeof v === "number" ? v : parseNumber(v)));
  if (values.some((v) => v === null)) return null;
  return s.bars.map((_, i) => heightFor(s, i, (values[i] as number | undefined) ?? s.bars[i].start));
};

export const validState = (raw: unknown, s: Settings): HistogramState | null => {
  const heights = validHeights((raw as HistogramState)?.heights, s);
  return heights ? { heights, touched: !!(raw as HistogramState).touched } : null;
};

export const sameHeights = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

// ─── scoring ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type Evaluation = {
  /** Per bar: within the tolerance of the correct height (locked bars always). */
  bars: boolean[];
  /** Bars the candidate could change that are right. */
  barsCorrect: number;
  /** Bars the candidate could change. */
  barsOpen: number;
  correct: boolean;
  score: number;
  maxscore: number;
};

/** Compares the heights with the correct ones, within the tolerance; without correct heights nothing is right. */
export const evaluate = (s: Settings, heights: number[]): Evaluation => {
  const open = s.bars.map((b, i) => (b.locked ? -1 : i)).filter((i) => i >= 0);
  const bars = s.bars.map((b, i) => !!s.correct && Math.abs((heights[i] ?? 0) - s.correct[i]) <= s.tolerance + 1e-9);
  const barsCorrect = open.filter((i) => bars[i]).length;
  const correct = !!s.correct && barsCorrect === open.length;
  const maxscore = s.pciScore === "bar" ? open.length : 1;
  const score = s.pciScore === "bar" ? barsCorrect : correct ? 1 : 0;
  return { bars, barsCorrect, barsOpen: open.length, correct, score, maxscore };
};

/** The ticks of the value axis: 0, step, 2 step … max. */
export const ticks = (s: Pick<Settings, "max" | "step">): number[] => {
  const out: number[] = [];
  for (let i = 0; i * s.step <= s.max + 1e-9 && i <= 50; i++) out.push(clean(i * s.step));
  if (out[out.length - 1] < s.max) out.push(s.max);
  return out;
};
