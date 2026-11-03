// The logic of the measuring instruments, without imports (npm test runs it in node): the settings, the scale and its
// ticks, where a value sits on the drawing and which value a pointer points at, snapping, numbers in English and
// Dutch, the correct response and the response processing.

export const KINDS = ["thermometer", "cylinder", "meter", "scale", "ruler", "caliper", "clock", "stopwatch", "manometer"] as const;
export type Kind = (typeof KINDS)[number];
export const MODES = ["read", "set", "range"] as const;
export type Mode = (typeof MODES)[number];
export type Language = "en" | "nl";

/** The instrument as the settings describe it, with every default filled in. */
export type Model = {
  kind: Kind;
  mode: Mode;
  /** The printed scale: from min to max, a labelled tick every `major`, `minor` divisions between them. */
  min: number;
  max: number;
  major: number;
  minor: number;
  unit: string;
  /** The value the instrument shows (read), the value to set (set) or the value to expect (range). */
  value: number;
  /** The reading precision: the step of the set mode and of the keyboard. */
  precision: number;
  /** Meter: the ranges the candidate can choose from, and the range plugged in (read, set). */
  ranges: number[];
  range: number;
  /** Caliper: divisions of the vernier (10: 0.1 mm, 20: 0.05 mm, 50: 0.02 mm). */
  vernier: number;
  /** A magnifier on hover and focus. */
  zoom: boolean;
  /** The margin of the response processing (0: an exact match); the PCI itself does not need it. */
  tolerance: number;
  language: Language;
  /** The values the candidate can set: the scale, or more for a clock (12 hours) or a stopwatch (30 minutes). */
  low: number;
  high: number;
};

type Defaults = { min: number; max: number; major: number; minor: number; unit: string; value: number; precision?: number };
export const DEFAULTS: Record<Kind, Defaults> = {
  thermometer: { min: -10, max: 50, major: 10, minor: 10, unit: "°C", value: 18 },
  cylinder: { min: 0, max: 50, major: 10, minor: 10, unit: "mL", value: 37 },
  meter: { min: 0, max: 3, major: 0.5, minor: 5, unit: "V", value: 2.4 },
  scale: { min: 0, max: 1000, major: 100, minor: 10, unit: "g", value: 460 },
  ruler: { min: 0, max: 15, major: 1, minor: 10, unit: "cm", value: 7.3 },
  caliper: { min: 0, max: 60, major: 10, minor: 10, unit: "mm", value: 23.4, precision: 0.1 },
  clock: { min: 0, max: 60, major: 5, minor: 5, unit: "", value: 635, precision: 1 },
  stopwatch: { min: 0, max: 60, major: 5, minor: 25, unit: "s", value: 83.4 },
  manometer: { min: 0, max: 4, major: 1, minor: 10, unit: "bar", value: 2.3 },
};
export const DEFAULT_RANGES = [3, 15];
/** Kinds with a needle on a dial, and kinds with a scale along a line. */
export const DIALS: Kind[] = ["meter", "scale", "clock", "stopwatch", "manometer"];
/** What a clock (minutes, 12 hours) and a stopwatch (seconds, 30 minutes) can show. */
export const CLOCK_HIGH = 720;
export const STOPWATCH_HIGH = 1800;
export const MAX_TICKS = 600;

