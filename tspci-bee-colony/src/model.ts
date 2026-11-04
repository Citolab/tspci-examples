// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Abeillepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The model of the hive, without a picture: what a combination of levels does to the population, the bees drawn and
// the flowers left, and the key of the question. Only type imports: `npm test` runs it in node.
import type { Factor, FactorId, Settings } from "./settings";

export type Levels = Partial<Record<FactorId, number>>;

/** At most this many bees are drawn. */
export const MAX_BEES = 40;
/** The flowers of the meadow are in this many groups; a group goes as the colony shrinks. */
export const FLOWER_GROUPS = 4;

/** A level on the slider of a factor: a whole number from 0 to its highest level. */
export const clampLevel = (factor: Factor, level: unknown) =>
  typeof level === "number" && isFinite(level) ? Math.min(factor.levels, Math.max(0, Math.round(level))) : 0;

/** The levels of the factors that are on, each on its slider; a factor that is off is not in it. */
export const levelsFor = (s: Settings, levels: Levels = {}): Record<string, number> =>
  Object.fromEntries(s.factors.map((f) => [f.id, clampLevel(f, levels[f.id])]));

/** Bees lost by a factor at a level: the losses of the steps up to it. */
export const lossOf = (factor: Factor, level: number) =>
  factor.losses.slice(0, clampLevel(factor, level)).reduce((sum, loss) => sum + loss, 0);

/**
 * The population at a combination of levels: the start minus the losses of every factor, never below 0. The original
 * (start 80000, 20000 per level of pesticide and of hornet): 80000 − 20000·(pesticide + hornet).
 */
export const populationOf = (s: Settings, levels: Levels): number =>
  Math.max(0, Math.round(s.startPopulation - s.factors.reduce((sum, f) => sum + lossOf(f, levels[f.id] ?? 0), 0)));

/** The bees drawn: one per beesPerIcon bees (the original: 8 at 80000), at most MAX_BEES. */
export const beesDrawn = (s: Settings, population: number) =>
  Math.min(MAX_BEES, Math.max(0, Math.round(population / s.beesPerIcon)));

/**
 * The groups of flowers left (0 to 4), from the share of the colony that is left: the original's rule, where the sum of
 * the two sliders hid them (0: all four, 1: three, 2 or 3: one, 4: none). A bigger colony than at the start: all four.
 */
export const flowerGroupsOf = (s: Settings, population: number): number => {
  const share = population / s.startPopulation;
  if (share >= 1 - 1e-9) return FLOWER_GROUPS;
  if (share >= 0.75 - 1e-9) return 3;
  if (share > 0) return 1;
  return 0;
};

/** The bees a factor costs at its highest level: how the question about the largest effect compares them. */
export const totalEffectOf = (factor: Factor) => lossOf(factor, factor.levels);

/** The factor with the largest effect over its whole slider, or "equal" when the largest is shared. */
export const largestEffect = (s: Settings): FactorId | "equal" => {
  const effects = s.factors.map((f) => ({ id: f.id, effect: totalEffectOf(f) }));
  const max = Math.max(...effects.map((e) => e.effect));
  const top = effects.filter((e) => Math.abs(e.effect - max) < 1e-9);
  return top.length === 1 ? top[0].id : "equal";
};

/** The choices of the question about the largest effect: the factors that are on, and "equal" with two or more. */
export const effectChoices = (s: Settings): (FactorId | "equal")[] =>
  s.factors.length > 1 ? [...s.factors.map((f) => f.id), "equal"] : s.factors.map((f) => f.id);

/** The key of the question: the author's, or from the model. Without a question: null. */
export const answerKeyOf = (s: Settings): string | null => {
  if (s.question === "none") return null;
  if (s.answerKey) {
    if (s.question === "predict") {
      const n = Number(s.answerKey.replace(/[\s  ]/g, "").replace(",", "."));
      if (isFinite(n)) return String(n);
    } else {
      const choice = effectChoices(s).find((c) => c === s.answerKey.toLowerCase());
      if (choice) return choice;
    }
  }
  return s.question === "predict" ? String(populationOf(s, s.predict)) : largestEffect(s);
};

/** An answer against the key: a choice is the same choice; a number is within the margin. No answer is wrong. */
export const isCorrect = (s: Settings, answer: string): boolean => {
  const key = answerKeyOf(s);
  if (key === null || !answer) return false;
  if (s.question === "predict") {
    const value = Number(answer);
    return isFinite(value) && Math.abs(value - Number(key)) <= s.tolerance + 1e-9;
  }
  return answer === key;
};
