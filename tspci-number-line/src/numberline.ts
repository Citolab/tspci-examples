// The number line without a screen: numbers (parse and show integers, decimals, fractions, negatives), the line and its
// ticks, snapping, intervals, jumps, the response, the PCI's own scoring and the response processing for QTI scoring.
// No imports: `npm test` runs it in node as it is.

export type Format = "decimal" | "fraction" | "mixed";
export type Mode = "points" | "interval" | "jumps" | "read";
export type Snap = "tick" | "half" | "tenth";
export type Orientation = "horizontal" | "vertical";

export type Line = {
  min: number;
  max: number;
  /** Distance between two ticks. */
  tickStep: number;
  /** Distance between two labelled ticks; 0: only the ends. */
  labelStep: number;
  format: Format;
  /** Labelled ticks whose label the candidate does not see. */
  hidden: number[];
};

/** An end of an interval: a filled dot, an open dot, or no end (it runs on to the end of the line). */
export type EndKind = "closed" | "open" | "none";
export type Interval = { from: number; to: number; fromEnd: EndKind; toEnd: EndKind };

export type PointDef = { label: string; answer: number | null };
/** Read mode: a marked point whose value the candidate types, or a tick whose label the candidate fills in. */
export type ReadItem = { kind: "point" | "tick"; label: string; value: number };

/** data-task: what the candidate has to do, per mode, with the correct answers. */
export type Task = {
  points: PointDef[];
  interval: Interval | null;
  /** The positions of the correct route: the start, then every landing. givenStart: the candidate starts there. */
  jumps: { givenStart: boolean; answer: number[] };
  read: ReadItem[];
  /** Absolute margin for the PCI's scoring and the generated response processing. */
  tolerance: number;
};

/** What the candidate did, in every mode (only the item's mode counts). */
export type Answer = {
  points: (number | null)[];
  interval: Interval | null;
  /** The start of the route, when the candidate places it (not given). */
  start: number | null;
  landings: number[];
  /** What the candidate typed per read item. */
  read: string[];
};

export type Evaluation = { checks: boolean[]; score: number; maxscore: number; correct: boolean };

export const MAX_ITEMS = 8;
export const MAX_TICKS = 400;
/** Jumps the candidate can make; the author's route has at most 7 jumps (8 positions, check1 … check8). */
export const MAX_JUMPS = 10;
export const MAX_ANSWER_JUMPS = 7;
const EPS = 1e-9;

/** Away with floating point noise: 0.1 + 0.2 → 0.3, 1/3 → 0.333333333. */
export const clean = (v: number) => {
  const r = Number((Math.round(v * 1e9) / 1e9).toFixed(9));
  return Object.is(r, -0) ? 0 : r;
};
export const near = (a: number, b: number, tolerance = 0) => Math.abs(a - b) <= tolerance + 1e-7;
const isMultiple = (v: number, step: number) => step > 0 && Math.abs(v / step - Math.round(v / step)) < 1e-6;

// --- numbers

const VULGAR: Record<string, number> = {
  "¼": 1 / 4, "½": 1 / 2, "¾": 3 / 4, "⅓": 1 / 3, "⅔": 2 / 3, "⅕": 1 / 5, "⅖": 2 / 5, "⅗": 3 / 5, "⅘": 4 / 5,
  "⅙": 1 / 6, "⅚": 5 / 6, "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8,
};

/**
 * A number as a person writes it: "3", "-2", "2,75" or "2.75", "−1¼", "-1 1/4", "11/4", "½". Both a comma and a point
 * are a decimal separator (there are no thousands separators on a number line). Null when it is not a number.
 */
export const parseNumber = (text: unknown): number | null => {
  let s = String(text ?? "").trim().replace(/[−–‒]/g, "-").replace(/\s+/g, " ").replace(/⁄/g, "/");
  if (!s) return null;
  let sign = 1;
  if (s[0] === "-" || s[0] === "+") {
    if (s[0] === "-") sign = -1;
    s = s.slice(1).trim();
  }
  if (!s) return null;
  const last = s[s.length - 1];
  if (VULGAR[last] !== undefined) {
    const whole = s.slice(0, -1).trim();
    if (whole && !/^\d+$/.test(whole)) return null;
    return sign * (Number(whole || 0) + VULGAR[last]);
  }
  let m = s.match(/^(\d+) (\d+)\/(\d+)$/);
  if (m) return Number(m[3]) > 0 ? sign * (Number(m[1]) + Number(m[2]) / Number(m[3])) : null;
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[2]) > 0 ? (sign * Number(m[1])) / Number(m[2]) : null;
  if (/^\d+([.,]\d*)?$/.test(s) || /^[.,]\d+$/.test(s)) return clean(sign * Number(s.replace(",", ".")));
  return null;
};

