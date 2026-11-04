// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/MaraisSalantpci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The item's settings (data- attributes, all text) → what the experiment works with, every value checked and with a
// sensible fallback. Also the numbers as the candidate reads them. Only type imports: `npm test` runs it in node.

import type { Container, Variable } from "./model";

const VARIABLES: Variable[] = ["temperature", "area", "wind", "salt", "volume"];

export type Language = "en" | "nl" | "fr";
export type Range = { min: number; max: number; step: number };
/** The numeric variables, by the key of a container. */
export type NumericKey = "temperature" | "width" | "salt" | "volume";
export const NUMERIC_KEYS: NumericKey[] = ["temperature", "width", "salt", "volume"];
/** The key of a container a variable is set with. */
export const keyOf = (v: Variable): keyof Container => (v === "area" ? "width" : v);

export type Settings = {
  /** The research question the candidate answers with the experiment (shown above it). */
  question: string;
  /** The variable the research question is about; null: none (the score is then for any fair test). */
  target: Variable | null;
  /** 2 or 3 containers. */
  count: number;
  /** What the candidate may change, per variable; the others stay at the fixed value. */
  canChange: Record<Variable, boolean>;
  /** The value of each variable when the candidate does not change it (and at the start). */
  fixed: Container;
  ranges: Record<NumericKey, Range>;
  /** The containers at the start: the fixed values with the author's overrides per container. */
  start: Container[];
  /** Hours the experiment lasts on the clock. */
  duration: number;
  /** Real seconds the whole experiment takes at speed ×1. */
  runSeconds: number;
  language: Language;
};

export const num = (text: unknown): number | null => {
  if (typeof text === "number") return isFinite(text) ? text : null;
  if (typeof text !== "string") return null;
  const clean = text.trim().replace(/−/g, "-").replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(clean)) return null;
  const value = Number(clean);
  return isFinite(value) ? value : null;
};

export const bool = (value: unknown, fallback: boolean) => {
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(text)) return true;
  if (["false", "0", "no", "off"].includes(text)) return false;
  return fallback;
};

/** "nl", "nl-NL", "FR" → nl, fr; anything else en. */
export const languageOf = (language: unknown): Language => {
  const two = String(language ?? "").slice(0, 2).toLowerCase();
  return two === "nl" || two === "fr" ? two : "en";
};

/** A range from three settings: max > min, 0 < step ≤ max − min; min not under `floor`. */
export const parseRange = (min: unknown, max: unknown, step: unknown, fallback: Range, floor: number): Range => {
  let lo = num(min) ?? fallback.min;
  if (lo < floor) lo = floor;
  let hi = num(max) ?? fallback.max;
  if (!(hi > lo)) hi = fallback.max > lo ? fallback.max : lo + fallback.max - fallback.min;
  let st = num(step) ?? fallback.step;
  if (!(st > 0) || st > hi - lo) st = (hi - lo) / 10;
  return { min: lo, max: hi, step: st };
};

/** The nearest value a slider over this range can have. */
export const snap = (value: number, r: Range) => {
  const steps = Math.round((Math.min(r.max, Math.max(r.min, value)) - r.min) / r.step);
  const snapped = Math.min(r.max, r.min + steps * r.step);
  return Math.round(snapped * 1e6) / 1e6;
};

const DEFAULT_RANGES: Record<NumericKey, Range> = {
  temperature: { min: 10, max: 80, step: 5 },
  width: { min: 5, max: 30, step: 5 },
  salt: { min: 0, max: 250, step: 5 },
  volume: { min: 50, max: 500, step: 50 },
};
const FLOORS: Record<NumericKey, number> = { temperature: -20, width: 1, salt: 0, volume: 1 };
const DEFAULT_FIXED: Container = { temperature: 20, width: 10, wind: false, salt: 35, volume: 200 };

/** Synonyms the author may use in the start values ("area=20" sets the width). */
const KEY_NAMES: Record<string, keyof Container> = {
  temperature: "temperature", temp: "temperature", t: "temperature",
  width: "width", area: "width", surface: "width",
  wind: "wind",
  salt: "salt",
  volume: "volume", v: "volume",
};