/** A number from 10 decimals of floating point noise: 0.1 + 0.2 → 0.3. */
export const clean = (v: number) => (Number.isFinite(v) ? Number(v.toFixed(10)) : v);
/** The decimals a number needs: 0.25 → 2, 3 → 0. */
export const decimalsOf = (v: number) => {
  if (!Number.isFinite(v)) return 0;
  const text = String(clean(Math.abs(v)));
  if (text.includes("e-")) return Number(text.split("e-")[1]);
  return text.includes(".") ? text.split(".")[1].length : 0;
};
const num = (text: unknown, fallback: number) => {
  const t = String(text ?? "").trim().replace(",", ".").replace("−", "-");
  if (t === "") return fallback;
  const n = Number(t);
  return Number.isFinite(n) ? n : fallback;
};
export const parseRanges = (text: unknown): number[] => {
  const values = String(text ?? "").split(/[\s;|]+/).map((t) => num(t, NaN)).filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(values)].sort((a, b) => a - b);
};
export const kindOf = (text: unknown): Kind => (KINDS as readonly string[]).includes(String(text)) ? (text as Kind) : "thermometer";
export const modeOf = (text: unknown): Mode => (MODES as readonly string[]).includes(String(text)) ? (text as Mode) : "read";
export const languageOf = (text: unknown): Language => (String(text ?? "").slice(0, 2).toLowerCase() === "nl" ? "nl" : "en");

/** The best range for a value: the smallest one it fits in (a meter reads most precisely near its full scale). */
export const bestRange = (value: number, ranges: number[]): number | null => {
  const fits = ranges.filter((r) => r >= Math.abs(value) - 1e-9);
  return fits.length ? Math.min(...fits) : null;
};

/** Labelled ticks for a meter range: 3 to 8 intervals of 1, 2 or 5 × 10ⁿ, as on a school meter (3 V: 0.5 and 0.1). */
export const meterTicks = (range: number): { major: number; minor: number } => {
  let best: { major: number; minor: number; score: number } | null = null;
  const exponent = Math.floor(Math.log10(range));
  for (let e = exponent - 2; e <= exponent; e++) {
    for (const m of [1, 2, 5]) {
      const step = clean(m * 10 ** e);
      const n = range / step;
      if (Math.abs(n - Math.round(n)) > 1e-6 || n < 3 || n > 8) continue;
      const score = Math.abs(n - 5.5);
      const minor = m === 2 ? 4 : m === 5 && n > 4 ? 5 : 10;
      if (!best || score < best.score) best = { major: step, minor, score };
    }
  }
  return best ? { major: best.major, minor: best.minor } : { major: clean(range / 5), minor: 5 };
};

/** The data- attributes (strings; empty means the instrument's default) as a model. */
export const readModel = (p: Record<string, unknown>): Model => {
  const kind = kindOf(p.kind ?? p.instrument);
  const d = DEFAULTS[kind];
  let mode = modeOf(p.mode);
  if (mode === "range" && kind !== "meter") mode = "read";
  const value = num(p.value, d.value);
  let min = num(p.min, d.min);
  let max = num(p.max, d.max);
  let major = num(p.major, d.major);
  let minor = Math.round(num(p.minor, d.minor));
  const ranges = parseRanges(p.ranges);
  const meterRanges = ranges.length ? ranges : DEFAULT_RANGES;
  let range = 0;
  if (kind === "meter") {
    const given = num(p.range, NaN);
    range = meterRanges.includes(given) ? given : bestRange(value, meterRanges) ?? meterRanges[meterRanges.length - 1];
    min = 0;
    max = range;
    ({ major, minor } = meterTicks(range));
  }
  if (kind === "clock") ({ min, max, major, minor } = DEFAULTS.clock); // the clock face is the clock face
  if (kind === "stopwatch") ({ min, max } = DEFAULTS.stopwatch); // one turn of the big hand is a minute
  if (!(major > 0)) major = d.major;
  if (!(minor >= 1)) minor = 1;
  const vernier = Math.round(num(p.vernier, 10));
  const fallbackPrecision = kind === "caliper" ? clean(1 / Math.max(2, vernier)) : d.precision ?? clean(major / minor);
  let precision = num(p.precision, fallbackPrecision);
  if (!(precision > 0)) precision = fallbackPrecision;
  const low = kind === "clock" || kind === "stopwatch" ? 0 : Math.min(min, max);
  const high = kind === "clock" ? CLOCK_HIGH : kind === "stopwatch" ? STOPWATCH_HIGH : Math.max(min, max);
  return {
    kind, mode, min, max, major, minor, value, precision, vernier,
    unit: String(p.unit ?? "").trim() || d.unit,
    ranges: kind === "meter" ? meterRanges : ranges,
    range,
    zoom: String(p.zoom ?? "true").toLowerCase() !== "false",
    tolerance: Math.max(0, num(p.tolerance, 0)),
    language: languageOf(p.language),
    low, high,
  };
};

