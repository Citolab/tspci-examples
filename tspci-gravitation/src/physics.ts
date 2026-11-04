// SPDX-License-Identifier: GPL-2.0-only
// Based on https://github.com/janfix/extension-wiquid-depp/tree/master/views/js/pciCreator/ims/NouvelleTerrepci,
// © DEPP (Ministère de l'Éducation nationale) / Jean-Philippe Rivière (Wiquid)
// Modified by Stichting Cito Instituut voor Toetsontwikkeling, 2026

// The model and its numbers: Newton's law of gravitation, and numbers (also in scientific notation) as the candidate
// reads them in English, Dutch and French. No imports: `npm test` runs it in node.

export type Language = "en" | "nl" | "fr";

/**
 * The gravitational constant, N·m²/kg², as school books give it (6,67·10⁻¹¹): the original's table was computed with
 * it (6.674·10⁻¹¹ would give 2.97·10²⁶ N instead of its 2.96·10²⁶ N at 150 million km).
 */
export const G = 6.67e-11;
/** The units of the sliders: the distance in millions of km, the mass of the planet in 10²³ kg. */
export const DISTANCE_UNIT_M = 1e9;
export const MASS_UNIT_KG = 1e23;
/**
 * F = G·M·m / d², in N, with the star's mass M in kg, the planet's mass in 10²³ kg and the distance in millions of km.
 * The radius of the planet is not in it: in the item it is a distractor.
 */
export const forceOf = (starMass: number, mass: number, distance: number): number => {
  const d = distance * DISTANCE_UNIT_M;
  return (G * starMass * mass * MASS_UNIT_KG) / (d * d);
};

/** A positive number as mantissa · 10^exponent with `digits` significant digits; 9.996e26 with 3 → 1.00 · 10²⁷. */
export const scientific = (value: number, digits: number): { mantissa: number; exponent: number } => {
  if (!isFinite(value) || value === 0) return { mantissa: 0, exponent: 0 };
  const d = Math.max(1, Math.min(6, Math.round(digits)));
  let exponent = Math.floor(Math.log10(Math.abs(value)));
  let mantissa = Number((value / Math.pow(10, exponent)).toFixed(d - 1));
  if (Math.abs(mantissa) >= 10) {
    exponent += 1;
    mantissa = Number((value / Math.pow(10, exponent)).toFixed(d - 1));
  }
  return { mantissa, exponent };
};

/** The force rounded as the candidate reads it (for the response): 6.674e26 with 3 digits → 6.67e26. */
export const roundScientific = (value: number, digits: number): number => {
  const { mantissa, exponent } = scientific(value, digits);
  return Number(`${mantissa}e${exponent}`);
};

const locales: Record<Language, string> = { en: "en-GB", nl: "nl-NL", fr: "fr-FR" };

/**
 * A number with exactly `decimals` decimals, a decimal comma in Dutch and French, and the thousands separators of the
 * language (10,000 / 10.000 / 10 000); a real minus sign.
 */
export const formatNumber = (value: number, language: Language, decimals = 0): string => {
  if (!isFinite(value)) return "–";
  const d = Math.max(0, Math.min(10, decimals));
  return new Intl.NumberFormat(locales[language], { minimumFractionDigits: d, maximumFractionDigits: d })
    .format(value)
    .replace("-", "−");
};

const SUPERSCRIPT: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
export const superscript = (n: number) => String(n).split("").map((c) => SUPERSCRIPT[c] ?? c).join("");

/** The parts of a number in scientific notation, formatted: { mantissa: "6,67", exponent: "26" }. */
export const scientificParts = (value: number, language: Language, digits: number) => {
  const { mantissa, exponent } = scientific(value, digits);
  return { mantissa: formatNumber(mantissa, language, Math.max(0, Math.round(digits) - 1)), exponent: String(exponent).replace("-", "−") };
};

/** In one line of plain text: "6.67 × 10²⁶" (en), "6,67 × 10²⁶" (nl, fr). */
export const formatScientific = (value: number, language: Language, digits: number): string => {
  const { mantissa, exponent } = scientific(value, digits);
  return `${formatNumber(mantissa, language, Math.max(0, Math.round(digits) - 1))} × 10${superscript(exponent)}`;
};
