// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Broncopci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The item's settings (data- attributes, all text) → what the simulation works with, every value checked and with a
// sensible fallback. No imports: `npm test` runs it in node.

export type Person = "healthy" | "asthmatic";
export const PERSONS: Person[] = ["healthy", "asthmatic"];
export type Persons = "both" | Person;
export type Quantity = "flow" | "area";
export type Question = "none" | "threshold" | "ratio";
export type Language = "en" | "nl" | "fr";

/** How an airway responds to pollution: the narrowing of the radius of its air passage, in % of normal. */
export type AirwayResponse = { atMin: number; atMax: number };

export type Settings = {
  /** The airways shown, in order. */
  persons: Person[];
  /** The pollution scale: whole levels from min to max. */
  min: number;
  max: number;
  /** The level at the start. */
  start: number;
  /** The labels at the ends of the scale; "" is the text of the language. */
  labelLess: string;
  labelMore: string;
  response: Record<Person, AirwayResponse>;
  /** Part of the narrowing that is extra mucus (0–1); the rest is the inflamed, thickened wall. */
  mucusShare: number;
  showArea: boolean;
  showFlow: boolean;
  /** Decimals of the percentages on the screen (0–2). */
  decimals: number;
  question: Question;
  /** threshold: whose airway, which quantity, below which percentage of normal. */
  questionPerson: Person;
  questionQuantity: Quantity;
  questionPercent: number;
  /** ratio: the pollution level of the comparison. */
  questionLevel: number;
  /** The answer counts as correct within ± this. */
  tolerance: number;
  /** "" is the question of the language. */
  questionText: string;
  points: number;
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

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => {
  const text = String(value ?? "").trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === text) ?? fallback;
};

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

const bool = (value: unknown, fallback: boolean) => {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" ? true : text === "false" ? false : fallback;
};

/** A narrowing in %: 0 to 95 (an airway that closes completely has no flow to compare). */
const narrowing = (value: unknown, fallback: number) => clamp(num(value) ?? fallback, 0, 95);

/** "nl", "nl-NL", "FR" → nl, fr; anything else en. */
export const languageOf = (language: unknown): Language => {
  const code = String(language ?? "").slice(0, 2).toLowerCase();
  return code === "nl" || code === "fr" ? code : "en";
};

export const parseSettings = (p: Record<string, unknown>): Settings => {
  const question = oneOf(p.question, ["none", "threshold", "ratio"] as const, "none");
  // a comparison needs both airways
  const shown = question === "ratio" ? "both" : oneOf(p.persons, ["both", "healthy", "asthmatic"] as const, "both");
  let min = Math.round(num(p.pollutionMin) ?? 1);
  let max = Math.round(num(p.pollutionMax) ?? 20);
  if (min < 0) min = 0;
  if (!(max > min)) max = min + 19;
  const start = clamp(Math.round(num(p.pollutionStart) ?? min), min, max);
  return {
    persons: shown === "both" ? [...PERSONS] : [shown],
    min,
    max,
    start,
    labelLess: String(p.labelLess ?? "").trim(),
    labelMore: String(p.labelMore ?? "").trim(),
    response: {
      healthy: { atMin: narrowing(p.healthyAtMin, 0), atMax: narrowing(p.healthyAtMax, 10) },
      asthmatic: { atMin: narrowing(p.asthmaticAtMin, 2.5), atMax: narrowing(p.asthmaticAtMax, 50) },
    },
    mucusShare: clamp(num(p.mucusShare) ?? 40, 0, 100) / 100,
    showArea: bool(p.showArea, true),
    showFlow: bool(p.showFlow, true),
    decimals: clamp(Math.round(num(p.decimals) ?? 0), 0, 2),
    question,
    questionPerson: oneOf(p.questionPerson, PERSONS, "asthmatic"),
    questionQuantity: oneOf(p.questionQuantity, ["flow", "area"] as const, "flow"),
    questionPercent: clamp(num(p.questionPercent) ?? 50, 0.1, 100),
    questionLevel: clamp(Math.round(num(p.questionLevel) ?? max), min, max),
    tolerance: Math.max(0, num(p.tolerance) ?? 0.5),
    questionText: String(p.questionText ?? "").trim(),
    points: Math.max(0, Math.round(num(p.points) ?? 1)),
    language: languageOf(p.language),
  };
};