/** The settings of a model as data- attributes, as the authoring mode writes them. */
export const settingsOf = (m: Model): Record<string, string> => ({
  instrument: m.kind,
  mode: m.mode,
  min: String(m.min),
  max: String(m.max),
  major: String(m.major),
  minor: String(m.minor),
  unit: m.unit,
  value: String(m.value),
  precision: String(m.precision),
  ranges: m.kind === "meter" ? m.ranges.join(" ") : "",
  range: m.kind === "meter" ? String(m.range) : "",
  vernier: m.kind === "caliper" ? String(m.vernier) : "",
  zoom: String(m.zoom),
  tolerance: String(m.tolerance),
});

// --- the scale ---

export type Tick = { value: number; level: 0 | 1 | 2; label?: number };

/** Every tick of the scale: level 0 labelled (every major), 1 a middle tick, 2 the small ones. */
export const ticksOf = (m: Pick<Model, "min" | "max" | "major" | "minor">): Tick[] => {
  const step = m.major / m.minor;
  const count = Math.round((m.max - m.min) / step);
  if (!(count > 0) || count > MAX_TICKS) return [];
  const mid = m.minor % 5 === 0 && m.minor > 5 ? 5 : m.minor % 2 === 0 && m.minor > 2 ? m.minor / 2 : 0;
  const ticks: Tick[] = [];
  for (let i = 0; i <= count; i++) {
    const value = clean(m.min + i * step);
    const k = Math.round((value - m.min) / step);
    // a labelled tick sits on a multiple of major from min
    const isMajor = Math.abs((value - m.min) / m.major - Math.round((value - m.min) / m.major)) < 1e-6;
    const level = isMajor ? 0 : mid && k % mid === 0 ? 1 : 2;
    ticks.push(level === 0 ? { value, level, label: value } : { value, level });
  }
  return ticks;
};

/** Snaps to the precision and keeps the value on the instrument; a clock goes round. */
export const snap = (m: Pick<Model, "kind" | "precision" | "low" | "high">, v: number) => {
  let s = clean(Math.round(v / m.precision) * m.precision);
  if (m.kind === "clock") return clean(((s % CLOCK_HIGH) + CLOCK_HIGH) % CLOCK_HIGH);
  if (s < m.low) s = clean(Math.ceil(m.low / m.precision - 1e-9) * m.precision);
  if (s > m.high) s = clean(Math.floor(m.high / m.precision + 1e-9) * m.precision);
  return s;
};

/** A keyboard step: ±1 precision, ±"page" (a major division, an hour, 5 s), or to the start or the end. */
export const stepValue = (m: Model, v: number, key: string, shift = false): number | null => {
  const page = m.kind === "clock" ? 60 : m.kind === "stopwatch" ? 5 : m.major;
  const small = shift ? Math.max(m.precision, page) : m.precision;
  switch (key) {
    case "ArrowUp": case "ArrowRight": return snap(m, v + small);
    case "ArrowDown": case "ArrowLeft": return snap(m, v - small);
    case "PageUp": return snap(m, v + page);
    case "PageDown": return snap(m, v - page);
    case "Home": return snap(m, m.low);
    case "End": return m.kind === "clock" ? snap(m, CLOCK_HIGH - m.precision) : snap(m, m.high);
    default: return null;
  }
};

// --- numbers and times ---

export const formatNumber = (v: number, decimals: number, language: Language) => {
  const text = clean(v).toFixed(Math.max(0, Math.min(10, decimals)));
  return (language === "nl" ? text.replace(".", ",") : text).replace(/^-/, "−");
};
/** A value with as many decimals as it has (and at least those of the precision when given). */
export const formatValue = (v: number, language: Language, precision?: number) =>
  formatNumber(v, Math.max(decimalsOf(v), precision ? decimalsOf(precision) : 0), language);