/** "temperature=60; width=10 | temperature=20" → an override per container (a value checked later). */
export const parseStart = (text: unknown): Partial<Record<keyof Container, string>>[] =>
  String(text ?? "")
    .split("|")
    .map((part) => {
      const overrides: Partial<Record<keyof Container, string>> = {};
      for (const pair of part.split(/[;\n]/)) {
        const match = /^\s*([a-z]+)\s*[=:]\s*(.+?)\s*$/i.exec(pair);
        const key = match && KEY_NAMES[match[1].toLowerCase()];
        if (key) overrides[key] = match[2];
      }
      return overrides;
    });

/** A container with every value checked: on a step of its range, and the fixed value where the candidate cannot change it. */
export const checkContainer = (
  value: Partial<Record<keyof Container, unknown>> | null | undefined,
  s: Pick<Settings, "canChange" | "fixed" | "ranges">,
  base: Container = s.fixed,
  keepFixed = false
): Container => {
  const v = value ?? {};
  const out = { ...base };
  for (const key of NUMERIC_KEYS) {
    const variable: Variable = key === "width" ? "area" : key;
    const n = num(v[key] as string);
    if (!keepFixed && !s.canChange[variable]) out[key] = s.fixed[key];
    else if (n !== null) out[key] = snap(n, s.ranges[key]);
  }
  if (!keepFixed && !s.canChange.wind) out.wind = s.fixed.wind;
  else if (v.wind !== undefined) out.wind = bool(v.wind, base.wind);
  return out;
};

export const parseSettings = (p: Record<string, unknown>): Settings => {
  const ranges = {} as Record<NumericKey, Range>;
  for (const key of NUMERIC_KEYS) {
    ranges[key] = parseRange(p[`${key}Min`], p[`${key}Max`], p[`${key}Step`], DEFAULT_RANGES[key], FLOORS[key]);
  }
  const fixed: Container = {
    temperature: snap(num(p.temperature) ?? DEFAULT_FIXED.temperature, ranges.temperature),
    width: snap(num(p.width) ?? DEFAULT_FIXED.width, ranges.width),
    wind: bool(p.wind, DEFAULT_FIXED.wind),
    salt: snap(num(p.salt) ?? DEFAULT_FIXED.salt, ranges.salt),
    volume: snap(num(p.volume) ?? DEFAULT_FIXED.volume, ranges.volume),
  };
  const canChange = {
    temperature: bool(p.changeTemperature, true),
    area: bool(p.changeArea, true),
    wind: bool(p.changeWind, true),
    salt: bool(p.changeSalt, false),
    volume: bool(p.changeVolume, true),
  };
  const count = Math.min(3, Math.max(2, Math.round(num(p.count) ?? 2)));
  const overrides = parseStart(p.start);
  // the author's start values count even for a variable the candidate cannot change: that is how a fixed comparison
  // (the original's demonstration) is made
  const start = Array.from({ length: count }, (_, i) =>
    checkContainer(overrides[i] ?? {}, { canChange, fixed, ranges }, fixed, true)
  );
  const targetText = String(p.target ?? "").trim().toLowerCase();
  const target = (VARIABLES as string[]).includes(targetText) ? (targetText as Variable) : targetText === "width" ? "area" : null;
  const duration = num(p.duration);
  const runSeconds = num(p.runSeconds);
  return {
    question: String(p.question ?? "").trim(),
    target,
    count,
    canChange,
    fixed,
    ranges,
    start,
    duration: duration !== null && duration > 0 ? duration : 48,
    runSeconds: runSeconds !== null && runSeconds > 0 ? Math.min(600, runSeconds) : 20,
    language: languageOf(p.language),
  };
};

/** 58.04 with 1 decimal → "58.0" (en) or "58,0" (nl, fr); −3 → "−3". */
export const formatNumber = (value: number, decimals: number, language: Language): string => {
  if (!isFinite(value)) return "–";
  let text = value.toFixed(Math.max(0, Math.min(20, decimals)));
  if (/^-0(\.0*)?$/.test(text)) text = text.slice(1);
  text = text.replace("-", "−");
  return language === "en" ? text : text.replace(".", ",");
};

/** Decimals a value needs: 0.5 → 1, 10 → 0. */
export const decimalsOf = (value: number) => {
  const text = String(Math.round(value * 1e6) / 1e6);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
};
