// The settings of the oscilloscope (data- attributes, all text) as numbers, the knobs' steps and rounding, and the
// response values. No imports: `npm test` runs it in node.

export type Waveform = "sine" | "square" | "triangle";
export type FrequencyUnit = "vibrations" | "hertz";
export type AmplitudeUnit = "divisions" | "volts";
export type Language = "en" | "nl";

/** A setting of the candidate (or of the reference), in the units of the settings. */
export type Signal = { frequency: number; amplitude: number };
/** What a knob can be set to: from min to max in steps, shown with `decimals` decimals. */
export type Range = { min: number; max: number; step: number; decimals: number };

export type Settings = {
  waveform: Waveform;
  columns: number;
  rows: number;
  frequencyUnit: FrequencyUnit;
  amplitudeUnit: AmplitudeUnit;
  /** ms per division */
  timePerDiv: number;
  /** V per division */
  voltsPerDiv: number;
  showScale: boolean;
  showReference: boolean;
  reference: Signal;
  start: Signal;
  /** The correct setting, or null when the item has none in its settings. */
  correct: Signal | null;
  frequency: Range;
  amplitude: Range;
  showValues: boolean;
  animate: boolean;
  language: Language;
};

/** "4.2", "4,2", " 3 " → a number; "", "abc", undefined → null. */
export const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let text = value.trim().replace(/\s+/g, "");
  if (!text) return null;
  if (text.includes(",") && !text.includes(".")) text = text.replace(",", ".");
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

const bool = (value: unknown, fallback: boolean) => {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "true") return true;
  if (text === "false") return false;
  return fallback;
};
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => {
  const text = String(value ?? "").trim().toLowerCase();
  return (options as readonly string[]).includes(text) ? (text as T) : fallback;
};
const positive = (value: unknown, fallback: number) => {
  const n = parseNumber(value);
  return n !== null && n > 0 ? n : fallback;
};
const integer = (value: unknown, fallback: number, min: number, max: number) => {
  const n = parseNumber(value);
  return n === null ? fallback : Math.min(max, Math.max(min, Math.round(n)));
};

/** The decimals of a number as written: 0.1 → 1, 0.25 → 2, 5 → 0 (at most 6). */
export const decimalsOf = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  const text = String(Math.abs(n));
  const exp = /e-(\d+)$/.exec(text);
  const decimals = exp ? Number(exp[1]) + (text.split("e")[0].split(".")[1]?.length ?? 0) : text.split(".")[1]?.length ?? 0;
  return Math.min(6, decimals);
};

/** Rounded to `decimals` decimals, without float noise (0.1 + 0.2 → 0.3). */
export const roundTo = (n: number, decimals: number): number => {
  const f = Math.pow(10, decimals);
  return Math.round(n * f + (n >= 0 ? 1e-9 : -1e-9)) / f;
};

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** The nearest value a knob can have: on a step from min, within the range. */
export const snap = (n: number, range: Range): number => {
  const steps = Math.round((n - range.min) / range.step);
  return clamp(roundTo(range.min + steps * range.step, range.decimals), range.min, range.max);
};

/** A knob's range; one that cannot be used (max not above min) becomes the fallback. Without a step: 100 steps. */
export const makeRange = (min: unknown, max: unknown, step: unknown, fallback: Omit<Range, "decimals">): Range => {
  let lo = parseNumber(min);
  let hi = parseNumber(max);
  if (lo === null || hi === null || !(hi > lo)) {
    lo = fallback.min;
    hi = fallback.max;
  }
  let s = parseNumber(step);
  if (s === null || !(s > 0) || s > hi - lo) s = roundTo((hi - lo) / 100, 6);
  return { min: lo, max: hi, step: s, decimals: Math.max(decimalsOf(s), decimalsOf(lo)) };
};

/** The data- attributes (as text, with their defaults filled in) → the settings. */
export const parseSettings = (p: Record<string, unknown>): Settings => {
  const frequency = makeRange(p.frequencyMin, p.frequencyMax, p.frequencyStep, { min: 0.5, max: 8, step: 0.1 });
  const amplitude = makeRange(p.amplitudeMin, p.amplitudeMax, p.amplitudeStep, { min: 0.2, max: 4, step: 0.1 });
  const signal = (f: unknown, a: unknown, fallback: Signal): Signal => ({
    frequency: parseNumber(f) ?? fallback.frequency,
    amplitude: parseNumber(a) ?? fallback.amplitude,
  });
  const middle = { frequency: snap((frequency.min + frequency.max) / 2, frequency), amplitude: snap((amplitude.min + amplitude.max) / 2, amplitude) };
  const start = signal(p.startFrequency, p.startAmplitude, middle);
  const cf = parseNumber(p.correctFrequency);
  const ca = parseNumber(p.correctAmplitude);
  return {
    waveform: oneOf(p.waveform, ["sine", "square", "triangle"] as const, "sine"),
    columns: integer(p.gridColumns, 10, 2, 20),
    rows: integer(p.gridRows, 8, 2, 16),
    frequencyUnit: oneOf(p.frequencyUnit, ["vibrations", "hertz"] as const, "vibrations"),
    amplitudeUnit: oneOf(p.amplitudeUnit, ["divisions", "volts"] as const, "divisions"),
    timePerDiv: positive(p.timePerDiv, 1),
    voltsPerDiv: positive(p.voltsPerDiv, 1),
    showScale: bool(p.showScale, false),
    showReference: bool(p.showReference, true),
    reference: signal(p.referenceFrequency, p.referenceAmplitude, middle),
    // the candidate starts on a value of the knobs
    start: { frequency: snap(start.frequency, frequency), amplitude: snap(start.amplitude, amplitude) },
    correct: cf !== null && ca !== null ? { frequency: cf, amplitude: ca } : null,
    frequency,
    amplitude,
    showValues: bool(p.showValues, true),
    animate: bool(p.animate, true),
    language: String(p.language ?? "").trim().slice(0, 2).toLowerCase() === "nl" ? "nl" : "en",
  };
};

/** Vibrations on the screen: the frequency as set, or in hertz over the time on the screen. */
export const cyclesOnScreen = (s: Settings, frequency: number): number =>
  s.frequencyUnit === "hertz" ? (frequency * s.columns * s.timePerDiv) / 1000 : frequency;

/** The amplitude in divisions: as set, or in volts over volts/div. */
export const amplitudeInDivisions = (s: Settings, amplitude: number): number =>
  s.amplitudeUnit === "volts" ? amplitude / s.voltsPerDiv : amplitude;

/** A number for the candidate: 4.2 (en) or 4,2 (nl), with the decimals of the knob. */
export const formatNumber = (n: number, decimals: number, language: Language): string => {
  const text = roundTo(n, decimals).toFixed(decimals);
  return language === "nl" ? text.replace(".", ",") : text;
};

/**
 * A response or correct response → [frequency, amplitude]: two numbers, or two texts ("4.2", "3"), or one text with
 * both ("4.2 3", "4.2; 3"). Anything else → null.
 */
export const parsePair = (value: unknown): [number, number] | null => {
  let parts: unknown[] | null = null;
  if (Array.isArray(value)) parts = value;
  else if (typeof value === "string") parts = value.trim().split(/\s*;\s*|\s+/);
  if (!parts || parts.length !== 2) return null;
  const f = parseNumber(parts[0]);
  const a = parseNumber(parts[1]);
  return f === null || a === null ? null : [f, a];
};
