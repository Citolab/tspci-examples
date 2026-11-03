// The chart the author makes (data-data) and the settings that shape it: categories × series, with the series' names
// and colours, and in select mode the correct segments. Categories and series keep their id when others are added or
// removed, so a correct response stays valid. No imports: `npm test` runs it in node.

export type Series = { id: string; name: string; color: string };
export type Category = { id: string; label: string; /** One per series; null: no value. */ values: (number | null)[] };
export type ChartData = {
  series: Series[];
  categories: Category[];
  /** Select mode: the ids of the correct segments (c3-s2). */
  correct: string[];
};

export type Mode = "tool" | "select";
export type ChartType = "bar" | "line" | "pie";
export type Orientation = "horizontal" | "vertical";
export type Layout = "grouped" | "stacked" | "percent";
export type ShowValues = "always" | "focus" | "never";
export type LegendPosition = "top" | "right" | "bottom" | "none";

const oneOf = <T extends string>(options: readonly T[], fallback: T) => (value: unknown): T => {
  const v = String(value ?? "").trim().toLowerCase();
  return (options as readonly string[]).includes(v) ? (v as T) : fallback;
};
export const parseMode = oneOf<Mode>(["tool", "select"], "select");
export const parseChartType = oneOf<ChartType>(["bar", "line", "pie"], "bar");
export const parseOrientation = oneOf<Orientation>(["horizontal", "vertical"], "horizontal");
export const parseLayout = oneOf<Layout>(["grouped", "stacked", "percent"], "stacked");
export const parseShowValues = oneOf<ShowValues>(["always", "focus", "never"], "focus");
export const parseLegend = oneOf<LegendPosition>(["top", "right", "bottom", "none"], "top");
/** data-max-choices: 1 by default, 0 for no limit. */
export const parseMaxChoices = (value: unknown) => {
  const n = Math.round(Number(String(value ?? "").trim() || "1"));
  return Number.isFinite(n) && n >= 0 ? n : 1;
};
/** "true"/"false" as a data- attribute gives it; anything else the fallback. */
export const parseBoolean = (value: unknown, fallback: boolean) => {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "true" ? true : v === "false" ? false : fallback;
};
/** "" or not a number: null (automatic). Takes 1,5 as well as 1.5. */
export const parseOptionalNumber = (value: unknown): number | null => parseNumber(String(value ?? ""));

/**
 * Okabe & Ito's palette, distinguishable with every common kind of colour blindness; the order puts the ones that
 * differ most first. Black is left out (text and outlines), a slate grey takes its place.
 */
export const PALETTE: { color: string; name: { en: string; nl: string } }[] = [
  { color: "#0072B2", name: { en: "Blue", nl: "Blauw" } },
  { color: "#E69F00", name: { en: "Orange", nl: "Oranje" } },
  { color: "#009E73", name: { en: "Bluish green", nl: "Blauwgroen" } },
  { color: "#CC79A7", name: { en: "Reddish purple", nl: "Roodpaars" } },
  { color: "#56B4E9", name: { en: "Sky blue", nl: "Hemelsblauw" } },
  { color: "#D55E00", name: { en: "Vermillion", nl: "Vermiljoen" } },
  { color: "#F0E442", name: { en: "Yellow", nl: "Geel" } },
  { color: "#64748B", name: { en: "Grey", nl: "Grijs" } },
];
/** The first colour of the palette that no series has yet. */
export const nextColor = (series: Series[]) =>
  (PALETTE.find((p) => !series.some((s) => s.color.toLowerCase() === p.color.toLowerCase())) ?? PALETTE[series.length % PALETTE.length]).color;

const travel: [string, number[]][] = [
  ["12–13", [58, 9, 14, 19]],
  ["14–15", [61, 15, 10, 14]],
  ["16–17", [52, 29, 8, 11]],
  ["18+", [38, 47, 7, 8]],
];
/** The example: how students travel to school, per age group, in %. */
export const DEFAULT_DATA: ChartData = {
  series: ["Bike", "Bus, tram or train", "Car (passenger)", "Walking"].map((name, i) => ({ id: `s${i + 1}`, name, color: PALETTE[i].color })),
  categories: travel.map(([label, values], i) => ({ id: `c${i + 1}`, label, values })),
  correct: ["c3-s2"],
};
export const EMPTY_DATA: ChartData = {
  series: [{ id: "s1", name: "", color: PALETTE[0].color }],
  categories: [{ id: "c1", label: "", values: [null] }, { id: "c2", label: "", values: [null] }],
  correct: [],
};

