// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Abeillepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The item's settings (data- attributes, all text) → what the simulation works with, every value checked and with a
// sensible fallback. No imports: `npm test` runs it in node.

export const FACTOR_IDS = ["pesticide", "hornet", "varroa"] as const;
export type FactorId = (typeof FACTOR_IDS)[number];
export type Language = "en" | "nl" | "fr";
export type Question = "none" | "largestEffect" | "predict";

/** One factor the candidate sets with a slider, from 0 (absent) to `levels`. */
export type Factor = {
  id: FactorId;
  /** The highest level of the slider (the original: 2). */
  levels: number;
  /** Bees lost by each step up: losses[0] from level 0 to 1, losses[1] from 1 to 2, … (length = levels). */
  losses: number[];
};

export type Settings = {
  /** The factors on, in the order of FACTOR_IDS. */
  factors: Factor[];
  /** The population with every factor at 0. */
  startPopulation: number;
  /** Bees per bee drawn. */
  beesPerIcon: number;
  showTable: boolean;
  maxTrials: number;
  question: Question;
  /** The author's text of the question; empty: the standard text. */
  questionText: string;
  /** The combination of the prediction question, per factor that is on. */
  predict: Record<FactorId, number>;
  /** The author's key; empty: the key follows from the model. */
  answerKey: string;
  /** Prediction: the margin around the key, in bees. */
  tolerance: number;
  language: Language;
};

export const MAX_LEVELS = 6;
export const MAX_ROWS = 50;

/** "80000", "80 000", "80.000" (nl), "1,5" (a decimal comma), "−3" → a number; anything else null. */
export const num = (text: unknown): number | null => {
  if (typeof text === "number") return isFinite(text) ? text : null;
  if (typeof text !== "string") return null;
  let clean = text.trim().replace(/[\s  ']/g, "").replace(/−/g, "-");
  // 80.000 or 80,000 or 1.250.000: thousands separators; one , or . with fewer or more than 3 digits after it: decimals
  if (/^[-+]?\d{1,3}([.,]\d{3})+$/.test(clean) && !/^[-+]?0[.,]/.test(clean)) clean = clean.replace(/[.,]/g, "");
  clean = clean.replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(clean)) return null;
  const value = Number(clean);
  return isFinite(value) ? value : null;
};

const bool = (value: unknown, fallback: boolean) => {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "true" || text === "1" || text === "yes") return true;
  if (text === "false" || text === "0" || text === "no") return false;
  return fallback;
};

const int = (value: unknown, fallback: number, min: number, max: number) => {
  const n = num(value);
  return n === null ? fallback : Math.min(max, Math.max(min, Math.round(n)));
};

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => {
  const text = String(value ?? "").trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === text) ?? fallback;
};

/**
 * "20000" → the same loss at every level; "10000; 30000" → a loss per level (the last one repeats when the list is
 * shorter than the levels). Negative numbers are a gain. Empty or nonsense: the fallback.
 */
export const parseLosses = (text: unknown, levels: number, fallback: number): number[] => {
  const raw = String(text ?? "");
  const parts = /[;\n]/.test(raw) ? raw.split(/[;\n]/) : [raw];
  const values = parts.map((p) => num(p)).filter((v): v is number => v !== null);
  const list = values.length ? values : [fallback];
  return Array.from({ length: levels }, (_, i) => list[Math.min(i, list.length - 1)]);
};

/** "1;2;0" → { pesticide: 1, hornet: 2, varroa: 0 }; a missing level is 0. */
export const parseCombination = (text: unknown): Record<FactorId, number> => {
  const parts = String(text ?? "").split(/[;,\s]+/).filter(Boolean);
  const result = {} as Record<FactorId, number>;
  FACTOR_IDS.forEach((id, i) => (result[id] = Math.max(0, Math.round(num(parts[i]) ?? 0))));
  return result;
};

export const languageOf = (value: unknown): Language => {
  const text = String(value ?? "").slice(0, 2).toLowerCase();
  return text === "nl" || text === "fr" ? text : "en";
};

const DEFAULT_ON: Record<FactorId, boolean> = { pesticide: true, hornet: true, varroa: false };
const DEFAULT_EFFECT: Record<FactorId, number> = { pesticide: 20000, hornet: 20000, varroa: 10000 };

export const parseSettings = (p: Record<string, unknown>): Settings => {
  let factors: Factor[] = FACTOR_IDS.filter((id) => bool(p[id], DEFAULT_ON[id])).map((id) => {
    const levels = int(p[`${id}Levels`], 2, 1, MAX_LEVELS);
    return { id, levels, losses: parseLosses(p[`${id}Effect`], levels, DEFAULT_EFFECT[id]) };
  });
  if (!factors.length) factors = [{ id: "pesticide", levels: 2, losses: [20000, 20000] }]; // a simulation needs a slider
  const predict = parseCombination(p.predictLevels);
  for (const id of FACTOR_IDS) {
    const factor = factors.find((f) => f.id === id);
    predict[id] = factor ? Math.min(factor.levels, predict[id]) : 0;
  }
  const start = num(p.startPopulation);
  const perIcon = num(p.beesPerIcon);
  const tolerance = num(p.tolerance);
  return {
    factors,
    startPopulation: start !== null && start > 0 ? Math.round(start) : 80000,
    beesPerIcon: perIcon !== null && perIcon > 0 ? perIcon : 10000,
    showTable: bool(p.showTable, true),
    maxTrials: int(p.maxTrials, 12, 1, MAX_ROWS),
    question: oneOf(p.question, ["none", "largestEffect", "predict"] as const, "none"),
    questionText: String(p.questionText ?? "").trim(),
    predict,
    answerKey: String(p.answerKey ?? "").trim(),
    tolerance: tolerance !== null && tolerance > 0 ? tolerance : 0,
    language: languageOf(p.language),
  };
};