/** Minutes after 12 o'clock as a time: 635 → "10:35" (0 → "12:00"). */
export const formatTime = (minutes: number) => {
  const m = ((Math.round(minutes) % CLOCK_HIGH) + CLOCK_HIGH) % CLOCK_HIGH;
  const h = Math.floor(m / 60);
  return `${h === 0 ? 12 : h}:${String(m % 60).padStart(2, "0")}`;
};
/** A value with its unit, as the candidate reads it: "18 °C", "2,4 V", "10:35". */
export const withUnit = (m: Pick<Model, "kind" | "unit" | "language" | "precision">, v: number) =>
  m.kind === "clock" ? formatTime(v) : `${formatValue(v, m.language)}${m.unit ? ` ${m.unit}` : ""}`;

/** A number as the candidate types it: a decimal comma or point, a minus sign; null when it is not a number. */
export const parseNumber = (text: string): number | null => {
  const t = String(text ?? "").trim().replace(/\s/g, "").replace(/[−–]/g, "-").replace(",", ".");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? clean(n) : null;
};
/** A time as the candidate types it, "10:35" or "10.35", as minutes after 12 o'clock; null when it is not a time. */
export const parseTime = (text: string): number | null => {
  const match = /^(\d{1,2})[:.,](\d{2})$/.exec(String(text ?? "").trim());
  if (!match) return null;
  const h = Number(match[1]);
  const min = Number(match[2]);
  if (h > 12 || min > 59) return null;
  return (h % 12) * 60 + min;
};
/** What the candidate typed, as the response value. */
export const parseReading = (kind: Kind, text: string) => (kind === "clock" ? parseTime(text) : parseNumber(text));

/**
 * Typing in the answer field: the language's decimal separator (a point becomes a comma in Dutch, and the other way
 * round), only characters that can make a number (or a time). Returns the text to show, or null to refuse the key.
 */
export const typed = (kind: Kind, text: string, language: Language, negative: boolean): string | null => {
  if (kind === "clock") {
    const t = text.replace(/[.,]/, ":");
    return /^\d{0,2}(:\d{0,2})?$/.test(t) ? t : null;
  }
  const t = (language === "nl" ? text.replace(/\./g, ",") : text.replace(/,/g, ".")).replace(/[−–]/g, "-");
  const pattern = negative ? /^-?\d{0,6}([.,]\d{0,4})?$/ : /^\d{0,6}([.,]\d{0,4})?$/;
  return pattern.test(t) ? t : null;
};
/** A response value back in the answer field, in the candidate's language. */
export const readingText = (kind: Kind, v: number, language: Language) =>
  kind === "clock" ? formatTime(v) : formatValue(v, language).replace("−", "-");

// --- the drawing: where a value sits, and which value a pointer points at ---

export type Point = { x: number; y: number };
export type Geometry =
  | { type: "linear"; width: number; height: number; from: Point; to: Point }
  | { type: "dial"; width: number; height: number; cx: number; cy: number; r: number; start: number; end: number; turn?: number };

/** Linear instruments run from `from` (min) to `to` (max); a ruler and a caliper are as long as the scale needs. */
export const geometryOf = (m: Pick<Model, "kind" | "min" | "max">): Geometry => {
  switch (m.kind) {
    case "thermometer": return { type: "linear", width: 220, height: 540, from: { x: 80, y: 450 }, to: { x: 80, y: 70 } };
    case "cylinder": return { type: "linear", width: 260, height: 540, from: { x: 130, y: 455 }, to: { x: 130, y: 95 } };
    case "ruler": return { type: "linear", width: 680, height: 230, from: { x: 40, y: 120 }, to: { x: 640, y: 120 } };
    case "caliper": return { type: "linear", width: 720, height: 320, from: { x: 70, y: 150 }, to: { x: 650, y: 150 } };
    case "meter": return { type: "dial", width: 360, height: 360, cx: 180, cy: 262, r: 190, start: -45, end: 45 };
    case "scale": return { type: "dial", width: 360, height: 420, cx: 180, cy: 250, r: 128, start: 0, end: 330 };
    case "manometer": return { type: "dial", width: 360, height: 430, cx: 180, cy: 185, r: 128, start: -135, end: 135 };
    case "clock": return { type: "dial", width: 360, height: 360, cx: 180, cy: 180, r: 148, start: 0, end: 360, turn: 60 };
    case "stopwatch": return { type: "dial", width: 360, height: 430, cx: 180, cy: 240, r: 140, start: 0, end: 360, turn: 60 };
  }
};