/** The next free id: c5 after c1..c4, also when c2 was removed. */
export const nextId = (prefix: "c" | "s", ids: string[]) =>
  `${prefix}${Math.max(0, ...ids.map((id) => Number(id.slice(1))).filter(Number.isFinite)) + 1}`;

const HEX = /^#[0-9a-f]{6}$/i;

/** data-data → the chart data; empty or broken: the example. Missing or duplicate ids get a new one. */
export const parseData = (json: string): ChartData => {
  if (!json || !String(json).trim()) return DEFAULT_DATA;
  try {
    const raw = JSON.parse(json);
    const valid = (id: unknown, prefix: string, seen: string[]) =>
      typeof id === "string" && new RegExp(`^${prefix}\\d+$`).test(id) && !seen.includes(id);
    const series: Series[] = [];
    for (const s of Array.isArray(raw?.series) ? raw.series : []) {
      const ids = series.map((x) => x.id);
      const id = valid(s?.id, "s", ids) ? s.id : nextId("s", ids);
      series.push({ id, name: String(s?.name ?? ""), color: HEX.test(String(s?.color)) ? String(s.color) : nextColor(series) });
    }
    const categories: Category[] = [];
    for (const c of Array.isArray(raw?.categories) ? raw.categories : []) {
      const ids = categories.map((x) => x.id);
      const id = valid(c?.id, "c", ids) ? c.id : nextId("c", ids);
      const values = series.map((_, i) => {
        const v = c?.values?.[i];
        return typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" ? parseNumber(v) : null;
      });
      categories.push({ id, label: String(c?.label ?? ""), values });
    }
    if (!series.length || !categories.length) return DEFAULT_DATA;
    const data: ChartData = { series, categories, correct: [] };
    const ids = segmentIds(data);
    data.correct = (Array.isArray(raw?.correct) ? raw.correct : []).map(String).filter((id: string, i: number, all: string[]) => ids.includes(id) && all.indexOf(id) === i);
    return data;
  } catch {
    return DEFAULT_DATA;
  }
};

export const serializeData = (data: ChartData) => JSON.stringify(data);

/** The id of a segment, as the response reports it: category and series, c3-s2. */
export const segmentId = (category: Category, series: Series) => `${category.id}-${series.id}`;

/** Every segment with a value, category by category: what the candidate can look at and choose. */
export const segmentIds = (data: ChartData) =>
  data.categories.flatMap((c) => data.series.filter((_, j) => c.values[j] !== null && c.values[j] !== undefined).map((s) => segmentId(c, s)));

/** c3-s2 → the category and series (and their index), or null when they are not in the chart. */
export const findSegment = (data: ChartData, id: string) => {
  const [c, s] = String(id ?? "").split("-");
  const ci = data.categories.findIndex((x) => x.id === c);
  const si = data.series.findIndex((x) => x.id === s);
  if (ci < 0 || si < 0) return null;
  const value = data.categories[ci].values[si];
  return { category: data.categories[ci], series: data.series[si], ci, si, value: value ?? null };
};

/** Removes the correct segments that no longer exist (a category or series went, a value was emptied). */
const tidy = (data: ChartData): ChartData => {
  const ids = segmentIds(data);
  return { ...data, correct: data.correct.filter((id) => ids.includes(id)) };
};

export const addCategory = (data: ChartData, label = ""): ChartData => ({
  ...data,
  categories: [...data.categories, { id: nextId("c", data.categories.map((c) => c.id)), label, values: data.series.map(() => null) }],
});
export const removeCategory = (data: ChartData, index: number): ChartData =>
  data.categories.length < 2 ? data : tidy({ ...data, categories: data.categories.filter((_, i) => i !== index) });
export const moveCategory = (data: ChartData, index: number, by: -1 | 1): ChartData => {
  const to = index + by;
  if (to < 0 || to >= data.categories.length) return data;
  const categories = [...data.categories];
  [categories[index], categories[to]] = [categories[to], categories[index]];
  return { ...data, categories };
};
export const addSeries = (data: ChartData, name = ""): ChartData => ({
  ...data,
  series: [...data.series, { id: nextId("s", data.series.map((s) => s.id)), name, color: nextColor(data.series) }],
  categories: data.categories.map((c) => ({ ...c, values: [...c.values, null] })),
});
export const removeSeries = (data: ChartData, index: number): ChartData =>
  data.series.length < 2
    ? data
    : tidy({
      ...data,
      series: data.series.filter((_, i) => i !== index),
      categories: data.categories.map((c) => ({ ...c, values: c.values.filter((_, i) => i !== index) })),
    });
