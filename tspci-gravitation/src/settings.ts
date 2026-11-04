// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/NouvelleTerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The item's settings (data- attributes, all text) → what the simulation works with, every value checked and with a
// sensible fallback; and the scoring of the question. No imports from the bundle: `npm test` runs it in node.

import type { Language } from "./physics";

/** The star of the original: with this mass, 1·10²³ kg at 100 million km gives 6.67·10²⁶ N, as in its table. */
export const ORIGINAL_STAR_MASS = 1e36;

/** "nl", "nl-NL", "FR" → nl, fr; anything else en. */
export const languageOf = (language: unknown): Language => {
  const code = String(language ?? "").slice(0, 2).toLowerCase();
  return code === "nl" || code === "fr" ? code : "en";
};

/** How many decimals a step needs: 0.5 → 1, 50 → 0, 0.25 → 2. */
export const decimalsOf = (value: number): number => {
  if (!isFinite(value)) return 0;
  const text = String(value);
  const e = /e-(\d+)$/.exec(text);
  if (e) return Number(e[1]);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
};

/** The value on a slider: the nearest step from the minimum, within the slider. */
export const snap = (value: number, range: { min: number; max: number; step: number }): number => {
  if (!isFinite(value)) return range.min;
  const steps = Math.round((value - range.min) / range.step);
  const snapped = Math.min(range.max, Math.max(range.min, range.min + steps * range.step));
  // no 0.30000000000000004
  return Number(snapped.toFixed(Math.max(decimalsOf(range.step), decimalsOf(range.min))));
};

export const VARIABLES = ["distance", "mass", "radius"] as const;
export type Variable = (typeof VARIABLES)[number];
export type Range = { min: number; max: number; step: number };
export type Question = "none" | "influence";

export type Settings = {
  /** The mass of the star, kg. */
  starMass: number;
  /** The sliders: distance in millions of km, mass in 10²³ kg, radius in km. */
  ranges: Record<Variable, Range>;
  /** The values at the start (and all the time for a variable that is not shown). */
  start: Record<Variable, number>;
  /** The variables the candidate sees and can change, in the order of VARIABLES. */
  shown: Variable[];
  /** Significant digits of the force. */
  digits: number;
  /** A button to record a measurement, and a table of the recorded ones. */
  record: boolean;
  /** At most this many rows in the table. */
  maxRecords: number;
  /** "influence": the candidate ticks the variables that influence the force. */
  question: Question;
  /** The question's text; empty: the standard one in the candidate's language. */
  questionText: string;
  /** The variables that influence the force, by the author (the key); only the shown ones count. */
  key: Variable[];
  language: Language;
};

export const num = (text: unknown): number | null => {
  if (typeof text === "number") return isFinite(text) ? text : null;
  if (typeof text !== "string") return null;
  const clean = text.trim().replace(/−/g, "-").replace(/\s/g, "").replace(",", ".").replace(/[x×·]10\^?/i, "e");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(clean)) return null;
  const value = Number(clean);
  return isFinite(value) ? value : null;
};

const isTrue = (value: unknown, fallback: boolean) => {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "true" || text === "1" || text === "yes") return true;
  if (text === "false" || text === "0" || text === "no") return false;
  return fallback;
};

/** A range from three settings: min > 0 (no distance or mass of 0), max > min, 0 < step ≤ max − min. */
export const parseRange = (min: unknown, max: unknown, step: unknown, fallback: Range): Range => {
  let lo = num(min) ?? fallback.min;
  let hi = num(max) ?? fallback.max;
  if (!(lo > 0)) lo = fallback.min;
  if (!(hi > lo)) hi = fallback.max > lo ? fallback.max : lo * 10;
  let st = num(step) ?? fallback.step;
  if (!(st > 0) || st > hi - lo) st = (hi - lo) / 100;
  return { min: lo, max: hi, step: st };
};

/** "distance;mass", "Mass, distance", "afstand massa", "distance masse": the variables, in the order of VARIABLES. */
export const parseVariables = (text: unknown): Variable[] => {
  const words = String(text ?? "").toLowerCase().split(/[;,\s]+/).filter(Boolean);
  const aliases: Record<string, Variable> = {
    distance: "distance", afstand: "distance", d: "distance",
    mass: "mass", massa: "mass", masse: "mass", m: "mass",
    radius: "radius", straal: "radius", rayon: "radius", r: "radius",
  };
  const found = new Set(words.map((w) => aliases[w]).filter(Boolean));
  return VARIABLES.filter((v) => found.has(v));
};

export const DEFAULT_RANGES: Record<Variable, Range> = {
  distance: { min: 50, max: 550, step: 50 },
  mass: { min: 1, max: 30, step: 1 },
  radius: { min: 2500, max: 22500, step: 500 },
};
const DEFAULT_START: Record<Variable, number> = { distance: 100, mass: 10, radius: 10000 };

export const parseSettings = (p: Record<string, unknown>): Settings => {
  const ranges = {} as Record<Variable, Range>;
  const start = {} as Record<Variable, number>;
  for (const v of VARIABLES) {
    ranges[v] = parseRange(p[`${v}Min`], p[`${v}Max`], p[`${v}Step`], DEFAULT_RANGES[v]);
    start[v] = snap(num(p[v]) ?? DEFAULT_START[v], ranges[v]);
  }
  const show: Record<Variable, boolean> = {
    distance: isTrue(p.showDistance, true),
    mass: isTrue(p.showMass, true),
    radius: isTrue(p.showRadius, true),
  };
  const starMass = num(p.starMass);
  const digits = Math.round(num(p.digits) ?? 3);
  const maxRecords = Math.round(num(p.maxRecords) ?? 20);
  const question = String(p.question ?? "").trim().toLowerCase() === "influence" ? "influence" : "none";
  return {
    starMass: starMass !== null && starMass > 0 ? starMass : ORIGINAL_STAR_MASS,
    ranges,
    start,
    shown: VARIABLES.filter((v) => show[v]),
    digits: Math.min(5, Math.max(1, digits)),
    record: isTrue(p.record, true),
    maxRecords: Math.min(100, Math.max(1, maxRecords)),
    question,
    questionText: String(p.questionText ?? "").trim(),
    key: parseVariables(p.key ?? "distance;mass"),
    language: languageOf(p.language),
  };
};

/** The question's choices: the variables the candidate sees. */
export const choicesOf = (s: Settings): Variable[] => s.shown;

/** The key as it counts: the author's variables that the candidate can see. */
export const keyOf = (s: Settings): Variable[] => s.key.filter((v) => s.shown.includes(v));

/** 1 when the candidate ticked exactly the variables of the key (of the ones shown), else 0. */
export const scoreOf = (s: Settings, answer: Variable[]): number => {
  const key = keyOf(s);
  const given = answer.filter((v) => s.shown.includes(v));
  return key.length === given.length && key.every((v) => given.includes(v)) ? 1 : 0;
};
