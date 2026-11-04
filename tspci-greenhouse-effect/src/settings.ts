// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/EffetDeSerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The item's settings (data- attributes, all text) → what the simulation works with, every value checked and with a
// sensible fallback. No imports: `npm test` runs it in node.

import type { ModelInput } from "./model.ts";

export type Language = "en" | "nl" | "fr";
export type Numbers = "wm2" | "percent" | "both" | "none";
export type Unit = "C" | "K" | "both";
export type Question = "none" | "target" | "direction";
export type Prediction = "up" | "same" | "down";

export type Settings = ModelInput & {
  /** Greenhouse gas level at the start: the infrared absorptivity ε in percent. */
  startLevel: number;
  /** Step of the slider, in percent. */
  levelStep: number;
  /** Which numbers the arrows carry. */
  numbers: Numbers;
  /** Show the table of all flows under the picture. */
  showTable: boolean;
  /** Show the temperature as a number (the thermometer is always there). */
  showTemperature: boolean;
  /** Show ε (the share of the infrared the atmosphere absorbs) next to the slider. */
  showLevel: boolean;
  temperatureUnit: Unit;
  /** Decimals of the temperature. */
  decimals: number;
  question: Question;
  /** Target question: the surface temperature to set, °C. */
  targetTemperature: number;
  /** Target question: how far from the target still counts as correct, °C (K). */
  tolerance: number;
  /** Direction question: the change the candidate predicts the effect of. */
  direction: "more" | "less";
  /** Direction question: the slider stays locked until the candidate predicted; then the prediction is fixed. */
  predictFirst: boolean;
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

const isTrue = (value: unknown, fallback: boolean) => {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "true") return true;
  if (text === "false") return false;
  return fallback;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** "nl", "nl-NL", "FR" → nl / fr; anything else en. */
export const languageOf = (language: unknown): Language => {
  const l = String(language ?? "").slice(0, 2).toLowerCase();
  return l === "nl" || l === "fr" ? l : "en";
};

/** A share: 0.3 or 30 (%) → 0.3. */
const share = (value: unknown, fallback: number) => {
  const n = num(value);
  if (n === null || n < 0) return fallback;
  return n > 1 ? Math.min(1, n / 100) : n;
};

export const parseSettings = (p: Record<string, unknown>): Settings => {
  const albedo = Math.min(0.95, share(p.albedo, 0.3));
  const solar = num(p.solarConstant);
  const step = num(p.levelStep);
  const levelStep = step !== null && step > 0 && step <= 50 ? step : 1;
  const start = num(p.startLevel);
  const startLevel = clamp(start ?? 78, 0, 100);
  const decimals = num(p.decimals);
  const tolerance = num(p.tolerance);
  return {
    solarConstant: solar !== null && solar > 0 ? solar : 1361,
    albedo,
    atmosphereSolar: Math.min(1 - albedo, share(p.atmosphereSolar, 0)),
    startLevel: clamp(Math.round(startLevel / levelStep) * levelStep, 0, 100),
    levelStep,
    numbers: oneOf(p.numbers, ["wm2", "percent", "both", "none"] as const, "wm2"),
    showTable: isTrue(p.showTable, true),
    showTemperature: isTrue(p.showTemperature, true),
    showLevel: isTrue(p.showLevel, true),
    temperatureUnit: oneOf(p.temperatureUnit, ["C", "K", "both"] as const, "C"),
    decimals: clamp(Math.round(decimals ?? 1), 0, 3),
    question: oneOf(p.question, ["none", "target", "direction"] as const, "none"),
    targetTemperature: num(p.targetTemperature) ?? 20,
    tolerance: tolerance !== null && tolerance >= 0 ? tolerance : 0.5,
    direction: oneOf(p.direction, ["more", "less"] as const, "more"),
    predictFirst: isTrue(p.predictFirst, true),
    language: languageOf(p.language),
  };
};

/** The direction question's correct prediction: more greenhouse gas warms the surface, less cools it. */
export const correctPrediction = (s: Settings): Prediction => (s.direction === "more" ? "up" : "down");