export const setCategoryLabel = (data: ChartData, index: number, label: string): ChartData => ({
  ...data,
  categories: data.categories.map((c, i) => (i === index ? { ...c, label } : c)),
});
export const setSeries = (data: ChartData, index: number, change: Partial<Omit<Series, "id">>): ChartData => ({
  ...data,
  series: data.series.map((s, i) => (i === index ? { ...s, ...change } : s)),
});
export const setValue = (data: ChartData, ci: number, si: number, value: number | null): ChartData =>
  tidy({
    ...data,
    categories: data.categories.map((c, i) => (i === ci ? { ...c, values: c.values.map((v, j) => (j === si ? value : v)) } : c)),
  });
/** Marks or unmarks a segment as correct. With max 1 the new one replaces the old one. */
export const toggleCorrect = (data: ChartData, id: string, max: number): ChartData => {
  if (!segmentIds(data).includes(id)) return data;
  if (data.correct.includes(id)) return { ...data, correct: data.correct.filter((x) => x !== id) };
  return { ...data, correct: max === 1 ? [id] : [...data.correct, id] };
};

/**
 * Text as a number: 1.5, 1,5, 1 234,5, 1.234,5, 1,234.5, -3, 45%, € 12. Both a point and a comma: the last one is the
 * decimal sign. Only one of them: the decimal sign, unless it groups thousands — 1,234 with a decimal point (English)
 * and 1.234 with a decimal comma (Dutch); without `decimal` (a paste) a comma is a decimal comma and a point a decimal
 * point, unless they group more than once (1.234.567). Not a number: null.
 */
export const parseNumber = (text: string, decimal?: "." | ","): number | null => {
  let t = String(text ?? "").trim().replace(/[\s  %€$£]/g, "").replace(/^\+/, "").replace(/[−–]/g, "-");
  if (!t) return null;
  const point = t.lastIndexOf(".");
  const comma = t.lastIndexOf(",");
  const groups = (sep: string, once: boolean) => new RegExp(`^-?\\d{1,3}(\\${sep}\\d{3})${once ? "+" : "{2,}"}$`).test(t);
  if (point >= 0 && comma >= 0) {
    t = point > comma ? t.replace(/,/g, "") : t.replace(/\./g, "").replace(",", ".");
  } else if (comma >= 0) {
    t = groups(",", decimal === ".") ? t.replace(/,/g, "") : t.replace(",", ".");
  } else if (point >= 0 && groups(".", decimal === ",")) {
    t = t.replace(/\./g, "");
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Tab separated text (from a spreadsheet) → rows of cells. A last empty line goes. */
export const parseTSV = (text: string): string[][] => {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  return lines.map((line) => line.split("\t"));
};

/**
 * Pastes a block of cells from a spreadsheet at a place in the table: row -1 is the row with the series' names,
 * column -1 the column with the categories' labels; the corner (-1, -1) takes a whole table with its headers. The
 * table grows when the block does not fit.
 */
export const pasteGrid = (data: ChartData, text: string, row: number, column: number): ChartData => {
  const block = parseTSV(text);
  let next = data;
  const width = Math.max(...block.map((r) => r.length));
  while (next.series.length < column + width) next = addSeries(next);
  while (next.categories.length < row + block.length) next = addCategory(next);
  block.forEach((cells, r) =>
    cells.forEach((cell, c) => {
      const ci = row + r;
      const si = column + c;
      if (ci < 0 && si < 0) return; // the corner: a header for the labels
      if (ci < 0) next = setSeries(next, si, { name: cell.trim() });
      else if (si < 0) next = setCategoryLabel(next, ci, cell.trim());
      else next = setValue(next, ci, si, parseNumber(cell));
    }),
  );
  return next;
};

/** The table as tab separated text with its headers, to copy into a spreadsheet. Numbers the English way. */
export const toTSV = (data: ChartData, corner = "") =>
  [[corner, ...data.series.map((s) => s.name)], ...data.categories.map((c) => [c.label, ...c.values.map((v) => (v === null ? "" : String(v)))])]
    .map((r) => r.join("\t"))
    .join("\n");

/** The most decimals any value has (at most 3): how the chart writes its numbers. */
export const dataDecimals = (data: ChartData) =>
  Math.min(3, Math.max(0, ...data.categories.flatMap((c) => c.values).map((v) => {
    if (v === null || !Number.isFinite(v)) return 0;
    const m = String(v).match(/\.(\d+)$/);
    return m ? m[1].length : 0;
  })));

/** The choice after a click on `id`: one choice replaces, more toggle up to the maximum (0: no limit). */
export const nextChoice = (selected: string[], id: string, max: number): string[] | null => {
  if (selected.includes(id)) return max === 1 ? selected : selected.filter((x) => x !== id);
  if (max === 1) return [id];
  if (max > 0 && selected.length >= max) return null;
  return [...selected, id];
};
