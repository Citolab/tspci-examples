// The item's settings (data- attributes, all text) → what the simulation works with, every value checked and with a
// sensible fallback. No imports: `npm test` runs it in node.

export type Mode = "tool" | "answer";
export type Quantity = "distance" | "power";
export type Control = "both" | Quantity;
export type PowerInput = "select" | "slider";
export type View = "3d" | "2d";
export const SOURCES = ["speaker", "walrus", "whale", "bird", "dog", "siren"] as const;
export type Source = (typeof SOURCES)[number];
export type Range = { min: number; max: number; step: number };
export type Reference = { label: string; level: number };

/** The units the slider values are in, and their factor to W and m. */
export const POWER_UNITS: Record<string, number> = { mW: 1e-3, W: 1, kW: 1e3 };
export const DISTANCE_UNITS: Record<string, number> = { cm: 1e-2, m: 1, km: 1e3 };

export type Settings = {
  mode: Mode;
  /** Tool mode: what the candidate may change. */
  control: Control;
  /** Answer mode: the quantity whose value is the response; the other stays at its setting. */
  answer: Quantity;
  canChangePower: boolean;
  canChangeDistance: boolean;
  /** A level (dB) the candidate is looking for: marked on the meter, and the source of the correct response. */
  targetLevel: number | null;
  powerInput: PowerInput;
  /** The choices of the select. */
  powers: number[];
  /** The power slider. */
  powerRange: Range;
  /** The power at the start (and all the time when the candidate cannot change it), in powerUnit. */
  power: number;
  powerUnit: string;
  /** From powerUnit to W. */
  powerFactor: number;
  distanceRange: Range;
  distance: number;
  distanceUnit: string;
  /** From distanceUnit to m. */
  distanceFactor: number;
  /** Decimals of the level in dB. */
  decimals: number;
  /** The threshold of hearing I0, W/m². */
  referenceIntensity: number;
  /** The reference levels; null: the standard list in the candidate's language. */
  references: Reference[] | null;
  showReferences: boolean;
  source: Source;
  sourceName: string;
  view: View;
  language: "en" | "nl";
};

const num = (text: unknown): number | null => {
  if (typeof text === "number") return isFinite(text) ? text : null;
  if (typeof text !== "string") return null;
  const clean = text.trim().replace(/−/g, "-").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(clean)) return null;
  const value = Number(clean);
  return isFinite(value) ? value : null;
};

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => {
  const text = String(value ?? "").trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === text) ?? fallback;
};

const unitOf = (value: unknown, units: Record<string, number>, fallback: string) => {
  const text = String(value ?? "").trim();
  return Object.keys(units).find((u) => u === text) ?? Object.keys(units).find((u) => u.toLowerCase() === text.toLowerCase()) ?? fallback;
};

/** "25;50;100", "25, 50, 100" (en), "0,5; 1; 2" (nl), new lines: the positive numbers, sorted, without doubles. */
export const parseList = (text: unknown): number[] => {
  const raw = String(text ?? "");
  // with a ; or a new line in it, a comma is a decimal comma; otherwise commas separate
  const parts = /[;\n]/.test(raw) ? raw.split(/[;\n]/) : raw.split(/[,\s]+/);
  const values = parts.map((p) => num(p)).filter((v): v is number => v !== null && v > 0);
  return [...new Set(values)].sort((a, b) => a - b);
};

/** A range from three settings: min > 0 (a distance or power of 0 has no level), max > min, step > 0. */
export const parseRange = (min: unknown, max: unknown, step: unknown, fallback: Range): Range => {
  let lo = num(min) ?? fallback.min;
  let hi = num(max) ?? fallback.max;
  if (!(lo > 0)) lo = fallback.min;
  if (!(hi > lo)) hi = fallback.max > lo ? fallback.max : lo * 10;
  let st = num(step) ?? fallback.step;
  if (st <= 0 || st > hi - lo) st = (hi - lo) / 100;
  return { min: lo, max: hi, step: st };
};

/** "Whisper = 30; Conversation = 60" (or one per line; also "Whisper: 30") → the levels, sorted from soft to loud. */
export const parseReferences = (text: unknown): Reference[] => {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/[;\n]/)
    .map((part) => {
      const match = /^(.*?)[=:]\s*([-+−]?[\d.,]+)\s*(dB)?\s*$/i.exec(part.trim());
      const level = match ? num(match[2]) : null;
      return match && match[1].trim() && level !== null ? { label: match[1].trim(), level } : null;
    })
    .filter((r): r is Reference => r !== null)
    .sort((a, b) => a.level - b.level);
};

const closest = (value: number, list: number[]) => list.reduce((best, v) => (Math.abs(v - value) < Math.abs(best - value) ? v : best), list[0]);

export const parseSettings = (p: Record<string, unknown>): Settings => {
  const mode = oneOf(p.mode, ["tool", "answer"] as const, "tool");
  const control = oneOf(p.control, ["both", "distance", "power"] as const, "both");
  const answer = oneOf(p.answer, ["distance", "power"] as const, "distance");
  const powerInput = oneOf(p.powerInput, ["select", "slider"] as const, "select");

  const powers = parseList(p.powers);
  if (!powers.length) powers.push(25, 50, 100);
  const powerRange = parseRange(p.powerMin, p.powerMax, p.powerStep, { min: 1, max: 100, step: 1 });
  const distanceRange = parseRange(p.distanceMin, p.distanceMax, p.distanceStep, { min: 10, max: 1000, step: 10 });

  const wantedPower = num(p.power);
  const power =
    powerInput === "select"
      ? closest(wantedPower ?? powers[0], powers)
      : Math.min(powerRange.max, Math.max(powerRange.min, wantedPower ?? powerRange.min));
  const wantedDistance = num(p.distance);
  const distance = Math.min(distanceRange.max, Math.max(distanceRange.min, wantedDistance ?? distanceRange.min));

  const decimals = Math.round(num(p.decimals) ?? 1);
  const i0 = num(p.referenceIntensity);
  const references = String(p.references ?? "").trim() ? parseReferences(p.references) : null;
  const target = num(p.targetLevel);

  const powerUnit = unitOf(p.powerUnit, POWER_UNITS, "W");
  const distanceUnit = unitOf(p.distanceUnit, DISTANCE_UNITS, "m");
  return {
    mode,
    control,
    answer,
    canChangePower: mode === "answer" ? answer === "power" : control !== "distance",
    canChangeDistance: mode === "answer" ? answer === "distance" : control !== "power",
    targetLevel: target,
    powerInput,
    powers,
    powerRange,
    power,
    powerUnit,
    powerFactor: POWER_UNITS[powerUnit],
    distanceRange,
    distance,
    distanceUnit,
    distanceFactor: DISTANCE_UNITS[distanceUnit],
    decimals: Math.min(4, Math.max(0, decimals)),
    referenceIntensity: i0 !== null && i0 > 0 ? i0 : 1e-12,
    references,
    showReferences: String(p.showReferences ?? "true").trim().toLowerCase() !== "false",
    source: oneOf(p.source, SOURCES, "speaker"),
    sourceName: String(p.sourceName ?? "").trim(),
    view: oneOf(p.view, ["3d", "2d"] as const, "3d"),
    language: String(p.language ?? "").slice(0, 2).toLowerCase() === "nl" ? "nl" : "en",
  };
};