/** Degrees clockwise from 12 o'clock to a point on the drawing. */
export const angleAt = (cx: number, cy: number, x: number, y: number) => (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
export const polar = (cx: number, cy: number, r: number, degrees: number): Point => {
  const a = (degrees * Math.PI) / 180;
  return { x: clean(cx + r * Math.sin(a)), y: clean(cy - r * Math.cos(a)) };
};

/** Where a value of the printed scale lies: a fraction from min (0) to max (1). */
export const fractionOf = (m: Pick<Model, "min" | "max">, v: number) => (m.max === m.min ? 0 : (v - m.min) / (m.max - m.min));

/** The angle of the hand or the needle for a value (dials only); a clock shows its minute hand. */
export const angleOf = (m: Pick<Model, "kind" | "min" | "max">, g: Extract<Geometry, { type: "dial" }>, v: number) => {
  if (g.turn) return ((((v % g.turn) + g.turn) % g.turn) / g.turn) * 360;
  const f = Math.max(-0.02, Math.min(1.02, fractionOf(m, v))); // a meter pins just past its ends
  return g.start + f * (g.end - g.start);
};

/** The reading point of a value: where the needle tip, the liquid level or the jaw is. */
export const positionOf = (m: Pick<Model, "kind" | "min" | "max">, v: number): Point => {
  const g = geometryOf(m);
  if (g.type === "linear") {
    const f = Math.max(0, Math.min(1, fractionOf(m, v)));
    return { x: g.from.x + f * (g.to.x - g.from.x), y: g.from.y + f * (g.to.y - g.from.y) };
  }
  return polar(g.cx, g.cy, g.r * 0.92, angleOf(m, g, v));
};

/**
 * The value a pointer at (x, y) on the drawing points at, before snapping: along the scale of a linear instrument,
 * by its angle on a dial (past an end: the nearest end). A hand that goes round (clock, stopwatch) takes the turn
 * closest to `previous`, so dragging past 12 goes on into the next hour.
 */
export const valueAt = (m: Model, x: number, y: number, previous: number): number => {
  const g = geometryOf(m);
  if (g.type === "linear") {
    const dx = g.to.x - g.from.x;
    const dy = g.to.y - g.from.y;
    const f = Math.max(0, Math.min(1, ((x - g.from.x) * dx + (y - g.from.y) * dy) / (dx * dx + dy * dy)));
    return m.min + f * (m.max - m.min);
  }
  let a = angleAt(g.cx, g.cy, x, y);
  if (g.turn) {
    const within = (((a % 360) + 360) % 360) / 360 * g.turn;
    const turns = Math.round((previous - within) / g.turn);
    let v = turns * g.turn + within;
    if (m.kind === "clock") v = ((v % CLOCK_HIGH) + CLOCK_HIGH) % CLOCK_HIGH;
    return Math.max(m.low, Math.min(m.kind === "clock" ? CLOCK_HIGH : m.high, v));
  }
  // into [start, start + 360): past the end, the nearest end
  a = ((((a - g.start) % 360) + 360) % 360) + g.start;
  if (a > g.end) a = a - g.end < g.start + 360 - a ? g.end : g.start;
  return m.min + ((a - g.start) / (g.end - g.start)) * (m.max - m.min);
};

/** The vernier of a caliper: its ticks lie (n − 1)/n mm apart, so tick k lines up with the main scale at value + k·(n−1)/n. */
export const vernierTicks = (vernier: number) =>
  Array.from({ length: vernier + 1 }, (_, k) => ({ k, offset: clean((k * (vernier - 1)) / vernier), label: (k * 10) % vernier === 0 ? (k * 10) / vernier : undefined }));

// --- the answer ---

/** The correct response for the settings: the value (read, set) or the best range (range); null when there is none. */
export const correctValue = (m: Model): number | null => {
  if (!Number.isFinite(m.value)) return null;
  if (m.mode === "range") return bestRange(m.value, m.ranges);
  if (m.kind === "clock") return ((Math.round(m.value) % CLOCK_HIGH) + CLOCK_HIGH) % CLOCK_HIGH;
  return clean(m.value);
};

/** Is the response within the margin (QTI's qti-equal with an absolute tolerance, bounds included)? */
export const isCorrect = (response: number | null | undefined, correct: number, tolerance: number) =>
  response !== null && response !== undefined && Number.isFinite(response) && Math.abs(response - correct) <= tolerance + 1e-9;

export type Problem =
  | { code: "maxNotAboveMin" }
  | { code: "majorDoesNotFit" }
  | { code: "tooManyTicks" }
  | { code: "valueOutside"; low: number; high: number }
  | { code: "valueOffPrecision" }
  | { code: "rangeOnlyMeter" }
  | { code: "noRangeFits" }
  | { code: "fewRanges" }
  | { code: "vernier" };

/** What keeps the settings from making a good item (the authoring mode's validate()). */
export const problemsOf = (p: Record<string, unknown>): Problem[] => {
  const m = readModel(p);
  const problems: Problem[] = [];
  if (modeOf(p.mode) === "range" && m.kind !== "meter") problems.push({ code: "rangeOnlyMeter" });
  if (m.kind !== "meter" && m.kind !== "clock" && m.kind !== "stopwatch") {
    if (!(m.max > m.min)) problems.push({ code: "maxNotAboveMin" });
    else {
      const n = (m.max - m.min) / m.major;
      if (Math.abs(n - Math.round(n)) > 1e-6) problems.push({ code: "majorDoesNotFit" });
      else if (!ticksOf(m).length) problems.push({ code: "tooManyTicks" });
    }
  }
  if (m.kind === "caliper" && (m.vernier < 2 || m.vernier > 50)) problems.push({ code: "vernier" });
  if (m.mode === "range") {
    if (m.ranges.length < 2) problems.push({ code: "fewRanges" });
    if (bestRange(m.value, m.ranges) === null) problems.push({ code: "noRangeFits" });
  } else {
    if (m.value < m.low - 1e-9 || m.value > m.high + 1e-9 || (m.kind === "clock" && m.value >= CLOCK_HIGH)) {
      problems.push({ code: "valueOutside", low: m.low, high: m.kind === "clock" ? CLOCK_HIGH - 1 : m.high });
    } else if (Math.abs(m.value / m.precision - Math.round(m.value / m.precision)) > 1e-6) problems.push({ code: "valueOffPrecision" });
  }
  return problems;
};

/** The response processing for the item: an exact match, or the correct value within a margin. */
export const responseProcessingXml = (tolerance: number) =>
  tolerance > 0
    ? [
        "<qti-response-processing>",
        "  <qti-response-condition>",
        "    <qti-response-if>",
        `      <qti-equal tolerance-mode="absolute" tolerance="${clean(tolerance)}">`,
        '        <qti-variable identifier="RESPONSE"/>',
        '        <qti-correct identifier="RESPONSE"/>',
        "      </qti-equal>",
        '      <qti-set-outcome-value identifier="SCORE">',
        '        <qti-base-value base-type="float">1</qti-base-value>',
        "      </qti-set-outcome-value>",
        "    </qti-response-if>",
        "  </qti-response-condition>",
        "</qti-response-processing>",
      ].join("\n")
    : '<qti-response-processing template="https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/match_correct.xml"/>';