/** The fraction closest to v with a denominator up to maxDen, when it is v; null otherwise. */
export const toFraction = (v: number, maxDen = 1000): { negative: boolean; num: number; den: number } | null => {
  const x = Math.abs(v);
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0, b = x;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    if (Math.abs(x - h1 / k1) < 1e-7 || b - a < 1e-12) break;
    b = 1 / (b - a);
  }
  if (k1 === 0 || Math.abs(x - h1 / k1) > 1e-6) return null;
  return { negative: v < 0 && h1 !== 0, num: h1, den: k1 };
};

/** How a number is shown: a decimal, or a whole and/or a fraction (stacked in the drawing). */
export type NumberParts = { negative: boolean; decimal: string | null; whole: number | null; num: number; den: number };

export const toDecimal = (v: number, language = "en", maxDecimals = 6) => {
  let s = clean(v).toFixed(maxDecimals);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  if (s === "-0") s = "0";
  if (language === "nl") s = s.replace(".", ",");
  return s.replace("-", "−");
};

export const numberParts = (v: number, format: Format, language = "en"): NumberParts => {
  const f = format === "decimal" || Number.isInteger(clean(v)) ? null : toFraction(v);
  if (!f || f.den === 1) {
    const d = toDecimal(Math.abs(v), language);
    return { negative: clean(v) < 0, decimal: d, whole: null, num: 0, den: 1 };
  }
  if (format === "mixed" && f.num > f.den) {
    return { negative: f.negative, decimal: null, whole: Math.floor(f.num / f.den), num: f.num % f.den, den: f.den };
  }
  return { negative: f.negative, decimal: null, whole: null, num: f.num, den: f.den };
};

/** A number as text: "2,75" (nl), "−11/4", "−2 3/4". */
export const formatNumber = (v: number, format: Format, language = "en") => {
  const p = numberParts(v, format, language);
  const sign = p.negative ? "−" : "";
  if (p.decimal !== null) return sign + p.decimal;
  return sign + (p.whole !== null ? `${p.whole} ` : "") + `${p.num}/${p.den}`;
};

/** The number in a response: language independent, with a point ("-1.25"). */
export const canonical = (v: number) => toDecimal(v, "en", 9).replace("−", "-");

// --- the line

export type Tick = { value: number; labelled: boolean; hidden: boolean };

/** The line from the data- attributes, within limits: never empty, never more than MAX_TICKS ticks. */
export const parseLine = (p: Record<string, unknown>): Line => {
  let min = parseNumber(p.min) ?? -3;
  let max = parseNumber(p.max) ?? 8;
  if (max <= min) max = min + 10;
  let tickStep = parseNumber(p.tickStep);
  if (!tickStep || tickStep <= 0) tickStep = 1;
  while ((max - min) / tickStep > MAX_TICKS) tickStep *= 2;
  const labelText = String(p.labelStep ?? "").trim();
  let labelStep = labelText === "" ? tickStep : parseNumber(labelText);
  if (labelStep === null || labelStep < 0) labelStep = tickStep;
  const format = (["decimal", "fraction", "mixed"].includes(String(p.numberFormat)) ? p.numberFormat : "decimal") as Format;
  return { min, max, tickStep, labelStep, format, hidden: parseList(p.hiddenLabels) };
};

