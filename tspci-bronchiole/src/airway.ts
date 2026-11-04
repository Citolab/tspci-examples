// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/Broncopci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The model of a bronchiole in polluted air, and the question. Only a type import: `npm test` runs it in node.
//
// Pollution irritates the airway: its wall swells (inflammation) and it makes more mucus, so the air passage (the
// lumen) gets narrower. The narrowing of the radius goes linearly from `atMin` (lowest pollution) to `atMax` (highest),
// per airway; an asthmatic airway reacts much more strongly. The original: r = 40 − level on a scale of 1 to 20 for
// the asthmatic airway (2.5 % to 50 % narrower) and a healthy airway that did not change.
//
// What follows from the radius r (relative to normal, 1 = no narrowing):
// - the area of the air passage: π r², so r² of normal;
// - the airflow at the same pressure difference: Poiseuille's law for laminar flow in a tube,
//   Q = π ΔP r⁴ / (8 η L), so r⁴ of normal: half the radius lets through only 1/16 of the air.

import type { AirwayResponse, Person, Quantity, Settings } from "./settings";

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/** Where a level is on the scale: 0 at the lowest pollution, 1 at the highest. */
export const fractionOf = (level: number, min: number, max: number) => (max > min ? clamp((level - min) / (max - min), 0, 1) : 0);

/** The narrowing of the radius (0–0.95) at a fraction of the scale. */
export const narrowingAt = (response: AirwayResponse, fraction: number) =>
  clamp(response.atMin + (response.atMax - response.atMin) * clamp(fraction, 0, 1), 0, 95) / 100;

export type Airway = {
  /** Radius of the air passage, relative to normal. */
  radius: number;
  /** Area of the air passage, % of normal: 100 r². */
  area: number;
  /** Airflow at the same pressure difference, % of normal: 100 r⁴ (Poiseuille). */
  flow: number;
  /** Narrowing of the radius, 0–0.95. */
  narrowing: number;
};

export const airwayOf = (narrowing: number): Airway => {
  const radius = 1 - narrowing;
  return { radius, area: 100 * radius ** 2, flow: 100 * radius ** 4, narrowing };
};

/** One person's airway at a pollution level. */
export const airwayAt = (s: Pick<Settings, "min" | "max" | "response">, person: Person, level: number): Airway =>
  airwayOf(narrowingAt(s.response[person], fractionOf(level, s.min, s.max)));

export const roundTo = (value: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

/**
 * The lowest whole level on the scale at which the quantity of the person's airway is below the percentage of normal;
 * null when that does not happen on the scale.
 */
export const thresholdLevel = (s: Pick<Settings, "min" | "max" | "response">, person: Person, quantity: Quantity, percent: number): number | null => {
  for (let level = s.min; level <= s.max; level++) {
    if (airwayAt(s, person, level)[quantity] < percent) return level;
  }
  return null;
};

/** How many times the airflow of the healthy airway is that of the asthmatic airway, at a level. */
export const flowRatio = (s: Pick<Settings, "min" | "max" | "response">, level: number) =>
  airwayAt(s, "healthy", level).flow / airwayAt(s, "asthmatic", level).flow;

/** The correct answer to the question of the settings: a level, a ratio (two decimals), or null (none, or no level). */
export const correctAnswer = (s: Settings): number | null => {
  if (s.question === "threshold") return thresholdLevel(s, s.questionPerson, s.questionQuantity, s.questionPercent);
  if (s.question === "ratio") return roundTo(flowRatio(s, s.questionLevel), 2);
  return null;
};

/** Whether an answer is correct: within the tolerance of the correct answer (a little slack for rounding). */
export const isCorrect = (s: Settings, answer: number | null): boolean => {
  const correct = correctAnswer(s);
  if (answer === null || correct === null) return false;
  return Math.abs(answer - correct) <= s.tolerance + 1e-9;
};

/** "1,5,12,20": the levels the candidate stopped at, in order, the same level twice in a row once. */
export const levelsText = (levels: number[]) =>
  levels.filter((level, i) => i === 0 || level !== levels[i - 1]).join(",");

/** "1,5,12" (or "1;5", "1 5") → [1, 5, 12]; anything that is not a number is left out. */
export const parseLevels = (text: unknown): number[] =>
  String(text ?? "")
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => isFinite(n));

/**
 * The cross-section in the units of the picture (the bronchiole is 100 across from its centre): the radii of the air
 * passage, the outer edge of the mucus, the inner edge of the smooth muscle, and how inflamed the wall is (0–1).
 */
export const LUMEN = 48;
export const MUCUS = 3;
export const MUSCLE_INNER = 80;
export const MUSCLE_OUTER = 88;
export const OUTER = 96;

export const crossSection = (narrowing: number, mucusShare: number) => {
  const closed = LUMEN * narrowing; // how much narrower the air passage is
  const mucus = closed * mucusShare;
  const wall = closed - mucus; // the swollen wall takes the rest
  const lumen = LUMEN - closed;
  return {
    lumen,
    mucus: lumen + MUCUS + mucus,
    // the wall swells inwards and pushes the muscle out a little less than it grows: the muscle layer thickens
    muscleInner: MUSCLE_INNER - wall * 0.3,
    inflammation: clamp(wall / (LUMEN * 0.45), 0, 1),
  };
};

/** A closed path around the centre with a folded edge: radius r, `folds` folds, amplitude as a part of r. */
export const foldedCircle = (r: number, folds: number, amplitude: number, phase = 0, points = 96) => {
  const parts: string[] = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const radius = r * (1 + amplitude * Math.sin(folds * angle + phase));
    parts.push(`${i ? "L" : "M"}${(radius * Math.cos(angle)).toFixed(2)} ${(radius * Math.sin(angle)).toFixed(2)}`);
  }
  return parts.join(" ") + " Z";
};