/** "2; 5 1/2; 7" → [2, 5.5, 7]: semicolons or line breaks between the numbers (a comma can be a decimal comma). */
export const parseList = (value: unknown): number[] =>
  String(value ?? "")
    .split(/[;\n|]+/)
    .flatMap((part) => (/\d\s*\/|[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/.test(part) ? [part] : part.trim().split(/\s+/)))
    .map(parseNumber)
    .filter((n): n is number => n !== null);

export const ticks = (line: Line): Tick[] => {
  const out: Tick[] = [];
  const n = Math.round((line.max - line.min) / line.tickStep + 1e-9);
  for (let k = 0; k <= n; k++) {
    const value = clean(line.min + k * line.tickStep);
    if (value > line.max + EPS) break;
    const labelled = line.labelStep > 0 ? isMultiple(value, line.labelStep) : k === 0 || near(value, line.max);
    out.push({ value, labelled, hidden: labelled && line.hidden.some((h) => near(h, value)) });
  }
  return out;
};

export const isTick = (line: Line, v: number) => v >= line.min - EPS && v <= line.max + EPS && isMultiple(v - line.min, line.tickStep);

export const snapStep = (line: Line, snap: Snap) => (snap === "tenth" ? line.tickStep / 10 : snap === "half" ? line.tickStep / 2 : line.tickStep);

export const clamp = (v: number, line: Line) => Math.min(line.max, Math.max(line.min, v));

/** v on the grid of the snap step, counted from the start of the line, on the line. */
export const snapTo = (v: number, line: Line, step: number) => {
  const s = line.min + Math.round((clamp(v, line) - line.min) / step) * step;
  const top = line.min + Math.floor((line.max - line.min) / step + 1e-9) * step;
  return clean(Math.min(top, Math.max(line.min, s)));
};

/** The arrow keys: fine moves one snap step, coarse (Shift, Page Up/Down) a labelled step or a tick. */
export const keySteps = (line: Line, snap: Snap) => {
  const fine = snapStep(line, snap);
  const coarse = line.labelStep > fine + EPS ? line.labelStep : line.tickStep > fine + EPS ? line.tickStep : fine * 5;
  return { fine, coarse };
};

export const middle = (line: Line, step: number) => snapTo((line.min + line.max) / 2, line, step);

// --- intervals

export const serializeInterval = (i: Interval) =>
  (i.fromEnd === "none" ? "(-inf" : (i.fromEnd === "closed" ? "[" : "(") + canonical(i.from)) +
  "," +
  (i.toEnd === "none" ? "inf)" : canonical(i.to) + (i.toEnd === "closed" ? "]" : ")"));

/** "[-2,inf)", "(3,5]", "(-inf,4)"; null when it is not an interval. */
export const parseInterval = (text: unknown): Interval | null => {
  const m = String(text ?? "").trim().match(/^([[(])\s*([^,]+?)\s*[,;]\s*([^,;]+?)\s*([\])])$/);
  if (!m) return null;
  const lowInf = /^-\s*inf/i.test(m[2]), highInf = /^\+?\s*inf/i.test(m[3]);
  const from = lowInf ? 0 : Number(m[2]), to = highInf ? 0 : Number(m[3]);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return {
    from: clean(from), to: clean(to),
    fromEnd: lowInf ? "none" : m[1] === "[" ? "closed" : "open",
    toEnd: highInf ? "none" : m[4] === "]" ? "closed" : "open",
  };
};

/** On the line, from ≤ to; an end without an end lies at the end of the line. */
export const normalizeInterval = (i: Interval, line: Line): Interval => {
  let from = i.fromEnd === "none" ? line.min : clamp(i.from, line);
  let to = i.toEnd === "none" ? line.max : clamp(i.to, line);
  let { fromEnd, toEnd } = i;
  if (from > to) {
    [from, to] = [to, from];
    [fromEnd, toEnd] = [toEnd, fromEnd];
  }
  return { from: clean(from), to: clean(to), fromEnd, toEnd };
};

/** "x ≥ −2", "3 < x ≤ 5", "x < 4"; null for the whole line. */
export const inequality = (i: Interval, format: Format, language = "en", variable = "x") => {
  const n = (v: number) => formatNumber(v, format, language);
  const lo = i.fromEnd === "closed" ? "≤" : "<";
  const hi = i.toEnd === "closed" ? "≤" : "<";
  if (i.fromEnd === "none" && i.toEnd === "none") return null;
  if (i.fromEnd === "none") return `${variable} ${hi} ${n(i.to)}`;
  if (i.toEnd === "none") return `${variable} ${i.fromEnd === "closed" ? "≥" : ">"} ${n(i.from)}`;
  return `${n(i.from)} ${lo} ${variable} ${hi} ${n(i.to)}`;
};

// --- jumps

/** "+4", "−3", "+1/2". */
export const jumpText = (from: number, to: number, format: Format, language = "en") => {
  const d = clean(to - from);
  return (d < 0 ? "−" : "+") + formatNumber(Math.abs(d), format, language);
};

/** "2 + 4 − 3 = 3". */
export const sumText = (positions: number[], format: Format, language = "en") => {
  if (positions.length < 2) return positions.length ? formatNumber(positions[0], format, language) : "";
  const parts = [formatNumber(positions[0], format, language)];
  for (let i = 1; i < positions.length; i++) {
    const j = jumpText(positions[i - 1], positions[i], format, language);
    parts.push(`${j[0]} ${j.slice(1)}`);
  }
  return `${parts.join(" ")} = ${formatNumber(positions[positions.length - 1], format, language)}`;
};

// --- the task

const numberOr = (v: unknown, fallback: number | null) => {
  if (typeof v === "number" && Number.isFinite(v)) return clean(v);
  const n = parseNumber(v);
  return n === null ? fallback : n;
};
const text = (v: unknown, fallback = "") => (typeof v === "string" ? v : v === undefined || v === null ? fallback : String(v));

/** The example: −3 to 8 in quarters (data-task empty). */
export const exampleTask = (): Task => ({
  points: [{ label: "A", answer: 2.75 }, { label: "B", answer: -1.25 }],
  interval: { from: -2, to: 8, fromEnd: "closed", toEnd: "none" },
  jumps: { givenStart: true, answer: [2, 6, 3] },
  read: [{ kind: "point", label: "A", value: 4.5 }, { kind: "point", label: "B", value: -1.75 }, { kind: "tick", label: "", value: 6 }],
  tolerance: 0,
});

const endKind = (v: unknown, fallback: EndKind): EndKind => (v === "closed" || v === "open" || v === "none" ? v : fallback);

/** data-task (JSON) with defaults for what is missing; the example when it is empty or not JSON. */
export const parseTask = (json: unknown): Task => {
  const example = exampleTask();
  let raw: any;
  try {
    raw = typeof json === "string" ? (json.trim() ? JSON.parse(json) : null) : json;
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== "object") return example;
  const points: PointDef[] = Array.isArray(raw.points)
    ? raw.points.slice(0, MAX_ITEMS).map((p: any, i: number) => ({ label: text(p?.label, String.fromCharCode(65 + i)), answer: numberOr(p?.answer, null) }))
    : [];
  let interval: Interval | null = null;
  if (typeof raw.interval === "string") interval = parseInterval(raw.interval);
  else if (raw.interval && typeof raw.interval === "object") {
    interval = {
      from: numberOr(raw.interval.from, 0), to: numberOr(raw.interval.to, 0),
      fromEnd: endKind(raw.interval.fromEnd, raw.interval.from === null ? "none" : "closed"),
      toEnd: endKind(raw.interval.toEnd, raw.interval.to === null ? "none" : "closed"),
    };
  }
  const jumps = {
    givenStart: raw.jumps?.givenStart !== false,
    answer: Array.isArray(raw.jumps?.answer)
      ? raw.jumps.answer.map((v: unknown) => numberOr(v, null)).filter((v: number | null) => v !== null).slice(0, MAX_ANSWER_JUMPS + 1)
      : [],
  };
  const read: ReadItem[] = Array.isArray(raw.read)
    ? raw.read
        .slice(0, MAX_ITEMS)
        .map((r: any) => ({ kind: r?.kind === "tick" ? "tick" : "point", label: text(r?.label), value: numberOr(r?.value, null) }))
        .filter((r: any) => r.value !== null)
    : [];
  const tolerance = Math.max(0, numberOr(raw.tolerance, 0) ?? 0);
  return { points, interval, jumps, read, tolerance };
};

export const serializeTask = (t: Task) => JSON.stringify(t);

// --- the candidate's answer and the response

export const emptyAnswer = (task: Task): Answer => ({
  points: task.points.map(() => null),
  interval: null,
  start: null,
  landings: [],
  read: task.read.map(() => ""),
});

/** The route: the start (given or placed) and every landing. */
export const positionsOf = (task: Task, a: Answer): number[] => {
  const start = task.jumps.givenStart ? task.jumps.answer[0] ?? null : a.start;
  return start === null || start === undefined ? [] : [start, ...a.landings];
};

/** The candidate's values per item of the mode (null: not placed, not typed or not a number). */
export const candidateValues = (mode: Mode, task: Task, a: Answer): (number | null)[] =>
  mode === "points" ? task.points.map((_, i) => a.points[i] ?? null)
  : mode === "read" ? task.read.map((_, i) => parseNumber(a.read[i]))
  : mode === "jumps" ? positionsOf(task, a)
  : [];

/**
 * The response for QTI scoring: the values (an ordered float list), or the interval as a string. Null until the
 * answer is complete: every point placed, every value typed, a jump made (or the start placed), an interval marked.
 */
export const qtiValue = (mode: Mode, task: Task, a: Answer): number[] | string | null => {
  if (mode === "interval") return a.interval ? serializeInterval(a.interval) : null;
  const values = candidateValues(mode, task, a);
  if (mode === "jumps") return values.length && (a.landings.length || !task.jumps.givenStart) ? values.map(clean) : null;
  return values.length && values.every((v) => v !== null) ? values.map((v) => clean(v as number)) : null;
};

/** The answer as one text, for the record's answer field: "2.75 -1.25", "[-2,inf)", "2 6 3"; "?" for what is missing. */
export const answerText = (mode: Mode, task: Task, a: Answer) => {
  if (mode === "interval") return a.interval ? serializeInterval(a.interval) : "";
  return candidateValues(mode, task, a).map((v) => (v === null ? "?" : canonical(v))).join(" ");
};

/** Whether the candidate did anything (otherwise getResponse reports nothing). */
export const touched = (mode: Mode, task: Task, a: Answer) =>
  mode === "points" ? a.points.some((v) => v !== null)
  : mode === "interval" ? !!a.interval
  : mode === "jumps" ? a.landings.length > 0 || (!task.jumps.givenStart && a.start !== null)
  : a.read.some((r) => r.trim() !== "");

/** The correct values of the task (as the response would be), or null when the author has not set them. */
export const correctValue = (mode: Mode, task: Task): number[] | string | null => {
  if (mode === "interval") return task.interval ? serializeInterval(task.interval) : null;
  if (mode === "jumps") return task.jumps.answer.length >= 2 ? task.jumps.answer.map(clean) : null;
  const values = mode === "points" ? task.points.map((p) => p.answer) : task.read.map((r) => r.value);
  return values.length && values.every((v) => v !== null) ? values.map((v) => clean(v as number)) : null;
};

/** The candidate's answer from a response (values or an interval text): for setResponse, boundTo and the solution. */
export const answerFrom = (mode: Mode, task: Task, value: number[] | string, line: Line, language = "en"): Answer => {
  const a = emptyAnswer(task);
  if (mode === "interval") {
    const i = parseInterval(Array.isArray(value) ? "" : value);
    return { ...a, interval: i ? normalizeInterval(i, line) : null };
  }
  const values = (Array.isArray(value) ? value : String(value).trim().split(/\s+/)).map((v) =>
    typeof v === "number" ? v : v === "?" ? null : parseNumber(v)
  );
  if (mode === "points") return { ...a, points: task.points.map((_, i) => (values[i] === null || values[i] === undefined ? null : clamp(values[i], line))) };
  if (mode === "read") return { ...a, read: task.read.map((_, i) => (values[i] === null || values[i] === undefined ? "" : formatNumber(values[i], line.format, language))) };
  const route = values.filter((v): v is number => v !== null).map((v) => clamp(v, line));
  if (task.jumps.givenStart) return { ...a, landings: route.slice(1, MAX_JUMPS + 1) };
  return { ...a, start: route[0] ?? null, landings: route.slice(1, MAX_JUMPS + 1) };
};

/** The task's correct answer as the candidate would leave it (the solution status, the authoring mode). */
export const correctAnswer = (mode: Mode, task: Task, line: Line, language = "en"): Answer | null => {
  const value = correctValue(mode, task);
  return value === null ? null : answerFrom(mode, task, value, line, language);
};

const endOk = (kind: EndKind, value: number, correctKind: EndKind, correctValue: number, tolerance: number) =>
  kind === correctKind && (kind === "none" || near(value, correctValue, tolerance));

/**
 * The PCI's own scoring (data-scoring="pci"): one check per point, per value to read off, per end of the interval,
 * per position of the route (the start only when the candidate places it). correct: every check and, for jumps, no
 * jumps more or less than the route.
 */
export const evaluate = (mode: Mode, task: Task, a: Answer): Evaluation => {
  const tol = task.tolerance;
  let checks: boolean[] = [];
  let extra = true;
  if (mode === "points" || mode === "read") {
    const correct = mode === "points" ? task.points.map((p) => p.answer) : task.read.map((r) => r.value);
    const values = candidateValues(mode, task, a);
    checks = correct.map((c, i) => c !== null && values[i] !== null && near(values[i] as number, c, tol));
  } else if (mode === "interval") {
    const c = task.interval, i = a.interval;
    checks = c ? [!!i && endOk(i.fromEnd, i.from, c.fromEnd, c.from, tol), !!i && endOk(i.toEnd, i.to, c.toEnd, c.to, tol)] : [];
  } else {
    const route = task.jumps.answer;
    const values = positionsOf(task, a);
    checks = route.map((c, i) => values[i] !== undefined && near(values[i], c, tol));
    if (task.jumps.givenStart) checks = checks.slice(1);
    extra = values.length === route.length;
  }
  checks = checks.slice(0, MAX_ITEMS);
  const score = checks.filter(Boolean).length;
  return { checks, score, maxscore: checks.length, correct: checks.length > 0 && score === checks.length && extra };
};

// --- the authoring mode's checks

export type Problem =
  | { code: "range" | "tickStep" | "tooManyTicks" | "labelStep" | "noItems" | "noInterval" | "noJumps" | "duplicateLabels" }
  | { code: "noLabel" | "noAnswer" | "outOfRange" | "notOnTick" | "outsideGrid"; label: string };

/** What keeps a line (the author's texts) from working. */
export const lineProblems = (raw: { min: string; max: string; tickStep: string; labelStep: string }): Problem[] => {
  const min = parseNumber(raw.min), max = parseNumber(raw.max), tick = parseNumber(raw.tickStep);
  const label = raw.labelStep.trim() === "" ? tick : parseNumber(raw.labelStep);
  const problems: Problem[] = [];
  if (min === null || max === null || max <= min) problems.push({ code: "range" });
  if (tick === null || tick <= 0) problems.push({ code: "tickStep" });
  else if (min !== null && max !== null && max > min && (max - min) / tick > MAX_TICKS) problems.push({ code: "tooManyTicks" });
  if (label === null || label < 0 || (tick && label > 0 && !isMultiple(label, tick))) problems.push({ code: "labelStep" });
  return problems;
};

/** What keeps the task of the mode from being answered or scored. */
export const taskProblems = (mode: Mode, line: Line, task: Task, snap: Snap): Problem[] => {
  const problems: Problem[] = [];
  const inRange = (v: number) => v >= line.min - EPS && v <= line.max + EPS;
  const onGrid = (v: number) => isMultiple(v - line.min, snapStep(line, snap));
  const name = (label: string, i: number) => label.trim() || String(i + 1);
  if (mode === "points") {
    if (!task.points.length) problems.push({ code: "noItems" });
    task.points.forEach((p, i) => {
      if (!p.label.trim()) problems.push({ code: "noLabel", label: String(i + 1) });
      if (p.answer === null) problems.push({ code: "noAnswer", label: name(p.label, i) });
      else if (!inRange(p.answer)) problems.push({ code: "outOfRange", label: name(p.label, i) });
      else if (task.tolerance === 0 && !onGrid(p.answer)) problems.push({ code: "outsideGrid", label: name(p.label, i) });
    });
    const labels = task.points.map((p) => p.label.trim()).filter(Boolean);
    if (new Set(labels).size < labels.length) problems.push({ code: "duplicateLabels" });
  } else if (mode === "read") {
    if (!task.read.length) problems.push({ code: "noItems" });
    task.read.forEach((r, i) => {
      const n = r.kind === "tick" ? `${i + 1}` : name(r.label, i);
      if (r.kind === "point" && !r.label.trim()) problems.push({ code: "noLabel", label: String(i + 1) });
      if (!inRange(r.value)) problems.push({ code: "outOfRange", label: n });
      else if (r.kind === "tick" && !isTick(line, r.value)) problems.push({ code: "notOnTick", label: n });
    });
  } else if (mode === "interval") {
    if (!task.interval) problems.push({ code: "noInterval" });
  } else if (task.jumps.answer.length < 2) problems.push({ code: "noJumps" });
  return problems;
};

// --- QTI response processing (data-scoring="qti", the default)

const f = (n: number) => canonical(n);

/** The response processing that scores the correct response with the task's margin: one point per check, as evaluate(). */
export const responseProcessingXml = (mode: Mode, task: Task, responseIdentifier = "RESPONSE") => {
  const r = `<qti-variable identifier="${responseIdentifier}"/>`;
  const tol = Math.max(task.tolerance, 0.000001);
  const addOne = [
    `      <qti-set-outcome-value identifier="SCORE">`,
    `        <qti-sum><qti-variable identifier="SCORE"/><qti-base-value base-type="float">1</qti-base-value></qti-sum>`,
    `      </qti-set-outcome-value>`,
  ];
  const rules: string[] = [];
  let max = 0;
  let declaration = `<qti-response-declaration identifier="${responseIdentifier}" cardinality="ordered" base-type="float"/>`;
  if (mode === "interval") {
    declaration = `<qti-response-declaration identifier="${responseIdentifier}" cardinality="single" base-type="string"/>`;
    if (task.interval) {
      max = 1;
      rules.push(
        `  <!-- the interval, exactly: ${serializeInterval(task.interval)} -->`,
        `  <qti-response-condition>`,
        `    <qti-response-if>`,
        `      <qti-match>${r}<qti-base-value base-type="string">${serializeInterval(task.interval)}</qti-base-value></qti-match>`,
        ...addOne,
        `    </qti-response-if>`,
        `  </qti-response-condition>`
      );
    }
  } else {
    const correct = mode === "points" ? task.points.map((p) => p.answer) : mode === "read" ? task.read.map((r) => r.value) : task.jumps.answer;
    const names = mode === "points" ? task.points.map((p, i) => `point ${p.label || i + 1}`)
      : mode === "read" ? task.read.map((x, i) => (x.kind === "tick" ? `tick label ${i + 1}` : `point ${x.label || i + 1}`))
      : task.jumps.answer.map((_, i) => (i === 0 ? "the start" : `landing ${i}`));
    correct.forEach((c, i) => {
      if (c === null || (mode === "jumps" && i === 0 && task.jumps.givenStart)) return;
      max++;
      rules.push(
        `  <!-- ${names[i]}: ${f(c)}${task.tolerance ? ` (± ${f(task.tolerance)})` : ""} -->`,
        `  <qti-response-condition>`,
        `    <qti-response-if>`,
        `      <qti-equal tolerance-mode="absolute" tolerance="${f(tol)}"><qti-index n="${i + 1}">${r}</qti-index><qti-base-value base-type="float">${f(c)}</qti-base-value></qti-equal>`,
        ...addOne,
        `    </qti-response-if>`,
        `  </qti-response-condition>`
      );
    });
  }
  return [
    declaration,
    `<qti-outcome-declaration identifier="SCORE" cardinality="single" base-type="float">`,
    `  <qti-default-value><qti-value>0</qti-value></qti-default-value>`,
    `</qti-outcome-declaration>`,
    `<qti-outcome-declaration identifier="MAXSCORE" cardinality="single" base-type="float">`,
    `  <qti-default-value><qti-value>${max}</qti-value></qti-default-value>`,
    `</qti-outcome-declaration>`,
    `…`,
    `<qti-response-processing>`,
    ...rules,
    `</qti-response-processing>`,
  ].join("\n");
};

// --- the data- attributes

export type Settings = {
  line: Line;
  mode: Mode;
  task: Task;
  snap: Snap;
  orientation: Orientation;
  length: number;
  showValues: boolean;
  scoring: "qti" | "pci";
  language: string;
};

const choice = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  (options as readonly string[]).includes(String(value)) ? (value as T) : fallback;

/** Every setting, from the data- attributes (as text), within limits. */
export const readSettings = (p: Record<string, unknown>): Settings => {
  const length = Math.round(Number(p.length));
  return {
    line: parseLine(p),
    mode: choice(p.mode, ["points", "interval", "jumps", "read"] as const, "points"),
    task: parseTask(p.task),
    snap: choice(p.snap, ["tick", "half", "tenth"] as const, "tick"),
    orientation: choice(p.orientation, ["horizontal", "vertical"] as const, "horizontal"),
    length: Number.isFinite(length) ? Math.min(1200, Math.max(240, length)) : 640,
    showValues: String(p.showValues).toLowerCase() === "true",
    scoring: choice(p.scoring, ["qti", "pci"] as const, "qti"),
    language: String(p.language ?? "en").slice(0, 2).toLowerCase() === "nl" ? "nl" : "en",
  };
};
